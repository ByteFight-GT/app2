//! Runs a match: spawns `python <engine>/local_server.py`, streams its
//! stdout/stderr to the renderer, connects to its NDJSON TCP stream, and
//! reports the result when the process exits.
//!
//! Events (broadcast to the window):
//! - `game-usr:stdout`         string chunk of bot/engine stdout+stderr
//! - `game-sys:data`           parsed NDJSON message from the engine socket
//! - `game-sys:socket-error`   `{ error }` after a successful connection
//! - `game-sys:process-error`  `{ error }` if the process couldn't be waited on
//! - `game-sys:process-closed` `ProcessClosedEvent` (see common/electron-api.ts)

use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;

use serde_json::{Value, json};
use tauri::async_runtime::{self, JoinHandle};
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::io::{AsyncRead, AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;
use tokio::net::tcp::OwnedWriteHalf;
use tokio::process::Command;
use tokio::sync::Mutex as AsyncMutex;

use crate::engine::LOCAL_SERVER_SCRIPT;
use crate::paths::display;
use crate::state::AppState;
use crate::util::{CmdResult, LineSplitter, Utf8ChunkDecoder, now_ms, reply, require_safe_segment};

const TCP_CONNECT_DELAY: Duration = Duration::from_millis(500);
const TCP_TIMEOUT: Duration = Duration::from_millis(2000);
const TCP_MAX_RETRIES: u32 = 20;
/// After a SIGTERM fallback, how long to wait before SIGKILL.
const FORCE_KILL_AFTER: Duration = Duration::from_secs(3);
/// After the process exits, how long to let the socket drain before reporting.
const SOCKET_DRAIN_TIMEOUT: Duration = Duration::from_secs(1);

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

static NEXT_RUN_ID: AtomicU64 = AtomicU64::new(1);

type SharedWriter = Arc<AsyncMutex<OwnedWriteHalf>>;

pub struct ActiveRun {
    run_id: u64,
    match_data: Value,
    pid: Option<u32>,
    requested_termination: bool,
    tcp_writer: Option<SharedWriter>,
    tcp_task: Option<JoinHandle<()>>,
}

// >>> helpers on the shared runner slot

fn with_run<R>(app: &AppHandle, run_id: u64, f: impl FnOnce(&mut ActiveRun) -> R) -> Option<R> {
    let state = app.state::<AppState>();
    let mut slot = state.runner.lock().unwrap();
    slot.as_mut().filter(|r| r.run_id == run_id).map(f)
}

fn take_run(app: &AppHandle, run_id: u64) -> Option<ActiveRun> {
    let state = app.state::<AppState>();
    let mut slot = state.runner.lock().unwrap();
    if slot.as_ref().is_some_and(|r| r.run_id == run_id) {
        slot.take()
    } else {
        None
    }
}

fn is_active(app: &AppHandle, run_id: u64) -> bool {
    with_run(app, run_id, |_| ()).is_some()
}

// >>> process-tree killing

/// Kills the engine and its bot subprocesses. On Unix the engine is spawned
/// as its own process group leader, so this signals the whole group.
pub fn kill_tree(pid: u32, force: bool) {
    #[cfg(unix)]
    unsafe {
        let sig = if force { libc::SIGKILL } else { libc::SIGTERM };
        libc::killpg(pid as libc::pid_t, sig);
    }
    #[cfg(windows)]
    {
        let _ = force;
        use std::os::windows::process::CommandExt;
        let _ = std::process::Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .creation_flags(CREATE_NO_WINDOW)
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
    }
}

/// Called on app exit: hard-kill any running match.
pub fn kill_on_exit(app: &AppHandle) {
    let state = app.state::<AppState>();
    let pid = state
        .runner
        .lock()
        .ok()
        .and_then(|slot| slot.as_ref().and_then(|r| r.pid));
    if let Some(pid) = pid {
        println!("[runner] app exiting, killing engine process tree {pid}");
        kill_tree(pid, true);
    }
}

// >>> result file

/// Reads `{ result, reason, turn_count }` from the engine's output PGN.
fn read_result(path: &Path) -> Value {
    let parsed = std::fs::read_to_string(path)
        .map_err(|e| e.to_string())
        .and_then(|d| serde_json::from_str::<Value>(&d).map_err(|e| e.to_string()));
    let pgn = match parsed {
        Ok(v) => v,
        Err(e) => {
            eprintln!("[runner] couldn't read result from {}: {e}", display(path));
            return Value::Null;
        }
    };
    let truthy = |v: Option<&Value>| match v {
        None | Some(Value::Null) | Some(Value::Bool(false)) => false,
        Some(Value::String(s)) => !s.is_empty(),
        Some(_) => true,
    };
    let (result, reason, turns) = (pgn.get("result"), pgn.get("reason"), pgn.get("turn_count"));
    if !truthy(result) || !truthy(reason) || !turns.is_some_and(Value::is_number) {
        eprintln!(
            "[runner] {} is missing result/reason/turn_count",
            display(path)
        );
        return Value::Null;
    }
    json!({ "winner": result, "reason": reason, "plyCount": turns })
}

// >>> stream pumps

async fn pump_output<R: AsyncRead + Unpin>(app: AppHandle, mut reader: R) {
    let mut buf = [0u8; 8192];
    let mut decoder = Utf8ChunkDecoder::default();
    loop {
        match reader.read(&mut buf).await {
            Ok(0) | Err(_) => break,
            Ok(n) => {
                let chunk = decoder.push(&buf[..n]);
                if !chunk.is_empty() {
                    let _ = app.emit("game-usr:stdout", chunk);
                }
            }
        }
    }
    let rest = decoder.finish();
    if !rest.is_empty() {
        let _ = app.emit("game-usr:stdout", rest);
    }
}

async fn connect_with_retry(app: &AppHandle, run_id: u64, port: u16) -> Result<TcpStream, String> {
    let mut delay_ms = 100f64;
    let mut last_err = String::new();
    for attempt in 0..TCP_MAX_RETRIES {
        if !is_active(app, run_id) {
            return Err("match ended before the engine socket connected".into());
        }
        match tokio::time::timeout(TCP_TIMEOUT, TcpStream::connect(("127.0.0.1", port))).await {
            Ok(Ok(stream)) => return Ok(stream),
            Ok(Err(e)) => last_err = e.to_string(),
            Err(_) => last_err = "connection timeout".into(),
        }
        if attempt + 1 < TCP_MAX_RETRIES {
            let wait = delay_ms.min(TCP_TIMEOUT.as_millis() as f64) as u64;
            delay_ms *= 1.5;
            tokio::time::sleep(Duration::from_millis(wait)).await;
        }
    }
    Err(format!(
        "Failed to connect after {TCP_MAX_RETRIES} attempts: {last_err}"
    ))
}

async fn run_socket(app: AppHandle, run_id: u64, port: u16) {
    tokio::time::sleep(TCP_CONNECT_DELAY).await;
    let stream = match connect_with_retry(&app, run_id, port).await {
        Ok(s) => s,
        Err(e) => {
            eprintln!("[runner] TCP: {e}");
            return;
        }
    };
    println!("[runner] TCP connected on port {port}");
    let (mut reader, writer) = stream.into_split();
    let writer = Arc::new(AsyncMutex::new(writer));
    if with_run(&app, run_id, |r| r.tcp_writer = Some(writer.clone())).is_none() {
        return; // match already gone
    }

    let mut buf = [0u8; 16384];
    let mut lines = LineSplitter::default();
    loop {
        match reader.read(&mut buf).await {
            Ok(0) => break,
            Ok(n) => {
                for line in lines.push(&buf[..n]) {
                    let msg = serde_json::from_str::<Value>(&line)
                        .unwrap_or_else(|_| json!({ "type": "unparsed", "raw": line }));
                    let _ = app.emit("game-sys:data", msg);
                }
            }
            Err(e) => {
                let _ = app.emit("game-sys:socket-error", json!({ "error": e.to_string() }));
                break;
            }
        }
    }
    println!("[runner] TCP connection closed");
}

// >>> commands

fn required_str<'a>(v: &'a Value, key: &str) -> Result<&'a str, String> {
    v.get(key)
        .and_then(Value::as_str)
        .ok_or_else(|| format!("Match data is missing \"{key}\""))
}

fn free_port() -> Result<u16, String> {
    let listener = std::net::TcpListener::bind(("127.0.0.1", 0)).map_err(|e| e.to_string())?;
    listener
        .local_addr()
        .map(|a| a.port())
        .map_err(|e| e.to_string())
}

struct Prepared {
    python: String,
    script: PathBuf,
    engine_dir: PathBuf,
    team_a_dir: PathBuf,
    team_b_dir: PathBuf,
    output_dir: PathBuf,
    output_file: PathBuf,
    port: u16,
}

fn prepare(state: &AppState, match_data: &Value) -> Result<Prepared, String> {
    let python = match state.setting_or_default("Python Path") {
        Some(Value::String(s)) if !s.trim().is_empty() => s,
        _ => return Err("Python path not configured in settings. Try resetting \"Python Path\" to default config or point it to a valid python executable.".into()),
    };

    let bots_dir = state
        .configured_dir("Bots Directory")
        .map_err(|e| format!("Failed to resolve bots directory: {e}"))?;
    let team_a = require_safe_segment(required_str(match_data, "teamA")?, "bot name")?;
    let team_b = require_safe_segment(required_str(match_data, "teamB")?, "bot name")?;
    let team_a_dir = bots_dir.join(team_a);
    let team_b_dir = bots_dir.join(team_b);
    if !team_a_dir.is_dir() {
        return Err(format!(
            "Black team bot directory not found or invalid: {}",
            display(&team_a_dir)
        ));
    }
    if !team_b_dir.is_dir() {
        return Err(format!(
            "White team bot directory not found or invalid: {}",
            display(&team_b_dir)
        ));
    }

    let match_id = require_safe_segment(required_str(match_data, "matchId")?, "match ID")?;
    let game_ident = match_data
        .get("gameIdents")
        .and_then(|g| g.get(0))
        .and_then(Value::as_str)
        .unwrap_or(&state.config.maps.singleton_name);
    let game_ident = require_safe_segment(game_ident, "game identifier")?;

    let output_dir = state
        .configured_dir("Games Directory")
        .map_err(|e| format!("Failed to resolve games directory: {e}"))?
        .join(match_id);
    std::fs::create_dir_all(&output_dir)
        .map_err(|e| format!("Failed to create output directory: {e}"))?;
    let output_file = output_dir.join(format!("{game_ident}.json"));

    let port = free_port()
        .map_err(|e| format!("Failed to find free port for streaming game data: {e}"))?;

    let engine_dir = state.paths.engine();
    if !engine_dir.is_dir() {
        return Err(format!(
            "Game engine directory not found at: {}. Try restarting the client.",
            display(&engine_dir)
        ));
    }
    let script = engine_dir.join(LOCAL_SERVER_SCRIPT);
    if !script.is_file() {
        return Err(format!(
            "Engine server script not found at: {}. Try restarting the client.",
            display(&script)
        ));
    }

    Ok(Prepared {
        python,
        script,
        engine_dir,
        team_a_dir,
        team_b_dir,
        output_dir,
        output_file,
        port,
    })
}

#[tauri::command]
pub async fn runner_start_match(
    app: AppHandle,
    state: State<'_, AppState>,
    match_data: Value,
) -> CmdResult {
    // reserve the runner slot first so concurrent starts can't race
    let run_id = NEXT_RUN_ID.fetch_add(1, Ordering::Relaxed);
    {
        let mut slot = state.runner.lock().unwrap();
        if slot.is_some() {
            return reply(Err("A match is already running. Please allow it to finish or terminate it before starting a new one.".into()));
        }
        *slot = Some(ActiveRun {
            run_id,
            match_data: match_data.clone(),
            pid: None,
            requested_termination: false,
            tcp_writer: None,
            tcp_task: None,
        });
    }

    let p = match prepare(&state, &match_data) {
        Ok(p) => p,
        Err(e) => {
            take_run(&app, run_id);
            return reply(Err(e));
        }
    };

    // teamA plays black and moves first, which is --a_dir in local_server.py
    let mut cmd = Command::new(&p.python);
    cmd.arg(&p.script)
        .arg("--output_port")
        .arg(p.port.to_string())
        .arg("--a_dir")
        .arg(&p.team_a_dir)
        .arg("--b_dir")
        .arg(&p.team_b_dir)
        .arg("--output_dir")
        .arg(&p.output_file)
        .current_dir(&p.engine_dir)
        .env("PYTHONUNBUFFERED", "1")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(unix)]
    cmd.process_group(0);
    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);

    let mut child = match cmd.spawn() {
        Ok(c) => c,
        Err(e) => {
            take_run(&app, run_id);
            return reply(Err(format!(
                "Failed to start Python engine ({}): {e}",
                p.python
            )));
        }
    };
    let start_timestamp = now_ms();
    let pid = child.id();
    println!("[runner] spawned engine pid {pid:?} on port {}", p.port);

    let stdout_task = child
        .stdout
        .take()
        .map(|s| async_runtime::spawn(pump_output(app.clone(), s)));
    let stderr_task = child
        .stderr
        .take()
        .map(|s| async_runtime::spawn(pump_output(app.clone(), s)));
    let tcp_task = async_runtime::spawn(run_socket(app.clone(), run_id, p.port));
    with_run(&app, run_id, |r| {
        r.pid = pid;
        r.tcp_task = Some(tcp_task);
    });

    // wait for exit, then report
    let app_bg = app.clone();
    async_runtime::spawn(async move {
        let wait_res = child.wait().await;
        for t in [stdout_task, stderr_task].into_iter().flatten() {
            let _ = t.await; // stdio closed => all output emitted
        }
        #[cfg(unix)]
        if let Some(pid) = pid {
            kill_tree(pid, true); // reap bot processes the engine left behind
        }

        let exit_code = match &wait_res {
            Ok(status) => status.code(),
            Err(e) => {
                let _ = app_bg.emit("game-sys:process-error", json!({ "error": e.to_string() }));
                None
            }
        };
        println!("[runner] engine exited with code {exit_code:?}");

        let run = take_run(&app_bg, run_id);
        let requested_termination = run.as_ref().is_some_and(|r| r.requested_termination);
        if let Some(mut run) = run
            && let Some(task) = run.tcp_task.take()
        {
            if run.tcp_writer.is_some() {
                // connected: let the socket drain to EOF so final messages arrive first
                let abort = task.inner().abort_handle();
                if tokio::time::timeout(SOCKET_DRAIN_TIMEOUT, task)
                    .await
                    .is_err()
                {
                    abort.abort();
                }
            } else {
                task.abort();
            }
        }

        let _ = app_bg.emit(
            "game-sys:process-closed",
            json!({
                "exitCode": exit_code,
                "TEMP_requestedTermination": requested_termination,
                "finishTimestamp": now_ms(),
                "result": read_result(&p.output_file),
                "outputDir": display(&p.output_dir),
            }),
        );
    });

    reply(Ok(json!({ "startTimestamp": start_timestamp })))
}

#[tauri::command]
pub async fn runner_getcurrent(state: State<'_, AppState>) -> Result<Value, String> {
    Ok(match state.runner.lock().unwrap().as_ref() {
        Some(run) => json!({ "matchData": run.match_data }),
        None => Value::Null,
    })
}

/// Asks the engine to stop via `{"type":"terminate"}`. If the socket isn't
/// connected (or the write fails), falls back to killing the process tree.
#[tauri::command]
pub async fn runner_terminate(app: AppHandle, state: State<'_, AppState>) -> Result<Value, String> {
    let info = {
        let mut slot = state.runner.lock().unwrap();
        slot.as_mut().map(|r| {
            r.requested_termination = true;
            (r.run_id, r.pid, r.tcp_writer.clone())
        })
    };
    let Some((run_id, pid, writer)) = info else {
        return Ok(json!({ "success": false }));
    };

    if let Some(writer) = writer {
        let mut w = writer.lock().await;
        if w.write_all(b"{\"type\":\"terminate\"}\n").await.is_ok() && w.flush().await.is_ok() {
            println!("[runner] sent terminate message");
            return Ok(json!({ "success": true }));
        }
    }

    let Some(pid) = pid else {
        return Ok(json!({ "success": false }));
    };
    println!("[runner] socket unavailable, killing engine process tree {pid}");
    kill_tree(pid, false);
    async_runtime::spawn(async move {
        tokio::time::sleep(FORCE_KILL_AFTER).await;
        if is_active(&app, run_id) {
            kill_tree(pid, true);
        }
    });
    Ok(json!({ "success": true }))
}

/// Drops the engine socket without stopping the process.
#[tauri::command]
pub async fn runner_disconnect(state: State<'_, AppState>) -> Result<bool, String> {
    let mut slot = state.runner.lock().unwrap();
    if let Some(run) = slot.as_mut() {
        run.tcp_writer = None;
        if let Some(task) = run.tcp_task.take() {
            task.abort();
        }
    }
    Ok(false)
}

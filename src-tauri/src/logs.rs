//! Per-game stdout logs: `<Logs Directory>/<matchId>/<gameIdent>.txt`.

use std::fs;
use std::io::ErrorKind;
use std::path::PathBuf;

use serde_json::{Value, json};
use tauri::{AppHandle, State};
use tauri_plugin_opener::OpenerExt;

use crate::paths::display;
use crate::state::AppState;
use crate::util::{CmdResult, is_safe_segment, reply};

const INVALID_LOG_PATH_ERROR: &str = "Invalid match ID or game identifier.";

fn match_logs_dir(state: &AppState, match_id: &str) -> Result<PathBuf, String> {
    if !is_safe_segment(match_id) {
        return Err(INVALID_LOG_PATH_ERROR.into());
    }
    Ok(state.configured_dir("Logs Directory")?.join(match_id))
}

fn log_path(state: &AppState, match_id: &str, game_ident: &str) -> Result<PathBuf, String> {
    if !is_safe_segment(game_ident) {
        return Err(INVALID_LOG_PATH_ERROR.into());
    }
    Ok(match_logs_dir(state, match_id)?.join(format!("{game_ident}.txt")))
}

/// Startup: create the logs dir.
pub fn init(state: &AppState) -> Result<(), String> {
    let dir = state.configured_dir("Logs Directory")?;
    fs::create_dir_all(&dir).map_err(|e| format!("{}: {e}", display(&dir)))
}

#[tauri::command]
pub async fn logs_write(
    state: State<'_, AppState>,
    match_id: String,
    game_ident: String,
    log_data: String,
) -> CmdResult {
    let res = async {
        let path = log_path(&state, &match_id, &game_ident)?;
        if let Some(parent) = path.parent() {
            tokio::fs::create_dir_all(parent)
                .await
                .map_err(|e| e.to_string())?;
        }
        tokio::fs::write(&path, log_data)
            .await
            .map_err(|e| e.to_string())?;
        Ok(Value::Null)
    };
    reply(res.await)
}

#[tauri::command]
pub async fn logs_read(
    state: State<'_, AppState>,
    match_id: String,
    game_ident: String,
) -> CmdResult {
    let res = async {
        let path = log_path(&state, &match_id, &game_ident)?;
        match tokio::fs::read_to_string(&path).await {
            Ok(data) => Ok(json!({ "logData": data })),
            // games that produced no stdout have no log file
            Err(e) if e.kind() == ErrorKind::NotFound => Ok(json!({ "logData": null })),
            Err(e) => Err(e.to_string()),
        }
    };
    reply(res.await)
}

#[tauri::command]
pub async fn logs_open(
    app: AppHandle,
    state: State<'_, AppState>,
    match_id: String,
    game_ident: String,
) -> CmdResult {
    reply((|| {
        let path = log_path(&state, &match_id, &game_ident)?;
        if !path.exists() {
            return Err(format!("Log file does not exist: {}", display(&path)));
        }
        app.opener()
            .open_path(display(&path), None::<&str>)
            .map_err(|e| format!("Failed to open {}: {e}", display(&path)))?;
        Ok(Value::Null)
    })())
}

#[tauri::command]
pub async fn logs_delete(
    state: State<'_, AppState>,
    match_id: String,
    game_ident: String,
) -> CmdResult {
    let res = async {
        let path = log_path(&state, &match_id, &game_ident)?;
        tokio::fs::remove_file(&path)
            .await
            .map_err(|e| e.to_string())?;
        Ok(Value::Null)
    };
    reply(res.await)
}

/// Deletes the given games' logs for a match, or the whole match log dir if
/// `game_idents` is empty/omitted.
#[tauri::command]
pub async fn logs_deletematch(
    state: State<'_, AppState>,
    match_id: String,
    game_idents: Option<Vec<String>>,
) -> CmdResult {
    let res = async {
        let dir = match_logs_dir(&state, &match_id)?;
        if !dir.exists() {
            return Ok(json!({ "deleted": 0 }));
        }
        let mut deleted = 0usize;
        match game_idents.filter(|g| !g.is_empty()) {
            Some(idents) => {
                for ident in idents {
                    let path = log_path(&state, &match_id, &ident)?;
                    match tokio::fs::remove_file(&path).await {
                        Ok(()) => deleted += 1,
                        Err(e) => eprintln!(
                            "[logs:deletematch] failed to delete {ident} for {match_id}: {e}"
                        ),
                    }
                }
            }
            None => {
                deleted = fs::read_dir(&dir)
                    .map_err(|e| e.to_string())?
                    .filter_map(Result::ok)
                    .filter(|e| e.path().extension().is_some_and(|x| x == "txt"))
                    .count();
                tokio::fs::remove_dir_all(&dir)
                    .await
                    .map_err(|e| e.to_string())?;
            }
        }
        Ok(json!({ "deleted": deleted }))
    };
    reply(res.await)
}

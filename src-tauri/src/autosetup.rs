use std::path::PathBuf;
use std::process::Stdio;

use serde_json::{Value, json};
use tauri::State;
use tokio::process::Command;

use crate::paths::display;
use crate::state::AppState;
use crate::util::{CmdResult, reply};

pub const REQUIREMENTS_FILE: &str = "requirements.txt";

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// `<data>/engine/requirements.txt`
fn requirements_path(state: &AppState) -> PathBuf {
    state.paths.engine().join(REQUIREMENTS_FILE)
}

fn python_executable(state: &AppState) -> Result<String, String> {
    match state.setting_or_default("Python Path") {
        Some(Value::String(s)) if !s.trim().is_empty() => Ok(s),
        _ => Err("Python path not configured in settings. Update your \"Python Path\" setting to point to a python executable.".into()),
    }
}

/// Requirement specifiers from the engine's `requirements.txt`, with blank
/// lines and `#` comments dropped.
pub fn read_requirements(state: &AppState) -> Result<Vec<String>, String> {
    let path = requirements_path(state);
    let text = std::fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read {}: {e}", display(&path)))?;
    Ok(parse_requirements(&text))
}

fn parse_requirements(text: &str) -> Vec<String> {
    text.lines()
        .map(|l| l.trim())
        .filter(|l| !l.is_empty() && !l.starts_with('#'))
        .map(str::to_owned)
        .collect()
}

/// Output of a finished `pip install`.
pub struct InstallOutput {
    pub stdout: String,
    pub stderr: String,
}

/// Runs `<python> -m pip install -r <engine>/requirements.txt`. `Err` carries
/// a user-presentable message (spawn failure, or pip's output on a non-zero exit).
pub async fn install_requirements(state: &AppState) -> Result<InstallOutput, String> {
    let python = python_executable(state)?;
    let req_path = requirements_path(state);
    if !req_path.is_file() {
        return Err(format!("Requirements file not found: {}", display(&req_path)));
    }

    let mut cmd = Command::new(&python);
    cmd.args(["-m", "pip", "install", "--disable-pip-version-check", "-r"])
        .arg(&req_path)
        .current_dir(state.paths.engine())
        .env("PYTHONUNBUFFERED", "1")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);

    let output = cmd
        .output()
        .await
        .map_err(|e| format!("Failed to run Python ({python}): {e}"))?;
    let stdout = String::from_utf8_lossy(&output.stdout).into_owned();
    let stderr = String::from_utf8_lossy(&output.stderr).into_owned();

    if output.status.success() {
        Ok(InstallOutput { stdout, stderr })
    } else {
        Err(format!(
            "pip install failed ({}):\n{}",
            output.status,
            if stderr.trim().is_empty() { &stdout } else { &stderr }
        ))
    }
}

#[tauri::command]
pub async fn autosetup_get_requirements(state: State<'_, AppState>) -> CmdResult {
    reply(read_requirements(&state).map(|requirements| json!({ "requirements": requirements })))
}

#[tauri::command]
pub async fn autosetup_install_requirements(state: State<'_, AppState>) -> CmdResult {
    reply(
        install_requirements(&state)
            .await
            .map(|out| json!({ "stdout": out.stdout, "stderr": out.stderr })),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_requirements() {
        let text = "# deps\nnumpy>=1.26\n\n  pygame==2.5.2  \n# trailing\n";
        assert_eq!(parse_requirements(text), vec!["numpy>=1.26", "pygame==2.5.2"]);
    }
}

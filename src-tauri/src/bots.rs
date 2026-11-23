//! Bots live in "Bots Directory" and come in two kinds:
//! - folder bots: a folder whose top-level `.py` files include one mentioning `PlayerController`
//! - single-file bots: a top-level `.py` file mentioning `PlayerController` (the name keeps `.py`)
//!
//! Keep this check in sync with `controller_files` in engine/player_process.py.

use std::fs;
use std::io;
use std::path::Path;

use serde_json::json;
use tauri::{AppHandle, State};

use crate::dialogs;
use crate::paths::display;
use crate::state::AppState;
use crate::util::{CmdResult, copy_dir_recursive, reply, reply_with_fallback};

/// Copies the bundled example bot into the configured bots dir (creating the
/// dir if needed). Never overwrites: returns `Ok(false)` if it's already there,
/// `Ok(true)` if it was copied.
fn copy_example_bot(state: &AppState) -> Result<bool, String> {
    let bots_dir = state.configured_dir("Bots Directory")?;
    fs::create_dir_all(&bots_dir).map_err(|e| format!("{}: {e}", display(&bots_dir)))?;

    let example = state.paths.example_bot();
    let name = example
        .file_name()
        .ok_or_else(|| "Example bot path is invalid".to_string())?;
    if !example.is_dir() {
        return Err(format!("Bundled example bot not found at {}", display(&example)));
    }
    let dst = bots_dir.join(name);
    if dst.exists() {
        return Ok(false);
    }
    copy_dir_recursive(&example, &dst)
        .map_err(|e| format!("Failed to copy example bot to {}: {e}", display(&dst)))?;
    Ok(true)
}

/// Startup: create the bots dir and seed the example bot if it's missing.
pub fn init(state: &AppState) -> Result<(), String> {
    copy_example_bot(state).map(|_| ())
}

#[tauri::command]
pub async fn bots_copy_example(state: State<'_, AppState>) -> CmdResult {
    reply(copy_example_bot(&state).map(|copied| json!({ "alreadyExisted": !copied })))
}

const CONTROLLER_MARKER: &[u8] = b"PlayerController";

/// A `.py` file whose text mentions `PlayerController` (same text check as the engine).
fn is_controller_file(path: &Path) -> bool {
    path.is_file()
        && path.extension().is_some_and(|e| e == "py")
        && fs::read(path).is_ok_and(|bytes| {
            bytes.windows(CONTROLLER_MARKER.len()).any(|w| w == CONTROLLER_MARKER)
        })
}

/// Whether `bot_path` is a runnable bot: a `.py` controller file, or a folder
/// with at least one top-level controller file.
pub fn validate_bot(bot_path: &Path) -> bool {
    if bot_path.is_dir() {
        fs::read_dir(bot_path).is_ok_and(|entries| {
            entries.filter_map(Result::ok).any(|e| is_controller_file(&e.path()))
        })
    } else {
        is_controller_file(bot_path)
    }
}

#[tauri::command]
pub async fn bots_list(state: State<'_, AppState>) -> CmdResult {
    reply_with_fallback(
        (|| {
            let bots_dir = state.configured_dir("Bots Directory")?;
            let mut bots: Vec<String> = fs::read_dir(&bots_dir)
                .map_err(|e| match e.kind() {
                    io::ErrorKind::NotFound => {
                        format!("The directory {} doesn't exist", display(&bots_dir))
                    }
                    _ => format!("{}: {e}", display(&bots_dir)),
                })?
                .filter_map(Result::ok)
                .filter(|e| validate_bot(&e.path()))
                .filter_map(|e| e.file_name().into_string().ok())
                .collect();
            bots.sort();
            Ok(json!({ "bots": bots }))
        })(),
        json!({ "bots": [] }),
    )
}

/// Copies picked bots (folders or `.py` files) into the bots dir, skipping invalid ones.
fn import_bots(bots_dir: &Path, picked: Vec<std::path::PathBuf>) -> Result<serde_json::Value, String> {
    let mut imported = Vec::new();
    let mut invalid = Vec::new();
    for src in picked {
        let Some(name) = src.file_name().and_then(|n| n.to_str()).map(str::to_owned) else {
            continue;
        };
        if !validate_bot(&src) {
            invalid.push(name);
            continue;
        }
        let dst = bots_dir.join(&name);
        let same = matches!(
            (src.canonicalize(), dst.canonicalize()),
            (Ok(a), Ok(b)) if a == b
        );
        if !same {
            let copied = if src.is_dir() {
                copy_dir_recursive(&src, &dst)
            } else {
                fs::copy(&src, &dst).map(|_| ())
            };
            copied.map_err(|e| format!("Failed to import {name}: {e}"))?;
        }
        imported.push(name);
    }
    Ok(json!({ "imported": imported, "invalid": invalid }))
}

#[tauri::command]
pub async fn bots_import(app: AppHandle, state: State<'_, AppState>) -> CmdResult {
    let fallback = json!({ "imported": [], "invalid": [] });
    let bots_dir = match state.configured_dir("Bots Directory") {
        Ok(d) => d,
        Err(e) => return reply_with_fallback(Err(e), fallback),
    };

    let picked = dialogs::pick_folders(&app, "Import Bot Folders").await;
    if picked.is_empty() {
        return reply_with_fallback(Err("Import canceled by user".into()), fallback);
    }
    reply_with_fallback(import_bots(&bots_dir, picked), fallback)
}

#[tauri::command]
pub async fn bots_import_files(app: AppHandle, state: State<'_, AppState>) -> CmdResult {
    let fallback = json!({ "imported": [], "invalid": [] });
    let bots_dir = match state.configured_dir("Bots Directory") {
        Ok(d) => d,
        Err(e) => return reply_with_fallback(Err(e), fallback),
    };

    let picked = dialogs::pick_files(&app, "Import Bot Files", "Python", &["py"]).await;
    if picked.is_empty() {
        return reply_with_fallback(Err("Import canceled by user".into()), fallback);
    }
    reply_with_fallback(import_bots(&bots_dir, picked), fallback)
}

#[cfg(test)]
mod tests {
    use super::validate_bot;
    use std::fs;

    #[test]
    fn validates_folder_and_file_bots() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        let controller = "from bytefight_core import PlayerController\n";

        // folder bot: any top-level .py mentioning the marker counts, no __init__ needed
        fs::create_dir(root.join("folder")).unwrap();
        fs::write(root.join("folder/bot.py"), controller).unwrap();
        assert!(validate_bot(&root.join("folder")));

        // marker only in a nested file doesn't count
        fs::create_dir_all(root.join("nested/sub")).unwrap();
        fs::write(root.join("nested/sub/bot.py"), controller).unwrap();
        assert!(!validate_bot(&root.join("nested")));

        // single-file bots
        fs::write(root.join("single.py"), controller).unwrap();
        assert!(validate_bot(&root.join("single.py")));
        fs::write(root.join("plain.py"), "print('hi')\n").unwrap();
        assert!(!validate_bot(&root.join("plain.py")));
        fs::write(root.join("notpy.txt"), controller).unwrap();
        assert!(!validate_bot(&root.join("notpy.txt")));

        assert!(!validate_bot(&root.join("missing.py")));
    }
}

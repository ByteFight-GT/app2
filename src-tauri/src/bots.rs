//! Bots: folders inside "Bots Directory" containing `__init__.py` and `controller.py`.

use std::fs;
use std::io;
use std::path::Path;

use serde_json::json;
use tauri::{AppHandle, State};

use crate::dialogs;
use crate::paths::display;
use crate::state::AppState;
use crate::util::{CmdResult, copy_dir_recursive, reply, reply_with_fallback};

/// Startup: create the bots dir and seed the example bot if it's missing.
pub fn init(state: &AppState) -> Result<(), String> {
    let bots_dir = state.configured_dir("Bots Directory")?;
    fs::create_dir_all(&bots_dir).map_err(|e| format!("{}: {e}", display(&bots_dir)))?;

    let example = state.paths.example_bot();
    if let Some(name) = example.file_name() {
        let dst = bots_dir.join(name);
        if !dst.exists() && example.is_dir() {
            copy_dir_recursive(&example, &dst)
                .map_err(|e| format!("Failed to seed example bot: {e}"))?;
        }
    }
    Ok(())
}

pub fn validate_bot(bot_path: &Path) -> bool {
    bot_path.join("__init__.py").exists() && bot_path.join("agent.py").exists()
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
                .filter(|e| e.path().is_dir() && validate_bot(&e.path()))
                .filter_map(|e| e.file_name().into_string().ok())
                .collect();
            bots.sort();
            Ok(json!({ "bots": bots }))
        })(),
        json!({ "bots": [] }),
    )
}

#[tauri::command]
pub async fn bots_import(app: AppHandle, state: State<'_, AppState>) -> CmdResult {
    let fallback = json!({ "imported": [], "invalid": [] });
    let bots_dir = match state.configured_dir("Bots Directory") {
        Ok(d) => d,
        Err(e) => return reply_with_fallback(Err(e), fallback),
    };

    let picked = dialogs::pick_folders(&app, "Import Bots").await;
    if picked.is_empty() {
        return reply_with_fallback(Err("Import canceled by user".into()), fallback);
    }

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
        if !same && let Err(e) = copy_dir_recursive(&src, &dst) {
            return reply_with_fallback(Err(format!("Failed to import {name}: {e}")), fallback);
        }
        imported.push(name);
    }
    reply(Ok(json!({ "imported": imported, "invalid": invalid })))
}

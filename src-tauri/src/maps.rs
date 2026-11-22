//! Maps: `<name>.json` files inside "Maps Directory".
//!
//! Commands are always registered; default-map seeding only happens when the
//! game config enables maps.

use std::fs;
use std::io::ErrorKind;
use std::path::PathBuf;

use serde_json::{Value, json};
use tauri::{AppHandle, State};

use crate::dialogs;
use crate::paths::display;
use crate::state::AppState;
use crate::util::{CmdResult, reply, reply_with_fallback, require_safe_segment};

fn map_path(state: &AppState, map_name: &str) -> Result<PathBuf, String> {
    let name = require_safe_segment(map_name, "map name")?;
    Ok(state
        .configured_dir("Maps Directory")?
        .join(format!("{name}.json")))
}

/// Startup: create the maps dir, and if the game uses maps, copy (overwriting)
/// the bundled default maps into it.
pub fn init(state: &AppState) -> Result<(), String> {
    let maps_dir = state.configured_dir("Maps Directory")?;
    fs::create_dir_all(&maps_dir).map_err(|e| format!("{}: {e}", display(&maps_dir)))?;
    if !state.config.maps.enabled {
        return Ok(());
    }

    let defaults = state.paths.default_maps();
    let Ok(entries) = fs::read_dir(&defaults) else {
        return Ok(()); // no bundled maps
    };
    for entry in entries.filter_map(Result::ok) {
        let path = entry.path();
        if path.extension().is_some_and(|e| e == "json") {
            fs::copy(&path, maps_dir.join(entry.file_name()))
                .map_err(|e| format!("Failed to copy default map {}: {e}", display(&path)))?;
        }
    }
    Ok(())
}

pub async fn read_map(state: &AppState, map_name: &str) -> Result<String, String> {
    let path = map_path(state, map_name)?;
    tokio::fs::read_to_string(&path)
        .await
        .map_err(|e| format!("Failed to read map {map_name}: {e}"))
}

#[tauri::command]
pub async fn maps_list(state: State<'_, AppState>) -> CmdResult {
    reply_with_fallback(
        (|| {
            let maps_dir = state.configured_dir("Maps Directory")?;
            let mut maps: Vec<String> = fs::read_dir(&maps_dir)
                .map_err(|e| format!("{}: {e}", display(&maps_dir)))?
                .filter_map(Result::ok)
                .map(|e| e.path())
                .filter(|p| p.is_file() && p.extension().is_some_and(|e| e == "json"))
                .filter_map(|p| p.file_stem().and_then(|s| s.to_str()).map(str::to_owned))
                .collect();
            maps.sort();
            Ok(json!({ "maps": maps }))
        })(),
        json!({ "maps": [] }),
    )
}

#[tauri::command]
pub async fn maps_read(state: State<'_, AppState>, map_name: String) -> CmdResult {
    reply(
        read_map(&state, &map_name)
            .await
            .map(|data| json!({ "mapData": data })),
    )
}

#[tauri::command]
pub async fn maps_write(
    state: State<'_, AppState>,
    map_name: String,
    map_data: String,
) -> CmdResult {
    let res = async {
        let path = map_path(&state, &map_name)?;
        tokio::fs::write(&path, map_data)
            .await
            .map_err(|e| format!("Failed to write map {map_name}: {e}"))?;
        Ok(Value::Null)
    };
    reply(res.await)
}

#[tauri::command]
pub async fn maps_delete(state: State<'_, AppState>, map_names: Vec<String>) -> CmdResult {
    let mut deleted = Vec::new();
    let mut errors = Vec::new();
    for name in &map_names {
        let res = match map_path(&state, name) {
            Ok(path) => match tokio::fs::remove_file(&path).await {
                Ok(()) => Ok(()),
                Err(e) if e.kind() == ErrorKind::NotFound => Ok(()), // already gone
                Err(e) => Err(e.to_string()),
            },
            Err(e) => Err(e),
        };
        match res {
            Ok(()) => deleted.push(name.clone()),
            Err(e) => errors.push(format!("{name}: {e}")),
        }
    }
    let mut out = json!({ "success": errors.is_empty(), "deleted": deleted });
    if !errors.is_empty() {
        out["error"] = json!(format!("Failed to delete: {}", errors.join("; ")));
    }
    Ok(out)
}

#[tauri::command]
pub async fn maps_import(app: AppHandle, state: State<'_, AppState>) -> CmdResult {
    let picked = dialogs::pick_files(&app, "Import Maps", "JSON Files", &["json"]).await;
    if picked.is_empty() {
        return reply_with_fallback(
            Err("Import canceled by user".into()),
            json!({ "imported": [] }),
        );
    }
    let res = (|| {
        let maps_dir = state.configured_dir("Maps Directory")?;
        let mut imported = Vec::new();
        for src in picked {
            let (Some(file_name), Some(stem)) = (
                src.file_name().map(|f| f.to_owned()),
                src.file_stem().and_then(|s| s.to_str()).map(str::to_owned),
            ) else {
                continue;
            };
            let dst = maps_dir.join(&file_name);
            if !dst.exists() {
                fs::copy(&src, &dst).map_err(|e| format!("Failed to import {stem}: {e}"))?;
                imported.push(stem);
            }
        }
        Ok(json!({ "imported": imported }))
    })();
    reply_with_fallback(res, json!({ "imported": [] }))
}

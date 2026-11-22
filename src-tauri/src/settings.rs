//! `settings.json` handling. The user file is `<data>/settings.json`; on every
//! refresh it is re-merged with the bundled `default-settings.json` so new
//! keys and updated UI metadata (`__desc`, `__placeholder`, ...) show up while
//! user `value`s are kept.

use std::fs;
use std::path::PathBuf;

use serde_json::{Value, json};
use tauri::{AppHandle, State};
use tauri_plugin_opener::OpenerExt;

use crate::dialogs;
use crate::paths::display;
use crate::state::{AppState, Settings};
use crate::util::{CmdResult, reply};

fn read_settings_file(path: &PathBuf) -> Result<Settings, String> {
    let data = fs::read_to_string(path).map_err(|e| format!("{}: {e}", display(path)))?;
    serde_json::from_str(&data)
        .map_err(|e| format!("{} is not a valid settings object: {e}", display(path)))
}

/// Merges user values over defaults. Keys and metadata come from defaults;
/// only `value` is taken from the user's entry. User-only keys are kept.
pub fn merge_settings(defaults: &Settings, user: &Settings) -> Settings {
    let mut merged = defaults.clone();
    for (key, user_entry) in user {
        let mut entry = match merged.get(key) {
            Some(Value::Object(obj)) => obj.clone(),
            _ => serde_json::Map::new(),
        };
        match user_entry.get("value") {
            Some(v) => {
                entry.insert("value".into(), v.clone());
            }
            None => {
                entry.remove("value");
            }
        }
        merged.insert(key.clone(), Value::Object(entry));
    }
    merged
}

impl AppState {
    /// Re-reads defaults + user settings, merges, writes back, updates cache.
    pub fn refresh_settings(&self) -> Result<Settings, String> {
        let defaults = read_settings_file(&self.paths.default_settings())
            .map_err(|e| format!("Failed to read default settings: {e}"))?;

        let user_path = self.paths.user_settings();
        let user = if user_path.exists() {
            match read_settings_file(&user_path) {
                Ok(user) => user,
                Err(e) => {
                    // Don't silently clobber a hand-edited file: keep a backup, then reset.
                    let backup = user_path.with_extension("json.bak");
                    eprintln!(
                        "[settings] {e}; backing up to {} and resetting",
                        display(&backup)
                    );
                    let _ = fs::rename(&user_path, &backup);
                    Settings::new()
                }
            }
        } else {
            Settings::new() // first launch
        };

        let merged = merge_settings(&defaults, &user);
        let data = serde_json::to_string_pretty(&merged).map_err(|e| e.to_string())?;
        fs::write(&user_path, data)
            .map_err(|e| format!("Failed to write {}: {e}", display(&user_path)))?;

        *self.settings.lock().unwrap() = Some(merged.clone());
        println!("[settings] loaded/updated -> {}", display(&user_path));
        Ok(merged)
    }

    /// Value of `key` from the cached settings, falling back to the bundled
    /// defaults. `None` if neither has it.
    pub fn setting_or_default(&self, key: &str) -> Option<Value> {
        if let Some(settings) = self.settings.lock().unwrap().as_ref()
            && let Some(entry) = settings.get(key)
        {
            return entry.get("value").cloned();
        }
        match read_settings_file(&self.paths.default_settings()) {
            Ok(defaults) => defaults.get(key).and_then(|e| e.get("value")).cloned(),
            Err(e) => {
                eprintln!(
                    "[settings] couldn't find {key} in cache, then failed to read defaults: {e}"
                );
                None
            }
        }
    }

    /// Resolved absolute path for a directory setting ("Bots Directory",
    /// "Maps Directory", "Matches Directory", "Games Directory", "Logs Directory").
    pub fn configured_dir(&self, key: &str) -> Result<PathBuf, String> {
        match self.setting_or_default(key) {
            Some(Value::String(s)) if !s.is_empty() => Ok(self.paths.resolve_app_relative(&s)),
            // A game's default-settings.json may omit dirs it doesn't expose in the UI
            // (e.g. "Maps Directory" for map-less games); fall back to the standard location.
            None => match builtin_dir_default(key) {
                Some(default) => Ok(self.paths.resolve_app_relative(default)),
                None => Err(format!("Unknown directory setting \"{key}\"")),
            },
            _ => Err(format!(
                "Couldn't resolve the \"{key}\" path from config. This is likely to be a settings file problem, or a bug. Try reopening the client or updating \"{key}\" in config to a valid value."
            )),
        }
    }
}

fn builtin_dir_default(key: &str) -> Option<&'static str> {
    Some(match key {
        "Bots Directory" => "$/bots",
        "Maps Directory" => "$/maps",
        "Matches Directory" => "$/matches",
        "Games Directory" => "$/games",
        "Logs Directory" => "$/logs",
        _ => return None,
    })
}

#[tauri::command]
pub async fn settings_refresh(state: State<'_, AppState>) -> CmdResult {
    let res = state.refresh_settings();
    let cached = state.settings.lock().unwrap().clone();
    Ok(match res {
        Ok(settings) => json!({ "success": true, "settings": settings }),
        Err(e) => json!({ "success": false, "error": e, "settings": cached }),
    })
}

#[tauri::command]
pub async fn settings_get(state: State<'_, AppState>) -> Result<Option<Settings>, String> {
    Ok(state.settings.lock().unwrap().clone())
}

#[tauri::command]
pub async fn settings_set(state: State<'_, AppState>, settings: Option<Settings>) -> CmdResult {
    reply((|| {
        let settings = settings.unwrap_or_default();
        let data = serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())?;
        fs::write(state.paths.user_settings(), data).map_err(|e| e.to_string())?;
        *state.settings.lock().unwrap() = Some(settings.clone());
        Ok(json!({ "settings": settings }))
    })())
}

#[tauri::command]
pub async fn settings_open_explorer(
    app: AppHandle,
    state: State<'_, AppState>,
    app_relative_path: String,
) -> CmdResult {
    let resolved = state.paths.resolve_app_relative(&app_relative_path);
    reply(if resolved.exists() {
        app.opener()
            .open_path(display(&resolved), None::<&str>)
            .map(|_| Value::Null)
            .map_err(|e| format!("Failed to open {}: {e}", display(&resolved)))
    } else {
        Err(format!("Path does not exist: {}", display(&resolved)))
    })
}

#[tauri::command]
pub async fn settings_choose_dir(
    app: AppHandle,
    state: State<'_, AppState>,
    app_relative_path: Option<String>,
) -> CmdResult {
    let start = state
        .paths
        .resolve_app_relative(app_relative_path.as_deref().unwrap_or("$"));
    let picked = dialogs::pick_folder(&app, "Select Directory", Some(start)).await;
    Ok(match picked {
        Some(path) => json!({ "success": true, "selectedPath": display(&path) }),
        None => json!({ "success": false }),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn obj(v: Value) -> Settings {
        v.as_object().unwrap().clone()
    }

    #[test]
    fn merge_keeps_user_values_and_updates_metadata() {
        let defaults = obj(json!({
            "Python Path": { "__desc": "new desc", "value": "python" },
            "Bots Directory": { "__desc": "bots", "value": "$/bots" },
        }));
        let user = obj(json!({
            "Python Path": { "__desc": "old desc", "value": "/usr/bin/python3.12" },
            "Custom": { "value": 1 },
        }));
        let merged = merge_settings(&defaults, &user);
        assert_eq!(
            merged["Python Path"],
            json!({ "__desc": "new desc", "value": "/usr/bin/python3.12" })
        );
        assert_eq!(merged["Bots Directory"]["value"], "$/bots");
        assert_eq!(merged["Custom"], json!({ "value": 1 }));
        // default key order is preserved
        assert_eq!(merged.keys().next().unwrap(), "Python Path");
    }
}

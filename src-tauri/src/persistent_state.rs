//! Small persistent per-user state (`<data>/state.json`) that aren't user
//! settings, e.g. whether first-time setup has been seen. Kept separate from
//! `settings.json` so they don't show up (or get edited) on the Settings page.

use std::fs;
use std::path::Path;

use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use tauri::State;

use crate::paths::display;
use crate::state::AppState;
use crate::util::{CmdResult, reply};

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", default)]
pub struct PersistentState {
    pub has_setup_before: bool,
}

impl PersistentState {
    /// Missing or unreadable file => defaults (never fatal).
    pub fn load(path: &Path) -> Self {
        match fs::read_to_string(path) {
            Ok(data) => serde_json::from_str(&data).unwrap_or_else(|e| {
                eprintln!("[persistent_state] {} is invalid ({e}); using defaults", display(path));
                Self::default()
            }),
            Err(_) => Self::default(),
        }
    }

    pub fn save(&self, path: &Path) -> Result<(), String> {
        let data = serde_json::to_string_pretty(self).map_err(|e| e.to_string())?;
        fs::write(path, data).map_err(|e| format!("Failed to write {}: {e}", display(path)))
    }
}

#[tauri::command]
pub async fn persistent_state_get(state: State<'_, AppState>) -> Result<PersistentState, String> {
    Ok(state.persistent.lock().unwrap().clone())
}

/// Shallow-merges `patch` over `current`, re-validating against the struct so
/// wrong types are rejected. Unknown keys are ignored (dropped on save).
fn apply_patch(current: &PersistentState, patch: Value) -> Result<PersistentState, String> {
    let Value::Object(patch) = patch else {
        return Err("patch must be an object".into());
    };
    let mut merged = match serde_json::to_value(current).map_err(|e| e.to_string())? {
        Value::Object(obj) => obj,
        _ => unreachable!("PersistentState serializes to an object"),
    };
    merged.extend(patch);
    serde_json::from_value(Value::Object(merged)).map_err(|e| format!("Invalid state patch: {e}"))
}

#[tauri::command]
pub async fn persistent_state_set(state: State<'_, AppState>, patch: Value) -> CmdResult {
    reply((|| {
        let mut current = state.persistent.lock().unwrap();
        let updated = apply_patch(&current, patch)?;
        updated.save(&state.paths.persistent_state())?;
        *current = updated.clone();
        Ok(json!({ "state": updated }))
    })())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn missing_or_corrupt_file_gives_defaults() {
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path().join("state.json");
        assert!(!PersistentState::load(&path).has_setup_before);
        fs::write(&path, "not json").unwrap();
        assert!(!PersistentState::load(&path).has_setup_before);
    }

    #[test]
    fn patch_merges_and_validates() {
        let cur = PersistentState::default();
        let updated = apply_patch(&cur, json!({ "hasSetupBefore": true, "bogus": 1 })).unwrap();
        assert!(updated.has_setup_before);
        assert!(apply_patch(&cur, json!({ "hasSetupBefore": "yes" })).is_err());
        assert!(apply_patch(&cur, json!(5)).is_err());
    }

    #[test]
    fn round_trips() {
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path().join("state.json");
        PersistentState { has_setup_before: true }.save(&path).unwrap();
        assert!(PersistentState::load(&path).has_setup_before);
        let raw: Value = serde_json::from_str(&fs::read_to_string(&path).unwrap()).unwrap();
        assert_eq!(raw, json!({ "hasSetupBefore": true }));
    }
}

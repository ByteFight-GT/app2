//! Match metadata: `<matchId>.json` files in "Matches Directory", plus an
//! in-memory index sorted newest-first. The frontend paginates with
//! `start = <number of matches it already has>` and prepends new matches
//! locally, so new matches are inserted at the *front* here too.
//!
//! Match bodies are passed through as opaque JSON; only `matchId`,
//! `queuedTimestamp` and `outputDir` are read.

use std::fs;
use std::io::ErrorKind;
use std::path::PathBuf;

use serde_json::{Value, json};
use tauri::State;

use crate::paths::display;
use crate::state::AppState;
use crate::util::{CmdResult, reply, reply_with_fallback, require_safe_segment};

#[derive(Debug, Clone, PartialEq)]
pub struct MatchIndexEntry {
    pub match_id: String,
    pub queued_timestamp: i64,
}

/// Builds the newest-first index from file names like `<queuedMs>-<suffix>.json`.
pub fn build_index<I: IntoIterator<Item = String>>(file_names: I) -> Vec<MatchIndexEntry> {
    let mut index: Vec<MatchIndexEntry> = file_names
        .into_iter()
        .filter_map(|f| f.strip_suffix(".json").map(str::to_owned))
        .map(|match_id| MatchIndexEntry {
            queued_timestamp: match_id
                .split('-')
                .next()
                .and_then(|t| t.parse().ok())
                .unwrap_or(0),
            match_id,
        })
        .collect();
    index.sort_by_key(|e| std::cmp::Reverse(e.queued_timestamp));
    index
}

fn matches_dir(state: &AppState) -> Result<PathBuf, String> {
    state.configured_dir("Matches Directory")
}

fn match_path(state: &AppState, match_id: &str) -> Result<PathBuf, String> {
    let id = require_safe_segment(match_id, "match ID")?;
    Ok(matches_dir(state)?.join(format!("{id}.json")))
}

pub fn rebuild_index(state: &AppState) -> Result<usize, String> {
    let dir = matches_dir(state)?;
    let names = fs::read_dir(&dir)
        .map_err(|e| format!("{}: {e}", display(&dir)))?
        .filter_map(Result::ok)
        .filter_map(|e| e.file_name().into_string().ok());
    let index = build_index(names);
    let len = index.len();
    *state.matches.lock().unwrap() = index;
    println!("[matches] rebuilt index - size: {len}");
    Ok(len)
}

/// Startup: create the matches dir and build the index.
pub fn init(state: &AppState) -> Result<(), String> {
    let dir = matches_dir(state)?;
    fs::create_dir_all(&dir).map_err(|e| format!("{}: {e}", display(&dir)))?;
    rebuild_index(state).map(|_| ())
}

fn str_field<'a>(v: &'a Value, key: &str) -> Option<&'a str> {
    v.get(key).and_then(Value::as_str)
}

#[tauri::command]
pub async fn matches_reindex(state: State<'_, AppState>) -> CmdResult {
    reply(rebuild_index(&state).map(|_| Value::Null))
}

#[tauri::command]
pub async fn matches_readmany(
    state: State<'_, AppState>,
    start: Option<usize>,
    limit: Option<usize>,
) -> CmdResult {
    let start = start.unwrap_or(0);
    let limit = limit.unwrap_or(100);
    let res = async {
        let (page, total): (Vec<String>, usize) = {
            let index = state.matches.lock().unwrap();
            let page = index
                .iter()
                .skip(start)
                .take(limit)
                .map(|e| e.match_id.clone())
                .collect();
            (page, index.len())
        };
        let dir = matches_dir(&state)?;
        let mut matches = Vec::with_capacity(page.len());
        for id in page {
            let path = dir.join(format!("{id}.json"));
            let data = tokio::fs::read_to_string(&path)
                .await
                .map_err(|e| format!("{}: {e}", display(&path)))?;
            let parsed: Value =
                serde_json::from_str(&data).map_err(|e| format!("{}: {e}", display(&path)))?;
            matches.push(parsed);
        }
        Ok(json!({ "matches": matches, "total": total, "start": start, "limit": limit }))
    };
    reply_with_fallback(res.await, json!({ "matches": [], "total": 0 }))
}

#[tauri::command]
pub async fn matches_write(state: State<'_, AppState>, match_data: Value) -> CmdResult {
    let res = async {
        let match_id = str_field(&match_data, "matchId")
            .ok_or("Match data has no matchId")?
            .to_owned();
        let path = match_path(&state, &match_id)?;
        let data = serde_json::to_string_pretty(&match_data).map_err(|e| e.to_string())?;
        tokio::fs::write(&path, data)
            .await
            .map_err(|e| format!("Failed to write match {match_id}: {e}"))?;

        let mut index = state.matches.lock().unwrap();
        if !index.iter().any(|e| e.match_id == match_id) {
            // new matches are the most recent: front of the newest-first index
            let queued_timestamp = match_data
                .get("queuedTimestamp")
                .and_then(Value::as_i64)
                .unwrap_or(0);
            index.insert(
                0,
                MatchIndexEntry {
                    match_id,
                    queued_timestamp,
                },
            );
        }
        Ok(Value::Null)
    };
    reply(res.await)
}

#[tauri::command]
pub async fn matches_delete(state: State<'_, AppState>, file_names: Vec<String>) -> CmdResult {
    let mut deleted = Vec::new();
    for name in &file_names {
        let Ok(path) = match_path(&state, name) else {
            continue;
        };
        match tokio::fs::remove_file(&path).await {
            Ok(()) => deleted.push(name.clone()),
            Err(e) if e.kind() == ErrorKind::NotFound => deleted.push(name.clone()),
            Err(e) => eprintln!("[matches:delete] failed to delete {name}: {e}"),
        }
    }
    state
        .matches
        .lock()
        .unwrap()
        .retain(|e| !deleted.contains(&e.match_id));
    Ok(json!({ "success": deleted.len() == file_names.len(), "deleted": deleted }))
}

/// Reads one game's PGN. Looks in the match's recorded `outputDir` first (read
/// from the match file on disk, not trusted from the renderer), then falls
/// back to `<Games Directory>/<matchId>`.
#[tauri::command]
pub async fn matches_readgame(
    state: State<'_, AppState>,
    match_data: Value,
    game_ident: String,
) -> CmdResult {
    let res = async {
        let match_id = str_field(&match_data, "matchId").ok_or("Match data has no matchId")?;
        let match_id = require_safe_segment(match_id, "match ID")?;
        let game_ident = require_safe_segment(&game_ident, "game identifier")?;
        let file_name = format!("{game_ident}.json");

        let mut candidates = Vec::new();
        if let Ok(data) = tokio::fs::read_to_string(match_path(&state, match_id)?).await
            && let Ok(on_disk) = serde_json::from_str::<Value>(&data)
            && let Some(dir) = str_field(&on_disk, "outputDir")
        {
            candidates.push(PathBuf::from(dir).join(&file_name));
        }
        if let Ok(games_dir) = state.configured_dir("Games Directory") {
            candidates.push(games_dir.join(match_id).join(&file_name));
        }

        let Some(path) = candidates.iter().find(|p| p.is_file()) else {
            return Err(format!(
                "Can't find game file for {game_ident} in match {match_id}. Looked in: {}",
                candidates
                    .iter()
                    .map(|p| display(p))
                    .collect::<Vec<_>>()
                    .join(", ")
            ));
        };
        let data = tokio::fs::read_to_string(path)
            .await
            .map_err(|e| format!("{}: {e}", display(path)))?;
        let game_data: Value =
            serde_json::from_str(&data).map_err(|e| format!("{}: {e}", display(path)))?;
        Ok(json!({ "gameData": game_data }))
    };
    reply(res.await)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn index_sorted_newest_first_and_ignores_non_json() {
        let idx = build_index(
            [
                "100-a.json",
                "300-c.json",
                "notes.txt",
                "200-b.json",
                "garbage.json",
            ]
            .map(String::from),
        );
        let ids: Vec<_> = idx.iter().map(|e| e.match_id.as_str()).collect();
        assert_eq!(ids, ["300-c", "200-b", "100-a", "garbage"]);
        assert_eq!(idx[3].queued_timestamp, 0);
    }
}

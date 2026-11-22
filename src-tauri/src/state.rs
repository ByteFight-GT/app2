use std::sync::Mutex;

use serde_json::{Map, Value};

use crate::gameconfig::GameConfig;
use crate::matches::MatchIndexEntry;
use crate::paths::StorageLocs;
use crate::runner::ActiveRun;

pub type Settings = Map<String, Value>;

pub struct AppState {
    pub paths: StorageLocs,
    pub config: GameConfig,
    /// Cached contents of `settings.json` (`None` until the first successful refresh).
    pub settings: Mutex<Option<Settings>>,
    /// Matches index, sorted newest-first by `queuedTimestamp`.
    pub matches: Mutex<Vec<MatchIndexEntry>>,
    /// The currently running match, if any.
    pub runner: Mutex<Option<ActiveRun>>,
}

impl AppState {
    pub fn new(paths: StorageLocs, config: GameConfig) -> Self {
        Self {
            paths,
            config,
            settings: Mutex::new(None),
            matches: Mutex::new(Vec::new()),
            runner: Mutex::new(None),
        }
    }
}

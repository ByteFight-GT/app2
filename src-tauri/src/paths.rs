//! Well-known locations. `data` is the writable per-user app data dir
//! (`app_data_dir()`, i.e. `<data>/com.bytefight.bytefightapp`); `resources`
//! is the read-only bundle resource dir (see `bundle.resources` in
//! `tauri.conf.json`).

use std::path::{Path, PathBuf};

use tauri::{AppHandle, Manager};

#[derive(Debug, Clone)]
pub struct StorageLocs {
    pub data: PathBuf,
    pub resources: PathBuf,
}

impl StorageLocs {
    pub fn new(app: &AppHandle) -> Result<Self, String> {
        let data = app
            .path()
            .app_data_dir()
            .map_err(|e| format!("Couldn't resolve app data dir: {e}"))?;
        let resources = app
            .path()
            .resource_dir()
            .map_err(|e| format!("Couldn't resolve resource dir: {e}"))?;
        std::fs::create_dir_all(&data)
            .map_err(|e| format!("Couldn't create app data dir {}: {e}", data.display()))?;
        Ok(Self { data, resources })
    }

    pub fn user_settings(&self) -> PathBuf {
        self.data.join("settings.json")
    }

    pub fn default_settings(&self) -> PathBuf {
        self.resources
            .join("resources")
            .join("default-settings.json")
    }

    pub fn default_maps(&self) -> PathBuf {
        self.resources.join("resources").join("default-maps")
    }

    pub fn example_bot(&self) -> PathBuf {
        self.resources.join("resources").join("example-bot")
    }

    /// Engine copy shipped in the bundle. Only used to seed [`Self::engine`].
    pub fn bundled_engine(&self) -> PathBuf {
        self.resources.join("engine")
    }

    /// Writable engine dir that matches actually run from.
    pub fn engine(&self) -> PathBuf {
        self.data.join("engine")
    }

    /// Resolves an "app-relative" settings path: `$/some/path` or `$some/path`
    /// is relative to the app data dir; anything else is returned as-is.
    pub fn resolve_app_relative(&self, path: &str) -> PathBuf {
        match path.strip_prefix('$') {
            // strip leading separators: PathBuf::join with an absolute path replaces the base
            Some(rest) => self.data.join(rest.trim_start_matches(['/', '\\'])),
            None => PathBuf::from(path),
        }
    }
}

pub fn display(path: &Path) -> String {
    path.display().to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolves_app_relative() {
        let p = StorageLocs {
            data: PathBuf::from("/data"),
            resources: PathBuf::from("/res"),
        };
        assert_eq!(
            p.resolve_app_relative("$/bots"),
            PathBuf::from("/data/bots")
        );
        assert_eq!(p.resolve_app_relative("$bots"), PathBuf::from("/data/bots"));
        assert_eq!(p.resolve_app_relative("$"), PathBuf::from("/data"));
        assert_eq!(
            p.resolve_app_relative("/abs/bots"),
            PathBuf::from("/abs/bots")
        );
    }
}

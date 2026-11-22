//! The Python engine runs from a writable copy at `<data>/engine` (so it can
//! be auto-updated later). On startup that copy is seeded from the bundled
//! engine if it's missing or its `ENGINE_VERSION.json` differs.
//!
//! TODO(engine-updater): check a manifest on the webserver, download + verify
//! the new engine into a temp dir, then swap it in with [`install_engine`]. Never
//! swap while a match is running. Once engine versions carry an orderable
//! timestamp, change `needs_seed` to "bundled is newer than installed" so the
//! bundled seed can't overwrite a newer downloaded engine.

use std::fs;
use std::path::Path;

use crate::paths::display;
use crate::state::AppState;
use crate::util::copy_dir_recursive;

pub const VERSION_FILE: &str = "ENGINE_VERSION.json";
pub const LOCAL_SERVER_SCRIPT: &str = "local_server.py";

pub fn read_version(engine_dir: &Path) -> Option<String> {
    fs::read_to_string(engine_dir.join(VERSION_FILE))
        .ok()
        .map(|s| s.trim().to_owned())
}

fn needs_seed(installed: &Path, bundled: &Path) -> bool {
    !installed.join(LOCAL_SERVER_SCRIPT).is_file()
        || read_version(installed) != read_version(bundled)
}

/// Replaces `target` with a copy of `source`: copy to a sibling temp dir first,
/// then swap, so a failed copy never leaves a half-written engine.
pub fn install_engine(source: &Path, target: &Path) -> Result<(), String> {
    let tmp = target.with_extension("tmp");
    if tmp.exists() {
        fs::remove_dir_all(&tmp).map_err(|e| format!("{}: {e}", display(&tmp)))?;
    }
    copy_dir_recursive(source, &tmp)
        .map_err(|e| format!("Failed to copy engine from {}: {e}", display(source)))?;
    if target.exists() {
        fs::remove_dir_all(target).map_err(|e| format!("{}: {e}", display(target)))?;
    }
    fs::rename(&tmp, target)
        .map_err(|e| format!("Failed to install engine to {}: {e}", display(target)))
}

/// Startup: make sure `<data>/engine` exists and matches the bundled version.
pub fn init(state: &AppState) -> Result<(), String> {
    let bundled = state.paths.bundled_engine();
    let installed = state.paths.engine();
    if !bundled.join(LOCAL_SERVER_SCRIPT).is_file() {
        return Err(format!("Bundled engine not found at {}", display(&bundled)));
    }
    if needs_seed(&installed, &bundled) {
        println!(
            "[engine] seeding {} ({:?} -> {:?})",
            display(&installed),
            read_version(&installed),
            read_version(&bundled)
        );
        install_engine(&bundled, &installed)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_engine(dir: &Path, version: &str) {
        fs::create_dir_all(dir).unwrap();
        fs::write(dir.join(LOCAL_SERVER_SCRIPT), "print('hi')").unwrap();
        fs::write(dir.join(VERSION_FILE), format!("\"{version}\"")).unwrap();
    }

    #[test]
    fn seeds_when_missing_or_different() {
        let tmp = tempfile::tempdir().unwrap();
        let bundled = tmp.path().join("bundled");
        let installed = tmp.path().join("engine");
        make_engine(&bundled, "aaa");

        assert!(needs_seed(&installed, &bundled));
        install_engine(&bundled, &installed).unwrap();
        assert!(!needs_seed(&installed, &bundled));
        assert!(!tmp.path().join("engine.tmp").exists());

        make_engine(&bundled, "bbb");
        assert!(needs_seed(&installed, &bundled));
        fs::write(installed.join("stale.py"), "").unwrap();
        install_engine(&bundled, &installed).unwrap();
        assert_eq!(read_version(&installed).as_deref(), Some("\"bbb\""));
        assert!(!installed.join("stale.py").exists());
    }
}

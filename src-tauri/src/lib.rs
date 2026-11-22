mod bots;
mod dialogs;
mod engine;
mod gameconfig;
mod logs;
mod maps;
mod matches;
mod paths;
mod runner;
mod settings;
mod state;
mod util;

use tauri::{Manager, RunEvent};

use crate::gameconfig::GameConfig;
use crate::paths::AppPaths;
use crate::state::AppState;

/// Startup initialization, in order. Settings must come first since every
/// directory lookup goes through them. Later steps log and continue on error
/// so one broken directory doesn't keep the app from opening.
type InitStep = (&'static str, fn(&AppState) -> Result<(), String>);

fn init_backend(state: &AppState) -> Result<(), String> {
    state.refresh_settings()?;

    let steps: [InitStep; 5] = [
        ("engine", engine::init),
        ("maps", maps::init), // seeds default maps only if gameconfig enables maps
        ("bots", bots::init),
        ("matches", matches::init),
        ("logs", logs::init),
    ];
    for (name, step) in steps {
        if let Err(e) = step(state) {
            eprintln!("[init] {name}: {e}");
        }
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let paths = AppPaths::from_app(app.handle())?;
            println!("[init] data dir: {}", paths.data.display());
            let state = AppState::new(paths, GameConfig::load());
            init_backend(&state)?;
            app.manage(state);

            #[cfg(debug_assertions)]
            if let Some(window) = app.get_webview_window("main") {
                window.open_devtools();
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            settings::settings_refresh,
            settings::settings_get,
            settings::settings_set,
            settings::settings_open_explorer,
            settings::settings_choose_dir,
            maps::maps_list,
            maps::maps_read,
            maps::maps_write,
            maps::maps_delete,
            maps::maps_import,
            bots::bots_list,
            bots::bots_import,
            matches::matches_reindex,
            matches::matches_readmany,
            matches::matches_write,
            matches::matches_delete,
            matches::matches_readgame,
            logs::logs_write,
            logs::logs_read,
            logs::logs_open,
            logs::logs_delete,
            logs::logs_deletematch,
            runner::runner_start_match,
            runner::runner_getcurrent,
            runner::runner_terminate,
            runner::runner_disconnect,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|handle, event| {
        if let RunEvent::Exit = event {
            runner::kill_on_exit(handle);
        }
    });
}

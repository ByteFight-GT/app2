// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod persistent_state;
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
use crate::paths::StorageLocs;
use crate::state::AppState;


fn main() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            // paths where things like bots/resources are stored
            let storage_locs = StorageLocs::new(app.handle())?;

            let appstate = AppState::new(storage_locs, GameConfig::load());

            // init all our unpaid workers:
            appstate.refresh_settings()?;
            *appstate.persistent.lock().unwrap() =
                persistent_state::PersistentState::load(&appstate.paths.persistent_state());

            if let Err(e) = engine::init(&appstate) {
                eprintln!("error initializing engine: {e}");
            }
            if let Err(e) = maps::init(&appstate) {
                eprintln!("error initializing maps: {e}");
            }
            if let Err(e) = bots::init(&appstate) {
                eprintln!("error initializing bots: {e}");
            }
            if let Err(e) = matches::init(&appstate) {
                eprintln!("error initializing matches: {e}");
            }
            if let Err(e) = logs::init(&appstate) {
                eprintln!("error initializing logs: {e}");
            }

            app.manage(appstate);

            #[cfg(debug_assertions)]
            if let Some(window) = app.get_webview_window("main") {
                window.open_devtools();
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            persistent_state::persistent_state_get,
            persistent_state::persistent_state_set,
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

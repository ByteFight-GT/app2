//! Async wrappers around the native file dialogs (callback API → await).

use std::path::PathBuf;

use tauri::AppHandle;
use tauri_plugin_dialog::{DialogExt, FileDialogBuilder, FilePath};
use tokio::sync::oneshot;

fn builder(app: &AppHandle, title: &str, start: Option<PathBuf>) -> FileDialogBuilder<tauri::Wry> {
    let mut b = app.dialog().file().set_title(title);
    if let Some(dir) = start.filter(|d| d.is_dir()) {
        b = b.set_directory(dir);
    }
    b
}

fn to_paths(picked: Option<Vec<FilePath>>) -> Vec<PathBuf> {
    picked
        .unwrap_or_default()
        .into_iter()
        .filter_map(|p| p.into_path().ok())
        .collect()
}

pub async fn pick_folder(app: &AppHandle, title: &str, start: Option<PathBuf>) -> Option<PathBuf> {
    let (tx, rx) = oneshot::channel();
    builder(app, title, start).pick_folder(move |p| {
        let _ = tx.send(p);
    });
    rx.await.ok().flatten().and_then(|p| p.into_path().ok())
}

pub async fn pick_folders(app: &AppHandle, title: &str) -> Vec<PathBuf> {
    let (tx, rx) = oneshot::channel();
    builder(app, title, None).pick_folders(move |p| {
        let _ = tx.send(p);
    });
    to_paths(rx.await.ok().flatten())
}

pub async fn pick_files(
    app: &AppHandle,
    title: &str,
    filter_name: &str,
    extensions: &[&str],
) -> Vec<PathBuf> {
    let (tx, rx) = oneshot::channel();
    builder(app, title, None)
        .add_filter(filter_name, extensions)
        .pick_files(move |p| {
            let _ = tx.send(p);
        });
    to_paths(rx.await.ok().flatten())
}

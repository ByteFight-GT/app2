//! Opening things in the user's default external apps.

use tauri::AppHandle;
use tauri_plugin_opener::OpenerExt;

use crate::util::{CmdResult, reply};

/// Only plain web links: the renderer must not be able to open local paths
/// or custom protocol handlers through this command.
fn is_web_url(url: &str) -> bool {
    let lower = url.trim().to_ascii_lowercase();
    lower.starts_with("https://") || lower.starts_with("http://")
}

#[tauri::command]
pub async fn open_external_url(app: AppHandle, url: String) -> CmdResult {
    reply(if is_web_url(&url) {
        app.opener()
            .open_url(url.trim(), None::<&str>)
            .map(|_| serde_json::Value::Null)
            .map_err(|e| format!("Failed to open {url}: {e}"))
    } else {
        Err(format!("Only http(s) links can be opened: {url:?}"))
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_http_urls_allowed() {
        assert!(is_web_url("https://example.com/a?b=1"));
        assert!(is_web_url("HTTP://example.com"));
        for bad in ["file:///etc/passwd", "/etc/passwd", "javascript:alert(1)", "ftp://x", ""] {
            assert!(!is_web_url(bad), "{bad:?} should be rejected");
        }
    }
}

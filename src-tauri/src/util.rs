//! Small shared helpers: IPC response shaping, path-segment validation,
//! recursive copy, and stream decoders used by the runner.

use std::fs;
use std::io;
use std::path::Path;

use serde_json::{Map, Value, json};

/// Every command resolves (never rejects) with an object shaped like
/// `{ success: true, ...fields }` or `{ success: false, error }`, matching
/// `IPCResult` in `common/electron-api.ts`.
pub type CmdResult = Result<Value, String>;

/// Wraps a fallible handler body into the `{ success, ... }` shape.
/// On `Ok`, `success: true` is added unless the object already sets it.
pub fn reply(result: Result<Value, String>) -> CmdResult {
    Ok(match result {
        Ok(Value::Object(mut obj)) => {
            obj.entry("success").or_insert(Value::Bool(true));
            Value::Object(obj)
        }
        Ok(Value::Null) => json!({ "success": true }),
        Ok(other) => other,
        Err(error) => json!({ "success": false, "error": error }),
    })
}

/// Like [`reply`], but merges `extra` into the failure object so callers that
/// read e.g. `res.bots` on failure still get an empty list.
pub fn reply_with_fallback(result: Result<Value, String>, extra: Value) -> CmdResult {
    match result {
        Ok(_) => reply(result),
        Err(error) => {
            let mut obj = match extra {
                Value::Object(obj) => obj,
                _ => Map::new(),
            };
            obj.insert("success".into(), Value::Bool(false));
            obj.insert("error".into(), Value::String(error));
            Ok(Value::Object(obj))
        }
    }
}

/// True if `segment` is a single, non-traversing path component, so that
/// `dir.join(segment)` stays inside `dir`. Applied to every renderer-supplied
/// name (bots, maps, match ids, game idents).
pub fn is_safe_segment(segment: &str) -> bool {
    !segment.is_empty() && segment != "." && segment != ".." && !segment.contains(['/', '\\', '\0'])
}

pub fn require_safe_segment<'a>(segment: &'a str, what: &str) -> Result<&'a str, String> {
    if is_safe_segment(segment) {
        Ok(segment)
    } else {
        Err(format!("Invalid {what}: {segment:?}"))
    }
}

/// Recursively copies `src` into `dst` (merging/overwriting), like
/// `fs.cpSync(src, dst, { recursive: true })`. Skips `__pycache__`.
pub fn copy_dir_recursive(src: &Path, dst: &Path) -> io::Result<()> {
    fs::create_dir_all(dst)?;
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let name = entry.file_name();
        if name == "__pycache__" {
            continue;
        }
        let from = entry.path();
        let to = dst.join(&name);
        if from.is_dir() {
            copy_dir_recursive(&from, &to)?;
        } else {
            fs::copy(&from, &to)?;
        }
    }
    Ok(())
}

pub fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// Decodes a byte stream into UTF-8 chunks without splitting multi-byte
/// characters across chunk boundaries.
#[derive(Default)]
pub struct Utf8ChunkDecoder {
    pending: Vec<u8>,
}

impl Utf8ChunkDecoder {
    /// Feeds bytes; returns whatever is decodable so far (may be empty).
    pub fn push(&mut self, bytes: &[u8]) -> String {
        self.pending.extend_from_slice(bytes);
        match std::str::from_utf8(&self.pending) {
            Ok(s) => {
                let out = s.to_owned();
                self.pending.clear();
                out
            }
            Err(e) if e.error_len().is_none() => {
                // incomplete trailing sequence: emit the valid prefix, keep the rest
                let valid = e.valid_up_to();
                let out = String::from_utf8_lossy(&self.pending[..valid]).into_owned();
                self.pending.drain(..valid);
                out
            }
            Err(_) => {
                // genuinely invalid bytes: decode lossily and move on
                let out = String::from_utf8_lossy(&self.pending).into_owned();
                self.pending.clear();
                out
            }
        }
    }

    /// Flushes any leftover bytes (lossily) at end of stream.
    pub fn finish(&mut self) -> String {
        let out = String::from_utf8_lossy(&self.pending).into_owned();
        self.pending.clear();
        out
    }
}

/// Splits a byte stream into newline-delimited lines, buffering partial lines
/// across chunks. Used for the engine's NDJSON TCP stream.
#[derive(Default)]
pub struct LineSplitter {
    buf: Vec<u8>,
}

impl LineSplitter {
    pub fn push(&mut self, bytes: &[u8]) -> Vec<String> {
        self.buf.extend_from_slice(bytes);
        let mut lines = Vec::new();
        while let Some(pos) = self.buf.iter().position(|&b| b == b'\n') {
            let line: Vec<u8> = self.buf.drain(..=pos).collect();
            let text = String::from_utf8_lossy(&line[..line.len() - 1]);
            let text = text.trim_end_matches('\r');
            if !text.trim().is_empty() {
                lines.push(text.to_owned());
            }
        }
        lines
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn safe_segments() {
        assert!(is_safe_segment("example-bot"));
        assert!(is_safe_segment("1700000000000-abc"));
        assert!(is_safe_segment("my bot"));
        for bad in ["", ".", "..", "a/b", "a\\b", "../x", "/abs", "a\0b"] {
            assert!(!is_safe_segment(bad), "{bad:?} should be rejected");
        }
    }

    #[test]
    fn reply_shapes() {
        assert_eq!(
            reply(Ok(json!({"x": 1}))).unwrap(),
            json!({"x": 1, "success": true})
        );
        assert_eq!(
            reply(Ok(json!({"success": false}))).unwrap(),
            json!({"success": false})
        );
        assert_eq!(
            reply(Err("bad".into())).unwrap(),
            json!({"success": false, "error": "bad"})
        );
        assert_eq!(
            reply_with_fallback(Err("bad".into()), json!({"bots": []})).unwrap(),
            json!({"bots": [], "success": false, "error": "bad"})
        );
    }

    #[test]
    fn line_splitter_handles_partial_lines() {
        let mut s = LineSplitter::default();
        assert!(s.push(b"{\"a\":").is_empty());
        assert_eq!(
            s.push(b"1}\n{\"b\":2}\n{\"c\""),
            vec!["{\"a\":1}", "{\"b\":2}"]
        );
        assert_eq!(s.push(b":3}\r\n\n"), vec!["{\"c\":3}"]);
    }

    #[test]
    fn utf8_decoder_keeps_split_chars() {
        let mut d = Utf8ChunkDecoder::default();
        let bytes = "héllo".as_bytes(); // é is 2 bytes at index 1..3
        assert_eq!(d.push(&bytes[..2]), "h");
        assert_eq!(d.push(&bytes[2..]), "éllo");
        assert_eq!(d.finish(), "");
    }

    #[test]
    fn copy_dir_skips_pycache() {
        let tmp = tempfile::tempdir().unwrap();
        let src = tmp.path().join("src");
        fs::create_dir_all(src.join("pkg/__pycache__")).unwrap();
        fs::write(src.join("pkg/a.py"), "x").unwrap();
        fs::write(src.join("pkg/__pycache__/a.pyc"), "x").unwrap();
        let dst = tmp.path().join("dst");
        copy_dir_recursive(&src, &dst).unwrap();
        assert!(dst.join("pkg/a.py").exists());
        assert!(!dst.join("pkg/__pycache__").exists());
    }
}

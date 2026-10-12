//! Filesystem persistence for shell layouts, independent of native UI crates.
//! Callers serialize writers with the managed layout lock.

use std::io::Write;
use std::path::{Path, PathBuf};

pub fn replace_file(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let mut name = path.as_os_str().to_os_string();
    name.push(".tmp");
    let temporary = PathBuf::from(name);
    let mut file = std::fs::File::create(&temporary)?;
    let result = (|| {
        file.write_all(bytes)?;
        file.sync_all()?;
        drop(file);
        // std::fs::rename uses MoveFileExW with MOVEFILE_REPLACE_EXISTING
        // on Windows; a same-directory replacement never exposes partial JSON.
        std::fs::rename(&temporary, path)
    })();
    if result.is_err() {
        let _ = std::fs::remove_file(&temporary);
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::time::{SystemTime, UNIX_EPOCH};

    fn fixture() -> std::path::PathBuf {
        static NEXT: AtomicU64 = AtomicU64::new(0);
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!(
            "pluely-shell-store-{}-{stamp}-{}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed)
        ))
    }

    #[test]
    fn creates_parent_directory_and_preserves_utf8() {
        let root = fixture();
        let path = root.join("profile").join("shell_layout.json");
        replace_file(&path, "{\"title\":\"Київ 😀\"}".as_bytes()).unwrap();
        assert_eq!(
            std::fs::read_to_string(&path).unwrap(),
            "{\"title\":\"Київ 😀\"}"
        );
    }

    #[test]
    fn repeated_writes_replace_the_complete_previous_layout() {
        let root = fixture();
        std::fs::create_dir_all(&root).unwrap();
        let path = root.join("shell_layout.json");
        replace_file(&path, b"{\"mode\":\"buttons\",\"long\":123}").unwrap();
        replace_file(&path, b"{\"mode\":\"side\"}").unwrap();
        assert_eq!(std::fs::read(&path).unwrap(), b"{\"mode\":\"side\"}");
        assert!(!path.with_extension("json.tmp").exists());
    }

    #[test]
    fn failed_temporary_write_keeps_the_last_good_layout() {
        let root = fixture();
        std::fs::create_dir_all(&root).unwrap();
        let path = root.join("shell_layout.json");
        std::fs::write(&path, b"old-valid-layout").unwrap();
        std::fs::create_dir(path.with_extension("json.tmp")).unwrap();
        assert!(replace_file(&path, b"new-layout").is_err());
        assert_eq!(std::fs::read(&path).unwrap(), b"old-valid-layout");
    }

    #[test]
    fn recovers_from_a_stale_partial_temporary_file() {
        let root = fixture();
        std::fs::create_dir_all(&root).unwrap();
        let path = root.join("shell_layout.json");
        std::fs::write(&path, b"old-valid-layout").unwrap();
        std::fs::write(path.with_extension("json.tmp"), b"partial").unwrap();
        replace_file(&path, b"new-valid-layout").unwrap();
        assert_eq!(std::fs::read(&path).unwrap(), b"new-valid-layout");
        assert!(!path.with_extension("json.tmp").exists());
    }
}

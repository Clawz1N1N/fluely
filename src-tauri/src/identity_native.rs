//! Narrow Windows FFI for our own binary resources and HKCU Run value.
//! No enumeration of unrelated startup entries or system-wide policy changes.
use super::core::{default_version, parse_version, rename_version, serialize_version};
use std::path::Path;

#[cfg(windows)]
mod win {
    use super::*;
    use std::{ffi::c_void, os::windows::ffi::OsStrExt};
    type Handle = *mut c_void;
    #[link(name = "kernel32")]
    extern "system" {
        fn LoadLibraryExW(path: *const u16, file: Handle, flags: u32) -> Handle;
        fn FreeLibrary(module: Handle) -> i32;
        fn EnumResourceLanguagesW(
            module: Handle,
            kind: *const u16,
            name: *const u16,
            callback: Option<
                unsafe extern "system" fn(Handle, *const u16, *const u16, u16, isize) -> i32,
            >,
            param: isize,
        ) -> i32;
        fn FindResourceExW(
            module: Handle,
            kind: *const u16,
            name: *const u16,
            language: u16,
        ) -> Handle;
        fn LoadResource(module: Handle, resource: Handle) -> Handle;
        fn LockResource(resource: Handle) -> *const u8;
        fn SizeofResource(module: Handle, resource: Handle) -> u32;
        fn BeginUpdateResourceW(path: *const u16, delete: i32) -> Handle;
        fn UpdateResourceW(
            update: Handle,
            kind: *const u16,
            name: *const u16,
            language: u16,
            data: *const c_void,
            size: u32,
        ) -> i32;
        fn EndUpdateResourceW(update: Handle, discard: i32) -> i32;
    }
    #[link(name = "advapi32")]
    extern "system" {
        fn RegOpenKeyExW(
            key: Handle,
            path: *const u16,
            options: u32,
            access: u32,
            result: *mut Handle,
        ) -> i32;
        fn RegCreateKeyExW(
            key: Handle,
            path: *const u16,
            reserved: u32,
            class: *mut u16,
            options: u32,
            access: u32,
            security: *const c_void,
            result: *mut Handle,
            disposition: *mut u32,
        ) -> i32;
        fn RegQueryValueExW(
            key: Handle,
            name: *const u16,
            reserved: *mut u32,
            kind: *mut u32,
            data: *mut u8,
            size: *mut u32,
        ) -> i32;
        fn RegSetValueExW(
            key: Handle,
            name: *const u16,
            reserved: u32,
            kind: u32,
            data: *const u8,
            size: u32,
        ) -> i32;
        fn RegDeleteValueW(key: Handle, name: *const u16) -> i32;
        fn RegCloseKey(key: Handle) -> i32;
    }
    fn wide(value: &std::ffi::OsStr) -> Vec<u16> {
        value.encode_wide().chain(Some(0)).collect()
    }
    struct Library(Handle);
    impl Drop for Library {
        fn drop(&mut self) {
            unsafe {
                FreeLibrary(self.0);
            }
        }
    }
    struct Key(Handle);
    impl Drop for Key {
        fn drop(&mut self) {
            unsafe {
                RegCloseKey(self.0);
            }
        }
    }
    unsafe extern "system" fn language(
        _module: Handle,
        _kind: *const u16,
        _name: *const u16,
        value: u16,
        param: isize,
    ) -> i32 {
        (*(param as *mut Vec<u16>)).push(value);
        1
    }
    pub fn read_versions(path: &Path) -> Result<Vec<(u16, Vec<u8>)>, String> {
        let path = wide(path.as_os_str());
        unsafe {
            let module = Library(LoadLibraryExW(
                path.as_ptr(),
                std::ptr::null_mut(),
                0x2 | 0x20,
            ));
            if module.0.is_null() {
                return Err(format!(
                    "Load own executable resources: {}",
                    std::io::Error::last_os_error()
                ));
            }
            let mut languages = Vec::new();
            EnumResourceLanguagesW(
                module.0,
                16usize as _,
                1usize as _,
                Some(language),
                &mut languages as *mut _ as isize,
            );
            let mut result = vec![];
            for lang in languages {
                let resource = FindResourceExW(module.0, 16usize as _, 1usize as _, lang);
                if resource.is_null() {
                    return Err("Own executable VERSIONINFO is unavailable".into());
                }
                let size = SizeofResource(module.0, resource) as usize;
                let memory = LockResource(LoadResource(module.0, resource));
                if memory.is_null() || size == 0 || size > 65535 {
                    return Err("Invalid own executable VERSIONINFO size".into());
                }
                result.push((lang, std::slice::from_raw_parts(memory, size).to_vec()));
            }
            Ok(result)
        }
    }
    pub fn patch_version(path: &Path, alias: &str) -> Result<(), String> {
        let original = read_versions(path)?;
        let versions = if original.is_empty() {
            vec![(0x0409, serialize_version(&default_version(alias))?)]
        } else {
            original
                .into_iter()
                .map(|(lang, bytes)| {
                    let mut node = parse_version(&bytes)?;
                    rename_version(&mut node, alias);
                    Ok((lang, serialize_version(&node)?))
                })
                .collect::<Result<Vec<_>, String>>()?
        };
        let path = wide(path.as_os_str());
        unsafe {
            let update = BeginUpdateResourceW(path.as_ptr(), 0);
            if update.is_null() {
                return Err(format!(
                    "Begin own resource update: {}",
                    std::io::Error::last_os_error()
                ));
            }
            for (lang, bytes) in versions {
                if UpdateResourceW(
                    update,
                    16usize as _,
                    1usize as _,
                    lang,
                    bytes.as_ptr().cast(),
                    bytes.len() as u32,
                ) == 0
                {
                    let error = std::io::Error::last_os_error();
                    EndUpdateResourceW(update, 1);
                    return Err(format!("Update own VERSIONINFO: {error}"));
                }
            }
            if EndUpdateResourceW(update, 0) == 0 {
                return Err(format!(
                    "Finish own resource update: {}",
                    std::io::Error::last_os_error()
                ));
            }
        }
        Ok(())
    }
    fn open_run(write: bool) -> Result<Option<Key>, String> {
        let path = wide(std::ffi::OsStr::new(
            "Software\\Microsoft\\Windows\\CurrentVersion\\Run",
        ));
        let mut key = std::ptr::null_mut();
        // Sign-extended predefined HKCU handle, per Windows ABI.
        let hkcu = 0x80000001u32 as i32 as isize as Handle;
        let code = unsafe {
            if write {
                RegCreateKeyExW(
                    hkcu,
                    path.as_ptr(),
                    0,
                    std::ptr::null_mut(),
                    0,
                    3,
                    std::ptr::null(),
                    &mut key,
                    std::ptr::null_mut(),
                )
            } else {
                RegOpenKeyExW(hkcu, path.as_ptr(), 0, 1, &mut key)
            }
        };
        if code == 2 && !write {
            return Ok(None);
        }
        if code != 0 {
            return Err(format!("Open own startup setting: Windows error {code}"));
        }
        Ok(Some(Key(key)))
    }
    pub fn read_run(name: &str) -> Result<Option<String>, String> {
        let Some(key) = open_run(false)? else {
            return Ok(None);
        };
        let name = wide(std::ffi::OsStr::new(name));
        let mut size = 0u32;
        let mut kind = 0u32;
        let code = unsafe {
            RegQueryValueExW(
                key.0,
                name.as_ptr(),
                std::ptr::null_mut(),
                &mut kind,
                std::ptr::null_mut(),
                &mut size,
            )
        };
        if code == 2 {
            return Ok(None);
        }
        if code != 0 {
            return Err(format!("Read own startup setting: Windows error {code}"));
        }
        if kind != 1 || size > 32768 || !size.is_multiple_of(2) {
            return Err("Startup name is occupied by an incompatible registry value".into());
        }
        let mut bytes = vec![0u8; size as usize];
        let code = unsafe {
            RegQueryValueExW(
                key.0,
                name.as_ptr(),
                std::ptr::null_mut(),
                &mut kind,
                bytes.as_mut_ptr(),
                &mut size,
            )
        };
        if code != 0 || kind != 1 {
            return Err(format!("Read own startup setting: Windows error {code}"));
        }
        let words: Vec<_> = bytes[..size as usize]
            .as_chunks::<2>()
            .0
            .iter()
            .map(|b| u16::from_le_bytes([b[0], b[1]]))
            .take_while(|w| *w != 0)
            .collect();
        String::from_utf16(&words)
            .map(Some)
            .map_err(|_| "Startup setting contains invalid Unicode".into())
    }
    pub fn write_run(name: &str, command: &str) -> Result<(), String> {
        let key = open_run(true)?.ok_or("Startup key unavailable")?;
        let name = wide(std::ffi::OsStr::new(name));
        let bytes: Vec<_> = command
            .encode_utf16()
            .chain(Some(0))
            .flat_map(u16::to_le_bytes)
            .collect();
        let code = unsafe {
            RegSetValueExW(
                key.0,
                name.as_ptr(),
                0,
                1,
                bytes.as_ptr(),
                bytes.len() as u32,
            )
        };
        if code != 0 {
            return Err(format!("Write own startup setting: Windows error {code}"));
        }
        Ok(())
    }
    pub fn delete_run_if_equal(name: &str, expected: &str) -> Result<(), String> {
        if read_run(name)?.as_deref() != Some(expected) {
            return Err("Startup value changed outside Fluely; it was left untouched".into());
        }
        let key = open_run(true)?.ok_or("Startup key unavailable")?;
        let name = wide(std::ffi::OsStr::new(name));
        let code = unsafe { RegDeleteValueW(key.0, name.as_ptr()) };
        if code != 0 && code != 2 {
            return Err(format!("Remove own startup setting: Windows error {code}"));
        }
        Ok(())
    }
}
#[cfg(windows)]
#[allow(unused_imports)] // Also used by standalone native resource inspection.
pub use win::read_versions;
#[cfg(windows)]
pub use win::{delete_run_if_equal, patch_version, read_run, write_run};
#[cfg(not(windows))]
pub fn patch_version(_path: &Path, _alias: &str) -> Result<(), String> {
    Err("Executable aliases require Windows".into())
}
#[cfg(not(windows))]
pub fn read_run(_name: &str) -> Result<Option<String>, String> {
    Ok(None)
}
#[cfg(not(windows))]
pub fn write_run(_name: &str, _command: &str) -> Result<(), String> {
    Err("Startup aliases require Windows".into())
}
#[cfg(not(windows))]
pub fn delete_run_if_equal(_name: &str, _expected: &str) -> Result<(), String> {
    Err("Startup aliases require Windows".into())
}

//! Minimal ABI subset from handy-computer/transcribe.cpp v0.4.0
//! bindings/rust/sys/src/transcribe_sys.rs (MIT). Used ONLY in an isolated worker.
use std::{
    ffi::{c_char, c_void, CStr, CString},
    path::Path,
};
#[repr(C)]
struct BackendParams {
    size: u64,
    directory: *const c_char,
    allowed: u32,
}
#[repr(C)]
struct LoadParams {
    size: u64,
    backend: i32,
    device: *mut c_void,
}
#[repr(C)]
struct SessionParams {
    size: u64,
    threads: i32,
    kv_type: i32,
    context: i32,
}
#[repr(C)]
struct RunParams {
    size: u64,
    task: i32,
    timestamps: i32,
    pnc: i32,
    itn: i32,
    diarize: i32,
    language: *const c_char,
    target: *const c_char,
    keep_tags: bool,
    family: *const c_void,
    drafts: i32,
    vocabulary: *const *const c_char,
    vocabulary_count: i32,
    prompt: *const c_char,
    prefix: *const c_char,
}
type Open = unsafe extern "C" fn(
    *const c_char,
    *const LoadParams,
    *const SessionParams,
    *mut *mut c_void,
) -> i32;
type Close = unsafe extern "C" fn(*mut c_void);
type Run = unsafe extern "C" fn(*mut c_void, *const f32, i32, *const RunParams) -> i32;
type Text = unsafe extern "C" fn(*const c_void) -> *const c_char;
type RunInit = unsafe extern "C" fn(*mut RunParams);
type StatusText = unsafe extern "C" fn(i32) -> *const c_char;
#[cfg(target_os = "windows")]
struct Library(windows::Win32::Foundation::HMODULE);
#[cfg(target_os = "windows")]
impl Library {
    fn load(path: &Path) -> Result<Self, String> {
        use windows::{
            core::PCWSTR,
            Win32::System::LibraryLoader::{
                LoadLibraryExW, LOAD_LIBRARY_SEARCH_DEFAULT_DIRS, LOAD_LIBRARY_SEARCH_DLL_LOAD_DIR,
            },
        };
        let wide = path
            .as_os_str()
            .to_string_lossy()
            .encode_utf16()
            .chain(Some(0))
            .collect::<Vec<_>>();
        unsafe {
            LoadLibraryExW(
                PCWSTR(wide.as_ptr()),
                None,
                LOAD_LIBRARY_SEARCH_DLL_LOAD_DIR | LOAD_LIBRARY_SEARCH_DEFAULT_DIRS,
            )
            .map(Self)
            .map_err(|e| format!("Load transcribe.cpp native library: {e}"))
        }
    }
    unsafe fn get<T: Copy>(&self, name: &'static [u8]) -> Result<T, String> {
        use windows::{core::PCSTR, Win32::System::LibraryLoader::GetProcAddress};
        if std::mem::size_of::<T>() != std::mem::size_of::<usize>() {
            return Err("Invalid native function pointer size".into());
        }
        let symbol = unsafe { GetProcAddress(self.0, PCSTR(name.as_ptr())) }.ok_or_else(|| {
            format!(
                "Missing transcribe.cpp API {}",
                String::from_utf8_lossy(name)
            )
        })?;
        Ok(unsafe { std::mem::transmute_copy(&symbol) })
    }
}
#[cfg(target_os = "windows")]
impl Drop for Library {
    fn drop(&mut self) {
        unsafe {
            let _ = windows::Win32::Foundation::FreeLibrary(self.0);
        }
    }
}
#[cfg(target_os = "windows")]
pub struct Session {
    session: *mut c_void,
    close: Close,
    run: Run,
    text: Text,
    run_init: RunInit,
    status: StatusText,
    _library: Library,
}
#[cfg(target_os = "windows")]
impl Session {
    pub fn load(library_path: &Path, model_path: &Path, threads: u16) -> Result<Self, String> {
        let library = Library::load(library_path)?;
        unsafe {
            let size: unsafe extern "C" fn(i32) -> usize =
                library.get(b"transcribe_abi_struct_size\0")?;
            let align: unsafe extern "C" fn(i32) -> usize =
                library.get(b"transcribe_abi_struct_align\0")?;
            for (id, expected_size, expected_align) in [
                (
                    0,
                    std::mem::size_of::<LoadParams>(),
                    std::mem::align_of::<LoadParams>(),
                ),
                (
                    1,
                    std::mem::size_of::<SessionParams>(),
                    std::mem::align_of::<SessionParams>(),
                ),
                (
                    2,
                    std::mem::size_of::<RunParams>(),
                    std::mem::align_of::<RunParams>(),
                ),
                (
                    15,
                    std::mem::size_of::<BackendParams>(),
                    std::mem::align_of::<BackendParams>(),
                ),
            ] {
                if size(id) != expected_size || align(id) != expected_align {
                    return Err(
                        "transcribe.cpp ABI mismatch. Use the pinned v0.4.0 engine package.".into(),
                    );
                }
            }
            let version: unsafe extern "C" fn() -> *const c_char =
                library.get(b"transcribe_version\0")?;
            if CStr::from_ptr(version()).to_bytes() != b"0.4.0" {
                return Err("This ASR adapter requires transcribe.cpp v0.4.0".into());
            }
            let init_backend: unsafe extern "C" fn(*mut BackendParams) =
                library.get(b"transcribe_backend_init_params_init\0")?;
            let start_backend: unsafe extern "C" fn(*const BackendParams) -> i32 =
                library.get(b"transcribe_init_backends_ex\0")?;
            let init_load: unsafe extern "C" fn(*mut LoadParams) =
                library.get(b"transcribe_model_load_params_init\0")?;
            let init_session: unsafe extern "C" fn(*mut SessionParams) =
                library.get(b"transcribe_session_params_init\0")?;
            let open: Open = library.get(b"transcribe_open\0")?;
            let status: StatusText = library.get(b"transcribe_status_string\0")?;
            let directory = CString::new(
                library_path
                    .parent()
                    .ok_or("Missing ASR engine directory")?
                    .to_string_lossy()
                    .as_bytes(),
            )
            .map_err(|_| "Invalid ASR engine path")?;
            let mut backend: BackendParams = std::mem::zeroed();
            init_backend(&mut backend);
            backend.directory = directory.as_ptr();
            backend.allowed = 1;
            let result = start_backend(&backend);
            if result != 0 {
                return Err(format!(
                    "Initialize ASR CPU backend: {}",
                    CStr::from_ptr(status(result)).to_string_lossy()
                ));
            }
            let mut load: LoadParams = std::mem::zeroed();
            init_load(&mut load);
            load.backend = 1;
            let mut params: SessionParams = std::mem::zeroed();
            init_session(&mut params);
            params.threads = i32::from(threads);
            let model = CString::new(model_path.to_string_lossy().as_bytes())
                .map_err(|_| "Invalid ASR model path")?;
            let mut session = std::ptr::null_mut();
            let result = open(model.as_ptr(), &load, &params, &mut session);
            if result != 0 || session.is_null() {
                return Err(format!("Load ASR GGUF: {}. Choose a transcribe.cpp-supported ASR model, not a brain GGUF.",CStr::from_ptr(status(result)).to_string_lossy()));
            }
            Ok(Self {
                session,
                close: library.get(b"transcribe_session_free\0")?,
                run: library.get(b"transcribe_run\0")?,
                text: library.get(b"transcribe_full_text\0")?,
                run_init: library.get(b"transcribe_run_params_init\0")?,
                status,
                _library: library,
            })
        }
    }
    pub fn transcribe(&mut self, pcm: &[f32], language: Option<&str>) -> Result<String, String> {
        let language = language
            .map(CString::new)
            .transpose()
            .map_err(|_| "Invalid ASR language")?;
        unsafe {
            let mut params: RunParams = std::mem::zeroed();
            (self.run_init)(&mut params);
            params.language = language
                .as_ref()
                .map_or(std::ptr::null(), |language| language.as_ptr());
            let result = (self.run)(
                self.session,
                pcm.as_ptr(),
                i32::try_from(pcm.len()).map_err(|_| "ASR recording is too large")?,
                &params,
            );
            if result != 0 {
                return Err(format!(
                    "ASR inference: {}",
                    CStr::from_ptr((self.status)(result)).to_string_lossy()
                ));
            }
            let text = (self.text)(self.session);
            if text.is_null() {
                return Err("ASR returned no transcript".into());
            }
            Ok(CStr::from_ptr(text)
                .to_string_lossy()
                .chars()
                .take(16000)
                .collect::<String>()
                .trim()
                .into())
        }
    }
}
#[cfg(target_os = "windows")]
impl Drop for Session {
    fn drop(&mut self) {
        unsafe {
            (self.close)(self.session);
        }
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn abi_layout_matches_upstream_generated_windows_x64_bindings() {
        assert_eq!(std::mem::size_of::<RunParams>(), 104);
        assert_eq!(std::mem::offset_of!(RunParams, language), 32);
        assert_eq!(std::mem::size_of::<SessionParams>(), 24);
    }
}

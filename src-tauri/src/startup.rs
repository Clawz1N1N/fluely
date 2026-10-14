//! Release applications have no console. Keep a failed startup observable.
pub fn report(error: &str) {
    eprintln!("Fluely startup: {error}");
    let profile = std::env::var_os("FLUELY_DATA_DIR").map(std::path::PathBuf::from);
    if let Some(directory) = profile {
        let _ = std::fs::create_dir_all(&directory);
        let _ = std::fs::write(directory.join("startup-error.log"), error);
    }
    #[cfg(target_os = "windows")]
    {
        use windows::core::PCWSTR;
        use windows::Win32::UI::WindowsAndMessaging::{MessageBoxW, MB_ICONERROR, MB_OK};
        let message: Vec<u16> = format!("Fluely could not start.\n\n{error}").encode_utf16().chain(Some(0)).collect();
        let title: Vec<u16> = "Fluely".encode_utf16().chain(Some(0)).collect();
        unsafe { MessageBoxW(None, PCWSTR(message.as_ptr()), PCWSTR(title.as_ptr()), MB_OK | MB_ICONERROR); }
    }
}

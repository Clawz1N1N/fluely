#[cfg(target_os = "macos")]
use tauri::LogicalPosition;
use tauri::{App, AppHandle, Manager, Runtime, WebviewWindow, WebviewWindowBuilder};

/// The legacy webview is a hidden service host; shell windows own visible UI.
pub fn setup_service_window(app: &mut App) -> Result<(), Box<dyn std::error::Error>> {
    // Try different possible window labels
    let window = app
        .get_webview_window("main")
        .or_else(|| app.get_webview_window("pluely"))
        .or_else(|| {
            // Get the first window if specific labels don't work
            app.webview_windows().values().next().cloned()
        })
        .ok_or("No window found")?;

    window.hide()?;
    window.set_focusable(false)?;
    window.set_skip_taskbar(true)?;
    window.set_content_protected(true)?;

    Ok(())
}

#[tauri::command]
pub fn set_window_height(window: tauri::WebviewWindow, height: u32) -> Result<(), String> {
    use tauri::{LogicalSize, Size};

    // Simply set the window size with fixed width and new height
    let new_size = LogicalSize::new(600.0, height as f64);
    window
        .set_size(Size::Logical(new_size))
        .map_err(|e| format!("Failed to resize window: {}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn open_dashboard(app: tauri::AppHandle) -> Result<(), String> {
    show_dashboard_window(&app)?;
    use tauri::Emitter;
    app.emit_to("dashboard","dashboard-navigate","/settings").map_err(|e|e.to_string())
}

#[tauri::command]
pub async fn open_dashboard_page(app:tauri::AppHandle)->Result<(),String>{
    show_dashboard_window(&app)?;
    use tauri::Emitter;
    app.emit_to("dashboard","dashboard-navigate","/dashboard").map_err(|e|e.to_string())
}

#[tauri::command]
pub async fn toggle_dashboard(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(dashboard_window) = app.get_webview_window("dashboard") {
        match dashboard_window.is_visible() {
            Ok(true) => {
                // Window is visible, hide it
                dashboard_window
                    .hide()
                    .map_err(|e| format!("Failed to hide dashboard window: {}", e))?;
            }
            Ok(false) => {
                show_dashboard_window(&app)?;
            }
            Err(e) => {
                return Err(format!("Failed to check dashboard visibility: {}", e));
            }
        }
    } else {
        // Window doesn't exist, create and show it
        show_dashboard_window(&app)?;
    }

    Ok(())
}

#[tauri::command]
pub fn move_window(app: tauri::AppHandle, direction: String, step: i32) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        let current_pos = window
            .outer_position()
            .map_err(|e| format!("Failed to get window position: {}", e))?;

        let (new_x, new_y) = match direction.as_str() {
            "up" => (current_pos.x, current_pos.y - step),
            "down" => (current_pos.x, current_pos.y + step),
            "left" => (current_pos.x - step, current_pos.y),
            "right" => (current_pos.x + step, current_pos.y),
            _ => return Err(format!("Invalid direction: {}", direction)),
        };

        window
            .set_position(tauri::Position::Physical(tauri::PhysicalPosition {
                x: new_x,
                y: new_y,
            }))
            .map_err(|e| format!("Failed to set window position: {}", e))?;
    } else {
        return Err("Main window not found".to_string());
    }

    Ok(())
}

pub fn create_dashboard_window<R: Runtime>(
    app: &AppHandle<R>,
) -> Result<WebviewWindow<R>, tauri::Error> {
    let base_builder =
        WebviewWindowBuilder::new(app, "dashboard", tauri::WebviewUrl::App("/settings".into()));

    #[cfg(target_os = "macos")]
    let base_builder = base_builder
        .title("Fluely - Dashboard")
        .center()
        .decorations(true)
        .inner_size(1200.0, 800.0)
        .min_inner_size(800.0, 600.0)
        .hidden_title(true)
        .title_bar_style(tauri::TitleBarStyle::Overlay)
        .content_protected(true)
        .transparent(true)
        .skip_taskbar(true)
        .visible(false)
        .focused(false)
        .traffic_light_position(LogicalPosition::new(14.0, 18.0));

    #[cfg(not(target_os = "macos"))]
    let base_builder = base_builder
        .title("Fluely - Dashboard")
        .center()
        .decorations(true)
        .inner_size(800.0, 600.0)
        .min_inner_size(800.0, 600.0)
        .content_protected(true)
        .transparent(true)
        .skip_taskbar(true)
        .visible(false)
        .focused(false);

    let base_builder = if let Some(directory) = crate::app_paths::webview_dir().map_err(std::io::Error::other)? {
        base_builder.data_directory(directory)
    } else { base_builder };
    let window = base_builder.build()?;
    apply_dashboard_policy(&window).map_err(std::io::Error::other)?;

    // Set up close event handler - hide window instead of destroying it
    setup_dashboard_close_handler(&window);

    Ok(window)
}

/// Explicit native styles keep settings out of taskbar/Alt-Tab even when the
/// shell recreates its taskbar list. Do not make the editable dashboard topmost.
pub(crate) fn apply_dashboard_policy<R:Runtime>(window:&WebviewWindow<R>)->Result<(),String>{
    let target=window.clone();
    let (sender,receiver)=std::sync::mpsc::sync_channel(1);
    window.app_handle().run_on_main_thread(move||{let _=sender.send(apply_native_dashboard_policy(&target));}).map_err(|e|e.to_string())?;
    receiver.recv().map_err(|e|e.to_string())?
}
fn apply_native_dashboard_policy<R:Runtime>(window:&WebviewWindow<R>)->Result<(),String>{
    #[cfg(target_os="windows")]
    unsafe{
        use windows::Win32::Foundation::{HWND,SetLastError,GetLastError,ERROR_SUCCESS};
        use windows::Win32::UI::WindowsAndMessaging::{GetWindowLongPtrW,SetWindowLongPtrW,SetWindowPos,GWL_EXSTYLE,WS_EX_APPWINDOW,WS_EX_TOOLWINDOW,SWP_FRAMECHANGED,SWP_NOACTIVATE,SWP_NOZORDER,SWP_NOMOVE,SWP_NOSIZE};
        let hwnd=HWND(window.hwnd().map_err(|e|e.to_string())?.0 as _);
        let current=GetWindowLongPtrW(hwnd,GWL_EXSTYLE) as u32;
        let next=(current|WS_EX_TOOLWINDOW.0)&!WS_EX_APPWINDOW.0;
        if next!=current{
            SetLastError(ERROR_SUCCESS);
            if SetWindowLongPtrW(hwnd,GWL_EXSTYLE,next as isize)==0&&GetLastError()!=ERROR_SUCCESS{return Err(format!("Settings taskbar policy failed: {}",GetLastError().0));}
            SetWindowPos(hwnd,None,0,0,0,0,SWP_FRAMECHANGED|SWP_NOACTIVATE|SWP_NOZORDER|SWP_NOMOVE|SWP_NOSIZE).map_err(|e|e.to_string())?;
        }
    }
    Ok(())
}

/// Sets up the close event handler for the dashboard window
fn setup_dashboard_close_handler<R: Runtime>(window: &WebviewWindow<R>) {
    let window_clone = window.clone();
    window.on_window_event(move |event| {
        if let tauri::WindowEvent::CloseRequested { api, .. } = event {
            // Prevent the window from being destroyed
            api.prevent_close();
            // Hide the window instead
            if let Err(e) = window_clone.hide() {
                eprintln!("Failed to hide dashboard window on close: {}", e);
            }
        }
        if matches!(event,tauri::WindowEvent::Resized(_))&&window_clone.is_minimized().unwrap_or(false){
            let _=window_clone.hide();
        }
        if matches!(event,tauri::WindowEvent::Focused(true)){
            let target=window_clone.clone();
            tauri::async_runtime::spawn_blocking(move||{let _=apply_dashboard_policy(&target);});
        }
    });
}

/// Shows the dashboard window and brings it to focus
pub fn show_dashboard_window<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    if let Some(dashboard_window) = app.get_webview_window("dashboard") {
        dashboard_window.unminimize().map_err(|e|e.to_string())?;
        // Window exists, show and focus it
        dashboard_window
            .show()
            .map_err(|e| format!("Failed to show dashboard window: {}", e))?;
        dashboard_window
            .set_focus()
            .map_err(|e| format!("Failed to focus dashboard window: {}", e))?;
        apply_dashboard_policy(&dashboard_window)?;
    } else {
        // Window doesn't exist, create it and then show it
        let window = create_dashboard_window(app)
            .map_err(|e| format!("Failed to create dashboard window: {}", e))?;
        window
            .show()
            .map_err(|e| format!("Failed to show new dashboard window: {}", e))?;
        window
            .set_focus()
            .map_err(|e| format!("Failed to focus new dashboard window: {}", e))?;
        apply_dashboard_policy(&window)?;
    }
    Ok(())
}

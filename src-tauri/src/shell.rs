// Shell window manager for the custom overlay.
//
// Creates and manages the "shell" windows: side/top/bottom strips,
// individual buttons, and the central answer window.
//
// Windows start hidden and nonactivating. Their native policy is applied before
// showing UI, then reasserted by a watchdog. Only answer chat editing permits
// activation; focus loss restores nonactivation. Capture affinity is explicitly
// set to WDA_EXCLUDEFROMCAPTURE. Exclusive fullscreen remains an OS limit.
// Layout mutations and file replacements are serialized in managed Rust state.
// Per-monitor layout/DPI handling and transparent-margin hit testing are pending.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager, PhysicalPosition, Position, Runtime};

#[cfg(target_os = "windows")]
use windows::Win32::Foundation::{GetLastError, SetLastError, ERROR_SUCCESS, HWND};
#[cfg(target_os = "windows")]
use windows::Win32::UI::WindowsAndMessaging::{
    GetForegroundWindow, GetWindowDisplayAffinity, GetWindowLongPtrW, IsWindow,
    SetForegroundWindow, SetWindowDisplayAffinity, SetWindowLongPtrW, SetWindowPos, GWL_EXSTYLE,
    HWND_TOPMOST, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE, WDA_EXCLUDEFROMCAPTURE, WS_EX_NOACTIVATE,
    WS_EX_TOOLWINDOW, WS_EX_TOPMOST,
};

/// The UI mode of the shell.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum UiMode {
    SideStrips,
    TopBottomStrips,
    Buttons,
}

impl Default for UiMode {
    fn default() -> Self {
        UiMode::SideStrips
    }
}

impl UiMode {
    fn as_str(self) -> &'static str {
        match self {
            Self::SideStrips => "sidestrips",
            Self::TopBottomStrips => "topbottomstrips",
            Self::Buttons => "buttons",
        }
    }
}

/// Persisted position of a single shell window.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct WindowPlacement {
    pub x: i32,
    pub y: i32,
}

/// The whole persisted layout.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ShellLayout {
    pub ui_mode: UiMode,
    pub shimmer: bool,
    pub shimmer_speed: u32,
    pub answer_opacity: f64,
    pub placements: HashMap<String, WindowPlacement>,
}

impl ShellLayout {
    fn default_for_mode(mode: UiMode) -> Self {
        ShellLayout {
            ui_mode: mode,
            shimmer: true,
            shimmer_speed: 3,
            answer_opacity: 1.0,
            placements: HashMap::new(),
        }
    }
}

/// Shared state for the shell manager.
pub struct ShellState {
    pub layout: Mutex<ShellLayout>,
    pub watchdog_active: Arc<Mutex<bool>>,
    lifecycle: Mutex<()>,
    answer_editing: AtomicBool,
    #[cfg(target_os = "windows")]
    previous_foreground: Mutex<Option<isize>>,
}

impl Default for ShellState {
    fn default() -> Self {
        ShellState {
            layout: Mutex::new(ShellLayout::default_for_mode(UiMode::default())),
            watchdog_active: Arc::new(Mutex::new(false)),
            lifecycle: Mutex::new(()),
            answer_editing: AtomicBool::new(false),
            #[cfg(target_os = "windows")]
            previous_foreground: Mutex::new(None),
        }
    }
}

/// Path of the persisted layout file (app data dir / shell_layout.json).
fn layout_path<R: Runtime>(app: &AppHandle<R>) -> Option<std::path::PathBuf> {
    app.path()
        .app_data_dir()
        .ok()
        .map(|dir| dir.join("shell_layout.json"))
}

/// Load the persisted layout, or the default for the current mode.
pub fn load_layout<R: Runtime>(app: &AppHandle<R>) -> ShellLayout {
    let path = match layout_path(app) {
        Some(p) => p,
        None => return ShellLayout::default_for_mode(UiMode::default()),
    };
    match std::fs::read_to_string(&path) {
        Ok(content) => serde_json::from_str(&content)
            .unwrap_or_else(|_| ShellLayout::default_for_mode(UiMode::default())),
        Err(_) => ShellLayout::default_for_mode(UiMode::default()),
    }
}

/// Persist the layout to disk.
fn save_layout<R: Runtime>(app: &AppHandle<R>, layout: &ShellLayout) -> Result<(), String> {
    let path = layout_path(app).ok_or_else(|| "App data directory is unavailable".to_string())?;
    let bytes = serde_json::to_vec_pretty(layout).map_err(|e| format!("Layout JSON: {e}"))?;
    crate::shell_store::replace_file(&path, &bytes).map_err(|e| format!("Save shell layout: {e}"))
}

/// Mutations and atomic file replacements are serialized by the layout lock.
/// Only publish the new managed snapshot after its file replacement succeeds.
fn update_layout<R: Runtime>(
    app: &AppHandle<R>,
    update: impl FnOnce(&mut ShellLayout),
) -> Result<ShellLayout, String> {
    let state = app.state::<ShellState>();
    let mut current = state
        .layout
        .lock()
        .map_err(|e| format!("Layout lock: {e}"))?;
    let mut next = current.clone();
    update(&mut next);
    save_layout(app, &next)?;
    *current = next.clone();
    Ok(next)
}

/// Default strip/button geometry.
pub const STRIP_THICKNESS: u32 = 56;
pub const STRIP_LENGTH_RATIO: f64 = 0.6;
pub const BUTTON_SIZE: u32 = 44;

/// Create a shell window with the standard shell properties:
/// transparent, undecorated, always-on-top, no taskbar, content-protected,
/// non-focusable (does not steal focus from the app beneath).
pub fn create_shell_window<R: Runtime>(
    app: &AppHandle<R>,
    label: &str,
    route: &str,
    width: f64,
    height: f64,
    x: i32,
    y: i32,
) -> Result<tauri::WebviewWindow<R>, String> {
    let window = tauri::WebviewWindowBuilder::new(app, label, tauri::WebviewUrl::App(route.into()))
        .title(label)
        .inner_size(width, height)
        .position(x as f64, y as f64)
        .transparent(true)
        .always_on_top(true)
        .decorations(false)
        .skip_taskbar(true)
        .resizable(label == "answer")
        .minimizable(false)
        .maximizable(false)
        .closable(label == "answer")
        .accept_first_mouse(true)
        .shadow(false)
        .content_protected(true)
        .visible(false)
        .focused(false)
        .focusable(false)
        .visible_on_all_workspaces(true)
        .build()
        .map_err(|e| format!("Failed to create shell window {}: {}", label, e))?;

    // Apply native nonactivation/capture policy before the window is shown.
    if let Err(error) = apply_window_policy(app, label) {
        let _ = window.destroy();
        return Err(error);
    }
    if label == "answer" {
        setup_answer_window(app, &window);
    } else {
        window.show().map_err(|e| format!("Show {label}: {e}"))?;
    }

    Ok(window)
}
#[cfg(target_os = "windows")]
pub fn apply_windows_shell_style(hwnd: HWND, editing: bool) -> Result<(), String> {
    unsafe {
        // Read current extended style and add TOPMOST | TOOLWINDOW | NOACTIVATE.
        let current = GetWindowLongPtrW(hwnd, GWL_EXSTYLE) as u32;
        let base = current | WS_EX_TOPMOST.0 | WS_EX_TOOLWINDOW.0;
        let new = if editing {
            base & !WS_EX_NOACTIVATE.0
        } else {
            base | WS_EX_NOACTIVATE.0
        };
        if new != current {
            SetLastError(ERROR_SUCCESS);
            if SetWindowLongPtrW(hwnd, GWL_EXSTYLE, new as isize) == 0 {
                let error = GetLastError();
                if error != ERROR_SUCCESS {
                    return Err(format!("SetWindowLongPtrW failed: {}", error.0));
                }
            }
        }
        // Re-assert topmost without activating / moving / resizing.
        SetWindowPos(
            hwnd,
            Some(HWND_TOPMOST),
            0,
            0,
            0,
            0,
            SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE,
        )
        .map_err(|e| format!("SetWindowPos: {e}"))?;
        SetWindowDisplayAffinity(hwnd, WDA_EXCLUDEFROMCAPTURE)
            .map_err(|e| format!("SetWindowDisplayAffinity: {e}"))?;
    }
    Ok(())
}

/// Tauri/Wry executes the closure inline on the UI thread, including setup,
/// and queues it when called by a worker. Return the native result in both cases.
/// Native policy runs only here, without mutex guards across GUI calls.
fn run_shell_policy_on_main_thread<R: Runtime>(
    app: &AppHandle<R>,
    policy: impl FnOnce(&AppHandle<R>) -> Result<(), String> + Send + 'static,
) -> Result<(), String> {
    let app_handle = app.clone();
    let (sender, receiver) = std::sync::mpsc::sync_channel(1);
    app.run_on_main_thread(move || {
        let _ = sender.send(policy(&app_handle));
    })
    .map_err(|e| format!("Dispatch shell policy: {e}"))?;
    receiver
        .recv()
        .map_err(|e| format!("Receive shell policy result: {e}"))?
}

fn apply_window_policy<R: Runtime>(app: &AppHandle<R>, label: &str) -> Result<(), String> {
    let label = label.to_string();
    run_shell_policy_on_main_thread(app, move |app| {
        #[cfg(target_os = "windows")]
        {
            let hwnd = hwnd_for_label(app, &label).ok_or_else(|| format!("No HWND for {label}"))?;
            let state = app.state::<ShellState>();
            // Read on the UI thread so a queued watchdog task never restores
            // an editing policy captured before a focus transition.
            let editing = label == "answer" && state.answer_editing.load(Ordering::SeqCst);
            apply_windows_shell_style(hwnd, editing)?;
        }
        #[cfg(not(target_os = "windows"))]
        let _ = (app, label);
        Ok(())
    })
}

/// Report the real display affinity of a window (Windows).
/// Returns the WDA_* value, or an error string on other platforms.
#[cfg(target_os = "windows")]
pub fn get_display_affinity(hwnd: HWND) -> Result<u32, String> {
    unsafe {
        let mut affinity: u32 = 0;
        GetWindowDisplayAffinity(hwnd, &mut affinity)
            .map_err(|e| format!("GetWindowDisplayAffinity failed: {}", e))?;
        Ok(affinity)
    }
}

/// Find the native HWND for a Tauri window label (Windows).
#[cfg(target_os = "windows")]
pub fn hwnd_for_label<R: Runtime>(app: &AppHandle<R>, label: &str) -> Option<HWND> {
    use tauri::Manager;
    let window = app.get_webview_window(label)?;
    // Tauri exposes the native handle via window.hwnd() on Windows.
    let handle = window.hwnd().ok()?;
    Some(HWND(handle.0 as _))
}

/// Move a window, locking one axis.
/// `axis` = "x" (only x changes) or "y" (only y changes); any other value
/// moves freely.
pub fn move_window_locked<R: Runtime>(
    app: &AppHandle<R>,
    label: &str,
    new_x: i32,
    new_y: i32,
    axis: &str,
) -> Result<(), String> {
    let window = app
        .get_webview_window(label)
        .ok_or_else(|| format!("Window not found: {}", label))?;

    // Clamp to the monitor that contains the window.
    let (clamped_x, clamped_y) = clamp_to_monitor(app, label, new_x, new_y)?;

    let (final_x, final_y) = match axis {
        "x" => {
            let cur = window
                .outer_position()
                .unwrap_or(PhysicalPosition { x: 0, y: 0 });
            (clamped_x, cur.y)
        }
        "y" => {
            let cur = window
                .outer_position()
                .unwrap_or(PhysicalPosition { x: 0, y: 0 });
            (cur.x, clamped_y)
        }
        _ => (clamped_x, clamped_y),
    };

    window
        .set_position(Position::Physical(PhysicalPosition {
            x: final_x,
            y: final_y,
        }))
        .map_err(|e| format!("Failed to move window {}: {}", label, e))?;

    // Persist the placement.
    persist_placement(app, label, final_x, final_y)?;

    Ok(())
}

/// Clamp a position so the window stays within its monitor bounds.
fn clamp_to_monitor<R: Runtime>(
    app: &AppHandle<R>,
    label: &str,
    x: i32,
    y: i32,
) -> Result<(i32, i32), String> {
    let window = app
        .get_webview_window(label)
        .ok_or_else(|| format!("Window not found: {}", label))?;
    let size = window
        .outer_size()
        .map_err(|e| format!("Failed to get size: {}", e))?;

    // Find the monitor whose bounds contain the window center, else primary.
    let monitors = app
        .available_monitors()
        .map_err(|e| format!("Failed to list monitors: {}", e))?;
    let current = window
        .outer_position()
        .unwrap_or(PhysicalPosition { x: 0, y: 0 });
    let center_x = current.x + (size.width as i32) / 2;
    let center_y = current.y + (size.height as i32) / 2;

    let mut best: Option<(i32, i32, u32, u32)> = None;
    for monitor in &monitors {
        let msize = monitor.size();
        let mpos = monitor.position();
        let mx = mpos.x as i32;
        let my = mpos.y as i32;
        let mw = msize.width as i32;
        let mh = msize.height as i32;
        if center_x >= mx && center_x < mx + mw && center_y >= my && center_y < my + mh {
            best = Some((mx, my, msize.width, msize.height));
            break;
        }
    }
    let (mx, my, mw, mh) = match best {
        Some(v) => v,
        None => {
            // Fall back to the primary monitor.
            let primary = app
                .primary_monitor()
                .map_err(|e| format!("Failed to get primary monitor: {}", e))?
                .ok_or_else(|| "No primary monitor available".to_string())?;
            let psize = primary.size();
            let ppos = primary.position();
            (ppos.x as i32, ppos.y as i32, psize.width, psize.height)
        }
    };

    let clamped_x = x.clamp(mx, mx + mw as i32 - size.width as i32);
    let clamped_y = y.clamp(my, my + mh as i32 - size.height as i32);
    Ok((clamped_x, clamped_y))
}

/// Persist a single window placement.
fn persist_placement<R: Runtime>(
    app: &AppHandle<R>,
    label: &str,
    x: i32,
    y: i32,
) -> Result<(), String> {
    update_layout(app, |layout| {
        layout
            .placements
            .insert(label.to_string(), WindowPlacement { x, y });
    })?;
    Ok(())
}

/// Reassert native shell policy without revoking answer chat editing.
pub fn start_watchdog<R: Runtime>(app: &AppHandle<R>) {
    let state = app.state::<ShellState>();
    {
        let mut active = state.watchdog_active.lock().unwrap();
        if *active {
            return;
        }
        *active = true;
    }
    let app_handle = app.clone();
    let active_flag = state.watchdog_active.clone();
    std::thread::spawn(move || loop {
        if !*active_flag.lock().unwrap() {
            break;
        }
        // Re-assert topmost for every shell window.
        let labels: Vec<String> = app_handle
            .webview_windows()
            .keys()
            .filter(|l| l.starts_with("strip-") || l.starts_with("button-") || *l == "answer")
            .cloned()
            .collect();
        for label in &labels {
            if let Err(error) = apply_window_policy(&app_handle, label) {
                eprintln!("Shell policy for {label}: {error}");
            }
            // macOS/Linux currently use the creation flags as best effort.
        }
        std::thread::sleep(Duration::from_millis(1000));
    });
}

/// Stop the watchdog thread.
pub fn stop_watchdog<R: Runtime>(app: &AppHandle<R>) {
    let state = app.state::<ShellState>();
    let mut active = state.watchdog_active.lock().unwrap();
    *active = false;
}

/// Clear saved placements and raise existing windows. Rebuilding/reset geometry
/// is handled separately by reset_shell_layout.
pub fn reset_layout<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    update_layout(app, |layout| layout.placements.clear())?;

    // Raise every shell window to the top.
    let labels: Vec<String> = app
        .webview_windows()
        .keys()
        .filter(|l| l.starts_with("strip-") || l.starts_with("button-") || *l == "answer")
        .cloned()
        .collect();
    for label in &labels {
        if let Some(window) = app.get_webview_window(label) {
            window
                .set_always_on_top(true)
                .map_err(|e| format!("Raise {label}: {e}"))?;
            apply_window_policy(app, label)?;
        }
    }
    Ok(())
}

/// Tauri command: report display affinity for a window label (debug).
#[tauri::command]
pub fn get_window_display_affinity(app: AppHandle, label: String) -> Result<u32, String> {
    #[cfg(target_os = "windows")]
    {
        let hwnd =
            hwnd_for_label(&app, &label).ok_or_else(|| format!("No HWND for window {}", label))?;
        get_display_affinity(hwnd)
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = (app, label);
        Err("get_window_display_affinity is only supported on Windows".to_string())
    }
}

/// Tauri command: move a shell window with a locked axis.
#[tauri::command]
pub fn move_shell_window(
    app: AppHandle,
    label: String,
    x: i32,
    y: i32,
    axis: String,
) -> Result<(), String> {
    move_window_locked(&app, &label, x, y, &axis)
}

/// Tauri command: set the UI mode and rebuild the shell.
#[tauri::command]
pub async fn set_ui_mode(app: AppHandle, mode: String) -> Result<(), String> {
    let parsed = match mode.as_str() {
        "sidestrips" | "side" => UiMode::SideStrips,
        "topbottomstrips" | "top" => UiMode::TopBottomStrips,
        "buttons" => UiMode::Buttons,
        _ => return Err(format!("Unknown ui_mode: {}", mode)),
    };
    update_layout(&app, |layout| layout.ui_mode = parsed)?;
    rebuild_shell(&app)
}

/// Tauri command: get the current UI mode.
#[tauri::command]
pub fn get_ui_mode(app: AppHandle) -> Result<String, String> {
    let state = app.state::<ShellState>();
    let layout = state.layout.lock().unwrap();
    Ok(layout.ui_mode.as_str().to_string())
}

/// Tauri command: toggle shimmer.
#[tauri::command]
pub fn set_shimmer(app: AppHandle, enabled: bool) -> Result<(), String> {
    update_layout(&app, |layout| layout.shimmer = enabled)?;
    Ok(())
}

/// Tauri command: set the answer window opacity.
#[tauri::command]
pub fn set_answer_opacity(app: AppHandle, opacity: f64) -> Result<(), String> {
    let _ = (app, opacity);
    // Tauri 2 exposes no native WebviewWindow::set_opacity API. The answer
    // renderer must apply opacity before this setting can be advertised.
    Err("Answer opacity is not implemented yet".to_string())
}

/// Reset layout settings and recreate strips/buttons, retaining the answer.
#[tauri::command]
pub async fn reset_shell_layout(app: AppHandle) -> Result<(), String> {
    update_layout(&app, |layout| {
        *layout = ShellLayout::default_for_mode(layout.ui_mode)
    })?;
    // Re-create the shell from the (reset) layout.
    crate::shell::rebuild_shell(&app)?;
    Ok(())
}

// ---------------------------------------------------------------------------
fn close_strip_windows<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    let labels: Vec<String> = app
        .webview_windows()
        .keys()
        .filter(|l| l.starts_with("strip-") || l.starts_with("button-"))
        .cloned()
        .collect();
    for label in &labels {
        if let Some(window) = app.get_webview_window(label) {
            window
                .destroy()
                .map_err(|e| format!("Destroy {label}: {e}"))?;
        }
    }
    // destroy() queues a native event. Wait on this worker thread until labels
    // are released before reusing them; the persistent answer is never destroyed.
    let deadline = Instant::now() + Duration::from_secs(3);
    while labels
        .iter()
        .any(|label| app.get_webview_window(label).is_some())
    {
        if Instant::now() >= deadline {
            return Err("Timed out waiting for old shell windows to close".to_string());
        }
        std::thread::sleep(Duration::from_millis(10));
    }
    Ok(())
}

/// Rebuild strips/buttons for the current ui_mode, restoring
/// the persisted per-window placements (or sensible defaults).
pub fn rebuild_shell<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    let state = app.state::<ShellState>();
    let _lifecycle = state
        .lifecycle
        .lock()
        .map_err(|e| format!("Shell lifecycle: {e}"))?;
    close_strip_windows(app)?;
    let layout = state
        .layout
        .lock()
        .map_err(|e| format!("Layout lock: {e}"))?
        .clone();

    // Primary monitor geometry for defaults.
    let (mon_w, mon_h) = app
        .primary_monitor()
        .ok()
        .flatten()
        .map(|m| (m.size().width as i32, m.size().height as i32))
        .unwrap_or((1920, 1080));

    let placement = |label: &str| -> (i32, i32) {
        layout
            .placements
            .get(label)
            .map(|p| (p.x, p.y))
            .unwrap_or((0, 0))
    };

    let mk = |label: &str, route: &str, w: f64, h: f64, dx: i32, dy: i32| {
        let (px, py) = placement(label);
        let x = if px == 0 && py == 0 { dx } else { px };
        let y = if px == 0 && py == 0 { dy } else { py };
        create_shell_window(app, label, route, w, h, x, y).map(|_| ())
    };

    match layout.ui_mode {
        UiMode::SideStrips => {
            // Left and right tall strips. Default width 56, ~60% height.
            let sh = (mon_h as f64 * 0.6) as f64;
            mk("strip-left", "/shell/side-strip", 56.0, sh, 0, mon_h / 5)?;
            mk(
                "strip-right",
                "/shell/side-strip",
                56.0,
                sh,
                mon_w - 56,
                mon_h / 5,
            )?;
        }
        UiMode::TopBottomStrips => {
            let sw = (mon_w as f64 * 0.6) as f64;
            mk("strip-top", "/shell/top-strip", sw, 56.0, mon_w / 5, 0)?;
            mk(
                "strip-bottom",
                "/shell/top-strip",
                sw,
                56.0,
                mon_w / 5,
                mon_h - 56,
            )?;
        }
        UiMode::Buttons => {
            // One small window per action; default in a column on the left edge.
            let actions = [
                ("button-listen", "listen"),
                ("button-screenshot", "screenshot"),
                ("button-continuous", "continuous"),
                ("button-answer", "answer"),
                ("button-chat", "chat"),
                ("button-tts", "tts"),
                ("button-mode", "mode"),
                ("button-settings", "settings"),
            ];
            let mut yy = mon_h / 6;
            for (label, action) in actions.iter() {
                mk(
                    label,
                    &format!("/shell/button/{}", action),
                    44.0,
                    44.0,
                    16,
                    yy,
                )?;
                yy += 56;
            }
        }
    }
    ensure_answer_window(app)?;
    Ok(())
}

/// Initialize the shell: rebuild on startup and start the watchdog.
pub fn init_shell<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    let loaded = load_layout(app);
    let state = app.state::<ShellState>();
    *state
        .layout
        .lock()
        .map_err(|e| format!("Layout lock: {e}"))? = loaded;
    rebuild_shell(app)?;
    start_watchdog(app);
    Ok(())
}

/// Tauri command: get shell settings (shimmer, speed, opacity, mode).
#[tauri::command]
pub fn get_shell_settings(app: AppHandle) -> Result<serde_json::Value, String> {
    let state = app.state::<ShellState>();
    let layout = state.layout.lock().unwrap();
    Ok(serde_json::json!({
        "shimmer": layout.shimmer,
        "shimmer_speed": layout.shimmer_speed,
        "answer_opacity": layout.answer_opacity,
        "ui_mode": layout.ui_mode.as_str(),
    }))
}

fn setup_answer_window<R: Runtime>(app: &AppHandle<R>, window: &tauri::WebviewWindow<R>) {
    let app_handle = app.clone();
    window.on_window_event(move |event| match event {
        tauri::WindowEvent::CloseRequested { api, .. } => {
            api.prevent_close();
            if let Err(error) = hide_answer(&app_handle) {
                eprintln!("Hide answer: {error}");
            }
        }
        tauri::WindowEvent::Focused(false) => {
            if let Err(error) = set_editing_policy(&app_handle, false) {
                eprintln!("Restore answer nonactivation: {error}");
            }
        }
        _ => {}
    });
}

fn ensure_answer_window<R: Runtime>(app: &AppHandle<R>) -> Result<tauri::WebviewWindow<R>, String> {
    if let Some(window) = app.get_webview_window("answer") {
        return Ok(window);
    }
    let (mon_w, mon_h) = app
        .primary_monitor()
        .ok()
        .flatten()
        .map(|m| (m.size().width as i32, m.size().height as i32))
        .unwrap_or((1920, 1080));
    let placement = app
        .state::<ShellState>()
        .layout
        .lock()
        .map_err(|e| format!("Layout lock: {e}"))?
        .placements
        .get("answer")
        .cloned();
    let (x, y) = placement
        .map(|p| (p.x, p.y))
        .unwrap_or(((mon_w - 720) / 2, (mon_h - 480) / 2));
    create_shell_window(app, "answer", "/shell/answer", 720.0, 480.0, x, y)
}

fn set_editing_policy<R: Runtime>(app: &AppHandle<R>, editing: bool) -> Result<(), String> {
    run_shell_policy_on_main_thread(app, move |app| set_editing_policy_on_main_thread(app, editing))
}

fn set_editing_policy_on_main_thread<R: Runtime>(
    app: &AppHandle<R>,
    editing: bool,
) -> Result<(), String> {
    let window = app
        .get_webview_window("answer")
        .ok_or_else(|| "Answer window is unavailable".to_string())?;
    let state = app.state::<ShellState>();
    if !editing && !state.answer_editing.load(Ordering::SeqCst) {
        return Ok(());
    }
    #[cfg(target_os = "windows")]
    let hwnd = hwnd_for_label(app, "answer").ok_or_else(|| "No answer HWND".to_string())?;
    #[cfg(target_os = "windows")]
    if editing {
        let foreground = unsafe { GetForegroundWindow() };
        if foreground != hwnd && !foreground.0.is_null() {
            let mut previous = state
                .previous_foreground
                .lock()
                .map_err(|e| format!("Foreground lock: {e}"))?;
            *previous = Some(foreground.0 as isize);
        }
    }
    // Publish before focusability/style calls can emit focus callbacks. A
    // repeated focus-loss notification must observe nonediting and return.
    state.answer_editing.store(editing, Ordering::SeqCst);
    let policy_result = (|| {
        window
            .set_focusable(editing)
            .map_err(|e| format!("Answer focusability: {e}"))?;
        #[cfg(target_os = "windows")]
        apply_windows_shell_style(hwnd, editing)?;
        Ok::<(), String>(())
    })();
    if let Err(error) = policy_result {
        state.answer_editing.store(false, Ordering::SeqCst);
        let _ = window.set_focusable(false);
        let _ = apply_window_policy(app, "answer");
        return Err(error);
    }
    // Take the saved handle after native policy succeeds, then release its
    // guard before foreground/focus calls can emit callbacks.
    #[cfg(target_os = "windows")]
    let restore_previous = if editing {
        None
    } else {
        state
            .previous_foreground
            .lock()
            .map_err(|e| format!("Foreground lock: {e}"))?
            .take()
            .map(|handle| HWND(handle as _))
    };
    #[cfg(target_os = "windows")]
    if let Some(target) = restore_previous {
        unsafe {
            if GetForegroundWindow() == hwnd && IsWindow(Some(target)).as_bool() {
                if !SetForegroundWindow(target).as_bool() {
                    eprintln!("Windows did not restore the previous foreground window");
                }
            }
        }
    }
    if editing {
        if let Err(error) = window.set_focus() {
            let _ = set_editing_policy(app, false);
            return Err(format!("Focus answer: {error}"));
        }
    }
    Ok(())
}

fn hide_answer<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    set_editing_policy(app, false)?;
    app.get_webview_window("answer")
        .ok_or_else(|| "Answer window is unavailable".to_string())?
        .hide()
        .map_err(|e| format!("Hide answer: {e}"))
}

/// Enable activation only while the answer chat is being edited.
#[tauri::command]
pub fn set_answer_editing(app: AppHandle, editing: bool) -> Result<(), String> {
    set_editing_policy(&app, editing)
}

/// Keep answer/history/streaming state alive when closing the visible pane.
#[tauri::command]
pub fn close_answer_window(app: AppHandle) -> Result<(), String> {
    hide_answer(&app)
}

/// Tauri command: toggle the persistent answer window, creating it if needed.
#[tauri::command]
pub async fn toggle_answer_window(app: AppHandle) -> Result<(), String> {
    let state = app.state::<ShellState>();
    let _lifecycle = state
        .lifecycle
        .lock()
        .map_err(|e| format!("Shell lifecycle: {e}"))?;
    let window = ensure_answer_window(&app)?;
    if window
        .is_visible()
        .map_err(|e| format!("Answer visibility: {e}"))?
    {
        hide_answer(&app)?;
    } else {
        apply_window_policy(&app, "answer")?;
        window.show().map_err(|e| format!("Show answer: {e}"))?;
    }
    Ok(())
}

/// Tauri command: a typed question from the answer window chat.
/// (In Phase 3 this joins the single-request pipeline.)
#[tauri::command]
pub fn answer_ask(_question: String) -> Result<(), String> {
    Ok(())
}

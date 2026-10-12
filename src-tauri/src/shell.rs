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
// Geometry and saved placements use physical desktop coordinates per monitor.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, Position, Runtime, Size};

#[path = "shell_geometry.rs"]
mod geometry;
use geometry::{Bounds, Extent, Point};

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
    #[serde(default)]
    pub monitor: Option<String>,
}

/// The whole persisted layout.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ShellLayout {
    pub ui_mode: UiMode,
    pub shimmer: bool,
    pub shimmer_speed: u32,
    pub answer_opacity: f64,
    pub placements: HashMap<String, WindowPlacement>,
    #[serde(default)]
    pub placements_by_monitor: HashMap<String, HashMap<String, WindowPlacement>>,
}

impl ShellLayout {
    fn default_for_mode(mode: UiMode) -> Self {
        ShellLayout {
            ui_mode: mode,
            shimmer: true,
            shimmer_speed: 3,
            answer_opacity: 1.0,
            placements: HashMap::new(),
            placements_by_monitor: HashMap::new(),
        }
    }
}

/// Shared state for the shell manager.
pub struct ShellState {
    pub layout: Mutex<ShellLayout>,
    pub watchdog_active: Arc<Mutex<bool>>,
    lifecycle: Mutex<()>,
    answer_editing: AtomicBool,
    hidden: AtomicBool,
    answer_was_visible: AtomicBool,
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
            hidden: AtomicBool::new(false),
            answer_was_visible: AtomicBool::new(false),
            #[cfg(target_os = "windows")]
            previous_foreground: Mutex::new(None),
        }
    }
}

/// Path of the persisted layout file (app data dir / shell_layout.json).
fn layout_path<R: Runtime>(app: &AppHandle<R>) -> Option<std::path::PathBuf> {
    crate::app_paths::data_dir(app)
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

struct MonitorGeometry {
    key: String,
    bounds: Bounds,
    scale: f64,
}

fn monitor_geometry(monitor: &tauri::Monitor) -> MonitorGeometry {
    let position = monitor.position();
    let size = monitor.size();
    MonitorGeometry {
        key: format!("{}@{},{}", monitor.name().map(String::as_str).unwrap_or("display"), position.x, position.y),
        bounds: Bounds { x: position.x, y: position.y, width: size.width, height: size.height },
        scale: monitor.scale_factor(),
    }
}

fn desktop_monitors<R: Runtime>(app: &AppHandle<R>) -> Result<Vec<MonitorGeometry>, String> {
    let monitors = app.available_monitors().map_err(|e| format!("List monitors: {e}"))?;
    if monitors.is_empty() { return Err("No monitors available".into()); }
    Ok(monitors.iter().map(monitor_geometry).collect())
}

fn primary_geometry<R: Runtime>(app: &AppHandle<R>) -> Result<MonitorGeometry, String> {
    let monitor = app.primary_monitor().map_err(|e| format!("Primary monitor: {e}"))?
        .ok_or_else(|| "Primary monitor is unavailable".to_string())?;
    Ok(monitor_geometry(&monitor))
}

fn placement_for_monitor(layout: &ShellLayout, label: &str, monitor: &MonitorGeometry) -> Option<WindowPlacement> {
    layout.placements.get(label).cloned().or_else(|| {
        layout.placements_by_monitor.get(&monitor.key).and_then(|placements| placements.get(label)).cloned()
    })
}

fn is_shell_label(label: &str) -> bool {
    label == "answer" || label.starts_with("strip-") || label.starts_with("button-")
}

pub fn shell_axis(label: &str) -> &'static str {
    if matches!(label, "strip-left" | "strip-right") { "x" }
    else if matches!(label, "strip-top" | "strip-bottom") { "y" }
    else { "free" }
}

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
    let builder = tauri::WebviewWindowBuilder::new(app, label, tauri::WebviewUrl::App(route.into()));
    let builder = if let Some(directory) = crate::app_paths::webview_dir()? { builder.data_directory(directory) } else { builder };
    let window = builder
        .title(label)
        .inner_size(width, height)
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

    // Builder position/size arguments are logical. Place the hidden window
    // explicitly in the destination monitor's physical coordinate space.
    let monitors = desktop_monitors(app)?;
    let bounds: Vec<_> = monitors.iter().map(|monitor| monitor.bounds).collect();
    let monitor_index = geometry::choose_monitor(Point { x, y }, Extent { width: 1, height: 1 }, &bounds)
        .ok_or_else(|| "Destination monitor is unavailable".to_string())?;
    let size = geometry::physical_extent(width, height, monitors[monitor_index].scale);
    let position = geometry::clamp(Point { x, y }, size, monitors[monitor_index].bounds);
    window.set_position(Position::Physical(PhysicalPosition { x: position.x, y: position.y }))
        .map_err(|e| format!("Place {label}: {e}"))?;
    window.set_size(Size::Physical(PhysicalSize { width: size.width, height: size.height }))
        .map_err(|e| format!("Size {label}: {e}"))?;

    // Apply native nonactivation/capture policy before the window is shown.
    if let Err(error) = apply_window_policy(app, label) {
        let _ = window.destroy();
        return Err(error);
    }
    if label == "answer" {
        setup_answer_window(app, &window);
    } else if !app.state::<ShellState>().hidden.load(Ordering::SeqCst) {
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

    if !is_shell_label(label) { return Err(format!("Cannot move non-shell window: {label}")); }
    let current = window.outer_position().map_err(|e| format!("Position {label}: {e}"))?;
    let size = window.outer_size().map_err(|e| format!("Size {label}: {e}"))?;
    let monitors = desktop_monitors(app)?;
    let bounds: Vec<_> = monitors.iter().map(|monitor| monitor.bounds).collect();
    // Strip constraints are enforced natively, even if a caller asks for free movement.
    let axis = if shell_axis(label) == "free" { axis } else { shell_axis(label) };
    let (position, monitor_index) = geometry::constrained_move(
        Point { x: current.x, y: current.y }, Point { x: new_x, y: new_y },
        Extent { width: size.width, height: size.height }, &bounds, axis,
    ).ok_or_else(|| "Destination monitor is unavailable".to_string())?;
    let (final_x, final_y) = (position.x, position.y);

    window
        .set_position(Position::Physical(PhysicalPosition {
            x: final_x,
            y: final_y,
        }))
        .map_err(|e| format!("Failed to move window {}: {}", label, e))?;

    // Persist the placement.
    persist_placement(app, label, final_x, final_y, &monitors[monitor_index].key)?;

    Ok(())
}

/// Persist a single window placement.
fn persist_placement<R: Runtime>(
    app: &AppHandle<R>,
    label: &str,
    x: i32,
    y: i32,
    monitor: &str,
) -> Result<(), String> {
    update_layout(app, |layout| {
        let placement = WindowPlacement { x, y, monitor: Some(monitor.to_string()) };
        layout.placements.insert(label.to_string(), placement.clone());
        layout.placements_by_monitor.entry(monitor.to_string()).or_default()
            .insert(label.to_string(), placement);
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
    emit_shell_settings(&app)
}

#[tauri::command]
pub fn set_shimmer_speed(app: AppHandle, speed: u32) -> Result<(), String> {
    update_layout(&app, |layout| layout.shimmer_speed = speed.clamp(1, 10))?;
    emit_shell_settings(&app)
}

/// Tauri command: set the answer window opacity.
#[tauri::command]
pub fn set_answer_opacity(app: AppHandle, opacity: f64) -> Result<(), String> {
    if !opacity.is_finite() { return Err("Answer opacity must be finite".into()); }
    update_layout(&app, |layout| layout.answer_opacity = opacity.clamp(0.15, 1.0))?;
    emit_shell_settings(&app)
}

/// Reset layout settings and recreate strips/buttons, retaining the answer.
#[tauri::command]
pub async fn reset_shell_layout(app: AppHandle) -> Result<(), String> {
    update_layout(&app, |layout| {
        *layout = ShellLayout::default_for_mode(layout.ui_mode)
    })?;
    // Re-create the shell from the (reset) layout.
    crate::shell::rebuild_shell(&app)?;
    if let Some(answer) = app.get_webview_window("answer") {
        let monitor = primary_geometry(&app)?;
        let size = answer.outer_size().map_err(|e| e.to_string())?;
        let point = geometry::default_position("answer", monitor.bounds,
            Extent { width: size.width, height: size.height }, 0, monitor.scale);
        answer.set_position(PhysicalPosition::new(point.x, point.y)).map_err(|e| e.to_string())?;
    }
    emit_shell_settings(&app)?;
    Ok(())
}

/// Hide/show the complete overlay; never expose or activate the service window.
pub fn toggle_shell_visibility<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    let state = app.state::<ShellState>();
    let hide = !state.hidden.load(Ordering::SeqCst);
    if hide {
        let answer_visible = app.get_webview_window("answer")
            .map(|window| window.is_visible()).transpose().map_err(|e| e.to_string())?.unwrap_or(false);
        state.answer_was_visible.store(answer_visible, Ordering::SeqCst);
        if answer_visible { hide_answer(app)?; }
    }
    state.hidden.store(hide, Ordering::SeqCst);
    for (label, window) in app.webview_windows() {
        if !is_shell_label(&label) { continue; }
        if hide { window.hide().map_err(|e| e.to_string())?; }
        else if label != "answer" || state.answer_was_visible.load(Ordering::SeqCst) {
            apply_window_policy(app, &label)?;
            window.show().map_err(|e| e.to_string())?;
            if label == "answer" { app.emit("answer-visibility-changed", true).map_err(|e| e.to_string())?; }
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn find_shell_buttons(app: AppHandle) -> Result<(), String> {
    app.state::<ShellState>().hidden.store(false, Ordering::SeqCst);
    reset_shell_layout(app.clone()).await?;
    app.emit("shell-flash", ()).map_err(|e| e.to_string())
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

    let primary = primary_geometry(app)?;
    let monitors = desktop_monitors(app)?;
    let bounds: Vec<_> = monitors.iter().map(|monitor| monitor.bounds).collect();
    let mk = |label: &str, route: &str, w: f64, h: f64, button_index: usize| {
        let placement = placement_for_monitor(&layout, label, &primary);
        let monitor = placement.as_ref().and_then(|placement| {
            placement.monitor.as_ref().and_then(|key| monitors.iter().find(|monitor| &monitor.key == key))
                .or_else(|| geometry::choose_monitor(Point { x: placement.x, y: placement.y }, Extent { width: 1, height: 1 }, &bounds)
                    .map(|index| &monitors[index]))
        }).unwrap_or(&primary);
        let size = geometry::physical_extent(w, h, monitor.scale);
        let position = placement.map(|placement| geometry::clamp(Point { x: placement.x, y: placement.y }, size, monitor.bounds))
            .unwrap_or_else(|| geometry::default_position(label, monitor.bounds, size, button_index, monitor.scale));
        create_shell_window(app, label, route, w, h, position.x, position.y).map(|_| ())
    };

    match layout.ui_mode {
        UiMode::SideStrips => {
            // Left and right tall strips. Default width 56, ~60% height.
            let sh = primary.bounds.height as f64 * STRIP_LENGTH_RATIO / primary.scale;
            mk("strip-left", "/shell/side-strip", STRIP_THICKNESS as f64, sh, 0)?;
            mk(
                "strip-right",
                "/shell/side-strip",
                STRIP_THICKNESS as f64,
                sh,
                0,
            )?;
        }
        UiMode::TopBottomStrips => {
            let sw = primary.bounds.width as f64 * STRIP_LENGTH_RATIO / primary.scale;
            mk("strip-top", "/shell/top-strip", sw, STRIP_THICKNESS as f64, 0)?;
            mk(
                "strip-bottom",
                "/shell/top-strip",
                sw,
                STRIP_THICKNESS as f64,
                0,
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
            for (index, (label, action)) in actions.iter().enumerate() {
                mk(
                    label,
                    &format!("/shell/button/{}", action),
                    BUTTON_SIZE as f64,
                    BUTTON_SIZE as f64,
                    index,
                )?;
            }
        }
    }
    ensure_answer_window(app)?;
    emit_shell_settings(app)?;
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

fn emit_shell_settings<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    let state = app.state::<ShellState>();
    let snapshot = state.layout.lock().map_err(|e| format!("Layout lock: {e}"))?.clone();
    app.emit("shell-settings-changed", &snapshot).map_err(|e| e.to_string())
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
    let primary = primary_geometry(app)?;
    let placement = app
        .state::<ShellState>()
        .layout
        .lock()
        .map_err(|e| format!("Layout lock: {e}"))?
        .placements
        .get("answer")
        .cloned();
    let position = placement.map(|placement| Point { x: placement.x, y: placement.y })
        .unwrap_or_else(|| geometry::default_position("answer", primary.bounds,
            geometry::physical_extent(720.0, 480.0, primary.scale), 0, primary.scale));
    create_shell_window(app, "answer", "/shell/answer", 720.0, 480.0, position.x, position.y)
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
        .map_err(|e| format!("Hide answer: {e}"))?;
    app.emit("answer-visibility-changed", false).map_err(|e| e.to_string())
}

/// Open idempotently: stale UI state must never turn an open answer into a close.
#[tauri::command]
pub async fn show_answer_window(app: AppHandle) -> Result<(), String> {
    let state = app.state::<ShellState>();
    let _lifecycle = state.lifecycle.lock().map_err(|e| e.to_string())?;
    let window = ensure_answer_window(&app)?;
    if state.hidden.load(Ordering::SeqCst) { toggle_shell_visibility(&app)?; }
    apply_window_policy(&app, "answer")?;
    window.show().map_err(|e| format!("Show answer: {e}"))?;
    app.emit("answer-visibility-changed", true).map_err(|e| e.to_string())
}

/// Automatic responses respect the global hide switch.
#[tauri::command]
pub async fn present_answer_window(app: AppHandle) -> Result<bool, String> {
    if app.state::<ShellState>().hidden.load(Ordering::SeqCst) { return Ok(false); }
    show_answer_window(app).await?;
    Ok(true)
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
        app.emit("answer-visibility-changed", true).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Tauri command: a typed question from the answer window chat.
/// (In Phase 3 this joins the single-request pipeline.)
#[tauri::command]
pub fn answer_ask(app: AppHandle, question: String) -> Result<(), String> {
    crate::continuous::continuous_add_question(app, question, None, None)
}

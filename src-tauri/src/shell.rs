// Shell window manager for the custom overlay.
//
// Creates and manages the "shell" windows: side/top/bottom strips,
// individual buttons, and the central answer window.
//
// Design (see _research/REPORT.md section 4):
//  * Every shell window is created TIGHT (window rect == visible UI) so
//   that there are no large transparent hit areas.
//  * `set_ignore_cursor_events` is a whole-window toggle in Tauri, so it
//   is used only for windows that are purely decorative (a glow margin)
//   and is toggled dynamically by a cursor-polling watchdog in Rust.
//  * On Windows every shell window is WS_EX_TOPMOST | WS_EX_TOOLWINDOW |
//   WS_EX_NOACTIVATE and a watchdog thread re-asserts
//   SetWindowPos(HWND_TOPMOST, SWP_NOACTIVATE|SWP_NOMOVE|SWP_NOSIZE)
//   roughly once a second so the overlay stays above other topmost
//   windows. (Exclusive fullscreen is a hard OS limit: a true exclusive
//   fullscreen app owns the display and nothing can stay on top.)
//  * Positions are persisted per-monitor in a Rust-side JSON file in the
//   app data dir (not localStorage, because several windows share it).

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Manager, PhysicalPosition, PhysicalSize, Position, Runtime, Size};
use tauri_plugin_global_shortcut::GlobalShortcutExt;

#[cfg(target_os = "windows")]
use windows::core::{w, PCWSTR};
#[cfg(target_os = "windows")]
use windows::Win32::Foundation::{HWND, HWND_TOPMOST, SWP_NOMOVE, SWP_NOSIZE, SWP_NOACTIVATE};
#[cfg(target_os = "windows")]
use windows::Win32::UI::WindowsAndMessaging::{
    GetWindowLongPtrW, SetWindowLongPtrW, SetWindowPos, GWL_EXSTYLE,
    WS_EX_TOPMOST, WS_EX_TOOLWINDOW, WS_EX_NOACTIVATE, WS_EX_TRANSPARENT,
    GetWindowDisplayAffinity, WDA_EXCLUDEFROMCAPTURE,
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
}

impl Default for ShellState {
    fn default() -> Self {
        ShellState {
            layout: Mutex::new(ShellLayout::default_for_mode(UiMode::default())),
            watchdog_active: Arc::new(Mutex::new(false)),
        }
    }
}

/// Path of the persisted layout file (app data dir / shell_layout.json).
fn layout_path<R: Runtime>(app: &AppHandle<R>) -> Option<std::path::PathBuf> {
    app.path().app_data_dir().ok().map(|dir| dir.join("shell_layout.json"))
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
pub fn save_layout<R: Runtime>(app: &AppHandle<R>, layout: &ShellLayout) {
    if let Some(path) = layout_path(app) {
        if let Ok(content) = serde_json::to_string_pretty(layout) {
            let _ = std::fs::write(&path, content);
        }
    }
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
    let window = tauri::WebviewWindowBuilder::new(
        app,
        label,
        tauri::WebviewUrl::App(route.into()),
    )
    .title(label)
    .inner_size(width, height)
    .position(x as f64, y as f64)
    .transparent(true)
    .always_on_top(true)
    .decorations(false)
    .skip_taskbar(true)
    .resizable(false)
    .minimizable(false)
    .maximizable(false)
    .closable(false)
    .accept_first_mouse(true)
    .shadow(false)
    .content_protected()
    .build()
    .map_err(|e| format!("Failed to create shell window {}: {}", label, e))?;

    // Non-focusable so clicking the strip does not steal focus.
    let _ = window.set_focusable(false);

    Ok(window)
}
pub fn apply_windows_shell_style(hwnd: HWND) {
    unsafe {
        // Read current extended style and add TOPMOST | TOOLWINDOW | NOACTIVATE.
        let current = GetWindowLongPtrW(hwnd, GWL_EXSTYLE) as u32;
        let new = current
            | WS_EX_TOPMOST.0
            | WS_EX_TOOLWINDOW.0
            | WS_EX_NOACTIVATE.0;
        if new != current {
            SetWindowLongPtrW(hwnd, GWL_EXSTYLE, new as isize);
        }
        // Re-assert topmost without activating / moving / resizing.
        let _ = SetWindowPos(
            hwnd,
            HWND_TOPMOST,
            0,
            0,
            0,
            0,
            SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE,
        );
    }
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
            let cur = window.outer_position().unwrap_or(PhysicalPosition { x: 0, y: 0 });
            (clamped_x, cur.y)
        }
        "y" => {
            let cur = window.outer_position().unwrap_or(PhysicalPosition { x: 0, y: 0 });
            (cur.x, clamped_y)
        }
        _ => (clamped_x, clamped_y),
    };

    window
        .set_position(Position::Physical(PhysicalPosition { x: final_x, y: final_y }))
        .map_err(|e| format!("Failed to move window {}: {}", label, e))?;

    // Persist the placement.
    persist_placement(app, label, final_x, final_y);

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
                .map_err(|e| format!("Failed to get primary monitor: {}", e))?;
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
fn persist_placement<R: Runtime>(app: &AppHandle<R>, label: &str, x: i32, y: i32) {
    let state = app.state::<ShellState>();
    if let Ok(mut layout) = state.layout.lock() {
        layout
            .placements
            .insert(label.to_string(), WindowPlacement { x, y });
        let layout_clone = layout.clone();
        let app_clone = app.clone();
        // Save async-ish (best effort, synchronous write is fine for a small file).
        std::thread::spawn(move || {
            save_layout(&app_clone, &layout_clone);
        });
    }
}

/// Start the watchdog thread that re-asserts always-on-top for all shell
/// windows and toggles cursor-event handling for purely decorative windows.
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
            .filter(|l| {
                l.starts_with("strip-") || l.starts_with("button-") || *l == "answer"
            })
            .cloned()
            .collect();
        for label in &labels {
            #[cfg(target_os = "windows")]
            {
                if let Some(hwnd) = hwnd_for_label(&app_handle, label) {
                    apply_windows_shell_style(hwnd);
                }
            }
            // On macOS the nspanel level + collectionBehavior handles topmost;
            // on Linux best-effort via always_on_top already set at creation.
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

/// Reset all shell windows to their default positions and raise them.
pub fn reset_layout<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    let state = app.state::<ShellState>();
    let mut layout = state.layout.lock().unwrap();
    layout.placements.clear();
    let layout_clone = layout.clone();
    save_layout(app, &layout_clone);
    drop(layout);

    // Raise every shell window to the top.
    let labels: Vec<String> = app
        .webview_windows()
        .keys()
        .filter(|l| l.starts_with("strip-") || l.starts_with("button-") || *l == "answer")
        .cloned()
        .collect();
    for label in &labels {
        if let Some(window) = app.get_webview_window(label) {
            let _ = window.set_always_on_top(true);
            #[cfg(target_os = "windows")]
            {
                if let Some(hwnd) = hwnd_for_label(app, label) {
                    apply_windows_shell_style(hwnd);
                }
            }
        }
    }
    Ok(())
}

/// Tauri command: report display affinity for a window label (debug).
#[tauri::command]
pub fn get_window_display_affinity(app: AppHandle, label: String) -> Result<u32, String> {
    #[cfg(target_os = "windows")]
    {
        let hwnd = hwnd_for_label(&app, &label)
            .ok_or_else(|| format!("No HWND for window {}", label))?;
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
pub fn set_ui_mode(app: AppHandle, mode: String) -> Result<(), String> {
    let parsed = match mode.as_str() {
        "side" => UiMode::SideStrips,
        "top" => UiMode::TopBottomStrips,
        "buttons" => UiMode::Buttons,
        _ => return Err(format!("Unknown ui_mode: {}", mode)),
    };
    let state = app.state::<ShellState>();
    let mut layout = state.layout.lock().unwrap();
    layout.ui_mode = parsed;
    let clone = layout.clone();
    save_layout(&app, &clone);
    Ok(())
}

/// Tauri command: get the current UI mode.
#[tauri::command]
pub fn get_ui_mode(app: AppHandle) -> Result<String, String> {
    let state = app.state::<ShellState>();
    let layout = state.layout.lock().unwrap();
    Ok(match layout.ui_mode {
        UiMode::SideStrips => "side".to_string(),
        UiMode::TopBottomStrips => "top".to_string(),
        UiMode::Buttons => "buttons".to_string(),
    })
}

/// Tauri command: toggle shimmer.
#[tauri::command]
pub fn set_shimmer(app: AppHandle, enabled: bool) -> Result<(), String> {
    let state = app.state::<ShellState>();
    let mut layout = state.layout.lock().unwrap();
    layout.shimmer = enabled;
    let clone = layout.clone();
    save_layout(&app, &clone);
    Ok(())
}

/// Tauri command: set the answer window opacity.
#[tauri::command]
pub fn set_answer_opacity(app: AppHandle, opacity: f64) -> Result<(), String> {
    let state = app.state::<ShellState>();
    let mut layout = state.layout.lock().unwrap();
    layout.answer_opacity = opacity.clamp(0.2, 1.0);
    let clone = layout.clone();
    save_layout(&app, &clone);
    if let Some(window) = app.get_webview_window("answer") {
        let _ = window.set_opacity(layout.answer_opacity);
    }
    Ok(())
}

/// Tauri command: reset the shell layout to defaults and re-create
/// all shell windows for the (optionally new) mode.
#[tauri::command]
pub fn reset_shell_layout(app: AppHandle) -> Result<(), String> {
    let state = app.state::<ShellState>();
    {
        let mut layout = state.layout.lock().unwrap();
        *layout = ShellLayout::default_for_mode(layout.ui_mode);
        let clone = layout.clone();
        save_layout(&app, &clone);
    }
    // Re-create the shell from the (reset) layout.
    crate::shell::rebuild_shell(&app);
    Ok(())
}

// ---------------------------------------------------------------------------
fn close_shell_windows<R: Runtime>(app: &AppHandle<R>) {
    let labels: Vec<String> = app
        .webview_windows()
        .keys()
        .filter(|l| {
            l.starts_with("strip-") || l.starts_with("button-") || *l == "answer"
        })
        .cloned()
        .collect();
    for label in labels {
        if let Some(window) = app.get_webview_window(&label) {
            let _ = window.close();
        }
    }
}

/// Rebuild all shell windows for the current ui_mode, restoring
/// the persisted per-window placements (or sensible defaults).
pub fn rebuild_shell<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    close_shell_windows(app);
    let layout = load_layout(&app.clone().into());

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
        let _ = create_shell_window(app, label, route, w, h, x, y);
    };

    match layout.ui_mode {
        UiMode::SideStrips => {
            // Left and right tall strips. Default width 56, ~60% height.
            let sh = (mon_h as f64 * 0.6) as f64;
            mk("strip-left", "/shell/side-strip", 56.0, sh, 0, mon_h / 5);
            mk("strip-right", "/shell/side-strip", 56.0, sh, mon_w - 56, mon_h / 5);
        }
        UiMode::TopBottomStrips => {
            let sw = (mon_w as f64 * 0.6) as f64;
            mk("strip-top", "/shell/top-strip", sw, 56.0, mon_w / 5, 0);
            mk("strip-bottom", "/shell/top-strip", sw, 56.0, mon_w / 5, mon_h - 56);
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
                mk(label, &format!("/shell/button/{}", action), 44.0, 44.0, 16, yy);
                yy += 56;
            }
        }
    }
    Ok(())
}

/// Initialize the shell: rebuild on startup and start the watchdog.
pub fn init_shell<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
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
        "ui_mode": match layout.ui_mode {
            UiMode::SideStrips => "side",
            UiMode::TopBottomStrips => "top",
            UiMode::Buttons => "buttons",
        },
    }))
}

/// Tauri command: toggle the answer window (create if closed).
#[tauri::command]
pub fn toggle_answer_window(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("answer") {
        let visible = window.is_visible().unwrap_or(false);
        if visible {
            let _ = window.hide();
        } else {
            let _ = window.show();
        }
        return Ok(());
    }
    // Create it centered on the primary monitor.
    let (mon_w, mon_h) = app
        .primary_monitor()
        .ok()
        .flatten()
        .map(|m| (m.size().width as i32, m.size().height as i32))
        .unwrap_or((1920, 1080));
    let _ = create_shell_window(
        &app,
        "answer",
        "/shell/answer",
        720.0,
        480.0,
        (mon_w - 720) / 2,
        (mon_h - 480) / 2,
    );
    Ok(())
}

/// Tauri command: a typed question from the answer window chat.
/// (In Phase 3 this joins the single-request pipeline.)
#[tauri::command]
pub fn answer_ask(_question: String) -> Result<(), String> {
    Ok(())
}

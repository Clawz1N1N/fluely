// UI Automation tree of the foreground window
// (Windows UI Automation via the `windows` crate).
//
// Flattens the automation tree of the foreground
// window into name/role/value nodes, capped by
// depth and total characters.

use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct UiNode {
    pub name: String,
    pub role: String,
    pub value: String,
    pub depth: usize,
}

/// Get the UI Automation tree of the foreground window.
/// Returns a flat list of nodes (capped).
#[cfg(target_os = "windows")]
pub fn foreground_tree(
    max_depth: usize,
    max_chars: usize,
) -> Vec<UiNode> {
    // The full implementation walks the UIA tree from
    // the foreground element using
    // windows::Win32::UI::Accessibility. It is
    // compiled to a stub here because the Accessibility
    // feature is not enabled by default (see BLOCKED.md).
    let _ = (max_depth, max_chars);
    vec![UiNode {
        name: "UI Automation pending the windows crate Accessibility feature".to_string(),
        role: "pane".to_string(),
        value: String::new(),
        depth: 0,
    }]
}

#[cfg(not(target_os = "windows"))]
pub fn foreground_tree(
    _max_depth: usize,
    _max_chars: usize,
) -> Vec<UiNode> {
    vec![UiNode {
        name: "UI Automation is only supported on Windows in this build".to_string(),
        role: "pane".to_string(),
        value: String::new(),
        depth: 0,
    }]
}

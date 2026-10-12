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
) -> Result<Vec<UiNode>, String> {
    std::thread::spawn(move || unsafe {
        use windows::core::Interface;
        use windows::Win32::System::Com::{CoInitializeEx, CoUninitialize, CoCreateInstance, COINIT_MULTITHREADED, CLSCTX_INPROC_SERVER};
        use windows::Win32::UI::Accessibility::{CUIAutomation8, IUIAutomation, IUIAutomation2,
            IUIAutomationElement, IUIAutomationTreeWalker, IUIAutomationValuePattern, UIA_ValuePatternId};
        use windows::Win32::UI::WindowsAndMessaging::GetForegroundWindow;
        CoInitializeEx(None, COINIT_MULTITHREADED).ok().map_err(|e| format!("Initialize UI Automation: {e}"))?;
        struct Apartment;
        impl Drop for Apartment { fn drop(&mut self) { unsafe { CoUninitialize() }; } }
        let _apartment = Apartment;
        let automation: IUIAutomation = CoCreateInstance(&CUIAutomation8, None, CLSCTX_INPROC_SERVER)
            .map_err(|e| format!("Create UI Automation: {e}"))?;
        if let Ok(timeouts) = automation.cast::<IUIAutomation2>() {
            let _ = timeouts.SetConnectionTimeout(500);
            let _ = timeouts.SetTransactionTimeout(500);
        }
        let hwnd = GetForegroundWindow();
        if hwnd.0.is_null() { return Ok(Vec::new()); }
        let root = automation.ElementFromHandle(hwnd).map_err(|e| format!("Foreground UI: {e}"))?;
        let walker = automation.ControlViewWalker().map_err(|e| format!("UI tree walker: {e}"))?;
        let mut nodes = Vec::new();
        let mut budget = max_chars.min(32000);
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(3);
        fn take(value: String, budget: &mut usize) -> String {
            let result: String = value.chars().take(*budget).collect();
            *budget = budget.saturating_sub(result.chars().count()); result
        }
        unsafe fn walk(element: IUIAutomationElement, walker: &IUIAutomationTreeWalker, depth: usize,
            max_depth: usize, budget: &mut usize, nodes: &mut Vec<UiNode>, deadline: std::time::Instant) {
            if *budget == 0 || nodes.len() >= 512 || std::time::Instant::now() >= deadline { return; }
            // Password contents never become context for a model.
            let password = element.CurrentIsPassword().map(|value| value.as_bool()).unwrap_or(true);
            if !password {
                let name = take(element.CurrentName().map(|value| value.to_string()).unwrap_or_default(), budget);
                let role = take(element.CurrentControlType().map(|value| format!("control:{}", value.0)).unwrap_or_default(), budget);
                let value = take(element.GetCurrentPatternAs::<IUIAutomationValuePattern>(UIA_ValuePatternId)
                    .and_then(|pattern| pattern.CurrentValue()).map(|value| value.to_string()).unwrap_or_default(), budget);
                nodes.push(UiNode { name, role, value, depth });
            }
            if depth >= max_depth || password { return; }
            let mut child = walker.GetFirstChildElement(&element).ok();
            while let Some(current) = child {
                if *budget == 0 || nodes.len() >= 512 || std::time::Instant::now() >= deadline { break; }
                walk(current.clone(), walker, depth + 1, max_depth, budget, nodes, deadline);
                child = walker.GetNextSiblingElement(&current).ok();
            }
        }
        walk(root, &walker, 0, max_depth.min(16), &mut budget, &mut nodes, deadline);
        Ok(nodes)
    }).join().map_err(|_| "UI Automation worker failed".to_string())?
}

#[cfg(not(target_os = "windows"))]
pub fn foreground_tree(
    _max_depth: usize,
    _max_chars: usize,
) -> Result<Vec<UiNode>, String> {
    Err("UI Automation is only supported on Windows in this build".into())
}

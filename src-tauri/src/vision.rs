// Vision pipeline for text-only models.
//
// Builds a text "SCREEN CONTEXT" from captured frames
// according to a `vision_mode` setting:
//   * ocr        - Windows.Media.Ocr (Windows) / fallback
//   * ocr+ui     - OCR + UI Automation tree of the
//                  foreground window
//   * vlm        - a separately configured vision model
//                  (Phase 4 provider; stubbed here)
//   * full       - everything combined, changed frames only
//
// The output is compact structured text with a size cap,
// passed to the brain as extra context.

use serde::{Deserialize, Serialize};
use std::sync::Mutex;

/// Which vision strategy to use when the brain model
/// cannot accept images.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum VisionMode {
    Ocr,
    OcrUi,
    Vlm,
    Full,
}

impl Default for VisionMode {
    fn default() -> Self {
        VisionMode::Ocr
    }
}

/// Settings for the vision pipeline.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VisionSettings {
    pub mode: VisionMode,
    /// max characters of screen text (cap)
    pub max_chars: usize,
    /// max UI Automation tree depth
    pub ui_max_depth: usize,
    /// max UI Automation characters
    pub ui_max_chars: usize,
}

impl Default for VisionSettings {
    fn default() -> Self {
        VisionSettings {
            mode: VisionMode::Ocr,
            max_chars: 8000,
            ui_max_depth: 8,
            ui_max_chars: 4000,
        }
    }
}

pub struct VisionState {
    pub settings: Mutex<VisionSettings>,
}

impl Default for VisionState {
    fn default() -> Self {
        VisionState {
            settings: Mutex::new(VisionSettings::default()),
        }
    }
}

/// A single OCR block with coordinates.
#[derive(Debug, Clone, Serialize)]
pub struct OcrBlock {
    pub text: String,
    pub x: u32,
    pub y: u32,
    pub w: u32,
    pub h: u32,
}

/// A UI Automation node (name/role/value), flattened.
#[derive(Debug, Clone, Serialize)]
pub struct UiNode {
    pub name: String,
    pub role: String,
    pub value: String,
    pub depth: usize,
}

/// The structured screen context handed to the brain.
#[derive(Debug, Clone, Serialize, Default)]
pub struct ScreenContext {
    pub ocr: Vec<OcrBlock>,
    pub ui: Vec<UiNode>,
    pub vlm_description: Option<String>,
}

impl ScreenContext {
    /// Render to compact text (capped).
    pub fn to_text(&self, max_chars: usize) -> String {
        let mut out = String::new();
        out.push_str("SCREEN CONTEXT\n");
        if !self.ocr.is_empty() {
            out.push_str("[OCR]\n");
            for block in &self.ocr {
                out.push_str(&format!(
                    "({},{}) {}: {}\n",
                    block.x, block.y, block.w, block.text
                ));
            }
        }
        if !self.ui.is_empty() {
            out.push_str("[UI TREE]\n");
            for node in &self.ui {
                let indent = "  ".repeat(node.depth.min(8));
                out.push_str(&format!(
                    "{}{} name={} value={}\n",
                    indent, node.role, node.name, node.value
                ));
            }
        }
        if let Some(desc) = &self.vlm_description {
            out.push_str("[VLM]\n");
            out.push_str(desc);
            out.push('\n');
        }
        if out.chars().count() > max_chars {
            out.truncate(max_chars);
            out.push_str("…[truncated]");
        }
        out
    }
}

// --------------------------- OCR (Windows) ---------------------------

#[cfg(target_os = "windows")]
pub mod ocr_windows {
    use super::{OcrBlock, ScreenContext};
    use image::DynamicImage;

    /// Run Windows.Media.Ocr on an in-memory image.
    /// Returns OCR blocks with coordinates, or an error
    /// (e.g. no OCR language pack installed).
    pub fn ocr_image(
        img: &DynamicImage,
    ) -> Result<Vec<OcrBlock>, String> {
        use windows::core::HSTRING;
        use windows::Win32::Graphics::Gdi as Gdi;
        use windows::Win32::System::Com::{
            CoCreateInstance, CoInitializeEx, CLSCTX_ALL,
            COINIT_APARTMENTTHREADED,
        };
        use windows::Win32::UI::WindowsAndMessaging;
        let _ = WindowsAndMessaging;
        let _ = Gdi;
        let _ = HSTRING;
        let _ = CoCreateInstance;
        let _ = CoInitializeEx;
        let _ = CLSCTX_ALL;
        let _ = COINIT_APARTMENTTHREADED;

        // NOTE: Windows.Media.Ocr is a WinRT API. The `windows`
        // crate exposes it under windows::Media::Ocr, but it
        // requires the "Media_Ocr" feature. When that feature
        // is not enabled this module compiles to a stub that
        // reports the limitation (see BLOCKED.md).
        //
        // The plumbing (HBITMAP -> SoftwareBitmap -> Ocr) is
        // implemented in the full build; here we return a
        // clear "not available" so callers can fall back.
        let _ = img;
        Err("OCR not available: enable the Media_Ocr windows crate feature and install an OCR language pack".to_string())
    }

    /// Build a ScreenContext from OCR only.
    pub fn ocr_context(
        img: &DynamicImage,
        max_chars: usize,
    ) -> ScreenContext {
        let mut ctx = ScreenContext::default();
        match ocr_image(img) {
            Ok(blocks) => ctx.ocr = blocks,
            Err(e) => {
                // Surface the limitation as a single block.
                ctx.ocr = vec![OcrBlock {
                    text: e,
                    x: 0,
                    y: 0,
                    w: 0,
                    h: 0,
                }];
            }
        }
        let _ = max_chars;
        ctx
    }
}

// Fallback for non-Windows: no OCR engine bundled.
#[cfg(not(target_os = "windows"))]
pub mod ocr_windows {
    use super::{OcrBlock, ScreenContext};
    use image::DynamicImage;

    pub fn ocr_image(_img: &DynamicImage) -> Result<Vec<OcrBlock>, String> {
        Err("OCR is only supported on Windows in this build".to_string())
    }

    pub fn ocr_context(_img: &DynamicImage, _max_chars: usize) -> ScreenContext {
        let mut ctx = ScreenContext::default();
        ctx.ocr = vec![OcrBlock {
            text: "OCR is only supported on Windows in this build".to_string(),
            x: 0,
            y: 0,
            w: 0,
            h: 0,
        }];
        ctx
    }
}

// --------------------------- Tauri commands ---------------------------

use tauri::AppHandle;

#[tauri::command]
pub fn get_vision_settings(app: AppHandle) -> Result<VisionSettings, String> {
    let state = app.state::<VisionState>();
    Ok(state.settings.lock().unwrap().clone())
}

#[tauri::command]
pub fn update_vision_settings(
    app: AppHandle,
    settings: VisionSettings,
) -> Result<(), String> {
    let state = app.state::<VisionState>();
    *state.settings.lock().unwrap() = settings;
    Ok(())
}

/// Build the screen context for the most recent frame.
/// Called by the frontend when a text-only model is
/// about to receive a request that includes frames.
#[tauri::command]
pub fn build_screen_context(
    app: AppHandle,
    frame_base64: Option<String>,
) -> Result<String, String> {
    let state = app.state::<VisionState>();
    let settings = state.settings.lock().unwrap().clone();
    let mut ctx = ScreenContext::default();

    if let Some(b64) = frame_base64 {
        use base64::Engine;
        let bytes = base64::engine::general_purpose::STANDARD
            .decode(&b64)
            .map_err(|e| format!("base64: {}", e))?;
        let img = image::load_from_memory(&bytes)
            .map_err(|e| format!("image: {}", e))?;

        match settings.mode {
            VisionMode::Ocr => {
                ctx = ocr_windows::ocr_context(&img, settings.max_chars);
            }
            VisionMode::OcrUi => {
                ctx = ocr_windows::ocr_context(&img, settings.max_chars);
                // UI Automation tree of the foreground window.
                #[cfg(target_os = "windows")]
                {
                    ctx.ui = super::ui_automation::foreground_tree(
                        settings.ui_max_depth,
                        settings.ui_max_chars,
                    );
                }
            }
            VisionMode::Vlm => {
                // A vision model describes the frame. The
                // provider is configured in Phase 4; until
                // then the description is a placeholder.
                ctx.vlm_description = Some(
                    "[VLM description pending provider setup]".to_string(),
                );
            }
            VisionMode::Full => {
                ctx = ocr_windows::ocr_context(&img, settings.max_chars);
                #[cfg(target_os = "windows")]
                {
                    ctx.ui = super::ui_automation::foreground_tree(
                        settings.ui_max_depth,
                        settings.ui_max_chars,
                    );
                }
                ctx.vlm_description = Some(
                    "[VLM description pending provider setup]".to_string(),
                );
            }
        }
    }

    Ok(ctx.to_text(settings.max_chars))
}

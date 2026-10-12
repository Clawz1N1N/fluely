// Vision pipeline for text-only models.
//
// Builds a text "SCREEN CONTEXT" from captured frames
// according to a `vision_mode` setting:
//   * ocr        - Windows.Media.Ocr (Windows) / fallback
//   * ocr+ui     - OCR + UI Automation tree of the
//                  foreground window
//   * vlm        - a separately configured vision model
//                  (independent frontend provider registry)
//   * full       - everything combined, changed frames only
//
// The output is compact structured text with a size cap,
// passed to the brain as extra context.

use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, Ordering};

/// Which vision strategy to use when the brain model
/// cannot accept images.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum VisionMode {
    Ocr,
    #[serde(rename = "ocr+ui", alias = "ocrui")]
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
#[serde(default)]
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
    loaded: AtomicBool,
}

impl Default for VisionState {
    fn default() -> Self {
        VisionState {
            settings: Mutex::new(VisionSettings::default()),
            loaded: AtomicBool::new(false),
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
pub use crate::ui_automation::UiNode;

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
            let suffix = "…[truncated]";
            let suffix_len = suffix.chars().count();
            out = out.chars().take(max_chars.saturating_sub(suffix_len)).collect();
            out.extend(suffix.chars().take(max_chars));
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
        // Own apartment lifetime; async WinRT waits never run on the GUI thread.
        let img = img.clone();
        std::thread::spawn(move || {
            use windows::{Graphics::Imaging::{SoftwareBitmap, BitmapPixelFormat},
                Storage::Streams::DataWriter, Media::Ocr::OcrEngine,
                Win32::System::WinRT::{RoInitialize, RoUninitialize, RO_INIT_MULTITHREADED}};
            unsafe { RoInitialize(RO_INIT_MULTITHREADED) }.map_err(|e| format!("Initialize OCR: {e}"))?;
            struct Apartment;
            impl Drop for Apartment { fn drop(&mut self) { unsafe { RoUninitialize() }; } }
            let _apartment = Apartment;
            let recognize = || -> windows::core::Result<Vec<OcrBlock>> {
                let max = OcrEngine::MaxImageDimension()?;
                let img = if img.width().max(img.height()) > max { img.thumbnail(max, max) } else { img };
                let pixels = img.to_luma8();
                let writer = DataWriter::new()?;
                writer.WriteBytes(pixels.as_raw())?;
                let bitmap = SoftwareBitmap::CreateCopyFromBuffer(&writer.DetachBuffer()?,
                    BitmapPixelFormat::Gray8, pixels.width() as i32, pixels.height() as i32)?;
                let engine = OcrEngine::TryCreateFromUserProfileLanguages()?;
                let recognized = engine.RecognizeAsync(&bitmap)?.get()?;
                let lines = recognized.Lines()?;
                let mut blocks = Vec::new();
                for index in 0..lines.Size()? {
                    let words = lines.GetAt(index)?.Words()?;
                    for word_index in 0..words.Size()? {
                        let word = words.GetAt(word_index)?;
                        let rect = word.BoundingRect()?;
                        blocks.push(OcrBlock { text: word.Text()?.to_string(), x: rect.X.max(0.0) as u32,
                            y: rect.Y.max(0.0) as u32, w: rect.Width.max(0.0) as u32, h: rect.Height.max(0.0) as u32 });
                    }
                }
                Ok(blocks)
            };
            recognize().map_err(|e| format!("Windows OCR: {e}. Install an OCR language pack in Windows Settings if none is available."))
        }).join().map_err(|_| "OCR worker failed".to_string())?
    }

    /// Build a ScreenContext from OCR only.
    pub fn ocr_context(
        img: &DynamicImage,
        max_chars: usize,
    ) -> Result<ScreenContext, String> {
        let mut ctx = ScreenContext::default();
        ctx.ocr = ocr_image(img)?;
        let _ = max_chars;
        Ok(ctx)
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

    pub fn ocr_context(_img: &DynamicImage, _max_chars: usize) -> Result<ScreenContext, String> {
        Err("OCR is only supported on Windows in this build".into())
    }
}

// --------------------------- Tauri commands ---------------------------

use tauri::{AppHandle, Manager};

#[tauri::command]
pub fn get_vision_settings(app: AppHandle) -> Result<VisionSettings, String> {
    let state = app.state::<VisionState>();
    let mut settings = state.settings.lock().map_err(|e| e.to_string())?;
    if !state.loaded.load(Ordering::SeqCst) {
        let path = crate::app_paths::data_dir(&app)?.join("vision_settings.json");
        match std::fs::read(path) {
            Ok(bytes) => *settings = serde_json::from_slice(&bytes).map_err(|e| format!("Load vision settings: {e}"))?,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {},
            Err(e) => return Err(format!("Read vision settings: {e}")),
        }
        state.loaded.store(true, Ordering::SeqCst);
    }
    Ok(settings.clone())
}

#[tauri::command]
pub fn update_vision_settings(
    app: AppHandle,
    mut settings: VisionSettings,
) -> Result<(), String> {
    let state = app.state::<VisionState>();
    settings.max_chars = settings.max_chars.clamp(64, 32000);
    settings.ui_max_chars = settings.ui_max_chars.clamp(64, 16000);
    settings.ui_max_depth = settings.ui_max_depth.min(16);
    let mut current = state.settings.lock().map_err(|e| e.to_string())?;
    let path = crate::app_paths::data_dir(&app)?.join("vision_settings.json");
    crate::shell_store::replace_file(&path, &serde_json::to_vec_pretty(&settings).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;
    *current = settings;
    state.loaded.store(true, Ordering::SeqCst);
    Ok(())
}

/// Build the screen context for the most recent frame.
/// Called by the frontend when a text-only model is
/// about to receive a request that includes frames.
#[tauri::command]
pub async fn build_screen_context(
    app: AppHandle,
    frame_base64: Option<String>,
) -> Result<String, String> {
    let settings = get_vision_settings(app)?;
    tauri::async_runtime::spawn_blocking(move || {
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
                ctx = ocr_windows::ocr_context(&img, settings.max_chars)?;
            }
            VisionMode::OcrUi => {
                ctx = ocr_windows::ocr_context(&img, settings.max_chars)?;
                // UI Automation tree of the foreground window.
                #[cfg(target_os = "windows")]
                {
                    ctx.ui = super::ui_automation::foreground_tree(
                        settings.ui_max_depth,
                        settings.ui_max_chars,
                    )?;
                }
            }
            VisionMode::Vlm => {
                // The frontend runs the independently configured vision model;
                // this native command provides only OCR/UI Automation context.
                return Err("VLM context is built by the configured frontend vision provider".into());
            }
            VisionMode::Full => {
                ctx = ocr_windows::ocr_context(&img, settings.max_chars)?;
                #[cfg(target_os = "windows")]
                {
                    ctx.ui = super::ui_automation::foreground_tree(
                        settings.ui_max_depth,
                        settings.ui_max_chars,
                    )?;
                }
            }
        }
    }

    Ok(ctx.to_text(settings.max_chars))
    }).await.map_err(|e| format!("Vision worker: {e}"))?
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn screen_context_is_unicode_safe_and_obeys_every_character_budget() {
        let context = ScreenContext { ocr: vec![OcrBlock { text: "Україна 🌻 текст".into(), x: 0, y: 0, w: 1, h: 1 }], ..Default::default() };
        for budget in 0..80 {
            let text = context.to_text(budget);
            assert!(text.chars().count() <= budget, "budget {budget}: {text}");
        }
        assert!(context.to_text(80).contains("Україна 🌻 текст"));
    }
}

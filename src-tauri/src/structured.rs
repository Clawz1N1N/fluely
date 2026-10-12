use serde::Serialize;

/// Serializable IPC output, backed by the dependency-free production parser.
#[derive(Debug, Clone, Serialize, Default, PartialEq)]
pub struct StructuredOutput {
    pub main: String,
    pub side: String,
    pub speak: String,
}

impl From<crate::structured_core::StructuredOutput> for StructuredOutput {
    fn from(output: crate::structured_core::StructuredOutput) -> Self {
        Self {
            main: output.main,
            side: output.side,
            speak: output.speak,
        }
    }
}

#[tauri::command]
pub fn parse_structured(text: String) -> Result<StructuredOutput, String> {
    Ok(crate::structured_core::parse(&text).into())
}

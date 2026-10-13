//! Pinned upstream model revisions; sizes and SHA256 come from Hugging Face LFS.
pub struct ModelFile {
    pub name: &'static str,
    pub bytes: u64,
    pub sha256: &'static str,
}
pub struct ModelPackage {
    pub id: &'static str,
    pub revision: &'static str,
    pub license: &'static str,
    pub license_url: &'static str,
    pub files: &'static [ModelFile],
}
pub fn package(kind: &str) -> Result<ModelPackage, String> {
    match kind {
    "brain"=>Ok(ModelPackage{id:"Qwen/Qwen2.5-0.5B-Instruct-GGUF",revision:"9217f5db79a29953eb74d5343926648285ec7e67",license:"Apache-2.0",license_url:"https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/raw/9217f5db79a29953eb74d5343926648285ec7e67/LICENSE",files:&[ModelFile{name:"qwen2.5-0.5b-instruct-q4_k_m.gguf",bytes:491400032,sha256:"74a4da8c9fdbcd15bd1f6d01d621410d31c6fc00986f5eb687824e7b93d7a9db"}]}),
    "stt"=>Ok(ModelPackage{id:"ggerganov/whisper.cpp",revision:"5359861c739e955e79d9a303bcbc70fb988958b1",license:"MIT",license_url:"https://raw.githubusercontent.com/ggml-org/whisper.cpp/b5454/LICENSE",files:&[ModelFile{name:"ggml-tiny.bin",bytes:77691713,sha256:"be07e048e1e599ad46341c8d2a135645097a538221678b7acdd1b1919c6e1b21"}]}),
    "vision"=>Ok(ModelPackage{id:"ggml-org/SmolVLM-256M-Instruct-GGUF",revision:"b9e4379657e1450d04d02eec8e345667265b0a00",license:"Apache-2.0",license_url:"https://www.apache.org/licenses/LICENSE-2.0.txt",files:&[
        ModelFile{name:"SmolVLM-256M-Instruct-Q8_0.gguf",bytes:175054528,sha256:"2a31195d3769c0b0fd0a4906201666108834848db768af11de1d2cef7cd35e65"},
        ModelFile{name:"mmproj-SmolVLM-256M-Instruct-Q8_0.gguf",bytes:103769856,sha256:"7e943f7c53f0382a6fc41b6ee0c2def63ba4fded9ab8ed039cc9e2ab905e0edd"},
    ]}),
    "gguf-asr"=>Ok(ModelPackage{id:"handy-computer/nemotron-3.5-asr-streaming-0.6b-gguf",revision:"8139c4ec14bdc45c361adf8d57c27c28e7478272",license:"OpenMDW-1.1",license_url:"https://openmdw.ai/license/1-1/",files:&[ModelFile{name:"nemotron-3.5-asr-streaming-0.6b-Q4_K_M.gguf",bytes:495831520,sha256:"41c99fa5fb6f3d35f68e79adc3e755eca2232a8d921178bd647b71194792b8fd"}]}),
    _=>Err("Unknown local model kind".into()),
}
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn defaults_are_pinned_bounded_and_include_vision_projector() {
        for kind in ["brain", "stt", "vision", "gguf-asr"] {
            let model = package(kind).unwrap();
            assert_eq!(model.revision.len(), 40);
            assert!(model
                .files
                .iter()
                .all(|f| f.sha256.len() == 64 && f.bytes < 512 * 1024 * 1024));
        }
        let vision = package("vision").unwrap();
        assert_eq!(vision.files.len(), 2);
        assert!(vision.files[1].name.starts_with("mmproj-"));
        assert!(package("tts").is_err());
    }
}

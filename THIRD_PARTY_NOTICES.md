# Third-party notices

## Tauri WiX installer template

`src-tauri/installer/per-user.wxs` is derived from the official Tauri CLI 2.7.1
[WiX template](https://github.com/tauri-apps/tauri/blob/tauri-cli-v2.7.1/crates/tauri-bundler/src/bundle/windows/msi/main.wxs),
licensed under MIT or Apache-2.0 by the Tauri Programme within The Commons
Conservancy and its contributors. Fluely changes installation scope, the
per-user destination and per-user protocol registration. The original Tauri
license terms remain applicable to this template.

Fluely is a GPL-3.0 fork of [Pluely](https://github.com/iamsrikanthnani/pluely), originally created by Srikanth Nani. Original copyright and the full GPL text in LICENSE are retained. Fork maintenance: Clawz1N1N.

The source uses Tauri, React, TypeScript, Vite, CPAL/WASAPI, SQLite and other dependencies listed in package-lock.json and src-tauri/Cargo.lock. Their license texts remain in their source distributions. Vendored tauri-plugin-keychain and tauri-plugin-sql preserve their upstream license files.

Document attachments use fflate (MIT), fast-xml-parser (MIT) and PDF.js (Apache-2.0); estimated multilingual context counts use js-tiktoken (MIT). PDF.js CMaps and standard fonts remain bundled locally with their upstream license files. The full license texts for these JavaScript libraries are bundled under `public/licenses` and `/licenses` in the application assets. Legacy Office conversion uses a separately installed LibreOffice executable; Fluely does not redistribute LibreOffice.

Optional downloaded runtimes are separate from the application binary:

Fluely's experimental pixel-to-text screen method adapts the half-block representation in TheiaVision (MIT, François & Theia, 2026). Its notice is retained in [docs/licenses/theiavision-MIT.txt](docs/licenses/theiavision-MIT.txt); implementation and limitations are described in [docs/vision-methods.md](docs/vision-methods.md).

- llama.cpp, ggml-org: MIT; pinned CPU release b11575.
- whisper.cpp, ggml-org: MIT; pinned CPU release b5454.
- Recommended Qwen2.5 0.5B Instruct GGUF: Apache-2.0, Qwen.
- Recommended SmolVLM 256M GGUF and projector: Apache-2.0, Hugging Face/ggml-org.
- Recommended multilingual Whisper tiny model: MIT, OpenAI/ggml-org.
- transcribe.cpp, handy-computer: MIT; pinned native Windows x64 CPU/Vulkan release v0.4.0. Fluely selects the CPU backend and preserves every bundled third-party license. Sources: https://github.com/handy-computer/transcribe.cpp/tree/v0.4.0 and the generated C ABI in bindings/rust/sys/src/transcribe_sys.rs.
- Optional Nemotron 3.5 ASR Streaming 0.6B Q4_K_M GGUF: OpenMDW-1.1, NVIDIA; converted and validated by handy-computer. Model revision 8139c4ec14bdc45c361adf8d57c27c28e7478272, SHA256 41c99fa5fb6f3d35f68e79adc3e755eca2232a8d921178bd647b71194792b8fd. The model card and complete license from https://openmdw.ai/license/1-1/ are preserved beside explicitly downloaded weights. Source: https://huggingface.co/handy-computer/nemotron-3.5-asr-streaming-0.6b-gguf. This model is not licensed as MIT or Apache-2.0.

The installer preserves the package's files and runtime license and records its source URL, version and checksum. Model downloads preserve available license/model-card files and pinned revision/checksum metadata. Model formats and rights vary; consult the license supplied with a manually selected model. Optional Piper and cloud services are configured separately and retain their own licenses/terms.

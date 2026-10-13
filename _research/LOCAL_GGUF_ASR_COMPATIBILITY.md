# Genuine GGUF speech recognition: implementation and evidence

Fluely uses transcribe.cpp v0.4.0 for ASR GGUF files. This is an independent native speech engine: a GGUF extension alone does not make a model compatible with llama.cpp or with ASR. The managed recommendation is NVIDIA Nemotron 3.5 ASR Streaming 0.6B Q4_K_M, converted and validated by handy-computer. Its FastConformer encoder and RNN-T decoder are implemented by this engine.

## Primary sources and exact artifacts

- Engine source and supported model catalog: https://github.com/handy-computer/transcribe.cpp/tree/v0.4.0
- Native release: https://github.com/handy-computer/transcribe.cpp/releases/tag/v0.4.0
- Windows package: `transcribe-native-0.4.0-windows-x86_64-cpu-vulkan.tar.gz`, 18,036,555 bytes, SHA256 `9d5bd89f720d7979323e73f5220fe50fad5e38a7b0c2525225d453bd09adf2b0`.
- Pinned generated ABI: https://github.com/handy-computer/transcribe.cpp/blob/v0.4.0/bindings/rust/sys/src/transcribe_sys.rs
- Model: https://huggingface.co/handy-computer/nemotron-3.5-asr-streaming-0.6b-gguf/tree/8139c4ec14bdc45c361adf8d57c27c28e7478272
- Model filename: `nemotron-3.5-asr-streaming-0.6b-Q4_K_M.gguf`, 495,831,520 bytes, SHA256 `41c99fa5fb6f3d35f68e79adc3e755eca2232a8d921178bd647b71194792b8fd`.
- Original NVIDIA model: https://huggingface.co/nvidia/nemotron-3.5-asr-streaming-0.6b
- Engine license: MIT, with all bundled third-party notices preserved. Model license: **OpenMDW-1.1**, https://openmdw.ai/license/1-1/ . The model card and complete license are saved beside downloaded weights.

The model card lists 32 supported locales including `uk-UA`, `ru-RU` and `en-US`. This proof used the English JFK fixture; Ukrainian and Russian accuracy have not been benchmarked on this machine. The adapter maps short hints uk/ru/en to the engine's locale codes, and preserves explicit locale codes.

## Runtime and installation

The official Windows release provides `transcribe.dll` and dependencies, rather than an executable server. Fluely's application starts itself in an early worker mode with a private stdin/stdout JSON-lines protocol. Its model/session loads before the worker reports readiness. The main GUI never loads the ASR DLL. CPU backend mask is enforced, GPU layers are zero, and the child is assigned a Windows kill-on-close job. Only the owned process receives audio; there is no ASR TCP endpoint.

The UI downloads an engine and model only after the user selects the action. Engine archives are verified against the pinned SHA256 and extracted with entry/path/link/size bounds into managed application data. Model downloads are streamed to a partial file with pinned size and SHA256 checks. Licenses, model card and source metadata are retained. The development smoke artifacts stay under `_research/temp/transcribe-asr`; no global runtime was installed.

`gguf-asr` is separate from `stt` (whisper.cpp GGML .bin), `brain` and `vision`. Existing local profiles gain the fourth configuration without losing their settings. Starting the ASR worker registers an enabled STT provider only after actual model readiness. Its preset is `local-gguf-asr`; transcription invokes `transcribe_gguf_asr_audio` with `{ audioBase64, providerId }`. Stopping, startup failure, crashes and inference timeout disable that provider. Native transcripts are returned through the same provider fallback pipeline as other STT providers.

Limits: Windows x64 native release and ABI v0.4.0, 120-second model startup deadline, 90-second inference timeout, 16 MiB decoded WAV / 60 seconds per request, bounded logs and responses. Input WAV is normalized from supported PCM/float channel/rate combinations to 16 kHz mono f32. Fluely currently transcribes completed VAD segments through the batch API. It does **not** expose partial streaming transcripts, even though this model also has a streaming architecture.

## Actual CPU verification, 2026-10-13

The exact Rust worker/audio/FFI files were compiled into a temporary standalone probe using the already installed Rust toolchain and cached dependencies. The official archive and model hashes above were checked against the downloaded bytes. The pinned DLL's version and struct-size/alignment query API were exercised; the adapter checks these again before native calls.

Fresh smoke command: `python _research/temp/gguf_asr_smoke.py` (repository working directory).

Observed on this Windows PC with 4 CPU threads:

```text
ready: engine=transcribe.cpp, version=0.4.0, backend=cpu, protocol=1
model load: 1.640 seconds
model load plus 11-second JFK audio transcription: 3.027 seconds
transcript: And so my fellow Americans ask not what your country can do for you ask what you can do for your country.
malformed WAV rejected; worker still alive; stdin close frees session and exits
```

A second smoke using the configured auto option also returned the correct quote. That English sample alone cannot distinguish language detection from a fixed English default, so the exact pinned source and actual GGUF metadata were inspected as well. The v0.4.0 native implementation's `resolve_prompt_id` explicitly maps a null/empty hint to `prompt.auto_id`: https://github.com/handy-computer/transcribe.cpp/blob/v0.4.0/src/arch/parakeet/model.cpp#L147 . The downloaded model has `stt.parakeet.prompt.auto_id = 101`, distinct from its English prompt index 0. Accordingly, Fluely passes a null hint for the auto option. Passing the literal `auto` string through this release's public C API was tested and rejected as `unsupported language`; it is not interchangeable with the native null hint. ABI/audio unit tests cover actual layouts, the version-compatible null auto hint and locale conversion, and 48 kHz stereo PCM normalization to 16 kHz mono. The metadata inspection can be reproduced with `python _research/temp/inspect_asr_gguf_metadata.py`.

The complete native project previously completed an approved `cargo check` successfully after these modules and the provider schema change. Final integrated Cargo tests, Clippy and packaged application builds are run serially by the parent task. The same smoke accepts `FLUELY_ASR_TEST_EXE` pointing at the fresh application executable to verify the application's early worker dispatch. No claims about that final executable are made until its smoke completes.

Frontend local-engine-client tests: 3/3 passed. TypeScript check completed successfully; encoding check: 459 text files, zero failures.

## Windows system speech catalog

`list_system_stt_languages` returns actual installed System.Speech recognizer culture IDs and display names; it does not return a fabricated language list. A default entry is added only when at least one recognizer exists. Enumeration initializes neither microphone nor audio, caps output at 64 KiB and times out after 45 seconds. On this PC the actual enumeration returned `[]`, so the API reports an explicit missing Windows speech pack error. Separate regression tests passed after first failing for absent behavior.

## Final application verification
The packaged Fluely EXE managed and stopped its own GGUF ASR worker. The final native smoke loaded the model in 1.531 seconds and transcribed the public JFK fixture in 1.204 seconds with auto language. Malformed WAV was rejected without crashing the worker. Final Rust suite: 105 passed; Node suite: 123 passed. See docs/release-0.2.0.md for integrated evidence.

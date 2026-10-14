# Source comparison and platform portability

The October 14, 2026 comparison uses the original fork baseline, Pluely 1.1.0 commit `dc35e936e36b7fe2b03119df268cb1b02d35cf5b`, rather than an unspecified current upstream version.

`node scripts/compare-upstream.mjs` counts tracked and new application source files under `src` and `src-tauri/src`, limited to Rust, TypeScript/TSX and CSS. It includes comments and blank lines, ignores CRLF differences and uses Git rename detection. Documentation, tests, generated files, dependencies, icons and build outputs are excluded.

| Metric | Result |
|---|---:|
| Original source lines | 26,623 |
| Fluely source lines | 37,390 |
| Original lines retained unchanged | 20,981 |
| Original lines changed or removed | 5,642 |
| Original source retained | 78.81% |
| Original source changed or removed | 21.19% |
| Unchanged original share of Fluely source | 56.11% |

These measure line retention, not functionality, quality, authorship or legal ownership. Added features can substantially change the application while retaining its original framework. Relocated/reformatted lines can count as changes; the script is intentionally reproducible instead of claiming a semantic percentage. Pluely authorship and GPL licensing remain applicable.

## Other operating systems

The React/Tauri/Rust foundation can support macOS and Linux. The repository already has microphone capture and platform-specific system-audio implementations. Cloud chat/model discovery, provider configuration, quotas, prompts, response styles, history and interface languages can carry over with platform builds and acceptance tests.

Desktop screenshots, positioning, global shortcuts, transparency and click-through require OS-specific permission and compositor checks. macOS needs microphone/screen-recording permission and appropriate signing/notarization. Linux, especially Wayland, restricts global positioning, capture and hotkeys differently from Windows; equivalent overlay behavior is not guaranteed.

Windows offline `System.Speech` STT, Windows OCR/UI Automation, capture-exclusion display affinity, EXE metadata/alias and Windows Startup management need platform substitutes. Managed runtime downloads currently target Windows x64; llama.cpp, whisper.cpp, transcribe.cpp and Piper are portable engines, but their installation packages, process management and hardware backends must be adapted. A locally hosted compatible HTTP provider can remain an option without the managed downloader.

This release distributes and verifies Windows x64 only. A mobile or browser-only port would retain core chat/provider functions but needs a different product flow because desktop-wide overlays, system audio and global controls are restricted.

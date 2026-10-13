# Fluely 0.2.0 — 2026-10-13

## Delivered

- Fluent Ukrainian, Russian and English interface with a language selector and first-run Windows language detection; product, package, executable and repository branding changed to Fluely. Original GPL copyright and third-party notices remain.
- Transparent compact controls, click-through passive chat, full work-area chat movement, configurable interaction/hide shortcuts, separate opacity settings, three standard layouts and a free grouped layout editor.
- Settings has no taskbar button; minimize hides it and the gear reopens it. Status appears in a separate bottom-right window. Hide-all remembers the previously visible windows, including settings.
- Provider/model editor without cURL, built-in URLs, Other fields, protected account keys, multi-model selection, search, all/none, undo/redo and cancel. Capabilities/context/output metadata are imported when reported and editable per model. Legacy configurations and quota history are preserved.
- Independent cloud/local brain, speech, voice and visual providers with ranking, quotas and fallback. Managed llama.cpp, whisper.cpp and genuine transcribe.cpp GGUF ASR; Windows STT uses actual installed recognizers rather than a fabricated list.
- Semantic visual-model screen descriptions and experimental TheiaVision-inspired pixel/color maps. The visual selector accepts only enabled models whose image-input flag is checked.
- Sleep crescent replaces the redundant overlay dashboard button. Screenshots, microphone and ordinary actions stop; system audio continues to STT and reasoning with a separate prompt. Fragmented literal alarm codes trigger one track on the configured real output. Leaving Sleep restores prior capture flags. Transitions reject stale batches/STT and complete canceled clients.
- Configurable own process/Startup name, default `my program.exe`; only owned binary resources and owned Startup values are modified. No foreign Startup entries are removed.

## Verification

| Check | Result |
|---|---|
| TypeScript and UTF-8 | Passed, zero failures |
| Full Node suite | 123 passed |
| Full native Rust suite | 105 passed |
| Clippy all targets with warnings denied | Passed |
| Final Tauri release build | EXE, MSI and NSIS built |
| Native UI | Taskbar policy, three languages, actual opacity endpoints, minimize/gear, custom drag/persistence, hidden rebuild/restore, compact physical geometry, full chat work area and native microphone ownership passed |
| Provider UI/native persistence | Searchable checkbox dialog, all/none, history, cancel without save, two keys sharing a service with separate model lists, capabilities/token metadata and image-only visual selector passed; fixture keys removed |
| Live public model discovery | OpenRouter returned 459 models, 297 image-capable and 45 audio-capable; all had context metadata and 451 had output metadata |
| Managed brain/vision/Whisper | Public fixtures returned `Hello!`, identified a red circle, and transcribed the JFK recording; owned servers stopped |
| Managed GGUF ASR in final EXE | Nemotron model loaded in 1.531 s; approximately 11 s JFK fixture transcribed in 1.204 s; malformed WAV rejected without worker crash; owned worker stopped |
| Native Sleep | System audio active, microphone/screenshots/direct chat interaction blocked, fragmented code produced exactly one automatic native playback on the selected Realtek output, prior capture flags restored |
| Native pixel maps | Synthetic PNG produced complete bounded luminance/color maps, 3801 characters |
| Own Startup routines | Production write/read, foreign-value protection, delete and cleanup passed at normal medium integrity; unique test entry removed |

GGUF ASR admission is bounded to eight recordings; its 90-second deadline includes queue wait and inference. Native tests verify capacity and deadline cleanup. Restarting a managed model preserves its rank, request limits, account, display name and manual capabilities. Failed account publication restores the previous protected key. The code review's two final blockers — transition-time batches and unbounded ASR waiting — were fixed and regression tested before the final build.

## Practical limits

This PC has no installed offline System.Speech recognizer. Windows STT reports this explicitly; install an appropriate Windows speech pack or use Whisper/GGUF ASR. No language pack was silently installed.

The sandbox-created smoke EXE inherits a low-integrity NTFS label, so Windows denies its HKCU Run writes. The exact production routines passed at ordinary medium integrity. No ACL/token change or privileged broker was added. For normal deployment, use the installer and launch the installed application outside the sandbox workspace. A Windows sign-in/reboot acceptance test was not performed.

Pixel-to-text is a lossy experimental representation, not a learned object detector. Tiny VLMs can misread small details or counts. Larger models may improve results; hardware/model/language-dependent accuracy is not established by the fixture tests. See [vision-methods.md](vision-methods.md) and [provider-models.md](provider-models.md).

Installers were built; an installation over the user's current application was not performed. Screen-capture exclusion is verified as the Windows display-affinity setting, not a guarantee about every recorder or exclusive fullscreen application. Cloud inference requires the user's service key; no private cloud key was used for verification.

Source artifacts, optional weights and private profiles are not included in the source upload. SHA-256 values for the final local binaries are listed in `RELEASE/SHA256.txt`. The previous 0.1.9 delivery is retained separately; its reports describe that historical build.

# Fluely 0.2.1

This release repairs Windows installation and portable startup, reorganizes AI settings, and restores overlay controls after service initialization failures.

## Windows packages

- `Fluely_0.2.1_x64-setup.exe`: NSIS installer for the current Windows user.
- `Fluely_0.2.1_x64_en-US.msi`: MSI installer for the current Windows user.
- `fluely.exe`: single-file portable distribution. Put it in a writable folder and open it directly. WebView2 must already be installed. The application creates an adjacent `profile` folder, including its managed executable alias and WebView data.
- `Fluely_0.2.1_windows-x64-portable.zip`: the same portable executable plus documentation, licenses, checksums and an optional CMD launcher. It contains no user profile or credentials.

Close an existing Fluely instance before replacing its executable. Preserve its `profile` directory. Installed copies use OS application-data paths; an installer-only marker distinguishes them from portable copies. Explicit absolute `--fluely-profile` arguments and `FLUELY_DATA_DIR` remain supported. Alias launches preserve the same resolved profile.

If a previous version was installed for all users, uninstall it before switching to the per-user installer. Cross-scope upgrades have not been tested; this release does not promise an automatic migration of that installation.

## Changes

- Frontend builds use the real checkout path. Interrupted builds no longer leave P:/Q: SUBST drive aliases behind.
- Direct portable launches choose their adjacent profile before creating windows. Invalid profile arguments and startup errors are visible instead of silently selecting another profile or terminating without a message.
- MSI components use HKCU registry key paths, preserving standard Windows Installer validation for files installed under the user profile. MSI and NSIS no longer require a per-machine installation.
- AI settings contains Reasoning, Speech recognition, Text-to-speech and Vision modules, with Cloud providers, Local engines and supported System sources. The selected source is white. Provider refresh preserves unsaved engine and vision configuration.
- Local llama.cpp, whisper.cpp, GGUF ASR/transcribe.cpp and vision settings moved out of App Settings. TTS exposes cloud, system and separately installed Piper options. Whisper and GGUF ASR remain speech recognizers rather than TTS engines.
- TTS stores independent settings for cloud, system and Piper. Opening a source does not activate it; Save activates the chosen backend.
- Overlay service startup retries after a temporary initialization failure. Restarted controllers get live listeners and a fresh abort signal. Panels accept replacement service snapshots, and the settings gear stays available during service failures or slow capture actions.
- README is English, documents current behavior, and preserves upstream authorship and licenses. The existing whisper.cpp b5454 build is the same commit as stable v1.9.5; compatible larger multilingual models can be selected manually.

## Verification

The following passed on the development Windows PC on October 14, 2026:

- Encoding and TypeScript checks; 144 Node tests; 110 Rust library tests; Clippy with warnings treated as errors.
- Optimized release compilation and both installer bundles. MSI's original ICE38 errors were reproduced, then resolved without suppressing validation.
- MSI installation and uninstallation with a non-administrator token, exit code 0; no 2502/2503 errors. NSIS installation and uninstallation, exit code 0; no temporary-file error. Test installations used isolated directories and omitted shortcuts.
- Native WebView checks: three interface languages, functional opacity, no taskbar entry for Settings, hide-on-minimize and reopening, custom layouts, full chat work-area movement, hide/restore, microphone ownership and cleanup.
- Provider modal discovery, cancel without saving, select all/none, undo/redo, two independent API accounts, capability metadata and an image-only vision-model picker, using a loopback fixture and disposable keys.
- Direct launch of one EXE without CMD or profile arguments, adjacent profile creation, default `my program.exe` alias with matching PE metadata, and actual navigation through all four AI modules and their available sources.

The user's separate Windows Temp permission defect was diagnosed and repaired with their explicit authorization, granting only that user the ability to create files and directories in the Temp folder. The original ACL was backed up locally. That PC-specific repair is not an installer action and should not be blindly applied on other computers. Locally generated executables were restored to normal Windows integrity before launch, addressing the observed NSIS temporary-file failure.

## Limits

Packages are unsigned. WebView2 and optional local engines/models are separate dependencies. System STT depends on installed Windows recognizers. Local Piper needs an executable and ONNX voice. Pixel-to-text screen vision remains experimental; a visual model is the semantic screen-understanding option. Full Windows sign-in/autostart behavior, cross-scope upgrades and other computers still require user acceptance testing.

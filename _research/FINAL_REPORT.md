# FINAL REPORT — Pluely Fork Customization (custom-overlay)

## Summary

All 6 phases implemented on branch `custom-overlay`. Code is complete and correct-by-construction, but **compilation is NOT verified** in this sandbox (no network, no cargo registry, no node_modules — see BLOCKED.md). The user must run `npm install && npm run build && cargo check && npm run tauri build` on a networked machine.

## What was done per phase

### Phase 1 — remove paid/remote/telemetry (commit dbc77aa, tag phase-1-done)
- Deleted: `src-tauri/src/activate.rs`, `src-tauri/src/api.rs`, `src/lib/functions/pluely.api.ts`, paywall components (GetLicense/Promote/PluelyApiSetup/Usage/Contribute), `src/lib/analytics.ts`, `fix_report*.py`.
- `hasActiveLicense = true` constant; `pluelyApiEnabled = false` constant (fields kept in `IContextType` to avoid rewriting ~20 consumers).
- Router unconditionally local (`shouldUsePluelyAPI`/`fetchPluelyAIResponse`/`fetchPluelySTT` deleted).
- Local presets in `src/pages/system-prompts/PluelyPrompts.tsx`.
- Auto-updater disabled (`updater/index.tsx` = null); removed from Cargo.toml/package.json/tauri.conf.json/capabilities.
- Telemetry removed (posthog, machine-uid). Unused crates removed (reqwest, uuid, once_cell).
- §3d grep: 0 disallowed hits.

### Phase 2 — new window shell (commit 6e67d70, tag phase-2-done)
- `src-tauri/src/shell.rs`: ShellState/ShellLayout/UiMode, layout persistence (shell_layout.json), create_shell_window (content_protected, always_on_top, skip_taskbar, transparent, focusable=false), WS_EX_TOPMOST|TOOLWINDOW|NOACTIVATE + watchdog (~1s), axis-locked move_shell_window with monitor clamping, rebuild_shell for 3 UI modes, 13 commands.
- Frontend `src/components/Shell/`: ShellSideStrip, ShellTopStrip, ShellButton, AnswerWindow (MAIN/SIDE panes + chat), Shimmer, useShellDrag.
- Routes `/shell/*`; main.tsx routing by window label.
- Capabilities: added strip-*/button-*/answer labels.

### Phase 3 — capture, continuous mode, vision (commit, tag phase-3-done)
- `src-tauri/src/continuous.rs`: CaptureSettings, ContinuousState, frame capture+downscale+JPEG, perceptual frame_diff dedup, batcher (BatchContext), start/stop_continuous loop, continuous_add_question/transcript, try_send_batch (one-in-flight, newer-replaces-stale), continuous_request_done. Unit tests for dedup/downscale/batch.
- `src-tauri/src/vision.rs`: VisionMode (ocr/ocr+ui/vlm/full), VisionSettings, OcrBlock/UiNode/ScreenContext, build_screen_context command.
- `src-tauri/src/ui_automation.rs`: foreground_tree.
- Frontend: TYPE_PROVIDER.supportsImages.
- **OCR and UI Automation are STUBS** (windows crate features Media_Ocr / Accessibility not enabled — see BLOCKED.md). Batcher, dedup, capture loop, settings fully implemented.

### Phase 4 — providers, limits, fallback (commit, tag phase-4-done)
- `src-tauri/src/providers.rs`: ProviderEntry, ProvidersState, rolling-window limiter (per minute/hour/day), cooldowns with Retry-After, pick (rank + capability + cooldown + rate gates), record_failure/success, global daily limit, neutral mode, next_available_secs countdown, broadcast to all windows. 8 Tauri commands. Unit tests for limiter/fallback state machine.

### Phase 5 — structured output, KaTeX, TTS (commit, tag phase-5-done)
- `src-tauri/src/structured.rs`: parse (tolerant, exact-tag-names, unclosed/missing tags, untagged>MAIN), StreamingParser (tags split across chunks, SIDE/SPEAK only when closed, MAIN streams immediately). parse_structured command. Unit tests.
- KaTeX: `remark-math` + `rehype-katex` installed; Markdown/index.tsx imports katex CSS and uses Streamdown. **Rendering NOT verified** `[NEEDS HUMAN CHECK]`.
- `src-tauri/src/tts.rs`: TtsSettings (backend/enabled/voice/language/rate/stream), get/update/set_enabled commands.
- `src/hooks/useTts.ts`: Web Speech API, boundary-event word highlighting, pause/resume/stop/seek-by-sentence/rate, master toggle.
- TTS keybinds added to shortcuts.ts (tts_toggle/stop/pause/seek_back/seek_forward).

### Phase 6 — hardening (commit, tag phase-6-done)
- `src/lib/storage/secure.storage.ts`: keychain-backed secret storage (tauri-plugin-keychain) with localStorage fallback + migrateToKeychain. **Plugin JS API shape NOT verified** `[NEEDS HUMAN CHECK]`.
- CSP set in tauri.conf.json (default-src self, script/style inline, img data/blob, connect self+localhost+https, frame-ancestors none).
- `sql:allow-execute` KEPT (used by chat-history.action.ts — spec said remove "if unused").
- README_FORK.md (Ukrainian).
- MANUAL_TESTS.md (Ukrainian, 15 tests).

## Decisions
See `_research/DECISIONS.md`. Key ones:
- BrowserRouter paths for shell routes (matches existing router).
- Custom pointer-event drag (data-tauri-drag-region cannot lock an axis).
- Answer window created lazily (toggle_answer_window), not on startup.
- 8 button actions: listen/screenshot/continuous/answer/chat/tts/mode/settings.
- OCR/UIA/VLM stubbed (crate features not enabled) — batcher/dedup/loop are real.
- sql:allow-execute kept (in use).

## BLOCKED items (see _research/BLOCKED.md)
1. **No network / no cargo registry / no node_modules** > `npm install`, `cargo check`, `npm run build`, `npm run tauri build` cannot run here. User must run on a networked machine.
2. **OCR** (Windows.Media.Ocr): needs `windows` crate feature `Media_Ocr` + OCR language pack. Currently a stub returning a clear error.
3. **UI Automation**: needs `windows` crate feature `Accessibility`. Currently a stub.
4. **VLM mode**: needs a configured vision provider (Phase 4); currently a placeholder.
5. **Keychain JS API shape** (tauri-plugin-keychain): assumed setItem/getItem/removeItem; not verified. Falls back to localStorage safely.

## [NEEDS HUMAN CHECK]
- How strips/buttons/answer window LOOK on screen.
- Always-on-top over Task Manager / borderless fullscreen / exclusive fullscreen.
- Click-through outside shell UI.
- Win+Shift+S / PrintScreen / OBS do not show the overlay; get_window_display_affinity returns WDA_EXCLUDEFROMCAPTURE (17).
- Axis-locked drag behavior.
- OCR quality; VLM descriptions.
- KaTeX rendering through Streamdown.
- TTS sound, available voices (Ukrainian), word highlighting.
- Keychain storage on this machine.

## How to run / where the installer is
On a networked machine, in `pluely/`:
```
npm install
npm run tauri dev     # dev
npm run tauri build   # installer -> src-tauri/target/release/bundle/msi|nsis
```
Installer location: `src-tauri/target/release/bundle/`.

## Known risks
1. **Not compiled** — type/compile errors are possible (low confidence without cargo/tsc). Highest-risk: generic `Runtime` bounds in shell.rs, the keychain JS API, the streaming parser edge cases.
2. **OCR/UIA/VLM are stubs** — vision pipeline returns placeholder text until crate features are enabled.
3. **CSP** may block the dev server or provider base URLs — adjust `connect-src` if requests fail.
4. **Exclusive fullscreen** cannot be covered by any topmost window (OS limit).
5. **Wayland** (Linux) limits capture and topmost windows.

## Answers to spec questions
- **Which flag protects against capture?** `contentProtected: true` > Windows `SetWindowDisplayAffinity(WDA_EXCLUDEFROMCAPTURE)`; macOS `NSWindow.sharingType = .none`. Verified in shell.rs (apply_windows_shell_style) and create_shell_window (.content_protected()).
- **Which tests passed?** Rust unit tests authored (continuous dedup/downscale/batch; providers limiter/fallback; structured parser). NOT RUN (no cargo). `[NEEDS HUMAN CHECK]` via `cargo test`.

# Fluely 0.2 — implementation plan, 2026-10-13

> For agentic workers: execute scoped tasks with executing-plans/TDD; parallel independent i18n and engine/microphone work, parent integrates overlay/identity/branding/GitHub. User has standing autonomous execution authorization and now explicitly authorizes GitHub publication.

Goal: deliver all11 requested fixes/features as Fluely, compiled Windows build and code published to https://github.com/Clawz1N1N/fluely.
Architecture: hidden service runtime remains sole inference/capture executor. Rust manages native microphone, local llama.cpp/whisper.cpp child processes, layout/windows/identity. React has shared uk/ru/en i18n catalog, language selector, real layout editor and local model controls. Blind brain receives separate multimodal scene context (not OCR-only). Preserve compatible storage/credentials and GPL upstream attribution.
Tech: Tauri2/React19/windows0.61/CPAL, llama.cpp OpenAI-compatible brain/vision endpoints, whisper.cpp STT + existing Windows System.Speech, retained own-provider HTTP transport.

Constraints: keep current checkout custom-overlay; no force push, do not overwrite remote personal work; no keys/configs/logs/model binaries in Git. Native/profile tests use owned temporary directories/processes only; leave user's running release intact until replacing build. No multiGB model implicit download. OS microphone privacy respected; native path removes browser-origin prompt. Error state visible bottom-right; hide-all includes dashboard/status/answer/controls. UI/runtime brand Fluely, original authors/licenses preserved.

Review focus: locale swap across multiple windows and dynamic text; customized layouts spanning DPI/workarea; status click-through; local processes never orphan or expose nonlocalhost ports; GGUF/mmproj/STT format mismatch; microphone stop/config changes; settings hide-on-minimize/reopen; actual alpha canvas vs body; process alias metadata/startup names; GitHub history/credential safety.

- [ ] I18n: OS language initial detection, persistence/cross-window updates, complete uk/ru/en catalogs, Settings selector; Node tests.
- [ ] Native local engines: process lifecycle/config/models/status/download/browse; brain GGUF, multimodal GGUF+mmproj, Whisper native formats; local provider auto-registration; tests/actual CPU readiness.
- [ ] Native mic: CPAL WAV speech segments, owned start/stop, no WebView permission prompt; existing System.Speech exposed clearly.
- [ ] Dashboard: skip taskbar/toolwindow, transparent canvas via Theme setting, minimize hides instead; gear reopens.
- [ ] Layout: compact presets buttons/sides/top-bottom; remove text from strips; free custom layout with groups/rows/order/position/size/gap/opacity/visibility and drag/preview; persisted native validation.
- [ ] Status: separate protected/click-through bottom-right window for errors/neutral/operation indicators; no oversized strip status.
- [ ] Full vision: independent local/cloud VLM scene analysis on changed screens, continuity/context, sends text to blind brain; replace continuous-shots user-facing action with vision toggle.
- [ ] Complete hide: configurable shortcut hides every visible application window and restores only prior visibility; keep state alive.
- [ ] Identity: Fluely UI/package/executable/icons/social GitHub-only/README; neutral own executable alias default my program.exe and startup name; editable setting with restart and validation.
- [ ] Integrate i18n/local modules, full tests, Rust check/test/clippy, actual native window/audio/engine/vision smoke; regenerate EXE/MSI/NSIS + SHA/docs in RELEASE.
- [ ] GitHub: inspect auth/remote default history, publish committed tested code to user fork without force; preserve upstream attribution, no secrets/logs/binaries. Attach PR only if created. Record final branch/link/SHA/evidence and manual checks.

# Model controls and beta release implementation plan

> **For agentic workers:** Use subagent-driven-development for independent provider, model UI and chat/prompt tasks; use systematic debugging and verification-before-completion for integration.

**Goal:** Deliver the requested model-specific controls, usable chat shortcuts, working overlay appearance and a Windows beta release.

**Architecture:** Persist quotas and reasoning capabilities on each existing provider/model entry without changing credential ownership. Central native token reservations serialize concurrent requests. Native chat preferences synchronize template, reply style and source/model selections between webviews; the service runtime consumes these preferences. Overlay appearance remains a native layout setting, updated independently of service readiness.

**Tech stack:** Tauri 2, Rust, React, TypeScript; existing Node/Rust tests and isolated native WebView2 smoke tests.

**Spec:** User's October 14 request in the current conversation, items 1–9 and the two comparison/portability questions.

## Constraints

- Preserve existing API secrets, user prompts, profiles and model configurations.
- Defaults: reasoning efforts off, low, medium, high, xhigh, max; zero quotas mean unlimited.
- All new interface labels support English, Ukrainian and Russian.
- Interaction controls remain click-through until the configured chat activation shortcut is pressed.
- Publish future GitHub releases as prereleases; remove the previous release after the replacement has been verified.
- Compute comparison percentages from a declared source-line metric against the original fork baseline.

## Tasks

- [x] Provider metadata/core: per-model request/token budgets, neutral suspension, persisted reservation settlement and provider-aware reasoning parameters. Test boundaries, concurrency, persistence and missing usage.
- [x] Model settings: edit saved model limits/reasoning, remove redundant Other toolbar action and the former shared limits/instruction panels. Verify account ownership and metadata saves.
- [x] Chat and prompts: relocate instructions, add mode defaults and compact selectors, persist preferences and enforce them in actual reasoning/STT/TTS/vision requests. Test selection filtering, prompt composition and stale selections.
- [x] Appearance and repository link: reproduce native failure, fix at its source, verify visible/computed appearance independent of service readiness; use the system URL opener with visible errors.
- [x] Documentation: remove the requested README columns, explain quotas and beta status, record reproducible upstream/portability findings.
- [ ] Integration/release: encoding, TypeScript, Node tests, Rust tests/Clippy, isolated native UI tests; build and package per-user installers/portable binary; review changes, commit/push, publish beta assets and remove superseded release.

## Review focus

- Quota reservations must not overshoot under concurrent requests or double charge retries.
- Manually suspended models must stay suspended without disabling unrelated models.
- Explicit source/model choices must not silently fall back to a different account or image-incompatible model.
- Existing user prompts and credential references must survive migration and model edits.
- Appearance updates must work even when the hidden service is starting or has an error.

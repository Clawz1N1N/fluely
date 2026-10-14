# Fluely 0.2.2 beta 1

This beta makes model selection, quotas, reasoning settings and prompt controls available where they are used, and repairs appearance controls for custom overlay groups.

## Changes

- Each saved model has independent request and token limits for rolling second, minute, hour and day windows, a manual pause, and configurable reasoning efforts. API accounts retain independent credentials and model metadata.
- Token reservations happen before a request and are persisted. Completed provider usage replaces estimates when reported; missing usage retains a conservative allowance. Impossible budgets produce a configuration error instead of an endless wait.
- Model instructions are in System prompts, including editable mode defaults and the structured answer format.
- The chat toolbar selects templates, reply language/length and reasoning, STT, TTS and vision sources/models. Saved cloud models are searchable; image input is required in visual-model lists. Reasoning effort is saved per model. The configured interaction shortcut remains visible in the corner.
- The redundant Other toolbar button was removed; custom services remain available in the provider dropdown.
- Appearance changes apply immediately and atomically. Common strip/group transparency updates custom groups; unrelated changes retain individual group overrides. Overlay windows receive native appearance changes even if the service is unavailable. Shimmer uses a visible border, including the answer window, without painting an opaque gradient background.
- The GitHub button uses a fixed native repository URL and the OS default browser, with an explicit error if opening fails.
- README's local-engine table contains purpose and engine only. GitHub releases are betas/prereleases; the superseded 0.2.1 release is removed after this beta is published.

## Windows packages

The numeric application/package version is `0.2.2`; the GitHub release is `v0.2.2-beta.1`, marked Prerelease. MSI and NSIS install for the current user. `fluely.exe` starts directly as a portable executable and creates an adjacent profile; WebView2 remains a prerequisite. The portable ZIP also includes documentation and checksums. Preserve your existing profile and close Fluely before replacing its executable.

## Verification

The following passed on October 14, 2026:

- Encoding and TypeScript checks, 166 Node tests, 121 Rust library tests and Clippy with warnings treated as errors.
- Optimized Windows build and MSI/NSIS bundles; both installers installed and uninstalled successfully with a non-administrator token in isolated directories. The previous NSIS temporary-file and MSI 2502/2503 errors did not recur.
- Actual native chat: source/model selection, image-only vision filtering, templates, response language, saved model reasoning effort, a real loopback request carrying the selected settings and settlement against reported token usage.
- Native transparency for custom groups, individual buttons and the passive answer, plus shimmer, even while the hidden service webview was frozen.
- Provider discovery dialog, cancellation without writing credentials, selection history, independent API keys and vision capability filtering.
- One-file direct portable launch without CMD/profile arguments, adjacent profile, default managed executable alias and navigation through all four AI modules and available cloud/local/system sources.
- Native repository URL dispatch through the OS default browser. Independent review findings about screenshot token estimates, system vision, legacy reasoning fields, local TTS and quota waiting were resolved and rechecked.

Local models and cloud services vary in supported reasoning values; configuring a value does not add that capability to a model. A provider's reported usage remains authoritative, and estimates without usage are deliberately conservative. macOS and Linux ports require platform work and acceptance testing; this beta distributes Windows x64 only. Windows sign-in acceptance testing and every external provider's live account remain outside these fixture-based checks.

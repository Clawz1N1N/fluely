# Sessions, startup compatibility and platform sources implementation plan

> For agentic workers: execute each independent domain with scoped ownership; integrate and review before publication.

**Goal:** Deliver a Windows beta with reliable upgrades, durable multimedia conversations, useful live chat information and configurable icons; prepare macOS, Linux and Android source without building those platforms.

**Architecture:** The hidden service remains the sole owner of capture and inference. Native profile storage owns session metadata and media files; visible windows read snapshots and send explicit session actions. Android uses a separate mobile entry point and permission-aware native service rather than desktop window APIs.

**User requirements:** The latest request's item 8 supersedes item 5: two panels, Conversation and Transcript. Main/spoken content is emphasized inside the conversation. New sessions are empty at startup and acquire a local date/time name on first activity. Preserve existing databases and all saved user credentials. Publish only a Windows beta; do not build the three new platform targets.

## Work and interfaces

- [x] Startup compatibility: diagnose applied migration 3, preserve migration ledger and data, regression-test an existing database rather than only a fresh installation.
- [x] Native sessions: lazy session creation, explicit selection/new session, rename/list/read events, profile-owned recordings and screenshots. Serialize writes and preserve session ownership across asynchronous inference and switching.
- [x] Chat/dashboard: two panels, timestamped transcripts and real speaker metadata, history picker, durable multimedia timeline, selected-model footer and two audio meters. Maintain passive click-through and keyboard interaction.
- [x] Function readiness: disable only actions lacking their required configured models; keep settings and history reachable.
- [x] Provider requests: reproduce OpenRouter-compatible streaming and reasoning requests using fixtures, retain sanitized HTTP/SSE diagnostics through fallback, handle standard provider response formats.
- [x] Live levels: native microphone/system samples publish bounded RMS levels independently of STT, with UI decay on silence/stopped capture.
- [x] Icons: validate imported image, persist profile-owned icon, update desktop windows and Windows executable aliases where supported; provide reset.
- [x] Platform sources: gate desktop dependencies, separate mobile startup, implement Android permission/overlay bridge and capture lifecycle; document OS restrictions and unbuilt status.
- [x] Integration: TypeScript/Node/Rust checks, native upgrade fixture and UI acceptance, actual installed startup, Windows release build and package verification.
- [ ] Publication: push source, publish beta assets with verified hashes, then delete superseded GitHub releases.

## Review focus

1. Previously applied unknown migrations must not cause startup failure or data loss; registered migrations still require checksum validation.
2. Switching sessions while STT/inference is pending must not write old activity into the new session.
3. HTTP 200 streams can carry errors; never replace the provider's cause with a generic missing-provider message or leak credentials.
4. Capture permission and background behavior differ on Android; desktop global shortcuts and arbitrary launcher icons are not portable API assumptions.
5. Installed startup must be tested against prior profile state and installer paths, not only portable fresh profiles.

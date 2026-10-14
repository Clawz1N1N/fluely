# Release repair and AI settings redesign

Continue the user's existing authorized work in the current checkout. Preserve
the real portable profile and unrelated installed applications.

1. Verify and remove only project-owned SUBST mappings; remove drive aliases from
   frontend build scripts and verify the real-path build.
2. Diagnose installer failures using native user identity, directory access
   probes and verbose MSI logs. Back up any exact ACL changed. Repair only the
   demonstrated cause; do not reset broad system permissions.
3. Make a standalone portable executable select its adjacent profile reliably,
   preserve explicit profiles and installed application data, report startup
   failures visibly, and verify an actual direct launch.
4. Redesign AI settings into reasoning, STT, TTS, vision and provider refresh
   modules. Move local engines/AI settings from general appearance settings.
   Preserve model discovery, credentials and capabilities. Translate new labels.
5. Diagnose frozen controls and add meaningful startup/restart regression checks
   and a settings recovery path.
6. Rewrite README in English, verify current whisper.cpp release and supported
   quality choices, and document actual limitations.
7. Run frontend/native checks, native UI smoke and a sequential production
   build. Package verified files, preserve profile, record hashes and publish
   source to the authorized GitHub fork using fast-forward pushes.

Parallel ownership: local-engines agent owns AI settings UI/catalog;
vision-methods agent owns controller/control recovery and tests;
integration-review agent owns README and Whisper release research;
root owns installer diagnostics, build scripts, portable/native wiring and final
verification/publication.

## Current verification ledger — October 14

- Real-path frontend build passed; no SUBST mappings remain.
- PC-specific Windows Temp repair was already authorized and applied; old MSI's 2502/2503 disappeared. Preserve the ignored ACL backup.
- Frontend checks: encoding/TypeScript pass, 144 tests pass. Native: 110 tests pass and Clippy passes.
- MSI per-user template reproduced ICE38. Ruling: explicit stable components with HKCU registry key paths replace Tauri's opaque generated resource fragment; the npm Tauri wrapper supplies a TAURI-prefixed resource directory preserved by WiX. This keeps native installer validation enabled. Fixed component GUIDs are required for file-plus-registry components.
- Optimized application build completed. MSI/NSIS bundles passed; both real normal-user test installations and uninstalls exit 0.
- Native UI and provider modal tests pass. Ruling: asynchronous polling gives eight WebView creation a bounded 60-second acceptance window instead of the CDP helper's shorter synchronous promise limit; the command must actually complete.
- Single-file portable direct launch and automatic alias use the same adjacent profile. AI module/source UI verification passes.
- Independent final review found no reproducible important correctness gaps. Release 0.2.1 is packaged with hashes; the portable ZIP excludes user profiles, credentials and installer-only markers. Previous 0.2.0 files are archived and the real profile is preserved.
- GitHub source and release publication is the final remaining step.

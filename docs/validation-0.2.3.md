# Windows 0.2.3 beta validation

The packaged target is Windows x64. macOS, Linux and Android changes are source preparations, without cross-platform builds or device acceptance. Their remaining limitations are documented in [platforms.md](platforms.md).

## Automated and native acceptance

- 234 Node tests passed in a full sequential run, covering sessions, delayed transcription ownership, errors, model reasoning, document readers, context compression, account edits and agent-tool cancellation. TypeScript and text encoding checks passed. Parallel runs under simultaneous compilation exposed timing/access failures in the Windows process-cleanup fixture; its unchanged safeguards passed in the sequential run.
- 131 Rust library tests passed; Clippy passed with warnings denied. The Windows application, MSI and NSIS builds completed successfully.
- An existing database fixture retained migrations 1/2/3, its data and legacy conversation after native startup. Known migration checksum mismatches remain errors. A read-only inspection of the older installed database also found applied versions 3–7; compatibility does not erase those migration records.
- Real WebView acceptance covered the two chat panels, model footer, transcript timestamps/speaker metadata, saved WAV recordings, new/renamed/reopened sessions and precise provider errors.
- Actual DOCX/PDF file inputs were parsed in the packaged worker. Original document bytes were archived. Eight attached images survived a capture queue configured for fewer screen frames. Starting a new empty chat cleared unsent attachments.
- Context compression ran at 90%, saved its summary and preserved all 20 original source events. The chat displayed compressed context usage.
- The configured free OpenRouter model completed generic test prompts through Fluely's credential flow, with both a small output reservation and the original configured ceiling. Credentials and user conversation content were not logged or published.
- Appearance acceptance verified chat opacity, per-button opacity and shimmer changes across service/UI windows. Direct portable EXE startup created its adjacent profile and configured executable alias without a CMD launcher.
- Three standalone native icon resource tests passed. Actual settings file input saved a custom icon, changed the managed alias, embedded its ICO payload in the PE resources and retained it across a real alias restart.
- Native provider-modal acceptance renamed an existing model, added another under the same credential, retained the original key and per-model limits, and displayed the actual HTTP 401 diagnostic for an invalid replacement draft without modifying the saved key.
- A real WebView DOM drop passed through attachment intake; passive mode ignored it. A forged native drop grant was rejected. Three native tests verified one-use/expired grants, bounded file reads, unsupported formats and directory/oversize rejection. An actual Explorer/OLE pointer drag has not been automated.
- A streamed agent tool call completed through the native provider registry under a 3,500-token rolling allowance. Its text continuation recorded exactly two requests and 28 reported tokens. Shipped TTS bindings were verified as Ctrl+Alt+Z/X/Space. The tool reports the actual disconnected-workspace state and never executes arbitrary requested functions.

## Installer acceptance

Both tests ran with a normal user token. Each used a private profile containing the old migration-3 fixture, exercised installer-triggered startup and Windows Shell shortcut launch, and initialized the service and shell windows without a startup error dialog.

- NSIS upgraded the existing 0.2.2 installation to 0.2.3. The installed application remains available; user application data was preserved.
- MSI installed into a private acceptance directory and was uninstalled after verification. Existing NSIS installation registry settings were backed up and restored. No 2502/2503 occurred.
- An initial MSI acceptance attempt exposed that the installer's previous-directory search overrides an explicit `INSTALLDIR`. The test now redirects both previous-directory registry values to its private directory and restores them afterward. The installed NSIS application was subsequently restored/upgraded and verified at version 0.2.3.

## Compiler diagnostic and practical limits

The reported `rustc.exe` 0xc0000142 occurred in the restricted compilation environment. Native compilation and checks completed under the normal user outside that environment; this does not assert a machine-wide Windows repair. No broad operating-system or toolchain changes were made.

Legacy DOC/XLS/PPT/RTF conversion requires installed LibreOffice, which was unavailable on this machine; its adapter was compiled and unit checked, rather than accepted against a real LibreOffice installation. Scanned PDFs require OCR/page images. File features extract reference content for inference and preserve originals; they do not provide an Office layout editor.

Checks and bounded diagnostic tails are recorded in `_research/BUILD_LOG.md`. Temporary profiles, captured media, the copied installed database and credentials are excluded from source and release assets.

# Fluely 0.2.3 beta 1 publication

Published on 2026-10-19: [Windows beta release](https://github.com/Clawz1N1N/fluely/releases/tag/v0.2.3-beta.1).

- Source tag: `v0.2.3-beta.1`, commit `1bec75fbfe60f63414c6ba5c4533e1cda1edb695`.
- GitHub release ID: `417618774`; published, prerelease enabled, not marked latest.
- All five uploaded assets matched local sizes and GitHub's SHA256 digests before publication. The published tag resolves to the source commit above.
- Superseded release `v0.2.2-beta.1` (ID `412707361`) was removed after the new release passed verification. The final release inventory contains only this beta. Git history and older source tags were retained.
- Final MSI and NSIS normal-user installation, automatic launch with the migration-3 fixture and private Shell shortcut launch passed. The MSI fixture was uninstalled; the existing NSIS installation was updated to the final 0.2.3 binary without deleting user application data.
- The portable ZIP contains 20 explicit entries, no profile/database/media data, and exactly the same executable bytes as the standalone portable EXE.

| Asset | SHA256 |
|---|---|
| `fluely.exe` | `2073be5b9fcadbbe4219c93a0b7eb03d1d1ac68f1762588d0cf1f67e22121800` |
| `Fluely_0.2.3_x64_en-US.msi` | `c08fa500c666952a0c6632335116b1ccd056cb5d09d27ce812f88a9ff8d28cae` |
| `Fluely_0.2.3_x64-setup.exe` | `db9e026141b4aed7570774ef0f31b7764c117307bcd2cf9f361370d1935b05f0` |
| `Fluely_0.2.3_windows-x64-portable.zip` | `3926be9c0c705e4c67b97253b17f87fdb63efd01c2cb59196014712fdd5cd31b` |
| `SHA256.txt` | `e6805ade9db4b8b1d6ba9876e3e5bc034fe03d6a2f74a7b4ccc23aeb5a39b273` |

The final executable passed native startup/session, DOCX/PDF/8-image/context-compression, provider-modal/authentication/drop-intake and delayed-tool cancellation acceptance. Tool cancellation left the model healthy and the new conversation empty. The configured free OpenRouter model also completed a real native request with agent tools enabled; its key and real user conversations were not published. The full sequential Node suite passed 234 tests; Rust passed 131 library tests and Clippy with warnings denied. See [validation](validation-0.2.3.md) for scope and limitations.

macOS, Linux and Android remain [unbuilt source preparations](platforms.md). Legacy Office conversion requires installed LibreOffice. Actual Explorer/OLE pointer dragging has not been automated; native drop authorization/reader tests and WebView DOM-drop acceptance passed.

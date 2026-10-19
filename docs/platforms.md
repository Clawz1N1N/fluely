# Platform source ports

Windows x64 is the built and tested release target. macOS, Linux and Android source changes are included, but these targets have not been built or tested on a device. No APK, Linux package or macOS application is supplied with this beta.

| Capability | Windows | macOS source | Linux source | Android source |
|---|---|---|---|---|
| Cloud providers and secure credentials | Credential Manager | System Keychain | Secret Service through `secret-tool` | Android Keystore AES-GCM |
| Chats, recordings, screenshots and summaries | Native archive | Shared archive | Shared archive | Shared archive |
| Desktop overlay and shortcuts | Native windows | Desktop implementation | Desktop implementation; compositor restrictions apply | Foreground mobile UI and explicit floating controls |
| Microphone | CPAL | CPAL and macOS consent | CPAL/ALSA | Permission-aware foreground recording |
| System audio | WASAPI loopback | Core Audio process tap | PulseAudio monitor | Not connected to the mobile inference pipeline in this source beta |
| Screen capture | Native capture | OS consent required | X11 native capture; Wayland requires further portal integration | User-consented MediaProjection screenshots |
| Managed local-engine downloads | Windows x64 packages | Not packaged yet; manual compatible server configuration | Not packaged yet; manual compatible server configuration | No managed native engine package yet |
| System STT | Installed Windows recognizers | Not implemented | Not implemented | Cloud STT is connected; platform speech recognizer adapter pending |
| Custom icon | Windows and executable alias | Native window icon; packaged Dock icon unchanged | Native window icon; packaged launcher icon unchanged | Packaged launcher icon |

The macOS source configuration requires macOS 14.2 for the Core Audio process-tap implementation and merges microphone/audio/screen purpose strings plus hardened-runtime audio-input entitlement. Linux requires GTK/WebKit development libraries, ALSA and PulseAudio; secure cloud accounts require a running Secret Service and `secret-tool`. Capture exclusion, global keys and unrestricted positioning cannot be assumed on Wayland.

Android has a separate Rust startup path, mobile React view and a local Kotlin plugin. Desktop capture, window and shortcut dependencies are excluded from its Cargo target. Recording and MediaProjection start through visible user actions and foreground services; protected content can remain blank. The app cannot silently grant Android capture permission. Arbitrary launcher-icon replacement is not exposed.

For a later Android build, install the Android SDK/NDK and Java required by Tauri, initialize the generated Android host project, and use `tauri.android.conf.json`. Perform device acceptance for permissions, recording, projection lifetime, Keystore persistence and session switching before distributing an APK. The source beta does not claim desktop feature parity on Android.

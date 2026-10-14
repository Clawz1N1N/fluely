<div align="center">

<img src="src-tauri/icons/128x128.png" width="88" height="88" alt="Fluely icon" />

# Fluely

**A desktop AI assistant that stays within reach.**

Transparent controls, voice input, screen understanding, and your choice of local or cloud models.

[Download](https://github.com/Clawz1N1N/fluely/releases) · [Provider guide](docs/provider-models.md) · [Vision guide](docs/vision-methods.md) · [Sleep mode](docs/sleep-mode.md) · [Issues](https://github.com/Clawz1N1N/fluely/issues)

![Windows](https://img.shields.io/badge/platform-Windows_x64-0078D4)
![License](https://img.shields.io/badge/license-GPL--3.0-blue)
![Stack](https://img.shields.io/badge/built_with-Tauri_%2B_React_%2B_Rust-24C8D8)

</div>

Fluely combines a compact desktop overlay with chat, speech recognition, text-to-speech, and screen context. Use cloud services, run models on your own computer, or combine them. Separate provider priorities and limits let each task use the models you configure.

This is an independent fork of [Pluely](https://github.com/iamsrikanthnani/pluely), maintained by [Clawz1N1N](https://github.com/Clawz1N1N). Original authorship and GPL licensing are preserved.

## What you can do

| Feature | How it works |
|---|---|
| **Work beside your apps** | The passive answer overlay is transparent and passes clicks through. Switch into interaction mode to type, move, or resize it. |
| **Build your own controls** | Choose side strips, top/bottom strips, separate buttons, or a custom layout. Group, detach, reorder, enable, and position controls across monitors. Adjust size, spacing, columns, and opacity. |
| **Talk and listen** | Native microphone and system-audio capture feed your chosen speech recognizer. Replies can use system, cloud, or separately configured Piper voices. |
| **Understand the screen** | Send changed screenshots through a visual model, or try the experimental pixel-to-text method. Text-only reasoning models can receive scene descriptions. |
| **Choose models without writing cURL** | Add a service and API key, fetch its models, and select them in a searchable checkbox dialog. Configure multiple accounts, capabilities, context/output limits, rank, and quotas. |
| **Run locally** | Install optional CPU engines and explicitly download recommended models. Managed servers use loopback addresses; GGUF speech recognition runs in an isolated native worker. |
| **Listen in Sleep mode** | The crescent stops ordinary actions, microphone, and screenshots while system audio continues through STT and AI. A configured response marker plays your chosen alarm track on the selected output. |
| **Control visibility** | Hide and restore all Fluely windows with a shortcut. Processing continues while hidden. Settings stays off the taskbar and reopens from the gear. |

The interface supports English, Ukrainian, and Russian. First launch follows the system language; your selection is saved and shared across windows.

## Get started on Windows

Windows x64 is the primary tested platform. The application requires the [Microsoft Edge WebView2 Runtime](https://developer.microsoft.com/en-us/microsoft-edge/webview2/). Local model downloads need additional disk space and an internet connection; cloud models need their service's API key.

### Install

1. Open [Fluely Releases](https://github.com/Clawz1N1N/fluely/releases) and choose a beta's Windows MSI or `.exe` installer. Current packages install for your Windows user without administrator rights. Releases are marked **Prerelease** while the application is in beta.
2. Check the release's installation notes and checksums. Close an existing Fluely instance before updating.
3. Run the installer, then open Fluely from its installed shortcut.
4. Click the overlay **gear** to open Settings, then open **AI settings** in the navigation. Configure reasoning and, if needed, speech or vision.

If an older copy was installed for all Windows users, uninstall that copy before switching to the per-user installer. See the release notes for verified installation and upgrade paths.

### Portable use

Download `fluely.exe`, or extract the portable ZIP, into a writable folder and double-click the executable. The single EXE is enough to start Fluely when WebView2 is installed; settings and runtime data are created in a `profile` folder beside it. Documentation and the optional `START_FLUELY.cmd` launcher are included in the ZIP for convenience.

For a different profile location, run this from the folder containing `fluely.exe`:

```powershell
.\fluely.exe --fluely-profile "D:\Apps\Fluely\profile"
```

The profile path must be absolute. You can also set `FLUELY_DATA_DIR` before starting the application. The older `PLUELY_DATA_DIR` name remains supported.

Installed copies use Windows application-data locations and retain existing compatible profiles.

The profile contains settings, chat data, and optional downloaded engines/models. API secrets remain in the operating system's credential store; copying the profile does not transfer those credentials to another computer. Keep profiles out of source control.

### Set up your first model

Open **AI settings** and choose **Reasoning**, **Speech recognition**, **Text-to-speech**, or **Vision**. Each module separates **Cloud providers** and **Local engines**; speech modules also offer **System** where supported.

For a cloud service, choose the module's **Cloud providers** tab, add an account, enter its key, and use **Fetch models**. Select suitable models and save. Choose **Other** in the Provider dropdown for an OpenAI-compatible service. See the [provider guide](docs/provider-models.md) for discovery, account isolation, capabilities, and limits.

For local use, choose the module's **Local engines** tab, install an engine, download the recommended model or select compatible files, and press **Start**. Engines and models are separate downloads. Start audio listening explicitly from the overlay.

## Overlay controls

| Control | Action |
|---|---|
| Microphone | Toggle configured audio listening. |
| Camera | Capture the screen now. |
| Eye | Toggle continuous screen vision. |
| Answer / chat | Show the answer or open text input. |
| Speaker | Toggle reply speech. |
| Crescent | Enter or leave Sleep mode. |
| Gear | Open Settings. |

Default shortcuts:

- **Shift + Backslash (`\`)** toggles answer interaction mode. Press it again or **Escape** to return to the passive overlay.
- **Ctrl + Alt + H** hides all visible Fluely windows, including Settings, answers, and status. Press it again to restore the previous visibility.

Both shortcuts are configurable. Answer movement uses the monitor's work area, excluding the taskbar. Separate opacity settings cover the answer, Settings, standard strips, individual buttons, and custom groups. Status appears in a small bottom-right window.

The chat's compact toolbar provides prompt templates, reply language and length, and reasoning, speech, voice and vision model sources. Cloud lists contain your saved models and support search; the vision list requires image input. A corner reminder displays the current interaction shortcut. Each saved model has its own request and token budgets, manual pause and reasoning settings in **AI settings**.

**Neutral mode** means requests to an unavailable model wait without being sent while its rolling quota recovers. A different eligible model may be used in automatic selection; an explicitly selected model remains selected. The overlay continues running. Manually pausing a model lasts until you resume it. Zero budgets mean unlimited. Token accounting reserves a conservative input/output allowance before sending and replaces it with reported usage when available; missing usage retains the estimate.

Reasoning values are translated into each provider's protocol. Some models always reason: **Off** then uses the lowest supported setting or the provider default. Custom effort names are forwarded where supported; entering a name does not create that capability in the model.

## Local AI and speech

The built-in downloader uses pinned official runtime packages and model revisions, checks sizes and SHA-256 hashes, and keeps source/license information beside downloads. Current recommendations favor modest CPU hardware; larger compatible models can be selected manually.

| Purpose | Engine |
|---|---|
| Reasoning | [llama.cpp](https://github.com/ggml-org/llama.cpp) |
| Speech recognition | [whisper.cpp](https://github.com/ggml-org/whisper.cpp) |
| GGUF speech recognition | [transcribe.cpp](https://github.com/handy-computer/transcribe.cpp) |
| Visual understanding | llama.cpp / libmtmd |

Start with 4 threads and a 2048-token context on an 8 GB computer, then adjust to your hardware and workload. Running several models together consumes more memory than any single model. Performance and recognition accuracy depend on the model, language, audio, and machine.

**Model formats matter:** Whisper uses whisper.cpp GGML `.bin` weights. GGUF ASR needs a supported speech architecture; an ordinary reasoning GGUF is incompatible. A vision model needs its matching `mmproj` projector. Nemotron's model license is OpenMDW-1.1; it is not the same license as the application or Whisper.

For better Whisper recognition, consider a compatible multilingual `base` or `small` model instead of `tiny`, and set the spoken language when known. Larger models trade additional memory and latency for potentially better accuracy. The current pinned `b5454` engine corresponds to stable whisper.cpp `v1.9.5`; see the [CPU and model research notes](docs/whisper-cpu-options.md) for verified assets and hashes.

Windows offline speech recognition is also available through installed `System.Speech` recognizers. It does not require a cloud key or a downloaded Whisper model. If Windows has no recognizer for the chosen language, Fluely reports that explicitly; install the relevant speech pack or choose a local/cloud STT provider.

## Screen understanding

Fluely offers two methods:

- **Visual model → scene description.** An enabled image-capable model describes screenshots for the reasoning model. OCR and Windows UI Automation can supplement the description. Missing vision configuration produces an explicit error.
- **Pixel-to-text, experimental.** A local CPU conversion produces bounded luminance and color grids inspired by TheiaVision. The reasoning model interprets those grids directly, without a separate visual model.

Changed frames are deduplicated, and bounded per-monitor scene memory supports follow-up questions. Capture settings control the monitor, interval, frame count, and image size. Attached images can still go directly to an image-capable reasoning model.

Pixel grids are lossy, and small visual models can miss text, counts, and fine details. Neither method guarantees accurate object recognition. The [vision guide](docs/vision-methods.md) explains the implementation and why this is not a VDLM implementation.

## Sleep and alarms

Use **Audio → Sleep mode** to configure the additional prompt, literal alarm marker (default `<+!SOS!+>`), local track, output device, and track volume. Supported tracks are WAV, MP3, OGG, and FLAC.

During Sleep, only system audio continues into speech recognition and reasoning. Regular response TTS stays silent. Marker detection works across streamed chunks and triggers at most once per response. Leaving Sleep restores the prior listening/vision flags; transitions cancel ordinary work and discard stale context.

Use **Test alarm** to save the current settings and check the actual output route. An unavailable selected device produces an error instead of switching speakers, and track volume does not change Windows master volume. The model decides when to emit the marker; Fluely does not independently verify the condition. See the [Sleep guide](docs/sleep-mode.md).

## Data, identity, and practical limits

- **Local and cloud data:** local inference runs on your computer. Cloud providers receive the questions, audio, images, or scene text required for the selected task. API keys use the OS credential store.
- **Existing profiles:** legacy Pluely profile, database, and credential identifiers remain compatible. Rebranding does not require deleting your existing data.
- **Own process name:** release builds can launch a managed copy of Fluely with a configurable basename, default `my program.exe`. The Startup display name is configurable too. Save and explicitly restart to apply a new alias. Only Fluely's own binary/Startup entry is managed; WebView2 helper processes retain their own names.
- **Startup permissions:** Windows can deny Startup changes to an executable carrying a low-integrity sandbox label. The production routines were verified at normal user integrity; no ACL changes or privileged broker are used. A sign-in/reboot acceptance test is separate from a registry round trip.
- **Capture exclusion:** supported Windows capture paths honor the overlay's display-affinity setting. This is not a guarantee for every recorder or exclusive fullscreen application.
- **Signing and platforms:** current builds are not presented as Authenticode-signed. Changing PE metadata can invalidate a signature. Windows features have received the primary native testing; macOS/Linux source paths do not establish equivalent release support.

## Build from source

Install Node.js 22+, a current Rust stable toolchain, and the [Tauri platform prerequisites](https://v2.tauri.app/start/prerequisites/). On Windows, use Visual Studio C++ Build Tools, the Windows SDK, and WebView2.

```sh
npm ci
npm run check
npm test
cargo test --manifest-path src-tauri/Cargo.toml --lib
npm run tauri dev
```

Create release binaries and installers with:

```sh
npm run tauri build
```

`npm run build` builds the frontend only. `scripts/rust-env.cmd` configures the development machine's installed C++ tools; other machines should use their own toolchain environment. Debug builds skip the automatic process-alias relaunch. `FLUELY_DISABLE_ALIAS=1` also disables that relaunch for bounded diagnostics.

## License and attribution

Fluely is licensed under [GPL-3.0](LICENSE). Original Pluely author: [Srikanth Nani](https://github.com/iamsrikanthnani). Fork maintainer: [Clawz1N1N](https://github.com/Clawz1N1N).

Original copyright, vendored dependency licenses, and TheiaVision's MIT notice are retained. Optional runtimes and models have their own licenses; consult [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and the notices supplied with each download.

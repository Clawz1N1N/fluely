# Fluely 0.2.3 beta 1

This Windows beta repairs startup against an existing database with an applied legacy migration 3, preserving its migration ledger and data while continuing to validate registered migration checksums.

- Two-panel chat: conversation and timestamped transcription, real speaker metadata where supplied, microphone/system volume meters, chosen-model footer, quick controls and searchable session history.
- Durable sessions retain questions, full and interrupted replies, recordings with transcripts, screenshots with corresponding vision descriptions, original files and context summaries. Each application start begins with an empty chat; sessions can be renamed and reopened.
- Specific sanitized provider HTTP and streaming errors replace generic fallback failures. OpenRouter reasoning uses router parameters and JSON replies are accepted when streaming is unavailable.
- Context usage display and automatic summarization at 90%; original history remains archived. File previews and bundled Office/OpenDocument/PDF readers are included. Older Office formats require installed LibreOffice.
- Configurable PNG/ICO window icons and Windows executable-alias resources. Restart the saved process alias to apply its executable icon; Windows may cache icon displays.
- Function buttons are dimmed when their required model/source is not configured.
- Provider accounts open in a real editing modal, preserve saved keys and model settings on rename, and show discovery/authentication errors. OpenRouter keys are checked through its authenticated key endpoint.
- OpenRouter agent tools and the `cli-agent` category are supported, with a truthful workspace-status reply and bounded text continuation. TTS defaults use Ctrl+Alt+Z/X/Space. Interactive chat supports file drops and attachment history displays filenames.
- macOS, Linux and Android **source ports only**. These targets are unbuilt and unverified; see [platform limits](https://github.com/Clawz1N1N/fluely/blob/master/docs/platforms.md). Windows is the only packaged platform.

The portable EXE uses its adjacent profile; installed versions use application data. Do not delete your existing profile to repair startup. Existing legacy text history is imported read-only into the new archive. The app still requires a usable WebView2 runtime. Model/server availability and cloud free-tier routing depend on their providers.

See [attachments and context](https://github.com/Clawz1N1N/fluely/blob/master/docs/documents-context.md), [provider settings](https://github.com/Clawz1N1N/fluely/blob/master/docs/provider-models.md), [screen vision](https://github.com/Clawz1N1N/fluely/blob/master/docs/vision-methods.md) and [Windows validation](https://github.com/Clawz1N1N/fluely/blob/master/docs/validation-0.2.3.md).

# Providers, keys and models

Open **AI settings** (`/dev`) and choose **Reasoning**, **Speech recognition**, **Text-to-speech** or **Vision**, then **Cloud providers**. Choose a built-in service, enter a key, and press Fetch models. Built-in service URLs are configured internally. Other opens separate provider name, provider ID, display name, base URL and API key fields; this adapter expects an OpenAI-compatible API. The old `/dev-space` address remains an alias. General Settings contains interface appearance and capture controls rather than a duplicate provider editor.

**Local engines** shows the engines relevant to the selected module: a GGUF reasoning server, Whisper and genuine GGUF ASR speech recognition, or an image model with its matching projector. Local HTTP providers also appear in this submodule. Start a managed engine explicitly before using its registered model. **System** is available for speech recognition and text-to-speech: Windows STT lists actual installed recognizers through Fetch models, while system TTS lists available voices. Local TTS uses the existing optional Piper executable and ONNX voice model; Whisper and Nemotron are speech recognition engines, not voice generators. Save TTS settings to activate the selected backend; changing a navigation tab alone does not switch the active backend.

**Refresh providers** reloads saved provider entries and visible local engine statuses. It does not fetch every external account's model catalog; use that account's Fetch models action. Starting or stopping a local engine refreshes its provider rows and the vision choices automatically without resetting other unsaved engine configuration fields.

TTS keeps independent non-secret System, Piper and Cloud profiles for voice, language, speed, streaming and executable paths. Legacy native settings seed the profile for the currently active backend. Switching tabs loads the matching saved profile without activating it; Save first commits the native settings, then saves the profile. A failed native update leaves the saved profiles untouched. Empty or invalid legacy language/speed values use valid defaults. API keys remain in the OS credential store and are never part of these local voice profiles.

Fetch models opens a searchable checkbox dialog. Select all toggles the entire list, including rows hidden by the search. The arrows undo and redo complete selections; a new selection clears redo. Cancel closes the dialog without saving models or keys. Save selected models associates the list with that account. To add another API key for the same service, use Add provider or API key and give it a distinct display name. Keys remain in the OS credential store; metadata contains credential identifiers only.

Model capabilities are imported only when the service explicitly reports them. A model's name is not evidence of image or audio support. Check each model's context window, maximum output, image input and audio input flags before saving. Unknown values stay blank or unchecked. Manual model IDs are supported when a service does not implement model discovery. Some services list embeddings, image generation or other models alongside chat models; select models suitable for the chosen purpose.

Saved model rows allow changing rank, enablement, capabilities, token limits and request limits independently. Lower rank is attempted first. Maximum output is sent through the provider's native request parameter; context size limits retained conversation history using a conservative character budget. This is not an exact tokenizer or a guarantee that a screenshot or the current request fits. The provider remains authoritative about actual token counts.

The Vision module's screen configuration lists only enabled reasoning or vision models with image input checked. Automatic selection reserves each chosen model against its quotas; explicit selection restricts requests to that model. Updating a saved model requires Save model settings before refreshing the vision selector. Provider discovery still preserves unknown capability values for manual review rather than inferring image support from model names.

Model lists are fetched through native HTTP, avoiding WebView CORS. Gemini and Claude pagination is supported. The adapter rejects repeated cursors and cross-host next-page URLs. Model selection is published in one native registry transaction. If publication fails after a key replacement, the prior key is restored and verified; an unsuccessful restoration produces an explicit error.

Protocol sources inspected on 2026-10-13:

- [Gemini models API](https://ai.google.dev/api/models): model pagination, inputTokenLimit and outputTokenLimit.
- [Claude models API](https://platform.claude.com/docs/en/api/models/list): cursor pagination, capability objects, max_input_tokens and max_tokens. Claude requests use the Messages API and its native authentication/version headers.
- [OpenRouter model properties](https://openrouter.ai/docs/api/api-reference/models/list-all-models-and-their-properties): architecture input modalities, context_length and top-provider output limits.
- [Mistral models API](https://docs.mistral.ai/api/endpoint/models): max_context_length and declared capabilities.
- [Cohere model discovery](https://docs.cohere.com/reference/list-models) uses the native model list and pagination; [Cohere Compatibility API](https://docs.cohere.com/docs/compatibility-api) handles chat completions through the documented OpenAI-compatible endpoint.

Legacy cURL templates remain readable for existing configurations and managed Whisper transport, but the brain-provider editor no longer asks users to write cURL.

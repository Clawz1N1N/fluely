# Provider, agent and attachment corrections

- [x] Account modal edits the same provider/key and preserves model identity/settings during renaming; authentication failures and progress remain visible.
- [x] OpenRouter brain requests carry the cli-agent category and an implemented workspace-status tool; bounded continuation returns to text and each native request observes quotas.
- [x] TTS defaults become Ctrl+Alt+Z/X/Space, with one-time migration that preserves custom keys and conflicts.
- [x] Attachment presentation shows filenames while keeping full model context and archived originals.
- [x] Native and DOM drops share the file picker pipeline, only during interaction, with bounded access to genuine OS drop grants.
- [x] Re-run regression/native acceptance, rebuild Windows beta, publish and verify hashes, then remove superseded releases.

The user supplied the required behavior. These corrections extend existing flows; no external provider acceptance is promised, and no unsupported filesystem operation is pretended. macOS/Linux/Android remain source-only and unbuilt.

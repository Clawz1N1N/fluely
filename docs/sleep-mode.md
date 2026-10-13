# Sleep mode

Press the crescent on the overlay to enter Sleep. The microphone, screen capture and ordinary overlay actions stop; the settings gear and Sleep toggle remain available. System audio keeps using the configured STT provider and passes its transcript to the reasoning model. The existing listening/vision flags are restored when leaving Sleep. Hide-all remains available independently.

Open Audio → Sleep mode to configure:

- the additional prompt describing when assistance is needed;
- the exact literal alarm code, default `<+!SOS!+>`;
- a local WAV, MP3, OGG or FLAC track;
- the actual output device and track volume.

For example, ask the model to include the code when your name is called or when a timed task starts. Detection works when the code crosses streaming chunks. A response triggers at most one alarm, including provider fallback/reset. No regular response TTS plays in Sleep. A code emitted by a model is the trigger; the application does not independently determine whether the model's condition judgment is correct.

Test alarm saves the current configuration and plays the track through the selected output. Stop alarm stops playback; a stale UI cleanup cannot stop a newer playback lease. Device disappearance produces an explicit error rather than silently switching speakers. Refresh outputs after device changes. Track volume does not change Windows master volume.

System audio requires a working STT provider and the reasoning model's key or local engine. Windows speech packs, local model availability and cloud quotas still apply. A silent track, zero volume or unavailable output will not create an audible alert. Changes to the prompt/code apply to subsequent batches; changing mode cancels existing ordinary work and discards stale queued context.

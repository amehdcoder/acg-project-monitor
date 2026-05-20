# TTS + STT Optimization Roadmap

Goal: forms speak clearly, hear accurately, and keep working in noisy / offline field conditions — without rearchitecting what already ships.

## Build order (each batch is one PR-sized, testable slice)

### Batch 1 — Clarity foundation (clean speech)
- Number / date / unit / phone / percent normalizer (`2025-05-19` → "May 19, 2025"; `+2348012345678` → digits; `mg/dL` → "milligrams per deciliter"; `45%` → "45 percent").
- Expanded acronym dictionary (NTD, MDA, IDP, WASH, RDT, MoH, FCT…).
- Strip emoji + zero-width characters before synth.
- Per-chunk utterances with real pauses (label → hint → options → action), replacing the current `... Option N:` hack.

### Batch 2 — Always-instant playback
- Pre-synthesize the next 2 questions while user is answering (idle prefetch into `ttsCache`).
- Warm-cache the first 3 questions on form open (`requestIdleCallback`).
- Add `formVersion` to the cache key; raise cap to ~50 MB.

### Batch 3 — Field-grade STT
- `getUserMedia` tuned: `echoCancellation`, `noiseSuppression`, `autoGainControl`, mono, 16 kHz (extend current `enableNoiseSuppression`).
- Echo guard: reject STT transcripts that match currently-speaking TTS text (Levenshtein < 3).
- Confidence-aware confirmation: conf < 0.65 → "Did you say X?" instead of silent commit.
- Hot-word grammar / phrase biasing per `select_one` question.

### Batch 4 — Premium realtime STT with graceful fallback
- ElevenLabs Scribe v2 realtime via short-lived token edge function.
- Auto-reconnect with backoff + 2 s audio replay buffer on flaky 4G.
- Falls back to current Web Speech API / on-device Whisper-tiny when offline or quota-exhausted.

### Batch 5 — Offline neural TTS tier
- Piper / Kokoro WASM (~20 MB lazy-loaded) between ElevenLabs and `speechSynthesis`.
- Fallback chain: IndexedDB cache → ElevenLabs → Piper → browser.

### Batch 6 — Noise + barge-in polish
- Silero VAD (`@ricky0123/vad-web`, ~2 MB ONNX, CDN-loaded) for true mid-utterance barge-in (~150 ms) — hard-cancels cloud + Piper + native TTS the moment the user starts speaking.
- RNNoise WASM front-end deferred: Web Speech Recognition cannot accept an external `MediaStream`, so RNNoise can't be inserted into that pipeline. `getUserMedia` already requests browser-native noise suppression + AGC (Batch 3), which covers the same ground for SR. Re-evaluate once we move STT fully to Scribe v2 / Whisper, where we control the audio buffer.

### Batch 7 — Controls, captions, observability
- Mini-player (Play/Pause/Repeat/Prev/Next/Speed) + keyboard shortcuts.
- Live captions with word-level highlight (`onboundary` + ElevenLabs timestamps).
- `setSinkId` output device picker, Bluetooth auto-resume.
- Unified `TTSEngine` event bus (`start/boundary/end/error/fallback`).
- `localStorage` telemetry counters surfaced in Diagnostics.

## Out of scope (intentionally)
- Replacing `useVoiceFormEngine` — these upgrades feed it, not around it.
- Form-builder schema changes beyond optional `::language` label parsing (handled in Batch 4+ language work).

---

Currently building: **Batch 6** ✅ (next: Batch 7 — Controls, captions, observability).

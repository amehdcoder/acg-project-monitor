## Goal

Make the form-reader TTS noticeably more accurate, more natural, more controllable, and more resilient — both online and offline — without breaking existing call sites (`useFormTTS`, `VoiceFormOverlay`, `FormFiller`).

## Current state (verified)

- `src/hooks/useFormTTS.ts` wraps `src/lib/speech` (Web Speech API) with a confirmation-based reader, barge-in nav commands, mandatory/optional prompts, and cloned-voice mapping.
- `src/lib/speech/index.ts` forces **all speech to en-US** regardless of UI language (see `APP_LANG_TO_BCP47`) — currently a hard constraint, not a real i18n implementation.
- `useTTSPreferences` already persists rate/pitch/volume/voiceURI per user.
- ElevenLabs and `@huggingface/transformers` (Whisper) are available; an `aiCreditFallback` helper exists.

## Proposed upgrades

### 1. Premium cloud voice with graceful fallback (biggest quality win)
- Add an edge function `tts-elevenlabs` that proxies ElevenLabs `eleven_turbo_v2_5` streaming TTS using the existing `ELEVENLABS_API_KEY` secret (prompt to add it if missing).
- Add a `cloudTTS` layer in `src/lib/speech` that:
  - Streams MP3 from the edge function, plays via `<audio>` + MediaSource for low first-audio latency.
  - Caches synthesized clips in IndexedDB keyed by `(text, voiceId, lang, rate)` so the same question is instant on re-read and works fully offline after first play.
  - On 402/429/5xx or offline → falls back automatically to the existing browser `speechSynthesis` path (via `aiCreditFallback`). No silent failures.
- Expose a per-user toggle in `useTTSPreferences`: **Voice quality = Premium (cloud) / Standard (device)**.

### 2. True multilingual reading (remove the en-US lock)
- Replace the hard `SPEECH_LOCALE = "en-US"` mapping with a real BCP-47 map per app language (Hausa→`ha`, Yoruba→`yo`, Igbo→`ig`, Arabic→`ar-SA`, French→`fr-FR`, etc.).
- Keep `resolveLocaleChain` as the fallback when a device voice is missing.
- For cloud TTS, route low-resource languages (ha/yo/ig) through ElevenLabs `eleven_multilingual_v2` which handles them far better than device voices.
- Add per-question language override (form fields can carry a `::language` hint as ODK does) — read each label in its own locale.

### 3. SSML-style prosody + smarter question composition
- Extend `buildQuestionText` to emit structured chunks (label, hint, options, action) and synthesize them as separate utterances with deliberate pauses; this fixes the current “options run together” problem more reliably than the current `Option N:` hack.
- Number normalization: read `2025-05-19` as “May 19, 2025”, `+2348012345678` digit-by-digit, units (`kg`, `mg/dL`) spelled out, percentages as “percent”.
- Acronym dictionary (NTD, LGA, MDA, GPS, etc.) so they’re pronounced correctly instead of letter-by-letter when appropriate.
- Markdown/HTML stripping is already there; add emoji and zero-width-char stripping.

### 4. Reading controls in the FormFiller UI
- Floating mini-player while a sequence is active: Play/Pause, Stop, Repeat, Previous question, Next question, Speed (0.7×/1×/1.25×/1.5×), and a progress chip (“Q 4 of 12”).
- Tap-to-read: tapping any question label re-speaks just that question (uses cached cloud audio when present).
- Keyboard shortcuts: Space = pause/resume, `N` = next, `R` = repeat, `Esc` = stop.

### 5. Conversational barge-in that actually works mid-utterance
- Today, `processNavigationCommand` only fires when STT delivers a final result. Wire STT interim results into the nav-command matcher so saying “next” cuts the TTS within ~150 ms, matching Siri/Alexa cadence.
- Add a small VAD (volume threshold on the mic stream) to duck TTS volume while the user speaks even before words are recognised.

### 6. Audio output routing & device handling
- Honor `setSinkId` so users on Bluetooth headsets in noisy field conditions can pick the output device (falls back silently on iOS Safari).
- Detect headset connect/disconnect and auto-resume the queue from the current question.
- Background-tab keep-alive: current Chrome >15s workaround stays; additionally re-prime synth on `visibilitychange` so returning from a locked Android screen doesn’t leave the reader stuck.

### 7. Accessibility & UX polish
- Live captions panel: while TTS speaks, render the exact text being read with the current word highlighted (use `onboundary` events from `SpeechSynthesisUtterance`; for cloud audio, synthesize word timings via ElevenLabs `timestamps` endpoint and highlight from them).
- “Voice preview” in Settings: lets users compare device voice vs cloud voice on the same sample sentence before committing.
- Per-form override: form authors can set “read questions aloud by default” so visually-impaired enumerators don’t have to toggle it every session.

### 8. Reliability & observability
- Single `TTSEngine` event bus (`start`/`boundary`/`end`/`error`/`fallback`) so the UI doesn’t poll `isSpeaking`.
- Error normalization: surface a one-line toast on persistent failures (“Premium voice unavailable — switched to device voice”).
- Lightweight telemetry counter in `localStorage` (no PII): `tts.cloud.success`, `tts.cloud.fail`, `tts.fallback.count`, `tts.cache.hit` — exposed in the existing Settings → Diagnostics panel for support.

## Out of scope
- Changing form-builder schema beyond the optional `::language` label parser.
- Replacing the existing voice-command engine (`useVoiceFormEngine`) — these upgrades feed into it, not around it.

## Rollout order (small, reviewable PRs)
1. Locale unlock + per-language device voice picking (§2)
2. Cloud TTS edge function + IndexedDB cache + Settings toggle (§1)
3. Prosody/number/acronym normalizer (§3)
4. Mini-player + tap-to-read + shortcuts (§4)
5. Interim-result barge-in + VAD ducking (§5)
6. Sink routing, captions, telemetry (§6–§8)

If you approve, I’ll implement step 1 first and verify before moving on.
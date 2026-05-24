/**
 * Cross-module TTS playback flag.
 *
 * Lives in a leaf module so any recorder (cloud STT, on-device Whisper,
 * future streaming clients) can ask "is the app currently speaking?"
 * without importing the voice form engine — which would create a cycle.
 *
 * `useVoiceFormEngine`'s speakAsync is the sole writer; everything else
 * is read-only.
 */
let speaking = false;
let endedAt = 0;
let startedAt = 0;

export const setTTSSpeaking = (on: boolean) => {
  speaking = on;
  if (on) startedAt = Date.now();
  else endedAt = Date.now();
};
export const isTTSSpeaking = () => speaking;
export const ttsStartedAt = () => startedAt;
/** ms since the last TTS utterance ended (Infinity if still speaking). */
export const msSinceTTSEnded = () => (speaking ? 0 : Date.now() - endedAt);

/**
 * Resolves once TTS is silent for at least `settleMs` (default 150 ms),
 * or after `timeoutMs` as a safety cap. Used by external recorders to
 * avoid opening the mic while the speaker is still playing the prompt.
 */
export const waitForTTSSilence = (settleMs = 150, timeoutMs = 6000): Promise<void> =>
  new Promise((resolve) => {
    const startedAt = Date.now();
    const tick = () => {
      if (!speaking && msSinceTTSEnded() >= settleMs) return resolve();
      if (Date.now() - startedAt >= timeoutMs) return resolve();
      setTimeout(tick, 60);
    };
    tick();
  });

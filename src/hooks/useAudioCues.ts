import { useCallback, useRef } from "react";

/**
 * Lightweight audio cue system for navigation and UI feedback.
 * Uses Web Audio API for instant, low-latency sounds.
 */
export const useAudioCues = () => {
  const ctxRef = useRef<AudioContext | null>(null);

  const getCtx = useCallback(() => {
    if (!ctxRef.current || ctxRef.current.state === "closed") {
      ctxRef.current = new AudioContext();
    }
    if (ctxRef.current.state === "suspended") ctxRef.current.resume();
    return ctxRef.current;
  }, []);

  const playTone = useCallback(
    (freq: number, duration: number, type: OscillatorType = "sine", vol = 0.12) => {
      try {
        // Respect user preference
        const prefs = JSON.parse(localStorage.getItem("a11y_prefs") || "{}");
        if (prefs.audioCues === false) return;
        const masterVol = (prefs.audioCueVolume ?? 50) / 100;

        const ctx = getCtx();
        const osc = ctx.createOscillator();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, ctx.currentTime);

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(vol * masterVol, ctx.currentTime + 0.01);
        gain.gain.linearRampToValueAtTime(0, ctx.currentTime + duration);

        osc.connect(gain).connect(ctx.destination);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + duration + 0.01);
      } catch {
        // Silent fail if audio not supported
      }
    },
    [getCtx],
  );

  /** Short click/tap sound */
  const playClick = useCallback(() => playTone(800, 0.06, "sine", 0.08), [playTone]);

  /** Navigation tab switch */
  const playNavigate = useCallback(() => playTone(600, 0.1, "sine", 0.1), [playTone]);

  /** Successful action (form submit, save) */
  const playSuccess = useCallback(() => {
    playTone(523, 0.12, "sine", 0.1);
    setTimeout(() => playTone(659, 0.12, "sine", 0.1), 80);
    setTimeout(() => playTone(784, 0.15, "sine", 0.1), 160);
  }, [playTone]);

  /** Error sound */
  const playError = useCallback(() => {
    playTone(300, 0.15, "sawtooth", 0.08);
    setTimeout(() => playTone(250, 0.2, "sawtooth", 0.08), 120);
  }, [playTone]);

  /** Warning sound */
  const playWarning = useCallback(() => {
    playTone(440, 0.15, "triangle", 0.1);
    setTimeout(() => playTone(440, 0.15, "triangle", 0.1), 200);
  }, [playTone]);

  /** Swipe gesture feedback */
  const playSwipe = useCallback(() => playTone(500, 0.08, "sine", 0.06), [playTone]);

  /** Form field focus */
  const playFocus = useCallback(() => playTone(1000, 0.04, "sine", 0.05), [playTone]);

  return { playClick, playNavigate, playSuccess, playError, playWarning, playSwipe, playFocus };
};

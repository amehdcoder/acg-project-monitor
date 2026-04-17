import { useState, useCallback, useRef, useEffect } from "react";

interface VoiceDataEntryOptions {
  language?: string;
  continuous?: boolean;
  /** Auto-restart recognition when it ends unexpectedly (mobile/Chrome stop after silence). */
  autoRestart?: boolean;
  /** Maximum auto-restart attempts before giving up (resets on successful result). */
  maxRestartAttempts?: number;
  onResult?: (text: string, isFinal: boolean) => void;
  onError?: (error: string) => void;
  onListeningChange?: (listening: boolean) => void;
}

/**
 * Production-grade voice input hook.
 * - Auto-restart on silence/end (handles Chrome 60s and mobile auto-stop limits).
 * - Real-time audio level meter (visual feedback).
 * - Network/permission error recovery.
 * - Locale-aware via BCP-47 (e.g., "en-US", "fr-FR", "ar-SA", "ha-NG").
 * - Stable across React re-renders (uses refs).
 */
export const useVoiceDataEntry = (options: VoiceDataEntryOptions = {}) => {
  const {
    language = "en-US",
    continuous = true,
    autoRestart = true,
    maxRestartAttempts = 8,
    onResult,
    onError,
    onListeningChange,
  } = options;

  const [isListening, setIsListening] = useState(false);
  const [isEnabled, setIsEnabled] = useState(() => {
    const stored = localStorage.getItem("voice_data_entry_enabled");
    return stored === "true";
  });
  const [transcript, setTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [isSupported, setIsSupported] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0); // 0-100 for visual meter
  const [permissionState, setPermissionState] = useState<"granted" | "denied" | "prompt" | "unknown">("unknown");

  const recognitionRef = useRef<any>(null);
  const restartAttemptsRef = useRef(0);
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wantsListeningRef = useRef(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const audioRafRef = useRef<number | null>(null);

  // Latest callbacks via refs to avoid stale closures across restarts.
  const onResultRef = useRef(onResult);
  const onErrorRef = useRef(onError);
  const onListeningChangeRef = useRef(onListeningChange);
  onResultRef.current = onResult;
  onErrorRef.current = onError;
  onListeningChangeRef.current = onListeningChange;

  // Detect support + check permission state
  useEffect(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    setIsSupported(!!SpeechRecognition);

    // Check microphone permission (where supported)
    if (navigator.permissions && (navigator.permissions as any).query) {
      (navigator.permissions as any)
        .query({ name: "microphone" })
        .then((result: PermissionStatus) => {
          setPermissionState(result.state as any);
          result.onchange = () => setPermissionState(result.state as any);
        })
        .catch(() => setPermissionState("unknown"));
    }
  }, []);

  // ─── Audio level meter ──────────────────────────────────────
  const startAudioMeter = useCallback(async () => {
    if (audioContextRef.current) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStreamRef.current = stream;
      const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!Ctx) return;
      const ctx: AudioContext = new Ctx();
      audioContextRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.6;
      source.connect(analyser);
      analyserRef.current = analyser;

      const buffer = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(buffer);
        let sum = 0;
        for (let i = 0; i < buffer.length; i++) sum += buffer[i];
        const avg = sum / buffer.length;
        // Normalize ~ 0..100 with mild gain
        setAudioLevel(Math.min(100, Math.round((avg / 128) * 100)));
        audioRafRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch (err) {
      // Permission denied or no mic — silently disable meter
      console.warn("Audio meter unavailable:", err);
    }
  }, []);

  const stopAudioMeter = useCallback(() => {
    if (audioRafRef.current) {
      cancelAnimationFrame(audioRafRef.current);
      audioRafRef.current = null;
    }
    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach(t => t.stop());
      audioStreamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    setAudioLevel(0);
  }, []);

  // ─── Recognition lifecycle ──────────────────────────────────
  const buildRecognition = useCallback(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return null;

    const recognition = new SpeechRecognition();
    recognition.continuous = continuous;
    recognition.interimResults = true;
    recognition.lang = language;
    recognition.maxAlternatives = 3; // give engine 3 candidates → improves accuracy

    recognition.onresult = (event: any) => {
      // Reset restart counter on any successful result
      restartAttemptsRef.current = 0;
      let interim = "";
      let final = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        // Pick best of N alternatives by confidence
        let best = result[0];
        for (let a = 1; a < result.length; a++) {
          if (result[a].confidence > best.confidence) best = result[a];
        }
        if (result.isFinal) {
          final += best.transcript;
        } else {
          interim += best.transcript;
        }
      }
      if (final) {
        const trimmed = final.trim();
        setTranscript(prev => prev + (prev ? " " : "") + trimmed);
        onResultRef.current?.(trimmed, true);
      }
      setInterimTranscript(interim);
      if (interim) onResultRef.current?.(interim, false);
    };

    recognition.onerror = (event: any) => {
      const err = event.error as string;
      // Benign errors — keep listening
      if (err === "no-speech" || err === "aborted") return;
      console.warn("Speech recognition error:", err);
      onErrorRef.current?.(err);
      // Hard errors stop the loop
      if (err === "not-allowed" || err === "service-not-allowed") {
        wantsListeningRef.current = false;
        setPermissionState("denied");
        setIsListening(false);
        onListeningChangeRef.current?.(false);
        stopAudioMeter();
      }
    };

    recognition.onstart = () => {
      setIsListening(true);
      onListeningChangeRef.current?.(true);
    };

    recognition.onend = () => {
      // Auto-restart if user still wants to listen and we haven't exceeded attempts
      if (
        autoRestart &&
        wantsListeningRef.current &&
        restartAttemptsRef.current < maxRestartAttempts
      ) {
        restartAttemptsRef.current += 1;
        // Small backoff to avoid tight loops on permission/network errors
        const delay = Math.min(150 * restartAttemptsRef.current, 1500);
        if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
        restartTimerRef.current = setTimeout(() => {
          if (!wantsListeningRef.current) return;
          try {
            recognition.start();
          } catch (e) {
            // Already started or invalid state — recreate fresh instance
            const fresh = buildRecognition();
            if (fresh) {
              recognitionRef.current = fresh;
              try { fresh.start(); } catch { /* give up silently */ }
            }
          }
        }, delay);
      } else {
        setIsListening(false);
        onListeningChangeRef.current?.(false);
        setInterimTranscript("");
        stopAudioMeter();
      }
    };

    return recognition;
  }, [language, continuous, autoRestart, maxRestartAttempts, stopAudioMeter]);

  const startListening = useCallback(() => {
    if (!isEnabled || !isSupported) return;
    if (wantsListeningRef.current) return; // already running
    wantsListeningRef.current = true;
    restartAttemptsRef.current = 0;

    const recognition = buildRecognition();
    if (!recognition) return;
    recognitionRef.current = recognition;

    try {
      recognition.start();
      // Start audio meter for visual feedback
      startAudioMeter();
    } catch (err: any) {
      // InvalidStateError if already started — try one recreate
      console.warn("Recognition start failed:", err);
      try {
        recognition.stop();
      } catch { /* noop */ }
      setTimeout(() => {
        if (!wantsListeningRef.current) return;
        const fresh = buildRecognition();
        if (fresh) {
          recognitionRef.current = fresh;
          try { fresh.start(); startAudioMeter(); } catch { /* noop */ }
        }
      }, 200);
    }
  }, [isEnabled, isSupported, buildRecognition, startAudioMeter]);

  const stopListening = useCallback(() => {
    wantsListeningRef.current = false;
    restartAttemptsRef.current = 0;
    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch { /* noop */ }
      recognitionRef.current = null;
    }
    setIsListening(false);
    setInterimTranscript("");
    onListeningChangeRef.current?.(false);
    stopAudioMeter();
  }, [stopAudioMeter]);

  const toggleEnabled = useCallback((value: boolean) => {
    setIsEnabled(value);
    localStorage.setItem("voice_data_entry_enabled", String(value));
    if (!value) stopListening();
  }, [stopListening]);

  const clearTranscript = useCallback(() => {
    setTranscript("");
    setInterimTranscript("");
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      wantsListeningRef.current = false;
      if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch { /* noop */ }
      }
      stopAudioMeter();
    };
  }, [stopAudioMeter]);

  return {
    isListening,
    isEnabled,
    isSupported,
    transcript,
    interimTranscript,
    audioLevel,
    permissionState,
    toggleEnabled,
    startListening,
    stopListening,
    clearTranscript,
  };
};

export default useVoiceDataEntry;

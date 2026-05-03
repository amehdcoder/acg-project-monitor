import { useEffect, useState, useCallback } from "react";
import { tts } from "@/lib/speech";
import { useAuth } from "@/hooks/useAuth";

export interface TTSPreferences {
  rate: number;   // 0.5–1.6
  pitch: number;  // 0–2
  volume: number; // 0–1
  voiceURI: string | null;
}

export const DEFAULT_TTS_PREFS: TTSPreferences = {
  rate: 0.95,
  pitch: 1.0,
  volume: 1.0,
  voiceURI: null,
};

const keyFor = (userId?: string | null) =>
  `tts_prefs_${userId || "anon"}`;

/** Read prefs synchronously (used by speech callers without React state). */
export function getTTSPreferences(userId?: string | null): TTSPreferences {
  try {
    const raw = localStorage.getItem(keyFor(userId));
    if (raw) return { ...DEFAULT_TTS_PREFS, ...JSON.parse(raw) };
  } catch {}
  return DEFAULT_TTS_PREFS;
}

export function useTTSPreferences() {
  const { user } = useAuth();
  const userId = user?.id;
  const [prefs, setPrefs] = useState<TTSPreferences>(() => getTTSPreferences(userId));
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>(() => tts.listVoices());

  // Reload when user changes
  useEffect(() => {
    setPrefs(getTTSPreferences(userId));
  }, [userId]);

  // Keep voices list current (browsers populate async)
  useEffect(() => {
    const refresh = () => setVoices(tts.listVoices());
    refresh();
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.addEventListener?.("voiceschanged", refresh);
      return () =>
        window.speechSynthesis.removeEventListener?.("voiceschanged", refresh);
    }
  }, []);

  const update = useCallback(
    (patch: Partial<TTSPreferences>) => {
      setPrefs((prev) => {
        const next = { ...prev, ...patch };
        try {
          localStorage.setItem(keyFor(userId), JSON.stringify(next));
        } catch {}
        return next;
      });
    },
    [userId],
  );

  const reset = useCallback(() => {
    try {
      localStorage.removeItem(keyFor(userId));
    } catch {
      // Ignore
    }
    setPrefs(DEFAULT_TTS_PREFS);
  }, [userId]);

  const preview = useCallback(
    (text = "This is a preview of your selected voice and settings.") => {
      tts.cancel();
      tts.speak(text, {
        rate: prefs.rate,
        pitch: prefs.pitch,
        volume: prefs.volume,
        voiceURI: prefs.voiceURI || undefined,
      });
    },
    [prefs],
  );

  return { prefs, update, reset, voices, preview };
}

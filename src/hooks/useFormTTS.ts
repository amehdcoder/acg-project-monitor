import { useState, useCallback, useEffect } from "react";

interface UseFormTTSOptions {
  enabled: boolean;
}

export const useFormTTS = ({ enabled }: UseFormTTSOptions) => {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const synth = typeof window !== "undefined" ? window.speechSynthesis : null;

  useEffect(() => {
    return () => {
      synth?.cancel();
    };
  }, [synth]);

  const speak = useCallback((text: string, priority = false) => {
    if (!enabled || !synth) return;
    if (priority) synth.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.85;
    utterance.pitch = 1;
    utterance.lang = "en-US";
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    synth.speak(utterance);
  }, [enabled, synth]);

  const speakQuestion = useCallback((label: string, type: string, options?: string[]) => {
    if (!enabled) return;
    let text = `Question: ${label}.`;
    if (options?.length) {
      text += ` Options are: ${options.join(", ")}.`;
    }
    if (type === "text" || type === "number") {
      text += ` Please type your answer.`;
    }
    speak(text, true);
  }, [enabled, speak]);

  const speakValidationError = useCallback((error: string) => {
    if (!enabled) return;
    speak(`Error: ${error}`, true);
  }, [enabled, speak]);

  const stop = useCallback(() => {
    synth?.cancel();
    setIsSpeaking(false);
  }, [synth]);

  const speakAudioDescription = useCallback((description: string) => {
    if (!enabled) return;
    speak(description);
  }, [enabled, speak]);

  return { speak, speakQuestion, speakValidationError, speakAudioDescription, stop, isSpeaking, enabled };
};

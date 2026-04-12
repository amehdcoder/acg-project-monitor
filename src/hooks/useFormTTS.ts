import { useState, useCallback, useRef, useEffect } from "react";

interface UseFormTTSOptions {
  enabled: boolean;
}

export const useFormTTS = ({ enabled }: UseFormTTSOptions) => {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const synth = useRef(typeof window !== "undefined" ? window.speechSynthesis : null);

  useEffect(() => {
    return () => {
      synth.current?.cancel();
    };
  }, []);

  const speak = useCallback((text: string, priority = false) => {
    if (!enabled || !synth.current) return;
    if (priority) synth.current.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.85;
    utterance.pitch = 1;
    utterance.lang = "en-US";
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    synth.current.speak(utterance);
  }, [enabled]);

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
    synth.current?.cancel();
    setIsSpeaking(false);
  }, []);

  const speakAudioDescription = useCallback((description: string) => {
    if (!enabled) return;
    speak(description);
  }, [enabled, speak]);

  return { speak, speakQuestion, speakValidationError, speakAudioDescription, stop, isSpeaking, enabled };
};

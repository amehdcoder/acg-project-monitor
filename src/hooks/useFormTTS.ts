import { useState, useCallback, useEffect, useRef } from "react";

interface UseFormTTSOptions {
  enabled: boolean;
}

export const useFormTTS = ({ enabled }: UseFormTTSOptions) => {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const synth = typeof window !== "undefined" ? window.speechSynthesis : null;
  const spokenQuestionsRef = useRef<Set<string>>(new Set());
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);

  // Pick a gentle, natural-sounding voice when available
  useEffect(() => {
    if (!synth) return;
    const pickVoice = () => {
      const voices = synth.getVoices();
      // Prefer soft / female English voices that sound gentler
      const preferred = voices.find(
        (v) => v.lang.startsWith("en") && /samantha|karen|fiona|victoria|google.*female|zira/i.test(v.name)
      );
      voiceRef.current = preferred || voices.find((v) => v.lang.startsWith("en")) || null;
    };
    pickVoice();
    synth.addEventListener("voiceschanged", pickVoice);
    return () => synth.removeEventListener("voiceschanged", pickVoice);
  }, [synth]);

  useEffect(() => {
    return () => {
      synth?.cancel();
    };
  }, [synth]);

  // Reset spoken tracking when TTS is toggled off/on
  useEffect(() => {
    if (!enabled) {
      spokenQuestionsRef.current.clear();
    }
  }, [enabled]);

  const speak = useCallback((text: string, priority = false) => {
    if (!enabled || !synth) return;
    if (priority) synth.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.78; // Gentle, unhurried pace
    utterance.pitch = 1.05; // Slightly warm pitch
    utterance.volume = 0.85; // Slightly softer than max
    utterance.lang = "en-US";
    if (voiceRef.current) utterance.voice = voiceRef.current;
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    synth.speak(utterance);
  }, [enabled, synth]);

  const speakQuestion = useCallback((label: string, type: string, options?: string[], questionId?: string) => {
    if (!enabled) return;

    // If we have a questionId, only speak each question once per session
    if (questionId) {
      if (spokenQuestionsRef.current.has(questionId)) return;
      spokenQuestionsRef.current.add(questionId);
    }

    // Strip any HTML tags from the label
    const cleanLabel = label.replace(/<[^>]*>/g, "").trim();

    let text = cleanLabel + ".";
    if (options?.length) {
      // Add a brief pause then list options gently
      text += ` Your options are: ${options.join(", ")}.`;
    }
    if (type === "text") {
      text += " Please type your answer.";
    } else if (type === "number" || type === "integer" || type === "decimal") {
      text += " Please enter a number.";
    } else if (type === "date") {
      text += " Please select a date.";
    } else if (type === "gps") {
      text += " Tap the button to capture your location.";
    } else if (type === "photo" || type === "image") {
      text += " Tap to take or upload a photo.";
    } else if (type === "audio") {
      text += " Tap to record audio.";
    } else if (type === "video") {
      text += " Tap to record video.";
    } else if (type === "signature") {
      text += " Please draw your signature.";
    } else if (type === "barcode") {
      text += " Tap to scan a barcode.";
    }
    speak(text, true);
  }, [enabled, speak]);

  const speakValidationError = useCallback((error: string) => {
    if (!enabled) return;
    speak(`Please note: ${error}`, true);
  }, [enabled, speak]);

  const stop = useCallback(() => {
    synth?.cancel();
    setIsSpeaking(false);
  }, [synth]);

  const speakAudioDescription = useCallback((description: string) => {
    if (!enabled) return;
    speak(description);
  }, [enabled, speak]);

  /** Reset spoken-questions tracking (e.g. when navigating to a new group) */
  const resetSpokenQuestions = useCallback(() => {
    spokenQuestionsRef.current.clear();
  }, []);

  return { speak, speakQuestion, speakValidationError, speakAudioDescription, stop, isSpeaking, enabled, resetSpokenQuestions };
};

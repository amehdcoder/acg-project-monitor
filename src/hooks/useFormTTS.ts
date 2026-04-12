import { useState, useCallback, useEffect, useRef } from "react";

interface UseFormTTSOptions {
  enabled: boolean;
}

interface QuestionInfo {
  id: string;
  label: string;
  type: string;
  options?: string[];
  required?: boolean;
}

export const useFormTTS = ({ enabled }: UseFormTTSOptions) => {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const synth = typeof window !== "undefined" ? window.speechSynthesis : null;
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const queueRef = useRef<QuestionInfo[]>([]);
  const currentIndexRef = useRef<number>(-1);
  const isReadingSequenceRef = useRef(false);

  // Pick a gentle, natural-sounding voice when available
  useEffect(() => {
    if (!synth) return;
    const pickVoice = () => {
      const voices = synth.getVoices();
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

  const buildQuestionText = useCallback((label: string, type: string, options?: string[], _questionId?: string, required?: boolean) => {
    const cleanLabel = label.replace(/<[^>]*>/g, "").trim();
    let text = cleanLabel + ".";
    
    // Announce mandatory or optional status
    if (required) {
      text += " This question is mandatory.";
    } else {
      text += " This question is optional.";
    }
    
    if (options?.length) {
      text += ` Your options are: ${options.join(", ")}.`;
    }
    if (type === "text") {
      text += " Please type your answer, or say it aloud.";
    } else if (type === "number" || type === "integer" || type === "decimal") {
      text += " Please enter a number, or say it aloud.";
    } else if (type === "date") {
      text += " Please select a date, or say the date aloud.";
    } else if (type === "time") {
      text += " Please select a time, or say the time aloud.";
    } else if (type === "select_one") {
      text += " Say the name of your choice to select it.";
    } else if (type === "select_multiple") {
      text += " Say the name of each option you want to select.";
    } else if (type === "geopoint" || type === "gps") {
      text += " Say 'capture location' or tap the button to get your GPS position.";
    } else if (type === "photo" || type === "image") {
      text += " Say 'take photo' or tap the button to capture an image.";
    } else if (type === "audio") {
      text += " Say 'record audio' or tap the button to start recording.";
    } else if (type === "video") {
      text += " Say 'record video' or tap the button to start recording.";
    } else if (type === "signature") {
      text += " Please draw your signature on the pad below.";
    } else if (type === "barcode") {
      text += " Say 'scan barcode' or tap the button to scan.";
    } else if (type === "acknowledge") {
      text += " Say 'acknowledge' or tap the checkbox to confirm.";
    }
    return text;
  }, []);

  const speakText = useCallback((text: string, onEnd?: () => void) => {
    if (!enabled || !synth) return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.78;
    utterance.pitch = 1.05;
    utterance.volume = 0.85;
    utterance.lang = "en-US";
    if (voiceRef.current) utterance.voice = voiceRef.current;
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => {
      setIsSpeaking(false);
      onEnd?.();
    };
    utterance.onerror = () => {
      setIsSpeaking(false);
      onEnd?.();
    };
    synth.speak(utterance);
  }, [enabled, synth]);

  const readNextInQueue = useCallback(() => {
    if (!isReadingSequenceRef.current) return;
    currentIndexRef.current++;
    const idx = currentIndexRef.current;
    const queue = queueRef.current;
    if (idx >= queue.length) {
      isReadingSequenceRef.current = false;
      currentIndexRef.current = -1;
      return;
    }
    const q = queue[idx];
    const text = buildQuestionText(q.label, q.type, q.options);
    speakText(text, readNextInQueue);
  }, [buildQuestionText, speakText]);

  /** Read all questions sequentially from a given index */
  const speakFromIndex = useCallback((questions: QuestionInfo[], startIndex = 0) => {
    if (!enabled || !synth) return;
    synth.cancel();
    isReadingSequenceRef.current = true;
    queueRef.current = questions;
    currentIndexRef.current = startIndex - 1; // readNext increments first
    readNextInQueue();
  }, [enabled, synth, readNextInQueue]);

  /** Read a single question (e.g. on tap) then continue reading the rest */
  const speakFromQuestion = useCallback((questions: QuestionInfo[], questionId: string) => {
    const idx = questions.findIndex(q => q.id === questionId);
    if (idx === -1) return;
    speakFromIndex(questions, idx);
  }, [speakFromIndex]);

  const speak = useCallback((text: string, priority = false) => {
    if (!enabled || !synth) return;
    if (priority) {
      synth.cancel();
      isReadingSequenceRef.current = false;
    }
    speakText(text);
  }, [enabled, synth, speakText]);

  const speakQuestion = useCallback((label: string, type: string, options?: string[], _questionId?: string) => {
    if (!enabled) return;
    const text = buildQuestionText(label, type, options);
    speak(text, true);
  }, [enabled, speak, buildQuestionText]);

  const speakValidationError = useCallback((error: string) => {
    if (!enabled) return;
    speak(`Please note: ${error}`, true);
  }, [enabled, speak]);

  const stop = useCallback(() => {
    synth?.cancel();
    isReadingSequenceRef.current = false;
    currentIndexRef.current = -1;
    setIsSpeaking(false);
  }, [synth]);

  const speakAudioDescription = useCallback((description: string) => {
    if (!enabled) return;
    speak(description);
  }, [enabled, speak]);

  const resetSpokenQuestions = useCallback(() => {
    // no-op kept for backward compat
  }, []);

  return {
    speak,
    speakQuestion,
    speakValidationError,
    speakAudioDescription,
    speakFromIndex,
    speakFromQuestion,
    stop,
    isSpeaking,
    enabled,
    resetSpokenQuestions,
    buildQuestionText,
  };
};

import { useState, useCallback, useEffect, useRef } from "react";

interface UseFormTTSOptions {
  enabled: boolean;
  /** Called when TTS finishes reading a question and is waiting for user confirmation */
  onAwaitingConfirmation?: (questionId: string) => void;
  /** Called when TTS moves to next question */
  onQuestionAdvanced?: (questionId: string) => void;
  /** Check if a question has been answered */
  getResponse?: (questionId: string) => any;
}

export interface QuestionInfo {
  id: string;
  label: string;
  type: string;
  options?: string[];
  required?: boolean;
}

export const useFormTTS = ({ enabled, onAwaitingConfirmation, onQuestionAdvanced, getResponse }: UseFormTTSOptions) => {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);
  const [currentQuestionId, setCurrentQuestionId] = useState<string | null>(null);
  const synth = typeof window !== "undefined" ? window.speechSynthesis : null;
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const queueRef = useRef<QuestionInfo[]>([]);
  const currentIndexRef = useRef<number>(-1);
  const isReadingSequenceRef = useRef(false);
  const getResponseRef = useRef(getResponse);

  // Keep ref up to date
  useEffect(() => {
    getResponseRef.current = getResponse;
  }, [getResponse]);

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
    // Chrome workaround: cancel any stale queue
    synth.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.65; // Very gentle, slow pace for visually impaired users
    utterance.pitch = 1.05;
    utterance.volume = 0.9;
    utterance.lang = "en-US";
    if (voiceRef.current) utterance.voice = voiceRef.current;
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => {
      setIsSpeaking(false);
      onEnd?.();
    };
    utterance.onerror = (e) => {
      // Ignore 'interrupted' errors from cancel()
      if (e.error === 'interrupted') return;
      setIsSpeaking(false);
      onEnd?.();
    };
    synth.speak(utterance);
  }, [enabled, synth]);

  /**
   * After reading a question, enter "awaiting confirmation" mode.
   * The user must say "next", "continue", "yes", "skip", or "go" to proceed.
   */
  const enterConfirmationMode = useCallback((questionId: string) => {
    setAwaitingConfirmation(true);
    setCurrentQuestionId(questionId);
    onAwaitingConfirmation?.(questionId);
  }, [onAwaitingConfirmation]);

  const readCurrentQuestion = useCallback(() => {
    if (!isReadingSequenceRef.current) return;
    const idx = currentIndexRef.current;
    const queue = queueRef.current;
    if (idx >= queue.length) {
      // All questions read
      isReadingSequenceRef.current = false;
      currentIndexRef.current = -1;
      setAwaitingConfirmation(false);
      setCurrentQuestionId(null);
      speakText("All questions have been read. Please review your answers and submit the form.");
      return;
    }
    const q = queue[idx];
    const text = buildQuestionText(q.label, q.type, q.options, q.id, q.required);
    
    // After reading the question text, enter confirmation mode
    speakText(text, () => {
      if (!isReadingSequenceRef.current) return;
      // Small pause then prompt for confirmation
      setTimeout(() => {
        if (!isReadingSequenceRef.current) return;
        enterConfirmationMode(q.id);
        // Speak the prompt
        const promptText = "Say 'next' or 'continue' when you are ready to proceed to the next question.";
        speakText(promptText);
      }, 600);
    });
  }, [buildQuestionText, speakText, enterConfirmationMode]);

  /**
   * User confirmed to proceed to next question.
   * Called from voice command processing or a UI button.
   */
  const confirmAndAdvance = useCallback(() => {
    if (!isReadingSequenceRef.current) return;
    
    const idx = currentIndexRef.current;
    const queue = queueRef.current;
    const currentQ = idx >= 0 && idx < queue.length ? queue[idx] : null;
    
    setAwaitingConfirmation(false);
    
    if (currentQ) {
      const response = getResponseRef.current?.(currentQ.id);
      const hasAnswer = response !== undefined && response !== null && response !== "" && 
        !(Array.isArray(response) && response.length === 0);
      
      if (currentQ.required && !hasAnswer) {
        // Mandatory and not answered — gently remind and stay on this question
        speakText(
          "This question is mandatory and has not been answered yet. Please provide your answer, then say 'next' to continue.",
          () => {
            enterConfirmationMode(currentQ.id);
          }
        );
        return;
      }
      
      if (!currentQ.required && !hasAnswer) {
        // Optional and not answered — gently inform and move on
        speakText("This optional question has not been answered. Moving to the next question.", () => {
          advanceToNext();
        });
        return;
      }
      
      // Answered — acknowledge and move on
      speakText("Thank you. Moving to the next question.", () => {
        advanceToNext();
      });
    } else {
      advanceToNext();
    }
  }, [speakText, enterConfirmationMode]);

  const advanceToNext = useCallback(() => {
    currentIndexRef.current++;
    const idx = currentIndexRef.current;
    const queue = queueRef.current;
    if (idx < queue.length) {
      onQuestionAdvanced?.(queue[idx].id);
      setCurrentQuestionId(queue[idx].id);
      readCurrentQuestion();
    } else {
      // Done
      isReadingSequenceRef.current = false;
      currentIndexRef.current = -1;
      setCurrentQuestionId(null);
      speakText("All questions have been read. Please review your answers and submit the form.");
    }
  }, [readCurrentQuestion, speakText, onQuestionAdvanced]);

  /**
   * Process voice input to check for navigation commands.
   * Returns true if the input was a navigation command (next/continue/skip).
   */
  const processNavigationCommand = useCallback((text: string): boolean => {
    if (!awaitingConfirmation) return false;
    const lower = text.toLowerCase().trim();
    const navCommands = [
      "next", "continue", "yes", "go", "proceed", "skip", 
      "next question", "go ahead", "move on", "carry on",
      "yes please", "okay", "ok"
    ];
    if (navCommands.some(cmd => lower.includes(cmd))) {
      confirmAndAdvance();
      return true;
    }
    // "repeat" or "read again" — re-read current question
    if (lower.includes("repeat") || lower.includes("again") || lower.includes("read again")) {
      readCurrentQuestion();
      return true;
    }
    return false;
  }, [awaitingConfirmation, confirmAndAdvance, readCurrentQuestion]);

  /** Read all questions sequentially from a given index */
  const speakFromIndex = useCallback((questions: QuestionInfo[], startIndex = 0) => {
    if (!enabled || !synth) return;
    synth.cancel();
    isReadingSequenceRef.current = true;
    queueRef.current = questions;
    currentIndexRef.current = startIndex;
    setAwaitingConfirmation(false);
    if (questions.length > 0 && startIndex < questions.length) {
      setCurrentQuestionId(questions[startIndex].id);
      onQuestionAdvanced?.(questions[startIndex].id);
    }
    readCurrentQuestion();
  }, [enabled, synth, readCurrentQuestion, onQuestionAdvanced]);

  /** Read from a specific question by ID */
  const speakFromQuestion = useCallback((questions: QuestionInfo[], questionId: string) => {
    const idx = questions.findIndex(q => q.id === questionId);
    if (idx === -1) return;
    speakFromIndex(questions, idx);
  }, [speakFromIndex]);

  const speak = useCallback((text: string, priority = false) => {
    if (!enabled || !synth) return;
    if (priority) {
      synth.cancel();
      // Don't stop the sequence — just interrupt for a brief announcement
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
    setAwaitingConfirmation(false);
    setCurrentQuestionId(null);
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
    // New confirmation-based flow
    awaitingConfirmation,
    currentQuestionId,
    confirmAndAdvance,
    processNavigationCommand,
  };
};

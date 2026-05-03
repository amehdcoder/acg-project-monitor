import { useState, useCallback, useEffect, useRef } from "react";
import { useActiveVoiceProfile } from "@/hooks/useVoiceCloning";
import { tts, appLangToBCP47 } from "@/lib/speech";
import { useLanguage } from "@/hooks/useLanguage";
import { getTTSPreferences } from "@/hooks/useTTSPreferences";
import { useAuth } from "@/hooks/useAuth";

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
  const queueRef = useRef<QuestionInfo[]>([]);
  const currentIndexRef = useRef<number>(-1);
  const isReadingSequenceRef = useRef(false);
  const getResponseRef = useRef(getResponse);
  const { profile: clonedVoice } = useActiveVoiceProfile();
  const { language } = useLanguage();
  const locale = appLangToBCP47(language);

  // Keep ref up to date
  useEffect(() => {
    getResponseRef.current = getResponse;
  }, [getResponse]);

  // Keep the unified TTS service in sync with the active app language.
  // The service handles voice prewarm + per-locale fallback chain centrally.
  useEffect(() => {
    tts.setLanguage(locale);
  }, [locale]);

  // Cancel any in-flight speech on unmount
  useEffect(() => {
    return () => { tts.cancel(); };
  }, []);

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
      // Read each option distinctly with its number and a clear pause so that
      // very short answers (e.g. "No", "Yes") are never swallowed when the
      // synthesiser glides over a comma list. Each option is announced as
      // "Option N: <label>." which forces the engine to emit a full sentence
      // boundary and gives the user time to hear it.
      const numbered = options
        .map((opt, idx) => {
          const clean = String(opt ?? "").replace(/<[^>]*>/g, "").trim();
          // Spell out very short answers so they're unmistakable when read.
          const expanded =
            /^no$/i.test(clean) ? "No (the answer No)"
            : /^yes$/i.test(clean) ? "Yes (the answer Yes)"
            : clean;
          return `Option ${idx + 1}: ${expanded}.`;
        })
        .join(" ");
      text += ` Your options are. ${numbered}`;
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

  const { user } = useAuth();
  const speakText = useCallback((text: string, onEnd?: () => void) => {
    if (!enabled || !tts.isSupported()) { onEnd?.(); return; }
    setIsSpeaking(true);
    // Per-user TTS preferences take precedence; fall back to cloned-voice
    // signature, then to gentle defaults.
    const userPrefs = getTTSPreferences(user?.id);
    const base = clonedVoice
      ? {
          lang: clonedVoice.features.preferredLang || locale,
          voiceURI: clonedVoice.features.preferredVoiceURI,
          pitch: Math.max(0.4, Math.min(2.0, clonedVoice.features.meanPitch / 130)),
          rate: Math.max(0.6, Math.min(1.2, clonedVoice.features.speakingRate * 0.85)),
          volume: Math.max(0.7, Math.min(1.0, 0.7 + clonedVoice.features.energy * 0.3)),
        }
      : { lang: locale, rate: 0.95, pitch: 1.0, volume: 1.0 };
    const opts: any = {
      ...base,
      rate: userPrefs.rate ?? base.rate,
      pitch: userPrefs.pitch ?? base.pitch,
      volume: userPrefs.volume ?? base.volume,
      voiceURI: userPrefs.voiceURI || base.voiceURI,
    };
    tts.speak(text, opts).finally(() => {
      setIsSpeaking(false);
      onEnd?.();
    });
  }, [enabled, clonedVoice, locale, user?.id]);

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
    // Allow barge-in: accept commands while TTS is still speaking too, so the
    // exchange feels like a natural conversation instead of a strict
    // turn-taking reader. Any recognised command immediately cancels speech.
    if (!awaitingConfirmation && !isSpeaking) return false;
    const lower = text.toLowerCase().trim();
    const navCommands = [
      "next", "continue", "yes", "go", "proceed", "skip",
      "next question", "go ahead", "move on", "carry on",
      "yes please", "okay", "ok"
    ];
    if (navCommands.some(cmd => lower.includes(cmd))) {
      tts.cancel(); // duck the prompt, like Siri/Alexa barge-in
      confirmAndAdvance();
      return true;
    }
    // "repeat" or "read again" — re-read current question
    if (lower.includes("repeat") || lower.includes("again") || lower.includes("read again")) {
      tts.cancel();
      readCurrentQuestion();
      return true;
    }
    return false;
  }, [awaitingConfirmation, isSpeaking, confirmAndAdvance, readCurrentQuestion]);

  /** Read all questions sequentially from a given index */
  const speakFromIndex = useCallback((questions: QuestionInfo[], startIndex = 0) => {
    if (!enabled || !tts.isSupported()) return;
    tts.cancel();
    isReadingSequenceRef.current = true;
    queueRef.current = questions;
    currentIndexRef.current = startIndex;
    setAwaitingConfirmation(false);
    if (questions.length > 0 && startIndex < questions.length) {
      setCurrentQuestionId(questions[startIndex].id);
      onQuestionAdvanced?.(questions[startIndex].id);
    }
    readCurrentQuestion();
  }, [enabled, readCurrentQuestion, onQuestionAdvanced]);

  /** Read from a specific question by ID */
  const speakFromQuestion = useCallback((questions: QuestionInfo[], questionId: string) => {
    const idx = questions.findIndex(q => q.id === questionId);
    if (idx === -1) return;
    speakFromIndex(questions, idx);
  }, [speakFromIndex]);

  const speak = useCallback((text: string, priority = false) => {
    if (!enabled || !tts.isSupported()) return;
    if (priority) {
      // Interrupt any in-flight utterance for a brief announcement.
      tts.cancel();
    }
    speakText(text);
  }, [enabled, speakText]);

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
    tts.cancel();
    isReadingSequenceRef.current = false;
    currentIndexRef.current = -1;
    setIsSpeaking(false);
    setAwaitingConfirmation(false);
    setCurrentQuestionId(null);
  }, []);

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

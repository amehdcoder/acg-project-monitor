import { useState, useCallback, useEffect, useRef } from "react";
import { useActiveVoiceProfile } from "@/hooks/useVoiceCloning";
import { tts, appLangToBCP47, runOnIdle } from "@/lib/speech";
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
  /**
   * Optional form-version token (e.g. updated_at timestamp). Participates in
   * the TTS cache key so a form edit invalidates stale audio automatically.
   */
  formVersion?: string | number;
}

export interface QuestionInfo {
  id: string;
  label: string;
  type: string;
  options?: string[];
  required?: boolean;
}

export const useFormTTS = ({ enabled, onAwaitingConfirmation, onQuestionAdvanced, getResponse, formVersion }: UseFormTTSOptions) => {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);
  const [currentQuestionId, setCurrentQuestionId] = useState<string | null>(null);
  const queueRef = useRef<QuestionInfo[]>([]);
  const currentIndexRef = useRef<number>(-1);
  const isReadingSequenceRef = useRef(false);
  const getResponseRef = useRef(getResponse);
  /** Tracks which indices we've already prefetched so we don't refetch. */
  const prefetchedRef = useRef<Set<number>>(new Set());
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

  /**
   * Build the question as an ordered set of speech chunks with deliberate
   * pauses between them. Each chunk becomes its own utterance, so the synth
   * emits a real sentence boundary between the label, the mandatory/optional
   * hint, each option, and the action prompt. This eliminates the "options
   * run together" problem and makes very short answers ("Yes", "No") clearly
   * audible.
   */
  const buildQuestionChunks = useCallback((
    label: string,
    type: string,
    options?: string[],
    required?: boolean,
  ): Array<{ text: string; pauseMsAfter?: number }> => {
    const cleanLabel = label.replace(/<[^>]*>/g, "").trim();
    const chunks: Array<{ text: string; pauseMsAfter?: number }> = [];
    chunks.push({ text: cleanLabel + ".", pauseMsAfter: 350 });
    chunks.push({
      text: required ? "This question is mandatory." : "This question is optional.",
      pauseMsAfter: 300,
    });

    if (options?.length) {
      chunks.push({ text: "Your options are:", pauseMsAfter: 280 });
      options.forEach((opt, idx) => {
        const clean = String(opt ?? "").replace(/<[^>]*>/g, "").trim();
        const expanded =
          /^no$/i.test(clean) ? "No (the answer No)"
          : /^yes$/i.test(clean) ? "Yes (the answer Yes)"
          : clean;
        chunks.push({
          text: `Option ${idx + 1}: ${expanded}.`,
          pauseMsAfter: 260,
        });
      });
    }

    const actionByType: Record<string, string> = {
      text: "Please type your answer, or say it aloud.",
      number: "Please enter a number, or say it aloud.",
      integer: "Please enter a number, or say it aloud.",
      decimal: "Please enter a number, or say it aloud.",
      date: "Please select a date, or say the date aloud.",
      time: "Please select a time, or say the time aloud.",
      select_one: "Say the name of your choice to select it.",
      select_multiple: "Say the name of each option you want to select.",
      geopoint: "Say 'capture location' or tap the button to get your GPS position.",
      gps: "Say 'capture location' or tap the button to get your GPS position.",
      photo: "Say 'take photo' or tap the button to capture an image.",
      image: "Say 'take photo' or tap the button to capture an image.",
      audio: "Say 'record audio' or tap the button to start recording.",
      video: "Say 'record video' or tap the button to start recording.",
      signature: "Please draw your signature on the pad below.",
      barcode: "Say 'scan barcode' or tap the button to scan.",
      acknowledge: "Say 'acknowledge' or tap the checkbox to confirm.",
    };
    const action = actionByType[type];
    if (action) chunks.push({ text: action, pauseMsAfter: 0 });

    return chunks;
  }, []);

  /**
   * Build the question as a SINGLE string (legacy path — used by ad-hoc
   * `speakQuestion`, validation messages, and any external caller that still
   * expects a flat string). The sequential reader prefers `buildQuestionChunks`.
   */
  const buildQuestionText = useCallback((label: string, type: string, options?: string[], _questionId?: string, required?: boolean) => {
    const chunks = buildQuestionChunks(label, type, options, required);
    return chunks.map((c) => c.text).join(" ");
  }, [buildQuestionChunks]);


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

  /** Same per-user/cloned-voice options as speakText, but as a sequence of chunks. */
  const speakChunksText = useCallback((
    chunks: Array<{ text: string; pauseMsAfter?: number }>,
    onEnd?: () => void,
  ) => {
    if (!enabled || !tts.isSupported()) { onEnd?.(); return; }
    setIsSpeaking(true);
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
    tts.speakChunks(chunks, opts).finally(() => {
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
    const chunks = buildQuestionChunks(q.label, q.type, q.options, q.required);

    // After reading the question text, enter confirmation mode
    speakChunksText(chunks, () => {
      if (!isReadingSequenceRef.current) return;
      setTimeout(() => {
        if (!isReadingSequenceRef.current) return;
        enterConfirmationMode(q.id);
        const promptText = "Say 'next' or 'continue' when you are ready to proceed to the next question.";
        speakText(promptText);
      }, 600);
    });
  }, [buildQuestionChunks, speakChunksText, speakText, enterConfirmationMode]);

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
    const cleaned = (text || "").trim();
    if (!cleaned) return false;

    // ─── Universal barge-in ───────────────────────────────────────
    // While TTS is reading, ANY user speech ducks the prompt instantly.
    // This is the Siri/Alexa standard: the human always wins the floor.
    // We only cancel; we do not consume the transcript unless it matches
    // a navigation command, so the caller can still capture the answer.
    const isBargeIn = isSpeaking && !awaitingConfirmation;
    if (isBargeIn) {
      tts.cancel();
    }

    if (!awaitingConfirmation && !isSpeaking) return false;

    const lower = cleaned.toLowerCase();
    const navCommands = [
      "next", "continue", "yes", "go", "proceed", "skip",
      "next question", "go ahead", "move on", "carry on",
      "yes please", "okay", "ok"
    ];
    if (navCommands.some(cmd => lower.includes(cmd))) {
      tts.cancel();
      confirmAndAdvance();
      return true;
    }

    if (lower.includes("repeat") || lower.includes("again") || lower.includes("read again")) {
      tts.cancel();
      readCurrentQuestion();
      return true;
    }
    // Barge-in occurred but the text isn't a nav command — let the caller
    // (form-filler answer parser) consume the transcript as an answer.
    return false;
  }, [awaitingConfirmation, isSpeaking, confirmAndAdvance, readCurrentQuestion]);

  /** Read all questions sequentially from a given index */
  const speakFromIndex = useCallback((questions: QuestionInfo[], startIndex = 0) => {
    if (!enabled || !tts.isSupported()) return;
    tts.cancel();
    // Pin a voice for the whole session so narration stays consistent across
    // every question (no jarring voice swap mid-form). Picks the best voice
    // for the active locale once, then locks it in.
    const userPrefs = getTTSPreferences(user?.id);
    const pinnedURI = userPrefs.voiceURI
      || clonedVoice?.features.preferredVoiceURI
      || tts.pickVoice(locale)?.voiceURI
      || null;
    tts.pinSessionVoice(pinnedURI, locale);
    isReadingSequenceRef.current = true;
    queueRef.current = questions;
    currentIndexRef.current = startIndex;
    setAwaitingConfirmation(false);
    if (questions.length > 0 && startIndex < questions.length) {
      setCurrentQuestionId(questions[startIndex].id);
      onQuestionAdvanced?.(questions[startIndex].id);
    }
    readCurrentQuestion();
  }, [enabled, readCurrentQuestion, onQuestionAdvanced, user?.id, clonedVoice, locale]);

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
    tts.clearSessionVoice();
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

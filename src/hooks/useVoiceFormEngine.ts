/**
 * Voice Form Engine — production-grade voice interaction system for form filling.
 *
 * State machine:
 *   IDLE → READING_QUESTION → LISTENING → PROCESSING → CONFIRMING → (CORRECTING) → IDLE/next
 *
 * Pillars: Navigation, Confirmation, Correction, Confidence, Adaptive Balance
 *
 * All mutually-recursive functions use refs to avoid stale closures.
 */

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useVoiceConfidence, ConfidenceResult, ConfirmationPolicy, FieldRisk, classifyFieldRiskByLabel } from "./useVoiceConfidence";
import { useAudioCues } from "./useAudioCues";
import {
  parseSpokenNumber,
  parseSpokenTime,
  parseSpokenDate,
  parseYesNo,
  fuzzyMatchOption,
  extractMultipleOptions,
} from "@/lib/voiceParsing";

// ─── Types ──────────────────────────────────────────────────────────
export type VoiceFormState =
  | "idle"
  | "reading_question"
  | "listening"
  | "processing"
  | "confirming"
  | "correcting"
  | "reviewing"
  | "submitting";

export interface VoiceQuestion {
  id: string;
  label: string;
  type: string;
  required: boolean;
  options?: { label: string; value: string }[];
  hint?: string;
  groupId?: string;
  iterationIndex?: number;
}

interface VoiceFormEngineOptions {
  enabled: boolean;
  questions: VoiceQuestion[];
  getResponse: (questionId: string) => any;
  setResponse: (questionId: string, value: any) => void;
  clearResponse: (questionId: string) => void;
  onSubmitRequest: () => void;
  onQuestionFocused?: (questionId: string) => void;
  language?: string;
  /** Triggered when a media/GPS action should be invoked (e.g. capture_gps, take_photo). */
  onTriggerAction?: (questionId: string, action: "capture_gps" | "take_photo" | "record_audio" | "record_video" | "scan_barcode" | "signature") => void;
  /** Live interim transcript (gray text). Empty string when reset. */
  onInterimTranscript?: (text: string) => void;
  /** Final recognised text (black). */
  onFinalTranscript?: (text: string) => void;
}

interface UndoEntry {
  questionId: string;
  previousValue: any;
}

// ─── Speech Helpers ─────────────────────────────────────────────────
const getSynth = () => (typeof window !== "undefined" ? window.speechSynthesis : null);

let cachedVoice: SpeechSynthesisVoice | null = null;
const getPreferredVoice = (lang = "en-US"): SpeechSynthesisVoice | null => {
  if (cachedVoice && cachedVoice.lang.startsWith(lang.split("-")[0])) return cachedVoice;
  const synth = getSynth();
  if (!synth) return null;
  const voices = synth.getVoices();
  const langPrefix = lang.split("-")[0];
  // Priority 1: offline (localService) high-quality voice in target language.
  // This is critical for field use without internet.
  const offlineHQ = voices.find(v =>
    v.localService && v.lang.startsWith(langPrefix) &&
    /samantha|karen|fiona|victoria|daniel|moira|tessa|alex|premium|enhanced/i.test(v.name)
  );
  if (offlineHQ) { cachedVoice = offlineHQ; return cachedVoice; }
  // Priority 2: any offline voice in target language
  const offline = voices.find(v => v.localService && v.lang.startsWith(langPrefix));
  if (offline) { cachedVoice = offline; return cachedVoice; }
  // Priority 3: online but preferred name
  const preferred = voices.find(v =>
    v.lang.startsWith(langPrefix) && /samantha|karen|fiona|victoria|google.*female|zira|natural/i.test(v.name)
  );
  cachedVoice = preferred || voices.find(v => v.lang.startsWith(langPrefix)) || voices[0] || null;
  return cachedVoice;
};

/**
 * Speak with barge-in support: returns an object with the promise and a stop()
 * method. If the user starts speaking, the listener (recognition) can call
 * stop() to interrupt the speech.
 */
const speakAsync = (text: string, rate = 0.95, pitch = 1.0, lang = "en-US"): Promise<void> => {
  return new Promise((resolve) => {
    const synth = getSynth();
    if (!synth) { resolve(); return; }
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = rate;
    u.pitch = pitch;
    u.volume = 1.0;
    u.lang = lang;
    const v = getPreferredVoice(lang);
    if (v) u.voice = v;
    // Chrome bug: long utterances get cut off after ~15s. Use a keep-alive timer.
    let keepAlive: ReturnType<typeof setInterval> | null = null;
    u.onstart = () => {
      keepAlive = setInterval(() => { synth.pause(); synth.resume(); }, 10000);
    };
    u.onend = () => { if (keepAlive) clearInterval(keepAlive); resolve(); };
    u.onerror = (e) => {
      if (keepAlive) clearInterval(keepAlive);
      if (e.error !== "interrupted" && e.error !== "canceled") console.warn("TTS error:", e.error);
      resolve();
    };
    synth.speak(u);
  });
};

const stopSpeaking = () => getSynth()?.cancel();

// ─── Command Parser ─────────────────────────────────────────────────
type CommandType =
  | "next" | "previous" | "repeat" | "skip" | "help" | "options"
  | "where_am_i" | "jump" | "review" | "submit" | "edit"
  | "change" | "clear" | "undo" | "redo" | "spell" | "confirm"
  | "cancel" | "fast_mode" | "careful_mode" | "none"
  | "add" | "remove" | "replace" | "change_day" | "change_month" | "change_year"
  | "start_over" | "correct_that";

interface ParsedCommand {
  type: CommandType;
  target?: string;
  value?: string;
}

function parseCommand(text: string): ParsedCommand {
  const lower = text.toLowerCase().trim();

  if (/^(next|continue|go ahead|move on|carry on|proceed|yes please|okay|ok)$/i.test(lower) ||
      lower === "yes" || lower === "go") return { type: "next" };
  if (/^(previous|back|go back|before)$/i.test(lower)) return { type: "previous" };
  if (/^(repeat|read again|say again|what was that|pardon)$/i.test(lower)) return { type: "repeat" };
  if (/^(skip|skip this|pass)$/i.test(lower)) return { type: "skip" };
  if (/^(help|instructions|what do i do|how)$/i.test(lower)) return { type: "help" };
  if (/^(what are my options|options|list options|show options|choices)$/i.test(lower)) return { type: "options" };
  if (/^(where am i|which question|current|position)$/i.test(lower)) return { type: "where_am_i" };
  if (/^(review|review my answers|review answers|summary)$/i.test(lower)) return { type: "review" };
  if (/^(submit|send|finish|done|complete)$/i.test(lower)) return { type: "submit" };
  if (/^(confirm|yes correct|that's right|correct|right)$/i.test(lower)) return { type: "confirm" };
  if (/^(cancel|stop|never mind|nevermind)$/i.test(lower)) return { type: "cancel" };
  if (/^(undo)$/i.test(lower)) return { type: "undo" };
  if (/^(redo)$/i.test(lower)) return { type: "redo" };
  if (/^(fast mode|speed up)$/i.test(lower)) return { type: "fast_mode" };
  if (/^(careful mode|slow down|safe mode)$/i.test(lower)) return { type: "careful_mode" };
  // Correction commands — natural ways to say "fix/redo my last answer"
  if (/^(correct that|correction|no wait|wait no|scratch that|no i meant|that's wrong|that is wrong|i meant|i made a mistake|mistake|no that's wrong|wrong)$/i.test(lower)) return { type: "correct_that" };
  if (/^(start over|restart|redo this question|clear)$/i.test(lower)) return { type: "start_over" };
  if (/^(spell|spelling|spell it|letter by letter)$/i.test(lower)) return { type: "spell" };

  const jumpMatch = lower.match(/(?:go to|jump to|question)\s+(\d+)/);
  if (jumpMatch) return { type: "jump", target: jumpMatch[1] };

  const editMatch = lower.match(/^(?:edit|change|fix|update|modify)\s+(.+)/);
  if (editMatch) return { type: "edit", target: editMatch[1] };

  const removeMatch = lower.match(/^(?:remove|deselect|uncheck)\s+(.+)/);
  if (removeMatch) return { type: "remove", target: removeMatch[1] };

  const addMatch = lower.match(/^(?:add|select|check)\s+(.+)/);
  if (addMatch) return { type: "add", target: addMatch[1] };

  const replaceMatch = lower.match(/^replace\s+(.+?)\s+with\s+(.+)/);
  if (replaceMatch) return { type: "replace", target: replaceMatch[1], value: replaceMatch[2] };

  if (/^change\s*day/i.test(lower)) return { type: "change_day" };
  if (/^change\s*month/i.test(lower)) return { type: "change_month" };
  if (/^change\s*year/i.test(lower)) return { type: "change_year" };

  if (/^(change|change my answer|change it)$/i.test(lower)) return { type: "change" };
  if (/^(clear|clear response|clear answer)$/i.test(lower)) return { type: "clear" };

  return { type: "none" };
}

// ─── Number / Time helpers (delegated to global parsers) ──────────
function extractNumber(text: string): string | null {
  return parseSpokenNumber(text);
}

function extractTime(text: string): string | null {
  return parseSpokenTime(text);
}

// ─── Letter/Phonetic Extraction ────────────────────────────────────
function extractSpelledLetters(text: string): string {
  const nato: Record<string, string> = {
    alpha: "a", bravo: "b", charlie: "c", delta: "d", echo: "e", foxtrot: "f",
    golf: "g", hotel: "h", india: "i", juliet: "j", kilo: "k", lima: "l",
    mike: "m", november: "n", oscar: "o", papa: "p", quebec: "q", romeo: "r",
    sierra: "s", tango: "t", uniform: "u", victor: "v", whiskey: "w",
    xray: "x", "x-ray": "x", yankee: "y", zulu: "z",
    space: " ", dot: ".", period: ".", dash: "-", hyphen: "-", underscore: "_", at: "@",
  };
  const words = text.toLowerCase().split(/[\s,]+/);
  return words.map(w => {
    if (nato[w]) return nato[w];
    if (w.length === 1 && /[a-z0-9]/.test(w)) return w;
    return "";
  }).join("");
}

// ─── Answer vs Command Disambiguation ──────────────────────────────
// Returns true if spoken text is likely meant as an answer, not a command
function isLikelyAnswer(text: string, q: VoiceQuestion): boolean {
  const lower = text.toLowerCase().trim();

  // For acknowledge questions, "yes/ok/okay/confirm" ARE valid answers
  if (q.type === "acknowledge") {
    if (["yes", "ok", "okay", "confirm", "agree", "acknowledge", "right", "correct"].includes(lower)) {
      return true;
    }
  }

  // For select_one/select_multiple, check if text matches an option label/value
  if ((q.type === "select_one" || q.type === "select_multiple") && q.options?.length) {
    const match = q.options.some(o =>
      o.label.toLowerCase() === lower ||
      o.value.toLowerCase() === lower ||
      lower.includes(o.label.toLowerCase()) ||
      o.label.toLowerCase().includes(lower)
    );
    if (match) return true;
  }

  return false;
}

// ══════════════════════════════════════════════════════════════════════
// Main Hook
// ══════════════════════════════════════════════════════════════════════
export const useVoiceFormEngine = (opts: VoiceFormEngineOptions) => {
  const { enabled, questions, getResponse, setResponse, clearResponse, onSubmitRequest, onQuestionFocused, language } = opts;

  const [state, setState] = useState<VoiceFormState>("idle");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [lastConfidence, setLastConfidence] = useState<ConfidenceResult | null>(null);
  const [lastPolicy, setLastPolicy] = useState<ConfirmationPolicy | null>(null);
  const [spellingBuffer, setSpellingBuffer] = useState("");
  const [isSpellingMode, setIsSpellingMode] = useState(false);
  const [pendingValue, setPendingValue] = useState<any>(null);

  const undoStackRef = useRef<UndoEntry[]>([]);
  const redoStackRef = useRef<UndoEntry[]>([]);
  const recognitionRef = useRef<any>(null);
  const abortRef = useRef(false);
  const isActiveRef = useRef(false);

  const confidence = useVoiceConfidence();
  const audioCues = useAudioCues();

  const currentQuestion = useMemo(() => questions[currentIndex] || null, [questions, currentIndex]);

  // ═══ Stable refs for all options & latest values ═══════════════
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const questionsRef = useRef(questions);
  questionsRef.current = questions;

  const currentIndexRef = useRef(currentIndex);
  currentIndexRef.current = currentIndex;

  const pendingValueRef = useRef(pendingValue);
  pendingValueRef.current = pendingValue;

  const confidenceRef = useRef(confidence);
  confidenceRef.current = confidence;

  const audioCuesRef = useRef(audioCues);
  audioCuesRef.current = audioCues;

  // ─── Recognition Control ───────────────────────────────────────
  const startRecognition = useCallback((): Promise<{ text: string; confidence: number }> => {
    return new Promise((resolve, reject) => {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!SpeechRecognition) { reject(new Error("not_supported")); return; }

      const rec = new SpeechRecognition();
      rec.continuous = false;
      rec.interimResults = false;
      rec.lang = language || "en-US";
      rec.maxAlternatives = 3;

      // Timeout fallback — if no result in 12s, treat as no_speech
      const timeout = setTimeout(() => {
        try { rec.abort(); } catch {}
        reject(new Error("no_speech"));
      }, 12000);

      rec.onresult = (event: any) => {
        clearTimeout(timeout);
        const result = event.results[0];
        const text = result[0].transcript;
        const conf = result[0].confidence;
        resolve({ text, confidence: conf });
      };
      rec.onerror = (event: any) => {
        clearTimeout(timeout);
        if (event.error === "no-speech") {
          reject(new Error("no_speech"));
        } else if (event.error === "aborted") {
          reject(new Error("aborted"));
        } else if (event.error === "not-allowed") {
          reject(new Error("not_allowed"));
        } else {
          reject(new Error(event.error));
        }
      };
      rec.onend = () => { clearTimeout(timeout); };
      recognitionRef.current = rec;
      try {
        rec.start();
      } catch (e) {
        clearTimeout(timeout);
        reject(new Error("start_failed"));
      }
    });
  }, [language]);

  const stopRecognition = useCallback(() => {
    recognitionRef.current?.abort();
    recognitionRef.current = null;
  }, []);

  // ═══════════════════════════════════════════════════════════════
  // Use refs for all mutually-recursive functions to break the
  // stale closure cycle that prevented continuation after Q1.
  // ═══════════════════════════════════════════════════════════════

  const processQuestionRef = useRef<(index: number) => Promise<void>>(async () => {});
  const listenForAnswerRef = useRef<(q: VoiceQuestion, index: number) => Promise<void>>(async () => {});
  const handleCommandRef = useRef<(cmd: ParsedCommand, rawText: string, q: VoiceQuestion, index: number) => Promise<boolean>>(async () => false);
  const processAnswerRef = useRef<(text: string, rawConf: number, q: VoiceQuestion, index: number) => Promise<boolean>>(async () => false);
  const goToIndexRef = useRef<(index: number) => void>(() => {});
  const doReviewRef = useRef<() => Promise<void>>(async () => {});
  const doSubmitFlowRef = useRef<() => Promise<void>>(async () => {});
  const listenForSpellingRef = useRef<(q: VoiceQuestion, index: number) => Promise<void>>(async () => {});

  // ─── goToIndex ────────────────────────────────────────────────
  goToIndexRef.current = (index: number) => {
    const qs = questionsRef.current;
    if (index >= qs.length) {
      doReviewRef.current();
      return;
    }
    if (index < 0) index = 0;
    processQuestionRef.current(index);
  };

  // ─── processQuestion ─────────────────────────────────────────
  processQuestionRef.current = async (index: number) => {
    const qs = questionsRef.current;
    if (!optsRef.current.enabled || abortRef.current || index >= qs.length) return;

    const q = qs[index];
    setCurrentIndex(index);
    optsRef.current.onQuestionFocused?.(q.id);
    audioCuesRef.current.playNavigate();

    // 1. READ
    setState("reading_question");
    const questionNum = index + 1;
    const total = qs.length;
    let announcement = `Question ${questionNum} of ${total}. `;
    announcement += q.label.replace(/<[^>]*>/g, "") + ". ";
    announcement += q.required ? "This is mandatory." : "This is optional.";

    if (q.options?.length) {
      announcement += ` Your options are: ${q.options.map((o, i) => `${i + 1}, ${o.label}`).join(". ")}.`;
    }
    if (q.type === "text") announcement += " Say your answer, or say 'spell' for letter-by-letter mode.";
    else if (["number", "integer", "decimal"].includes(q.type)) announcement += " Say the number.";
    else if (q.type === "date") announcement += " Say the date, for example, March 12 2026.";
    else if (q.type === "time") announcement += " Say the time, for example, 3:30 PM.";
    else if (q.type === "range") announcement += " Say a number for the scale.";
    else if (q.type === "note") { /* notes don't need an answer */ }
    else if (q.type === "select_one") announcement += " Say the name or number of your choice.";
    else if (q.type === "select_multiple") announcement += " Say each option to select it. Say 'done' when finished.";
    else if (q.type === "geopoint") announcement += " Say 'capture location'.";
    else if (q.type === "image") announcement += " Say 'take photo'.";
    else if (q.type === "audio") announcement += " Say 'record audio'.";
    else if (q.type === "video") announcement += " Say 'record video'.";
    else if (q.type === "barcode") announcement += " Say 'scan barcode'.";
    else if (q.type === "acknowledge") announcement += " Say 'acknowledge' or 'yes'.";
    else if (q.type === "signature") announcement += " Please draw your signature below. Say 'done' when finished.";

    const existing = optsRef.current.getResponse(q.id);
    if (existing !== undefined && existing !== null && existing !== "" && !(Array.isArray(existing) && existing.length === 0)) {
      if (Array.isArray(existing)) {
        announcement += ` Current answer: ${existing.join(", ")}.`;
      } else {
        announcement += ` Current answer: ${existing}.`;
      }
    }

    announcement += " You can also say 'skip', 'help', 'review', or 'options'.";

    await speakAsync(announcement);
    if (abortRef.current) return;

    // 2. LISTEN
    await listenForAnswerRef.current(q, index);
  };

  // ─── listenForAnswer ──────────────────────────────────────────
  listenForAnswerRef.current = async (q: VoiceQuestion, index: number) => {
    if (abortRef.current) return;
    setState("listening");
    audioCuesRef.current.playFocus();

    let attempts = 0;
    const maxAttempts = 5; // Increased for reliability in noisy field conditions

    while (attempts < maxAttempts && !abortRef.current) {
      try {
        const { text, confidence: rawConf } = await startRecognition();
        if (abortRef.current) return;
        setState("processing");

        // Only treat as command if it's clearly a navigation/meta command,
        // NOT if the question type expects the same word as an answer
        const cmd = parseCommand(text);
        const isAnswerLikeCommand = (
          cmd.type === "next" || cmd.type === "confirm"
        ) && isLikelyAnswer(text, q);

        if (!isAnswerLikeCommand) {
          const handled = await handleCommandRef.current(cmd, text, q, index);
          if (handled) return;
        }

        const accepted = await processAnswerRef.current(text, rawConf, q, index);
        if (accepted) return;

        attempts++;
      } catch (err: any) {
        if (abortRef.current) return;
        if (err.message === "no_speech") {
          attempts++;
          if (attempts < maxAttempts) {
            // Gentle progressively shorter prompts
            if (attempts <= 2) {
              await speakAsync("I didn't hear anything. Please say your answer.");
            } else {
              await speakAsync("Still listening. Go ahead.");
            }
            setState("listening");
          }
        } else if (err.message === "aborted") {
          return;
        } else if (err.message === "not_allowed") {
          await speakAsync("Microphone access was denied. Please enable microphone permission and try again.");
          stopEngineRef.current();
          return;
        } else if (err.message === "start_failed") {
          // Brief delay then retry — mic might be busy from TTS
          await new Promise(r => setTimeout(r, 500));
          attempts++;
          setState("listening");
        } else {
          attempts++;
          if (attempts < maxAttempts) {
            await speakAsync("There was an issue with the microphone. Please try again.");
            setState("listening");
          }
        }
      }
    }

    if (!abortRef.current) {
      await speakAsync("Let's move on. You can come back to this question later by saying 'edit' followed by the question number.");
      audioCuesRef.current.playWarning();
      goToIndexRef.current(index + 1);
    }
  };

  // ─── handleCommand ────────────────────────────────────────────
  handleCommandRef.current = async (cmd: ParsedCommand, rawText: string, q: VoiceQuestion, index: number): Promise<boolean> => {
    const { getResponse, setResponse, clearResponse } = optsRef.current;
    const qs = questionsRef.current;
    const cues = audioCuesRef.current;
    const conf = confidenceRef.current;

    switch (cmd.type) {
      case "next":
        if (q.required) {
          const val = getResponse(q.id);
          if (val === undefined || val === null || val === "" || (Array.isArray(val) && val.length === 0)) {
            await speakAsync("This question is mandatory. Please provide your answer first.");
            await listenForAnswerRef.current(q, index);
            return true;
          }
        }
        cues.playNavigate();
        goToIndexRef.current(index + 1);
        return true;

      case "skip":
        if (q.required) {
          await speakAsync("This question is mandatory and cannot be skipped. Please provide your answer.");
          await listenForAnswerRef.current(q, index);
          return true;
        }
        cues.playNavigate();
        await speakAsync("Skipped.");
        goToIndexRef.current(index + 1);
        return true;

      case "previous":
        if (index > 0) {
          cues.playNavigate();
          goToIndexRef.current(index - 1);
        } else {
          await speakAsync("You are at the first question.");
          await listenForAnswerRef.current(q, index);
        }
        return true;

      case "repeat":
        await processQuestionRef.current(index);
        return true;

      case "help": {
        let helpText = `You are on question ${index + 1} of ${qs.length}. `;
        helpText += `Say "next" to move forward, "previous" to go back, "repeat" to hear this question again. `;
        helpText += `Say "options" to hear available choices. Say "review" to review all your answers. `;
        helpText += `Say "skip" for optional questions. Say "spell" for letter-by-letter input. `;
        helpText += `Say "edit" followed by a question number or field name to jump to it. `;
        helpText += `Say "fast mode" or "careful mode" to adjust confirmation level. `;
        helpText += `Say "undo" to undo your last answer.`;
        await speakAsync(helpText);
        await listenForAnswerRef.current(q, index);
        return true;
      }

      case "options":
        if (q.options?.length) {
          const optList = q.options.map((o, i) => `${i + 1}: ${o.label}`).join(". ");
          await speakAsync(`Available options: ${optList}. Say the name or number to select.`);
        } else {
          await speakAsync("This question does not have predefined options.");
        }
        await listenForAnswerRef.current(q, index);
        return true;

      case "where_am_i": {
        const answered = qs.filter(qq => {
          const v = getResponse(qq.id);
          return v !== undefined && v !== null && v !== "" && !(Array.isArray(v) && v.length === 0);
        }).length;
        await speakAsync(`You are on question ${index + 1} of ${qs.length}. ${answered} questions answered so far.`);
        await listenForAnswerRef.current(q, index);
        return true;
      }

      case "jump": {
        const jumpNum = parseInt(cmd.target || "0");
        if (jumpNum >= 1 && jumpNum <= qs.length) {
          cues.playNavigate();
          goToIndexRef.current(jumpNum - 1);
        } else {
          await speakAsync(`Question ${cmd.target} does not exist. Questions range from 1 to ${qs.length}.`);
          await listenForAnswerRef.current(q, index);
        }
        return true;
      }

      case "edit":
        if (cmd.target) {
          const target = cmd.target.toLowerCase();
          const matchIdx = qs.findIndex(qq =>
            qq.label.toLowerCase().replace(/<[^>]*>/g, "").includes(target)
          );
          if (matchIdx >= 0) {
            cues.playNavigate();
            goToIndexRef.current(matchIdx);
            return true;
          }
          const num = parseInt(cmd.target);
          if (!isNaN(num) && num >= 1 && num <= qs.length) {
            goToIndexRef.current(num - 1);
            return true;
          }
          await speakAsync(`I couldn't find a question matching "${cmd.target}". Try saying the question number.`);
          await listenForAnswerRef.current(q, index);
        }
        return true;

      case "review":
        await doReviewRef.current();
        return true;

      case "submit":
        await doSubmitFlowRef.current();
        return true;

      case "clear":
      case "start_over":
        undoStackRef.current.push({ questionId: q.id, previousValue: getResponse(q.id) });
        clearResponse(q.id);
        cues.playClick();
        await speakAsync("Answer cleared. Please provide your new answer.");
        await listenForAnswerRef.current(q, index);
        return true;

      case "undo": {
        const undoEntry = undoStackRef.current.pop();
        if (undoEntry) {
          redoStackRef.current.push({ questionId: undoEntry.questionId, previousValue: getResponse(undoEntry.questionId) });
          setResponse(undoEntry.questionId, undoEntry.previousValue);
          cues.playClick();
          await speakAsync(`Undone. Restored previous answer: ${undoEntry.previousValue ?? "empty"}.`);
        } else {
          await speakAsync("Nothing to undo.");
        }
        await listenForAnswerRef.current(q, index);
        return true;
      }

      case "redo": {
        const redoEntry = redoStackRef.current.pop();
        if (redoEntry) {
          undoStackRef.current.push({ questionId: redoEntry.questionId, previousValue: getResponse(redoEntry.questionId) });
          setResponse(redoEntry.questionId, redoEntry.previousValue);
          await speakAsync(`Redone. Answer: ${redoEntry.previousValue}.`);
        } else {
          await speakAsync("Nothing to redo.");
        }
        await listenForAnswerRef.current(q, index);
        return true;
      }

      case "spell":
        setIsSpellingMode(true);
        setSpellingBuffer("");
        await speakAsync("Spelling mode. Say each letter, or use NATO phonetic alphabet. Say 'done' when finished, or 'clear' to start over.");
        await listenForSpellingRef.current(q, index);
        return true;

      case "confirm":
        if (pendingValueRef.current !== null) {
          undoStackRef.current.push({ questionId: q.id, previousValue: getResponse(q.id) });
          setResponse(q.id, pendingValueRef.current);
          setPendingValue(null);
          conf.recordSuccess();
          cues.playSuccess();
          await speakAsync("Confirmed.");
          goToIndexRef.current(index + 1);
          return true;
        }
        return false;

      case "change":
        setPendingValue(null);
        await speakAsync("Okay, please say your new answer.");
        await listenForAnswerRef.current(q, index);
        return true;

      case "fast_mode":
        conf.setMode("fast");
        cues.playClick();
        await speakAsync("Fast mode activated. I will confirm less often.");
        await listenForAnswerRef.current(q, index);
        return true;

      case "careful_mode":
        conf.setMode("careful");
        cues.playClick();
        await speakAsync("Careful mode activated. I will confirm every answer.");
        await listenForAnswerRef.current(q, index);
        return true;

      case "cancel":
        stopEngineRef.current();
        return true;

      case "remove":
        if (q.type === "select_multiple" && cmd.target) {
          const current = getResponse(q.id);
          if (Array.isArray(current)) {
            const tgt = cmd.target.toLowerCase();
            const match = q.options?.find(o => o.label.toLowerCase() === tgt || o.value.toLowerCase() === tgt);
            if (match) {
              undoStackRef.current.push({ questionId: q.id, previousValue: [...current] });
              setResponse(q.id, current.filter((v: string) => v !== match.value));
              cues.playClick();
              await speakAsync(`Removed ${match.label}.`);
            } else {
              await speakAsync(`I couldn't find "${cmd.target}" in your selections.`);
            }
          }
          await listenForAnswerRef.current(q, index);
          return true;
        }
        return false;

      case "add":
        if (q.type === "select_multiple" && cmd.target) {
          const tgt = cmd.target.toLowerCase();
          const match = q.options?.find(o => o.label.toLowerCase() === tgt || o.value.toLowerCase() === tgt);
          if (match) {
            const current = getResponse(q.id) || [];
            if (!current.includes(match.value)) {
              undoStackRef.current.push({ questionId: q.id, previousValue: [...current] });
              setResponse(q.id, [...current, match.value]);
              cues.playClick();
              await speakAsync(`Added ${match.label}.`);
            } else {
              await speakAsync(`${match.label} is already selected.`);
            }
          } else {
            await speakAsync(`I couldn't find "${cmd.target}" in the options.`);
          }
          await listenForAnswerRef.current(q, index);
          return true;
        }
        return false;

      default:
        return false;
    }
  };

  // ─── processAnswer ────────────────────────────────────────────
  processAnswerRef.current = async (text: string, rawConf: number, q: VoiceQuestion, index: number): Promise<boolean> => {
    const { getResponse, setResponse } = optsRef.current;
    const conf = confidenceRef.current;
    const cues = audioCuesRef.current;
    const fieldRisk = classifyFieldRiskByLabel(q.label, q.type, q.required);
    let extractedValue: any = text.trim();

    switch (q.type) {
      case "select_one": {
        if (!q.options?.length) break;
        const match = fuzzyMatchOption(text, q.options);
        if (match) { extractedValue = match.value; break; }
        await speakAsync(`I couldn't match "${text}" to any option. Say the option name or number.`);
        conf.recordCorrection();
        await listenForAnswerRef.current(q, index);
        return true;
      }

      case "select_multiple": {
        if (!q.options?.length) break;
        const lower = text.toLowerCase().trim();
        if (lower === "done" || lower === "finished") {
          const val = getResponse(q.id);
          if (Array.isArray(val) && val.length > 0) {
            const labels = val.map((v: string) => q.options!.find(o => o.value === v)?.label || v);
            await speakAsync(`You selected: ${labels.join(", ")}. Say "continue" to proceed, or say "add" or "remove" to change.`);
            setState("confirming");
            try {
              const { text: confText } = await startRecognition();
              const confCmd = parseCommand(confText);
              if (confCmd.type === "next" || confCmd.type === "confirm") {
                conf.recordSuccess();
                cues.playSuccess();
                goToIndexRef.current(index + 1);
              } else {
                await handleCommandRef.current(confCmd, confText, q, index);
              }
            } catch { /* fall through */ }
            return true;
          }
        }
        // Multiple at once: "select red and blue and green"
        const matches = extractMultipleOptions(text, q.options);
        if (matches.length > 0) {
          const current = Array.isArray(getResponse(q.id)) ? [...getResponse(q.id)] : [];
          undoStackRef.current.push({ questionId: q.id, previousValue: [...current] });
          let added = 0;
          for (const m of matches) {
            if (!current.includes(m.value)) { current.push(m.value); added++; }
          }
          setResponse(q.id, current);
          cues.playClick();
          const addedLabels = matches.map(m => m.label).join(", ");
          await speakAsync(`Selected ${addedLabels}. Say another option, or say "done".`);
          await listenForAnswerRef.current(q, index);
          return true;
        }
        await speakAsync(`I couldn't match "${text}" to an option. Say the option name or number.`);
        await listenForAnswerRef.current(q, index);
        return true;
      }

      case "number":
      case "integer":
      case "decimal": {
        const num = extractNumber(text);
        if (num !== null) {
          extractedValue = num;
        } else {
          await speakAsync("I couldn't understand that number. Please say it again clearly.");
          conf.recordCorrection();
          await listenForAnswerRef.current(q, index);
          return true;
        }
        break;
      }

      case "date":
      case "datetime": {
        const parsed = parseSpokenDate(text, q.type === "datetime");
        if (parsed) {
          extractedValue = parsed;
        } else {
          await speakAsync("I couldn't understand that date. Please say it clearly, for example, January 15 2025.");
          await listenForAnswerRef.current(q, index);
          return true;
        }
        break;
      }
      case "time": {
        const timeVal = extractTime(text);
        if (timeVal) {
          extractedValue = timeVal;
        } else {
          await speakAsync("I couldn't understand that time. Please say it clearly, for example, 3:30 PM or 15 hundred hours.");
          await listenForAnswerRef.current(q, index);
          return true;
        }
        break;
      }

      case "boolean":
      case "yes_no": {
        const yn = parseYesNo(text);
        if (yn !== null) {
          extractedValue = yn;
        } else {
          await speakAsync("Please say 'yes' or 'no'.");
          await listenForAnswerRef.current(q, index);
          return true;
        }
        break;
      }

      case "image":
      case "audio":
      case "video":
      case "barcode":
      case "signature": {
        const actionMap: Record<string, string> = {
          geopoint: "capture_gps", image: "take_photo", audio: "record_audio",
          video: "record_video", barcode: "scan_barcode", signature: "signature",
        };
        const lower = text.toLowerCase();
        const triggerWords: Record<string, string[]> = {
          geopoint: ["capture", "location", "gps", "position", "coord", "here", "now"],
          image: ["photo", "picture", "capture", "image", "camera", "snap", "shot"],
          audio: ["record", "audio", "start", "begin", "microphone", "mic"],
          video: ["record", "video", "start", "begin", "film"],
          barcode: ["scan", "barcode", "code", "qr"],
          signature: ["done", "finished", "complete", "signed"],
        };
        const triggers = triggerWords[q.type] || [];
        if (triggers.some(t => lower.includes(t))) {
          setResponse(q.id, `__voice_trigger_${actionMap[q.type]}`);
          cues.playClick();
          const actionLabels: Record<string, string> = {
            capture_gps: "Capturing GPS location.",
            take_photo: "Opening camera.",
            record_audio: "Starting audio recording.",
            record_video: "Starting video recording.",
            scan_barcode: "Opening barcode scanner.",
          };
          await speakAsync(actionLabels[actionMap[q.type]] || "Action triggered.");
          goToIndexRef.current(index + 1);
          return true;
        }
        await speakAsync(`Please say the action, for example "${triggers[0] || "start"}".`);
        await listenForAnswerRef.current(q, index);
        return true;
      }

      case "range": {
        const num = extractNumber(text);
        if (num !== null) {
          extractedValue = parseInt(num);
        } else {
          await speakAsync("Please say a number for the scale.");
          await listenForAnswerRef.current(q, index);
          return true;
        }
        break;
      }

      case "acknowledge": {
        if (parseYesNo(text) === true || /(acknowledge|got it|understood)/i.test(text)) {
          extractedValue = true;
        } else {
          await speakAsync("Say 'yes' or 'acknowledge' to confirm.");
          await listenForAnswerRef.current(q, index);
          return true;
        }
        break;
      }
    }

    // ─── Confidence check & confirmation ────────────────────────
    setState("confirming");
    const confResult = conf.scoreConfidence(rawConf, String(extractedValue), q.type, q.options);
    setLastConfidence(confResult);

    const policy = conf.getConfirmationPolicy(confResult, fieldRisk, String(extractedValue), q.type);
    setLastPolicy(policy);

    if (policy.action === "reprompt") {
      cues.playWarning();
      await speakAsync(policy.ttsScript);
      conf.recordCorrection();
      await listenForAnswerRef.current(q, index);
      return true;
    }

    if (policy.action === "guided_correction") {
      cues.playWarning();
      await speakAsync(policy.ttsScript);
      conf.recordCorrection();
      await listenForAnswerRef.current(q, index);
      return true;
    }

    if (policy.action === "auto_accept") {
      undoStackRef.current.push({ questionId: q.id, previousValue: getResponse(q.id) });
      setResponse(q.id, extractedValue);
      conf.recordSuccess();
      cues.playSuccess();
      await speakAsync(policy.ttsScript);
      goToIndexRef.current(index + 1);
      return true;
    }

    // soft_confirm or strict_confirm → announce and listen for confirm/change
    setPendingValue(extractedValue);
    await speakAsync(policy.ttsScript);

    try {
      const { text: confText } = await startRecognition();
      const confCmd = parseCommand(confText);
      if (confCmd.type === "confirm" || confCmd.type === "next") {
        undoStackRef.current.push({ questionId: q.id, previousValue: getResponse(q.id) });
        setResponse(q.id, extractedValue);
        setPendingValue(null);
        conf.recordSuccess();
        cues.playSuccess();
        await speakAsync("Confirmed.");
        goToIndexRef.current(index + 1);
        return true;
      } else if (confCmd.type === "change" || confCmd.type === "start_over" || confCmd.type === "cancel") {
        setPendingValue(null);
        conf.recordCorrection();
        await speakAsync("Okay, please say your answer again.");
        await listenForAnswerRef.current(q, index);
        return true;
      } else if (confCmd.type === "spell") {
        setPendingValue(null);
        setIsSpellingMode(true);
        setSpellingBuffer("");
        await speakAsync("Spelling mode. Say each letter. Say 'done' when finished.");
        await listenForSpellingRef.current(q, index);
        return true;
      } else {
        // Treat as new answer
        setPendingValue(null);
        return await processAnswerRef.current(confText, 0.7, q, index);
      }
    } catch {
      if (policy.action === "soft_confirm") {
        undoStackRef.current.push({ questionId: q.id, previousValue: getResponse(q.id) });
        setResponse(q.id, extractedValue);
        setPendingValue(null);
        conf.recordSuccess();
        cues.playSuccess();
        goToIndexRef.current(index + 1);
        return true;
      }
      setPendingValue(null);
      await speakAsync("I didn't hear a confirmation. Please say your answer again.");
      await listenForAnswerRef.current(q, index);
      return true;
    }
  };

  // ─── Spelling Mode ────────────────────────────────────────────
  listenForSpellingRef.current = async (q: VoiceQuestion, index: number) => {
    const { getResponse, setResponse } = optsRef.current;
    const conf = confidenceRef.current;
    const cues = audioCuesRef.current;
    let buffer = "";
    while (!abortRef.current) {
      try {
        const { text } = await startRecognition();
        const lower = text.toLowerCase().trim();
        if (lower === "done" || lower === "finished") {
          setIsSpellingMode(false);
          if (buffer) {
            undoStackRef.current.push({ questionId: q.id, previousValue: getResponse(q.id) });
            setResponse(q.id, buffer);
            conf.recordSuccess();
            cues.playSuccess();
            await speakAsync(`Spelled: ${buffer.split("").join(", ")}. Saved.`);
            goToIndexRef.current(index + 1);
          } else {
            await speakAsync("No letters captured. Returning to normal mode.");
            await listenForAnswerRef.current(q, index);
          }
          return;
        }
        if (lower === "clear" || lower === "start over") {
          buffer = "";
          setSpellingBuffer("");
          cues.playClick();
          await speakAsync("Cleared. Start spelling again.");
          continue;
        }
        if (lower === "backspace" || lower === "delete") {
          buffer = buffer.slice(0, -1);
          setSpellingBuffer(buffer);
          cues.playClick();
          await speakAsync(buffer ? `Deleted last letter. So far: ${buffer.split("").join(", ")}.` : "All cleared.");
          continue;
        }
        const letters = extractSpelledLetters(text);
        if (letters) {
          buffer += letters;
          setSpellingBuffer(buffer);
          cues.playClick();
          await speakAsync(`${letters}. So far: ${buffer.split("").join(", ")}.`);
        } else {
          await speakAsync("I didn't catch that letter. Try again, or use NATO phonetic alphabet.");
        }
      } catch (err: any) {
        if (err.message === "aborted") return;
        await speakAsync("I didn't hear anything. Say a letter, or 'done' to finish.");
      }
    }
  };

  // ─── Review Mode ──────────────────────────────────────────────
  doReviewRef.current = async () => {
    const { getResponse } = optsRef.current;
    const qs = questionsRef.current;
    setState("reviewing");
    const answered: string[] = [];
    const unanswered: string[] = [];

    qs.forEach((q, i) => {
      const val = getResponse(q.id);
      const hasAnswer = val !== undefined && val !== null && val !== "" && !(Array.isArray(val) && val.length === 0);
      if (hasAnswer) {
        const display = Array.isArray(val)
          ? val.map((v: string) => q.options?.find(o => o.value === v)?.label || v).join(", ")
          : String(val);
        answered.push(`Question ${i + 1}, ${q.label.replace(/<[^>]*>/g, "")}: ${display}`);
      } else {
        unanswered.push(`Question ${i + 1}, ${q.label.replace(/<[^>]*>/g, "")}${q.required ? " (mandatory)" : ""}`);
      }
    });

    let review = `Review summary. ${answered.length} questions answered, ${unanswered.length} unanswered. `;
    if (answered.length > 0) {
      review += "Answered questions: " + answered.join(". ") + ". ";
    }
    if (unanswered.length > 0) {
      review += "Unanswered: " + unanswered.join(". ") + ". ";
    }
    review += "Say a question number to edit, 'submit' to submit, or 'continue' to go back to the form.";

    await speakAsync(review);

    try {
      const { text } = await startRecognition();
      const cmd = parseCommand(text);
      if (cmd.type === "submit") {
        await doSubmitFlowRef.current();
      } else if (cmd.type === "jump") {
        const num = parseInt(cmd.target || "0");
        if (num >= 1 && num <= qs.length) goToIndexRef.current(num - 1);
        else {
          await speakAsync("Invalid question number.");
          await doReviewRef.current();
        }
      } else if (cmd.type === "edit" && cmd.target) {
        const num = parseInt(cmd.target);
        if (!isNaN(num) && num >= 1 && num <= qs.length) goToIndexRef.current(num - 1);
      } else {
        goToIndexRef.current(currentIndexRef.current);
      }
    } catch {
      goToIndexRef.current(currentIndexRef.current);
    }
  };

  // ─── Submit Flow ──────────────────────────────────────────────
  doSubmitFlowRef.current = async () => {
    const { getResponse } = optsRef.current;
    const qs = questionsRef.current;
    const cues = audioCuesRef.current;
    setState("submitting");

    const missing = qs.filter(q => {
      if (!q.required) return false;
      const v = getResponse(q.id);
      return v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);
    });

    if (missing.length > 0) {
      await speakAsync(`You have ${missing.length} mandatory questions unanswered: ${missing.map((m, i) => `${i + 1}, ${m.label.replace(/<[^>]*>/g, "")}`).join(". ")}. Please complete them before submitting.`);
      const idx = qs.findIndex(q => q.id === missing[0].id);
      goToIndexRef.current(idx >= 0 ? idx : 0);
      return;
    }

    await speakAsync("All questions are answered. Are you sure you want to submit? Say 'confirm' or 'cancel'.");
    try {
      const { text } = await startRecognition();
      const cmd = parseCommand(text);
      if (cmd.type === "confirm" || cmd.type === "next") {
        cues.playSuccess();
        await speakAsync("Submitting your form now.");
        optsRef.current.onSubmitRequest();
      } else {
        await speakAsync("Submission cancelled. Returning to the form.");
        goToIndexRef.current(currentIndexRef.current);
      }
    } catch {
      await speakAsync("I didn't hear a response. Submission cancelled.");
      goToIndexRef.current(currentIndexRef.current);
    }
  };

  // ─── stopEngine ref ───────────────────────────────────────────
  const stopEngineRef = useRef(() => {});
  stopEngineRef.current = () => {
    abortRef.current = true;
    isActiveRef.current = false;
    stopRecognition();
    stopSpeaking();
    setState("idle");
    audioCuesRef.current.playClick();
  };

  // ─── Engine Start/Stop (stable callbacks for external use) ────
  const startEngine = useCallback(async () => {
    if (!enabled) return;
    abortRef.current = false;
    isActiveRef.current = true;
    audioCuesRef.current.playSuccess();
    await speakAsync(
      `Voice Form Mode activated. You have ${questionsRef.current.length} questions. ` +
      `I will read each question and wait for your voice answer. ` +
      `Say "help" at any time for available commands. ` +
      `Say "fast mode" to reduce confirmations, or "careful mode" for more checking. ` +
      `Let's begin.`
    );
    processQuestionRef.current(0);
  }, [enabled]);

  const stopEngine = useCallback(() => {
    stopEngineRef.current();
  }, []);

  const goToIndex = useCallback((index: number) => {
    goToIndexRef.current(index);
  }, []);

  const processQuestion = useCallback((index: number) => {
    processQuestionRef.current(index);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortRef.current = true;
      stopRecognition();
      stopSpeaking();
    };
  }, [stopRecognition]);

  return {
    state,
    currentIndex,
    currentQuestion,
    isActive: state !== "idle",
    lastConfidence,
    lastPolicy,
    isSpellingMode,
    spellingBuffer,

    startEngine,
    stopEngine,
    goToIndex,
    processQuestion,

    mode: confidence.getMode(),
    setMode: confidence.setMode,
  };
};

/**
 * Voice Form Engine — production-grade voice interaction system for form filling.
 *
 * State machine:
 *   IDLE → READING_QUESTION → LISTENING → PROCESSING → CONFIRMING → (CORRECTING) → IDLE/next
 *
 * Pillars: Navigation, Confirmation, Correction, Confidence, Adaptive Balance
 */

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useVoiceConfidence, ConfidenceResult, ConfirmationPolicy, FieldRisk, classifyFieldRiskByLabel } from "./useVoiceConfidence";
import { useAudioCues } from "./useAudioCues";

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
}

interface UndoEntry {
  questionId: string;
  previousValue: any;
}

// ─── Speech Helpers ─────────────────────────────────────────────────
const getSynth = () => (typeof window !== "undefined" ? window.speechSynthesis : null);

const speakAsync = (text: string, rate = 0.72, pitch = 1.05): Promise<void> => {
  return new Promise((resolve) => {
    const synth = getSynth();
    if (!synth) { resolve(); return; }
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = rate;
    u.pitch = pitch;
    u.volume = 0.9;
    u.lang = "en-US";
    // Pick a natural voice
    const voices = synth.getVoices();
    const preferred = voices.find(v =>
      v.lang.startsWith("en") && /samantha|karen|fiona|victoria|google.*female|zira/i.test(v.name)
    );
    u.voice = preferred || voices.find(v => v.lang.startsWith("en")) || null;
    u.onend = () => resolve();
    u.onerror = (e) => {
      if (e.error !== "interrupted") console.warn("TTS error:", e.error);
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
  | "start_over";

interface ParsedCommand {
  type: CommandType;
  target?: string;  // e.g., question number, field name, option value
  value?: string;
}

function parseCommand(text: string): ParsedCommand {
  const lower = text.toLowerCase().trim();

  // Navigation
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
  if (/^(start over|restart|redo this question|clear)$/i.test(lower)) return { type: "start_over" };
  if (/^(spell|spelling|spell it|letter by letter)$/i.test(lower)) return { type: "spell" };

  // Jump: "go to question 5" / "go to 5" / "question 5" / "edit age"
  const jumpMatch = lower.match(/(?:go to|jump to|question)\s+(\d+)/);
  if (jumpMatch) return { type: "jump", target: jumpMatch[1] };

  // Edit: "edit <field name>" / "change <field name>"
  const editMatch = lower.match(/^(?:edit|change|fix|update|modify)\s+(.+)/);
  if (editMatch) return { type: "edit", target: editMatch[1] };

  // Remove option (multi-select)
  const removeMatch = lower.match(/^(?:remove|deselect|uncheck)\s+(.+)/);
  if (removeMatch) return { type: "remove", target: removeMatch[1] };

  // Add option
  const addMatch = lower.match(/^(?:add|select|check)\s+(.+)/);
  if (addMatch) return { type: "add", target: addMatch[1] };

  // Replace: "replace X with Y"
  const replaceMatch = lower.match(/^replace\s+(.+?)\s+with\s+(.+)/);
  if (replaceMatch) return { type: "replace", target: replaceMatch[1], value: replaceMatch[2] };

  // Date parts
  if (/^change\s*day/i.test(lower)) return { type: "change_day" };
  if (/^change\s*month/i.test(lower)) return { type: "change_month" };
  if (/^change\s*year/i.test(lower)) return { type: "change_year" };

  // Change (generic)
  if (/^(change|change my answer|change it)$/i.test(lower)) return { type: "change" };
  if (/^(clear|clear response|clear answer)$/i.test(lower)) return { type: "clear" };

  return { type: "none" };
}

// ─── Number Words ───────────────────────────────────────────────────
const NUM_WORDS: Record<string, string> = {
  zero: "0", one: "1", two: "2", three: "3", four: "4",
  five: "5", six: "6", seven: "7", eight: "8", nine: "9",
  ten: "10", eleven: "11", twelve: "12", thirteen: "13",
  fourteen: "14", fifteen: "15", sixteen: "16", seventeen: "17",
  eighteen: "18", nineteen: "19", twenty: "20", thirty: "30",
  forty: "40", fifty: "50", sixty: "60", seventy: "70",
  eighty: "80", ninety: "90", hundred: "100", thousand: "1000",
};

function extractNumber(text: string): string | null {
  const numMatch = text.match(/-?\d+\.?\d*/);
  if (numMatch) return numMatch[0];
  const lower = text.toLowerCase().trim();
  if (NUM_WORDS[lower]) return NUM_WORDS[lower];
  return null;
}

// ─── Letter/Phonetic Extraction ────────────────────────────────────
function extractSpelledLetters(text: string): string {
  // NATO phonetic + letter names
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
  const [reviewIndex, setReviewIndex] = useState(0);
  const [pendingValue, setPendingValue] = useState<any>(null);

  const undoStackRef = useRef<UndoEntry[]>([]);
  const redoStackRef = useRef<UndoEntry[]>([]);
  const recognitionRef = useRef<any>(null);
  const abortRef = useRef(false);
  const isActiveRef = useRef(false);

  const confidence = useVoiceConfidence();
  const audioCues = useAudioCues();

  const currentQuestion = useMemo(() => questions[currentIndex] || null, [questions, currentIndex]);

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

      rec.onresult = (event: any) => {
        const result = event.results[0];
        const text = result[0].transcript;
        const conf = result[0].confidence;
        resolve({ text, confidence: conf });
      };
      rec.onerror = (event: any) => {
        if (event.error === "no-speech") {
          reject(new Error("no_speech"));
        } else if (event.error === "aborted") {
          reject(new Error("aborted"));
        } else {
          reject(new Error(event.error));
        }
      };
      rec.onend = () => {
        // If no result fired, this handles it
      };
      recognitionRef.current = rec;
      rec.start();
    });
  }, [language]);

  const stopRecognition = useCallback(() => {
    recognitionRef.current?.abort();
    recognitionRef.current = null;
  }, []);

  // ─── Core: Read + Listen + Process one question ────────────────
  const processQuestion = useCallback(async (index: number) => {
    if (!enabled || abortRef.current || index >= questions.length) return;

    const q = questions[index];
    setCurrentIndex(index);
    onQuestionFocused?.(q.id);
    audioCues.playNavigate();

    // 1. READ
    setState("reading_question");
    const questionNum = index + 1;
    const total = questions.length;
    let announcement = `Question ${questionNum} of ${total}. `;
    announcement += q.label.replace(/<[^>]*>/g, "") + ". ";
    announcement += q.required ? "This is mandatory." : "This is optional.";

    // Type-specific guidance
    if (q.options?.length) {
      announcement += ` Your options are: ${q.options.map((o, i) => `${i + 1}, ${o.label}`).join(". ")}.`;
    }
    if (q.type === "text") announcement += " Say your answer, or say 'spell' for letter-by-letter mode.";
    else if (["number", "integer", "decimal"].includes(q.type)) announcement += " Say the number.";
    else if (q.type === "date") announcement += " Say the date, for example, March 12 2026.";
    else if (q.type === "time") announcement += " Say the time.";
    else if (q.type === "select_one") announcement += " Say the name or number of your choice.";
    else if (q.type === "select_multiple") announcement += " Say each option to select it. Say 'done' when finished.";
    else if (q.type === "geopoint") announcement += " Say 'capture location'.";
    else if (q.type === "image") announcement += " Say 'take photo'.";
    else if (q.type === "audio") announcement += " Say 'record audio'.";
    else if (q.type === "video") announcement += " Say 'record video'.";
    else if (q.type === "barcode") announcement += " Say 'scan barcode'.";
    else if (q.type === "acknowledge") announcement += " Say 'acknowledge' or 'yes'.";
    else if (q.type === "signature") announcement += " Please draw your signature below. Say 'done' when finished.";

    // Check existing answer
    const existing = getResponse(q.id);
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
    await listenForAnswer(q, index);
  }, [enabled, questions, getResponse, onQuestionFocused, audioCues]);

  // ─── Listen Loop ──────────────────────────────────────────────────
  const listenForAnswer = useCallback(async (q: VoiceQuestion, index: number) => {
    if (abortRef.current) return;
    setState("listening");
    audioCues.playFocus();

    let attempts = 0;
    const maxAttempts = 3;

    while (attempts < maxAttempts && !abortRef.current) {
      try {
        const { text, confidence: rawConf } = await startRecognition();
        if (abortRef.current) return;
        setState("processing");

        // 1. Check for commands first
        const cmd = parseCommand(text);
        const handled = await handleCommand(cmd, text, q, index);
        if (handled) return;

        // 2. Not a command → treat as answer
        const accepted = await processAnswer(text, rawConf, q, index);
        if (accepted) return;

        // If processAnswer returned false, it already re-prompted
        attempts++;
      } catch (err: any) {
        if (abortRef.current) return;
        if (err.message === "no_speech") {
          attempts++;
          if (attempts < maxAttempts) {
            await speakAsync("I didn't hear anything. Please say your answer.");
          }
        } else if (err.message === "aborted") {
          return;
        } else {
          attempts++;
          if (attempts < maxAttempts) {
            await speakAsync("There was an issue with the microphone. Please try again.");
          }
        }
      }
    }

    // Max attempts exhausted
    if (!abortRef.current) {
      await speakAsync("Let's move on. You can come back to this question later by saying 'edit' followed by the question number.");
      audioCues.playWarning();
      goToIndex(index + 1);
    }
  }, [startRecognition, audioCues]);

  // ─── Command Handler ──────────────────────────────────────────────
  const handleCommand = useCallback(async (cmd: ParsedCommand, rawText: string, q: VoiceQuestion, index: number): Promise<boolean> => {
    switch (cmd.type) {
      case "next":
        if (q.required) {
          const val = getResponse(q.id);
          if (val === undefined || val === null || val === "" || (Array.isArray(val) && val.length === 0)) {
            await speakAsync("This question is mandatory. Please provide your answer first.");
            await listenForAnswer(q, index);
            return true;
          }
        }
        audioCues.playNavigate();
        goToIndex(index + 1);
        return true;

      case "skip":
        if (q.required) {
          await speakAsync("This question is mandatory and cannot be skipped. Please provide your answer.");
          await listenForAnswer(q, index);
          return true;
        }
        audioCues.playNavigate();
        await speakAsync("Skipped.");
        goToIndex(index + 1);
        return true;

      case "previous":
        if (index > 0) {
          audioCues.playNavigate();
          goToIndex(index - 1);
        } else {
          await speakAsync("You are at the first question.");
          await listenForAnswer(q, index);
        }
        return true;

      case "repeat":
        await processQuestion(index);
        return true;

      case "help":
        let helpText = `You are on question ${index + 1} of ${questions.length}. `;
        helpText += `Say "next" to move forward, "previous" to go back, "repeat" to hear this question again. `;
        helpText += `Say "options" to hear available choices. Say "review" to review all your answers. `;
        helpText += `Say "skip" for optional questions. Say "spell" for letter-by-letter input. `;
        helpText += `Say "edit" followed by a question number or field name to jump to it. `;
        helpText += `Say "fast mode" or "careful mode" to adjust confirmation level. `;
        helpText += `Say "undo" to undo your last answer.`;
        await speakAsync(helpText);
        await listenForAnswer(q, index);
        return true;

      case "options":
        if (q.options?.length) {
          const optList = q.options.map((o, i) => `${i + 1}: ${o.label}`).join(". ");
          await speakAsync(`Available options: ${optList}. Say the name or number to select.`);
        } else {
          await speakAsync("This question does not have predefined options.");
        }
        await listenForAnswer(q, index);
        return true;

      case "where_am_i":
        const answered = questions.filter((_, i) => {
          const v = getResponse(questions[i].id);
          return v !== undefined && v !== null && v !== "" && !(Array.isArray(v) && v.length === 0);
        }).length;
        await speakAsync(`You are on question ${index + 1} of ${questions.length}. ${answered} questions answered so far.`);
        await listenForAnswer(q, index);
        return true;

      case "jump":
        const jumpNum = parseInt(cmd.target || "0");
        if (jumpNum >= 1 && jumpNum <= questions.length) {
          audioCues.playNavigate();
          goToIndex(jumpNum - 1);
        } else {
          await speakAsync(`Question ${cmd.target} does not exist. Questions range from 1 to ${questions.length}.`);
          await listenForAnswer(q, index);
        }
        return true;

      case "edit":
        // Find by label fuzzy match
        if (cmd.target) {
          const target = cmd.target.toLowerCase();
          const matchIdx = questions.findIndex(qq =>
            qq.label.toLowerCase().replace(/<[^>]*>/g, "").includes(target)
          );
          if (matchIdx >= 0) {
            audioCues.playNavigate();
            goToIndex(matchIdx);
            return true;
          }
          // Try as number
          const num = parseInt(cmd.target);
          if (!isNaN(num) && num >= 1 && num <= questions.length) {
            goToIndex(num - 1);
            return true;
          }
          await speakAsync(`I couldn't find a question matching "${cmd.target}". Try saying the question number.`);
          await listenForAnswer(q, index);
        }
        return true;

      case "review":
        await doReview();
        return true;

      case "submit":
        await doSubmitFlow();
        return true;

      case "clear":
      case "start_over":
        undoStackRef.current.push({ questionId: q.id, previousValue: getResponse(q.id) });
        clearResponse(q.id);
        audioCues.playClick();
        await speakAsync("Answer cleared. Please provide your new answer.");
        await listenForAnswer(q, index);
        return true;

      case "undo":
        const undoEntry = undoStackRef.current.pop();
        if (undoEntry) {
          redoStackRef.current.push({ questionId: undoEntry.questionId, previousValue: getResponse(undoEntry.questionId) });
          setResponse(undoEntry.questionId, undoEntry.previousValue);
          audioCues.playClick();
          await speakAsync(`Undone. Restored previous answer: ${undoEntry.previousValue ?? "empty"}.`);
        } else {
          await speakAsync("Nothing to undo.");
        }
        await listenForAnswer(q, index);
        return true;

      case "redo":
        const redoEntry = redoStackRef.current.pop();
        if (redoEntry) {
          undoStackRef.current.push({ questionId: redoEntry.questionId, previousValue: getResponse(redoEntry.questionId) });
          setResponse(redoEntry.questionId, redoEntry.previousValue);
          await speakAsync(`Redone. Answer: ${redoEntry.previousValue}.`);
        } else {
          await speakAsync("Nothing to redo.");
        }
        await listenForAnswer(q, index);
        return true;

      case "spell":
        setIsSpellingMode(true);
        setSpellingBuffer("");
        await speakAsync("Spelling mode. Say each letter, or use NATO phonetic alphabet. Say 'done' when finished, or 'clear' to start over.");
        await listenForSpelling(q, index);
        return true;

      case "confirm":
        if (pendingValue !== null) {
          undoStackRef.current.push({ questionId: q.id, previousValue: getResponse(q.id) });
          setResponse(q.id, pendingValue);
          setPendingValue(null);
          confidence.recordSuccess();
          audioCues.playSuccess();
          await speakAsync("Confirmed.");
          goToIndex(index + 1);
          return true;
        }
        // No pending → treat as "next"
        return false;

      case "change":
        setPendingValue(null);
        await speakAsync("Okay, please say your new answer.");
        await listenForAnswer(q, index);
        return true;

      case "fast_mode":
        confidence.setMode("fast");
        audioCues.playClick();
        await speakAsync("Fast mode activated. I will confirm less often.");
        await listenForAnswer(q, index);
        return true;

      case "careful_mode":
        confidence.setMode("careful");
        audioCues.playClick();
        await speakAsync("Careful mode activated. I will confirm every answer.");
        await listenForAnswer(q, index);
        return true;

      case "cancel":
        stopEngine();
        return true;

      case "remove":
        if (q.type === "select_multiple" && cmd.target) {
          const current = getResponse(q.id);
          if (Array.isArray(current)) {
            const target = cmd.target.toLowerCase();
            const match = q.options?.find(o => o.label.toLowerCase() === target || o.value.toLowerCase() === target);
            if (match) {
              undoStackRef.current.push({ questionId: q.id, previousValue: [...current] });
              setResponse(q.id, current.filter((v: string) => v !== match.value));
              audioCues.playClick();
              await speakAsync(`Removed ${match.label}.`);
            } else {
              await speakAsync(`I couldn't find "${cmd.target}" in your selections.`);
            }
          }
          await listenForAnswer(q, index);
          return true;
        }
        return false;

      case "add":
        if (q.type === "select_multiple" && cmd.target) {
          const target = cmd.target.toLowerCase();
          const match = q.options?.find(o => o.label.toLowerCase() === target || o.value.toLowerCase() === target);
          if (match) {
            const current = getResponse(q.id) || [];
            if (!current.includes(match.value)) {
              undoStackRef.current.push({ questionId: q.id, previousValue: [...current] });
              setResponse(q.id, [...current, match.value]);
              audioCues.playClick();
              await speakAsync(`Added ${match.label}.`);
            } else {
              await speakAsync(`${match.label} is already selected.`);
            }
          } else {
            await speakAsync(`I couldn't find "${cmd.target}" in the options.`);
          }
          await listenForAnswer(q, index);
          return true;
        }
        return false;

      default:
        return false;
    }
  }, [questions, getResponse, setResponse, clearResponse, confidence, audioCues, pendingValue]);

  // ─── Answer Processing ────────────────────────────────────────────
  const processAnswer = useCallback(async (text: string, rawConf: number, q: VoiceQuestion, index: number): Promise<boolean> => {
    const fieldRisk = classifyFieldRiskByLabel(q.label, q.type, q.required);
    let extractedValue: any = text.trim();

    // Type-specific extraction
    switch (q.type) {
      case "select_one": {
        if (!q.options?.length) break;
        const lower = text.toLowerCase().trim();
        // Try by number
        const num = parseInt(lower);
        if (!isNaN(num) && num >= 1 && num <= q.options.length) {
          extractedValue = q.options[num - 1].value;
          break;
        }
        // Try exact match
        const exact = q.options.find(o => o.label.toLowerCase() === lower || o.value.toLowerCase() === lower);
        if (exact) { extractedValue = exact.value; break; }
        // Fuzzy
        const fuzzy = q.options.find(o => lower.includes(o.label.toLowerCase()) || o.label.toLowerCase().includes(lower));
        if (fuzzy) { extractedValue = fuzzy.value; break; }
        // No match
        await speakAsync(`I couldn't match "${text}" to any option. Say the option name or number.`);
        confidence.recordCorrection();
        await listenForAnswer(q, index);
        return true; // handled (but failed)
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
            // Listen for confirm/change
            try {
              const { text: confText } = await startRecognition();
              const confCmd = parseCommand(confText);
              if (confCmd.type === "next" || confCmd.type === "confirm") {
                confidence.recordSuccess();
                audioCues.playSuccess();
                goToIndex(index + 1);
              } else {
                await handleCommand(confCmd, confText, q, index);
              }
            } catch { /* fall through */ }
            return true;
          }
        }
        // Try matching options
        const match = q.options.find(o => {
          const ll = lower.replace(/^(select|add|check)\s+/, "");
          return o.label.toLowerCase() === ll || o.value.toLowerCase() === ll || ll.includes(o.label.toLowerCase());
        });
        if (match) {
          const current = Array.isArray(getResponse(q.id)) ? [...getResponse(q.id)] : [];
          if (!current.includes(match.value)) {
            undoStackRef.current.push({ questionId: q.id, previousValue: [...current] });
            current.push(match.value);
            setResponse(q.id, current);
          }
          audioCues.playClick();
          await speakAsync(`Selected ${match.label}. Say another option, or say "done".`);
          await listenForAnswer(q, index);
          return true;
        }
        await speakAsync(`I couldn't match "${text}" to an option. Say the option name or number.`);
        await listenForAnswer(q, index);
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
          confidence.recordCorrection();
          await listenForAnswer(q, index);
          return true;
        }
        break;
      }

      case "date":
      case "datetime": {
        try {
          const d = new Date(text);
          if (!isNaN(d.getTime())) {
            extractedValue = q.type === "datetime"
              ? d.toISOString().slice(0, 16)
              : d.toISOString().slice(0, 10);
          } else {
            await speakAsync("I couldn't understand that date. Please say it clearly, for example, January 15 2025.");
            await listenForAnswer(q, index);
            return true;
          }
        } catch {
          await speakAsync("I couldn't parse that date. Please try again.");
          await listenForAnswer(q, index);
          return true;
        }
        break;
      }

      case "geopoint":
      case "image":
      case "audio":
      case "video":
      case "barcode":
      case "signature": {
        // These are action triggers, not text answers
        const actionMap: Record<string, string> = {
          geopoint: "capture_gps", image: "take_photo", audio: "record_audio",
          video: "record_video", barcode: "scan_barcode", signature: "signature",
        };
        const lower = text.toLowerCase();
        const triggerWords: Record<string, string[]> = {
          geopoint: ["capture", "location", "gps", "position"],
          image: ["photo", "picture", "capture", "image", "camera"],
          audio: ["record", "audio", "start"],
          video: ["record", "video", "start"],
          barcode: ["scan", "barcode", "code"],
          signature: ["done", "finished", "complete", "signed"],
        };
        const triggers = triggerWords[q.type] || [];
        if (triggers.some(t => lower.includes(t))) {
          // The action will be handled by the parent FormFiller via voiceTriggers
          setResponse(q.id, `__voice_trigger_${actionMap[q.type]}`);
          audioCues.playClick();
          const actionLabels: Record<string, string> = {
            capture_gps: "Capturing GPS location.",
            take_photo: "Opening camera.",
            record_audio: "Starting audio recording.",
            record_video: "Starting video recording.",
            scan_barcode: "Opening barcode scanner.",
          };
          await speakAsync(actionLabels[actionMap[q.type]] || "Action triggered.");
          goToIndex(index + 1);
          return true;
        }
        await speakAsync(`Please say the action, for example "${triggers[0] || "start"}".`);
        await listenForAnswer(q, index);
        return true;
      }

      case "acknowledge": {
        const lower = text.toLowerCase();
        if (["yes", "acknowledge", "agree", "confirm", "ok", "okay"].some(w => lower.includes(w))) {
          extractedValue = true;
        } else {
          await speakAsync("Say 'yes' or 'acknowledge' to confirm.");
          await listenForAnswer(q, index);
          return true;
        }
        break;
      }
    }

    // ─── Confidence check & confirmation ────────────────────────
    setState("confirming");
    const confResult = confidence.scoreConfidence(rawConf, String(extractedValue), q.type, q.options);
    setLastConfidence(confResult);

    const policy = confidence.getConfirmationPolicy(confResult, fieldRisk, String(extractedValue), q.type);
    setLastPolicy(policy);

    if (policy.action === "reprompt") {
      audioCues.playWarning();
      await speakAsync(policy.ttsScript);
      confidence.recordCorrection();
      await listenForAnswer(q, index);
      return true;
    }

    if (policy.action === "guided_correction") {
      audioCues.playWarning();
      await speakAsync(policy.ttsScript);
      confidence.recordCorrection();
      await listenForAnswer(q, index);
      return true;
    }

    if (policy.action === "auto_accept") {
      undoStackRef.current.push({ questionId: q.id, previousValue: getResponse(q.id) });
      setResponse(q.id, extractedValue);
      confidence.recordSuccess();
      audioCues.playSuccess();
      await speakAsync(policy.ttsScript);
      goToIndex(index + 1);
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
        confidence.recordSuccess();
        audioCues.playSuccess();
        await speakAsync("Confirmed.");
        goToIndex(index + 1);
        return true;
      } else if (confCmd.type === "change" || confCmd.type === "start_over" || confCmd.type === "cancel") {
        setPendingValue(null);
        confidence.recordCorrection();
        await speakAsync("Okay, please say your answer again.");
        await listenForAnswer(q, index);
        return true;
      } else if (confCmd.type === "spell") {
        setPendingValue(null);
        setIsSpellingMode(true);
        setSpellingBuffer("");
        await speakAsync("Spelling mode. Say each letter. Say 'done' when finished.");
        await listenForSpelling(q, index);
        return true;
      } else {
        // Treat as new answer
        setPendingValue(null);
        return await processAnswer(confText, 0.7, q, index);
      }
    } catch {
      // No response → auto-accept if soft, re-prompt if strict
      if (policy.action === "soft_confirm") {
        undoStackRef.current.push({ questionId: q.id, previousValue: getResponse(q.id) });
        setResponse(q.id, extractedValue);
        setPendingValue(null);
        confidence.recordSuccess();
        audioCues.playSuccess();
        goToIndex(index + 1);
        return true;
      }
      setPendingValue(null);
      await speakAsync("I didn't hear a confirmation. Please say your answer again.");
      await listenForAnswer(q, index);
      return true;
    }
  }, [confidence, getResponse, setResponse, startRecognition, audioCues]);

  // ─── Spelling Mode ────────────────────────────────────────────────
  const listenForSpelling = useCallback(async (q: VoiceQuestion, index: number) => {
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
            confidence.recordSuccess();
            audioCues.playSuccess();
            await speakAsync(`Spelled: ${buffer.split("").join(", ")}. Saved.`);
            goToIndex(index + 1);
          } else {
            await speakAsync("No letters captured. Returning to normal mode.");
            await listenForAnswer(q, index);
          }
          return;
        }
        if (lower === "clear" || lower === "start over") {
          buffer = "";
          setSpellingBuffer("");
          audioCues.playClick();
          await speakAsync("Cleared. Start spelling again.");
          continue;
        }
        if (lower === "backspace" || lower === "delete") {
          buffer = buffer.slice(0, -1);
          setSpellingBuffer(buffer);
          audioCues.playClick();
          await speakAsync(buffer ? `Deleted last letter. So far: ${buffer.split("").join(", ")}.` : "All cleared.");
          continue;
        }
        const letters = extractSpelledLetters(text);
        if (letters) {
          buffer += letters;
          setSpellingBuffer(buffer);
          audioCues.playClick();
          await speakAsync(`${letters}. So far: ${buffer.split("").join(", ")}.`);
        } else {
          await speakAsync("I didn't catch that letter. Try again, or use NATO phonetic alphabet.");
        }
      } catch (err: any) {
        if (err.message === "aborted") return;
        await speakAsync("I didn't hear anything. Say a letter, or 'done' to finish.");
      }
    }
  }, [startRecognition, getResponse, setResponse, confidence, audioCues]);

  // ─── Review Mode ──────────────────────────────────────────────────
  const doReview = useCallback(async () => {
    setState("reviewing");
    const answered: string[] = [];
    const unanswered: string[] = [];

    questions.forEach((q, i) => {
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

    // Listen for command
    try {
      const { text } = await startRecognition();
      const cmd = parseCommand(text);
      if (cmd.type === "submit") {
        await doSubmitFlow();
      } else if (cmd.type === "jump") {
        const num = parseInt(cmd.target || "0");
        if (num >= 1 && num <= questions.length) goToIndex(num - 1);
        else {
          await speakAsync("Invalid question number.");
          await doReview();
        }
      } else if (cmd.type === "edit" && cmd.target) {
        const num = parseInt(cmd.target);
        if (!isNaN(num) && num >= 1 && num <= questions.length) goToIndex(num - 1);
      } else {
        // Return to current question
        goToIndex(currentIndex);
      }
    } catch {
      goToIndex(currentIndex);
    }
  }, [questions, getResponse, startRecognition, currentIndex]);

  // ─── Submit Flow ──────────────────────────────────────────────────
  const doSubmitFlow = useCallback(async () => {
    setState("submitting");
    // Check for unanswered mandatory
    const missing = questions.filter(q => {
      if (!q.required) return false;
      const v = getResponse(q.id);
      return v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);
    });

    if (missing.length > 0) {
      await speakAsync(`You have ${missing.length} mandatory questions unanswered: ${missing.map((m, i) => `${i + 1}, ${m.label.replace(/<[^>]*>/g, "")}`).join(". ")}. Please complete them before submitting.`);
      // Jump to first missing
      const idx = questions.findIndex(q => q.id === missing[0].id);
      goToIndex(idx >= 0 ? idx : 0);
      return;
    }

    await speakAsync("All questions are answered. Are you sure you want to submit? Say 'confirm' or 'cancel'.");
    try {
      const { text } = await startRecognition();
      const cmd = parseCommand(text);
      if (cmd.type === "confirm" || cmd.type === "next") {
        audioCues.playSuccess();
        await speakAsync("Submitting your form now.");
        onSubmitRequest();
      } else {
        await speakAsync("Submission cancelled. Returning to the form.");
        goToIndex(currentIndex);
      }
    } catch {
      await speakAsync("I didn't hear a response. Submission cancelled.");
      goToIndex(currentIndex);
    }
  }, [questions, getResponse, startRecognition, onSubmitRequest, audioCues, currentIndex]);

  // ─── Navigation ───────────────────────────────────────────────────
  const goToIndex = useCallback((index: number) => {
    if (index >= questions.length) {
      // End of form
      doReview();
      return;
    }
    if (index < 0) index = 0;
    processQuestion(index);
  }, [questions.length, processQuestion, doReview]);

  // ─── Engine Start/Stop ────────────────────────────────────────────
  const startEngine = useCallback(async () => {
    if (!enabled) return;
    abortRef.current = false;
    isActiveRef.current = true;
    audioCues.playSuccess();
    await speakAsync(
      `Voice Form Mode activated. You have ${questions.length} questions. ` +
      `I will read each question and wait for your voice answer. ` +
      `Say "help" at any time for available commands. ` +
      `Say "fast mode" to reduce confirmations, or "careful mode" for more checking. ` +
      `Let's begin.`
    );
    processQuestion(0);
  }, [enabled, questions.length, processQuestion, audioCues]);

  const stopEngine = useCallback(() => {
    abortRef.current = true;
    isActiveRef.current = false;
    stopRecognition();
    stopSpeaking();
    setState("idle");
    audioCues.playClick();
  }, [stopRecognition, audioCues]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortRef.current = true;
      stopRecognition();
      stopSpeaking();
    };
  }, [stopRecognition]);

  return {
    // State
    state,
    currentIndex,
    currentQuestion,
    isActive: state !== "idle",
    lastConfidence,
    lastPolicy,
    isSpellingMode,
    spellingBuffer,

    // Actions
    startEngine,
    stopEngine,
    goToIndex,
    processQuestion,

    // Mode
    mode: confidence.getMode(),
    setMode: confidence.setMode,
  };
};

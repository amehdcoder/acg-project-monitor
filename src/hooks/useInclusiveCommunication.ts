import { useState, useCallback, useMemo } from "react";

export type CommunicationMode = "sign" | "text" | "icon" | "assisted";
export type FlowPhase = "delivering" | "capturing" | "confirming" | "correcting" | "reviewing" | "submitted";

export interface InclusiveQuestion {
  id: string;
  label: string;
  type: string;
  required?: boolean;
  options?: { label: string; value: string }[];
  hint?: string;
  groupId?: string;
}

export interface QuestionChunk {
  text: string;
  iconHint?: string; // e.g. "calendar", "symptom", "number"
  isOptions?: boolean;
}

export interface ConfirmedResponse {
  questionId: string;
  value: any;
  displayValue: string;
  confirmed: boolean;
  timestamp: number;
}

// Break a complex question into digestible chunks for low-literacy users
export function chunkQuestion(label: string, options?: { label: string; value: string }[]): QuestionChunk[] {
  const chunks: QuestionChunk[] = [];
  
  // Detect time-frame phrases and split them out
  const timeFrameMatch = label.match(/(in the (?:last|past) \d+ (?:days?|weeks?|months?|years?))/i);
  if (timeFrameMatch) {
    chunks.push({ text: timeFrameMatch[1], iconHint: "calendar" });
    const remainder = label.replace(timeFrameMatch[0], "").replace(/^\s*,?\s*/, "").trim();
    if (remainder) chunks.push({ text: remainder });
  } else {
    // Split on "?" — question part vs context
    const parts = label.split(/[?]/).filter(Boolean).map(s => s.trim());
    if (parts.length > 1) {
      parts.forEach(p => chunks.push({ text: p + (p.endsWith("?") ? "" : "") }));
    } else {
      chunks.push({ text: label });
    }
  }

  if (options && options.length > 0) {
    chunks.push({ text: "Choose from these options:", isOptions: true, iconHint: "list" });
  }

  return chunks;
}

// Simplify question text for "Explain Differently" feature
export function simplifyQuestion(label: string): string {
  const simplifications: [RegExp, string][] = [
    [/have you experienced/i, "Did you have"],
    [/any of the following/i, "any of these"],
    [/in the last (\d+) weeks?/i, "in the past $1 weeks"],
    [/please indicate/i, "Tell us"],
    [/approximately how many/i, "About how many"],
    [/what is your/i, "Your"],
    [/do you currently/i, "Do you now"],
    [/have you ever been/i, "Were you ever"],
    [/household members/i, "people in your home"],
    [/primary source of/i, "main"],
    [/enumerate/i, "list"],
    [/residing in/i, "living in"],
  ];
  
  let simplified = label;
  simplifications.forEach(([pattern, replacement]) => {
    simplified = simplified.replace(pattern, replacement);
  });
  
  // Shorten sentences over 60 chars
  if (simplified.length > 80) {
    const sentences = simplified.split(/[.!]/);
    if (sentences.length > 1) {
      simplified = sentences[0].trim() + "?";
    }
  }
  
  return simplified;
}

// Get an icon hint for a question type
export function getQuestionIconHint(type: string): string {
  const map: Record<string, string> = {
    text: "pencil",
    number: "hash",
    integer: "hash",
    decimal: "hash",
    select_one: "list",
    select_multiple: "check-square",
    date: "calendar",
    time: "clock",
    dateTime: "calendar-clock",
    geopoint: "map-pin",
    photo: "camera",
    video: "video",
    audio: "mic",
    barcode: "scan",
    acknowledge: "thumbs-up",
    range: "sliders",
    signature: "pen-tool",
  };
  return map[type] || "message-circle";
}

export function useInclusiveCommunication(questions: InclusiveQuestion[]) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [phase, setPhase] = useState<FlowPhase>("delivering");
  const [mode, setMode] = useState<CommunicationMode>("text");
  const [responses, setResponses] = useState<Record<string, ConfirmedResponse>>({});
  const [pendingValue, setPendingValue] = useState<any>(null);
  const [pendingDisplay, setPendingDisplay] = useState("");
  const [isSimplified, setIsSimplified] = useState(false);

  const currentQuestion = questions[currentIndex] || null;
  const totalQuestions = questions.length;
  const progress = totalQuestions > 0 ? ((Object.keys(responses).length) / totalQuestions) * 100 : 0;

  const chunks = useMemo(() => {
    if (!currentQuestion) return [];
    return chunkQuestion(
      isSimplified ? simplifyQuestion(currentQuestion.label) : currentQuestion.label,
      currentQuestion.options
    );
  }, [currentQuestion, isSimplified]);

  // Navigate
  const goToQuestion = useCallback((index: number) => {
    if (index >= 0 && index < questions.length) {
      setCurrentIndex(index);
      setPhase("delivering");
      setPendingValue(null);
      setPendingDisplay("");
      setIsSimplified(false);
    }
  }, [questions.length]);

  const nextQuestion = useCallback(() => {
    if (currentIndex < questions.length - 1) {
      goToQuestion(currentIndex + 1);
    } else {
      setPhase("reviewing");
    }
  }, [currentIndex, questions.length, goToQuestion]);

  const prevQuestion = useCallback(() => {
    goToQuestion(Math.max(0, currentIndex - 1));
  }, [currentIndex, goToQuestion]);

  // Phase transitions
  const startCapturing = useCallback(() => setPhase("capturing"), []);
  
  const submitResponse = useCallback((value: any, displayValue: string) => {
    setPendingValue(value);
    setPendingDisplay(displayValue);
    setPhase("confirming");
  }, []);

  const confirmResponse = useCallback(() => {
    if (!currentQuestion) return;
    setResponses(prev => ({
      ...prev,
      [currentQuestion.id]: {
        questionId: currentQuestion.id,
        value: pendingValue,
        displayValue: pendingDisplay,
        confirmed: true,
        timestamp: Date.now(),
      },
    }));
    setPendingValue(null);
    setPendingDisplay("");
    nextQuestion();
  }, [currentQuestion, pendingValue, pendingDisplay, nextQuestion]);

  const rejectResponse = useCallback(() => {
    setPendingValue(null);
    setPendingDisplay("");
    setPhase("capturing");
  }, []);

  const startCorrection = useCallback(() => {
    setPhase("correcting");
  }, []);

  const clearResponse = useCallback((questionId: string) => {
    setResponses(prev => {
      const next = { ...prev };
      delete next[questionId];
      return next;
    });
  }, []);

  const editResponse = useCallback((questionId: string) => {
    const idx = questions.findIndex(q => q.id === questionId);
    if (idx >= 0) {
      clearResponse(questionId);
      goToQuestion(idx);
      setPhase("capturing");
    }
  }, [questions, clearResponse, goToQuestion]);

  const toggleSimplify = useCallback(() => setIsSimplified(prev => !prev), []);

  const goToReview = useCallback(() => setPhase("reviewing"), []);

  const exitReview = useCallback(() => {
    setPhase("delivering");
  }, []);

  // Get flat responses map for form submission
  const getFlatResponses = useCallback((): Record<string, any> => {
    const flat: Record<string, any> = {};
    Object.values(responses).forEach(r => {
      flat[r.questionId] = r.value;
    });
    return flat;
  }, [responses]);

  // Check if all required questions are answered
  const missingRequired = useMemo(() => {
    return questions.filter(q => q.required && !responses[q.id]);
  }, [questions, responses]);

  return {
    // State
    currentIndex,
    currentQuestion,
    totalQuestions,
    progress,
    phase,
    mode,
    chunks,
    responses,
    pendingValue,
    pendingDisplay,
    isSimplified,
    missingRequired,

    // Navigation
    goToQuestion,
    nextQuestion,
    prevQuestion,
    goToReview,
    exitReview,

    // Phase control
    startCapturing,
    submitResponse,
    confirmResponse,
    rejectResponse,
    startCorrection,
    clearResponse,
    editResponse,
    toggleSimplify,

    // Mode
    setMode,

    // Data
    getFlatResponses,
    setPhase,
  };
}

import { useCallback, useRef } from "react";

// ─── Field Risk Classification ──────────────────────────────────────
export type FieldRisk = "low" | "medium" | "high" | "critical";

export function classifyFieldRisk(type: string, required: boolean): FieldRisk {
  if (["text"].includes(type) && !required) return "low";
  if (["select_one", "acknowledge", "note"].includes(type)) return "low";
  if (["number", "integer", "decimal", "select_multiple", "date", "time", "range"].includes(type)) return "medium";
  if (["geopoint", "image", "audio", "video", "barcode", "signature"].includes(type)) return "medium";
  if (required && ["text"].includes(type)) return "high";
  // Names, IDs, phone, email — anything short text + required
  return required ? "high" : "medium";
}

export function classifyFieldRiskByLabel(label: string, type: string, required: boolean): FieldRisk {
  const lower = label.toLowerCase();
  const criticalPatterns = /\b(name|phone|email|id\b|number|nid|nin|passport|registration|serial)/i;
  if (criticalPatterns.test(lower) && (type === "text" || type === "number")) return "critical";
  return classifyFieldRisk(type, required);
}

// ─── Confidence Levels ──────────────────────────────────────────────
export type ConfidenceLevel = "very_low" | "low" | "medium" | "high" | "very_high";

export interface ConfidenceResult {
  level: ConfidenceLevel;
  score: number; // 0–1
  rawConfidence: number;
  semanticBoost: number;
  ambiguityPenalty: number;
}

// ─── Confirmation Actions ───────────────────────────────────────────
export type ConfirmationAction =
  | "auto_accept"         // lightweight acknowledgment
  | "soft_confirm"        // "You said X. Continue or change?"
  | "strict_confirm"      // "I heard X. Confirm or correct?"
  | "reprompt"            // "I didn't catch that. Please say again."
  | "guided_correction";  // switch to guided mode

export interface ConfirmationPolicy {
  action: ConfirmationAction;
  ttsScript: string;
  requiresExplicitYes: boolean;
}

// ─── Adaptive Learning ──────────────────────────────────────────────
interface UserProfile {
  totalAnswers: number;
  corrections: number;
  consecutiveSuccesses: number;
  consecutiveFailures: number;
  mode: "careful" | "fast";
}

export const useVoiceConfidence = () => {
  const profileRef = useRef<UserProfile>({
    totalAnswers: 0,
    corrections: 0,
    consecutiveSuccesses: 0,
    consecutiveFailures: 0,
    mode: "careful",
  });

  // ─── Confidence Scoring ─────────────────────────────────────────
  const scoreConfidence = useCallback((
    rawConfidence: number,
    capturedText: string,
    questionType: string,
    options?: { label: string; value: string }[],
  ): ConfidenceResult => {
    let semanticBoost = 0;
    let ambiguityPenalty = 0;

    // Semantic boost: if captured text exactly matches an option
    if (options?.length) {
      const lower = capturedText.toLowerCase().trim();
      const exactMatch = options.some(o =>
        o.label.toLowerCase() === lower || o.value.toLowerCase() === lower
      );
      if (exactMatch) semanticBoost = 0.15;
      else {
        // Partial match
        const partialMatch = options.some(o =>
          lower.includes(o.label.toLowerCase()) || o.label.toLowerCase().includes(lower)
        );
        if (partialMatch) semanticBoost = 0.05;
      }

      // Ambiguity: similar-sounding options
      const matches = options.filter(o =>
        lower.includes(o.label.toLowerCase()) || o.label.toLowerCase().includes(lower)
      );
      if (matches.length > 1) ambiguityPenalty = 0.15;
    }

    // Numeric: high confidence if it's a clean number
    if (["number", "integer", "decimal"].includes(questionType)) {
      if (/^-?\d+\.?\d*$/.test(capturedText.trim())) semanticBoost = 0.1;
    }

    // Short text with few words gets slight penalty (harder to verify)
    if (questionType === "text" && capturedText.trim().split(/\s+/).length <= 2) {
      ambiguityPenalty += 0.05;
    }

    const adjustedScore = Math.max(0, Math.min(1, rawConfidence + semanticBoost - ambiguityPenalty));
    let level: ConfidenceLevel;
    if (adjustedScore >= 0.92) level = "very_high";
    else if (adjustedScore >= 0.78) level = "high";
    else if (adjustedScore >= 0.6) level = "medium";
    else if (adjustedScore >= 0.4) level = "low";
    else level = "very_low";

    return { level, score: adjustedScore, rawConfidence, semanticBoost, ambiguityPenalty };
  }, []);

  // ─── Confirmation Policy ────────────────────────────────────────
  const getConfirmationPolicy = useCallback((
    confidence: ConfidenceResult,
    fieldRisk: FieldRisk,
    capturedText: string,
    questionType: string,
  ): ConfirmationPolicy => {
    const profile = profileRef.current;
    const isExperienced = profile.totalAnswers >= 8 && profile.corrections / Math.max(1, profile.totalAnswers) < 0.15;
    const inFastMode = profile.mode === "fast";

    // After 3+ consecutive failures, force careful mode
    if (profile.consecutiveFailures >= 3) {
      profileRef.current.mode = "careful";
    }

    // Very low confidence → always reprompt
    if (confidence.level === "very_low") {
      return {
        action: "reprompt",
        ttsScript: `I'm not confident I captured that correctly. Please say your answer again, or spell it out.`,
        requiresExplicitYes: false,
      };
    }

    // Low confidence → guided or reprompt based on risk
    if (confidence.level === "low") {
      if (fieldRisk === "critical" || fieldRisk === "high") {
        return {
          action: "guided_correction",
          ttsScript: `I heard "${capturedText}" but I'm not sure that's right. Please say it again clearly, or spell it letter by letter.`,
          requiresExplicitYes: true,
        };
      }
      return {
        action: "reprompt",
        ttsScript: `That sounded unclear. Please repeat your answer.`,
        requiresExplicitYes: false,
      };
    }

    // Medium confidence
    if (confidence.level === "medium") {
      if (fieldRisk === "critical") {
        return {
          action: "strict_confirm",
          ttsScript: `I heard "${capturedText}". Please say "confirm" if correct, or say "correct" to change it.`,
          requiresExplicitYes: true,
        };
      }
      return {
        action: "soft_confirm",
        ttsScript: `${capturedText}. Say "continue" or "change".`,
        requiresExplicitYes: false,
      };
    }

    // High/very high confidence
    if (fieldRisk === "critical") {
      return {
        action: "strict_confirm",
        ttsScript: `I heard "${capturedText}". Please confirm or correct.`,
        requiresExplicitYes: true,
      };
    }

    if (fieldRisk === "high") {
      if (inFastMode && isExperienced && confidence.level === "very_high") {
        return {
          action: "auto_accept",
          ttsScript: `${capturedText}.`,
          requiresExplicitYes: false,
        };
      }
      return {
        action: "soft_confirm",
        ttsScript: `${capturedText}. Continue or change?`,
        requiresExplicitYes: false,
      };
    }

    // Low/medium risk + high confidence → auto accept
    if (inFastMode || (isExperienced && confidence.level === "very_high")) {
      return {
        action: "auto_accept",
        ttsScript: `${capturedText}.`,
        requiresExplicitYes: false,
      };
    }

    return {
      action: "auto_accept",
      ttsScript: `Got it. ${capturedText}.`,
      requiresExplicitYes: false,
    };
  }, []);

  // ─── Learning / Tracking ────────────────────────────────────────
  const recordSuccess = useCallback(() => {
    const p = profileRef.current;
    p.totalAnswers++;
    p.consecutiveSuccesses++;
    p.consecutiveFailures = 0;
    // Auto-promote to fast mode after 12 consecutive successes
    if (p.consecutiveSuccesses >= 12 && p.mode === "careful") {
      p.mode = "fast";
    }
  }, []);

  const recordCorrection = useCallback(() => {
    const p = profileRef.current;
    p.corrections++;
    p.consecutiveSuccesses = 0;
    p.consecutiveFailures++;
    // Demote from fast to careful after 2 corrections in a row
    if (p.consecutiveFailures >= 2) {
      p.mode = "careful";
    }
  }, []);

  const setMode = useCallback((mode: "careful" | "fast") => {
    profileRef.current.mode = mode;
  }, []);

  const getMode = useCallback(() => profileRef.current.mode, []);

  return {
    scoreConfidence,
    getConfirmationPolicy,
    classifyFieldRisk: classifyFieldRiskByLabel,
    recordSuccess,
    recordCorrection,
    setMode,
    getMode,
  };
};

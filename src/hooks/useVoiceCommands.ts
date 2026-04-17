import { useCallback, useRef, useState } from "react";
import {
  parseSpokenNumber,
  parseSpokenTime,
  parseSpokenDate,
  parseYesNo,
  fuzzyMatchOption,
  extractMultipleOptions,
} from "@/lib/voiceParsing";

interface VoiceCommandsOptions {
  enabled: boolean;
  onSelectOption?: (questionId: string, optionValue: string) => void;
  onDeselectOption?: (questionId: string, optionValue: string) => void;
  onTextInput?: (questionId: string, text: string) => void;
  onNumberInput?: (questionId: string, value: string) => void;
  onDateInput?: (questionId: string, value: string) => void;
  onTimeInput?: (questionId: string, value: string) => void;
  onBooleanInput?: (questionId: string, value: boolean) => void;
  onTriggerAction?: (questionId: string, action: "capture_gps" | "take_photo" | "record_audio" | "record_video" | "scan_barcode" | "acknowledge") => void;
}

interface QuestionContext {
  id: string;
  type: string;
  options?: { label: string; value: string }[];
}

/**
 * Processes spoken text as commands for different question types.
 * Backed by global-grade parsers in src/lib/voiceParsing.ts.
 */
export const useVoiceCommands = (options: VoiceCommandsOptions) => {
  const [activeQuestionId, setActiveQuestionId] = useState<string | null>(null);
  const questionsMapRef = useRef<Map<string, QuestionContext>>(new Map());

  const registerQuestion = useCallback((q: QuestionContext) => {
    questionsMapRef.current.set(q.id, q);
  }, []);

  const processVoiceInput = useCallback((text: string, questionId: string) => {
    if (!options.enabled) return false;
    const q = questionsMapRef.current.get(questionId);
    if (!q) return false;

    const lower = text.toLowerCase().trim();

    switch (q.type) {
      case "select_one": {
        if (!q.options) return false;
        const match = fuzzyMatchOption(text, q.options);
        if (match) { options.onSelectOption?.(questionId, match.value); return true; }
        return false;
      }

      case "select_multiple": {
        if (!q.options) return false;
        // Deselect commands
        if (/^(deselect|remove|uncheck)\s+/i.test(lower)) {
          const rest = lower.replace(/^(deselect|remove|uncheck)\s+/i, "");
          const m = fuzzyMatchOption(rest, q.options);
          if (m) { options.onDeselectOption?.(questionId, m.value); return true; }
          return false;
        }
        // Multiple at once
        const matches = extractMultipleOptions(text, q.options);
        if (matches.length > 0) {
          matches.forEach(m => options.onSelectOption?.(questionId, m.value));
          return true;
        }
        return false;
      }

      case "text":
        options.onTextInput?.(questionId, text.trim());
        return true;

      case "number":
      case "integer":
      case "decimal": {
        const num = parseSpokenNumber(text);
        if (num !== null) { options.onNumberInput?.(questionId, num); return true; }
        return false;
      }

      case "range": {
        const num = parseSpokenNumber(text);
        if (num !== null) { options.onNumberInput?.(questionId, num); return true; }
        return false;
      }

      case "date":
      case "datetime": {
        const parsed = parseSpokenDate(text, q.type === "datetime");
        if (parsed) { options.onDateInput?.(questionId, parsed); return true; }
        return false;
      }

      case "time": {
        const parsed = parseSpokenTime(text);
        if (parsed) { options.onTimeInput?.(questionId, parsed); return true; }
        return false;
      }

      case "boolean":
      case "yes_no": {
        const yn = parseYesNo(text);
        if (yn !== null) { options.onBooleanInput?.(questionId, yn); return true; }
        return false;
      }

      case "geopoint":
      case "gps":
        if (/(capture|location|gps|position|coord|here|now)/i.test(lower)) {
          options.onTriggerAction?.(questionId, "capture_gps");
          return true;
        }
        return false;

      case "image":
      case "photo":
        if (/(photo|picture|capture|image|camera|snap|shot)/i.test(lower)) {
          options.onTriggerAction?.(questionId, "take_photo");
          return true;
        }
        return false;

      case "audio":
        if (/(record|audio|start|begin|microphone|mic)/i.test(lower)) {
          options.onTriggerAction?.(questionId, "record_audio");
          return true;
        }
        return false;

      case "video":
        if (/(record|video|start|begin|film|camera)/i.test(lower)) {
          options.onTriggerAction?.(questionId, "record_video");
          return true;
        }
        return false;

      case "barcode":
        if (/(scan|barcode|code|qr)/i.test(lower)) {
          options.onTriggerAction?.(questionId, "scan_barcode");
          return true;
        }
        return false;

      case "acknowledge":
        if (parseYesNo(text) === true || /(acknowledge|got it|understood)/i.test(lower)) {
          options.onTriggerAction?.(questionId, "acknowledge");
          return true;
        }
        return false;

      default:
        // For unknown types, treat as text input
        options.onTextInput?.(questionId, text.trim());
        return true;
    }
  }, [options]);

  return {
    activeQuestionId,
    setActiveQuestionId,
    registerQuestion,
    processVoiceInput,
  };
};

export default useVoiceCommands;

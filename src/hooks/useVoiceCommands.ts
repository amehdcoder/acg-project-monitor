import { useCallback, useRef, useState } from "react";

interface VoiceCommandsOptions {
  enabled: boolean;
  onSelectOption?: (questionId: string, optionValue: string) => void;
  onDeselectOption?: (questionId: string, optionValue: string) => void;
  onTextInput?: (questionId: string, text: string) => void;
  onNumberInput?: (questionId: string, value: string) => void;
  onDateInput?: (questionId: string, value: string) => void;
  onTriggerAction?: (questionId: string, action: "capture_gps" | "take_photo" | "record_audio" | "record_video" | "scan_barcode" | "acknowledge") => void;
}

interface QuestionContext {
  id: string;
  type: string;
  options?: { label: string; value: string }[];
}

/**
 * Processes spoken text as commands for different question types.
 * Returns the action to take based on the voice input.
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
        // Find best matching option
        const match = q.options.find(
          o => o.label.toLowerCase() === lower || o.value.toLowerCase() === lower
        );
        if (match) {
          options.onSelectOption?.(questionId, match.value);
          return true;
        }
        // Fuzzy: check if spoken text contains an option name
        const fuzzy = q.options.find(
          o => lower.includes(o.label.toLowerCase()) || lower.includes(o.value.toLowerCase())
        );
        if (fuzzy) {
          options.onSelectOption?.(questionId, fuzzy.value);
          return true;
        }
        return false;
      }

      case "select_multiple": {
        if (!q.options) return false;
        let matched = false;
        // Check for deselect commands
        if (lower.startsWith("deselect ") || lower.startsWith("remove ") || lower.startsWith("uncheck ")) {
          const rest = lower.replace(/^(deselect|remove|uncheck)\s+/, "");
          const match = q.options.find(
            o => o.label.toLowerCase() === rest || o.value.toLowerCase() === rest ||
              rest.includes(o.label.toLowerCase())
          );
          if (match) {
            options.onDeselectOption?.(questionId, match.value);
            return true;
          }
        }
        // Check for select commands or direct option names
        const cleanText = lower.replace(/^(select|check|choose)\s+/, "");
        for (const o of q.options) {
          if (cleanText.includes(o.label.toLowerCase()) || cleanText === o.value.toLowerCase()) {
            options.onSelectOption?.(questionId, o.value);
            matched = true;
          }
        }
        return matched;
      }

      case "text":
        options.onTextInput?.(questionId, text.trim());
        return true;

      case "number":
      case "integer":
      case "decimal": {
        // Extract numbers from speech
        const numWords: Record<string, string> = {
          zero: "0", one: "1", two: "2", three: "3", four: "4",
          five: "5", six: "6", seven: "7", eight: "8", nine: "9",
          ten: "10", eleven: "11", twelve: "12", thirteen: "13",
          fourteen: "14", fifteen: "15", sixteen: "16", seventeen: "17",
          eighteen: "18", nineteen: "19", twenty: "20", thirty: "30",
          forty: "40", fifty: "50", sixty: "60", seventy: "70",
          eighty: "80", ninety: "90", hundred: "100", thousand: "1000",
        };
        // Try direct number
        const numMatch = lower.match(/-?\d+\.?\d*/);
        if (numMatch) {
          options.onNumberInput?.(questionId, numMatch[0]);
          return true;
        }
        // Try word-to-number
        if (numWords[lower]) {
          options.onNumberInput?.(questionId, numWords[lower]);
          return true;
        }
        return false;
      }

      case "date":
      case "datetime": {
        // Try to parse spoken date
        try {
          const d = new Date(text);
          if (!isNaN(d.getTime())) {
            const formatted = q.type === "datetime"
              ? d.toISOString().slice(0, 16)
              : d.toISOString().slice(0, 10);
            options.onDateInput?.(questionId, formatted);
            return true;
          }
        } catch { /* ignore */ }
        return false;
      }

      case "geopoint":
      case "gps":
        if (lower.includes("capture") || lower.includes("location") || lower.includes("gps") || lower.includes("position")) {
          options.onTriggerAction?.(questionId, "capture_gps");
          return true;
        }
        return false;

      case "image":
      case "photo":
        if (lower.includes("photo") || lower.includes("picture") || lower.includes("capture") || lower.includes("image") || lower.includes("camera")) {
          options.onTriggerAction?.(questionId, "take_photo");
          return true;
        }
        return false;

      case "audio":
        if (lower.includes("record") || lower.includes("audio") || lower.includes("start")) {
          options.onTriggerAction?.(questionId, "record_audio");
          return true;
        }
        return false;

      case "video":
        if (lower.includes("record") || lower.includes("video") || lower.includes("start")) {
          options.onTriggerAction?.(questionId, "record_video");
          return true;
        }
        return false;

      case "barcode":
        if (lower.includes("scan") || lower.includes("barcode") || lower.includes("code")) {
          options.onTriggerAction?.(questionId, "scan_barcode");
          return true;
        }
        return false;

      case "acknowledge":
        if (lower.includes("acknowledge") || lower.includes("yes") || lower.includes("confirm") || lower.includes("agree")) {
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

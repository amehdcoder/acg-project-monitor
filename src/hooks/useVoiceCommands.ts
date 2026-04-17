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
        // Comprehensive word→number map (English, with common spoken forms)
        const numWords: Record<string, number> = {
          zero: 0, oh: 0, nought: 0, one: 1, two: 2, to: 2, too: 2, three: 3, four: 4, for: 4,
          five: 5, six: 6, seven: 7, eight: 8, ate: 8, nine: 9, ten: 10,
          eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
          sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
          twenty: 20, thirty: 30, forty: 40, fourty: 40, fifty: 50,
          sixty: 60, seventy: 70, eighty: 80, ninety: 90,
        };
        const scales: Record<string, number> = { hundred: 100, thousand: 1_000, million: 1_000_000, billion: 1_000_000_000 };

        // 1) Direct numeric form (with negative, decimals, comma thousands)
        const cleaned = lower.replace(/,/g, "").replace(/\bpoint\b/g, ".").replace(/\bnegative|minus\b/g, "-");
        const numMatch = cleaned.match(/-?\d+(?:\.\d+)?/);
        if (numMatch) {
          options.onNumberInput?.(questionId, numMatch[0]);
          return true;
        }

        // 2) Word-form parser supporting compounds: "twenty five", "one hundred and twenty three"
        const tokens = cleaned.replace(/-/g, " ").split(/[\s]+/).filter(Boolean);
        let total = 0, current = 0, matchedAny = false;
        for (const t of tokens) {
          if (t === "and") continue;
          if (numWords[t] !== undefined) { current += numWords[t]; matchedAny = true; }
          else if (scales[t] !== undefined) {
            const scale = scales[t];
            if (scale === 100) { current = (current || 1) * scale; }
            else { total += (current || 1) * scale; current = 0; }
            matchedAny = true;
          }
        }
        if (matchedAny) {
          options.onNumberInput?.(questionId, String(total + current));
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

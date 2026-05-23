/**
 * STT routing helpers — Batch 10.
 *
 * Picks the best transcription tier per language and keeps language hints
 * consistent across the on-device Whisper pipeline and the ElevenLabs
 * Scribe cloud edge function.
 *
 *   • Whisper code (`en`, `ha`, `yo`, `ig`, `fr`, `ar`) — used by
 *     @huggingface/transformers Whisper-small.
 *   • Scribe code (ISO 639-3: `eng`, `hau`, `yor`, `ibo`, `fra`, `ara`) —
 *     used by the `scribe-transcribe` edge function.
 *
 * Routing policy:
 *   • Hausa / Yoruba / Igbo  → prefer on-device Whisper (Scribe accuracy on
 *     these is weak and burns credits). Cloud Scribe is the fallback while
 *     the model is still downloading.
 *   • Everything else        → cloud Scribe first, Whisper if the user
 *     explicitly enabled it.
 *
 * Code-switch: Whisper transcribes embedded English digits inside HA/YO/IG
 * utterances naturally; the numeric grammar layer (Batch 8) then coerces
 * them to digits when the active question is integer/decimal.
 */

import type { WhisperLanguage } from "@/hooks/useOfflineWhisper";
import type { Language } from "@/lib/i18n";

/** Whisper language code → ISO 639-3 used by ElevenLabs Scribe. */
export function whisperToScribe(w: WhisperLanguage | string): string {
  switch (w) {
    case "ha": return "hau";
    case "yo": return "yor";
    case "ig": return "ibo";
    case "fr": return "fra";
    case "ar": return "ara";
    case "auto": return "eng"; // best default when Whisper auto-detects
    case "en":
    default:    return "eng";
  }
}

/** App locale → Whisper code (used to pre-pick the right Whisper variant). */
export function appLangToWhisper(lang: Language | string): WhisperLanguage {
  switch (lang) {
    case "ha": return "ha";
    case "yo": return "yo";
    case "ig": return "ig";
    case "fr": return "fr";
    case "ar": return "ar";
    default:   return "en";
  }
}

/** Low-resource languages where Scribe quality is materially worse than Whisper-small. */
export function isLowResourceWhisper(w: WhisperLanguage | string): boolean {
  return w === "ha" || w === "yo" || w === "ig";
}

/**
 * Should the form filler prefer on-device Whisper for this language even
 * if the user hasn't explicitly toggled it on?
 */
export function shouldPreferOnDeviceWhisper(w: WhisperLanguage | string): boolean {
  return isLowResourceWhisper(w);
}

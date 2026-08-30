/**
 * safetyPolicy — the single, global SLM safety layer for Amehnities AI.
 *
 * Every prompt, every generated answer and every imported training example
 * passes through the *same* policy object, so behaviour can never drift
 * between chat, retrieval and fine-tuning:
 *
 *  1. PII redaction     — phones, emails, NIN/BVN, account/card numbers and
 *                         precise personal coordinates are masked before the
 *                         text is shown, stored, indexed or trained on.
 *  2. Refusal behaviour — a fixed, auditable list of disallowed requests with
 *                         one consistent, non-preachy refusal message and a
 *                         safe alternative.
 *  3. Output formatting — deterministic shape for every answer: clean
 *                         whitespace, normalised bullets, bounded length,
 *                         no control characters, terminal punctuation.
 *
 * Nothing here calls a network service: the policy is local, deterministic and
 * therefore identical offline, in tests and in production.
 */

export const SAFETY_POLICY_VERSION = "amehnities-slm-safety-v1";

/* --------------------------------------------------------------- redaction */

export type PiiKind =
  | "email" | "phone" | "nin" | "bvn" | "account" | "card" | "coordinates" | "token";

interface PiiRule { kind: PiiKind; label: string; re: RegExp }

/**
 * Ordered on purpose: the most specific identifiers run first so an 11-digit
 * NIN is never mis-masked as a phone number.
 */
const PII_RULES: PiiRule[] = [
  { kind: "email", label: "[email redacted]", re: /\b[\w.+-]+@[\w-]+\.[\w.-]{2,}\b/gi },
  { kind: "token", label: "[credential redacted]", re: /\b(?:sk|pk|api|key|token|bearer)[-_ ]?[A-Za-z0-9_-]{16,}\b/gi },
  { kind: "card", label: "[card redacted]", re: /\b(?:\d[ -]?){13,19}\b/g },
  { kind: "nin", label: "[NIN redacted]", re: /\b(?:nin|national identi(?:ty|fication)(?:\s+number)?)\s*[:#-]?\s*\d{11}\b/gi },
  { kind: "bvn", label: "[BVN redacted]", re: /\b(?:bvn)\s*[:#-]?\s*\d{11}\b/gi },
  { kind: "phone", label: "[phone redacted]", re: /(?:\+?234|\b0)(?:[\s-]?\d){9,10}\b/g },
  { kind: "account", label: "[account redacted]", re: /\b(?:acc(?:oun)?t|a\/c)\s*(?:no\.?|number)?\s*[:#-]?\s*\d{10}\b/gi },
  { kind: "coordinates", label: "[precise location redacted]", re: /\b-?\d{1,3}\.\d{6,}\s*,\s*-?\d{1,3}\.\d{6,}\b/g },
];

export interface RedactionResult {
  text: string;
  /** Count of each identifier class removed, for the audit trail. */
  counts: Partial<Record<PiiKind, number>>;
  redacted: boolean;
}

/** Mask every direct personal identifier found in `input`. */
export function redactPii(input: string): RedactionResult {
  let text = String(input ?? "");
  const counts: Partial<Record<PiiKind, number>> = {};
  for (const rule of PII_RULES) {
    text = text.replace(rule.re, (match) => {
      // never mask ordinary small numbers or dates that slipped into a rule
      const digits = match.replace(/\D/g, "");
      if ((rule.kind === "card" || rule.kind === "phone") && digits.length < 10) return match;
      counts[rule.kind] = (counts[rule.kind] ?? 0) + 1;
      return rule.label;
    });
  }
  return { text, counts, redacted: Object.keys(counts).length > 0 };
}

/** Human sentence describing what was masked (empty when nothing was). */
export function describeRedactions(counts: Partial<Record<PiiKind, number>>): string {
  const parts = Object.entries(counts).map(([k, n]) => `${n} ${k}${n === 1 ? "" : "s"}`);
  return parts.length ? `Personal identifiers removed by policy: ${parts.join(", ")}.` : "";
}

/* ----------------------------------------------------------------- refusal */

export type RefusalCategory =
  | "personal_data_lookup"
  | "clinical_diagnosis"
  | "credentials"
  | "self_harm"
  | "harmful_instructions"
  | "data_falsification";

interface RefusalRule {
  category: RefusalCategory;
  re: RegExp;
  message: string;
}

const REFUSAL_RULES: RefusalRule[] = [
  {
    category: "self_harm",
    re: /\b(kill myself|suicide|end my life|self[- ]harm|hurt myself)\b/i,
    message:
      "I can't help with this. If you or someone you support is in danger, please contact local emergency services or a trusted health worker immediately. I can help with programme, supervision and data questions instead.",
  },
  {
    category: "credentials",
    re: /\b(service[_ ]role|api[_ ]?key|secret key|password|database password|access token|private key)\b.*\b(show|give|print|reveal|what is|send|expose)\b|\b(show|give|print|reveal|what is|send|expose)\b.*\b(service[_ ]role|api[_ ]?key|secret key|password|database password|access token|private key)\b/i,
    message:
      "I can't reveal credentials, keys or passwords. I can explain how access is granted and audited in Amehnities instead.",
  },
  {
    category: "personal_data_lookup",
    re: /\b(phone number|address|home address|bvn|nin|bank account|personal number)\b.*\b(of|for)\b\s+[A-Z][a-z]+|\b(give|send|list|share)\b.*\b(personal|private)\b.*\b(details|data|information)\b/,
    message:
      "I can't share personal contact or identity details of individuals. I can report role-level performance (SLO, EDO, FLHF in-charge, CDD) and aggregated accountability figures instead.",
  },
  {
    category: "clinical_diagnosis",
    re: /\b(diagnose|prescribe|what (?:drug|medicine|dose) should (?:i|he|she|they) (?:take|use))\b/i,
    message:
      "I can't diagnose or prescribe treatment for an individual. I can summarise programme guidance, MDA dosing protocols as documented, and refer you to a qualified clinician.",
  },
  {
    category: "data_falsification",
    re: /\b(fake|falsif\w*|fabricat\w*|inflate|make up)\b.*\b(data|coverage|submission|report|record|number)s?\b/i,
    message:
      "I can't help fabricate or inflate programme data. I can help you explain a genuine shortfall, document the reason and plan a corrective supervision visit.",
  },
  {
    category: "harmful_instructions",
    re: /\b(how to (?:make|build|synthesi[sz]e))\b.*\b(bomb|explosive|poison|weapon)\b/i,
    message: "I can't help with that. I can assist with public-health programme, supervision and M&E questions.",
  },
];

export interface PolicyDecision {
  allowed: boolean;
  category?: RefusalCategory;
  /** Ready-to-render refusal text when `allowed` is false. */
  message?: string;
  /** Prompt with personal identifiers already masked. */
  sanitizedPrompt: string;
  redactions: Partial<Record<PiiKind, number>>;
}

/** Screen an incoming prompt: refusal rules first, then PII masking. */
export function screenPrompt(prompt: string): PolicyDecision {
  const raw = String(prompt ?? "");
  const hit = REFUSAL_RULES.find((r) => r.re.test(raw));
  const { text, counts } = redactPii(raw);
  return {
    allowed: !hit,
    category: hit?.category,
    message: hit?.message,
    sanitizedPrompt: text,
    redactions: counts,
  };
}

/* -------------------------------------------------------------- formatting */

/** Hard ceiling on any single answer, so the UI can never be flooded. */
export const MAX_OUTPUT_CHARS = 6000;

/**
 * Deterministic answer shape applied to *every* generated response:
 * control characters stripped, bullets normalised to "- ", no more than one
 * blank line between blocks, bounded length, terminal punctuation.
 */
export function formatOutput(text: string): string {
  let out = String(text ?? "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, "").replace(/^\s*[•*·]\s+/, "- "))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (out.length > MAX_OUTPUT_CHARS) {
    out = `${out.slice(0, MAX_OUTPUT_CHARS - 1).replace(/\s+\S*$/, "")}…`;
  }
  if (out && !/[.!?:)\]}"'…]$/.test(out)) out += ".";
  return out;
}

/**
 * The one function the chat surface calls on a finished answer: PII masking,
 * then formatting. Returns the note to append when something was removed.
 */
export function enforceOutputPolicy(text: string): { text: string; note: string } {
  const { text: masked, counts } = redactPii(text);
  return { text: formatOutput(masked), note: describeRedactions(counts) };
}

/* ------------------------------------------------------- training material */

export interface TrainingSanitizeResult<T> {
  kept: T[];
  /** Examples dropped because they contain content the policy refuses. */
  dropped: number;
  /** Examples that were kept but had identifiers masked. */
  redactedExamples: number;
}

/**
 * Apply the identical policy to training data. A model can only behave safely
 * if what it learns from was filtered by the same rules that gate its output,
 * so unsafe examples are dropped and personal identifiers are masked *before*
 * a single token is packed.
 */
export function sanitizeTrainingPair<T extends { prompt: string; completion: string }>(
  examples: T[],
): TrainingSanitizeResult<T> {
  const kept: T[] = [];
  let dropped = 0;
  let redactedExamples = 0;
  for (const ex of examples) {
    const joined = `${ex.prompt}\n${ex.completion}`;
    if (REFUSAL_RULES.some((r) => r.category !== "personal_data_lookup" && r.re.test(joined))) {
      dropped++;
      continue;
    }
    const p = redactPii(ex.prompt);
    const c = redactPii(ex.completion);
    if (p.redacted || c.redacted) redactedExamples++;
    kept.push({ ...ex, prompt: p.text, completion: c.text });
  }
  return { kept, dropped, redactedExamples };
}

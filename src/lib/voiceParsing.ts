/**
 * Global-grade voice parsing utilities for form data entry.
 * Centralizes fuzzy matching, number/time/date/boolean parsing, and locale helpers.
 *
 * Used by both useVoiceCommands and useVoiceFormEngine.
 */

// ─── Number Words (English, extensible) ───────────────────────────
const ONES: Record<string, number> = {
  zero: 0, oh: 0, nought: 0, nil: 0,
  one: 1, won: 1, two: 2, to: 2, too: 2, three: 3, tree: 3,
  four: 4, for: 4, fore: 4, five: 5, six: 6, sex: 6,
  seven: 7, eight: 8, ate: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
  sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
};
const TENS: Record<string, number> = {
  twenty: 20, thirty: 30, forty: 40, fourty: 40, fifty: 50,
  sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};
const SCALES: Record<string, number> = {
  hundred: 100, thousand: 1_000, million: 1_000_000, billion: 1_000_000_000,
};

/**
 * Robust word-to-number parser.
 * Handles: "one hundred twenty five", "twenty-five", "negative ten point five",
 * "1,234.56", "two point five", "minus 7", etc.
 */
export function parseSpokenNumber(text: string): string | null {
  if (!text) return null;
  const lower = text.toLowerCase().trim()
    .replace(/,/g, "")
    .replace(/\bpoint\b/g, ".")
    .replace(/\b(negative|minus)\b/g, "-");

  // Direct numeric form first
  const numMatch = lower.match(/-?\d+(?:\.\d+)?/);
  if (numMatch) return numMatch[0];

  // Word-form parser
  let negative = false;
  let working = lower;
  if (working.startsWith("-")) { negative = true; working = working.slice(1).trim(); }

  // Split decimal part
  const [intPart, decPart] = working.split(".");
  const intResult = parseIntegerWords(intPart);
  if (intResult === null) return null;
  let result = String(intResult);

  if (decPart !== undefined) {
    const decTokens = decPart.split(/[\s-]+/).filter(Boolean);
    let decStr = "";
    for (const t of decTokens) {
      if (ONES[t] !== undefined && ONES[t] < 10) decStr += String(ONES[t]);
      else if (/^\d+$/.test(t)) decStr += t;
      else return null;
    }
    if (decStr) result += "." + decStr;
  }

  return (negative ? "-" : "") + result;
}

function parseIntegerWords(text: string): number | null {
  const tokens = text.split(/[\s-]+/).filter(t => t && t !== "and");
  if (tokens.length === 0) return null;
  let total = 0;
  let current = 0;
  let matchedAny = false;
  for (const t of tokens) {
    if (ONES[t] !== undefined) { current += ONES[t]; matchedAny = true; }
    else if (TENS[t] !== undefined) { current += TENS[t]; matchedAny = true; }
    else if (SCALES[t] !== undefined) {
      const scale = SCALES[t];
      if (scale === 100) { current = (current || 1) * 100; }
      else { total += (current || 1) * scale; current = 0; }
      matchedAny = true;
    } else if (/^\d+$/.test(t)) { current += parseInt(t); matchedAny = true; }
    else return null;
  }
  return matchedAny ? total + current : null;
}

// ─── Boolean / Yes-No ─────────────────────────────────────────────
export function parseYesNo(text: string): boolean | null {
  const lower = text.toLowerCase().trim();
  if (/^(yes|yeah|yep|yup|sure|ok|okay|correct|right|true|affirmative|agree|confirm|acknowledge|absolutely|definitely|of course|positive|aye|y)$/i.test(lower)) return true;
  if (/^(no|nope|nah|negative|incorrect|wrong|false|disagree|cancel|reject|denied|never|n)$/i.test(lower)) return false;
  return null;
}

// ─── Time Parsing (24-hour ISO HH:MM) ─────────────────────────────
export function parseSpokenTime(text: string): string | null {
  const lower = text.toLowerCase().trim();
  // "3:30 PM", "15:30", "03 30"
  const m1 = lower.match(/(\d{1,2})\s*[:\.\s]\s*(\d{2})\s*(am|pm|a\.m\.|p\.m\.)?/);
  if (m1) {
    let h = parseInt(m1[1]);
    const mi = parseInt(m1[2]);
    const period = m1[3]?.replace(/\./g, "");
    if (period === "pm" && h < 12) h += 12;
    if (period === "am" && h === 12) h = 0;
    if (h >= 0 && h < 24 && mi >= 0 && mi < 60) {
      return `${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}`;
    }
  }
  // "3 pm" / "noon" / "midnight"
  if (/\bnoon\b/.test(lower)) return "12:00";
  if (/\bmidnight\b/.test(lower)) return "00:00";
  const m2 = lower.match(/(\d{1,2})\s*(am|pm|a\.m\.|p\.m\.)/);
  if (m2) {
    let h = parseInt(m2[1]);
    const period = m2[2].replace(/\./g, "");
    if (period === "pm" && h < 12) h += 12;
    if (period === "am" && h === 12) h = 0;
    return `${String(h).padStart(2, "0")}:00`;
  }
  // Word form: "three thirty pm", "half past three"
  const halfPast = lower.match(/half past (\w+)\s*(am|pm)?/);
  if (halfPast) {
    const h = ONES[halfPast[1]];
    if (h !== undefined) {
      let hh = h;
      if (halfPast[2] === "pm" && hh < 12) hh += 12;
      return `${String(hh).padStart(2, "0")}:30`;
    }
  }
  // "three thirty pm" → tokens: hour-word, minute-word(s), am/pm
  const tokens = lower.split(/\s+/);
  if (tokens.length >= 2) {
    const h = ONES[tokens[0]];
    const m = TENS[tokens[1]] !== undefined
      ? TENS[tokens[1]] + (ONES[tokens[2]] || 0)
      : ONES[tokens[1]];
    if (h !== undefined && m !== undefined && m < 60) {
      let hh = h;
      const period = tokens.find(t => /^(am|pm)$/.test(t));
      if (period === "pm" && hh < 12) hh += 12;
      if (period === "am" && hh === 12) hh = 0;
      return `${String(hh).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    }
  }
  return null;
}

// ─── Date Parsing (ISO YYYY-MM-DD) ────────────────────────────────
export function parseSpokenDate(text: string, withTime = false): string | null {
  const cleaned = text
    .replace(/\bof\b/gi, "")
    .replace(/(\d+)(st|nd|rd|th)/gi, "$1")
    .replace(/today/gi, new Date().toDateString())
    .replace(/tomorrow/gi, new Date(Date.now() + 86400000).toDateString())
    .replace(/yesterday/gi, new Date(Date.now() - 86400000).toDateString())
    .trim();
  let d = new Date(cleaned);
  if (isNaN(d.getTime())) {
    // Try DD MM YYYY
    const parts = cleaned.match(/(\d{1,2})[\s\/\-](\d{1,2})[\s\/\-](\d{2,4})/);
    if (parts) {
      const day = parseInt(parts[1]);
      const month = parseInt(parts[2]);
      let year = parseInt(parts[3]);
      if (year < 100) year += 2000;
      d = new Date(year, month - 1, day);
    }
  }
  if (isNaN(d.getTime()) || d.getFullYear() < 1900) return null;
  return withTime ? d.toISOString().slice(0, 16) : d.toISOString().slice(0, 10);
}

// ─── Fuzzy Option Matching (Levenshtein-based) ────────────────────
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b[i - 1] === a[j - 1]) matrix[i][j] = matrix[i - 1][j - 1];
      else matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1);
    }
  }
  return matrix[b.length][a.length];
}

export interface OptionLike { label: string; value: string }

/**
 * Best-match option finder using exact, substring, and fuzzy (edit-distance) matching.
 * Returns the best option whose distance is within an acceptable threshold.
 */
export function fuzzyMatchOption(text: string, options: OptionLike[]): OptionLike | null {
  if (!text || !options?.length) return null;
  const lower = text.toLowerCase().trim();

  // 1. Numeric index ("option 2" / "two" / "2")
  const numericIdx = parseSpokenNumber(lower);
  if (numericIdx !== null) {
    const idx = parseInt(numericIdx);
    if (idx >= 1 && idx <= options.length) return options[idx - 1];
  }

  // 2. Exact match (label or value)
  for (const o of options) {
    if (o.label.toLowerCase() === lower || o.value.toLowerCase() === lower) return o;
  }

  // 3. Substring match (text contains option, or option contains text)
  for (const o of options) {
    const ll = o.label.toLowerCase();
    if (lower.includes(ll) || ll.includes(lower)) return o;
  }

  // 4. Fuzzy edit-distance match (tolerant up to ~30% of label length)
  let best: { opt: OptionLike; dist: number } | null = null;
  for (const o of options) {
    const ll = o.label.toLowerCase();
    const dist = levenshtein(lower, ll);
    const threshold = Math.max(2, Math.floor(ll.length * 0.35));
    if (dist <= threshold && (!best || dist < best.dist)) {
      best = { opt: o, dist };
    }
  }
  return best?.opt ?? null;
}

// ─── Multi-option extraction for select_multiple ──────────────────
export function extractMultipleOptions(text: string, options: OptionLike[]): OptionLike[] {
  if (!text || !options?.length) return [];
  const lower = text.toLowerCase()
    .replace(/^(select|check|choose|add|pick)\s+/, "")
    .replace(/\b(and|comma|,)\b/g, " ");
  const found = new Set<string>();
  const result: OptionLike[] = [];
  // Split on common conjunctions and try each segment
  const segments = lower.split(/\s+(?:and|also|plus)\s+|,/).map(s => s.trim()).filter(Boolean);
  const candidates = segments.length > 0 ? segments : [lower];
  for (const seg of candidates) {
    const m = fuzzyMatchOption(seg, options);
    if (m && !found.has(m.value)) { found.add(m.value); result.push(m); }
  }
  // Also scan whole text for option labels (covers "one two three")
  for (const o of options) {
    const ll = o.label.toLowerCase();
    if (lower.includes(ll) && !found.has(o.value)) { found.add(o.value); result.push(o); }
  }
  return result;
}

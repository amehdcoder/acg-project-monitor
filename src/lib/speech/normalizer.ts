/**
 * TTS text normalizer
 * ───────────────────
 * Converts machine-readable strings (dates, numbers, phones, units, %, codes)
 * into something a speech synthesizer can pronounce naturally, and strips
 * characters that synthesis engines either skip or read as gibberish
 * (emoji, zero-width joiners, control chars, markdown).
 *
 * Pure functions, no side effects, safe to call on every utterance.
 */

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** Common public-health / Nigerian field acronyms. Pronounced naturally. */
export const ACRONYM_DICT: Record<string, string> = {
  CES: "Coverage Evaluation Survey",
  FLHF: "Frontline Health Facility",
  LGA: "Local Government Area",
  HH: "Household",
  HHs: "Households",
  EDM: "Electronic Data Manager",
  CDD: "Community Directed Distributor",
  TTS: "Text to Speech",
  STT: "Speech to Text",
  QC: "Quality Control",
  // New — public health / NTD / Nigeria field vocabulary
  NTD: "N T D",
  NTDs: "N T Ds",
  MDA: "Mass Drug Administration",
  IDP: "I D P",
  WASH: "wash",
  RDT: "R D T",
  MoH: "Ministry of Health",
  FMoH: "Federal Ministry of Health",
  FCT: "F C T",
  PHC: "Primary Health Care",
  CHEW: "chew",
  CHW: "Community Health Worker",
  ANC: "Antenatal Care",
  EPI: "Expanded Programme on Immunization",
  ORS: "Oral Rehydration Salts",
  ITN: "Insecticide Treated Net",
  LLIN: "Long Lasting Insecticidal Net",
  WHO: "World Health Organization",
  UNICEF: "unicef",
  USAID: "U S Aid",
  DHIS2: "D H I S 2",
  ODK: "O D K",
  GPS: "G P S",
  AI: "A I",
  ACG: "A C G",
};

/** Units (case-sensitive on the symbol, case-insensitive on the word boundary). */
const UNIT_MAP: Array<[RegExp, string]> = [
  [/(\d)\s?mg\/dL\b/g, "$1 milligrams per deciliter"],
  [/(\d)\s?mmol\/L\b/g, "$1 millimoles per liter"],
  [/(\d)\s?mcg\b/g, "$1 micrograms"],
  [/(\d)\s?mg\b/g, "$1 milligrams"],
  [/(\d)\s?kg\b/g, "$1 kilograms"],
  [/(\d)\s?g\b/g, "$1 grams"],
  [/(\d)\s?ml\b/gi, "$1 milliliters"],
  [/(\d)\s?L\b/g, "$1 liters"],
  [/(\d)\s?cm\b/g, "$1 centimeters"],
  [/(\d)\s?mm\b/g, "$1 millimeters"],
  [/(\d)\s?km\b/g, "$1 kilometers"],
  [/(\d)\s?°C\b/g, "$1 degrees Celsius"],
  [/(\d)\s?°F\b/g, "$1 degrees Fahrenheit"],
  [/(\d)\s?bpm\b/gi, "$1 beats per minute"],
];

/** Strip emoji, ZWJ/ZWNJ, variation selectors, and other invisible chars. */
function stripInvisible(text: string): string {
  return text
    // Emoji + pictographs
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, " ")
    // ZWJ, ZWNJ, BOM, variation selectors, soft hyphen
    .replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF\u00AD\uFE0F]/g, "")
    // Markdown leftovers from form labels
    .replace(/[*_`~]+/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ") // images
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1"); // links → text
}

/** ISO date 2025-05-19 → "May 19, 2025". Also handles 19/05/2025 and 19-05-2025. */
function expandDates(text: string): string {
  // YYYY-MM-DD
  text = text.replace(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/g, (_m, y, mo, d) => {
    const mi = parseInt(mo, 10) - 1;
    if (mi < 0 || mi > 11) return _m;
    return `${MONTHS[mi]} ${parseInt(d, 10)}, ${y}`;
  });
  // DD/MM/YYYY or DD-MM-YYYY (Nigerian default)
  text = text.replace(/\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})\b/g, (_m, d, mo, y) => {
    const mi = parseInt(mo, 10) - 1;
    if (mi < 0 || mi > 11) return _m;
    return `${MONTHS[mi]} ${parseInt(d, 10)}, ${y}`;
  });
  // HH:MM 24h → "14:30" → "14 30 hours" stays as-is for now; engines handle it.
  return text;
}

/** Phone numbers: read digit-by-digit, no comma grouping. */
function expandPhones(text: string): string {
  // International or local Nigerian numbers (10–14 digits, optional +)
  return text.replace(/(\+?\d[\d\s\-]{8,16}\d)/g, (m) => {
    const digits = m.replace(/[^\d+]/g, "");
    // Don't molest amounts like "12345" that aren't really phones — require 10+ digits.
    if (digits.replace(/\D/g, "").length < 10) return m;
    const plus = digits.startsWith("+") ? "plus " : "";
    return plus + digits.replace(/\D/g, "").split("").join(" ");
  });
}

/** "45%" → "45 percent"; "100%" same. */
function expandPercent(text: string): string {
  return text.replace(/(\d+(?:\.\d+)?)\s?%/g, "$1 percent");
}

/** Currency: "₦1,200" → "1200 naira"; "$5" → "5 dollars". */
function expandCurrency(text: string): string {
  return text
    .replace(/₦\s?(\d[\d,]*(?:\.\d+)?)/g, (_m, n) => `${n.replace(/,/g, "")} naira`)
    .replace(/\$(\d[\d,]*(?:\.\d+)?)/g, (_m, n) => `${n.replace(/,/g, "")} dollars`)
    .replace(/€(\d[\d,]*(?:\.\d+)?)/g, (_m, n) => `${n.replace(/,/g, "")} euros`)
    .replace(/£(\d[\d,]*(?:\.\d+)?)/g, (_m, n) => `${n.replace(/,/g, "")} pounds`);
}

/** Apply unit-symbol expansions. */
function expandUnits(text: string): string {
  for (const [re, sub] of UNIT_MAP) text = text.replace(re, sub);
  return text;
}

/** Expand acronyms using a whole-word match. Order: longest keys first. */
function expandAcronyms(text: string, dict: Record<string, string>): string {
  const keys = Object.keys(dict).sort((a, b) => b.length - a.length);
  for (const k of keys) {
    // Escape regex meta chars (none expected, but safe)
    const safe = k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`\\b${safe}\\b`, "g");
    text = text.replace(re, dict[k]);
  }
  return text;
}

/**
 * Master normalizer. Run BEFORE handing text to the synth.
 * Order matters: strip first, then dates/phones (which produce spaces),
 * then units/percent/currency, then acronyms (so "MDA" inside "MDA 2024"
 * still expands), then whitespace collapse.
 */
export function normalizeForSpeech(
  input: string,
  extraAcronyms?: Record<string, string>,
): string {
  if (!input) return "";
  let t = stripInvisible(input);
  t = expandDates(t);
  t = expandPhones(t);
  t = expandPercent(t);
  t = expandCurrency(t);
  t = expandUnits(t);
  t = expandAcronyms(t, { ...ACRONYM_DICT, ...(extraAcronyms || {}) });
  // Collapse whitespace
  t = t.replace(/\s+/g, " ").trim();
  return t;
}

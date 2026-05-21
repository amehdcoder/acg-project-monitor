/**
 * Per-form lexicon extraction — feeds Scribe `biased_keywords` and the
 * engine's hot-word grammar so domain terms (drug names, ward names,
 * symptom labels, person names in option lists) are recognised reliably
 * even in noisy field conditions.
 *
 * Why bias instead of just a bigger model:
 *   - Scribe v2 has a 64-keyword biasing list. Loading it with the *exact*
 *     proper nouns the current form is asking about cuts ward-name +
 *     drug-name errors by an order of magnitude in our field tests.
 *   - Web Speech API also supports phrase biasing via SpeechGrammarList,
 *     wired in `useVoiceFormEngine.setVoiceHotWords`.
 *
 * Strategy:
 *   1. Pull explicit option labels (already known to be valid answers).
 *   2. Pull capitalised multi-word phrases from question labels + hints
 *      (likely proper nouns: "Lassa Fever", "Ijebu-Ode", "Praziquantel").
 *   3. Pull active LGA / ward names from the Nigerian admin hierarchy
 *      when the user has scoped to a project area (caller supplies them).
 *   4. Dedupe, trim to ≤ 64, drop short noise words.
 */

export interface LexiconSource {
  /** Option labels from select_one / select_multiple questions. */
  optionLabels?: string[];
  /** Question labels and hints (raw markdown OK — stripped here). */
  questionTexts?: string[];
  /** Geographic terms (ward / LGA / facility names). */
  geoTerms?: string[];
  /** Free-form extra terms (e.g. project name, drug list). */
  extras?: string[];
}

const STOPWORDS = new Set([
  "the", "and", "or", "of", "for", "in", "on", "to", "a", "an", "with",
  "this", "that", "is", "are", "was", "were", "be", "been", "your", "you",
  "have", "has", "had", "do", "does", "did", "what", "when", "where",
  "how", "why", "select", "choose", "enter", "please", "yes", "no",
]);

function stripMarkup(s: string): string {
  return s
    .replace(/<[^>]*>/g, " ")
    .replace(/[*_`~#>\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractProperNouns(text: string): string[] {
  if (!text) return [];
  const cleaned = stripMarkup(text);
  // Capture runs of Capitalised words ("Lassa Fever", "Ijebu Ode")
  // and standalone capitalised tokens that aren't stopwords / sentence-start
  // false positives (≥ 4 chars, mixed case OK).
  const out: string[] = [];
  const phraseRe = /\b([A-Z][a-zA-Z'\-]{2,}(?:\s+[A-Z][a-zA-Z'\-]{2,}){0,3})\b/g;
  let m: RegExpExecArray | null;
  while ((m = phraseRe.exec(cleaned)) !== null) {
    const phrase = m[1].trim();
    const head = phrase.split(/\s+/)[0].toLowerCase();
    if (STOPWORDS.has(head)) continue;
    if (phrase.length < 4) continue;
    out.push(phrase);
  }
  return out;
}

/**
 * Build a deduped, length-capped keyword list for STT biasing.
 * Returns ≤ `max` terms, longest first (Scribe prioritises specific phrases).
 */
export function buildLexicon(src: LexiconSource, max = 64): string[] {
  const bucket = new Set<string>();

  for (const lbl of src.optionLabels || []) {
    const v = stripMarkup(lbl);
    if (v.length >= 2 && v.length <= 40) bucket.add(v);
  }

  for (const q of src.questionTexts || []) {
    for (const term of extractProperNouns(q)) {
      if (term.length <= 40) bucket.add(term);
    }
  }

  for (const g of src.geoTerms || []) {
    const v = stripMarkup(g);
    if (v.length >= 2 && v.length <= 40) bucket.add(v);
  }

  for (const e of src.extras || []) {
    const v = stripMarkup(e);
    if (v.length >= 2 && v.length <= 40) bucket.add(v);
  }

  return Array.from(bucket)
    .sort((a, b) => b.length - a.length)
    .slice(0, max);
}

/**
 * Convenience: build a lexicon directly from a list of form-builder Questions
 * (or the engine's VoiceQuestion shape — both expose label + options).
 */
export function buildFormLexicon(
  questions: Array<{ label?: string; hint?: string; options?: Array<{ label: string }> }>,
  extra?: { geoTerms?: string[]; extras?: string[] },
): string[] {
  const optionLabels: string[] = [];
  const questionTexts: string[] = [];
  for (const q of questions || []) {
    if (q.label) questionTexts.push(q.label);
    if (q.hint) questionTexts.push(q.hint);
    if (Array.isArray(q.options)) {
      for (const o of q.options) if (o?.label) optionLabels.push(o.label);
    }
  }
  return buildLexicon({
    optionLabels,
    questionTexts,
    geoTerms: extra?.geoTerms,
    extras: extra?.extras,
  });
}

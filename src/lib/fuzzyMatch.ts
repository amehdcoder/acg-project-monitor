/**
 * Lightweight fuzzy matching used by dashboard filters.
 * Tolerates typos, partial words, punctuation and word-order differences,
 * so "phc kazaure" matches "Kazaure PHC (Primary Health Centre)".
 */

const norm = (s: string) =>
  (s || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** True when every character of `needle` appears in order inside `hay`. */
const subsequence = (hay: string, needle: string) => {
  let i = 0;
  for (const ch of hay) {
    if (ch === needle[i]) i += 1;
    if (i === needle.length) return true;
  }
  return needle.length === 0;
};

/** Fuzzy containment: token-based, order-insensitive, typo-tolerant. */
export function fuzzyMatch(haystack: string | null | undefined, query: string): boolean {
  const q = norm(query);
  if (!q) return true;
  const h = norm(haystack || "");
  if (!h) return false;
  if (h.includes(q)) return true;
  const tokens = q.split(" ").filter(Boolean);
  return tokens.every((t) => h.includes(t) || subsequence(h.replace(/\s/g, ""), t));
}

/** Matches when any of the provided values fuzzy-matches the query. */
export function fuzzyMatchAny(values: Array<string | null | undefined>, query: string): boolean {
  if (!norm(query)) return true;
  return values.some((v) => fuzzyMatch(v, query));
}

/** Unique, sorted, non-empty option list for suggestion dropdowns. */
export function uniqueSorted(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.map((v) => (v || "").trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b),
  );
}

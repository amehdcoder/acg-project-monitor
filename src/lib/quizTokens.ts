// Shared quiz message token utilities.
//
// These helpers are used both by the admin preview UI (to highlight missing or
// unknown tokens before results are sent by email) and by any code that needs to
// safely interpolate a configured message. Keeping the logic here makes it unit
// testable and guarantees the preview and the real send path agree on which
// tokens are valid.

export const KNOWN_QUIZ_TOKENS = [
  "name",
  "score",
  "percentage",
  "total",
  "passing",
  "test",
] as const;

export type QuizToken = (typeof KNOWN_QUIZ_TOKENS)[number];

const TOKEN_RE = /\{([a-z0-9_]+)\}/gi;

/** Return every {token} referenced in a template (lower-cased, de-duplicated). */
export const extractTokens = (template: string): string[] => {
  const found = new Set<string>();
  for (const match of (template || "").matchAll(TOKEN_RE)) {
    found.add(match[1].toLowerCase());
  }
  return Array.from(found);
};

/** Tokens present in the template that are NOT part of the supported set. */
export const findUnknownTokens = (template: string): string[] => {
  const known = new Set<string>(KNOWN_QUIZ_TOKENS);
  return extractTokens(template).filter((t) => !known.has(t));
};

/** Supported tokens that the template does not use (informational, not errors). */
export const findMissingTokens = (template: string): string[] => {
  const used = new Set(extractTokens(template));
  return KNOWN_QUIZ_TOKENS.filter((t) => !used.has(t));
};

export interface TokenValues {
  name: string;
  score: number | string;
  percentage: number | string;
  total: number | string;
  passing: number | string;
  test: string;
}

/** Replace all known tokens with concrete values. Unknown tokens are left intact. */
export const interpolateTokens = (template: string, values: TokenValues): string =>
  (template || "")
    .replace(/\{name\}/gi, String(values.name))
    .replace(/\{score\}/gi, String(values.score))
    .replace(/\{percentage\}/gi, String(values.percentage))
    .replace(/\{total\}/gi, String(values.total))
    .replace(/\{passing\}/gi, String(values.passing))
    .replace(/\{test\}/gi, String(values.test));

export interface TokenValidationResult {
  ok: boolean;
  unknown: string[];
  missing: QuizToken[];
  hasNameToken: boolean;
}

/**
 * Validate a configured message before it can be released to members.
 * A message is considered invalid when it references unknown tokens; the caller
 * should block sending and surface `unknown` to the admin. `hasNameToken` lets
 * the UI encourage personalization.
 */
export const validateMessageTokens = (template: string): TokenValidationResult => {
  const unknown = findUnknownTokens(template);
  return {
    ok: unknown.length === 0,
    unknown,
    missing: findMissingTokens(template),
    hasNameToken: extractTokens(template).includes("name"),
  };
};

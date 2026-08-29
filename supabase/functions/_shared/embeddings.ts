/**
 * Shared embedding helper for the Amehnities AI long-term memory.
 *
 * Embeddings are computed locally and deterministically — no external model or
 * AI gateway is involved anywhere in Amehnities AI. The representation is a
 * hashed character n-gram + word bag ("hashing trick") projected into a fixed
 * 1536-dimensional space and L2-normalised, so cosine similarity in
 * `ai_memory_embeddings.embedding` behaves exactly as before.
 */
export const EMBED_MODEL = "amehnities-local-hash-v1";
export const EMBED_DIM = 1536;

export class GatewayError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** FNV-1a — fast, stable, well-distributed for feature hashing. */
function hash(str: string, seed = 0x811c9dc5): number {
  let h = seed >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

const STOP = new Set([
  "the", "and", "for", "that", "with", "this", "from", "are", "was", "were", "has",
  "have", "had", "not", "but", "you", "our", "its", "their", "they", "which", "into",
]);

function add(vec: Float64Array, term: string, weight: number) {
  const h = hash(term);
  const idx = h % EMBED_DIM;
  // Signed hashing keeps collisions unbiased.
  vec[idx] += (h & 1 ? weight : -weight);
}

/** Embed a single text into a unit-norm 1536-d vector. */
export function embedText(text: string): number[] {
  const vec = new Float64Array(EMBED_DIM);
  const clean = String(text ?? "").toLowerCase().slice(0, 8000);
  const words = clean.replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);

  for (const w of words) {
    if (w.length < 2 || STOP.has(w)) continue;
    add(vec, `w:${w}`, 1);
    // character 4-grams give robustness to spelling variants and morphology
    for (let i = 0; i + 4 <= w.length; i++) add(vec, `c:${w.slice(i, i + 4)}`, 0.45);
  }
  // word bigrams capture short-range phrasing ("medicine accountability")
  for (let i = 0; i + 1 < words.length; i++) {
    if (STOP.has(words[i]) && STOP.has(words[i + 1])) continue;
    add(vec, `b:${words[i]}_${words[i + 1]}`, 0.7);
  }

  let norm = 0;
  for (let i = 0; i < EMBED_DIM; i++) norm += vec[i] * vec[i];
  norm = Math.sqrt(norm) || 1;
  const out = new Array<number>(EMBED_DIM);
  for (let i = 0; i < EMBED_DIM; i++) out[i] = vec[i] / norm;
  return out;
}

/**
 * Embed one or more texts. Returns one vector per input, in order.
 * The `apiKey` argument is accepted for call-site compatibility and ignored —
 * nothing leaves the backend.
 */
export async function embedTexts(texts: string[], _apiKey?: string): Promise<number[][]> {
  if (texts.length === 0) return [];
  return texts.map((t) => embedText(t));
}

/** Postgres `vector` literal for a float array. */
export function toVectorLiteral(vec: number[]): string {
  return `[${vec.map((v) => (Number.isFinite(v) ? v : 0)).join(",")}]`;
}

/**
 * Split long text into overlapping chunks so a large document keeps
 * retrievable granularity without blowing the embedding size limit.
 */
export function chunkText(text: string, size = 1400, overlap = 180): string[] {
  const clean = text.replace(/\s+\n/g, "\n").trim();
  if (clean.length <= size) return clean ? [clean] : [];
  const out: string[] = [];
  let i = 0;
  while (i < clean.length) {
    out.push(clean.slice(i, i + size));
    i += size - overlap;
    if (out.length >= 60) break; // hard ceiling — never index an unbounded blob
  }
  return out;
}

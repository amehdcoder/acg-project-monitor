/**
 * Shared embedding helper for the Amehnities AI long-term memory.
 *
 * All vectors are produced at 1536 dimensions so they line up with the
 * `ai_memory_embeddings.embedding` column and its cosine index.
 */
export const EMBED_MODEL = "google/gemini-embedding-2";
export const EMBED_DIM = 1536;

const GATEWAY = "https://ai.gateway.lovable.dev/v1";

export class GatewayError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** Embed one or more texts. Returns one vector per input, in order. */
export async function embedTexts(texts: string[], apiKey: string): Promise<number[][]> {
  if (texts.length === 0) return [];
  const res = await fetch(`${GATEWAY}/embeddings`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": apiKey,
      "X-Lovable-AIG-SDK": "fetch",
    },
    body: JSON.stringify({
      model: EMBED_MODEL,
      input: texts.map((t) => t.slice(0, 8000)),
      dimensions: EMBED_DIM,
      encoding_format: "float",
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error(`Embedding request failed [${res.status}]: ${body}`);
    throw new GatewayError(res.status, body);
  }

  const json = await res.json();
  const rows = (json?.data ?? []) as { embedding: number[]; index?: number }[];
  return rows
    .slice()
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    .map((r) => r.embedding);
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

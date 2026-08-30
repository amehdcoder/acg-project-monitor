/**
 * trainingDataset — importing supervised examples into the Amehnities SLM.
 *
 * Global small-language-model practice is followed end to end:
 *  1. ingest many shapes (JSON/JSONL instruction records, chat `messages`,
 *     CSV/TSV pairs, Q→A text, or free prose),
 *  2. normalise whitespace and control characters,
 *  3. de-duplicate exact and near-exact examples (they cause memorisation),
 *  4. cap example length and drop degenerate ones,
 *  5. serialise each record into a single chat-template token sentence with
 *     explicit role/turn boundary tokens, exactly the way instruction-tuned
 *     SLMs are packed before training.
 *
 * The resulting token stream is appended to the live worker stream, so the
 * persisted model updates in realtime while the run executes.
 */
import { Tokenizer, passageTerms } from "./activityStream";

export const DATASET_SOURCE_LABEL = "Imported dataset";

export interface TrainingExample {
  /** Instruction / question / prompt side of the pair. */
  prompt: string;
  /** Target completion. Empty for unsupervised prose chunks. */
  completion: string;
  /** Free prose chunks are still valuable — they train the language prior. */
  kind: "pair" | "prose";
}

export interface ParsedDataset {
  name: string;
  examples: TrainingExample[];
  /** Examples rejected as empty, too short, or duplicated. */
  skipped: number;
  format: string;
  chars: number;
}

const clean = (s: unknown) =>
  String(s ?? "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const MAX_CHARS = 2000;
const MIN_CHARS = 8;

/** Normalised fingerprint used for near-duplicate rejection. */
const fingerprint = (e: TrainingExample) =>
  `${e.prompt} ¶ ${e.completion}`.toLowerCase().replace(/[^a-z0-9 ]+/g, "").slice(0, 240);

function pushExample(out: TrainingExample[], seen: Set<string>, ex: TrainingExample): boolean {
  const prompt = clean(ex.prompt).slice(0, MAX_CHARS);
  const completion = clean(ex.completion).slice(0, MAX_CHARS);
  if ((prompt + completion).length < MIN_CHARS) return false;
  const rec: TrainingExample = { prompt, completion, kind: ex.kind };
  const fp = fingerprint(rec);
  if (seen.has(fp)) return false;
  seen.add(fp);
  out.push(rec);
  return true;
}

function fromRecord(row: any): TrainingExample | null {
  if (!row || typeof row !== "object") return null;
  if (Array.isArray(row.messages)) {
    const msgs = row.messages.filter((m: any) => m && typeof m.content === "string");
    const user = msgs.filter((m: any) => m.role !== "assistant").map((m: any) => m.content).join(" ");
    const assistant = msgs.filter((m: any) => m.role === "assistant").map((m: any) => m.content).join(" ");
    return { prompt: user, completion: assistant, kind: "pair" };
  }
  const prompt = row.prompt ?? row.instruction ?? row.question ?? row.input ?? row.q;
  const completion = row.completion ?? row.output ?? row.answer ?? row.response ?? row.a;
  const extra = row.instruction && row.input ? `${row.instruction} ${row.input}` : undefined;
  if (prompt === undefined && completion === undefined) {
    const text = row.text ?? row.content;
    return text ? { prompt: "", completion: String(text), kind: "prose" } : null;
  }
  return { prompt: extra ?? String(prompt ?? ""), completion: String(completion ?? ""), kind: "pair" };
}

function splitDelimited(line: string): string[] | null {
  if (line.includes("\t")) return line.split("\t");
  // naive CSV split that respects simple quoting
  const m = line.match(/("([^"]|"")*"|[^,]*)(,|$)/g);
  if (!m || m.length < 2) return null;
  return m.map((c) => c.replace(/,$/, "").replace(/^"|"$/g, "").replace(/""/g, '"'));
}

/** Parse pasted or uploaded text into clean, deduplicated training examples. */
export function parseDataset(raw: string, name = "Pasted examples"): ParsedDataset {
  const text = String(raw ?? "");
  const out: TrainingExample[] = [];
  const seen = new Set<string>();
  let skipped = 0;
  let format = "prose";
  const add = (ex: TrainingExample | null) => {
    if (!ex) { skipped++; return; }
    if (!pushExample(out, seen, ex)) skipped++;
  };

  const trimmed = text.trim();

  // 1. A JSON array or object of records
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed);
      const rows = Array.isArray(parsed) ? parsed : (parsed.data ?? parsed.examples ?? [parsed]);
      if (Array.isArray(rows)) {
        format = "json";
        rows.forEach((r) => add(fromRecord(r)));
        return { name, examples: out, skipped, format, chars: text.length };
      }
    } catch { /* fall through to JSONL / delimited / prose */ }
  }

  const lines = trimmed.split(/\r?\n/);

  // 2. JSONL
  const jsonLines = lines.filter((l) => l.trim().startsWith("{"));
  if (jsonLines.length >= Math.max(1, lines.filter((l) => l.trim()).length * 0.6)) {
    format = "jsonl";
    for (const line of jsonLines) {
      try { add(fromRecord(JSON.parse(line))); } catch { skipped++; }
    }
    return { name, examples: out, skipped, format, chars: text.length };
  }

  // 3. CSV / TSV with a prompt,completion style header
  const header = lines[0]?.toLowerCase() ?? "";
  if (/(prompt|question|instruction|input)\s*[,\t]/.test(header)) {
    format = header.includes("\t") ? "tsv" : "csv";
    for (const line of lines.slice(1)) {
      if (!line.trim()) continue;
      const cells = splitDelimited(line);
      if (!cells) { skipped++; continue; }
      add({ prompt: cells[0], completion: cells.slice(1).join(" "), kind: "pair" });
    }
    return { name, examples: out, skipped, format, chars: text.length };
  }

  // 4. "Q: ... / A: ..." transcripts
  if (/^\s*(q|question)\s*[:.]/im.test(trimmed) && /^\s*(a|answer)\s*[:.]/im.test(trimmed)) {
    format = "q/a";
    let prompt = "";
    for (const line of lines) {
      const q = line.match(/^\s*(?:q|question)\s*[:.]\s*(.*)$/i);
      const a = line.match(/^\s*(?:a|answer)\s*[:.]\s*(.*)$/i);
      if (q) { prompt = q[1]; continue; }
      if (a) { add({ prompt, completion: a[1], kind: "pair" }); prompt = ""; }
    }
    return { name, examples: out, skipped, format, chars: text.length };
  }

  // 5. Free prose — chunked into paragraph-sized language-modelling samples
  format = "prose";
  const paragraphs = trimmed.split(/\n{2,}/).flatMap((p) => {
    const c = clean(p);
    if (c.length <= 900) return [c];
    const chunks: string[] = [];
    for (let i = 0; i < c.length; i += 800) chunks.push(c.slice(i, i + 900));
    return chunks;
  });
  paragraphs.forEach((p) => add({ prompt: "", completion: p, kind: "prose" }));
  return { name, examples: out, skipped, format, chars: text.length };
}

/**
 * Serialise one example into the model's chat template:
 * `<|ds|> <|user|> …terms… <|assistant|> …terms… <|eot|>`
 *
 * Role boundary tokens are what let a small model learn *where* an answer
 * starts, which is the single largest quality lever in SLM instruction tuning.
 */
export function encodeExample(tk: Tokenizer, ex: TrainingExample, datasetName: string): number[] {
  const out = [tk.id(`src:${DATASET_SOURCE_LABEL}`), tk.id(`ds:${datasetName.toLowerCase().slice(0, 24)}`)];
  if (ex.prompt) {
    out.push(tk.id("<|user|>"));
    for (const t of passageTerms(ex.prompt, 12)) out.push(tk.id(`term:${t}`));
  }
  out.push(tk.id("<|assistant|>"));
  for (const t of passageTerms(ex.completion, 16)) out.push(tk.id(`term:${t}`));
  out.push(tk.id("<|eot|>"));
  return out;
}

/** Shuffle-and-pack a whole dataset into one training token stream. */
export function encodeDataset(
  tk: Tokenizer,
  examples: TrainingExample[],
  datasetName: string,
  epochs = 1,
): number[] {
  const tokens: number[] = [];
  for (let e = 0; e < Math.max(1, epochs); e++) {
    // Fresh order per epoch — order-independence prevents the network from
    // learning the sequence of the file instead of its content.
    const order = examples.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    for (const i of order) tokens.push(...encodeExample(tk, examples[i], datasetName));
  }
  return tokens;
}

/** Short human summary used for the memory index and the run log. */
export function describeDataset(d: ParsedDataset): string {
  const pairs = d.examples.filter((e) => e.kind === "pair").length;
  return `${d.examples.length} examples (${pairs} instruction pairs, ${d.examples.length - pairs} prose chunks) parsed as ${d.format}${d.skipped ? `, ${d.skipped} skipped` : ""}`;
}

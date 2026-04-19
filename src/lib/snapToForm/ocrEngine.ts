// Tesseract.js wrapper — fully in-browser OCR. No AI credits.
// Caches the worker across pages in a session for speed.

import Tesseract, { createWorker, Worker } from "tesseract.js";

let workerPromise: Promise<Worker> | null = null;

async function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = createWorker("eng", 1, {
      // Use the public CDN that Tesseract.js ships with by default.
      // No bundler config needed.
      logger: () => {},
    });
  }
  return workerPromise;
}

export async function terminateOcr() {
  if (workerPromise) {
    const w = await workerPromise;
    await w.terminate().catch(() => {});
    workerPromise = null;
  }
}

export interface OcrLine {
  text: string;
  bbox: { x0: number; y0: number; x1: number; y1: number };
  confidence: number;
}

export interface OcrPageResult {
  text: string;
  lines: OcrLine[];
  confidence: number;
}

export async function recognizePage(
  dataUrl: string,
  onProgress?: (p: number) => void,
): Promise<OcrPageResult> {
  const worker = await getWorker();
  const { data } = await worker.recognize(
    dataUrl,
    {},
    { blocks: true } as any,
  );

  // Tesseract v5 returns blocks → paragraphs → lines. Flatten lines.
  const lines: OcrLine[] = [];
  const blocks = (data as any).blocks ?? [];
  for (const b of blocks) {
    for (const p of b.paragraphs ?? []) {
      for (const l of p.lines ?? []) {
        const t = (l.text || "").replace(/\s+$/g, "");
        if (!t) continue;
        lines.push({
          text: t,
          bbox: l.bbox,
          confidence: l.confidence ?? 0,
        });
      }
    }
  }

  // Fallback: if blocks weren't returned, split text by newlines.
  if (lines.length === 0 && data.text) {
    data.text.split(/\r?\n/).forEach((t, i) => {
      const trimmed = t.trim();
      if (!trimmed) return;
      lines.push({
        text: trimmed,
        bbox: { x0: 0, y0: i * 20, x1: 1000, y1: (i + 1) * 20 },
        confidence: data.confidence ?? 80,
      });
    });
  }

  if (onProgress) onProgress(1);

  return {
    text: data.text || "",
    lines,
    confidence: (data.confidence ?? 0) / 100,
  };
}

// Pre-warm the worker so the first page is faster.
export function prewarmOcr() {
  void getWorker().catch(() => {
    workerPromise = null;
  });
}

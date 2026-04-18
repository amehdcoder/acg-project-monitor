// Tesseract.js wrapper — fully in-browser OCR. No AI credits.
// Uses an LSTM engine with auto page-segmentation, a permissive character set,
// and a dual-pass strategy that retries low-confidence pages with a different
// PSM mode. Worker is cached across pages and prewarmed on dialog open.

import { createWorker, Worker, PSM, OEM } from "tesseract.js";

let workerPromise: Promise<Worker> | null = null;

async function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      const w = await createWorker("eng", OEM.LSTM_ONLY, {
        logger: () => {},
      });
      // Tuned parameters for paper forms: preserve interword spacing,
      // allow checkbox glyphs, dotted leaders, and underscores.
      await w.setParameters({
        tessedit_pageseg_mode: PSM.AUTO_OSD,
        preserve_interword_spaces: "1",
        user_defined_dpi: "300",
        // Whitelist: ascii letters/numbers + common form glyphs + box/circle markers.
        tessedit_char_whitelist:
          "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789" +
          " .,;:?!()[]{}<>/\\\\@#$%&*+-=_'\"" +
          "☐☑□■◯○●✓✗✔✘",
      } as any);
      return w;
    })();
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

async function recognizeWithMode(
  worker: Worker,
  dataUrl: string,
  psm: PSM,
): Promise<OcrPageResult> {
  await worker.setParameters({ tessedit_pageseg_mode: psm } as any);
  const { data } = await worker.recognize(dataUrl, {}, { blocks: true } as any);

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
        confidence: data.confidence ?? 70,
      });
    });
  }

  return {
    text: data.text || "",
    lines,
    confidence: (data.confidence ?? 0) / 100,
  };
}

export async function recognizePage(
  dataUrl: string,
  onProgress?: (p: number) => void,
): Promise<OcrPageResult> {
  const worker = await getWorker();

  // First pass: AUTO_OSD handles most paper forms (auto orient + segment).
  let result = await recognizeWithMode(worker, dataUrl, PSM.AUTO_OSD);

  // Dual-pass: if confidence is poor or barely any lines were extracted,
  // retry with SINGLE_BLOCK which is more aggressive on tightly-packed forms.
  if (result.confidence < 0.55 || result.lines.length < 4) {
    try {
      const second = await recognizeWithMode(worker, dataUrl, PSM.SINGLE_BLOCK);
      if (second.lines.length > result.lines.length || second.confidence > result.confidence) {
        result = second;
      }
    } catch {
      /* keep first pass */
    }
  }

  if (onProgress) onProgress(1);
  return result;
}

// Pre-warm the worker so the first page is faster.
export function prewarmOcr() {
  void getWorker().catch(() => {
    workerPromise = null;
  });
}

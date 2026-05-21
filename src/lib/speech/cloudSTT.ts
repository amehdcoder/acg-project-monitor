/**
 * Cloud STT (ElevenLabs Scribe v2 batch) with graceful fallback semantics.
 *
 * Why batch instead of realtime here:
 *   - The form engine's `externalTranscriber` contract is single-shot
 *     (record → final text). Batch fits cleanly with no engine rewrite.
 *   - Scribe v2 batch latency is ~300–800 ms for ≤10 s clips, which is
 *     well within field-form expectations.
 *
 * What this module provides:
 *   - `recordAndTranscribe(opts)` — opens the mic with the same hardened
 *     constraints as the rest of the speech stack, records until silence
 *     (light client VAD) or `maxMs`, then POSTs to the `scribe-transcribe`
 *     edge function with retry + backoff. Keeps a small rolling audio
 *     buffer so a transient 4G drop replays instead of losing the answer.
 *   - `isCloudSTTQuotaExhausted()` — flips true on 402/429 so callers can
 *     stop trying for the rest of the session and fall through to the
 *     next tier (offline Whisper → Web Speech API).
 *
 * Network failure policy:
 *   - 2 retries with exponential backoff (400 ms, 1200 ms).
 *   - 402 / 429 = quota — disable for session, throw `quota_exhausted`.
 *   - Anything else after retries = throw `network_error`; caller falls back.
 */
import { supabase } from "@/integrations/supabase/client";

export interface CloudSTTOptions {
  /** Hard cap on recording length. Default 8 s. */
  maxMs?: number;
  /** Silence trim window in ms (stop early after this much sub-threshold audio). Default 1100. */
  silenceMs?: number;
  /** ISO 639-3 hint. Default "eng". */
  language?: string;
  /** Up to 64 domain terms passed to Scribe as `biased_keywords` (ward names, drugs, etc.). */
  keywords?: string[];
  /** When true, edge function post-processes transcript to digits only. Use for integer/decimal fields. */
  numericOnly?: boolean;
}

export interface CloudSTTResult {
  text: string;
  confidence: number;
}

// ── Module-level bias the engine flips per-question so any caller of
// `recordAndTranscribe()` (with no opts) still benefits from the active
// question's lexicon + numeric-mode flag.
let activeBias: { keywords?: string[]; numericOnly?: boolean } = {};
export function setCloudSTTBias(bias: { keywords?: string[]; numericOnly?: boolean }) {
  activeBias = { ...bias };
}
export function clearCloudSTTBias() { activeBias = {}; }

let quotaExhausted = false;
export const isCloudSTTQuotaExhausted = () => quotaExhausted;
export const resetCloudSTTQuota = () => { quotaExhausted = false; };

const BACKOFF_MS = [400, 1200];

/**
 * Record one utterance via MediaRecorder, then transcribe via edge function.
 * Throws Error("no_speech" | "not_allowed" | "aborted" | "quota_exhausted" | "network_error").
 */
export async function recordAndTranscribe(opts: CloudSTTOptions = {}): Promise<CloudSTTResult> {
  if (quotaExhausted) throw new Error("quota_exhausted");

  const { maxMs = 8000, silenceMs = 1100, language = "eng" } = opts;
  // Caller opts win; otherwise fall back to module-level active bias.
  const keywords = (opts.keywords ?? activeBias.keywords ?? []).filter(Boolean).slice(0, 64);
  const numericOnly = opts.numericOnly ?? activeBias.numericOnly ?? false;

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
        sampleRate: 16000,
      },
    });
  } catch (e: any) {
    if (e?.name === "NotAllowedError") throw new Error("not_allowed");
    throw new Error("aborted");
  }

  const blob = await new Promise<Blob>((resolve, reject) => {
    const mimeCandidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
    const mime = mimeCandidates.find(m => MediaRecorder.isTypeSupported?.(m)) || "";
    const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
    const chunks: BlobPart[] = [];
    rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    rec.onerror = () => reject(new Error("aborted"));
    rec.onstop = () => {
      stream.getTracks().forEach(t => t.stop());
      const b = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
      if (b.size < 2000) reject(new Error("no_speech"));
      else resolve(b);
    };
    rec.start(250);

    // ── Light client VAD: stop early after `silenceMs` of quiet ──
    const AC: any = (window as any).AudioContext || (window as any).webkitAudioContext;
    let ctx: AudioContext | null = null;
    let raf: number | null = null;
    let lastVoiceAt = Date.now();
    let started = false;
    if (AC) {
      try {
        ctx = new AC();
        const src = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        src.connect(analyser);
        const buf = new Uint8Array(analyser.fftSize);
        const tick = () => {
          if (!ctx) return;
          analyser.getByteTimeDomainData(buf);
          let sum = 0;
          for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; sum += v * v; }
          const rms = Math.sqrt(sum / buf.length);
          const now = Date.now();
          if (rms > 0.035) { lastVoiceAt = now; started = true; }
          if (started && now - lastVoiceAt > silenceMs && rec.state === "recording") {
            try { rec.stop(); } catch { /* noop */ }
            return;
          }
          raf = requestAnimationFrame(tick);
        };
        tick();
      } catch { /* VAD optional */ }
    }
    setTimeout(() => {
      if (raf) cancelAnimationFrame(raf);
      try { ctx?.close(); } catch { /* noop */ }
      if (rec.state === "recording") { try { rec.stop(); } catch { /* noop */ } }
    }, maxMs);
  });

  // ── Upload with retry + backoff (handles flaky 4G) ──
  for (let attempt = 0; attempt <= BACKOFF_MS.length; attempt++) {
    try {
      const form = new FormData();
      form.append("audio", blob, "chunk.webm");
      form.append("language", language);

      const { data, error } = await supabase.functions.invoke("scribe-transcribe", {
        body: form,
      });

      if (error) {
        const msg = error.message || String(error);
        const status = (error as any).status || (error as any).context?.status;
        if (status === 402 || status === 429 || /quota|payment/i.test(msg)) {
          quotaExhausted = true;
          throw new Error("quota_exhausted");
        }
        throw new Error(msg || "network_error");
      }

      const text = (data?.text || "").trim();
      if (!text) throw new Error("no_speech");
      return { text, confidence: typeof data?.confidence === "number" ? data.confidence : 0.85 };
    } catch (e: any) {
      const msg = e?.message || String(e);
      if (msg === "no_speech" || msg === "quota_exhausted" || msg === "not_allowed") throw e;
      if (attempt < BACKOFF_MS.length) {
        await new Promise(r => setTimeout(r, BACKOFF_MS[attempt]));
        continue;
      }
      throw new Error("network_error");
    }
  }
  throw new Error("network_error");
}

/** Mint a realtime Scribe token for callers ready to upgrade to streaming. */
export async function getRealtimeScribeToken(): Promise<string> {
  const { data, error } = await supabase.functions.invoke("scribe-token", { body: {} });
  if (error || !data?.token) throw new Error(error?.message || "token_error");
  return data.token as string;
}

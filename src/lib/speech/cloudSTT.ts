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
import { recordUtterance } from "./telemetry";
import { addReplayClip } from "./replayLog";
import { isTTSSpeaking, waitForTTSSilence } from "./ttsState";

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
export async function recordAndTranscribe(opts: CloudSTTOptions & { qId?: string } = {}): Promise<CloudSTTResult> {
  const startedAt = Date.now();
  const offline = typeof navigator !== "undefined" && !navigator.onLine;
  if (quotaExhausted) {
    recordUtterance({ tier: "scribe_cloud", latencyMs: 0, fallbackReason: "quota_exhausted", qId: opts.qId, lang: opts.language, offline });
    throw new Error("quota_exhausted");
  }

  const { maxMs = 8000, silenceMs = 1100, language = "eng" } = opts;
  const keywords = (opts.keywords ?? activeBias.keywords ?? []).filter(Boolean).slice(0, 64);
  const numericOnly = opts.numericOnly ?? activeBias.numericOnly ?? false;

  // ── Don't open the mic while the app is still speaking. Speaker
  // leakage would trip the VAD on our own prompt and the user would
  // hear "I didn't hear anything" instead of being allowed to answer.
  if (isTTSSpeaking()) await waitForTTSSilence(180, 6000);

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
        sampleRate: 16000,
        // Chrome-only goog hints — strip non-voice and typing noise.
        // Cast to any so TS doesn't reject the vendor constraints.
        ...( { googHighpassFilter: true, googTypingNoiseDetection: true,
               googAudioMirroring: false } as any ),
      } as any,
    });
  } catch (e: any) {
    if (e?.name === "NotAllowedError") throw new Error("not_allowed");
    throw new Error("aborted");
  }

  // peakRms is captured so we can reject pure-noise clips before burning
  // a cloud STT credit (and before getting back garbage that the engine
  // would then surface as "I didn't hear anything").
  let peakRms = 0;

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

    // ── Adaptive VAD ────────────────────────────────────────────
    // 1. Calibrate the ambient noise floor for the first 350 ms.
    // 2. Voice = RMS > max(floor * 3.0, 0.045) for ≥ 250 ms sustained.
    //    Sustained-loudness gating is the "loudest/closest speaker wins"
    //    rule — quieter cross-talk from across the room never crosses
    //    the threshold and is treated as background noise.
    // 3. If TTS resumes mid-recording (rare), suppress voice detection
    //    so we don't latch onto our own prompt.
    // 4. After `silenceMs` of sub-threshold audio, stop.
    // 5. If peakRms never crosses a stricter "real voice" gate (0.06),
    //    reject the whole clip as noise (no cloud call).
    const AC: any = (window as any).AudioContext || (window as any).webkitAudioContext;
    let ctx: AudioContext | null = null;
    let raf: number | null = null;
    let lastVoiceAt = Date.now();
    let voiceStartedAt = 0;
    let started = false;
    let noiseFloor = 0.02;
    const calibrationEnd = Date.now() + 350;
    const calibSamples: number[] = [];
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

          if (now < calibrationEnd) {
            calibSamples.push(rms);
          } else if (calibSamples.length && noiseFloor === 0.02) {
            calibSamples.sort((a, b) => a - b);
            // Use the 80th-percentile sample as the floor — robust to
            // brief spikes (door slam) during calibration.
            noiseFloor = calibSamples[Math.floor(calibSamples.length * 0.8)] || 0.02;
          }

          // Voice gate: must clear both an absolute floor and an
          // adaptive multiple of the ambient noise floor. The TTS
          // suppression below prevents our own prompt from latching.
          const voiceGate = Math.max(noiseFloor * 3.0, 0.045);
          const isVoice = rms > voiceGate && !isTTSSpeaking();

          if (isVoice) {
            if (!voiceStartedAt) voiceStartedAt = now;
            // Require 250 ms of sustained voice before we commit.
            if (!started && now - voiceStartedAt >= 250) started = true;
            if (started) {
              lastVoiceAt = now;
              if (rms > peakRms) peakRms = rms;
            }
          } else {
            voiceStartedAt = 0;
          }

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

  // ── Pre-upload noise rejection: if no segment ever crossed the
  // strict "real voice" gate, treat the whole clip as background
  // noise and don't spend a cloud credit transcribing it.
  if (peakRms > 0 && peakRms < 0.06) {
    recordUtterance({
      tier: "scribe_cloud",
      latencyMs: Date.now() - startedAt,
      fallbackReason: "noise_rejected",
      qId: opts.qId,
      lang: language,
      offline,
    });
    throw new Error("no_speech");
  }


  // ── Upload with retry + backoff (handles flaky 4G) ──
  for (let attempt = 0; attempt <= BACKOFF_MS.length; attempt++) {
    try {
      const form = new FormData();
      form.append("audio", blob, "chunk.webm");
      form.append("language", language);
      if (keywords.length) form.append("biased_keywords", keywords.join(","));
      if (numericOnly) form.append("numeric_only", "true");

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
      const confidence = typeof data?.confidence === "number" ? data.confidence : 0.85;
      const latencyMs = Date.now() - startedAt;
      recordUtterance({ tier: "scribe_cloud", latencyMs, conf: confidence, qId: opts.qId, lang: language, offline });
      // Best-effort: stash the raw audio for supervisor replay (local-only, 24h TTL).
      addReplayClip(blob, { tier: "scribe_cloud", qId: opts.qId, lang: language, transcript: text, conf: confidence });
      return { text, confidence };
    } catch (e: any) {
      const msg = e?.message || String(e);
      if (msg === "no_speech" || msg === "quota_exhausted" || msg === "not_allowed") {
        recordUtterance({ tier: "scribe_cloud", latencyMs: Date.now() - startedAt, fallbackReason: msg, qId: opts.qId, lang: language, offline });
        throw e;
      }
      if (attempt < BACKOFF_MS.length) {
        await new Promise(r => setTimeout(r, BACKOFF_MS[attempt]));
        continue;
      }
      recordUtterance({ tier: "scribe_cloud", latencyMs: Date.now() - startedAt, fallbackReason: "network_error", qId: opts.qId, lang: language, offline });
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

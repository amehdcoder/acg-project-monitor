/**
 * Cloud TTS (ElevenLabs) client with IndexedDB caching, MP3 streaming
 * playback, and automatic fallback to browser speechSynthesis.
 *
 * Public API:
 *   - isCloudTTSEnabled()/setCloudTTSEnabled() — user preference
 *   - speakCloud(text, opts) — returns { played: boolean, audio?: HTMLAudioElement }
 *   - cancelCloud() — stop any in-flight cloud audio
 *
 * The unified `tts.speak()` in ./index.ts calls speakCloud first when enabled
 * and falls back to native speech on any error (offline, 402, 429, 5xx).
 */
import { supabase } from "@/integrations/supabase/client";
import { getCachedAudio, hashKey, putCachedAudio } from "./ttsCache";

const LS_FLAG = "tts_cloud_enabled";
const LS_VOICE = "tts_cloud_voice_id";
const DEFAULT_VOICE = "EXAVITQu4vr4xnSDxMaL"; // Sarah — clear, neutral female

let currentAudio: HTMLAudioElement | null = null;
let currentObjectURL: string | null = null;
let cloudDisabledUntil = 0; // epoch ms — short cool-down after errors

export function isCloudTTSEnabled(): boolean {
  if (typeof localStorage === "undefined") return true;
  try {
    const v = localStorage.getItem(LS_FLAG);
    // Default ON when secret is provisioned and unset
    return v === null ? true : v === "1";
  } catch {
    return true;
  }
}

export function setCloudTTSEnabled(on: boolean) {
  try { localStorage.setItem(LS_FLAG, on ? "1" : "0"); } catch { /* noop */ }
  if (!on) cancelCloud();
}

export function getCloudVoiceId(): string {
  try { return localStorage.getItem(LS_VOICE) || DEFAULT_VOICE; } catch { return DEFAULT_VOICE; }
}

export function setCloudVoiceId(voiceId: string) {
  try { localStorage.setItem(LS_VOICE, voiceId || DEFAULT_VOICE); } catch { /* noop */ }
}

export function cancelCloud() {
  if (currentAudio) {
    try { currentAudio.pause(); } catch { /* noop */ }
    try { currentAudio.src = ""; } catch { /* noop */ }
  }
  if (currentObjectURL) {
    try { URL.revokeObjectURL(currentObjectURL); } catch { /* noop */ }
    currentObjectURL = null;
  }
  currentAudio = null;
}

export interface CloudSpeakOptions {
  voiceId?: string;
  languageCode?: string; // BCP-47 like "en-US"; reduces to 2-letter for model selection
  rate?: number;         // applied via HTMLAudioElement.playbackRate
  volume?: number;       // 0..1
  /** Cache-busting token (e.g. formVersion) so edits invalidate cleanly. */
  cacheVersion?: string | number;
}

export interface CloudSpeakResult {
  played: boolean;
  reason?: string;
}

async function fetchAudioBlob(
  text: string,
  voiceId: string,
  languageCode: string,
): Promise<{ blob: Blob | null; status: number; error?: string; cooldownMs?: number }> {
  try {
    const { data, error } = await supabase.functions.invoke("tts-elevenlabs", {
      body: { text, voiceId, languageCode },
    });
    if (error) {
      // FunctionsHttpError exposes context with status
      const status = (error as any)?.context?.status ?? 0;
      return { blob: null, status, error: error.message };
    }
    // Structured fallback signal from the edge function (upstream provider error)
    if (data && typeof data === "object" && (data as any).fallback) {
      const d = data as any;
      return { blob: null, status: d.upstreamStatus ?? 402, error: d.reason || "fallback", cooldownMs: d.cooldownMs };
    }
    // supabase-js returns ArrayBuffer/Blob/Uint8Array depending on response content-type.
    if (data instanceof Blob) return { blob: data, status: 200 };
    if (data instanceof ArrayBuffer) return { blob: new Blob([data], { type: "audio/mpeg" }), status: 200 };
    if (data && typeof data === "object" && "error" in (data as any)) {
      return { blob: null, status: 500, error: String((data as any).error) };
    }
    // Fallback — coerce
    try {
      const buf = await new Response(data as any).arrayBuffer();
      return { blob: new Blob([buf], { type: "audio/mpeg" }), status: 200 };
    } catch {
      return { blob: null, status: 500, error: "Unexpected response shape" };
    }
  } catch (e) {
    return { blob: null, status: 0, error: e instanceof Error ? e.message : "network" };
  }
}

export async function speakCloud(
  text: string,
  opts: CloudSpeakOptions = {},
): Promise<CloudSpeakResult> {
  const cleaned = (text || "").trim();
  if (!cleaned) return { played: true };
  if (!isCloudTTSEnabled()) return { played: false, reason: "disabled" };
  if (Date.now() < cloudDisabledUntil) return { played: false, reason: "cooldown" };
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return { played: false, reason: "offline" };
  }

  const voiceId = opts.voiceId || getCloudVoiceId();
  const languageCode = (opts.languageCode || "en-US").slice(0, 2).toLowerCase();
  const rate = clamp(opts.rate ?? 1.0, 0.5, 2.0);
  const volume = clamp(opts.volume ?? 1.0, 0, 1);

  // 1. Cache lookup (formVersion participates in key so form edits invalidate)
  const key = await hashKey([cleaned, voiceId, languageCode, opts.cacheVersion ?? ""]);
  let blob = await getCachedAudio(key);

  // 2. Fetch from edge function if miss
  if (!blob) {
    const res = await fetchAudioBlob(cleaned, voiceId, languageCode);
    if (!res.blob) {
      // Honor server-provided cooldown; else 401/402/403/429 → long, else short
      const longStatuses = [401, 402, 403, 429];
      const cool = res.cooldownMs ?? (longStatuses.includes(res.status) ? 30 * 60 * 1000 : 60 * 1000);
      cloudDisabledUntil = Date.now() + cool;
      return { played: false, reason: res.error || `http_${res.status}` };
    }
    blob = res.blob;
    void putCachedAudio(key, blob);
  }

  // 3. Play via HTMLAudioElement
  try {
    cancelCloud();
    const objectURL = URL.createObjectURL(blob);
    currentObjectURL = objectURL;
    const audio = new Audio(objectURL);
    audio.playbackRate = rate;
    audio.volume = volume;
    currentAudio = audio;
    await new Promise<void>((resolve, reject) => {
      audio.onended = () => resolve();
      audio.onerror = () => reject(new Error("audio_error"));
      audio.play().catch(reject);
    });
    if (currentObjectURL === objectURL) {
      try { URL.revokeObjectURL(objectURL); } catch { /* noop */ }
      currentObjectURL = null;
    }
    if (currentAudio === audio) currentAudio = null;
    return { played: true };
  } catch (e) {
    cancelCloud();
    return { played: false, reason: e instanceof Error ? e.message : "play_failed" };
  }
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

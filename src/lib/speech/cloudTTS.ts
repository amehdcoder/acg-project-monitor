/**
 * Cloud TTS (ElevenLabs) client.
 *
 * Tiers, in order, for each `speakCloud()` call:
 *   1. IndexedDB cache hit  → instant Blob playback.
 *   2. MediaSource streaming → first audio in ~250 ms over 3G, cache assembled
 *      blob on completion. Disabled automatically when MediaSource / the
 *      negotiated mime type isn't supported (Safari for opus, etc.).
 *   3. Buffered fetch via supabase.functions.invoke → fallback path.
 *
 * The unified `tts.speak()` in ./index.ts calls speakCloud first when enabled
 * and falls back through Piper / native speech on any error.
 */
import { supabase } from "@/integrations/supabase/client";
import { getCachedAudio, hashKey, putCachedAudio } from "./ttsCache";

const LS_FLAG = "tts_cloud_enabled";
const LS_VOICE = "tts_cloud_voice_id";
const DEFAULT_VOICE = "EXAVITQu4vr4xnSDxMaL"; // Sarah — clear, neutral female
// Half the bitrate of the legacy 128 kbps default → ~50% smaller cache,
// still intelligible for narration. Edge function accepts opus_* / mp3_* too.
const DEFAULT_FORMAT = "mp3_44100_64";

let currentAudio: HTMLAudioElement | null = null;
let currentObjectURL: string | null = null;
let currentMediaSource: MediaSource | null = null;
let currentStreamReader: ReadableStreamDefaultReader<Uint8Array> | null = null;
let cloudDisabledUntil = 0; // epoch ms — short cool-down after errors

export function isCloudTTSEnabled(): boolean {
  if (typeof localStorage === "undefined") return true;
  try {
    const v = localStorage.getItem(LS_FLAG);
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
  if (currentStreamReader) {
    try { currentStreamReader.cancel(); } catch { /* noop */ }
    currentStreamReader = null;
  }
  if (currentMediaSource && currentMediaSource.readyState === "open") {
    try { currentMediaSource.endOfStream(); } catch { /* noop */ }
  }
  currentMediaSource = null;
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
  languageCode?: string;
  rate?: number;
  volume?: number;
  cacheVersion?: string | number;
  /** Output format. Defaults to mp3_44100_64. */
  format?: string;
  /** Pass `<break>` tags through to ElevenLabs SSML parser. */
  ssml?: boolean;
}

export interface CloudSpeakResult {
  played: boolean;
  reason?: string;
}

function mimeForFormat(format: string): string {
  if (format.startsWith("opus")) return "audio/ogg; codecs=opus";
  if (format.startsWith("pcm")) return "audio/wave";
  return "audio/mpeg";
}

function mediaSourceSupports(format: string): boolean {
  if (typeof MediaSource === "undefined" || !MediaSource.isTypeSupported) return false;
  const mime = format.startsWith("opus") ? 'audio/webm; codecs="opus"' : "audio/mpeg";
  try { return MediaSource.isTypeSupported(mime); } catch { return false; }
}

/** Build the public edge-function URL for direct fetch (needed for streaming). */
function edgeFunctionURL(): string | null {
  const base = (import.meta as any).env?.VITE_SUPABASE_URL as string | undefined;
  if (!base) return null;
  return `${base.replace(/\/$/, "")}/functions/v1/tts-elevenlabs`;
}

async function getAuthHeader(): Promise<Record<string, string>> {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    const anon = (import.meta as any).env?.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
    const headers: Record<string, string> = {};
    if (anon) headers["apikey"] = anon;
    headers["Authorization"] = token ? `Bearer ${token}` : (anon ? `Bearer ${anon}` : "");
    return headers;
  } catch {
    return {};
  }
}

/**
 * Stream audio chunks from the edge function into a MediaSource buffer so
 * playback starts on the first chunk (~250 ms over 3G). On `end`, the
 * assembled blob is cached for instant subsequent plays.
 *
 * Returns a result; if streaming isn't viable the caller should fall back
 * to the buffered path.
 */
async function streamCloud(
  text: string,
  voiceId: string,
  languageCode: string,
  format: string,
  ssml: boolean,
  rate: number,
  volume: number,
  cacheKey: string,
): Promise<CloudSpeakResult> {
  const url = edgeFunctionURL();
  if (!url) return { played: false, reason: "no_url" };
  if (!mediaSourceSupports(format)) return { played: false, reason: "no_mediasource" };

  // MediaSource only supports MP3 reliably across browsers; opus-in-ogg works
  // poorly via MSE. So streaming is currently MP3-only — caller picks format.
  const headers = await getAuthHeader();
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ text, voiceId, languageCode, format, ssml }),
    });
  } catch (e) {
    return { played: false, reason: e instanceof Error ? e.message : "network" };
  }

  const contentType = res.headers.get("content-type") || "";
  if (!res.ok || !res.body) {
    return { played: false, reason: `http_${res.status}` };
  }
  if (contentType.includes("application/json")) {
    // Edge function returned a structured fallback (upstream provider issue).
    try {
      const body = await res.json();
      const longStatuses = [401, 402, 403, 429];
      const cool = body?.cooldownMs ?? (longStatuses.includes(body?.upstreamStatus) ? 30 * 60 * 1000 : 60 * 1000);
      cloudDisabledUntil = Date.now() + cool;
      return { played: false, reason: body?.reason || "upstream_fallback" };
    } catch {
      return { played: false, reason: "upstream_fallback" };
    }
  }
  if (!contentType.includes("audio/")) {
    return { played: false, reason: `bad_mime_${contentType}` };
  }

  cancelCloud();
  const mediaSource = new MediaSource();
  const objectURL = URL.createObjectURL(mediaSource);
  currentMediaSource = mediaSource;
  currentObjectURL = objectURL;

  const audio = new Audio(objectURL);
  audio.playbackRate = rate;
  audio.volume = volume;
  currentAudio = audio;

  const collected: Uint8Array[] = [];
  let total = 0;

  return await new Promise<CloudSpeakResult>((resolve) => {
    const fail = (reason: string) => {
      cancelCloud();
      resolve({ played: false, reason });
    };

    mediaSource.addEventListener("sourceopen", async () => {
      let sourceBuffer: SourceBuffer;
      try {
        sourceBuffer = mediaSource.addSourceBuffer("audio/mpeg");
      } catch (e) {
        fail("source_buffer_failed");
        return;
      }
      const reader = res.body!.getReader();
      currentStreamReader = reader;
      const pending: Uint8Array[] = [];
      let readerDone = false;

        const appendNext = () => {
          if (sourceBuffer.updating || pending.length === 0) return;
          const chunk = pending.shift()!;
          try { sourceBuffer.appendBuffer(chunk.buffer.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength) as ArrayBuffer); }
          catch (e) { fail("append_failed"); }
        };

      sourceBuffer.addEventListener("updateend", () => {
        if (pending.length > 0) {
          appendNext();
        } else if (readerDone) {
          try { if (mediaSource.readyState === "open") mediaSource.endOfStream(); }
          catch { /* noop */ }
        }
      });

      audio.onended = async () => {
        try {
          const parts = collected.map((u) => u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer);
          const blob = new Blob(parts, { type: mimeForFormat(format) });
          if (blob.size > 0) await putCachedAudio(cacheKey, blob);
        } catch { /* noop */ }
        if (currentObjectURL === objectURL) {
          try { URL.revokeObjectURL(objectURL); } catch { /* noop */ }
          currentObjectURL = null;
        }
        if (currentAudio === audio) currentAudio = null;
        currentMediaSource = null;
        resolve({ played: true });
      };
      audio.onerror = () => fail("audio_error");

      let playStarted = false;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) { readerDone = true; break; }
          if (!value || value.length === 0) continue;
          collected.push(value);
          total += value.length;
          pending.push(value);
          appendNext();
          if (!playStarted) {
            playStarted = true;
            // Kick off playback as soon as we have a buffer; ignore autoplay errors.
            audio.play().catch(() => { /* will retry on next user gesture */ });
          }
        }
        // Flush trailing buffers.
        if (!sourceBuffer.updating && pending.length === 0 && mediaSource.readyState === "open") {
          try { mediaSource.endOfStream(); } catch { /* noop */ }
        }
      } catch (e) {
        fail(e instanceof Error ? e.message : "stream_error");
      }
    }, { once: true });
  });
}

async function fetchAudioBlob(
  text: string,
  voiceId: string,
  languageCode: string,
  format: string,
  ssml: boolean,
): Promise<{ blob: Blob | null; status: number; error?: string; cooldownMs?: number }> {
  try {
    const { data, error } = await supabase.functions.invoke("tts-elevenlabs", {
      body: { text, voiceId, languageCode, format, ssml },
    });
    if (error) {
      const status = (error as any)?.context?.status ?? 0;
      return { blob: null, status, error: error.message };
    }
    if (data && typeof data === "object" && (data as any).fallback) {
      const d = data as any;
      return { blob: null, status: d.upstreamStatus ?? 402, error: d.reason || "fallback", cooldownMs: d.cooldownMs };
    }
    const mime = mimeForFormat(format);
    if (data instanceof Blob) return { blob: data, status: 200 };
    if (data instanceof ArrayBuffer) return { blob: new Blob([data], { type: mime }), status: 200 };
    if (data && typeof data === "object" && "error" in (data as any)) {
      return { blob: null, status: 500, error: String((data as any).error) };
    }
    try {
      const buf = await new Response(data as any).arrayBuffer();
      return { blob: new Blob([buf], { type: mime }), status: 200 };
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
  const format = opts.format || DEFAULT_FORMAT;
  const ssml = opts.ssml ?? /<break\b/i.test(cleaned);
  const rate = clamp(opts.rate ?? 1.0, 0.5, 2.0);
  const volume = clamp(opts.volume ?? 1.0, 0, 1);

  // 1. Cache lookup
  const key = await hashKey([cleaned, voiceId, languageCode, format, opts.cacheVersion ?? ""]);
  const cached = await getCachedAudio(key);
  if (cached) {
    return await playBlob(cached, rate, volume);
  }

  // 2. Streaming first-play (MP3 only — MSE for opus is unreliable cross-browser).
  if (format.startsWith("mp3") && mediaSourceSupports(format)) {
    const streamRes = await streamCloud(cleaned, voiceId, languageCode, format, ssml, rate, volume, key);
    if (streamRes.played) return streamRes;
    // Fall through to buffered path only if streaming didn't actually play.
  }

  // 3. Buffered fetch
  const res = await fetchAudioBlob(cleaned, voiceId, languageCode, format, ssml);
  if (!res.blob) {
    const longStatuses = [401, 402, 403, 429];
    const cool = res.cooldownMs ?? (longStatuses.includes(res.status) ? 30 * 60 * 1000 : 60 * 1000);
    cloudDisabledUntil = Date.now() + cool;
    return { played: false, reason: res.error || `http_${res.status}` };
  }
  void putCachedAudio(key, res.blob);
  return await playBlob(res.blob, rate, volume);
}

async function playBlob(blob: Blob, rate: number, volume: number): Promise<CloudSpeakResult> {
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

/**
 * Fetch + cache audio WITHOUT playing it (background prefetch). Uses the
 * buffered path only — streaming makes no sense when there's no listener.
 */
export async function prefetchCloud(
  text: string,
  opts: CloudSpeakOptions = {},
): Promise<boolean> {
  const cleaned = (text || "").trim();
  if (!cleaned) return false;
  if (!isCloudTTSEnabled()) return false;
  if (Date.now() < cloudDisabledUntil) return false;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return false;

  const voiceId = opts.voiceId || getCloudVoiceId();
  const languageCode = (opts.languageCode || "en-US").slice(0, 2).toLowerCase();
  const format = opts.format || DEFAULT_FORMAT;
  const ssml = opts.ssml ?? /<break\b/i.test(cleaned);
  const key = await hashKey([cleaned, voiceId, languageCode, format, opts.cacheVersion ?? ""]);
  const existing = await getCachedAudio(key);
  if (existing) return true;

  const res = await fetchAudioBlob(cleaned, voiceId, languageCode, format, ssml);
  if (!res.blob) {
    const longStatuses = [401, 402, 403, 429];
    const cool = res.cooldownMs ?? (longStatuses.includes(res.status) ? 30 * 60 * 1000 : 60 * 1000);
    cloudDisabledUntil = Date.now() + cool;
    return false;
  }
  await putCachedAudio(key, res.blob);
  return true;
}

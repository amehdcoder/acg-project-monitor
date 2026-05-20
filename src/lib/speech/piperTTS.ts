/**
 * Offline neural TTS tier — Piper / VITS via @diffusionstudio/vits-web.
 *
 * Lazy-loaded WASM (~20 MB voice model, cached in IndexedDB by the lib).
 * Sits between cloud TTS (ElevenLabs) and the browser's speechSynthesis as
 * the second-best option when the device is offline or cloud quota is
 * exhausted — natural neural voices that work fully offline once the model
 * has been downloaded once.
 *
 * Public API mirrors cloudTTS:
 *   - isPiperEnabled() / setPiperEnabled()
 *   - getPiperVoiceId() / setPiperVoiceId()
 *   - speakPiper(text, opts) → { played, reason? }
 *   - cancelPiper()
 *   - prefetchPiperModel() — warm the model in idle time
 *   - isPiperReady() — true once the voice model is downloaded & cached
 */

const LS_FLAG = "tts_piper_enabled";
const LS_VOICE = "tts_piper_voice_id";

// Clear, neutral US-English female. Other locales fall back to cloud → native.
const DEFAULT_VOICE = "en_US-hfc_female-medium";

let modPromise: Promise<typeof import("@diffusionstudio/vits-web")> | null = null;
let modelReady = false;
let modelReadyVoice: string | null = null;
let currentAudio: HTMLAudioElement | null = null;
let currentObjectURL: string | null = null;
let piperDisabledUntil = 0;

export function isPiperEnabled(): boolean {
  if (typeof localStorage === "undefined") return true;
  try {
    const v = localStorage.getItem(LS_FLAG);
    return v === null ? true : v === "1";
  } catch {
    return true;
  }
}

export function setPiperEnabled(on: boolean) {
  try { localStorage.setItem(LS_FLAG, on ? "1" : "0"); } catch { /* noop */ }
  if (!on) cancelPiper();
}

export function getPiperVoiceId(): string {
  try { return localStorage.getItem(LS_VOICE) || DEFAULT_VOICE; } catch { return DEFAULT_VOICE; }
}

export function setPiperVoiceId(voiceId: string) {
  try { localStorage.setItem(LS_VOICE, voiceId || DEFAULT_VOICE); } catch { /* noop */ }
  modelReady = false;
  modelReadyVoice = null;
}

export function isPiperReady(): boolean {
  return modelReady && modelReadyVoice === getPiperVoiceId();
}

export function cancelPiper() {
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

function loadModule() {
  if (!modPromise) {
    modPromise = import("@diffusionstudio/vits-web").catch((e) => {
      modPromise = null;
      throw e;
    });
  }
  return modPromise;
}

/**
 * Download (or confirm-cached) the current voice model. Safe to call
 * repeatedly — returns true once the model is in IndexedDB.
 */
export async function prefetchPiperModel(): Promise<boolean> {
  if (!isPiperEnabled()) return false;
  if (Date.now() < piperDisabledUntil) return false;
  const voiceId = getPiperVoiceId();
  if (modelReady && modelReadyVoice === voiceId) return true;
  try {
    const mod: any = await loadModule();
    // Library exposes either `stored()` (cached voice ids) or just runs
    // download() lazily on first predict(). We call download() defensively;
    // it short-circuits when already cached.
    if (typeof mod.download === "function") {
      await mod.download(voiceId);
    }
    modelReady = true;
    modelReadyVoice = voiceId;
    return true;
  } catch (e) {
    // Long cooldown — Piper failures are usually network (CDN) or unsupported
    // browser (no WASM SIMD). Re-trying every utterance is wasteful.
    piperDisabledUntil = Date.now() + 30 * 60 * 1000;
    console.warn("[piper] model load failed:", e instanceof Error ? e.message : e);
    return false;
  }
}

export interface PiperSpeakOptions {
  voiceId?: string;
  rate?: number;
  volume?: number;
}

export interface PiperSpeakResult {
  played: boolean;
  reason?: string;
}

export async function speakPiper(
  text: string,
  opts: PiperSpeakOptions = {},
): Promise<PiperSpeakResult> {
  const cleaned = (text || "").trim();
  if (!cleaned) return { played: true };
  if (!isPiperEnabled()) return { played: false, reason: "disabled" };
  if (Date.now() < piperDisabledUntil) return { played: false, reason: "cooldown" };

  const voiceId = opts.voiceId || getPiperVoiceId();
  let mod: any;
  try {
    mod = await loadModule();
  } catch {
    piperDisabledUntil = Date.now() + 30 * 60 * 1000;
    return { played: false, reason: "module_load_failed" };
  }

  // Ensure the voice model is present. Download is a one-time ~20MB hit
  // that the library caches in IndexedDB.
  if (!(modelReady && modelReadyVoice === voiceId)) {
    const ok = await prefetchPiperModel();
    if (!ok) return { played: false, reason: "model_unavailable" };
  }

  let wav: Blob;
  try {
    wav = await mod.predict({ text: cleaned, voiceId });
    if (!(wav instanceof Blob)) {
      // Library may return Uint8Array in some envs.
      wav = new Blob([wav as any], { type: "audio/wav" });
    }
  } catch (e) {
    return { played: false, reason: e instanceof Error ? e.message : "predict_failed" };
  }

  try {
    cancelPiper();
    const url = URL.createObjectURL(wav);
    currentObjectURL = url;
    const audio = new Audio(url);
    audio.playbackRate = clamp(opts.rate ?? 1.0, 0.5, 2.0);
    audio.volume = clamp(opts.volume ?? 1.0, 0, 1);
    currentAudio = audio;
    await new Promise<void>((resolve, reject) => {
      audio.onended = () => resolve();
      audio.onerror = () => reject(new Error("audio_error"));
      audio.play().catch(reject);
    });
    if (currentObjectURL === url) {
      try { URL.revokeObjectURL(url); } catch { /* noop */ }
      currentObjectURL = null;
    }
    if (currentAudio === audio) currentAudio = null;
    return { played: true };
  } catch (e) {
    cancelPiper();
    return { played: false, reason: e instanceof Error ? e.message : "play_failed" };
  }
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

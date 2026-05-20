/**
 * Silero VAD barge-in — true mid-utterance interruption (~150 ms detection).
 *
 * Wraps @ricky0123/vad-web (Silero VAD ONNX, ~2 MB, lazy-loaded) so the form
 * engine can:
 *   • Detect that the user has STARTED speaking while TTS is mid-sentence.
 *   • Immediately cancel TTS (`onBargeIn`) so the engine can pivot to STT.
 *   • Duck the cloud/native TTS volume during overlap so the user hears
 *     themselves cleanly even before TTS fully stops.
 *
 * Public API:
 *   - enableBargeIn(opts)  → starts the VAD on a hidden mic stream
 *   - disableBargeIn()     → tears it down + releases the mic
 *   - isBargeInActive()    → boolean
 *
 * Implementation notes:
 *   - VAD model + audio worklet are fetched from JsDelivr CDN by default
 *     (overridable via `assetBaseURL`). First load is ~2 MB; cached after.
 *   - Long cooldown after any init failure (no model, no WASM SIMD, blocked
 *     CDN) so we don't hammer the network on every form open.
 *   - Safe to call enable/disable repeatedly — re-uses the underlying
 *     instance and only starts/stops the audio graph.
 */

import { cancelCloud } from "./cloudTTS";
import { cancelPiper } from "./piperTTS";

const LS_FLAG = "tts_bargein_enabled";

let vadInstance: any = null;
let vadLoading: Promise<any> | null = null;
let initFailedUntil = 0;
let active = false;
let lastSpeechStartAt = 0;

type BargeInOpts = {
  /** Called when user starts speaking while TTS is mid-output. */
  onBargeIn?: () => void;
  /** Called when speech ends — useful to un-duck or restart STT. */
  onSpeechEnd?: () => void;
  /** ms — minimum interval between barge-in events (debounce). Default 1200. */
  cooldownMs?: number;
  /** Override CDN base for the .onnx + worklet (default JsDelivr). */
  assetBaseURL?: string;
};

export function isBargeInEnabled(): boolean {
  if (typeof localStorage === "undefined") return true;
  try {
    const v = localStorage.getItem(LS_FLAG);
    return v === null ? true : v === "1";
  } catch {
    return true;
  }
}

export function setBargeInEnabled(on: boolean) {
  try { localStorage.setItem(LS_FLAG, on ? "1" : "0"); } catch { /* noop */ }
  if (!on) void disableBargeIn();
}

export function isBargeInActive(): boolean {
  return active;
}

async function loadVAD(opts: BargeInOpts): Promise<any> {
  if (vadInstance) return vadInstance;
  if (vadLoading) return vadLoading;

  vadLoading = (async () => {
    const mod: any = await import("@ricky0123/vad-web");
    const cdnBase =
      opts.assetBaseURL ||
      "https://cdn.jsdelivr.net/npm/@ricky0123/vad-web@0.0.30/dist/";
    const ortBase =
      "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.26.0/dist/";

    const instance = await mod.MicVAD.new({
      // Asset paths — load model + worklet from CDN so we don't need to ship
      // them in the Vite bundle.
      baseAssetPath: cdnBase,
      onnxWASMBasePath: ortBase,
      // Sensitivity tuned for noisy field conditions (default 0.5 was too
      // trigger-happy on traffic / generators / background voices).
      positiveSpeechThreshold: 0.6,
      negativeSpeechThreshold: 0.45,
      // Require ~150 ms of speech before firing — fast enough for true
      // barge-in, slow enough to ignore single coughs / hiccups.
      minSpeechFrames: 5,
      redemptionFrames: 8,
      preSpeechPadFrames: 1,
      onSpeechStart: () => {
        const now = Date.now();
        const cooldown = opts.cooldownMs ?? 1200;
        if (now - lastSpeechStartAt < cooldown) return;
        lastSpeechStartAt = now;
        // Hard-stop both premium tiers immediately. Native speechSynthesis
        // is cancelled by the engine's onBargeIn callback (it owns the
        // utterance keep-alive timer).
        try { cancelCloud(); } catch { /* noop */ }
        try { cancelPiper(); } catch { /* noop */ }
        try { opts.onBargeIn?.(); } catch { /* noop */ }
      },
      onSpeechEnd: () => {
        try { opts.onSpeechEnd?.(); } catch { /* noop */ }
      },
      onVADMisfire: () => { /* discarded — too short to count */ },
    });
    vadInstance = instance;
    return instance;
  })().catch((e) => {
    vadLoading = null;
    initFailedUntil = Date.now() + 30 * 60 * 1000;
    throw e;
  });

  try {
    const inst = await vadLoading;
    vadLoading = null;
    return inst;
  } catch (e) {
    console.warn("[vad] init failed:", e instanceof Error ? e.message : e);
    return null;
  }
}

/**
 * Start barge-in monitoring. Returns true once the VAD is listening.
 * Safe to call multiple times — re-uses the existing instance.
 */
export async function enableBargeIn(opts: BargeInOpts = {}): Promise<boolean> {
  if (!isBargeInEnabled()) return false;
  if (Date.now() < initFailedUntil) return false;
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    return false;
  }
  try {
    const inst = await loadVAD(opts);
    if (!inst) return false;
    if (!active) {
      inst.start();
      active = true;
    }
    return true;
  } catch {
    return false;
  }
}

/** Stop barge-in monitoring; releases mic frames + suspends audio worklet. */
export async function disableBargeIn(): Promise<void> {
  if (!vadInstance) { active = false; return; }
  try {
    // Newer versions expose .pause() (cheap); older only .destroy()
    if (typeof vadInstance.pause === "function") {
      vadInstance.pause();
    } else if (typeof vadInstance.destroy === "function") {
      vadInstance.destroy();
      vadInstance = null;
    }
  } catch { /* noop */ }
  active = false;
}

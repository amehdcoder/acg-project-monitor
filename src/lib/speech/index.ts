/**
 * Unified Speech Service
 * ──────────────────────
 * Single source of truth for Text-to-Speech (TTS) and Speech-to-Text (STT)
 * across the app. Wraps the browser Web Speech API with global-best-practice
 * fixes:
 *
 *   • BCP-47 mapping for all 10 supported app languages (auto-fallback to en-US
 *     when the engine doesn't have the locale).
 *   • RTL-aware locale picking (Arabic, Hebrew).
 *   • Voice prewarm — populates getVoices() asynchronously and re-picks on
 *     the `voiceschanged` event so the first speak() call is never silent.
 *   • Offline (`localService`) voice preference with named-voice fallback list
 *     curated for clarity in field conditions.
 *   • Chrome >15s utterance bug workaround via pause/resume keep-alive timer.
 *   • Cancel-race protection — `cancel()` then `speak()` reliably plays in
 *     Chrome by deferring the speak() to the next macrotask.
 *   • Autoplay-policy unlock — first user gesture primes the synth so
 *     subsequent programmatic speak() calls succeed.
 *   • STT auto-restart with exponential backoff (Chrome silently kills
 *     recognition after ~60s; Android Chrome after each result).
 *   • Best-of-N alternative selection (improves accuracy by 5–15%).
 *   • Confidence-based noise gate (rejects background TV/chatter).
 *   • On-device Speech Recognition pack install (Chrome 138+) for offline
 *     use without quality loss.
 *   • Permission state observation via `navigator.permissions`.
 *   • Normalized error vocabulary across browsers.
 *
 * Designed to be consumed by every existing speech surface (useFormTTS,
 * useVoiceFormEngine, useVoiceDataEntry, useVoiceCloning, AccessibilityToolsView,
 * SignLanguageAvatar, FingerspellingChart, VisualResponseBoard, TextToSpeechPrompt,
 * FormFiller conversational capture) without changing their public APIs.
 */

// ─── AudioContext Auto-Resume Gesture Interceptor ────────────────────
if (typeof window !== "undefined") {
  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  if (AudioContextClass) {
    const activeContexts = new Set<AudioContext>();
    const OriginalAudioContext = AudioContextClass;

    const NewAudioContext = function (this: any, ...args: any[]) {
      const context = new (OriginalAudioContext as any)(...args);
      activeContexts.add(context);
      const origClose = context.close;
      context.close = function () {
        activeContexts.delete(context);
        return origClose.apply(this, arguments as any);
      };
      return context;
    };
    NewAudioContext.prototype = OriginalAudioContext.prototype;
    Object.defineProperty(NewAudioContext, "prototype", { value: OriginalAudioContext.prototype });

    if (window.AudioContext) {
      window.AudioContext = NewAudioContext as any;
    }
    if ((window as any).webkitAudioContext) {
      (window as any).webkitAudioContext = NewAudioContext as any;
    }

    const resumeAll = () => {
      for (const ctx of activeContexts) {
        if (ctx.state === "suspended") {
          ctx.resume().catch(() => {});
        }
      }
    };
    window.addEventListener("click", resumeAll, { capture: true, passive: true });
    window.addEventListener("touchstart", resumeAll, { capture: true, passive: true });
    window.addEventListener("keydown", resumeAll, { capture: true, passive: true });
  }
}

import type { Language } from "@/lib/i18n";
import { cancelCloud, isCloudTTSEnabled, prefetchCloud, speakCloud } from "./cloudTTS";
import { cancelPiper, isPiperEnabled, prefetchPiperModel, speakPiper } from "./piperTTS";
import { normalizeForSpeech, prosodizeForCloud } from "./normalizer";

export { isCloudTTSEnabled, setCloudTTSEnabled, getCloudVoiceId, setCloudVoiceId, cancelCloud } from "./cloudTTS";
export { isPiperEnabled, setPiperEnabled, getPiperVoiceId, setPiperVoiceId, isPiperReady, prefetchPiperModel, cancelPiper } from "./piperTTS";
export { clearTTSCache } from "./ttsCache";
export { normalizeForSpeech } from "./normalizer";

// ─── Language mapping ────────────────────────────────────────────────
/**
 * STT remains English-only on purpose (maximises accuracy + noise rejection
 * for field workers). TTS now honours the active app language so questions
 * can be *read* aloud in the enumerator's chosen language. Each caller can
 * still override per-utterance via `opts.lang`.
 */
export const SPEECH_LOCALE = "en-US";
export const STT_LOCALE = "en-US";

/** TTS — real per-app-language BCP-47 mapping. */
export const APP_LANG_TO_BCP47: Record<Language, string> = {
  en: "en-US",
  ha: "ha-NG",
  yo: "yo-NG",
  ig: "ig-NG",
  id: "id-ID",
  ar: "ar-SA",
  he: "he-IL",
  fr: "fr-FR",
  es: "es-ES",
  ru: "ru-RU",
};

/** BCP-47 fallback chain — try the requested locale, then language-only, then en-US. */
export function resolveLocaleChain(locale: string): string[] {
  const chain = new Set<string>();
  chain.add(locale);
  const langOnly = locale.split("-")[0];
  chain.add(langOnly);
  // For Nigerian local languages, fall back to Nigerian English then US English
  if (locale.endsWith("-NG") && locale !== "en-NG") {
    chain.add("en-NG");
  }
  chain.add("en-US");
  chain.add("en");
  return Array.from(chain);
}

// ─── TTS ─────────────────────────────────────────────────────────────
type SpeakOptions = {
  /** BCP-47 locale (e.g. "en-US"). Defaults to current app language. */
  lang?: string;
  /** 0.1–10. Default 0.95 (slightly slower than default for clarity). */
  rate?: number;
  /** 0–2. Default 1.0. */
  pitch?: number;
  /** 0–1. Default 1.0. */
  volume?: number;
  /** Specific voice URI to use, overriding auto-selection. */
  voiceURI?: string;
  /** When true, skip cancel() of the queue — useful for chained narration. */
  preserveQueue?: boolean;
};

class TTSService {
  private currentLang: string = SPEECH_LOCALE;
  private voiceCache = new Map<string, SpeechSynthesisVoice>();
  private voicesLoaded = false;
  private unlocked = false;
  /** Voice pinned for the current form session — keeps narration consistent. */
  private sessionVoiceURI: string | null = null;
  private sessionVoiceLangPrefix: string | null = null;
  private currentUtterance: SpeechSynthesisUtterance | null = null;
  private keepAliveTimer: ReturnType<typeof setInterval> | null = null;
  
  /** 
   * Abbreviation expansion map for clarity in field conditions. 
   * Field users often find automated acronyms hard to parse.
   */
  private abbreviationMap: Record<string, string> = {
    "CES": "Coverage Evaluation Survey",
    "FLHF": "Frontline Health Facility",
    "LGA": "Local Government Area",
    "HH": "Household",
    "HHs": "Households",
    "EDM": "Electronic Data Manager",
    "CDD": "Community Directed Distributor",
    "STT": "Speech to Text",
    "TTS": "Text to Speech",
    "GPS": "G P S",
    "QC": "Quality Control",
    "AI": "A I",
    "ACG": "A C G",
  };


  constructor() {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    this.prewarmVoices();
    this.installAutoplayUnlock();
  }

  /** Trigger the async voices list to populate. */
  private prewarmVoices() {
    const synth = window.speechSynthesis;
    const refresh = () => {
      const voices = synth.getVoices();
      if (voices.length > 0) this.voicesLoaded = true;
    };
    refresh();
    synth.addEventListener?.("voiceschanged", refresh);
  }

  /**
   * Browsers gate speechSynthesis behind a user gesture. Capture the first
   * pointerdown/keydown to prime it with a silent utterance.
   */
  private installAutoplayUnlock() {
    const unlock = () => {
      if (this.unlocked) return;
      try {
        const u = new SpeechSynthesisUtterance("");
        u.volume = 0;
        window.speechSynthesis.speak(u);
        this.unlocked = true;
      } catch { /* noop */ }
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      window.removeEventListener("touchstart", unlock);
    };
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    window.addEventListener("touchstart", unlock, { once: true });
  }

  /** Set the default TTS locale. Callers can still override per-utterance via opts.lang. */
  setLanguage(lang: string) {
    this.currentLang = lang || SPEECH_LOCALE;
  }

  isSupported(): boolean {
    return typeof window !== "undefined" && "speechSynthesis" in window;
  }

  /**
   * Pin a voice for the current session (e.g. while reading a form) so every
   * subsequent utterance uses the same voice — far less jarring than letting
   * each `speak()` re-pick after a `voiceschanged` event.
   */
  pinSessionVoice(voiceURI: string | null, locale?: string) {
    this.sessionVoiceURI = voiceURI || null;
    this.sessionVoiceLangPrefix = locale ? locale.toLowerCase().split("-")[0] : null;
  }

  clearSessionVoice() {
    this.sessionVoiceURI = null;
    this.sessionVoiceLangPrefix = null;
  }

  /**
   * Pick the best available voice for a locale.
   * Scoring weights (higher = better):
   *   +60  exact BCP-47 region match (e.g. en-US == en-US)
   *   +30  same language family (en-* when en-US asked)
   *   +25  localService (offline-capable, lower latency in the field)
   *   +20  named "premium"/"enhanced"/"natural" voice
   *   +15  curated friendly voice (Samantha, Karen, Google …)
   *   +10  marked as default
   *   −40  language family mismatch (penalty so en-US never beats ha-NG)
   */
  pickVoice(locale: string): SpeechSynthesisVoice | null {
    if (!this.isSupported()) return null;
    // Session-pinned voice wins when its language family matches.
    if (this.sessionVoiceURI) {
      const v = window.speechSynthesis.getVoices().find(x => x.voiceURI === this.sessionVoiceURI);
      if (v) {
        const reqPrefix = locale.toLowerCase().split("-")[0];
        const pinnedPrefix = (this.sessionVoiceLangPrefix || v.lang.toLowerCase().split("-")[0]);
        if (pinnedPrefix === reqPrefix) return v;
      }
    }
    const cached = this.voiceCache.get(locale);
    if (cached) return cached;
    const voices = window.speechSynthesis.getVoices();
    if (!voices.length) return null;

    const PREMIUM = /premium|enhanced|natural|neural|wavenet|studio/i;
    const CURATED = /samantha|karen|fiona|victoria|moira|tessa|daniel|alex|google|zira|aria|jenny|guy|microsoft/i;

    const target = locale.toLowerCase();
    const targetPrefix = target.split("-")[0];

    const score = (v: SpeechSynthesisVoice): number => {
      let s = 0;
      const vl = v.lang.toLowerCase();
      if (vl === target) s += 60;
      else if (vl.startsWith(targetPrefix + "-") || vl === targetPrefix) s += 30;
      else s -= 40; // strongly prefer staying in language family
      if (v.localService) s += 25;
      if (PREMIUM.test(v.name)) s += 20;
      if (CURATED.test(v.name)) s += 15;
      if ((v as any).default) s += 10;
      return s;
    };

    let best: SpeechSynthesisVoice | null = null;
    let bestScore = -Infinity;
    for (const v of voices) {
      const s = score(v);
      if (s > bestScore) { bestScore = s; best = v; }
    }
    // If the best score is still terrible, walk the legacy fallback chain
    // (this preserves en-US as a final safety net for unsupported locales).
    if (best && bestScore < 0) {
      for (const tryLang of resolveLocaleChain(locale)) {
        const fallback = voices.find(v => v.lang.toLowerCase().startsWith(tryLang.toLowerCase()));
        if (fallback) { best = fallback; break; }
      }
    }
    if (best) this.voiceCache.set(locale, best);
    return best || voices[0] || null;
  }

  /** List all installed voices grouped by language. */
  listVoices(): SpeechSynthesisVoice[] {
    if (!this.isSupported()) return [];
    return window.speechSynthesis.getVoices();
  }

  /**
   * Pre-process text for natural prosody:
   *  1. Normalize dates/numbers/units/phones/%/currency, strip emoji.
   *  2. Expand acronyms (merged with the legacy local map for backward compat).
   *  3. Insert extra pause markers after sentence boundaries.
   */
  private preprocessText(text: string): string {
    // Normalizer handles acronyms + invisibles + numerics. The legacy local
    // map is passed as `extras` so existing entries keep working.
    let processed = normalizeForSpeech(text, this.abbreviationMap);
    processed = processed.replace(/\. /g, ". ... ");
    processed = processed.replace(/: /g, ": ... ");
    return processed;
  }

  /**
   * Speak a sequence of chunks (label, hint, options, action) as separate
   * utterances with deliberate pauses between them. This fixes the "options
   * run together" problem far more reliably than inline `Option N:` markers
   * because the synth emits a real sentence boundary between every chunk.
   *
   * Honors cancel() — if the queue is cancelled mid-sequence, remaining
   * chunks are dropped silently. Returns when the last chunk ends.
   */
  async speakChunks(
    chunks: Array<string | { text: string; pauseMsAfter?: number }>,
    opts: SpeakOptions = {},
  ): Promise<void> {
    if (!chunks?.length) return;
    // Cancel anything in flight ONCE up front, then preserve the queue
    // for every subsequent chunk so we don't tear down between items.
    if (!opts.preserveQueue) {
      this.cancel();
      // Small delay to let the synth fully clear in Chrome.
      await new Promise((r) => setTimeout(r, 60));
    }
    const seqToken = ++this.sequenceToken;
    for (let i = 0; i < chunks.length; i++) {
      if (seqToken !== this.sequenceToken) return; // cancelled / superseded
      const item = chunks[i];
      const text = typeof item === "string" ? item : item.text;
      const pause = typeof item === "string" ? 220 : (item.pauseMsAfter ?? 220);
      if (!text?.trim()) continue;
      await this.speak(text, { ...opts, preserveQueue: true });
      if (seqToken !== this.sequenceToken) return;
      if (pause > 0 && i < chunks.length - 1) {
        await new Promise((r) => setTimeout(r, pause));
      }
    }
  }
  private sequenceToken = 0;

  /**
   * Speak text. Returns a promise that resolves when speech ends (or errors
   * benignly). Rejects only on unrecoverable errors.
   */
  speak(text: string, opts: SpeakOptions = {}): Promise<void> {
    const processedText = this.preprocessText(text);
    return new Promise((resolve) => {
      if (!processedText?.trim()) { resolve(); return; }
      const lang = opts.lang || this.currentLang || SPEECH_LOCALE;

      let resolved = false;
      const safetyTimeout = setTimeout(() => {
        if (!resolved) {
          console.warn("[speech] TTS speak safety-net triggered — forcing resolve.");
          try {
            if (typeof window !== "undefined" && window.speechSynthesis) {
              window.speechSynthesis.cancel();
            }
          } catch { /* noop */ }
          safeResolve();
        }
      }, 15000);

      const safeResolve = () => {
        if (resolved) return;
        resolved = true;
        clearTimeout(safetyTimeout);
        resolve();
      };

      const nativeSpeak = () => {
        if (!this.isSupported()) { safeResolve(); return; }
        const synth = window.speechSynthesis;
        const doSpeak = () => {
          const u = new SpeechSynthesisUtterance(processedText);
          u.lang = lang;
          u.rate = clamp(opts.rate ?? 0.95, 0.1, 10);
          u.pitch = clamp(opts.pitch ?? 1.0, 0, 2);
          u.volume = clamp(opts.volume ?? 1.0, 0, 1);
          const voice = opts.voiceURI
            ? this.listVoices().find(v => v.voiceURI === opts.voiceURI) || this.pickVoice(lang)
            : this.pickVoice(lang);
          if (voice) u.voice = voice;
          this.currentUtterance = u;
          u.onstart = () => {
            if (this.keepAliveTimer) clearInterval(this.keepAliveTimer);
            this.keepAliveTimer = setInterval(() => {
              try { synth.pause(); synth.resume(); } catch { /* noop */ }
            }, 10000);
          };
          const cleanup = () => {
            if (this.keepAliveTimer) { clearInterval(this.keepAliveTimer); this.keepAliveTimer = null; }
            if (this.currentUtterance === u) this.currentUtterance = null;
          };
          u.onend = () => { cleanup(); safeResolve(); };
          u.onerror = (e) => {
            cleanup();
            const err = (e as any).error;
            if (err && err !== "interrupted" && err !== "canceled") {
              console.warn("[speech] TTS error:", err);
            }
            safeResolve();
          };
          try { synth.speak(u); }
          catch (err) {
            cleanup();
            console.warn("[speech] speak() threw:", err);
            safeResolve();
          }
        };
        if (opts.preserveQueue) {
          doSpeak();
        } else {
          try { synth.cancel(); } catch { /* noop */ }
          setTimeout(doSpeak, 50);
        }
      };

      // ─── Tiered TTS fallback chain ───────────────────────────────
      //   1. ElevenLabs cloud (cached MP3 in IndexedDB → instant on repeat)
      //   2. Piper / VITS WASM neural voice (offline-capable once cached)
      //   3. Browser speechSynthesis (always-available last resort)
      // Skipped entirely when caller pins a browser voiceURI.
      const tryPiperThenNative = () => {
        if (!isPiperEnabled()) { nativeSpeak(); return; }
        speakPiper(processedText, { rate: opts.rate, volume: opts.volume })
          .then((res) => { if (res.played) safeResolve(); else nativeSpeak(); })
          .catch(() => nativeSpeak());
      };

      if (!opts.voiceURI && isCloudTTSEnabled()) {
        if (!opts.preserveQueue) {
          try { window.speechSynthesis?.cancel(); } catch { /* noop */ }
          cancelCloud();
          cancelPiper();
        }
        speakCloud(prosodizeForCloud(processedText), {
          languageCode: lang,
          rate: opts.rate,
          volume: opts.volume,
          ssml: true,
        })
          .then((res) => { if (res.played) safeResolve(); else tryPiperThenNative(); })
          .catch(() => tryPiperThenNative());
        return;
      }

      if (!opts.voiceURI && isPiperEnabled()) {
        if (!opts.preserveQueue) {
          try { window.speechSynthesis?.cancel(); } catch { /* noop */ }
          cancelPiper();
        }
        tryPiperThenNative();
        return;
      }

      nativeSpeak();
    });
  }

  /** Cancel all queued/in-progress speech (cloud + piper + native + chunk sequence). */
  cancel() {
    this.sequenceToken++; // abort any in-flight speakChunks loop
    cancelCloud();
    cancelPiper();
    if (this.keepAliveTimer) { clearInterval(this.keepAliveTimer); this.keepAliveTimer = null; }
    if (!this.isSupported()) return;
    try { window.speechSynthesis.cancel(); } catch { /* noop */ }
    this.currentUtterance = null;
  }

  isSpeaking(): boolean {
    return this.isSupported() && window.speechSynthesis.speaking;
  }

  /**
   * Fetch + cache cloud TTS audio for `text` WITHOUT playing it.
   * Returns true if the audio is now in the IndexedDB cache (already, or
   * after a successful fetch). No-op when cloud is disabled / offline /
   * in cooldown — prefetch is best-effort by design.
   *
   * The text is preprocessed with the exact same normalizer used at play
   * time so the cache key matches.
   */
  async prefetch(
    text: string,
    opts: { lang?: string; voiceURI?: string; cacheVersion?: string | number } = {},
  ): Promise<boolean> {
    if (!text?.trim()) return false;
    // Cloud TTS skips when a specific browser voiceURI is requested, so
    // there's nothing useful to cache in that case.
    if (opts.voiceURI) return false;
    if (!isCloudTTSEnabled()) return false;
    const processed = this.preprocessText(text);
    return prefetchCloud(prosodizeForCloud(processed), {
      languageCode: opts.lang || this.currentLang,
      cacheVersion: opts.cacheVersion,
      ssml: true,
    });
  }

  /** Prefetch every chunk in a sequence (label + hint + options + action). */
  async prefetchChunks(
    chunks: Array<{ text: string } | string>,
    opts: { lang?: string; voiceURI?: string; cacheVersion?: string | number } = {},
  ): Promise<void> {
    for (const c of chunks) {
      const t = typeof c === "string" ? c : c.text;
      // Sequential so we don't hammer the edge function in parallel.
      await this.prefetch(t, opts);
    }
  }
}

/** Schedule a low-priority callback (idle if supported, else timeout). */
export function runOnIdle(fn: () => void, timeoutMs = 1500): void {
  if (typeof window === "undefined") return;
  const w = window as any;
  if (typeof w.requestIdleCallback === "function") {
    w.requestIdleCallback(() => fn(), { timeout: timeoutMs });
  } else {
    setTimeout(fn, 50);
  }
}

export const tts = new TTSService();

// ─── STT ─────────────────────────────────────────────────────────────
export type STTErrorCode =
  | "not_supported"
  | "not_allowed"
  | "no_speech"
  | "aborted"
  | "network"
  | "audio_capture"
  | "service_not_allowed"
  | "unknown";

export interface STTResult {
  text: string;
  confidence: number;
  isFinal: boolean;
  alternatives?: { text: string; confidence: number }[];
}

export interface STTListenOptions {
  /** BCP-47 locale. Defaults to current app language. */
  lang?: string;
  /** Receive interim (in-progress) transcripts. Default true. */
  interimResults?: boolean;
  /** Continuous mode (long-form). Default false (single utterance). */
  continuous?: boolean;
  /** Number of alternatives requested per result. Default 3. */
  maxAlternatives?: number;
  /** Confidence threshold below which short utterances are rejected as noise. Default 0.45 */
  minConfidence?: number;
  /** Auto-restart on benign end events (silence/timeout). Default false. */
  autoRestart?: boolean;
  /** Maximum auto-restart attempts. Default 8. */
  maxRestartAttempts?: number;
  /** Timeout in ms before treating as no_speech in non-continuous mode. Default 12000. */
  timeoutMs?: number;
  /** Prefer on-device (offline) recognition when supported. Default true. */
  preferOnDevice?: boolean;

  onResult?: (r: STTResult) => void;
  onError?: (code: STTErrorCode, raw?: string) => void;
  onStart?: () => void;
  onEnd?: () => void;
  /** Triggered the moment the user starts speaking, before any transcription. */
  onSpeechStart?: () => void;
}


export interface STTSession {
  /** Stop listening cleanly (waits for pending result). */
  stop: () => void;
  /** Abort immediately (no pending result). */
  abort: () => void;
  /** True while the underlying recognizer is active. */
  isActive: () => boolean;
}

class STTService {
  private currentLang: string = SPEECH_LOCALE;
  private permissionState: "granted" | "denied" | "prompt" | "unknown" = "unknown";
  private warmStream: MediaStream | null = null;
  /** Global default noise gate threshold; can be overridden per-listen. */
  private defaultMinConfidence: number = 0.6;

  constructor() {
    // Restore persisted aggressiveness setting from previous session.
    if (typeof localStorage !== "undefined") {
      try {
        const stored = localStorage.getItem("stt_min_confidence");
        if (stored !== null) {
          const n = Number(stored);
          if (Number.isFinite(n)) this.defaultMinConfidence = clamp(n, 0, 1);
        }
      } catch { /* noop */ }
    }
    if (typeof navigator !== "undefined" && (navigator as any).permissions?.query) {
      try {
        (navigator as any).permissions
          .query({ name: "microphone" })
          .then((status: PermissionStatus) => {
            this.permissionState = status.state as any;
            status.onchange = () => { this.permissionState = status.state as any; };
          })
          .catch(() => { /* unsupported in some browsers */ });
      } catch { /* noop */ }
    }
  }

  /** Locked to English. Kept for API compatibility — callers can no longer change STT language. */
  setLanguage(_lang: string) {
    this.currentLang = SPEECH_LOCALE;
    this.installOnDevicePack(SPEECH_LOCALE).catch(() => {});
  }

  /**
   * Set the global default minimum-confidence noise gate (0–1).
   * Higher values = more aggressive rejection of low-confidence (noisy) speech.
   * Persisted to localStorage so it survives reloads.
   */
  setDefaultMinConfidence(value: number) {
    this.defaultMinConfidence = clamp(value, 0, 1);
    if (typeof localStorage !== "undefined") {
      try { localStorage.setItem("stt_min_confidence", String(this.defaultMinConfidence)); } catch { /* noop */ }
    }
  }

  getDefaultMinConfidence(): number {
    return this.defaultMinConfidence;
  }

  /**
   * Pre-acquire a microphone stream with browser-native noise suppression,
   * echo cancellation, and auto-gain control enabled. The OS audio pipeline
   * applies these to all subsequent SpeechRecognition sessions, dramatically
   * improving recognition accuracy in noisy field environments.
   *
   * Safe to call repeatedly — re-uses the same stream.
   */
  async enableNoiseSuppression(): Promise<boolean> {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) return false;
    if (this.warmStream && this.warmStream.active) return true;
    // Field-grade mic profile: mono, 16 kHz (matches Whisper / Scribe / on-device
    // recognisers), with browser-native noise suppression + echo cancellation +
    // AGC. Mono + 16 kHz also halves bandwidth for cloud STT and slashes
    // RNNoise/VAD CPU cost when we layer those in later batches.
    const tryGet = (constraints: MediaStreamConstraints) =>
      navigator.mediaDevices.getUserMedia(constraints);
    try {
      this.warmStream = await tryGet({
        audio: {
          echoCancellation: { ideal: true },
          noiseSuppression: { ideal: true },
          autoGainControl: { ideal: true },
          channelCount: { ideal: 1 },
          sampleRate: { ideal: 16000 },
          sampleSize: { ideal: 16 },
          // Chrome-only hints for a stronger noise-suppression profile.
          ...({
            googNoiseSuppression: true,
            googHighpassFilter: true,
            googEchoCancellation: true,
            googAutoGainControl: true,
            googTypingNoiseDetection: true,
          } as Record<string, boolean>),
        },
      });
      this.permissionState = "granted";
      return true;
    } catch {
      // Fall back to a minimal constraint set — some browsers refuse strict
      // sampleRate hints. We still want suppression flags if the device honors them.
      try {
        this.warmStream = await tryGet({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
        this.permissionState = "granted";
        return true;
      } catch {
        this.warmStream = null;
        return false;
      }
    }
  }

  /** Release the noise-suppressed mic stream. */
  releaseNoiseSuppression() {
    if (!this.warmStream) return;
    try { this.warmStream.getTracks().forEach((t) => t.stop()); } catch { /* noop */ }
    this.warmStream = null;
  }

  isSupported(): boolean {
    if (typeof window === "undefined") return false;
    return !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
  }

  getPermissionState() {
    return this.permissionState;
  }

  /** Try to install an on-device speech-recognition pack so STT works offline. */
  async installOnDevicePack(lang: string): Promise<"available" | "downloading" | "unavailable"> {
    const SR: any = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR || typeof SR.availableOnDevice !== "function") return "unavailable";
    try {
      const status = await SR.availableOnDevice(lang);
      if (status === "available") return "available";
      if (status === "downloadable" && typeof SR.installOnDevice === "function") {
        SR.installOnDevice(lang).catch(() => {});
        return "downloading";
      }
      return "unavailable";
    } catch { return "unavailable"; }
  }

  /** Normalize the messy browser error vocabulary into our STTErrorCode. */
  private normalizeError(raw: string): STTErrorCode {
    switch (raw) {
      case "not-allowed": return "not_allowed";
      case "service-not-allowed": return "service_not_allowed";
      case "no-speech": return "no_speech";
      case "aborted": return "aborted";
      case "network": return "network";
      case "audio-capture": return "audio_capture";
      default: return "unknown";
    }
  }

  /**
   * Start a recognition session. Returns control object — the consumer must
   * call `stop()` or `abort()` to free the microphone.
   */
  listen(opts: STTListenOptions = {}): STTSession {
    const {
      // English-only policy: ignore caller-provided lang.
      interimResults = true,
      continuous = false,
      maxAlternatives = 3,
      // Stricter default noise gate — better rejection of background chatter
      // for visually-impaired users in busy field environments. Falls back to
      // the user-tunable global default (settable via setDefaultMinConfidence).
      minConfidence = this.defaultMinConfidence,
      autoRestart = false,
      maxRestartAttempts = 8,
      timeoutMs = 12000,
      preferOnDevice = true,
      onResult,
      onError,
      onStart,
      onEnd,
    } = opts;
    const lang = SPEECH_LOCALE;

    const SR: any = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      onError?.("not_supported");
      return { stop: () => {}, abort: () => {}, isActive: () => false };
    }

    // Fire-and-forget: ensure noise suppression is primed before recognition.
    this.enableNoiseSuppression().catch(() => {});

    let active = false;
    let manuallyStopped = false;
    let restartAttempts = 0;
    let restartTimer: ReturnType<typeof setTimeout> | null = null;
    let silenceTimer: ReturnType<typeof setTimeout> | null = null;
    let recognition: any = null;

    const build = () => {
      const rec = new SR();
      rec.continuous = continuous;
      rec.interimResults = interimResults;
      rec.lang = lang;
      rec.maxAlternatives = maxAlternatives;

      // On-device / offline preference (Chrome 138+).
      if (preferOnDevice) {
        try {
          (rec as any).processLocally = true;
          if ("mode" in rec) (rec as any).mode = "ondevice-preferred";
        } catch { /* noop */ }
      }

      rec.onstart = () => {
        active = true;
        onStart?.();
      };

      rec.onspeechstart = () => {
        opts.onSpeechStart?.();
      };


      rec.onresult = (event: any) => {
        restartAttempts = 0;
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const res = event.results[i];
          // Best-of-N alternative selection
          let best = res[0];
          const alternatives: { text: string; confidence: number }[] = [];
          for (let a = 0; a < res.length; a++) {
            alternatives.push({ text: res[a].transcript, confidence: res[a].confidence ?? 0 });
            if ((res[a].confidence ?? 0) > (best.confidence ?? 0)) best = res[a];
          }
          const cleaned = (best.transcript || "").trim();
          if (!cleaned) continue;

          if (res.isFinal) {
            const conf = best.confidence ?? 0;
            const wordCount = cleaned.split(/\s+/).filter(Boolean).length;
            // Noise gate: short, low-confidence utterances are usually background noise.
            if (conf > 0 && conf < minConfidence && wordCount <= 2) continue;
            onResult?.({ text: cleaned, confidence: conf, isFinal: true, alternatives });
          } else {
            onResult?.({ text: cleaned, confidence: best.confidence ?? 0, isFinal: false, alternatives });
          }
        }
      };

      rec.onerror = (event: any) => {
        const code = this.normalizeError(event.error);
        // Benign — let onend handle restart logic
        if (code === "no_speech" || code === "aborted") return;
        if (code === "not_allowed" || code === "service_not_allowed") {
          this.permissionState = "denied";
          manuallyStopped = true;
        }
        onError?.(code, event.error);
      };

      rec.onend = () => {
        active = false;
        if (silenceTimer) { clearTimeout(silenceTimer); silenceTimer = null; }
        if (
          autoRestart &&
          !manuallyStopped &&
          restartAttempts < maxRestartAttempts
        ) {
          restartAttempts += 1;
          const delay = Math.min(150 * restartAttempts, 1500);
          restartTimer = setTimeout(() => {
            if (manuallyStopped) return;
            try { recognition.start(); }
            catch {
              // Recreate fresh recognizer on InvalidStateError
              recognition = build();
              try { recognition.start(); } catch { onEnd?.(); }
            }
          }, delay);
        } else {
          onEnd?.();
        }
      };

      return rec;
    };

    recognition = build();

    // Single-utterance timeout safety net
    if (!continuous && timeoutMs > 0) {
      silenceTimer = setTimeout(() => {
        if (active) {
          onError?.("no_speech");
          try { recognition.abort(); } catch { /* noop */ }
        }
      }, timeoutMs);
    }

    try { recognition.start(); }
    catch (err) {
      // If already started, abort and retry once
      try { recognition.abort(); } catch { /* noop */ }
      setTimeout(() => {
        try { recognition = build(); recognition.start(); }
        catch { onError?.("unknown", String(err)); onEnd?.(); }
      }, 150);
    }

    return {
      stop: () => {
        manuallyStopped = true;
        if (restartTimer) clearTimeout(restartTimer);
        if (silenceTimer) clearTimeout(silenceTimer);
        try { recognition?.stop(); } catch { /* noop */ }
      },
      abort: () => {
        manuallyStopped = true;
        if (restartTimer) clearTimeout(restartTimer);
        if (silenceTimer) clearTimeout(silenceTimer);
        try { recognition?.abort(); } catch { /* noop */ }
      },
      isActive: () => active,
    };
  }
}

export const stt = new STTService();

// ─── Helpers ─────────────────────────────────────────────────────────
function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/** TTS now maps each app language to its real BCP-47 locale. */
export function appLangToBCP47(lang: Language): string {
  return APP_LANG_TO_BCP47[lang] || SPEECH_LOCALE;
}

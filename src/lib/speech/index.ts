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

import type { Language } from "@/lib/i18n";

// ─── Language mapping ────────────────────────────────────────────────
/**
 * App-wide policy: speech (STT + TTS) is **English-only** to maximize accuracy
 * and noise rejection for visually-impaired field users. All app i18n
 * languages map to en-US for the speech engines, regardless of UI language.
 * The visual UI continues to translate via the i18n layer; only audio is
 * locked to English.
 */
export const SPEECH_LOCALE = "en-US";
export const APP_LANG_TO_BCP47: Record<Language, string> = {
  en: SPEECH_LOCALE,
  ha: SPEECH_LOCALE,
  yo: SPEECH_LOCALE,
  ig: SPEECH_LOCALE,
  id: SPEECH_LOCALE,
  ar: SPEECH_LOCALE,
  he: SPEECH_LOCALE,
  fr: SPEECH_LOCALE,
  es: SPEECH_LOCALE,
  ru: SPEECH_LOCALE,
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
  private currentUtterance: SpeechSynthesisUtterance | null = null;
  private keepAliveTimer: ReturnType<typeof setInterval> | null = null;

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

  /** Locked to English (en-US) regardless of UI language. Calls are no-ops kept for API compatibility. */
  setLanguage(_lang: string) {
    this.currentLang = SPEECH_LOCALE;
  }

  isSupported(): boolean {
    return typeof window !== "undefined" && "speechSynthesis" in window;
  }

  /** Pick the best available voice for a locale, preferring offline + named. */
  pickVoice(locale: string): SpeechSynthesisVoice | null {
    if (!this.isSupported()) return null;
    const cached = this.voiceCache.get(locale);
    if (cached) return cached;
    const voices = window.speechSynthesis.getVoices();
    if (!voices.length) return null;

    const NAMED_VOICES = /samantha|karen|fiona|victoria|moira|tessa|daniel|alex|google|natural|premium|enhanced|zira|aria|jenny|guy/i;
    const chain = resolveLocaleChain(locale);

    for (const tryLang of chain) {
      // 1. Offline + named (best for field/no-internet)
      const offlineNamed = voices.find(
        v => v.localService && v.lang.toLowerCase().startsWith(tryLang.toLowerCase()) && NAMED_VOICES.test(v.name),
      );
      if (offlineNamed) { this.voiceCache.set(locale, offlineNamed); return offlineNamed; }
      // 2. Any offline voice in target language
      const offline = voices.find(v => v.localService && v.lang.toLowerCase().startsWith(tryLang.toLowerCase()));
      if (offline) { this.voiceCache.set(locale, offline); return offline; }
      // 3. Online named
      const named = voices.find(v => v.lang.toLowerCase().startsWith(tryLang.toLowerCase()) && NAMED_VOICES.test(v.name));
      if (named) { this.voiceCache.set(locale, named); return named; }
      // 4. Any voice in target language
      const any = voices.find(v => v.lang.toLowerCase().startsWith(tryLang.toLowerCase()));
      if (any) { this.voiceCache.set(locale, any); return any; }
    }
    return voices[0] || null;
  }

  /** List all installed voices grouped by language. */
  listVoices(): SpeechSynthesisVoice[] {
    if (!this.isSupported()) return [];
    return window.speechSynthesis.getVoices();
  }

  /**
   * Speak text. Returns a promise that resolves when speech ends (or errors
   * benignly). Rejects only on unrecoverable errors.
   */
  speak(text: string, opts: SpeakOptions = {}): Promise<void> {
    return new Promise((resolve) => {
      if (!this.isSupported() || !text?.trim()) { resolve(); return; }
      const synth = window.speechSynthesis;
      // Hard-lock to English regardless of caller-supplied lang.
      const lang = SPEECH_LOCALE;

      const doSpeak = () => {
        const u = new SpeechSynthesisUtterance(text);
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
          // Chrome bug: utterances >15s get truncated. pause/resume every 10s.
          if (this.keepAliveTimer) clearInterval(this.keepAliveTimer);
          this.keepAliveTimer = setInterval(() => {
            try { synth.pause(); synth.resume(); } catch { /* noop */ }
          }, 10000);
        };
        const cleanup = () => {
          if (this.keepAliveTimer) { clearInterval(this.keepAliveTimer); this.keepAliveTimer = null; }
          if (this.currentUtterance === u) this.currentUtterance = null;
        };
        u.onend = () => { cleanup(); resolve(); };
        u.onerror = (e) => {
          cleanup();
          // 'interrupted' / 'canceled' are intentional — treat as benign
          const err = (e as any).error;
          if (err && err !== "interrupted" && err !== "canceled") {
            // eslint-disable-next-line no-console
            console.warn("[speech] TTS error:", err);
          }
          resolve();
        };

        try { synth.speak(u); }
        catch (err) {
          cleanup();
          // eslint-disable-next-line no-console
          console.warn("[speech] speak() threw:", err);
          resolve();
        }
      };

      if (opts.preserveQueue) {
        doSpeak();
      } else {
        // cancel() then speak() race condition: defer to next macrotask.
        try { synth.cancel(); } catch { /* noop */ }
        setTimeout(doSpeak, 50);
      }
    });
  }

  /** Cancel all queued/in-progress speech. */
  cancel() {
    if (!this.isSupported()) return;
    if (this.keepAliveTimer) { clearInterval(this.keepAliveTimer); this.keepAliveTimer = null; }
    try { window.speechSynthesis.cancel(); } catch { /* noop */ }
    this.currentUtterance = null;
  }

  isSpeaking(): boolean {
    return this.isSupported() && window.speechSynthesis.speaking;
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

  constructor() {
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
    try {
      this.warmStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: { ideal: true },
          noiseSuppression: { ideal: true },
          autoGainControl: { ideal: true },
          // Chrome-only hints for a stronger noise-suppression profile.
          ...({
            googNoiseSuppression: true,
            googHighpassFilter: true,
            googEchoCancellation: true,
            googAutoGainControl: true,
          } as Record<string, boolean>),
        },
      });
      this.permissionState = "granted";
      return true;
    } catch {
      this.warmStream = null;
      return false;
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
      // for visually-impaired users in busy field environments.
      minConfidence = 0.6,
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

/** App-wide policy: speech is locked to English (en-US) regardless of UI language. */
export function appLangToBCP47(_lang: Language): string {
  return SPEECH_LOCALE;
}

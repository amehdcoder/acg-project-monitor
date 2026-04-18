import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

/**
 * Browser-native voice cloning using Web Audio API + Web Speech Synthesis.
 *
 * Approach (offline-friendly, no AI credits):
 * 1. Donor records 3 seconds of speech.
 * 2. We extract pitch (mean F0), formant brightness, speaking rate, and energy
 *    using FFT analysis on the raw PCM data.
 * 3. At playback, we pick the closest matching SpeechSynthesis voice and apply
 *    the donor's pitch/rate offsets so output sounds closer to them.
 *
 * This is NOT true neural cloning (XTTS-v2 needs a GPU server) — it is a
 * "voice character matching" technique that runs 100% in-browser, has no
 * per-request cost, and works offline. Quality is honest "voice-styled" TTS,
 * not photorealistic.
 */

export interface VoiceFeatures {
  meanPitch: number;         // Hz
  pitchVariance: number;
  brightness: number;        // 0-1 (spectral centroid normalised)
  speakingRate: number;      // 0-1
  energy: number;            // 0-1 RMS
  preferredVoiceURI?: string; // Best-matching system voice
  preferredLang?: string;
}

export interface ActiveVoiceProfile {
  id: string;
  donorName: string;
  donorEmail: string;
  features: VoiceFeatures;
}

const DEFAULT_FEATURES: VoiceFeatures = {
  meanPitch: 130,
  pitchVariance: 20,
  brightness: 0.5,
  speakingRate: 1.0,
  energy: 0.5,
};

/**
 * Extract voice features from a recorded audio blob using Web Audio API.
 */
export async function extractVoiceFeatures(blob: Blob): Promise<VoiceFeatures> {
  const arrayBuffer = await blob.arrayBuffer();
  const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
  const audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
  const data = audioBuffer.getChannelData(0);
  const sr = audioBuffer.sampleRate;

  // RMS energy
  let sumSq = 0;
  for (let i = 0; i < data.length; i++) sumSq += data[i] * data[i];
  const rms = Math.sqrt(sumSq / data.length);

  // Pitch via autocorrelation on overlapping frames
  const frameSize = 2048;
  const hop = 1024;
  const pitches: number[] = [];
  const minF = 75, maxF = 400;
  const minLag = Math.floor(sr / maxF);
  const maxLag = Math.floor(sr / minF);

  for (let start = 0; start + frameSize < data.length; start += hop) {
    const frame = data.slice(start, start + frameSize);
    let bestLag = -1, bestCorr = 0;
    for (let lag = minLag; lag <= maxLag; lag++) {
      let corr = 0;
      for (let i = 0; i < frameSize - lag; i++) corr += frame[i] * frame[i + lag];
      if (corr > bestCorr) { bestCorr = corr; bestLag = lag; }
    }
    if (bestLag > 0 && bestCorr > 0.3 * frameSize * rms * rms) {
      pitches.push(sr / bestLag);
    }
  }

  const meanPitch = pitches.length ? pitches.reduce((a, b) => a + b, 0) / pitches.length : DEFAULT_FEATURES.meanPitch;
  const pitchVariance = pitches.length
    ? Math.sqrt(pitches.reduce((s, p) => s + (p - meanPitch) ** 2, 0) / pitches.length)
    : DEFAULT_FEATURES.pitchVariance;

  // Spectral brightness via simple FFT (using OfflineAudioContext)
  let brightness = 0.5;
  try {
    const offline = new OfflineAudioContext(1, audioBuffer.length, sr);
    const src = offline.createBufferSource();
    src.buffer = audioBuffer;
    const analyser = offline.createAnalyser();
    analyser.fftSize = 2048;
    src.connect(analyser);
    src.connect(offline.destination);
    src.start();
    await offline.startRendering();
    const freq = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(freq);
    let weighted = 0, total = 0;
    for (let i = 0; i < freq.length; i++) { weighted += i * freq[i]; total += freq[i]; }
    if (total > 0) brightness = Math.min(1, (weighted / total) / freq.length);
  } catch { /* leave default */ }

  // Speaking rate proxy: count zero-crossings as voiced-frame indicator
  let zc = 0;
  for (let i = 1; i < data.length; i++) if ((data[i - 1] >= 0) !== (data[i] >= 0)) zc++;
  const speakingRate = Math.min(1.5, Math.max(0.7, (zc / data.length) * 100));

  ctx.close();

  // Pick closest system voice
  const voices = window.speechSynthesis?.getVoices?.() || [];
  // Heuristic: < 165 Hz mean pitch → male voice, ≥ 165 Hz → female
  const wantsFemale = meanPitch >= 165;
  const enVoices = voices.filter(v => v.lang.startsWith("en"));
  const matched = enVoices.find(v => {
    const n = v.name.toLowerCase();
    return wantsFemale
      ? /female|woman|samantha|victoria|karen|moira|tessa|fiona|zira/.test(n)
      : /male|man|daniel|alex|fred|david|mark|george/.test(n);
  }) || enVoices[0] || voices[0];

  return {
    meanPitch,
    pitchVariance,
    brightness: Math.max(0, Math.min(1, brightness)),
    speakingRate,
    energy: Math.min(1, rms * 5),
    preferredVoiceURI: matched?.voiceURI,
    preferredLang: matched?.lang || "en-US",
  };
}

/**
 * Speak text using the active cloned voice profile (or system default if none).
 */
export function speakWithProfile(
  text: string,
  profile: ActiveVoiceProfile | null,
  onEnd?: () => void
): void {
  const synth = window.speechSynthesis;
  if (!synth) { onEnd?.(); return; }
  synth.cancel();

  const utt = new SpeechSynthesisUtterance(text);

  if (profile) {
    const f = profile.features;
    // Map mean pitch (Hz) to SpeechSynthesis pitch [0..2]; baseline 130 Hz -> 1.0
    utt.pitch = Math.max(0.4, Math.min(2.0, f.meanPitch / 130));
    utt.rate = Math.max(0.7, Math.min(1.4, f.speakingRate));
    utt.volume = Math.max(0.6, Math.min(1.0, 0.6 + f.energy * 0.4));
    utt.lang = f.preferredLang || "en-US";
    const voices = synth.getVoices();
    const v = voices.find(v => v.voiceURI === f.preferredVoiceURI)
      || voices.find(v => v.lang.startsWith((f.preferredLang || "en").slice(0, 2)));
    if (v) utt.voice = v;
  } else {
    utt.rate = 0.95;
    utt.pitch = 1;
    utt.lang = "en-US";
  }

  utt.onend = () => onEnd?.();
  utt.onerror = (e) => { if ((e as any).error !== "interrupted") onEnd?.(); };
  synth.speak(utt);
}

/**
 * Hook to fetch + cache the currently active cloned voice profile.
 */
export function useActiveVoiceProfile() {
  const [profile, setProfile] = useState<ActiveVoiceProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchActive = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("voice_profiles" as any)
        .select("id, donor_name, donor_email, voice_features, consent_status, is_active")
        .eq("is_active", true)
        .eq("consent_status", "approved")
        .maybeSingle();
      if (error || !data) { setProfile(null); return; }
      const row = data as any;
      const features = (row.voice_features as VoiceFeatures) || DEFAULT_FEATURES;
      setProfile({
        id: row.id,
        donorName: row.donor_name,
        donorEmail: row.donor_email,
        features,
      });
    } catch {
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchActive(); }, [fetchActive]);

  // Realtime updates if owner changes the active voice
  useEffect(() => {
    const ch = supabase
      .channel("voice-profiles-active")
      .on("postgres_changes", { event: "*", schema: "public", table: "voice_profiles" }, () => {
        fetchActive();
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [fetchActive]);

  return { profile, loading, refetch: fetchActive };
}

/**
 * Hook for recording a 3-second voice sample (used by the donor).
 */
export function useVoiceRecorder(maxSeconds = 3) {
  const [isRecording, setIsRecording] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(maxSeconds);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const resolveRef = useRef<((b: Blob) => void) | null>(null);

  const record = useCallback(async (): Promise<Blob> => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 16000 },
    });
    chunksRef.current = [];
    const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
    recorderRef.current = recorder;

    return new Promise<Blob>((resolve, reject) => {
      resolveRef.current = resolve;
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        if (intervalRef.current) clearInterval(intervalRef.current);
        setIsRecording(false);
        setSecondsLeft(maxSeconds);
        if (blob.size === 0) reject(new Error("No audio captured"));
        else resolve(blob);
      };
      recorder.onerror = (e) => reject(e);

      recorder.start();
      setIsRecording(true);
      setSecondsLeft(maxSeconds);
      let remaining = maxSeconds;
      intervalRef.current = setInterval(() => {
        remaining -= 1;
        setSecondsLeft(remaining);
        if (remaining <= 0) {
          if (recorderRef.current?.state === "recording") recorderRef.current.stop();
        }
      }, 1000);
    });
  }, [maxSeconds]);

  const cancel = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (recorderRef.current?.state === "recording") {
      try { recorderRef.current.stop(); } catch { /* noop */ }
    }
    setIsRecording(false);
    setSecondsLeft(maxSeconds);
  }, [maxSeconds]);

  return { isRecording, secondsLeft, record, cancel };
}

/**
 * Submit donor consent + their recorded sample.
 */
export async function submitVoiceConsent(profileId: string, blob: Blob, userId: string) {
  const features = await extractVoiceFeatures(blob);

  const path = `${userId}/${profileId}_${Date.now()}.webm`;
  const { error: upErr } = await supabase.storage
    .from("voice-samples")
    .upload(path, blob, { contentType: "audio/webm", upsert: true });
  if (upErr) throw upErr;

  const { error } = await supabase
    .from("voice_profiles" as any)
    .update({
      consent_status: "approved",
      consent_at: new Date().toISOString(),
      consent_text: "I consent to my voice being used as a TTS voice within this application.",
      sample_path: path,
      sample_duration_ms: 3000,
      voice_features: features as any,
    })
    .eq("id", profileId);
  if (error) throw error;

  toast({ title: "Voice enrolled", description: "Your voice is ready to use." });
}

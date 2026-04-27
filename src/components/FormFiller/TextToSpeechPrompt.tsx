import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Volume2, Check, X, Mic } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface TextToSpeechPromptProps {
  formName: string;
  onConfirm: (enabled: boolean) => void;
}

/**
 * TTS Enable/Disable prompt — fully voice-driven.
 *
 * Upgrades vs. v1:
 *  • Continuous listening with auto-restart (no "Tap to retry voice" needed).
 *  • Closest-speaker gating via Web Audio RMS analyser: only transcripts that
 *    coincide with a near-mic loudness spike (above an adaptive ambient floor)
 *    are accepted. Distant voices / TV / radio are ignored.
 *  • Best-of-N alternative selection + confidence floor (>= 0.55) to filter
 *    background chatter that the engine still tries to transcribe.
 *  • Strict word-boundary yes/no regex (no false positives like "no problem"
 *    being flipped to "yes" or "yesterday" matching "yes").
 *  • Browser audio constraints: echoCancellation + noiseSuppression +
 *    autoGainControl (+ Chrome goog* hints) for cleaner input.
 *  • English-only (en-US) for maximum recognition accuracy.
 */
const TextToSpeechPrompt = ({ formName, onConfirm }: TextToSpeechPromptProps) => {
  const [isListening, setIsListening] = useState(false);
  const [verbalResponse, setVerbalResponse] = useState<string | null>(null);
  const [interimText, setInterimText] = useState<string>("");
  const [micLevel, setMicLevel] = useState(0); // 0..1 for visual feedback

  const recognitionRef = useRef<any>(null);
  const onConfirmRef = useRef(onConfirm);
  onConfirmRef.current = onConfirm;

  // Closest-speaker (proximity) detection state
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const ambientFloorRef = useRef<number>(0.02); // adaptive noise floor (RMS)
  const peakWhileSpeakingRef = useRef<number>(0); // max RMS during the current utterance
  const decidedRef = useRef(false);
  const restartTimerRef = useRef<number | null>(null);
  const shouldKeepListeningRef = useRef(true);

  const synth = window.speechSynthesis;

  // ─── Web Audio: continuous loudness sampling for proximity gate ─────
  const startLoudnessMonitor = useCallback(async () => {
    try {
      if (streamRef.current) return; // already monitoring
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: { ideal: true },
          noiseSuppression: { ideal: true },
          autoGainControl: { ideal: true },
          // Chrome-specific stronger noise profile
          // @ts-expect-error non-standard
          googNoiseSuppression: true,
          // @ts-expect-error non-standard
          googHighpassFilter: true,
          // @ts-expect-error non-standard
          googEchoCancellation: true,
        } as MediaTrackConstraints,
      });
      streamRef.current = stream;

      const Ctx = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext;
      const ctx = new Ctx();
      audioCtxRef.current = ctx;
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.6;
      src.connect(analyser);
      analyserRef.current = analyser;

      const buf = new Float32Array(analyser.fftSize);

      // Calibrate ambient floor over the first ~600ms of "no speech"
      const calibrationStart = performance.now();
      let calibSamples: number[] = [];

      const tick = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getFloatTimeDomainData(buf);
        // RMS
        let sum = 0;
        for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
        const rms = Math.sqrt(sum / buf.length); // 0..~1

        // Calibrate ambient during first 600ms
        if (performance.now() - calibrationStart < 600) {
          calibSamples.push(rms);
        } else if (calibSamples.length) {
          calibSamples.sort((a, b) => a - b);
          // Use 75th percentile as ambient floor + small headroom
          const p75 = calibSamples[Math.floor(calibSamples.length * 0.75)] || 0.01;
          ambientFloorRef.current = Math.max(0.012, p75 + 0.005);
          calibSamples = [];
        } else {
          // Slowly adapt the floor downward (in case room got quieter)
          ambientFloorRef.current = ambientFloorRef.current * 0.995 + Math.min(rms, ambientFloorRef.current) * 0.005;
        }

        // Track peak loudness during the current utterance window
        if (rms > peakWhileSpeakingRef.current) peakWhileSpeakingRef.current = rms;

        setMicLevel(Math.min(1, rms * 6));
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch (err) {
      console.warn("[TTS prompt] Loudness monitor unavailable:", err);
    }
  }, []);

  const stopLoudnessMonitor = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    analyserRef.current = null;
    try { audioCtxRef.current?.close(); } catch { /* noop */ }
    audioCtxRef.current = null;
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  }, []);

  // ─── Speech synthesis ──────────────────────────────────────────────
  const speak = useCallback((text: string, onEnd?: () => void) => {
    if (!synth) { onEnd?.(); return; }
    synth.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.9;
    utterance.pitch = 1;
    utterance.lang = "en-US";
    const voices = synth.getVoices();
    const localVoice = voices.find(v => v.localService && v.lang.startsWith("en"))
      || voices.find(v => v.lang.startsWith("en"));
    if (localVoice) utterance.voice = localVoice;
    utterance.onend = () => onEnd?.();
    utterance.onerror = (e) => { if (e.error !== "interrupted") onEnd?.(); };
    synth.speak(utterance);
  }, [synth]);

  // ─── Strict yes/no parsing ─────────────────────────────────────────
  const YES_RE = /\b(yes|yeah|yep|yup|yes please|enable|enabled|turn it on|sure|ok|okay|okey|please do|do it|affirmative|correct)\b/;
  const NO_RE = /\b(no|nope|nah|disable|disabled|turn it off|skip|cancel|stop|don't|do not|negative)\b/;

  const finishWith = useCallback((decision: boolean) => {
    if (decidedRef.current) return;
    decidedRef.current = true;
    shouldKeepListeningRef.current = false;
    try { recognitionRef.current?.abort(); } catch { /* noop */ }
    if (restartTimerRef.current) window.clearTimeout(restartTimerRef.current);
    stopLoudnessMonitor();
    speak(
      decision ? "Text to speech has been enabled for this form." : "Text to speech will not be enabled.",
      () => onConfirmRef.current(decision),
    );
  }, [speak, stopLoudnessMonitor]);

  // ─── Speech recognition with auto-restart ──────────────────────────
  const startListening = useCallback(() => {
    if (decidedRef.current) return;
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast({ title: "Speech Not Supported", description: "Use the buttons to confirm.", variant: "destructive" });
      return;
    }
    try { recognitionRef.current?.abort(); } catch { /* noop */ }

    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;
    recognition.lang = "en-US";
    recognition.interimResults = true;
    recognition.continuous = true; // keep mic open across pauses
    recognition.maxAlternatives = 5;

    // Reset utterance peak whenever a fresh result arrives so the proximity
    // gate evaluates loudness *during* this phrase, not historical noise.
    let lastResultIndex = -1;

    recognition.onresult = (event: any) => {
      let interim = "";
      let final = "";
      let bestConfidence = 0;

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i];
        if (i !== lastResultIndex) {
          // New utterance window → reset peak
          peakWhileSpeakingRef.current = 0;
          lastResultIndex = i;
        }
        // Best-of-N alternative selection
        let best = res[0];
        for (let a = 1; a < res.length; a++) {
          if ((res[a].confidence ?? 0) > (best.confidence ?? 0)) best = res[a];
        }
        if (res.isFinal) {
          final += best.transcript;
          bestConfidence = Math.max(bestConfidence, best.confidence ?? 0);
        } else {
          interim += best.transcript;
        }
      }

      if (interim) setInterimText(interim);
      if (!final) return;

      const transcript = final.toLowerCase().trim();
      setInterimText("");

      // ── Proximity gate: require speaker to be close to the mic ──
      const peak = peakWhileSpeakingRef.current;
      const floor = ambientFloorRef.current;
      // Speaker must be ~3x ambient and at least 0.06 absolute RMS
      const proximityOK = peak >= Math.max(0.06, floor * 3);
      // Confidence floor — anything below 0.55 is almost always background
      const confidenceOK = bestConfidence >= 0.55;

      if (!proximityOK || !confidenceOK) {
        // Silently ignore distant / low-confidence speech and keep listening
        console.debug("[TTS prompt] Ignored distant/low-conf speech", {
          transcript, bestConfidence, peak, floor, proximityOK, confidenceOK,
        });
        return;
      }

      setVerbalResponse(transcript);

      if (YES_RE.test(transcript)) {
        finishWith(true);
      } else if (NO_RE.test(transcript)) {
        finishWith(false);
      } else {
        // Heard a near-mic phrase but it wasn't yes/no — ask once and keep listening
        speak("I didn't catch that. Please say Yes or No.", () => {
          setVerbalResponse(null);
        });
      }
    };

    recognition.onerror = (e: any) => {
      // 'no-speech', 'audio-capture', 'aborted', 'network', 'not-allowed', etc.
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        shouldKeepListeningRef.current = false;
        toast({
          title: "Microphone blocked",
          description: "Please allow microphone access or use the buttons.",
        });
      }
      // Other errors: let onend trigger the auto-restart loop.
    };

    recognition.onend = () => {
      setIsListening(false);
      if (decidedRef.current || !shouldKeepListeningRef.current) return;
      // Auto-restart after a short delay (Chrome stops continuous mode after
      // long pauses; Android Chrome stops after every result).
      if (restartTimerRef.current) window.clearTimeout(restartTimerRef.current);
      restartTimerRef.current = window.setTimeout(() => {
        if (!decidedRef.current && shouldKeepListeningRef.current) startListening();
      }, 250);
    };

    setIsListening(true);
    try {
      recognition.start();
    } catch {
      // start() can throw if a previous instance is still finalizing — retry shortly
      setIsListening(false);
      if (restartTimerRef.current) window.clearTimeout(restartTimerRef.current);
      restartTimerRef.current = window.setTimeout(() => {
        if (!decidedRef.current && shouldKeepListeningRef.current) startListening();
      }, 300);
    }
  }, [finishWith, speak]);

  useEffect(() => {
    shouldKeepListeningRef.current = true;
    decidedRef.current = false;

    // Kick off proximity monitor in parallel with the spoken question,
    // then start continuous recognition once speech ends.
    void startLoudnessMonitor();

    const timer = setTimeout(() => {
      speak(
        `Would you like to enable text to speech for this form, ${formName}? Say Yes or No.`,
        () => startListening(),
      );
    }, 400);

    return () => {
      clearTimeout(timer);
      shouldKeepListeningRef.current = false;
      synth?.cancel();
      try { recognitionRef.current?.abort(); } catch { /* noop */ }
      if (restartTimerRef.current) window.clearTimeout(restartTimerRef.current);
      stopLoudnessMonitor();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <Card className="max-w-md w-full shadow-2xl animate-in fade-in slide-in-from-bottom-4">
        <CardContent className="p-6 space-y-5">
          {/* Header */}
          <div className="text-center space-y-2">
            <div className="mx-auto w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center">
              <Volume2 className="h-7 w-7 text-white" />
            </div>
            <h3 className="font-display text-lg font-bold text-foreground">Enable Text-to-Speech?</h3>
            <p className="text-sm text-muted-foreground">
              Would you like the form <strong>"{formName}"</strong> to be read aloud to you?
            </p>
          </div>

          {/* Verbal Listening Indicator */}
          <div className="text-center min-h-[60px] space-y-2">
            <div className="flex flex-col items-center gap-1">
              <div className="flex items-center justify-center gap-2 text-primary">
                <div className="relative">
                  <Mic className={`h-5 w-5 ${isListening ? "animate-pulse" : "opacity-60"}`} />
                  {isListening && (
                    <div className="absolute -inset-1 rounded-full bg-primary/20 animate-ping" />
                  )}
                </div>
                <span className="text-sm font-medium">
                  {isListening ? "Listening… say \"Yes\" or \"No\" near the mic" : "Preparing microphone…"}
                </span>
              </div>
              {/* Mic level meter — visual feedback that proximity gate is live */}
              <div className="w-40 h-1.5 bg-muted rounded-full overflow-hidden" aria-hidden="true">
                <div
                  className="h-full bg-primary transition-[width] duration-75"
                  style={{ width: `${Math.round(micLevel * 100)}%` }}
                />
              </div>
              {interimText && (
                <span className="text-xs text-muted-foreground italic">"{interimText}"</span>
              )}
              {verbalResponse && (
                <Badge variant="secondary" className="text-xs">
                  Heard: "{verbalResponse}"
                </Badge>
              )}
            </div>
          </div>

          {/* Visual Buttons */}
          <div className="space-y-2">
            <p className="text-center text-xs text-muted-foreground">Or tap to confirm:</p>
            <div className="grid grid-cols-2 gap-3">
              <Button
                onClick={() => finishWith(true)}
                className="h-14 gap-2 text-base bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white rounded-xl shadow-lg"
              >
                <Check className="h-5 w-5" /> Yes ✅
              </Button>
              <Button
                onClick={() => finishWith(false)}
                variant="outline"
                className="h-14 gap-2 text-base rounded-xl border-2"
              >
                <X className="h-5 w-5" /> No ❌
              </Button>
            </div>
          </div>

          <p className="text-[10px] text-center text-muted-foreground">
            Speak close to the mic — distant voices and background sounds are ignored.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default TextToSpeechPrompt;

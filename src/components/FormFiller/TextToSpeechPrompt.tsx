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

const TextToSpeechPrompt = ({ formName, onConfirm }: TextToSpeechPromptProps) => {
  const [isListening, setIsListening] = useState(false);
  const [verbalResponse, setVerbalResponse] = useState<string | null>(null);
  const [interimText, setInterimText] = useState<string>("");
  const [isAsking] = useState(true);
  const recognitionRef = useRef<any>(null);
  const onConfirmRef = useRef(onConfirm);
  onConfirmRef.current = onConfirm;
  const synth = window.speechSynthesis;

  const startListeningRef = useRef<() => void>(() => {});

  const speak = useCallback((text: string, onEnd?: () => void) => {
    if (!synth) { onEnd?.(); return; }
    synth.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.9;
    utterance.pitch = 1;
    utterance.lang = "en-US";
    // Prefer a local/offline voice for reliability in field conditions
    const voices = synth.getVoices();
    const localVoice = voices.find(v => v.localService && v.lang.startsWith("en"))
      || voices.find(v => v.lang.startsWith("en"));
    if (localVoice) utterance.voice = localVoice;
    utterance.onend = () => onEnd?.();
    utterance.onerror = (e) => { if (e.error !== "interrupted") onEnd?.(); };
    synth.speak(utterance);
  }, [synth]);

  const startListening = useCallback(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast({ title: "Speech Not Supported", description: "Use the buttons to confirm.", variant: "destructive" });
      return;
    }
    if (recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch { /* noop */ }
    }

    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;
    recognition.lang = "en-US";
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.maxAlternatives = 3;

    recognition.onresult = (event: any) => {
      let interim = "";
      let final = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i];
        // Best-of-N alternative selection
        let best = res[0];
        for (let a = 1; a < res.length; a++) {
          if ((res[a].confidence ?? 0) > (best.confidence ?? 0)) best = res[a];
        }
        if (res.isFinal) final += best.transcript;
        else interim += best.transcript;
      }
      if (interim) setInterimText(interim);
      if (!final) return;

      const transcript = final.toLowerCase().trim();
      setVerbalResponse(transcript);
      setInterimText("");
      setIsListening(false);

      if (/\b(yes|yeah|yep|enable|okay|ok|sure|please|do it)\b/.test(transcript)) {
        speak("Text to speech has been enabled for this form.", () => onConfirmRef.current(true));
      } else if (/\b(no|nope|nah|disable|skip|cancel)\b/.test(transcript)) {
        speak("Text to speech will not be enabled.", () => onConfirmRef.current(false));
      } else {
        speak("I didn't understand. Please say Yes or No.", () => {
          setVerbalResponse(null);
          // Auto re-listen
          startListeningRef.current();
        });
      }
    };

    recognition.onerror = (e: any) => {
      setIsListening(false);
      setInterimText("");
      if (e.error === "no-speech") {
        // Silently try again once
        setTimeout(() => startListeningRef.current(), 300);
      } else if (e.error !== "aborted") {
        toast({ title: "Couldn't hear you", description: "Please use the buttons." });
      }
    };

    recognition.onend = () => setIsListening(false);

    setIsListening(true);
    try { recognition.start(); } catch { setIsListening(false); }
  }, [speak]);

  startListeningRef.current = startListening;

  useEffect(() => {
    // Speak the question, then automatically start listening — no button tap required.
    // CRITICAL: SpeechRecognition.start() is called inside the synth onend callback
    // chained from a UI gesture context (the form open click).
    const timer = setTimeout(() => {
      speak(
        `Would you like to enable text to speech for this form, ${formName}? Say Yes or No.`,
        () => {
          // Auto-start listening immediately after speaking ends
          startListeningRef.current();
        }
      );
    }, 400);
    return () => {
      clearTimeout(timer);
      synth?.cancel();
      try { recognitionRef.current?.abort(); } catch { /* noop */ }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!isAsking) return null;

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
          <div className="text-center min-h-[44px]">
            {isListening ? (
              <div className="flex flex-col items-center gap-1">
                <div className="flex items-center justify-center gap-2 text-primary">
                  <div className="relative">
                    <Mic className="h-5 w-5 animate-pulse" />
                    <div className="absolute -inset-1 rounded-full bg-primary/20 animate-ping" />
                  </div>
                  <span className="text-sm font-medium">Listening… say "Yes" or "No"</span>
                </div>
                {interimText && (
                  <span className="text-xs text-muted-foreground italic">"{interimText}"</span>
                )}
              </div>
            ) : verbalResponse ? (
              <Badge variant="secondary" className="text-xs">
                Heard: "{verbalResponse}"
              </Badge>
            ) : (
              <Button variant="outline" size="sm" onClick={startListening} className="gap-2">
                <Mic className="h-4 w-4" /> Tap to retry voice
              </Button>
            )}
          </div>

          {/* Visual Buttons */}
          <div className="space-y-2">
            <p className="text-center text-xs text-muted-foreground">Or tap to confirm:</p>
            <div className="grid grid-cols-2 gap-3">
              <Button
                onClick={() => {
                  try { recognitionRef.current?.abort(); } catch { /* noop */ }
                  speak("Text to speech enabled.", () => onConfirm(true));
                }}
                className="h-14 gap-2 text-base bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white rounded-xl shadow-lg"
              >
                <Check className="h-5 w-5" /> Yes ✅
              </Button>
              <Button
                onClick={() => {
                  try { recognitionRef.current?.abort(); } catch { /* noop */ }
                  synth?.cancel();
                  onConfirm(false);
                }}
                variant="outline"
                className="h-14 gap-2 text-base rounded-xl border-2"
              >
                <X className="h-5 w-5" /> No ❌
              </Button>
            </div>
          </div>

          <p className="text-[10px] text-center text-muted-foreground">
            This assists users with visual impairments by reading questions and options aloud
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default TextToSpeechPrompt;

import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Volume2, VolumeX, Check, X, Mic, Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface TextToSpeechPromptProps {
  formName: string;
  onConfirm: (enabled: boolean) => void;
}

const TextToSpeechPrompt = ({ formName, onConfirm }: TextToSpeechPromptProps) => {
  const [isListening, setIsListening] = useState(false);
  const [verbalResponse, setVerbalResponse] = useState<string | null>(null);
  const [isAsking, setIsAsking] = useState(true);
  const recognitionRef = useRef<any>(null);
  const synth = window.speechSynthesis;

  const speak = useCallback((text: string) => {
    if (!synth) return;
    synth.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.9;
    utterance.pitch = 1;
    utterance.lang = "en-US";
    synth.speak(utterance);
  }, [synth]);

  useEffect(() => {
    // Ask the user verbally
    const timer = setTimeout(() => {
      speak(`Would you like to enable text to speech for this form, ${formName}? Say Yes or No, or tap the buttons below.`);
    }, 500);
    return () => {
      clearTimeout(timer);
      synth?.cancel();
      recognitionRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startListening = useCallback(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast({ title: "Speech Not Supported", description: "Use the buttons to confirm.", variant: "destructive" });
      return;
    }

    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 3;

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript.toLowerCase().trim();
      setVerbalResponse(transcript);
      setIsListening(false);

      if (transcript.includes("yes") || transcript.includes("yeah") || transcript.includes("enable") || transcript.includes("okay") || transcript.includes("sure")) {
        speak("Text to speech has been enabled for this form.");
        setTimeout(() => onConfirm(true), 1500);
      } else if (transcript.includes("no") || transcript.includes("nah") || transcript.includes("disable") || transcript.includes("skip")) {
        speak("Text to speech will not be enabled.");
        setTimeout(() => onConfirm(false), 1500);
      } else {
        speak("I didn't understand. Please say Yes or No, or use the buttons.");
        setVerbalResponse(null);
      }
    };

    recognition.onerror = () => {
      setIsListening(false);
      toast({ title: "Couldn't hear you", description: "Please try again or use the buttons." });
    };

    recognition.onend = () => setIsListening(false);

    setIsListening(true);
    recognition.start();
  }, [speak, onConfirm]);

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
          <div className="text-center">
            {isListening ? (
              <div className="flex items-center justify-center gap-2 text-primary">
                <div className="relative">
                  <Mic className="h-5 w-5 animate-pulse" />
                  <div className="absolute -inset-1 rounded-full bg-primary/20 animate-ping" />
                </div>
                <span className="text-sm font-medium">Listening... say "Yes" or "No"</span>
              </div>
            ) : verbalResponse ? (
              <div className="flex items-center justify-center gap-2">
                <Badge variant="secondary" className="text-xs">
                  Heard: "{verbalResponse}"
                </Badge>
              </div>
            ) : (
              <Button variant="outline" size="sm" onClick={startListening} className="gap-2">
                <Mic className="h-4 w-4" /> Speak Your Answer
              </Button>
            )}
          </div>

          {/* Visual Buttons */}
          <div className="space-y-2">
            <p className="text-center text-xs text-muted-foreground">Or tap to confirm:</p>
            <div className="grid grid-cols-2 gap-3">
              <Button
                onClick={() => {
                  speak("Text to speech enabled.");
                  onConfirm(true);
                }}
                className="h-14 gap-2 text-base bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white rounded-xl shadow-lg"
              >
                <Check className="h-5 w-5" /> Yes ✅
              </Button>
              <Button
                onClick={() => {
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

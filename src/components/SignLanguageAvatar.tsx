import { useState, useEffect, useRef, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { HandMetal, Mic, MicOff, Volume2, Play, Pause, RefreshCw, Globe, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

const SIGN_LANGUAGES = [
  { code: "asl", name: "American Sign Language" },
  { code: "bsl", name: "British Sign Language" },
  { code: "isl", name: "International Sign" },
  { code: "nsl-hausa", name: "Nigerian SL (Hausa)" },
  { code: "nsl-yoruba", name: "Nigerian SL (Yoruba)" },
  { code: "nsl-igbo", name: "Nigerian SL (Igbo)" },
];

const AVATAR_POSES = [
  "🧏", "🤟", "👋", "✋", "🖐️", "👌", "🤙", "✌️", "🤞", "🫶", "👆", "👉", "👈", "👇", "☝️",
];

interface SignFrame {
  gesture: string;
  description: string;
  duration: number;
}

const SignLanguageAvatar = () => {
  const [inputText, setInputText] = useState("");
  const [signLanguage, setSignLanguage] = useState("asl");
  const [isListening, setIsListening] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [frames, setFrames] = useState<SignFrame[]>([]);
  const [loading, setLoading] = useState(false);
  const [autoListen, setAutoListen] = useState(false);
  const recognitionRef = useRef<any>(null);
  const animationRef = useRef<number>();
  const avatarRef = useRef<HTMLDivElement>(null);

  const generateSignFrames = useCallback(async (text: string) => {
    if (!text.trim()) return;
    setLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke("analyze-media", {
        body: {
          prompt: `You are a sign language interpreter. Break down this text into individual sign language gestures for ${SIGN_LANGUAGES.find(l => l.code === signLanguage)?.name || "ASL"}. 
For each word/phrase, provide:
1. An emoji that best represents the hand gesture
2. A brief description of the signing motion
3. Duration in milliseconds (500-1500)

Text: "${text}"

Return ONLY a valid JSON array like: [{"gesture":"🤟","description":"Point index finger forward","duration":800}]
Do not include any extra text.`,
          type: "text",
        },
      });

      if (error) throw error;

      const content = data?.result || data?.analysis || "";
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        setFrames(parsed);
        setCurrentFrame(0);
      } else {
        const words = text.split(/\s+/);
        setFrames(words.map((w: string, i: number) => ({
          gesture: AVATAR_POSES[i % AVATAR_POSES.length],
          description: `Sign: ${w}`,
          duration: 800,
        })));
        setCurrentFrame(0);
      }
    } catch {
      const words = text.split(/\s+/);
      setFrames(words.map((w, i) => ({
        gesture: AVATAR_POSES[i % AVATAR_POSES.length],
        description: `Sign: ${w}`,
        duration: 800,
      })));
      setCurrentFrame(0);
    }
    setLoading(false);
  }, [signLanguage]);

  const playAnimation = useCallback(() => {
    if (frames.length === 0) return;
    setIsAnimating(true);
    let idx = 0;
    const animate = () => {
      setCurrentFrame(idx);
      if (idx < frames.length - 1) {
        idx++;
        animationRef.current = window.setTimeout(animate, frames[idx - 1]?.duration || 800) as unknown as number;
      } else {
        setIsAnimating(false);
      }
    };
    animate();
  }, [frames]);

  const stopAnimation = () => {
    setIsAnimating(false);
    if (animationRef.current) clearTimeout(animationRef.current);
  };

  const toggleListening = () => {
    if (!("webkitSpeechRecognition" in window || "SpeechRecognition" in window)) {
      toast({ title: "Not Supported", description: "Speech recognition not available in this browser.", variant: "destructive" });
      return;
    }
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onresult = (e: any) => {
      let transcript = "";
      for (let i = 0; i < e.results.length; i++) transcript += e.results[i][0].transcript;
      setInputText(transcript);
    };
    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => { setIsListening(false); if (autoListen) generateSignFrames(inputText); };
    recognition.start();
    recognitionRef.current = recognition;
    setIsListening(true);
  };

  useEffect(() => () => { recognitionRef.current?.stop(); stopAnimation(); }, []);

  return (
    <div className="space-y-4 p-2 sm:p-4 lg:p-6 max-w-[900px] mx-auto">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-xl bg-gradient-to-br from-primary/20 to-accent/20">
          <HandMetal className="h-7 w-7 text-primary" />
        </div>
        <div>
          <h1 className="font-display text-xl sm:text-2xl font-bold text-foreground">Sign Language Avatar</h1>
          <p className="text-sm text-muted-foreground">Real-time sign language interpretation for hearing-impaired users</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Avatar Display */}
        <Card className="border-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Avatar Interpreter</CardTitle>
          </CardHeader>
          <CardContent>
            <div ref={avatarRef} className="relative mx-auto w-48 h-48 rounded-2xl bg-gradient-to-br from-primary/10 via-accent/10 to-secondary/10 flex items-center justify-center mb-4 overflow-hidden border-2 border-primary/20">
              {/* Avatar body */}
              <div className="relative flex flex-col items-center">
                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-amber-200 to-amber-300 dark:from-amber-600 dark:to-amber-700 flex items-center justify-center mb-1">
                  <span className="text-2xl">😊</span>
                </div>
                <div className="w-20 h-16 rounded-t-2xl bg-gradient-to-b from-primary/30 to-primary/50 flex items-center justify-center relative">
                  <span className={`text-4xl transition-all duration-300 ${isAnimating ? "animate-bounce" : ""}`}>
                    {frames.length > 0 ? frames[currentFrame]?.gesture || "🧏" : "🧏"}
                  </span>
                </div>
              </div>
              {isAnimating && (
                <div className="absolute inset-0 rounded-2xl ring-2 ring-primary/40 animate-pulse pointer-events-none" />
              )}
            </div>

            {frames.length > 0 && (
              <div className="text-center space-y-2">
                <Badge variant="outline" className="text-xs">
                  {currentFrame + 1} / {frames.length}
                </Badge>
                <p className="text-sm text-foreground font-medium">{frames[currentFrame]?.description}</p>
                <div className="flex justify-center gap-2">
                  <Button size="sm" variant="outline" onClick={isAnimating ? stopAnimation : playAnimation} className="gap-1">
                    {isAnimating ? <><Pause className="h-3 w-3" /> Pause</> : <><Play className="h-3 w-3" /> Play</>}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => { setCurrentFrame(0); stopAnimation(); }}><RefreshCw className="h-3 w-3" /></Button>
                </div>
              </div>
            )}

            {frames.length === 0 && !loading && (
              <p className="text-center text-sm text-muted-foreground">Enter text or speak to see sign language interpretation</p>
            )}
            {loading && (
              <div className="text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto text-primary" /><p className="text-xs text-muted-foreground mt-1">Generating signs...</p></div>
            )}
          </CardContent>
        </Card>

        {/* Controls */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Globe className="h-4 w-4" /> Language & Input</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="text-xs">Sign Language</Label>
                <Select value={signLanguage} onValueChange={setSignLanguage}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{SIGN_LANGUAGES.map(l => <SelectItem key={l.code} value={l.code}>{l.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs">Text to Interpret</Label>
                <Textarea placeholder="Type or speak what you want to sign..." value={inputText} onChange={e => setInputText(e.target.value)} className="min-h-[80px]" />
              </div>

              <div className="flex gap-2">
                <Button onClick={() => generateSignFrames(inputText)} disabled={loading || !inputText.trim()} className="flex-1 gap-1">
                  <HandMetal className="h-4 w-4" /> Interpret
                </Button>
                <Button variant={isListening ? "destructive" : "outline"} onClick={toggleListening} className="gap-1">
                  {isListening ? <><MicOff className="h-4 w-4" /> Stop</> : <><Mic className="h-4 w-4" /> Speak</>}
                </Button>
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="auto-listen" className="text-xs">Auto-interpret after speech</Label>
                <Switch id="auto-listen" checked={autoListen} onCheckedChange={setAutoListen} />
              </div>
            </CardContent>
          </Card>

          {frames.length > 0 && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Sign Sequence</CardTitle></CardHeader>
              <CardContent>
                <ScrollArea className="max-h-[200px]">
                  <div className="space-y-1">
                    {frames.map((f, i) => (
                      <button key={i} onClick={() => { stopAnimation(); setCurrentFrame(i); }}
                        className={`w-full flex items-center gap-2 p-2 rounded-md text-left transition text-sm ${i === currentFrame ? "bg-primary/10 border border-primary/30" : "hover:bg-muted"}`}>
                        <span className="text-lg">{f.gesture}</span>
                        <span className="text-xs flex-1 truncate">{f.description}</span>
                        <span className="text-[10px] text-muted-foreground">{f.duration}ms</span>
                      </button>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};

export default SignLanguageAvatar;

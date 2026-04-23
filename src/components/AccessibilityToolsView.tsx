import { useState, useEffect, useCallback, useRef } from "react";
import { stt, type STTSession } from "@/lib/speech";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "@/hooks/use-toast";
import { useSpatialAudio } from "@/hooks/useSpatialAudio";
import {
  Accessibility, Volume2, VolumeX, Eye, Ear, Hand, Brain, Type,
  Smartphone, CheckCircle, AlertTriangle, Mic, BookOpen, Vibrate,
  ScanLine, Play, Pause, ZoomIn, ZoomOut, MousePointerClick,
} from "lucide-react";

interface AccessibilityPrefs {
  autoFontSize: boolean;
  audioCues: boolean;
  audioDescriptions: boolean;
  readingMode: boolean;
  spellCheck: boolean;
  autoComplete: boolean;
  reducedMotion: boolean;
  largeClickTargets: boolean;
  stickyKeys: boolean;
  voiceAssistant: boolean;
  sonification: boolean;
  hapticFeedback: boolean;
  gestureSimplification: boolean;
  audioCueVolume: number;
}

const DEFAULT_PREFS: AccessibilityPrefs = {
  autoFontSize: false,
  audioCues: true,
  audioDescriptions: false,
  readingMode: false,
  spellCheck: true,
  autoComplete: true,
  reducedMotion: false,
  largeClickTargets: false,
  stickyKeys: false,
  voiceAssistant: false,
  sonification: false,
  hapticFeedback: true,
  gestureSimplification: false,
  audioCueVolume: 50,
};

interface A11yIssue {
  severity: "critical" | "warning" | "info";
  element: string;
  message: string;
  fix: string;
}

const AccessibilityToolsView = () => {
  const [prefs, setPrefs] = useState<AccessibilityPrefs>(DEFAULT_PREFS);
  const [scanResults, setScanResults] = useState<A11yIssue[]>([]);
  const [scanning, setScanning] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const { playAlert, setVolume } = useSpatialAudio();
  const sttSessionRef = useRef<STTSession | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem("a11y_prefs");
    if (saved) {
      try { setPrefs({ ...DEFAULT_PREFS, ...JSON.parse(saved) }); } catch {}
    }
  }, []);

  const updatePref = <K extends keyof AccessibilityPrefs>(key: K, value: AccessibilityPrefs[K]) => {
    setPrefs(prev => {
      const next = { ...prev, [key]: value };
      localStorage.setItem("a11y_prefs", JSON.stringify(next));

      // Apply effects immediately
      if (key === "autoFontSize" && value === true) applyDeviceFontSize();
      if (key === "readingMode") document.documentElement.setAttribute("data-reading-mode", value ? "true" : "false");
      if (key === "reducedMotion") document.documentElement.style.setProperty("--animation-duration", value ? "0s" : "");
      if (key === "largeClickTargets") document.documentElement.setAttribute("data-large-targets", value ? "true" : "false");
      if (key === "audioCueVolume") setVolume(Number(value) / 100);
      if (key === "audioCues" && value) playAlert("info");

      return next;
    });
    toast({ title: "Preference Updated", description: `${key.replace(/([A-Z])/g, " $1")} has been ${typeof value === "boolean" ? (value ? "enabled" : "disabled") : "updated"}.` });
  };

  const applyDeviceFontSize = () => {
    const testEl = document.createElement("div");
    testEl.style.fontSize = "1rem";
    testEl.style.position = "absolute";
    testEl.style.visibility = "hidden";
    document.body.appendChild(testEl);
    const deviceFontSize = parseFloat(getComputedStyle(testEl).fontSize);
    document.body.removeChild(testEl);
    if (deviceFontSize >= 20) {
      document.documentElement.style.fontSize = "20px";
      localStorage.setItem("app_font_size", "x-large");
    } else if (deviceFontSize >= 18) {
      document.documentElement.style.fontSize = "18px";
      localStorage.setItem("app_font_size", "large");
    } else {
      document.documentElement.style.fontSize = "16px";
      localStorage.setItem("app_font_size", "medium");
    }
    toast({ title: "Font Size Adjusted", description: `Font size set to match your device preference (${Math.round(deviceFontSize)}px base).` });
  };

  const scanAccessibility = useCallback(() => {
    setScanning(true);
    const issues: A11yIssue[] = [];

    // Check images without alt
    document.querySelectorAll("img").forEach((img, i) => {
      if (!img.alt && !img.getAttribute("aria-label")) {
        issues.push({ severity: "critical", element: `img[${i}]`, message: "Image missing alt text", fix: "Add descriptive alt attribute to the image" });
      }
    });

    // Check buttons without labels
    document.querySelectorAll("button").forEach((btn, i) => {
      if (!btn.textContent?.trim() && !btn.getAttribute("aria-label")) {
        issues.push({ severity: "critical", element: `button[${i}]`, message: "Button without accessible label", fix: "Add aria-label or visible text" });
      }
    });

    // Check color contrast (basic)
    document.querySelectorAll("*").forEach(el => {
      const style = getComputedStyle(el);
      if (style.color === style.backgroundColor && style.color !== "rgba(0, 0, 0, 0)") {
        issues.push({ severity: "warning", element: el.tagName.toLowerCase(), message: "Potential color contrast issue", fix: "Ensure sufficient contrast between text and background" });
      }
    });

    // Check form inputs without labels
    document.querySelectorAll("input, textarea, select").forEach((input, i) => {
      const id = input.id;
      if (id && !document.querySelector(`label[for="${id}"]`) && !input.getAttribute("aria-label")) {
        issues.push({ severity: "warning", element: `input[${i}]`, message: "Form field without label", fix: "Associate a label element or add aria-label" });
      }
    });

    // Check heading hierarchy
    const headings = Array.from(document.querySelectorAll("h1, h2, h3, h4, h5, h6"));
    let lastLevel = 0;
    headings.forEach(h => {
      const level = parseInt(h.tagName[1]);
      if (level > lastLevel + 1 && lastLevel > 0) {
        issues.push({ severity: "info", element: h.tagName, message: `Heading level skipped (h${lastLevel} to h${level})`, fix: "Use sequential heading levels" });
      }
      lastLevel = level;
    });

    // Check focus indicators
    const interactive = document.querySelectorAll("a, button, input, select, textarea");
    if (interactive.length > 0) {
      const sample = interactive[0] as HTMLElement;
      const style = getComputedStyle(sample);
      if (style.outlineStyle === "none" && style.boxShadow === "none") {
        issues.push({ severity: "info", element: "interactive elements", message: "Focus indicators may not be visible", fix: "Ensure visible focus styles for keyboard navigation" });
      }
    }

    // Check touch target sizes on mobile
    if (window.innerWidth < 768) {
      document.querySelectorAll("button, a, [role=button]").forEach((el, i) => {
        const rect = el.getBoundingClientRect();
        if (rect.width < 44 || rect.height < 44) {
          issues.push({ severity: "warning", element: `touch-target[${i}]`, message: `Touch target too small (${Math.round(rect.width)}×${Math.round(rect.height)}px)`, fix: "Increase to at least 44×44px" });
        }
      });
    }

    setScanResults(issues.slice(0, 50));
    setScanning(false);
    if (prefs.audioCues) playAlert(issues.some(i => i.severity === "critical") ? "critical" : issues.length > 0 ? "warning" : "info");
    toast({ title: "Scan Complete", description: `Found ${issues.length} accessibility issue${issues.length !== 1 ? "s" : ""}` });
  }, [prefs.audioCues, playAlert]);

  const toggleVoiceAssistant = () => {
    if (!stt.isSupported()) {
      toast({ title: "Not Available", description: "Voice assistant requires speech recognition support.", variant: "destructive" });
      return;
    }
    if (isListening) {
      sttSessionRef.current?.abort();
      sttSessionRef.current = null;
      setIsListening(false);
      updatePref("voiceAssistant", false);
      return;
    }
    setIsListening(true);
    updatePref("voiceAssistant", true);
    sttSessionRef.current = stt.listen({
      continuous: false,
      interimResults: false,
      onResult: (r) => {
        if (!r.isFinal) return;
        const command = r.text.toLowerCase();
        if (command.includes("increase font") || command.includes("bigger text")) {
          document.documentElement.style.fontSize = "20px";
          localStorage.setItem("app_font_size", "x-large");
          toast({ title: "Font Increased", description: "Text size increased." });
        } else if (command.includes("decrease font") || command.includes("smaller text")) {
          document.documentElement.style.fontSize = "14px";
          localStorage.setItem("app_font_size", "small");
          toast({ title: "Font Decreased", description: "Text size decreased." });
        } else if (command.includes("high contrast")) {
          document.documentElement.setAttribute("data-cvd", "high-contrast");
          localStorage.setItem("app_cvd_mode", "high-contrast");
          toast({ title: "High Contrast", description: "High contrast mode activated." });
        } else if (command.includes("dark mode") || command.includes("dark theme")) {
          document.documentElement.classList.add("dark");
          toast({ title: "Dark Mode", description: "Dark mode activated." });
        } else if (command.includes("read page") || command.includes("reading mode")) {
          updatePref("readingMode", true);
        } else if (command.includes("scan accessibility")) {
          scanAccessibility();
        } else {
          toast({ title: "Voice Command", description: `Heard: "${command}". Try "increase font", "high contrast", "dark mode", or "scan accessibility".` });
        }
      },
      onEnd: () => setIsListening(false),
      onError: () => setIsListening(false),
    });
  };

  const ToggleCard = ({ id, icon: Icon, label, description, checked, onChange, disabled }: any) => (
    <div className="flex items-center justify-between rounded-lg border border-border p-3 transition hover:border-primary/30">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
        <div className="min-w-0">
          <Label htmlFor={id} className="text-sm font-medium cursor-pointer">{label}</Label>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </div>
  );

  return (
    <div className="space-y-4 p-2 sm:p-4 lg:p-6 max-w-[900px] mx-auto">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-xl bg-gradient-to-br from-primary/20 to-accent/20">
          <Accessibility className="h-7 w-7 text-primary" />
        </div>
        <div>
          <h1 className="font-display text-xl sm:text-2xl font-bold text-foreground">Accessibility Tools</h1>
          <p className="text-sm text-muted-foreground">Customize the app for your accessibility needs</p>
        </div>
      </div>

      <ScrollArea className="h-[calc(100dvh-180px)]">
        <div className="space-y-4 pr-2">
          {/* Cognitive Support */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Brain className="h-4 w-4 text-primary" /> Cognitive Support</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <ToggleCard id="auto-complete" icon={Type} label="Auto-Complete" description="Suggest completions as you type in text fields" checked={prefs.autoComplete} onChange={(v: boolean) => updatePref("autoComplete", v)} />
              <ToggleCard id="spell-check" icon={CheckCircle} label="Spell Check" description="Highlight spelling errors in text inputs" checked={prefs.spellCheck} onChange={(v: boolean) => updatePref("spellCheck", v)} />
              <ToggleCard id="reading-mode" icon={BookOpen} label="Reading Mode" description="Simplify the interface for focused reading" checked={prefs.readingMode} onChange={(v: boolean) => updatePref("readingMode", v)} />
            </CardContent>
          </Card>

          {/* Voice Assistant */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Mic className="h-4 w-4 text-primary" /> Voice Assistant</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground">Use voice commands: "increase font", "high contrast", "dark mode", "scan accessibility", "reading mode"</p>
              <Button onClick={toggleVoiceAssistant} variant={isListening ? "destructive" : "default"} className="w-full gap-2">
                {isListening ? <><Pause className="h-4 w-4" /> Listening...</> : <><Mic className="h-4 w-4" /> Activate Voice Assistant</>}
              </Button>
            </CardContent>
          </Card>

          {/* Visual */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Eye className="h-4 w-4 text-primary" /> Visual Accessibility</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <ToggleCard id="auto-font" icon={ZoomIn} label="Auto Font Size" description="Adjust font size based on device settings" checked={prefs.autoFontSize} onChange={(v: boolean) => updatePref("autoFontSize", v)} />
              <ToggleCard id="reduced-motion" icon={Pause} label="Reduced Motion" description="Minimize animations and transitions" checked={prefs.reducedMotion} onChange={(v: boolean) => updatePref("reducedMotion", v)} />
            </CardContent>
          </Card>

          {/* Audio */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Ear className="h-4 w-4 text-primary" /> Audio & Notifications</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <ToggleCard id="audio-cues" icon={Volume2} label="Audio Cues" description="Play sounds for important events and notifications" checked={prefs.audioCues} onChange={(v: boolean) => updatePref("audioCues", v)} />
              <ToggleCard id="audio-descriptions" icon={Ear} label="Audio Descriptions" description="Enable spoken descriptions for multimedia content" checked={prefs.audioDescriptions} onChange={(v: boolean) => updatePref("audioDescriptions", v)} />
              <ToggleCard id="sonification" icon={Volume2} label="Data Sonification" description="Represent data as spatial audio for non-visual exploration" checked={prefs.sonification} onChange={(v: boolean) => updatePref("sonification", v)} />
              <div className="px-3">
                <Label className="text-xs text-muted-foreground">Audio Cue Volume</Label>
                <Slider value={[prefs.audioCueVolume]} onValueChange={([v]) => updatePref("audioCueVolume", v)} max={100} step={5} className="mt-2" />
              </div>
            </CardContent>
          </Card>

          {/* Motor */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Hand className="h-4 w-4 text-primary" /> Motor Accessibility</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <ToggleCard id="large-targets" icon={MousePointerClick} label="Large Click Targets" description="Increase button and link sizes for easier tapping" checked={prefs.largeClickTargets} onChange={(v: boolean) => updatePref("largeClickTargets", v)} />
              <ToggleCard id="sticky-keys" icon={Hand} label="Sticky Keys" description="Hold modifier keys without pressing simultaneously" checked={prefs.stickyKeys} onChange={(v: boolean) => updatePref("stickyKeys", v)} />
              <ToggleCard id="gesture-simplification" icon={Vibrate} label="Gesture Simplification" description="Replace complex gestures with simple tap alternatives" checked={prefs.gestureSimplification} onChange={(v: boolean) => updatePref("gestureSimplification", v)} />
              <ToggleCard id="haptic-feedback" icon={Smartphone} label="Haptic Feedback" description="Vibration feedback for interactions" checked={prefs.hapticFeedback} onChange={(v: boolean) => updatePref("hapticFeedback", v)} />
            </CardContent>
          </Card>

          {/* Accessibility Scanner */}
          <Card className="border-primary/20">
            <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><ScanLine className="h-4 w-4 text-primary" /> Accessibility Scanner</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground">Scan the current page for common accessibility issues and get fix suggestions.</p>
              <Button onClick={scanAccessibility} disabled={scanning} className="w-full gap-2">
                <ScanLine className="h-4 w-4" /> {scanning ? "Scanning..." : "Scan Page"}
              </Button>

              {scanResults.length > 0 && (
                <div className="space-y-2 mt-3">
                  <div className="flex gap-2">
                    <Badge variant="destructive">{scanResults.filter(i => i.severity === "critical").length} Critical</Badge>
                    <Badge className="bg-amber-500/10 text-amber-600">{scanResults.filter(i => i.severity === "warning").length} Warnings</Badge>
                    <Badge variant="secondary">{scanResults.filter(i => i.severity === "info").length} Info</Badge>
                  </div>
                  <ScrollArea className="max-h-[250px]">
                    <div className="space-y-2">
                      {scanResults.map((issue, i) => (
                        <div key={i} className={`p-2.5 rounded-md border text-xs ${issue.severity === "critical" ? "border-destructive/30 bg-destructive/5" : issue.severity === "warning" ? "border-amber-500/30 bg-amber-500/5" : "border-border bg-muted/30"}`}>
                          <div className="flex items-center gap-2 mb-1">
                            {issue.severity === "critical" ? <AlertTriangle className="h-3 w-3 text-destructive" /> : <CheckCircle className="h-3 w-3 text-muted-foreground" />}
                            <span className="font-medium text-foreground">{issue.element}</span>
                          </div>
                          <p className="text-foreground">{issue.message}</p>
                          <p className="text-muted-foreground mt-1">Fix: {issue.fix}</p>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </ScrollArea>
    </div>
  );
};

export default AccessibilityToolsView;

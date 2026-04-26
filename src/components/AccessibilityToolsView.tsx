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
  Briefcase, TreePine, Moon, Plus, Trash2, Save,
} from "lucide-react";
import { Input } from "@/components/ui/input";

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
  const [noiseSuppression, setNoiseSuppression] = useState<boolean>(true);
  const [noiseAggressiveness, setNoiseAggressiveness] = useState<number>(() => {
    try { return Math.round(stt.getDefaultMinConfidence() * 100); } catch { return 60; }
  });
  const [sttAvailable, setSttAvailable] = useState<boolean>(() => {
    try { return stt.isSupported(); } catch { return false; }
  });
  const { playAlert, setVolume } = useSpatialAudio();
  const sttSessionRef = useRef<STTSession | null>(null);

  // ─── Accessibility presets ────────────────────────────────────────
  // Save-and-recall named profiles bundling noise suppression + mic gate +
  // recognition language so users can switch between Office, Field, etc.
  type A11yPreset = {
    id: string;
    name: string;
    icon: "office" | "field" | "quiet" | "custom";
    noiseSuppression: boolean;
    aggressiveness: number; // 20..95
    minConfidence: number;  // 0..1
    builtIn?: boolean;
  };
  const BUILT_IN_PRESETS: A11yPreset[] = [
    { id: "preset-office", name: "Office", icon: "office", noiseSuppression: true, aggressiveness: 60, minConfidence: 0.6, builtIn: true },
    { id: "preset-field",  name: "Field",  icon: "field",  noiseSuppression: true, aggressiveness: 35, minConfidence: 0.35, builtIn: true },
    { id: "preset-quiet",  name: "Quiet room", icon: "quiet", noiseSuppression: false, aggressiveness: 80, minConfidence: 0.8, builtIn: true },
  ];
  const [presets, setPresets] = useState<A11yPreset[]>(() => {
    try {
      const raw = localStorage.getItem("a11y_presets");
      const custom = raw ? (JSON.parse(raw) as A11yPreset[]) : [];
      return [...BUILT_IN_PRESETS, ...custom.filter(p => !p.builtIn)];
    } catch {
      return BUILT_IN_PRESETS;
    }
  });
  const [activePresetId, setActivePresetId] = useState<string | null>(() => {
    try { return localStorage.getItem("a11y_active_preset") || null; } catch { return null; }
  });
  const [newPresetName, setNewPresetName] = useState("");

  const persistCustomPresets = (all: A11yPreset[]) => {
    try {
      localStorage.setItem("a11y_presets", JSON.stringify(all.filter(p => !p.builtIn)));
    } catch { /* noop */ }
  };

  const applyPreset = useCallback((preset: A11yPreset) => {
    setNoiseSuppression(preset.noiseSuppression);
    localStorage.setItem("a11y_noise_suppression", String(preset.noiseSuppression));
    setNoiseAggressiveness(preset.aggressiveness);
    try { stt.setDefaultMinConfidence(preset.minConfidence); } catch { /* noop */ }
    setActivePresetId(preset.id);
    try { localStorage.setItem("a11y_active_preset", preset.id); } catch { /* noop */ }
    toast({
      title: `Preset applied: ${preset.name}`,
      description: `Noise suppression ${preset.noiseSuppression ? "on" : "off"} · gate ${Math.round(preset.minConfidence * 100)}%`,
    });
  }, []);

  const saveCurrentAsPreset = () => {
    const name = newPresetName.trim();
    if (!name) {
      toast({ title: "Name required", description: "Give your preset a short name.", variant: "destructive" });
      return;
    }
    const newPreset: A11yPreset = {
      id: `preset-${Date.now()}`,
      name,
      icon: "custom",
      noiseSuppression,
      aggressiveness: noiseAggressiveness,
      minConfidence: noiseAggressiveness / 100,
    };
    const next = [...presets, newPreset];
    setPresets(next);
    persistCustomPresets(next);
    setActivePresetId(newPreset.id);
    try { localStorage.setItem("a11y_active_preset", newPreset.id); } catch { /* noop */ }
    setNewPresetName("");
    toast({ title: "Preset saved", description: `"${name}" is now switchable instantly.` });
  };

  const deletePreset = (id: string) => {
    const target = presets.find(p => p.id === id);
    if (!target || target.builtIn) return;
    const next = presets.filter(p => p.id !== id);
    setPresets(next);
    persistCustomPresets(next);
    if (activePresetId === id) {
      setActivePresetId(null);
      try { localStorage.removeItem("a11y_active_preset"); } catch { /* noop */ }
    }
    toast({ title: "Preset removed", description: target.name });
  };

  useEffect(() => {
    const saved = localStorage.getItem("a11y_prefs");
    if (saved) {
      try { setPrefs({ ...DEFAULT_PREFS, ...JSON.parse(saved) }); } catch {}
    }
    const ns = localStorage.getItem("a11y_noise_suppression");
    if (ns !== null) setNoiseSuppression(ns === "true");
  }, []);

  // Pre-warm noise-suppressed mic stream when the toggle is on so STT inherits AEC/NS/AGC.
  useEffect(() => {
    if (!noiseSuppression) {
      stt.releaseNoiseSuppression?.();
      return;
    }
    stt.enableNoiseSuppression?.().catch(() => {});
    return () => stt.releaseNoiseSuppression?.();
  }, [noiseSuppression]);

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

  const disableSTT = useCallback((reason: string) => {
    setSttAvailable(false);
    setIsListening(false);
    if (sttSessionRef.current) {
      try { sttSessionRef.current.abort(); } catch { /* noop */ }
      sttSessionRef.current = null;
    }
    toast({ title: "Voice Assistant Disabled", description: reason, variant: "destructive" });
  }, []);

  const toggleVoiceAssistant = () => {
    if (!sttAvailable || !stt.isSupported()) {
      toast({ title: "Not Available", description: "Voice assistant requires speech recognition support.", variant: "destructive" });
      return;
    }
    if (isListening) {
      try { sttSessionRef.current?.abort(); } catch { /* noop */ }
      sttSessionRef.current = null;
      setIsListening(false);
      updatePref("voiceAssistant", false);
      return;
    }
    setIsListening(true);
    updatePref("voiceAssistant", true);
    try {
      sttSessionRef.current = stt.listen({
        continuous: false,
        interimResults: false,
        minConfidence: noiseAggressiveness / 100,
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
        onError: (code) => {
          setIsListening(false);
          if (code === "not_allowed" || code === "service_not_allowed") {
            disableSTT("Microphone access was denied. Enable it in your browser settings to use voice commands.");
          } else if (code === "not_supported") {
            disableSTT("This browser does not support speech recognition.");
          } else if (code === "audio_capture") {
            disableSTT("No microphone detected. Connect a mic and try again.");
          } else if (code === "network") {
            toast({ title: "Network Error", description: "Speech recognition needs an internet connection.", variant: "destructive" });
          }
        },
      });
    } catch (err: any) {
      console.error("STT start failed:", err);
      const reason = err?.name === "NotAllowedError"
        ? "Microphone access denied."
        : "Speech recognition is unavailable in this browser.";
      disableSTT(reason);
      updatePref("voiceAssistant", false);
    }
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
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Mic className="h-4 w-4 text-primary" /> Voice Assistant
                <Badge variant="secondary" className="ml-auto text-[10px]">English only</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Speech recognition and spoken prompts are locked to English (en-US) for the highest accuracy in noisy field conditions. Use voice commands: "increase font", "high contrast", "dark mode", "scan accessibility", "reading mode".
              </p>
              <ToggleCard
                id="noise-suppression"
                icon={Mic}
                label="Background Noise Suppression"
                description="Apply browser-native echo cancellation, noise suppression, and auto-gain control to your microphone. Strongly recommended for visually-impaired users in busy environments."
                checked={noiseSuppression}
                onChange={(v: boolean) => {
                  setNoiseSuppression(v);
                  localStorage.setItem("a11y_noise_suppression", String(v));
                  toast({
                    title: v ? "Noise Suppression On" : "Noise Suppression Off",
                    description: v
                      ? "Microphone is now filtering background noise."
                      : "Raw microphone audio will be used.",
                  });
                }}
              />
              {/* Accessibility presets — instant switching across environments */}
              <div className="rounded-lg border p-3 space-y-2.5 bg-muted/30">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <Label className="text-sm font-medium flex items-center gap-1.5">
                      <Briefcase className="h-3.5 w-3.5 text-primary" /> Accessibility Presets
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Save and switch named profiles bundling noise suppression + mic gate.
                    </p>
                  </div>
                  {activePresetId && (
                    <Badge variant="secondary" className="text-[10px] shrink-0">
                      Active: {presets.find(p => p.id === activePresetId)?.name ?? "Custom"}
                    </Badge>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5" role="group" aria-label="Accessibility presets">
                  {presets.map(p => {
                    const isActive = activePresetId === p.id;
                    const Icon = p.icon === "office" ? Briefcase : p.icon === "field" ? TreePine : p.icon === "quiet" ? Moon : Save;
                    return (
                      <div key={p.id} className="inline-flex items-stretch rounded-md border bg-background overflow-hidden">
                        <button
                          type="button"
                          onClick={() => applyPreset(p)}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium transition-colors ${isActive ? "bg-primary text-primary-foreground" : "hover:bg-muted text-foreground"}`}
                          aria-pressed={isActive}
                          aria-label={`Apply ${p.name} preset: noise suppression ${p.noiseSuppression ? "on" : "off"}, gate ${Math.round(p.minConfidence * 100)} percent`}
                          title={`${p.name} · NS ${p.noiseSuppression ? "on" : "off"} · gate ${Math.round(p.minConfidence * 100)}%`}
                        >
                          <Icon className="h-3 w-3" />
                          {p.name}
                        </button>
                        {!p.builtIn && (
                          <button
                            type="button"
                            onClick={() => deletePreset(p.id)}
                            className="px-1.5 border-l text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                            aria-label={`Delete preset ${p.name}`}
                            title="Delete preset"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="flex items-center gap-1.5 pt-1">
                  <Input
                    value={newPresetName}
                    onChange={e => setNewPresetName(e.target.value)}
                    placeholder="Name your current settings…"
                    className="h-7 text-xs"
                    aria-label="New preset name"
                    onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); saveCurrentAsPreset(); } }}
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="h-7 text-xs gap-1 shrink-0"
                    onClick={saveCurrentAsPreset}
                    disabled={!newPresetName.trim()}
                    aria-label="Save current accessibility settings as a new preset"
                  >
                    <Plus className="h-3 w-3" /> Save
                  </Button>
                </div>
              </div>
              {/* Aggressiveness slider — tunes the per-recognition confidence gate */}
              <div className={`rounded-lg border p-3 space-y-2 ${noiseSuppression ? "" : "opacity-60"}`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <Label htmlFor="noise-aggressiveness" className="text-sm font-medium">
                      Suppression Aggressiveness
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      How strictly to reject low-confidence (likely noisy) speech.
                      Higher = quieter rooms, fewer false matches. Lower = noisier
                      rooms, more permissive recognition.
                    </p>
                  </div>
                  <Badge variant="outline" className="text-[10px] tabular-nums shrink-0" aria-live="polite">
                    {noiseAggressiveness < 40 ? "Low" : noiseAggressiveness < 55 ? "Medium" : noiseAggressiveness < 70 ? "Balanced" : noiseAggressiveness < 85 ? "High" : "Strict"}
                    {" · "}{noiseAggressiveness}%
                  </Badge>
                </div>
                <Slider
                  id="noise-aggressiveness"
                  min={20}
                  max={95}
                  step={5}
                  value={[noiseAggressiveness]}
                  onValueChange={(v) => {
                    const next = v[0];
                    setNoiseAggressiveness(next);
                    stt.setDefaultMinConfidence(next / 100);
                  }}
                  onValueCommit={(v) => {
                    toast({
                      title: "Mic gate updated",
                      description: `Confidence threshold set to ${v[0]}%. Quieter inputs may now be ${v[0] >= 70 ? "rejected" : "accepted"}.`,
                    });
                  }}
                  aria-valuetext={`${noiseAggressiveness} percent confidence threshold`}
                  className="py-1"
                />
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>Permissive</span>
                  <span>Balanced</span>
                  <span>Strict</span>
                </div>
              </div>
              <Button onClick={toggleVoiceAssistant} variant={isListening ? "destructive" : "default"} className="w-full gap-2" disabled={!sttAvailable}>
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

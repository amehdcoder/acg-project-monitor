import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Slider } from "@/components/ui/slider";
import {
  Settings,
  Moon,
  Sun,
  Bell,
  Wifi,
  Save,
  Monitor,
  Volume2,
  Globe,
  Play,
  RotateCcw,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useTheme } from "next-themes";
import { useTTSPreferences, DEFAULT_TTS_PREFS } from "@/hooks/useTTSPreferences";

interface AppSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface AppSettings {
  autoSync: boolean;
  syncOnWifiOnly: boolean;
  enableNotifications: boolean;
  soundEnabled: boolean;
  language: string;
  dateFormat: string;
  showCompletedForms: boolean;
  compactView: boolean;
  autoUpdateApp: boolean;
}

const DEFAULT_SETTINGS: AppSettings = {
  autoSync: true,
  syncOnWifiOnly: false,
  enableNotifications: true,
  soundEnabled: true,
  language: "en",
  dateFormat: "DD/MM/YYYY",
  showCompletedForms: true,
  compactView: false,
  autoUpdateApp: true,
};

const AppSettingsDialog = ({ open, onOpenChange }: AppSettingsDialogProps) => {
  const { theme, setTheme } = useTheme();
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const { prefs: ttsPrefs, update: updateTts, reset: resetTts, voices, preview: previewTts } = useTTSPreferences();

  useEffect(() => {
    // Load settings from localStorage
    const saved = localStorage.getItem("app_settings");
    if (saved) {
      try {
        setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(saved) });
      } catch (e) {
        console.error("Failed to parse settings:", e);
      }
    }
  }, [open]);

  const updateSetting = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = () => {
    localStorage.setItem("app_settings", JSON.stringify(settings));
    toast({
      title: "Settings Saved",
      description: "Your preferences have been updated.",
    });
    onOpenChange(false);
  };

  const handleReset = () => {
    setSettings(DEFAULT_SETTINGS);
    localStorage.removeItem("app_settings");
    toast({
      title: "Settings Reset",
      description: "All settings have been reset to defaults.",
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display">
            <Settings className="h-5 w-5 text-primary" />
            App Settings
          </DialogTitle>
          <DialogDescription>
            Customize your app experience
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh]">
          <div className="space-y-6 pr-4">
            {/* Appearance */}
            <div className="space-y-4">
              <h4 className="font-medium flex items-center gap-2">
                <Monitor className="h-4 w-4 text-muted-foreground" />
                Appearance
              </h4>
              <div className="flex items-center justify-between rounded-lg border border-border p-3">
                <div>
                  <Label>Theme</Label>
                  <p className="text-xs text-muted-foreground">
                    Choose your preferred color theme
                  </p>
                </div>
                <Select value={theme} onValueChange={setTheme}>
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="light">
                      <div className="flex items-center gap-2">
                        <Sun className="h-4 w-4" />
                        Light
                      </div>
                    </SelectItem>
                    <SelectItem value="dark">
                      <div className="flex items-center gap-2">
                        <Moon className="h-4 w-4" />
                        Dark
                      </div>
                    </SelectItem>
                    <SelectItem value="system">
                      <div className="flex items-center gap-2">
                        <Monitor className="h-4 w-4" />
                        System
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-border p-3">
                <div>
                  <Label htmlFor="compact-view">Compact View</Label>
                  <p className="text-xs text-muted-foreground">
                    Use a more condensed layout
                  </p>
                </div>
                <Switch
                  id="compact-view"
                  checked={settings.compactView}
                  onCheckedChange={(val) => updateSetting("compactView", val)}
                />
              </div>
            </div>

            <Separator />

            {/* Notifications */}
            <div className="space-y-4">
              <h4 className="font-medium flex items-center gap-2">
                <Bell className="h-4 w-4 text-muted-foreground" />
                Notifications
              </h4>
              <div className="flex items-center justify-between rounded-lg border border-border p-3">
                <div>
                  <Label htmlFor="enable-notifications">Enable Notifications</Label>
                  <p className="text-xs text-muted-foreground">
                    Receive alerts for important updates
                  </p>
                </div>
                <Switch
                  id="enable-notifications"
                  checked={settings.enableNotifications}
                  onCheckedChange={(val) => updateSetting("enableNotifications", val)}
                />
              </div>
              <div className="flex items-center justify-between rounded-lg border border-border p-3">
                <div>
                  <Label htmlFor="sound-enabled">Sound Effects</Label>
                  <p className="text-xs text-muted-foreground">
                    Play sounds for notifications
                  </p>
                </div>
                <Switch
                  id="sound-enabled"
                  checked={settings.soundEnabled}
                  onCheckedChange={(val) => updateSetting("soundEnabled", val)}
                  disabled={!settings.enableNotifications}
                />
              </div>
            </div>

            <Separator />

            {/* Sync & Offline */}
            <div className="space-y-4">
              <h4 className="font-medium flex items-center gap-2">
                <Wifi className="h-4 w-4 text-muted-foreground" />
                Sync & Offline
              </h4>
              <div className="flex items-center justify-between rounded-lg border border-border p-3">
                <div>
                  <Label htmlFor="auto-sync">Auto Sync</Label>
                  <p className="text-xs text-muted-foreground">
                    Automatically sync data when online
                  </p>
                </div>
                <Switch
                  id="auto-sync"
                  checked={settings.autoSync}
                  onCheckedChange={(val) => updateSetting("autoSync", val)}
                />
              </div>
              <div className="flex items-center justify-between rounded-lg border border-border p-3">
                <div>
                  <Label htmlFor="wifi-only">Sync on Wi-Fi Only</Label>
                  <p className="text-xs text-muted-foreground">
                    Avoid syncing on mobile data
                  </p>
                </div>
                <Switch
                  id="wifi-only"
                  checked={settings.syncOnWifiOnly}
                  onCheckedChange={(val) => updateSetting("syncOnWifiOnly", val)}
                  disabled={!settings.autoSync}
                />
              </div>
            </div>

            <Separator />

            {/* Voice & Speech (TTS) */}
            <div className="space-y-4">
              <h4 className="font-medium flex items-center gap-2">
                <Volume2 className="h-4 w-4 text-muted-foreground" />
                Voice & Speech (Text-to-Speech)
              </h4>

              <div className="rounded-lg border border-border p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Voice</Label>
                  <Select
                    value={ttsPrefs.voiceURI ?? "__auto__"}
                    onValueChange={(v) =>
                      updateTts({ voiceURI: v === "__auto__" ? null : v })
                    }
                  >
                    <SelectTrigger className="w-56">
                      <SelectValue placeholder="Auto (recommended)" />
                    </SelectTrigger>
                    <SelectContent className="max-h-72">
                      <SelectItem value="__auto__">Auto (recommended)</SelectItem>
                      {voices.map((v) => (
                        <SelectItem key={v.voiceURI} value={v.voiceURI}>
                          {v.name} — {v.lang}
                          {v.localService ? " (offline)" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Speed</Label>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {ttsPrefs.rate.toFixed(2)}×
                    </span>
                  </div>
                  <Slider
                    min={0.5}
                    max={1.6}
                    step={0.05}
                    value={[ttsPrefs.rate]}
                    onValueChange={([v]) => updateTts({ rate: v })}
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Pitch</Label>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {ttsPrefs.pitch.toFixed(2)}
                    </span>
                  </div>
                  <Slider
                    min={0}
                    max={2}
                    step={0.05}
                    value={[ttsPrefs.pitch]}
                    onValueChange={([v]) => updateTts({ pitch: v })}
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Volume</Label>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {Math.round(ttsPrefs.volume * 100)}%
                    </span>
                  </div>
                  <Slider
                    min={0}
                    max={1}
                    step={0.05}
                    value={[ttsPrefs.volume]}
                    onValueChange={([v]) => updateTts({ volume: v })}
                  />
                </div>

                <div className="flex gap-2 pt-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => previewTts()}
                    className="flex-1"
                  >
                    <Play className="h-3.5 w-3.5 mr-1" />
                    Preview
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={resetTts}
                  >
                    <RotateCcw className="h-3.5 w-3.5 mr-1" />
                    Reset
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  These voice settings are saved per user and apply to all
                  spoken prompts (form questions, alerts, navigation).
                </p>
              </div>
            </div>

            <Separator />

            {/* Display */}
            <div className="space-y-4">
              <h4 className="font-medium flex items-center gap-2">
                <Globe className="h-4 w-4 text-muted-foreground" />
                Display
              </h4>
              <div className="flex items-center justify-between rounded-lg border border-border p-3">
                <div>
                  <Label>Date Format</Label>
                  <p className="text-xs text-muted-foreground">
                    How dates are displayed
                  </p>
                </div>
                <Select
                  value={settings.dateFormat}
                  onValueChange={(val) => updateSetting("dateFormat", val)}
                >
                  <SelectTrigger className="w-36">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DD/MM/YYYY">DD/MM/YYYY</SelectItem>
                    <SelectItem value="MM/DD/YYYY">MM/DD/YYYY</SelectItem>
                    <SelectItem value="YYYY-MM-DD">YYYY-MM-DD</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-border p-3">
                <div>
                  <Label htmlFor="show-completed">Show Completed Forms</Label>
                  <p className="text-xs text-muted-foreground">
                    Display forms you've already submitted
                  </p>
                </div>
                <Switch
                  id="show-completed"
                  checked={settings.showCompletedForms}
                  onCheckedChange={(val) => updateSetting("showCompletedForms", val)}
                />
              </div>
            </div>
          </div>
        </ScrollArea>

        <div className="flex justify-between gap-3 pt-4">
          <Button variant="ghost" onClick={handleReset}>
            Reset to Defaults
          </Button>
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button variant="acg" onClick={handleSave}>
              <Save className="h-4 w-4 mr-2" />
              Save Settings
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AppSettingsDialog;

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Settings, Moon, Sun, Bell, Wifi, Save, Monitor, Volume2, Globe,
  Shield, Smartphone, Database, Clock, Eye, Download, Trash2,
  RefreshCcw, Lock, Palette, LayoutGrid, MapPin, FileText
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useTheme } from "next-themes";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";
import PageAccessManager from "@/components/PageAccessManager";
import { useAppUpdateNotifications } from "@/hooks/useAppUpdateNotifications";
import { Textarea } from "@/components/ui/textarea";
import { RESTRICTED_PAGES } from "@/hooks/usePageAccess";
import { Megaphone } from "lucide-react";

interface AppSettings {
  autoSync: boolean;
  syncOnWifiOnly: boolean;
  enableNotifications: boolean;
  soundEnabled: boolean;
  pushNotifications: boolean;
  emailDigest: string;
  language: string;
  dateFormat: string;
  timeFormat: string;
  showCompletedForms: boolean;
  compactView: boolean;
  defaultMapView: string;
  autoSaveInterval: number;
  offlineStorageLimit: number;
  gpsPrecision: string;
  requireGPS: boolean;
  photoQuality: string;
  maxPhotoSize: number;
  sessionTimeout: number;
  twoFactorEnabled: boolean;
  dataRetentionDays: number;
  autoExportFormat: string;
  enableBehavioralMonitoring: boolean;
  enableGpsTriangulation: boolean;
  enableProximityDetection: boolean;
}

const DEFAULT_SETTINGS: AppSettings = {
  autoSync: true,
  syncOnWifiOnly: false,
  enableNotifications: true,
  soundEnabled: true,
  pushNotifications: false,
  emailDigest: "daily",
  language: "en",
  dateFormat: "DD/MM/YYYY",
  timeFormat: "24h",
  showCompletedForms: true,
  compactView: false,
  defaultMapView: "satellite",
  autoSaveInterval: 30,
  offlineStorageLimit: 500,
  gpsPrecision: "high",
  requireGPS: true,
  photoQuality: "medium",
  maxPhotoSize: 5,
  sessionTimeout: 30,
  twoFactorEnabled: false,
  dataRetentionDays: 365,
  autoExportFormat: "xlsx",
  enableBehavioralMonitoring: false,
  enableGpsTriangulation: false,
  enableProximityDetection: true,
};

const SettingsView = () => {
  const { resolvedTheme, setTheme } = useTheme();
  const { user, isAdmin, profile } = useAuth();
  const { language, setLanguage } = useLanguage();
  const { sendUpdateNotification } = useAppUpdateNotifications();
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [hasChanges, setHasChanges] = useState(false);
  const [notifPage, setNotifPage] = useState("");
  const [notifTitle, setNotifTitle] = useState("");
  const [notifDesc, setNotifDesc] = useState("");
  const [notifType, setNotifType] = useState("feature");
  const [sendingNotif, setSendingNotif] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("app_settings");
    if (saved) {
      try {
        setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(saved) });
      } catch (e) {
        console.error("Failed to parse settings:", e);
      }
    }
  }, []);

  const updateSetting = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setSettings(prev => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  const handleSave = () => {
    localStorage.setItem("app_settings", JSON.stringify(settings));
    setHasChanges(false);
    toast({ title: "Settings Saved", description: "Your preferences have been updated." });
  };

  const handleReset = () => {
    setSettings(DEFAULT_SETTINGS);
    localStorage.removeItem("app_settings");
    setHasChanges(false);
    toast({ title: "Settings Reset", description: "All settings restored to defaults." });
  };

  const clearOfflineData = () => {
    const keys = Object.keys(localStorage).filter(k => k.startsWith("offline_"));
    keys.forEach(k => localStorage.removeItem(k));
    toast({ title: "Offline Data Cleared", description: `Removed ${keys.length} cached items.` });
  };

  const SettingRow = ({ children, label, description, icon: Icon }: { children: React.ReactNode; label: string; description: string; icon?: any }) => (
    <div className="flex items-center justify-between rounded-lg border border-border p-4 transition-colors hover:bg-muted/30">
      <div className="flex items-start gap-3 flex-1 min-w-0">
        {Icon && <Icon className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />}
        <div>
          <Label className="text-sm font-medium">{label}</Label>
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        </div>
      </div>
      <div className="ml-4 flex-shrink-0">{children}</div>
    </div>
  );

  return (
    <div className="space-y-6 p-4 lg:p-6 max-w-[1000px] mx-auto">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl lg:text-3xl font-bold text-foreground flex items-center gap-3">
            <div className="p-2 rounded-xl bg-primary/10">
              <Settings className="h-7 w-7 text-primary" />
            </div>
            Settings
          </h1>
          <p className="mt-1 text-muted-foreground">Configure your app preferences and account settings</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {profile?.is_owner && <PageAccessManager />}
          <Button variant="ghost" size="sm" onClick={handleReset} disabled={!hasChanges}>
            <RefreshCcw className="h-4 w-4 mr-1" />Reset
          </Button>
          <Button variant="acg" size="sm" onClick={handleSave} disabled={!hasChanges}>
            <Save className="h-4 w-4 mr-1" />Save Changes
          </Button>
        </div>
      </div>

      {hasChanges && (
        <div className="rounded-lg border border-accent bg-accent/10 px-4 py-2 text-sm text-accent-foreground flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-accent animate-pulse" />
          You have unsaved changes
        </div>
      )}

      <Tabs defaultValue="general" className="space-y-6">
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
          <TabsTrigger value="data-sync">Data & Sync</TabsTrigger>
          <TabsTrigger value="collection">Data Collection</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
          {isAdmin && <TabsTrigger value="admin">Administration</TabsTrigger>}
        </TabsList>

        {/* GENERAL */}
        <TabsContent value="general" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg"><Palette className="h-5 w-5 text-primary" />Appearance</CardTitle>
              <CardDescription>Customize the look and feel of your workspace</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <SettingRow label="Theme" description="Choose your preferred color theme" icon={Monitor}>
                <Select value={resolvedTheme} onValueChange={setTheme}>
                  <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="light"><div className="flex items-center gap-2"><Sun className="h-4 w-4" />Light</div></SelectItem>
                    <SelectItem value="dark"><div className="flex items-center gap-2"><Moon className="h-4 w-4" />Dark</div></SelectItem>
                    <SelectItem value="system"><div className="flex items-center gap-2"><Monitor className="h-4 w-4" />System</div></SelectItem>
                  </SelectContent>
                </Select>
              </SettingRow>
              <SettingRow label="Compact View" description="Use condensed layout with smaller spacing" icon={LayoutGrid}>
                <Switch checked={settings.compactView} onCheckedChange={val => updateSetting("compactView", val)} />
              </SettingRow>
              <SettingRow label="Show Completed Forms" description="Display forms you've already submitted" icon={Eye}>
                <Switch checked={settings.showCompletedForms} onCheckedChange={val => updateSetting("showCompletedForms", val)} />
              </SettingRow>

              {/* Background Theme Selector (Admin only) */}
              {isAdmin && (
                <div className="space-y-2 pt-2">
                  <Label className="text-sm font-medium flex items-center gap-2">
                    <Palette className="h-4 w-4 text-muted-foreground" />
                    App Background Theme
                  </Label>
                  <p className="text-xs text-muted-foreground mb-2">Select a background theme for all app users</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {[
                      { id: "default", name: "Default", preview: "bg-background", gradient: "" },
                      { id: "ocean-breeze", name: "Ocean Breeze", preview: "bg-gradient-to-br from-sky-50 to-cyan-100 dark:from-sky-950 dark:to-cyan-900", gradient: "linear-gradient(135deg, hsl(200 90% 96%) 0%, hsl(185 80% 90%) 100%)" },
                      { id: "sunset-glow", name: "Sunset Glow", preview: "bg-gradient-to-br from-orange-50 to-rose-100 dark:from-orange-950 dark:to-rose-900", gradient: "linear-gradient(135deg, hsl(30 90% 96%) 0%, hsl(350 80% 92%) 100%)" },
                      { id: "forest-mist", name: "Forest Mist", preview: "bg-gradient-to-br from-emerald-50 to-teal-100 dark:from-emerald-950 dark:to-teal-900", gradient: "linear-gradient(135deg, hsl(150 60% 96%) 0%, hsl(170 50% 90%) 100%)" },
                      { id: "lavender-dream", name: "Lavender Dream", preview: "bg-gradient-to-br from-violet-50 to-purple-100 dark:from-violet-950 dark:to-purple-900", gradient: "linear-gradient(135deg, hsl(270 70% 96%) 0%, hsl(280 60% 92%) 100%)" },
                      { id: "golden-sand", name: "Golden Sand", preview: "bg-gradient-to-br from-amber-50 to-yellow-100 dark:from-amber-950 dark:to-yellow-900", gradient: "linear-gradient(135deg, hsl(45 80% 96%) 0%, hsl(50 70% 90%) 100%)" },
                      { id: "arctic-aurora", name: "Arctic Aurora", preview: "bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-blue-950 dark:to-indigo-900", gradient: "linear-gradient(135deg, hsl(215 80% 96%) 0%, hsl(230 60% 90%) 100%)" },
                      { id: "cherry-blossom", name: "Cherry Blossom", preview: "bg-gradient-to-br from-pink-50 to-rose-100 dark:from-pink-950 dark:to-rose-900", gradient: "linear-gradient(135deg, hsl(330 70% 96%) 0%, hsl(345 60% 92%) 100%)" },
                      { id: "midnight-slate", name: "Midnight Slate", preview: "bg-gradient-to-br from-slate-100 to-gray-200 dark:from-slate-900 dark:to-gray-800", gradient: "linear-gradient(135deg, hsl(215 20% 94%) 0%, hsl(220 15% 86%) 100%)" },
                      { id: "tropical-vibes", name: "Tropical Vibes", preview: "bg-gradient-to-br from-lime-50 to-emerald-100 dark:from-lime-950 dark:to-emerald-900", gradient: "linear-gradient(135deg, hsl(80 60% 96%) 0%, hsl(150 50% 90%) 100%)" },
                      { id: "warm-earth", name: "Warm Earth", preview: "bg-gradient-to-br from-stone-100 to-amber-100 dark:from-stone-900 dark:to-amber-900", gradient: "linear-gradient(135deg, hsl(30 20% 94%) 0%, hsl(40 60% 92%) 100%)" },
                      { id: "royal-navy", name: "Royal Navy", preview: "bg-gradient-to-br from-blue-100 to-slate-200 dark:from-blue-950 dark:to-slate-800", gradient: "linear-gradient(135deg, hsl(215 60% 92%) 0%, hsl(220 30% 86%) 100%)" },
                    ].map(theme => {
                      const currentTheme = localStorage.getItem("app_bg_theme") || "default";
                      return (
                        <button
                          key={theme.id}
                          onClick={() => {
                            localStorage.setItem("app_bg_theme", theme.id);
                            localStorage.setItem("app_bg_gradient", theme.gradient);
                            document.documentElement.style.setProperty("--app-bg-theme", theme.gradient || "none");
                            setHasChanges(true);
                            toast({ title: "Theme Applied", description: `Background theme set to "${theme.name}". Save to persist.` });
                          }}
                          className={`relative h-20 rounded-lg border-2 transition-all overflow-hidden ${
                            currentTheme === theme.id ? "border-primary ring-2 ring-primary/20" : "border-border hover:border-primary/40"
                          } ${theme.preview}`}
                        >
                          <span className="absolute bottom-1 left-0 right-0 text-[10px] font-medium text-center bg-background/80 py-0.5 rounded-b">
                            {theme.name}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg"><Globe className="h-5 w-5 text-primary" />Language & Regional</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <SettingRow label="Language" description="Application display language" icon={Globe}>
                <Select value={language} onValueChange={setLanguage}>
                  <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="en">English</SelectItem>
                    <SelectItem value="fr">Français</SelectItem>
                    <SelectItem value="ha">Hausa</SelectItem>
                    <SelectItem value="ig">Igbo</SelectItem>
                    <SelectItem value="yo">Yorùbá</SelectItem>
                  </SelectContent>
                </Select>
              </SettingRow>
              <SettingRow label="Date Format" description="How dates are displayed throughout the app" icon={Clock}>
                <Select value={settings.dateFormat} onValueChange={val => updateSetting("dateFormat", val)}>
                  <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DD/MM/YYYY">DD/MM/YYYY</SelectItem>
                    <SelectItem value="MM/DD/YYYY">MM/DD/YYYY</SelectItem>
                    <SelectItem value="YYYY-MM-DD">YYYY-MM-DD</SelectItem>
                  </SelectContent>
                </Select>
              </SettingRow>
              <SettingRow label="Time Format" description="12-hour or 24-hour clock" icon={Clock}>
                <Select value={settings.timeFormat} onValueChange={val => updateSetting("timeFormat", val)}>
                  <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="12h">12-hour</SelectItem>
                    <SelectItem value="24h">24-hour</SelectItem>
                  </SelectContent>
                </Select>
              </SettingRow>
            </CardContent>
          </Card>
        </TabsContent>

        {/* NOTIFICATIONS */}
        <TabsContent value="notifications" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg"><Bell className="h-5 w-5 text-primary" />Notification Preferences</CardTitle>
              <CardDescription>Control how and when you receive alerts</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <SettingRow label="In-App Notifications" description="Show alerts for submissions, assignments, and updates" icon={Bell}>
                <Switch checked={settings.enableNotifications} onCheckedChange={val => updateSetting("enableNotifications", val)} />
              </SettingRow>
              <SettingRow label="Sound Effects" description="Play audio for incoming notifications" icon={Volume2}>
                <Switch checked={settings.soundEnabled} onCheckedChange={val => updateSetting("soundEnabled", val)} disabled={!settings.enableNotifications} />
              </SettingRow>
              <SettingRow label="Push Notifications" description="Receive browser push notifications when the app is in background" icon={Smartphone}>
                <Switch checked={settings.pushNotifications} onCheckedChange={val => updateSetting("pushNotifications", val)} disabled={!settings.enableNotifications} />
              </SettingRow>
              <SettingRow label="Email Digest" description="Frequency of email summary reports" icon={FileText}>
                <Select value={settings.emailDigest} onValueChange={val => updateSetting("emailDigest", val)} disabled={!settings.enableNotifications}>
                  <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                  </SelectContent>
                </Select>
              </SettingRow>
            </CardContent>
          </Card>
        </TabsContent>

        {/* DATA & SYNC */}
        <TabsContent value="data-sync" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg"><Wifi className="h-5 w-5 text-primary" />Synchronization</CardTitle>
              <CardDescription>Configure how data syncs between your device and the server</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <SettingRow label="Auto Sync" description="Automatically sync form submissions when online" icon={RefreshCcw}>
                <Switch checked={settings.autoSync} onCheckedChange={val => updateSetting("autoSync", val)} />
              </SettingRow>
              <SettingRow label="Sync on Wi-Fi Only" description="Prevent syncing over mobile data to save bandwidth" icon={Wifi}>
                <Switch checked={settings.syncOnWifiOnly} onCheckedChange={val => updateSetting("syncOnWifiOnly", val)} disabled={!settings.autoSync} />
              </SettingRow>
              <SettingRow label="Auto-Save Interval" description="Seconds between automatic draft saves" icon={Save}>
                <Select value={String(settings.autoSaveInterval)} onValueChange={val => updateSetting("autoSaveInterval", Number(val))}>
                  <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="15">15 sec</SelectItem>
                    <SelectItem value="30">30 sec</SelectItem>
                    <SelectItem value="60">1 min</SelectItem>
                    <SelectItem value="120">2 min</SelectItem>
                  </SelectContent>
                </Select>
              </SettingRow>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg"><Database className="h-5 w-5 text-primary" />Offline Storage</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <SettingRow label="Storage Limit" description="Maximum offline cache size in MB" icon={Database}>
                <Select value={String(settings.offlineStorageLimit)} onValueChange={val => updateSetting("offlineStorageLimit", Number(val))}>
                  <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="100">100 MB</SelectItem>
                    <SelectItem value="250">250 MB</SelectItem>
                    <SelectItem value="500">500 MB</SelectItem>
                    <SelectItem value="1000">1 GB</SelectItem>
                  </SelectContent>
                </Select>
              </SettingRow>
              <div className="flex gap-2 pt-2">
                <Button variant="outline" size="sm" className="gap-2" onClick={clearOfflineData}>
                  <Trash2 className="h-4 w-4" />Clear Offline Cache
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg"><Download className="h-5 w-5 text-primary" />Export Defaults</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <SettingRow label="Default Export Format" description="Preferred file format when exporting data" icon={FileText}>
                <Select value={settings.autoExportFormat} onValueChange={val => updateSetting("autoExportFormat", val)}>
                  <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="xlsx">Excel (.xlsx)</SelectItem>
                    <SelectItem value="csv">CSV (.csv)</SelectItem>
                  </SelectContent>
                </Select>
              </SettingRow>
            </CardContent>
          </Card>
        </TabsContent>

        {/* DATA COLLECTION */}
        <TabsContent value="collection" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg"><MapPin className="h-5 w-5 text-primary" />Location & GPS</CardTitle>
              <CardDescription>Configure geolocation capture for form submissions</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <SettingRow label="GPS Precision" description="Accuracy level for location capture" icon={MapPin}>
                <Select value={settings.gpsPrecision} onValueChange={val => updateSetting("gpsPrecision", val)}>
                  <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                  </SelectContent>
                </Select>
              </SettingRow>
              <SettingRow label="Require GPS" description="Force location capture on every submission" icon={MapPin}>
                <Switch checked={settings.requireGPS} onCheckedChange={val => updateSetting("requireGPS", val)} />
              </SettingRow>
              <SettingRow label="Default Map View" description="Map layer style for visualizations" icon={Globe}>
                <Select value={settings.defaultMapView} onValueChange={val => updateSetting("defaultMapView", val)}>
                  <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="street">Street</SelectItem>
                    <SelectItem value="satellite">Satellite</SelectItem>
                    <SelectItem value="terrain">Terrain</SelectItem>
                  </SelectContent>
                </Select>
              </SettingRow>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg"><Smartphone className="h-5 w-5 text-primary" />Media Capture</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <SettingRow label="Photo Quality" description="Resolution quality for captured photos" icon={Smartphone}>
                <Select value={settings.photoQuality} onValueChange={val => updateSetting("photoQuality", val)}>
                  <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                  </SelectContent>
                </Select>
              </SettingRow>
              <SettingRow label="Max Photo Size" description="Maximum file size per photo in MB" icon={Download}>
                <Select value={String(settings.maxPhotoSize)} onValueChange={val => updateSetting("maxPhotoSize", Number(val))}>
                  <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="2">2 MB</SelectItem>
                    <SelectItem value="5">5 MB</SelectItem>
                    <SelectItem value="10">10 MB</SelectItem>
                  </SelectContent>
                </Select>
              </SettingRow>
            </CardContent>
          </Card>
        </TabsContent>

        {/* SECURITY */}
        <TabsContent value="security" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg"><Shield className="h-5 w-5 text-primary" />Account Security</CardTitle>
              <CardDescription>Manage session and authentication settings</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <SettingRow label="Session Timeout" description="Auto-logout after minutes of inactivity" icon={Clock}>
                <Select value={String(settings.sessionTimeout)} onValueChange={val => updateSetting("sessionTimeout", Number(val))}>
                  <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="15">15 min</SelectItem>
                    <SelectItem value="30">30 min</SelectItem>
                    <SelectItem value="60">1 hour</SelectItem>
                    <SelectItem value="120">2 hours</SelectItem>
                  </SelectContent>
                </Select>
              </SettingRow>
              <SettingRow label="Two-Factor Authentication" description="Add an extra layer of security to your account" icon={Lock}>
                <Switch checked={settings.twoFactorEnabled} onCheckedChange={val => updateSetting("twoFactorEnabled", val)} />
              </SettingRow>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Login Information</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg border border-border p-4 space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Email</span>
                  <span className="font-medium text-foreground">{user?.email}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">User ID</span>
                  <span className="font-mono text-xs text-muted-foreground">{user?.id?.slice(0, 8)}...</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Last Sign In</span>
                  <span className="text-foreground">{user?.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleString() : "N/A"}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ADMIN */}
        {isAdmin && (
          <TabsContent value="admin" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg"><Shield className="h-5 w-5 text-destructive" />Administration</CardTitle>
                <CardDescription>Platform-wide settings (admin only)</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <SettingRow label="Data Retention" description="Number of days to retain submission data" icon={Database}>
                  <Select value={String(settings.dataRetentionDays)} onValueChange={val => updateSetting("dataRetentionDays", Number(val))}>
                    <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="90">90 days</SelectItem>
                      <SelectItem value="180">180 days</SelectItem>
                      <SelectItem value="365">1 year</SelectItem>
                      <SelectItem value="730">2 years</SelectItem>
                    </SelectContent>
                  </Select>
                </SettingRow>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg"><Eye className="h-5 w-5 text-primary" />Field Monitoring</CardTitle>
                <CardDescription>Advanced monitoring features for data collection verification</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <SettingRow label="Behavioral Monitoring" description="Track typing patterns, touch behavior, and interaction metrics during form filling" icon={Shield}>
                  <Switch checked={settings.enableBehavioralMonitoring} onCheckedChange={val => updateSetting("enableBehavioralMonitoring", val)} />
                </SettingRow>
                <SettingRow label="GPS Triangulation" description="Use GPS, Wi-Fi, and cellular triangulation to confirm collector locations" icon={MapPin}>
                  <Switch checked={settings.enableGpsTriangulation} onCheckedChange={val => updateSetting("enableGpsTriangulation", val)} />
                </SettingRow>
                <SettingRow label="Proximity Detection" description="Identify when data collectors are near each other in the field" icon={Eye}>
                  <Switch checked={settings.enableProximityDetection} onCheckedChange={val => updateSetting("enableProximityDetection", val)} />
                </SettingRow>
              </CardContent>
            </Card>

            <Card className="border-destructive/30">
              <CardHeader>
                <CardTitle className="text-destructive text-lg">Danger Zone</CardTitle>
                <CardDescription>Irreversible actions that affect all platform data</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between rounded-lg border border-destructive/30 p-4">
                  <div>
                    <p className="text-sm font-medium text-foreground">Clear All Offline Data</p>
                    <p className="text-xs text-muted-foreground">Remove all locally cached submissions and form data</p>
                  </div>
                  <Button variant="destructive" size="sm" onClick={clearOfflineData}>Clear Cache</Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
};

export default SettingsView;

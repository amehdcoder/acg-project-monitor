import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import {
  FlaskConical, Rocket, CalendarClock, ArrowRightLeft, CheckCircle2,
  AlertTriangle, Clock, Shield, Users, Save, Info, Loader2, Timer,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";

interface EnvironmentConfig {
  environment: "training" | "live";
  trainingStartDate: string;
  liveStartDate: string;
  autoMigrate: boolean;
  formId: string;
}

const ChangeEnvironmentView = () => {
  const { user, isAdmin, isOwner } = useAuth();
  const [projects, setProjects] = useState<any[]>([]);
  const [forms, setForms] = useState<any[]>([]);
  const [selectedProject, setSelectedProject] = useState("");
  const [selectedForm, setSelectedForm] = useState("");
  const [saving, setSaving] = useState(false);
  const [configs, setConfigs] = useState<Record<string, EnvironmentConfig>>({});
  const autoMigrateTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Load projects
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("projects").select("id, name").order("name");
      setProjects(data || []);
    })();
  }, []);

  // Load forms
  useEffect(() => {
    if (!selectedProject) { setForms([]); return; }
    (async () => {
      const { data } = await supabase.from("forms").select("id, name, status, settings").eq("project_id", selectedProject).order("name");
      setForms(data || []);
    })();
  }, [selectedProject]);

  // Load saved environment configs from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem("environment_configs");
      if (saved) setConfigs(JSON.parse(saved));
    } catch {}
  }, []);

  const currentConfig: EnvironmentConfig = useMemo(() => {
    if (configs[selectedForm]) return configs[selectedForm];
    return {
      environment: "training",
      trainingStartDate: "",
      liveStartDate: "",
      autoMigrate: true,
      formId: selectedForm,
    };
  }, [selectedForm, configs]);

  const updateConfig = useCallback((partial: Partial<EnvironmentConfig>) => {
    setConfigs(prev => {
      const current = prev[selectedForm] || {
        environment: "training",
        trainingStartDate: "",
        liveStartDate: "",
        autoMigrate: true,
        formId: selectedForm,
      };
      const updated = { ...current, ...partial, formId: selectedForm };
      const next = { ...prev, [selectedForm]: updated };
      localStorage.setItem("environment_configs", JSON.stringify(next));
      return next;
    });
  }, [selectedForm]);

  // Perform auto-migration
  const performAutoMigration = useCallback(async (formId: string) => {
    // Update local config
    updateConfig({ environment: "live" });

    // Persist to DB
    const form = forms.find(f => f.id === formId);
    const currentSettings = (form?.settings as any) || {};
    await supabase.from("forms").update({
      settings: { ...currentSettings, environment: "live" },
    }).eq("id", formId);

    toast({
      title: "🚀 Environment Auto-Migrated",
      description: "The form has automatically switched to Live environment based on the scheduled Go-Live date.",
    });
  }, [forms, updateConfig]);

  // Auto-migration interval check — runs every 30 seconds
  useEffect(() => {
    if (autoMigrateTimerRef.current) clearInterval(autoMigrateTimerRef.current);

    const checkAllMigrations = () => {
      Object.entries(configs).forEach(([formId, config]) => {
        if (
          config.autoMigrate &&
          config.liveStartDate &&
          config.environment === "training"
        ) {
          const liveDate = new Date(config.liveStartDate);
          if (new Date() >= liveDate) {
            performAutoMigration(formId);
          }
        }
      });
    };

    // Immediate check
    checkAllMigrations();

    // Poll every 30 seconds
    autoMigrateTimerRef.current = setInterval(checkAllMigrations, 30000);

    return () => {
      if (autoMigrateTimerRef.current) clearInterval(autoMigrateTimerRef.current);
    };
  }, [configs, performAutoMigration]);

  const handleSave = async () => {
    if (!selectedForm) return;
    setSaving(true);
    try {
      const form = forms.find(f => f.id === selectedForm);
      const currentSettings = (form?.settings as any) || {};
      const { error } = await supabase.from("forms").update({
        settings: {
          ...currentSettings,
          environment: currentConfig.environment,
          trainingStartDate: currentConfig.trainingStartDate,
          liveStartDate: currentConfig.liveStartDate,
          autoMigrate: currentConfig.autoMigrate,
        },
      }).eq("id", selectedForm);

      if (error) throw error;
      toast({ title: "Environment Saved", description: `Form is now in ${currentConfig.environment === "live" ? "Live" : "Training"} mode.` });
    } catch (err: any) {
      toast({ title: "Save Failed", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const toggleEnvironment = () => {
    const next = currentConfig.environment === "training" ? "live" : "training";
    updateConfig({ environment: next });
  };

  const isLive = currentConfig.environment === "live";

  const timeUntilLive = useMemo(() => {
    if (!currentConfig.liveStartDate) return null;
    const diff = new Date(currentConfig.liveStartDate).getTime() - Date.now();
    if (diff <= 0) return null;
    const days = Math.floor(diff / 86400000);
    const hours = Math.floor((diff % 86400000) / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);
    return { days, hours, minutes, total: diff };
  }, [currentConfig.liveStartDate]);

  const migrationProgress = useMemo(() => {
    if (!currentConfig.trainingStartDate || !currentConfig.liveStartDate) return null;
    const start = new Date(currentConfig.trainingStartDate).getTime();
    const end = new Date(currentConfig.liveStartDate).getTime();
    const now = Date.now();
    if (end <= start) return null;
    return Math.min(100, Math.max(0, ((now - start) / (end - start)) * 100));
  }, [currentConfig.trainingStartDate, currentConfig.liveStartDate]);

  return (
    <div className="space-y-4 sm:space-y-6 p-3 sm:p-4 lg:p-6 max-w-[1100px] mx-auto">
      {/* Header */}
      <div>
        <h1 className="font-display text-lg sm:text-xl md:text-2xl lg:text-3xl font-bold text-foreground flex items-center gap-2 sm:gap-3">
          <div className="p-2 sm:p-2.5 rounded-xl bg-gradient-to-br from-primary/20 to-accent/20 border border-primary/10">
            <ArrowRightLeft className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
          </div>
          Change Environment
        </h1>
        <p className="text-xs sm:text-sm md:text-base text-muted-foreground mt-1 sm:mt-1.5">
          Switch between Training and Live environments for your data collection forms
        </p>
      </div>

      {/* Environment Status Cards — stack on mobile */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
        <Card className={`relative overflow-hidden border-2 transition-all ${
          !isLive ? "border-amber-500/50 bg-gradient-to-br from-amber-50/50 to-orange-50/30 dark:from-amber-950/20 dark:to-orange-950/10" : "border-border"
        }`}>
          <div className={`absolute top-0 left-0 right-0 h-1 ${!isLive ? "bg-gradient-to-r from-amber-400 to-orange-500" : "bg-muted"}`} />
          <CardHeader className="pb-2 sm:pb-3 p-3 sm:p-6">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm sm:text-lg flex items-center gap-1.5 sm:gap-2">
                <div className={`p-1.5 sm:p-2 rounded-lg ${!isLive ? "bg-amber-100 dark:bg-amber-900/30" : "bg-muted"}`}>
                  <FlaskConical className={`h-4 w-4 sm:h-5 sm:w-5 ${!isLive ? "text-amber-600" : "text-muted-foreground"}`} />
                </div>
                Training
              </CardTitle>
              {!isLive && (
                <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-700 animate-pulse text-[10px] sm:text-xs">
                  Active
                </Badge>
              )}
            </div>
            <CardDescription className="text-xs sm:text-sm">
              Safe environment for demonstrations and practice
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 p-3 pt-0 sm:p-6 sm:pt-0">
            <div className="flex items-center gap-2 text-xs sm:text-sm">
              <Users className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground shrink-0" />
              <span className="text-muted-foreground">Practice without affecting real data</span>
            </div>
            <div className="flex items-center gap-2 text-xs sm:text-sm">
              <Shield className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground shrink-0" />
              <span className="text-muted-foreground">Submissions marked as training data</span>
            </div>
          </CardContent>
        </Card>

        <Card className={`relative overflow-hidden border-2 transition-all ${
          isLive ? "border-emerald-500/50 bg-gradient-to-br from-emerald-50/50 to-green-50/30 dark:from-emerald-950/20 dark:to-green-950/10" : "border-border"
        }`}>
          <div className={`absolute top-0 left-0 right-0 h-1 ${isLive ? "bg-gradient-to-r from-emerald-400 to-green-500" : "bg-muted"}`} />
          <CardHeader className="pb-2 sm:pb-3 p-3 sm:p-6">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm sm:text-lg flex items-center gap-1.5 sm:gap-2">
                <div className={`p-1.5 sm:p-2 rounded-lg ${isLive ? "bg-emerald-100 dark:bg-emerald-900/30" : "bg-muted"}`}>
                  <Rocket className={`h-4 w-4 sm:h-5 sm:w-5 ${isLive ? "text-emerald-600" : "text-muted-foreground"}`} />
                </div>
                Live
              </CardTitle>
              {isLive && (
                <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-700 text-[10px] sm:text-xs">
                  <span className="relative flex h-1.5 w-1.5 sm:h-2 sm:w-2 mr-1">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-full w-full bg-emerald-500" />
                  </span>
                  Active
                </Badge>
              )}
            </div>
            <CardDescription className="text-xs sm:text-sm">
              Production environment for real-world data collection
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 p-3 pt-0 sm:p-6 sm:pt-0">
            <div className="flex items-center gap-2 text-xs sm:text-sm">
              <CheckCircle2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground shrink-0" />
              <span className="text-muted-foreground">Submissions count as official data</span>
            </div>
            <div className="flex items-center gap-2 text-xs sm:text-sm">
              <Shield className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground shrink-0" />
              <span className="text-muted-foreground">Full validation and geofencing enforced</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Form Selection */}
      <Card className="border-0 shadow-md">
        <CardHeader className="p-3 sm:p-6 pb-2 sm:pb-4">
          <CardTitle className="text-sm sm:text-lg flex items-center gap-2">
            <span className="flex items-center justify-center h-6 w-6 sm:h-7 sm:w-7 rounded-full bg-primary text-primary-foreground text-[10px] sm:text-xs font-bold">1</span>
            Select Form
          </CardTitle>
          <CardDescription className="text-xs sm:text-sm">Choose the project and form to configure environment</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 p-3 pt-0 sm:p-6 sm:pt-0">
          <div>
            <Label className="text-xs sm:text-sm font-medium mb-1 sm:mb-1.5 block">Project</Label>
            <Select value={selectedProject} onValueChange={v => { setSelectedProject(v); setSelectedForm(""); }}>
              <SelectTrigger className="h-9 sm:h-10 text-xs sm:text-sm"><SelectValue placeholder="Select project..." /></SelectTrigger>
              <SelectContent>
                {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs sm:text-sm font-medium mb-1 sm:mb-1.5 block">Form</Label>
            <Select value={selectedForm} onValueChange={setSelectedForm} disabled={!selectedProject}>
              <SelectTrigger className="h-9 sm:h-10 text-xs sm:text-sm"><SelectValue placeholder="Select form..." /></SelectTrigger>
              <SelectContent>
                {forms.map(f => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Environment Configuration */}
      {selectedForm && (
        <>
          <Card className="border-0 shadow-md">
            <CardHeader className="p-3 sm:p-6 pb-2 sm:pb-4">
              <CardTitle className="text-sm sm:text-lg flex items-center gap-2">
                <span className="flex items-center justify-center h-6 w-6 sm:h-7 sm:w-7 rounded-full bg-primary text-primary-foreground text-[10px] sm:text-xs font-bold">2</span>
                Environment Configuration
              </CardTitle>
              <CardDescription className="text-xs sm:text-sm">Set environment mode and schedule dates</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 sm:space-y-6 p-3 pt-0 sm:p-6 sm:pt-0">
              {/* Toggle Switch — responsive layout */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 sm:p-4 rounded-xl border-2 border-dashed border-primary/20 bg-primary/5">
                <div className="flex items-center gap-2 sm:gap-3">
                  {isLive ? (
                    <Rocket className="h-5 w-5 sm:h-6 sm:w-6 text-emerald-600" />
                  ) : (
                    <FlaskConical className="h-5 w-5 sm:h-6 sm:w-6 text-amber-600" />
                  )}
                  <div>
                    <p className="text-sm sm:text-base font-semibold text-foreground">
                      Current: {isLive ? "Live" : "Training"}
                    </p>
                    <p className="text-[10px] sm:text-xs text-muted-foreground">
                      {isLive ? "Collecting real production data" : "Safe for demonstrations and practice"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 sm:gap-3 self-end sm:self-center">
                  <span className={`text-xs sm:text-sm font-medium ${!isLive ? "text-amber-600" : "text-muted-foreground"}`}>Training</span>
                  <Switch
                    checked={isLive}
                    onCheckedChange={toggleEnvironment}
                    className="data-[state=checked]:bg-emerald-500"
                  />
                  <span className={`text-xs sm:text-sm font-medium ${isLive ? "text-emerald-600" : "text-muted-foreground"}`}>Live</span>
                </div>
              </div>

              <Separator />

              {/* Date Settings — single column on mobile */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                <div className="space-y-1.5 sm:space-y-2">
                  <Label className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm font-medium">
                    <CalendarClock className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-amber-500" />
                    Training Start Date
                  </Label>
                  <Input
                    type="datetime-local"
                    value={currentConfig.trainingStartDate}
                    onChange={e => updateConfig({ trainingStartDate: e.target.value })}
                    className="border-amber-200 focus:ring-amber-400 h-9 sm:h-10 text-xs sm:text-sm"
                  />
                  <p className="text-[10px] sm:text-xs text-muted-foreground">When training sessions begin</p>
                </div>
                <div className="space-y-1.5 sm:space-y-2">
                  <Label className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm font-medium">
                    <CalendarClock className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-emerald-500" />
                    Go-Live Date
                  </Label>
                  <Input
                    type="datetime-local"
                    value={currentConfig.liveStartDate}
                    onChange={e => updateConfig({ liveStartDate: e.target.value })}
                    className="border-emerald-200 focus:ring-emerald-400 h-9 sm:h-10 text-xs sm:text-sm"
                  />
                  <p className="text-[10px] sm:text-xs text-muted-foreground">When form switches to live data collection</p>
                </div>
              </div>

              {/* Migration Progress Bar */}
              {migrationProgress !== null && !isLive && (
                <div className="space-y-2 p-3 sm:p-4 rounded-lg border bg-muted/20">
                  <div className="flex items-center justify-between">
                    <span className="text-xs sm:text-sm font-medium flex items-center gap-1.5">
                      <Timer className="h-3.5 w-3.5 text-primary" />
                      Training Progress
                    </span>
                    <span className="text-xs font-mono text-muted-foreground">{migrationProgress.toFixed(0)}%</span>
                  </div>
                  <Progress value={migrationProgress} className="h-2 [&>div]:bg-gradient-to-r [&>div]:from-amber-500 [&>div]:to-emerald-500" />
                </div>
              )}

              {/* Auto Migration */}
              <div className="flex items-center justify-between gap-3 p-3 sm:p-4 rounded-lg border bg-muted/30">
                <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                  <Clock className="h-4 w-4 sm:h-5 sm:w-5 text-primary shrink-0" />
                  <div className="min-w-0">
                    <Label className="font-medium text-xs sm:text-sm">Auto-Migrate to Live</Label>
                    <p className="text-[10px] sm:text-xs text-muted-foreground truncate">
                      Automatically switch on Go-Live date
                    </p>
                  </div>
                </div>
                <Switch
                  checked={currentConfig.autoMigrate}
                  onCheckedChange={v => updateConfig({ autoMigrate: v })}
                />
              </div>

              {/* Countdown */}
              {timeUntilLive && !isLive && currentConfig.autoMigrate && (
                <Alert className="border-emerald-200 bg-emerald-50/50 dark:bg-emerald-950/20">
                  <Timer className="h-4 w-4 text-emerald-600" />
                  <AlertTitle className="text-emerald-700 dark:text-emerald-400 text-xs sm:text-sm">Scheduled Migration</AlertTitle>
                  <AlertDescription className="text-emerald-600 dark:text-emerald-300 text-xs sm:text-sm">
                    Auto-migrating in{" "}
                    <strong>
                      {timeUntilLive.days > 0 && `${timeUntilLive.days}d `}
                      {timeUntilLive.hours > 0 && `${timeUntilLive.hours}h `}
                      {timeUntilLive.minutes}m
                    </strong>
                  </AlertDescription>
                </Alert>
              )}

              {isLive && (
                <Alert variant="destructive" className="border-amber-300 bg-amber-50 dark:bg-amber-950/20 text-amber-800 dark:text-amber-200 [&>svg]:text-amber-600">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle className="text-xs sm:text-sm">Live Mode Active</AlertTitle>
                  <AlertDescription className="text-xs sm:text-sm">
                    All submissions will be treated as real production data.
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>

          {/* Save Button */}
          <div className="flex justify-end gap-3">
            <Button variant="acg" onClick={handleSave} disabled={saving} className="gap-2 min-w-[140px] sm:min-w-[160px] h-9 sm:h-10 text-xs sm:text-sm">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saving ? "Saving..." : "Save Configuration"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
};

export default ChangeEnvironmentView;

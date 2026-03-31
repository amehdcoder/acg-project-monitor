import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  FlaskConical, Rocket, CalendarClock, ArrowRightLeft, CheckCircle2,
  AlertTriangle, Clock, Shield, Users, Save, Info, Loader2,
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

  const updateConfig = (partial: Partial<EnvironmentConfig>) => {
    const updated = { ...currentConfig, ...partial, formId: selectedForm };
    setConfigs(prev => {
      const next = { ...prev, [selectedForm]: updated };
      localStorage.setItem("environment_configs", JSON.stringify(next));
      return next;
    });
  };

  // Auto-migration check
  useEffect(() => {
    if (!currentConfig.autoMigrate || !currentConfig.liveStartDate) return;
    const liveDate = new Date(currentConfig.liveStartDate);
    if (new Date() >= liveDate && currentConfig.environment === "training") {
      updateConfig({ environment: "live" });
      toast({
        title: "🚀 Environment Auto-Migrated",
        description: "The form has automatically switched to Live environment based on the scheduled date.",
      });
    }
  }, [currentConfig]);

  const handleSave = async () => {
    if (!selectedForm) return;
    setSaving(true);
    try {
      // Save environment setting to form settings
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
  const daysUntilLive = currentConfig.liveStartDate
    ? Math.max(0, Math.ceil((new Date(currentConfig.liveStartDate).getTime() - Date.now()) / 86400000))
    : null;

  return (
    <div className="space-y-6 p-3 sm:p-4 lg:p-6 max-w-[1100px] mx-auto">
      {/* Header */}
      <div>
        <h1 className="font-display text-xl sm:text-2xl lg:text-3xl font-bold text-foreground flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-primary/20 to-accent/20 border border-primary/10">
            <ArrowRightLeft className="h-6 w-6 text-primary" />
          </div>
          Change Environment
        </h1>
        <p className="text-sm sm:text-base text-muted-foreground mt-1.5">
          Switch between Training and Live environments for your data collection forms
        </p>
      </div>

      {/* Environment Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className={`relative overflow-hidden border-2 transition-all ${
          !isLive ? "border-amber-500/50 bg-gradient-to-br from-amber-50/50 to-orange-50/30 dark:from-amber-950/20 dark:to-orange-950/10" : "border-border"
        }`}>
          <div className={`absolute top-0 left-0 right-0 h-1 ${!isLive ? "bg-gradient-to-r from-amber-400 to-orange-500" : "bg-muted"}`} />
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <div className={`p-2 rounded-lg ${!isLive ? "bg-amber-100 dark:bg-amber-900/30" : "bg-muted"}`}>
                  <FlaskConical className={`h-5 w-5 ${!isLive ? "text-amber-600" : "text-muted-foreground"}`} />
                </div>
                Training
              </CardTitle>
              {!isLive && (
                <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-700 animate-pulse">
                  Active
                </Badge>
              )}
            </div>
            <CardDescription>
              Safe environment for user demonstrations and practice
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2 text-sm">
              <Users className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Users can practice without affecting real data</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Shield className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Submissions marked as training data</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <FlaskConical className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">All features available for testing</span>
            </div>
          </CardContent>
        </Card>

        <Card className={`relative overflow-hidden border-2 transition-all ${
          isLive ? "border-emerald-500/50 bg-gradient-to-br from-emerald-50/50 to-green-50/30 dark:from-emerald-950/20 dark:to-green-950/10" : "border-border"
        }`}>
          <div className={`absolute top-0 left-0 right-0 h-1 ${isLive ? "bg-gradient-to-r from-emerald-400 to-green-500" : "bg-muted"}`} />
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <div className={`p-2 rounded-lg ${isLive ? "bg-emerald-100 dark:bg-emerald-900/30" : "bg-muted"}`}>
                  <Rocket className={`h-5 w-5 ${isLive ? "text-emerald-600" : "text-muted-foreground"}`} />
                </div>
                Live
              </CardTitle>
              {isLive && (
                <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-700">
                  <span className="relative flex h-2 w-2 mr-1.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                  </span>
                  Active
                </Badge>
              )}
            </div>
            <CardDescription>
              Production environment for real-world data collection
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2 text-sm">
              <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">All submissions count as official data</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Shield className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Full data validation and geofencing enforced</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Rocket className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Analytics and reports reflect real data</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Form Selection */}
      <Card className="border-0 shadow-md">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <span className="flex items-center justify-center h-7 w-7 rounded-full bg-primary text-primary-foreground text-xs font-bold">1</span>
            Select Form
          </CardTitle>
          <CardDescription>Choose the project and form to configure environment</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label className="text-sm font-medium mb-1.5 block">Project</Label>
            <Select value={selectedProject} onValueChange={v => { setSelectedProject(v); setSelectedForm(""); }}>
              <SelectTrigger><SelectValue placeholder="Select project..." /></SelectTrigger>
              <SelectContent>
                {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-sm font-medium mb-1.5 block">Form</Label>
            <Select value={selectedForm} onValueChange={setSelectedForm} disabled={!selectedProject}>
              <SelectTrigger><SelectValue placeholder="Select form..." /></SelectTrigger>
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
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <span className="flex items-center justify-center h-7 w-7 rounded-full bg-primary text-primary-foreground text-xs font-bold">2</span>
                Environment Configuration
              </CardTitle>
              <CardDescription>Set environment mode and schedule dates</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Toggle Switch */}
              <div className="flex items-center justify-between p-4 rounded-xl border-2 border-dashed border-primary/20 bg-primary/5">
                <div className="flex items-center gap-3">
                  {isLive ? (
                    <Rocket className="h-6 w-6 text-emerald-600" />
                  ) : (
                    <FlaskConical className="h-6 w-6 text-amber-600" />
                  )}
                  <div>
                    <p className="font-semibold text-foreground">
                      Current: {isLive ? "Live Environment" : "Training Environment"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {isLive ? "Collecting real production data" : "Safe for demonstrations and practice"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-sm font-medium ${!isLive ? "text-amber-600" : "text-muted-foreground"}`}>Training</span>
                  <Switch
                    checked={isLive}
                    onCheckedChange={toggleEnvironment}
                    className="data-[state=checked]:bg-emerald-500"
                  />
                  <span className={`text-sm font-medium ${isLive ? "text-emerald-600" : "text-muted-foreground"}`}>Live</span>
                </div>
              </div>

              <Separator />

              {/* Date Settings */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label className="flex items-center gap-2 text-sm font-medium">
                    <CalendarClock className="h-4 w-4 text-amber-500" />
                    Training Start Date
                  </Label>
                  <Input
                    type="datetime-local"
                    value={currentConfig.trainingStartDate}
                    onChange={e => updateConfig({ trainingStartDate: e.target.value })}
                    className="border-amber-200 focus:ring-amber-400"
                  />
                  <p className="text-xs text-muted-foreground">When training sessions begin</p>
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-2 text-sm font-medium">
                    <CalendarClock className="h-4 w-4 text-emerald-500" />
                    Go-Live Date
                  </Label>
                  <Input
                    type="datetime-local"
                    value={currentConfig.liveStartDate}
                    onChange={e => updateConfig({ liveStartDate: e.target.value })}
                    className="border-emerald-200 focus:ring-emerald-400"
                  />
                  <p className="text-xs text-muted-foreground">When form switches to live data collection</p>
                </div>
              </div>

              {/* Auto Migration */}
              <div className="flex items-center justify-between p-4 rounded-lg border bg-muted/30">
                <div className="flex items-center gap-3">
                  <Clock className="h-5 w-5 text-primary" />
                  <div>
                    <Label className="font-medium">Auto-Migrate to Live</Label>
                    <p className="text-xs text-muted-foreground">
                      Automatically switch to Live environment on the Go-Live date
                    </p>
                  </div>
                </div>
                <Switch
                  checked={currentConfig.autoMigrate}
                  onCheckedChange={v => updateConfig({ autoMigrate: v })}
                />
              </div>

              {daysUntilLive !== null && daysUntilLive > 0 && !isLive && (
                <Alert className="border-emerald-200 bg-emerald-50/50 dark:bg-emerald-950/20">
                  <Info className="h-4 w-4 text-emerald-600" />
                  <AlertTitle className="text-emerald-700 dark:text-emerald-400">Scheduled Migration</AlertTitle>
                  <AlertDescription className="text-emerald-600 dark:text-emerald-300">
                    This form will automatically switch to <strong>Live</strong> in <strong>{daysUntilLive} day{daysUntilLive !== 1 ? "s" : ""}</strong>
                    {currentConfig.autoMigrate ? "" : " (auto-migration is disabled)"}
                  </AlertDescription>
                </Alert>
              )}

              {isLive && (
                <Alert variant="destructive" className="border-amber-300 bg-amber-50 dark:bg-amber-950/20 text-amber-800 dark:text-amber-200 [&>svg]:text-amber-600">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Live Mode Active</AlertTitle>
                  <AlertDescription>
                    All submissions will be treated as real production data. Switching back to Training will not delete collected data.
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>

          {/* Save Button */}
          <div className="flex justify-end gap-3">
            <Button variant="acg" onClick={handleSave} disabled={saving} className="gap-2 min-w-[160px]">
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

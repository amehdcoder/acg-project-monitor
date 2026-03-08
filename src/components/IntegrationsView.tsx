import { useState, useEffect } from "react";
import {
  FileSpreadsheet,
  BarChart3,
  Link2,
  CheckCircle,
  AlertCircle,
  Settings,
  RefreshCw,
  ExternalLink,
  Play,
  Loader2,
  Info,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Form {
  id: string;
  name: string;
  project_id: string;
}

interface Project {
  id: string;
  name: string;
  looker_dashboard_url?: string | null;
}

const IntegrationsView = () => {
  const [sheetUrl, setSheetUrl] = useState("");
  const [sheetName, setSheetName] = useState("Sheet1");
  const [sheetRange, setSheetRange] = useState("");
  const [lookerUrl, setLookerUrl] = useState("");
  const [lookerProjectId, setLookerProjectId] = useState<string>("");
  const [autoSync, setAutoSync] = useState(true);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [selectedFormId, setSelectedFormId] = useState<string>("");
  const [syncMode, setSyncMode] = useState<"form" | "project">("form");
  const [forms, setForms] = useState<Form[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  const [lastSyncCount, setLastSyncCount] = useState<number | null>(null);
  const [isSavingLooker, setIsSavingLooker] = useState(false);
  const [lookerConnected, setLookerConnected] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      const [formsRes, projectsRes] = await Promise.all([
        supabase.from("forms").select("id, name, project_id").eq("status", "active"),
        supabase.from("projects").select("id, name, looker_dashboard_url").order("name"),
      ]);

      if (!formsRes.error && formsRes.data) setForms(formsRes.data);
      if (!projectsRes.error && projectsRes.data) {
        setProjects(projectsRes.data.map(p => ({
          id: p.id, name: p.name, looker_dashboard_url: p.looker_dashboard_url
        })));
      }
    };
    fetchData();
  }, []);

  // Filter forms by selected project
  const filteredForms = selectedProjectId
    ? forms.filter(f => f.project_id === selectedProjectId)
    : forms;

  // Reset form selection when project changes
  useEffect(() => {
    setSelectedFormId("");
  }, [selectedProjectId]);

  // Load existing Looker URL when project is selected
  useEffect(() => {
    if (lookerProjectId) {
      const project = projects.find(p => p.id === lookerProjectId);
      if (project && project.looker_dashboard_url) {
        setLookerUrl(project.looker_dashboard_url);
        setLookerConnected(true);
      } else {
        setLookerUrl("");
        setLookerConnected(false);
      }
    }
  }, [lookerProjectId, projects]);

  const extractSpreadsheetId = (url: string): string | null => {
    const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    return match ? match[1] : null;
  };

  const handleConnect = async () => {
    if (!sheetUrl) {
      toast({ title: "URL Required", description: "Please enter a Google Sheet URL.", variant: "destructive" });
      return;
    }

    const spreadsheetId = extractSpreadsheetId(sheetUrl);
    if (!spreadsheetId) {
      toast({ title: "Invalid URL", description: "Please enter a valid Google Sheets URL.", variant: "destructive" });
      return;
    }

    setIsConnected(true);
    toast({ title: "Connected to Google Sheets", description: "Your Google Sheet has been linked. You can now sync form data." });
  };

  const handleSyncData = async () => {
    if (syncMode === "form" && !selectedFormId) {
      toast({ title: "Form Required", description: "Please select a form to sync.", variant: "destructive" });
      return;
    }
    if (syncMode === "project" && !selectedProjectId) {
      toast({ title: "Project Required", description: "Please select a project to sync.", variant: "destructive" });
      return;
    }

    const spreadsheetId = extractSpreadsheetId(sheetUrl);
    if (!spreadsheetId) {
      toast({ title: "Invalid Sheet URL", description: "Please enter a valid Google Sheets URL.", variant: "destructive" });
      return;
    }

    setIsSyncing(true);

    try {
      // Let the edge function handle fetching submissions server-side
      const requestBody: any = {
        action: "sync",
        spreadsheetId,
        sheetName: sheetName || "Sheet1",
        range: sheetRange || undefined,
      };

      if (syncMode === "form") {
        requestBody.formId = selectedFormId;
      } else {
        requestBody.projectId = selectedProjectId;
      }

      const { data, error } = await supabase.functions.invoke("sync-google-sheets", {
        body: requestBody,
      });

      if (error) throw error;

      setLastSyncTime(new Date().toISOString());
      setLastSyncCount(data.rows || 0);
      toast({
        title: "Sync Complete",
        description: data.message || "Data synced to Google Sheets.",
      });
    } catch (error: any) {
      console.error("Sync error:", error);
      toast({
        title: "Sync Failed",
        description: error.message || "Failed to sync data to Google Sheets.",
        variant: "destructive",
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSaveSettings = () => {
    toast({ title: "Settings Saved", description: "Your integration settings have been updated." });
  };

  const handleSaveLookerUrl = async () => {
    if (!lookerProjectId) {
      toast({ title: "Project Required", description: "Please select a project.", variant: "destructive" });
      return;
    }
    if (!lookerUrl) {
      toast({ title: "URL Required", description: "Please enter a Looker Studio URL.", variant: "destructive" });
      return;
    }

    setIsSavingLooker(true);
    try {
      const { error } = await supabase
        .from("projects")
        .update({ looker_dashboard_url: lookerUrl })
        .eq("id", lookerProjectId);

      if (error) throw error;

      setProjects(prev => prev.map(p =>
        p.id === lookerProjectId ? { ...p, looker_dashboard_url: lookerUrl } : p
      ));
      setLookerConnected(true);
      toast({
        title: "Looker Studio Connected",
        description: "This dashboard will now appear in the Custom Dashboards for the selected project.",
      });
    } catch (error: any) {
      console.error("Error saving Looker URL:", error);
      toast({ title: "Error", description: "Failed to save Looker Studio URL.", variant: "destructive" });
    } finally {
      setIsSavingLooker(false);
    }
  };

  const integrations = [
    {
      id: "google-sheets",
      name: "Google Sheets",
      description: "Automatically sync your form data to Google Sheets for easy analysis and sharing",
      icon: FileSpreadsheet,
      connected: isConnected,
      lastSync: lastSyncTime || undefined,
    },
    {
      id: "looker-studio",
      name: "Google Looker Studio",
      description: "Create beautiful dashboards and reports with your collected data",
      icon: BarChart3,
      connected: lookerConnected,
    },
  ];

  const selectedProjectName = projects.find(p => p.id === selectedProjectId)?.name;
  const selectedFormName = forms.find(f => f.id === selectedFormId)?.name;

  return (
    <div className="space-y-6 p-4 lg:p-6">
      {/* Header */}
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground lg:text-3xl">
          Integrations
        </h1>
        <p className="text-muted-foreground">
          Connect your data with Google Sheets and Looker Studio
        </p>
      </div>

      {/* Integration Cards */}
      <div className="grid gap-6 lg:grid-cols-2">
        {integrations.map((integration) => (
          <Card key={integration.id} className="border-0 shadow-card overflow-hidden">
            <CardHeader className="bg-gradient-to-r from-muted/50 to-transparent pb-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-4">
                  <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary/10">
                    <integration.icon className="h-7 w-7 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="font-display text-xl">
                      {integration.name}
                    </CardTitle>
                    <div className="mt-1 flex items-center gap-2">
                      {integration.connected ? (
                        <>
                          <CheckCircle className="h-4 w-4 text-green-500" />
                          <span className="text-sm text-green-600">Connected</span>
                        </>
                      ) : (
                        <>
                          <AlertCircle className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm text-muted-foreground">Not connected</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
              <CardDescription className="text-base">
                {integration.description}
              </CardDescription>

              {integration.id === "google-sheets" && (
                <div className="space-y-4">
                  {/* Sheet URL */}
                  <div className="space-y-2">
                    <Label htmlFor="sheet-url">Google Sheet URL</Label>
                    <Input
                      id="sheet-url"
                      placeholder="https://docs.google.com/spreadsheets/d/..."
                      value={sheetUrl}
                      onChange={(e) => setSheetUrl(e.target.value)}
                    />
                  </div>

                  {/* Sheet Name & Range */}
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="sheet-name">Sheet Name</Label>
                      <Input
                        id="sheet-name"
                        placeholder="Sheet1"
                        value={sheetName}
                        onChange={(e) => setSheetName(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="sheet-range">Range (optional)</Label>
                      <Input
                        id="sheet-range"
                        placeholder="e.g., A1:Z1000"
                        value={sheetRange}
                        onChange={(e) => setSheetRange(e.target.value)}
                      />
                    </div>
                  </div>

                  {/* Sync Mode Toggle */}
                  <div className="space-y-2">
                    <Label>Sync Mode</Label>
                    <div className="flex gap-2">
                      <Button
                        variant={syncMode === "form" ? "default" : "outline"}
                        size="sm"
                        onClick={() => setSyncMode("form")}
                        className="flex-1"
                      >
                        Single Form
                      </Button>
                      <Button
                        variant={syncMode === "project" ? "default" : "outline"}
                        size="sm"
                        onClick={() => setSyncMode("project")}
                        className="flex-1"
                      >
                        Entire Project
                      </Button>
                    </div>
                  </div>

                  {/* Project Selector */}
                  <div className="space-y-2">
                    <Label htmlFor="sheets-project">Select Project</Label>
                    <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
                      <SelectTrigger id="sheets-project">
                        <SelectValue placeholder="Choose a project" />
                      </SelectTrigger>
                      <SelectContent>
                        {projects.map((p) => (
                          <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Form Selector (only in form mode) */}
                  {syncMode === "form" && (
                    <div className="space-y-2">
                      <Label htmlFor="form-select">Select Form</Label>
                      <Select value={selectedFormId} onValueChange={setSelectedFormId}>
                        <SelectTrigger id="form-select">
                          <SelectValue placeholder={
                            selectedProjectId
                              ? (filteredForms.length > 0 ? "Choose a form" : "No published forms in this project")
                              : "Select a project first"
                          } />
                        </SelectTrigger>
                        <SelectContent>
                          {filteredForms.map((form) => (
                            <SelectItem key={form.id} value={form.id}>{form.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {/* Info about sync behavior */}
                  <div className="flex items-start gap-3 rounded-lg bg-primary/5 border border-primary/20 p-3">
                    <Info className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                    <p className="text-xs text-muted-foreground">
                      {syncMode === "project"
                        ? "All submissions from all forms in the selected project will be synced. A \"Form Name\" column will be included."
                        : "Submissions from the selected form will be synced. Each sync replaces the sheet data with the latest submissions to avoid duplicates."}
                    </p>
                  </div>

                  {/* Auto-sync toggle */}
                  <div className="flex items-center justify-between rounded-lg bg-muted/50 p-3">
                    <div>
                      <p className="font-medium text-foreground">Auto-sync data</p>
                      <p className="text-sm text-muted-foreground">Automatically sync new submissions</p>
                    </div>
                    <Switch checked={autoSync} onCheckedChange={setAutoSync} />
                  </div>

                  {/* Last sync info */}
                  {lastSyncTime && (
                    <div className="rounded-lg bg-green-50 p-3 dark:bg-green-950/30">
                      <p className="text-sm text-green-700 dark:text-green-400">
                        Last synced: {new Date(lastSyncTime).toLocaleString()}
                        {lastSyncCount !== null && ` • ${lastSyncCount} submissions`}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {integration.id === "looker-studio" && (
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label htmlFor="looker-project">Select Project</Label>
                    <Select value={lookerProjectId} onValueChange={setLookerProjectId}>
                      <SelectTrigger id="looker-project">
                        <SelectValue placeholder="Choose a project" />
                      </SelectTrigger>
                      <SelectContent>
                        {projects.map((p) => (
                          <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="looker-url">Looker Studio Dashboard URL</Label>
                    <Input
                      id="looker-url"
                      placeholder="https://lookerstudio.google.com/reporting/..."
                      value={lookerUrl}
                      onChange={(e) => setLookerUrl(e.target.value)}
                    />
                  </div>
                  <div className="rounded-lg bg-acg-gold/10 p-3">
                    <p className="text-sm text-foreground">
                      <span className="font-medium">Tip:</span> Once saved, this Looker Studio
                      dashboard will be displayed in the <strong>Custom Dashboards</strong> section for the selected project's forms, rendering exactly as it appears on Google Looker Studio.
                    </p>
                  </div>
                  {lookerConnected && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-destructive"
                      onClick={async () => {
                        try {
                          await supabase
                            .from("projects")
                            .update({ looker_dashboard_url: null })
                            .eq("id", lookerProjectId);
                          setProjects(prev => prev.map(p =>
                            p.id === lookerProjectId ? { ...p, looker_dashboard_url: null } : p
                          ));
                          setLookerUrl("");
                          setLookerConnected(false);
                          toast({ title: "Disconnected", description: "Looker Studio dashboard removed from this project." });
                        } catch {
                          toast({ title: "Error", description: "Failed to disconnect.", variant: "destructive" });
                        }
                      }}
                    >
                      Disconnect Looker Studio
                    </Button>
                  )}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                {integration.id === "google-sheets" ? (
                  <>
                    <Button
                      variant="acg"
                      className="flex-1"
                      onClick={handleConnect}
                      disabled={!sheetUrl}
                    >
                      <Link2 className="h-4 w-4" />
                      {integration.connected ? "Reconnect" : "Connect"}
                    </Button>
                    {integration.connected && (
                      <Button
                        variant="outline"
                        onClick={handleSyncData}
                        disabled={isSyncing || (syncMode === "form" ? !selectedFormId : !selectedProjectId)}
                      >
                        {isSyncing ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Play className="mr-2 h-4 w-4" />
                        )}
                        Sync Now
                      </Button>
                    )}
                  </>
                ) : (
                  <Button
                    variant="acg"
                    className="flex-1"
                    onClick={handleSaveLookerUrl}
                    disabled={!lookerUrl || !lookerProjectId || isSavingLooker}
                  >
                    {isSavingLooker ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Link2 className="h-4 w-4 mr-2" />
                    )}
                    {lookerConnected ? "Update Dashboard" : "Save & Connect"}
                  </Button>
                )}
                {integration.connected && integration.id === "google-sheets" && (
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => window.open(sheetUrl, "_blank")}
                  >
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Settings Card */}
      <Card className="border-0 shadow-card">
        <CardHeader>
          <CardTitle className="font-display flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Integration Settings
          </CardTitle>
          <CardDescription>
            Configure how your data flows between ACG Monitor and external services
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="sync-interval">Sync Interval</Label>
              <select
                id="sync-interval"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="realtime">Real-time</option>
                <option value="5min">Every 5 minutes</option>
                <option value="15min">Every 15 minutes</option>
                <option value="1hour">Every hour</option>
                <option value="manual">Manual only</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="data-format">Data Format</Label>
              <select
                id="data-format"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="json">JSON</option>
                <option value="csv">CSV</option>
                <option value="excel">Excel</option>
              </select>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg bg-muted/50 p-4">
            <div>
              <p className="font-medium text-foreground">Include Metadata</p>
              <p className="text-sm text-muted-foreground">
                Include submission timestamps, location, and device info
              </p>
            </div>
            <Switch defaultChecked />
          </div>

          <div className="flex items-center justify-between rounded-lg bg-muted/50 p-4">
            <div>
              <p className="font-medium text-foreground">Notify on Sync Errors</p>
              <p className="text-sm text-muted-foreground">
                Receive alerts when data sync fails
              </p>
            </div>
            <Switch defaultChecked />
          </div>

          <div className="flex justify-end pt-4">
            <Button variant="acg" onClick={handleSaveSettings}>
              Save Settings
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Help Section */}
      <Card className="border border-acg-gold/30 bg-acg-gold/5">
        <CardContent className="flex flex-col items-center gap-4 py-8 text-center sm:flex-row sm:text-left">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-acg-gold/20">
            <BarChart3 className="h-8 w-8 text-acg-gold" />
          </div>
          <div className="flex-1">
            <h3 className="font-display text-lg font-semibold text-foreground">
              Need help setting up integrations?
            </h3>
            <p className="mt-1 text-muted-foreground">
              Our team can help you connect your data sources and create custom dashboards
              for your monitoring needs.
            </p>
          </div>
          <Button variant="gold">Contact Support</Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default IntegrationsView;

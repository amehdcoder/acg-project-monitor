import { useState, useEffect } from "react";
import ExternalConnectorsView from "./ExternalConnectorsView";
import * as XLSX from "xlsx";
import {
  Download,
  FileSpreadsheet,
  BarChart3,
  Link2,
  CheckCircle,
  AlertCircle,
  Settings,
  ExternalLink,
  Play,
  Loader2,
  Info,
  History,
  XCircle,
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
import { Badge } from "@/components/ui/badge";

interface Form {
  id: string;
  name: string;
  project_id: string;
  looker_dashboard_url?: string | null;
}

interface Project {
  id: string;
  name: string;
}

interface SyncHistoryEntry {
  id: string;
  sync_type: string;
  row_count: number;
  status: string;
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
  sheet_name: string | null;
}

const IntegrationsView = () => {
  const [sheetUrl, setSheetUrl] = useState("");
  const [sheetName, setSheetName] = useState("Sheet1");
  const [sheetRange, setSheetRange] = useState("");
  const [lookerUrl, setLookerUrl] = useState("");
  const [lookerProjectId, setLookerProjectId] = useState<string>("");
  const [lookerFormId, setLookerFormId] = useState<string>("");
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [selectedFormId, setSelectedFormId] = useState<string>("");
  const [syncMode, setSyncMode] = useState<"form" | "project">("form");
  const [forms, setForms] = useState<Form[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  const [lastSyncCount, setLastSyncCount] = useState<number | null>(null);
  const [isSavingLooker, setIsSavingLooker] = useState(false);
  const [lookerConnected, setLookerConnected] = useState(false);
  const [syncHistory, setSyncHistory] = useState<SyncHistoryEntry[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      const [formsRes, projectsRes] = await Promise.all([
        supabase.from("forms").select("id, name, project_id, looker_dashboard_url").eq("status", "active"),
        supabase.from("projects").select("id, name").order("name"),
      ]);

      if (!formsRes.error && formsRes.data) setForms(formsRes.data as Form[]);
      if (!projectsRes.error && projectsRes.data) {
        setProjects(projectsRes.data.map(p => ({
          id: p.id, name: p.name
        })));
      }
    };
    fetchData();
    fetchSyncHistory();
  }, []);

  const fetchSyncHistory = async () => {
    const { data } = await supabase
      .from("sync_history")
      .select("id, sync_type, row_count, status, error_message, started_at, completed_at, sheet_name")
      .order("started_at", { ascending: false })
      .limit(20);
    if (data) setSyncHistory(data as SyncHistoryEntry[]);
  };

  const filteredForms = selectedProjectId
    ? forms.filter(f => f.project_id === selectedProjectId)
    : forms;

  useEffect(() => {
    setSelectedFormId("");
  }, [selectedProjectId]);

  // Reset looker form when project changes
  useEffect(() => {
    setLookerFormId("");
    setLookerUrl("");
    setLookerConnected(false);
  }, [lookerProjectId]);

  // Load Looker URL when form is selected
  useEffect(() => {
    if (lookerFormId) {
      const form = forms.find(f => f.id === lookerFormId);
      if (form && form.looker_dashboard_url) {
        setLookerUrl(form.looker_dashboard_url);
        setLookerConnected(true);
      } else {
        setLookerUrl("");
        setLookerConnected(false);
      }
    }
  }, [lookerFormId, forms]);


  const extractSpreadsheetId = (url: string): string | null => {
    const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    return match ? match[1] : null;
  };

  const handleConnect = () => {
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
    toast({ title: "Connected to Google Sheets", description: "Your Google Sheet has been linked. You can now sync or export form data." });
  };

  // Flatten nested objects for spreadsheet format
  const flattenObject = (obj: any, prefix = ''): Record<string, any> => {
    const result: Record<string, any> = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        const newKey = prefix ? `${prefix}_${key}` : key;
        const value = obj[key];
        if (value === null || value === undefined) {
          result[newKey] = '';
        } else if (Array.isArray(value)) {
          result[newKey] = value.map(v => typeof v === 'object' ? JSON.stringify(v) : String(v)).join(', ');
        } else if (typeof value === 'object' && !(value instanceof Date)) {
          Object.assign(result, flattenObject(value, newKey));
        } else if (typeof value === 'boolean') {
          result[newKey] = value ? 'Yes' : 'No';
        } else {
          result[newKey] = String(value);
        }
      }
    }
    return result;
  };

  const formatLocation = (location: any): { latitude: string; longitude: string } => {
    if (!location) return { latitude: '', longitude: '' };
    if (typeof location === 'string') {
      try { location = JSON.parse(location); } catch { return { latitude: '', longitude: '' }; }
    }
    return {
      latitude: location.lat?.toString() || location.latitude?.toString() || '',
      longitude: location.lng?.toString() || location.longitude?.toString() || ''
    };
  };

  // Fetch submissions helper
  const fetchSubmissions = async () => {
    let submissions: any[] = [];
    let formNameMap: Record<string, string> = {};

    if (syncMode === "form") {
      const { data, error } = await supabase
        .from("form_submissions")
        .select("*")
        .eq("form_id", selectedFormId)
        .in("status", ["sent", "submitted", "draft"])
        .order("submitted_at", { ascending: true });
      if (error) throw error;
      submissions = data || [];
    } else {
      const { data: projectForms, error: formsError } = await supabase
        .from("forms")
        .select("id, name")
        .eq("project_id", selectedProjectId);
      if (formsError) throw formsError;

      const formIds = (projectForms || []).map(f => f.id);
      (projectForms || []).forEach(f => { formNameMap[f.id] = f.name; });

      if (formIds.length === 0) return [];

      const { data, error } = await supabase
        .from("form_submissions")
        .select("*")
        .in("form_id", formIds)
        .in("status", ["sent", "submitted", "draft"])
        .order("submitted_at", { ascending: true });
      if (error) throw error;
      submissions = (data || []).map(s => ({ ...s, _form_name: formNameMap[s.form_id] || s.form_id }));
    }
    return submissions;
  };

  // Build flattened rows from submissions — with iteration numbering for repeat groups
  const buildRows = (submissions: any[]) => {
    const hasFormName = submissions.some(s => s._form_name);
    return submissions.map(sub => {
      const flatData = sub.data ? flattenObject(sub.data) : {};
      const location = formatLocation(sub.location);
      const row: Record<string, any> = {
        "Submission ID": sub.id || "",
        ...(hasFormName ? { "Form Name": sub._form_name || "" } : {}),
        "Submitted At": sub.submitted_at || sub.created_at || "",
        "Status": sub.status === 'sent' ? 'Synced' : (sub.status || 'Pending'),
        "Latitude": location.latitude,
        "Longitude": location.longitude,
        "Within Geofence": sub.within_geofence === true ? 'Yes' : sub.within_geofence === false ? 'No' : 'N/A',
      };
      for (const key in flatData) {
        // Detect iteration keys: questionId__iterationIndex
        const iterMatch = key.match(/^(.+)__(\d+)$/);
        let cleanKey: string;
        if (iterMatch) {
          const baseName = iterMatch[1].replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
          cleanKey = `${baseName} [Iteration ${parseInt(iterMatch[2]) + 1}]`;
        } else {
          cleanKey = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        }
        row[cleanKey] = flatData[key];
      }
      return row;
    });
  };

  // Direct sync to Google Sheets via edge function
  const handleSyncToSheets = async () => {
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
      toast({ title: "Invalid Sheet URL", description: "Please connect a valid Google Sheet first.", variant: "destructive" });
      return;
    }

    setIsSyncing(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast({ title: "Auth Error", description: "Please log in again.", variant: "destructive" });
      setIsSyncing(false);
      return;
    }

    const { data: historyEntry } = await supabase
      .from("sync_history")
      .insert({
        user_id: user.id,
        sync_type: "google_sheets",
        project_id: syncMode === "project" ? selectedProjectId : (forms.find(f => f.id === selectedFormId)?.project_id || null),
        form_id: syncMode === "form" ? selectedFormId : null,
        spreadsheet_id: spreadsheetId,
        sheet_name: sheetName || "Sheet1",
        status: "in_progress",
      })
      .select("id")
      .single();

    try {
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

      if (historyEntry?.id) {
        await supabase.from("sync_history").update({
          status: "success",
          row_count: data.rows || 0,
          completed_at: new Date().toISOString(),
        }).eq("id", historyEntry.id);
      }

      setLastSyncTime(new Date().toISOString());
      setLastSyncCount(data.rows || 0);
      toast({ title: "Sync Complete", description: data.message || "Data synced to Google Sheets." });
    } catch (error: any) {
      console.error("Sync error:", error);
      if (historyEntry?.id) {
        await supabase.from("sync_history").update({
          status: "failed",
          error_message: error.message || "Unknown error",
          completed_at: new Date().toISOString(),
        }).eq("id", historyEntry.id);
      }
      toast({ title: "Sync Failed", description: error.message || "Failed to sync data to Google Sheets.", variant: "destructive" });
    } finally {
      setIsSyncing(false);
      fetchSyncHistory();
    }
  };

  // Export as Excel or CSV
  const handleExport = async (format: "xlsx" | "csv") => {
    if (syncMode === "form" && !selectedFormId) {
      toast({ title: "Form Required", description: "Please select a form to export.", variant: "destructive" });
      return;
    }
    if (syncMode === "project" && !selectedProjectId) {
      toast({ title: "Project Required", description: "Please select a project to export.", variant: "destructive" });
      return;
    }

    setIsExporting(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast({ title: "Auth Error", description: "Please log in again.", variant: "destructive" });
      setIsExporting(false);
      return;
    }

    const { data: historyEntry } = await supabase
      .from("sync_history")
      .insert({
        user_id: user.id,
        sync_type: `${format}_export`,
        project_id: syncMode === "project" ? selectedProjectId : (forms.find(f => f.id === selectedFormId)?.project_id || null),
        form_id: syncMode === "form" ? selectedFormId : null,
        sheet_name: sheetName || "Sheet1",
        status: "in_progress",
      })
      .select("id")
      .single();

    try {
      const submissions = await fetchSubmissions();

      if (submissions.length === 0) {
        toast({ title: "No Data", description: "No submissions found to export." });
        if (historyEntry?.id) {
          await supabase.from("sync_history").update({ status: "success", row_count: 0, completed_at: new Date().toISOString() }).eq("id", historyEntry.id);
        }
        setIsExporting(false);
        fetchSyncHistory();
        return;
      }

      const rows = buildRows(submissions);
      const worksheet = XLSX.utils.json_to_sheet(rows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, sheetName || "Sheet1");

      const baseName = syncMode === "project"
        ? (selectedProjectName || "project")
        : (selectedFormName || "form");

      if (format === "csv") {
        const csvContent = XLSX.utils.sheet_to_csv(worksheet);
        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `${baseName}_submissions.csv`;
        link.click();
        URL.revokeObjectURL(url);
      } else {
        XLSX.writeFile(workbook, `${baseName}_submissions.xlsx`);
      }

      if (historyEntry?.id) {
        await supabase.from("sync_history").update({
          status: "success",
          row_count: submissions.length,
          completed_at: new Date().toISOString(),
        }).eq("id", historyEntry.id);
      }

      setLastSyncTime(new Date().toISOString());
      setLastSyncCount(submissions.length);
      toast({
        title: "Export Complete",
        description: `Exported ${submissions.length} submissions as ${format.toUpperCase()}.`,
      });
    } catch (error: any) {
      console.error("Export error:", error);
      if (historyEntry?.id) {
        await supabase.from("sync_history").update({
          status: "failed",
          error_message: error.message || "Unknown error",
          completed_at: new Date().toISOString(),
        }).eq("id", historyEntry.id);
      }
      toast({ title: "Export Failed", description: error.message || "Failed to export data.", variant: "destructive" });
    } finally {
      setIsExporting(false);
      fetchSyncHistory();
    }
  };

  const handleSaveLookerUrl = async () => {
    if (!lookerFormId) {
      toast({ title: "Form Required", description: "Please select a form.", variant: "destructive" });
      return;
    }
    if (!lookerUrl) {
      toast({ title: "URL Required", description: "Please enter a Looker Studio URL.", variant: "destructive" });
      return;
    }

    setIsSavingLooker(true);
    try {
      const { error } = await supabase
        .from("forms")
        .update({ looker_dashboard_url: lookerUrl } as any)
        .eq("id", lookerFormId);

      if (error) throw error;

      setForms(prev => prev.map(f =>
        f.id === lookerFormId ? { ...f, looker_dashboard_url: lookerUrl } : f
      ));
      setLookerConnected(true);
      const formName = forms.find(f => f.id === lookerFormId)?.name || "form";
      toast({
        title: "Looker Studio Connected",
        description: `This dashboard will now appear in Custom Dashboards for "${formName}".`,
      });
    } catch (error: any) {
      console.error("Error saving Looker URL:", error);
      toast({ title: "Error", description: "Failed to save Looker Studio URL.", variant: "destructive" });
    } finally {
      setIsSavingLooker(false);
    }
  };

  const handleSaveSettings = () => {
    toast({ title: "Settings Saved", description: "Your integration settings have been updated." });
  };

  const integrations = [
    {
      id: "google-sheets",
      name: "Google Sheets Integration",
      description: "Sync form data directly to Google Sheets or export as Excel/CSV files",
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
      <div className="grid gap-6 md:grid-cols-1 lg:grid-cols-2">
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
                  {/* Google Sheet URL for direct sync */}
                  <div className="space-y-2">
                    <Label htmlFor="sheet-url">Google Sheet URL</Label>
                    <Input
                      id="sheet-url"
                      placeholder="https://docs.google.com/spreadsheets/d/..."
                      value={sheetUrl}
                      onChange={(e) => setSheetUrl(e.target.value)}
                    />
                  </div>

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

                  {syncMode === "form" && (
                    <div className="space-y-2">
                      <Label htmlFor="form-select">Select Form</Label>
                      <Select value={selectedFormId} onValueChange={setSelectedFormId}>
                        <SelectTrigger id="form-select">
                          <SelectValue placeholder={
                            selectedProjectId
                              ? (filteredForms.length > 0 ? "Choose a form" : "No active forms in this project")
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

                  <div className="flex items-start gap-3 rounded-lg bg-primary/5 border border-primary/20 p-3">
                    <Info className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                    <p className="text-xs text-muted-foreground">
                      {syncMode === "project"
                        ? "All submissions from all forms in the selected project will be synced. A \"Form Name\" column will be included."
                        : "Submissions from the selected form will be synced. Each sync replaces the sheet data with the latest submissions to avoid duplicates."}
                    </p>
                  </div>

                  {lastSyncTime && (
                    <div className="rounded-lg bg-green-50 p-3 dark:bg-green-950/30 space-y-2">
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

                  {lookerProjectId && (
                    <div className="space-y-2">
                      <Label htmlFor="looker-form">Select Form</Label>
                      <Select value={lookerFormId} onValueChange={setLookerFormId}>
                        <SelectTrigger id="looker-form">
                          <SelectValue placeholder={
                            forms.filter(f => f.project_id === lookerProjectId).length > 0
                              ? "Choose a form"
                              : "No active forms in this project"
                          } />
                        </SelectTrigger>
                        <SelectContent>
                          {forms
                            .filter(f => f.project_id === lookerProjectId)
                            .map((form) => (
                              <SelectItem key={form.id} value={form.id}>{form.name}</SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

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
                      dashboard will be displayed in the <strong>Custom Dashboards</strong> section for the selected form, rendering exactly as it appears on Google Looker Studio.
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
                            .from("forms")
                            .update({ looker_dashboard_url: null } as any)
                            .eq("id", lookerFormId);
                          setForms(prev => prev.map(f =>
                            f.id === lookerFormId ? { ...f, looker_dashboard_url: null } : f
                          ));
                          setLookerUrl("");
                          setLookerConnected(false);
                          toast({ title: "Disconnected", description: "Looker Studio dashboard removed from this form." });
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

              <div className="flex flex-col gap-3 pt-2">
                {integration.id === "google-sheets" ? (
                  <>
                    {/* Connect + Direct Sync */}
                    <div className="flex gap-2">
                      <Button
                        variant="acg"
                        className="flex-1"
                        onClick={handleConnect}
                        disabled={!sheetUrl}
                      >
                        <Link2 className="h-4 w-4 mr-2" />
                        {isConnected ? "Reconnect" : "Connect Sheet"}
                      </Button>
                      {isConnected && (
                        <>
                          <Button
                            variant="outline"
                            onClick={handleSyncToSheets}
                            disabled={isSyncing || (syncMode === "form" ? !selectedFormId : !selectedProjectId)}
                          >
                            {isSyncing ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                              <Play className="mr-2 h-4 w-4" />
                            )}
                            {isSyncing ? "Syncing..." : "Sync to Sheet"}
                          </Button>
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={() => window.open(sheetUrl, "_blank")}
                          >
                            <ExternalLink className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                    </div>
                    {/* Export buttons */}
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        className="flex-1"
                        onClick={() => handleExport("xlsx")}
                        disabled={isExporting || (syncMode === "form" ? !selectedFormId : !selectedProjectId)}
                      >
                        {isExporting ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Download className="mr-2 h-4 w-4" />
                        )}
                        Export Excel
                      </Button>
                      <Button
                        variant="outline"
                        className="flex-1"
                        onClick={() => handleExport("csv")}
                        disabled={isExporting || (syncMode === "form" ? !selectedFormId : !selectedProjectId)}
                      >
                        {isExporting ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Download className="mr-2 h-4 w-4" />
                        )}
                        Export CSV
                      </Button>
                    </div>
                  </>
                ) : (
                  <Button
                    variant="acg"
                    className="flex-1"
                    onClick={handleSaveLookerUrl}
                    disabled={!lookerUrl || !lookerFormId || isSavingLooker}
                  >
                    {isSavingLooker ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Link2 className="h-4 w-4 mr-2" />
                    )}
                    {lookerConnected ? "Update Dashboard" : "Save & Connect"}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Sync History */}
      <Card className="border-0 shadow-card">
        <CardHeader>
          <CardTitle className="font-display flex items-center gap-2">
            <History className="h-5 w-5" />
            Sync History
          </CardTitle>
          <CardDescription>
            Track all sync operations with timestamps, row counts, and status
          </CardDescription>
        </CardHeader>
        <CardContent>
          {syncHistory.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <History className="h-10 w-10 text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground">No sync operations yet</p>
              <p className="text-xs text-muted-foreground mt-1">
                Sync data to Google Sheets to see the history here
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {syncHistory.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center justify-between rounded-lg border border-border/50 bg-muted/20 p-3"
                >
                  <div className="flex items-center gap-3">
                    {entry.status === "success" ? (
                      <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
                    ) : entry.status === "failed" ? (
                      <XCircle className="h-4 w-4 text-destructive shrink-0" />
                    ) : (
                      <Loader2 className="h-4 w-4 text-primary animate-spin shrink-0" />
                    )}
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        Google Sheets Sync
                        {entry.sheet_name && (
                          <span className="text-muted-foreground font-normal"> → {entry.sheet_name}</span>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(entry.started_at).toLocaleString()}
                        {entry.error_message && (
                          <span className="text-destructive ml-2">• {entry.error_message}</span>
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {entry.status === "success" && (
                      <Badge variant="secondary" className="text-xs">
                        {entry.row_count} rows
                      </Badge>
                    )}
                    <Badge
                      variant={entry.status === "success" ? "default" : entry.status === "failed" ? "destructive" : "secondary"}
                      className="text-xs capitalize"
                    >
                      {entry.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

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

      {/* External Data Connectors */}
      <ExternalConnectorsView />
    </div>
  );
};

export default IntegrationsView;

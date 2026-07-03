import { useState, useEffect } from "react";
import * as XLSX from "xlsx";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  FileText, Database, Sheet, Upload, Globe, Loader2, ArrowLeft, CheckCircle2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import {
  useDashboardSources, previewExternalSource, fieldsFromRows, fieldsFromForm, mergeFields,
} from "@/hooks/useDashboardSources";
import { SOURCE_KIND_META, type SourceKind, type SourceField, type DataSourceConfig } from "@/lib/dashboardStudio/types";

const ICONS: Record<string, any> = { FileText, Database, Sheet, Upload, Globe };

// Whitelisted app tables that make sense as dashboard sources.
const APP_TABLES = [
  "form_submissions", "irf_reports", "acsm_reports", "sbc_reports",
  "microplan_entries", "ces_surveys", "attendance_records", "cases",
];

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated?: (id: string) => void;
}

export default function AddDataSourceDialog({ open, onClose, onCreated }: Props) {
  const { user } = useAuth();
  const { createSource } = useDashboardSources();
  const [kind, setKind] = useState<SourceKind | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  // config fields
  const [formId, setFormId] = useState("");
  const [tableName, setTableName] = useState("");
  const [url, setUrl] = useState("");
  const [gid, setGid] = useState("");
  const [method, setMethod] = useState("GET");
  const [jsonPath, setJsonPath] = useState("");
  const [forms, setForms] = useState<{ id: string; name: string }[]>([]);

  // preview
  const [preview, setPreview] = useState<{ fields: SourceField[]; rows: Record<string, unknown>[] } | null>(null);

  useEffect(() => {
    if (!open) return;
    supabase.from("forms").select("id, name").order("name").then(({ data }) => setForms(data ?? []));
  }, [open]);

  // Build a full field schema + preview when an App Form is selected.
  useEffect(() => {
    if (kind !== "form" || !formId) return;
    let cancelled = false;
    (async () => {
      setBusy(true);
      try {
        const [{ data: formRow }, { data: subs }] = await Promise.all([
          supabase.from("forms").select("name, questions").eq("id", formId).maybeSingle(),
          supabase.from("form_submissions").select("data, submitted_at, location, state, status").eq("form_id", formId).order("submitted_at", { ascending: false }).limit(200),
        ]);
        if (cancelled) return;
        const rows = (subs ?? []).map((r: any) => ({
          submitted_at: r.submitted_at, location: r.location, state: r.state, status: r.status,
          ...(r.data && typeof r.data === "object" ? r.data : {}),
        }));
        const base: SourceField[] = [
          { id: "submitted_at", label: "Submitted at", type: "date" },
          { id: "location", label: "Location", type: "text" },
          { id: "state", label: "State", type: "text" },
          { id: "status", label: "Status", type: "text" },
        ];
        const fields = mergeFields(base, fieldsFromForm((formRow as any)?.questions), fieldsFromRows(rows));
        setPreview({ fields, rows });
        if (!name && (formRow as any)?.name) setName((formRow as any).name);
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => { cancelled = true; };
  }, [kind, formId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Build a full field schema + preview when an App Table is selected.
  useEffect(() => {
    if (kind !== "table" || !tableName) return;
    let cancelled = false;
    (async () => {
      setBusy(true);
      try {
        const { data } = await supabase.from(tableName as any).select("*").limit(200);
        if (cancelled) return;
        const rows = ((data as unknown) as Record<string, unknown>[]) ?? [];
        setPreview({ fields: fieldsFromRows(rows), rows });
        if (!name) setName(tableName);
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => { cancelled = true; };
  }, [kind, tableName]); // eslint-disable-line react-hooks/exhaustive-deps

  const reset = () => {
    setKind(null); setName(""); setFormId(""); setTableName(""); setUrl(""); setGid("");
    setMethod("GET"); setJsonPath(""); setPreview(null); setBusy(false);
  };
  const close = () => { reset(); onClose(); };

  const handleFile = async (file: File) => {
    setBusy(true);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
      if (rows.length === 0) throw new Error("File has no rows");
      setPreview({ fields: fieldsFromRows(rows), rows });
      if (!name) setName(file.name.replace(/\.[^.]+$/, ""));
      // upload original to storage
      const path = `${user?.id}/${Date.now()}-${file.name}`;
      await supabase.storage.from("dashboard-uploads").upload(path, file, { upsert: true });
      (window as any).__lastUploadPath = path;
      (window as any).__lastUploadName = file.name;
      toast.success(`Parsed ${rows.length} rows`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to read file");
    } finally {
      setBusy(false);
    }
  };

  const handlePreviewExternal = async () => {
    setBusy(true);
    try {
      const cfg: DataSourceConfig = kind === "google_sheet"
        ? { url, gid: gid || undefined }
        : { url, method, jsonPath: jsonPath || undefined };
      const res = await previewExternalSource(kind as "google_sheet" | "rest_api", cfg);
      if (res.error) { toast.error(res.error); return; }
      setPreview({ fields: res.columns, rows: res.rows });
      toast.success(`Fetched ${res.rows.length} rows`);
    } finally {
      setBusy(false);
    }
  };

  const handleSave = async () => {
    if (!kind || !name.trim()) { toast.error("Give the source a name"); return; }
    setBusy(true);
    try {
      let config: DataSourceConfig = {};
      let schema: SourceField[] = [];
      if (kind === "form") {
        config = { formId };
        schema = preview?.fields ?? [
          { id: "submitted_at", label: "Submitted at", type: "date" },
          { id: "location", label: "Location", type: "text" },
          { id: "state", label: "State", type: "text" },
          { id: "status", label: "Status", type: "text" },
        ];
      } else if (kind === "table") {
        config = { tableName };
        schema = preview?.fields ?? [];
      } else if (kind === "csv_upload") {
        if (!preview) { toast.error("Upload a file first"); setBusy(false); return; }
        config = {
          storagePath: (window as any).__lastUploadPath,
          fileName: (window as any).__lastUploadName,
          cachedRows: preview.rows,
          refreshedAt: new Date().toISOString(),
        };
        schema = preview.fields;
      } else {
        if (!preview) { toast.error("Connect & preview first"); setBusy(false); return; }
        config = kind === "google_sheet"
          ? { url, gid: gid || undefined, cachedRows: preview.rows, refreshedAt: new Date().toISOString() }
          : { url, method, jsonPath: jsonPath || undefined, cachedRows: preview.rows, refreshedAt: new Date().toISOString() };
        schema = preview.fields;
      }
      const created = await createSource(name.trim(), kind, config, schema);
      if (created) { onCreated?.(created.id); close(); }
    } finally {
      setBusy(false);
    }
  };

  const canSave = kind === "form" ? !!formId
    : kind === "table" ? !!tableName
    : kind === "csv_upload" ? !!preview
    : !!preview;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {kind && <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setKind(null); setPreview(null); }}><ArrowLeft className="h-4 w-4" /></Button>}
            {kind ? `Connect ${SOURCE_KIND_META[kind].label}` : "Add a data source"}
          </DialogTitle>
          <DialogDescription>
            {kind ? "Configure the connection, preview the data, then save." : "Choose where your dashboard data comes from."}
          </DialogDescription>
        </DialogHeader>

        {!kind ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {(Object.keys(SOURCE_KIND_META) as SourceKind[]).map((k) => {
              const m = SOURCE_KIND_META[k];
              const Icon = ICONS[m.icon];
              return (
                <button key={k} onClick={() => setKind(k)}
                  className="group relative overflow-hidden rounded-xl border border-border p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-lg">
                  <div className={`absolute inset-0 bg-gradient-to-br opacity-[0.08] transition-opacity group-hover:opacity-[0.16] ${m.gradient}`} />
                  <div className={`mb-3 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br text-white ${m.gradient}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="font-semibold text-foreground">{m.label}</div>
                  <div className="text-xs text-muted-foreground">{m.description}</div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Data source name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Field Coverage Sheet" />
            </div>

            {kind === "form" && (
              <div className="space-y-1.5">
                <Label>Form</Label>
                <Select value={formId} onValueChange={setFormId}>
                  <SelectTrigger><SelectValue placeholder="Select a form" /></SelectTrigger>
                  <SelectContent>{forms.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}

            {kind === "table" && (
              <div className="space-y-1.5">
                <Label>App table</Label>
                <Select value={tableName} onValueChange={setTableName}>
                  <SelectTrigger><SelectValue placeholder="Select a table" /></SelectTrigger>
                  <SelectContent>{APP_TABLES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}

            {kind === "google_sheet" && (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Google Sheet URL (share as “Anyone with the link”)</Label>
                  <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://docs.google.com/spreadsheets/d/..." />
                </div>
                <div className="space-y-1.5">
                  <Label>Tab GID (optional)</Label>
                  <Input value={gid} onChange={(e) => setGid(e.target.value)} placeholder="0" />
                </div>
                <Button variant="secondary" onClick={handlePreviewExternal} disabled={busy || !url}>
                  {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Connect & preview
                </Button>
              </div>
            )}

            {kind === "rest_api" && (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Endpoint URL</Label>
                  <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://api.example.com/data" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Method</Label>
                    <Select value={method} onValueChange={setMethod}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="GET">GET</SelectItem><SelectItem value="POST">POST</SelectItem></SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>JSON path to array (optional)</Label>
                    <Input value={jsonPath} onChange={(e) => setJsonPath(e.target.value)} placeholder="data.results" />
                  </div>
                </div>
                <Button variant="secondary" onClick={handlePreviewExternal} disabled={busy || !url}>
                  {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Connect & preview
                </Button>
              </div>
            )}

            {kind === "csv_upload" && (
              <div className="space-y-1.5">
                <Label>CSV or Excel file</Label>
                <Input type="file" accept=".csv,.xlsx,.xls" disabled={busy}
                  onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
              </div>
            )}

            {busy && !preview && (kind === "form" || kind === "table") && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Reading fields…
              </div>
            )}

            {preview && (
              <div className="rounded-lg border border-border bg-muted/30 p-3">
                <div className="mb-2 flex items-center gap-2 text-sm font-medium text-emerald-600">
                  <CheckCircle2 className="h-4 w-4" /> {preview.rows.length} rows · {preview.fields.length} fields detected
                </div>
                <div className="mb-2 flex max-h-32 flex-wrap gap-1 overflow-y-auto">
                  {preview.fields.map((f) => (
                    <Badge key={f.id} variant="outline" className="text-[10px]">{f.label} <span className="ml-1 opacity-60">{f.type}</span></Badge>
                  ))}
                </div>
                {preview.rows.length > 0 && (
                  <div className="max-h-40 overflow-auto rounded border border-border/60 bg-background">
                    <table className="w-full text-[10px]">
                      <thead className="sticky top-0 bg-muted">
                        <tr>{preview.fields.slice(0, 8).map((f) => (
                          <th key={f.id} className="whitespace-nowrap px-2 py-1 text-left font-medium">{f.label}</th>
                        ))}</tr>
                      </thead>
                      <tbody>
                        {preview.rows.slice(0, 8).map((row, i) => (
                          <tr key={i} className="border-t border-border/40">
                            {preview.fields.slice(0, 8).map((f) => (
                              <td key={f.id} className="max-w-[120px] truncate px-2 py-1">{String(row[f.id] ?? "")}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

          </div>
        )}

        {kind && (
          <DialogFooter>
            <Button variant="ghost" onClick={close}>Cancel</Button>
            <Button onClick={handleSave} disabled={busy || !canSave}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Save data source
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft, Search, BookOpen, CheckCircle2, AlertTriangle, Wrench, CircleDot, ClipboardList,
  Plus, FileSpreadsheet, FileText, Presentation, Trash2, Loader2, User as UserIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  LEARNING_LOG, LEARNING_LOG_CATEGORIES, STATUS_STYLES, type FeatureStatus, type LearningLogEntry,
} from "@/lib/learningLog/catalog";
import {
  exportLearningLogExcel, exportLearningLogPdf, exportLearningLogPptx, type ExportEntry,
} from "@/lib/learningLog/learningLogExports";

const STATUS_ICON: Record<FeatureStatus, any> = {
  Operational: CheckCircle2,
  Monitoring: AlertTriangle,
  Resolved: Wrench,
  "In Progress": CircleDot,
};

const STATUSES: FeatureStatus[] = ["Operational", "Monitoring", "Resolved", "In Progress"];

interface DbEntry extends LearningLogEntry {
  author?: string;
  createdBy?: string;
  source: "db";
}
interface CatalogEntry extends LearningLogEntry {
  source: "catalog";
}
type MergedEntry = DbEntry | CatalogEntry;

const emptyForm = {
  feature: "",
  category: "",
  description: "",
  fieldIssue: "",
  resolution: "",
  status: "In Progress" as FeatureStatus,
};

export default function LearningLog() {
  const navigate = useNavigate();
  const { user, profile, isAdmin, isSuperAdmin, isOwnerLevel } = useAuth();
  const canManageAny = Boolean(isAdmin || isSuperAdmin || isOwnerLevel);

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");

  const [dbEntries, setDbEntries] = useState<DbEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const authorName = useMemo(
    () => profile?.full_name || (profile as any)?.name || user?.email || "Team member",
    [profile, user],
  );

  const loadEntries = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("learning_log_entries")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      toast.error("Could not load saved entries");
    } else {
      setDbEntries(
        (data || []).map((r: any) => ({
          id: r.id,
          feature: r.feature,
          category: r.category || "General",
          description: r.description || "",
          fieldIssue: r.field_issue || null,
          resolution: r.resolution || null,
          status: (r.status || "In Progress") as FeatureStatus,
          author: r.author_name || undefined,
          createdBy: r.created_by,
          source: "db",
        })),
      );
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadEntries(); }, [loadEntries]);

  const merged: MergedEntry[] = useMemo(
    () => [...dbEntries, ...LEARNING_LOG.map((e) => ({ ...e, source: "catalog" as const }))],
    [dbEntries],
  );

  const categories = useMemo(
    () => Array.from(new Set([...LEARNING_LOG_CATEGORIES, ...dbEntries.map((e) => e.category)])).sort(),
    [dbEntries],
  );

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return merged.filter((e) => {
      if (category !== "all" && e.category !== category) return false;
      if (status !== "all" && e.status !== status) return false;
      if (!s) return true;
      return [e.feature, e.description, e.fieldIssue, e.resolution, e.category]
        .filter(Boolean).some((t) => String(t).toLowerCase().includes(s));
    });
  }, [merged, search, category, status]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { Operational: 0, Monitoring: 0, Resolved: 0, "In Progress": 0 };
    merged.forEach((e) => { c[e.status] += 1; });
    return c;
  }, [merged]);

  const handleSave = async () => {
    if (!form.feature.trim()) { toast.error("Feature name is required"); return; }
    if (!user) { toast.error("You must be signed in"); return; }
    setSaving(true);
    const { error } = await supabase.from("learning_log_entries").insert({
      feature: form.feature.trim(),
      category: form.category.trim() || "General",
      description: form.description.trim(),
      field_issue: form.fieldIssue.trim() || null,
      resolution: form.resolution.trim() || null,
      status: form.status,
      created_by: user.id,
      author_name: authorName,
    } as any);
    setSaving(false);
    if (error) { toast.error("Could not save entry"); return; }
    toast.success("Learning log entry added");
    setDialogOpen(false);
    setForm(emptyForm);
    loadEntries();
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from("learning_log_entries").delete().eq("id", deleteId);
    if (error) { toast.error("Could not delete entry"); }
    else { toast.success("Entry removed"); loadEntries(); }
    setDeleteId(null);
  };

  const runExport = async (kind: "excel" | "pdf" | "pptx") => {
    const rows: ExportEntry[] = filtered.map((e) => ({
      id: e.id, feature: e.feature, category: e.category, description: e.description,
      fieldIssue: e.fieldIssue, resolution: e.resolution, status: e.status,
      author: (e as DbEntry).author,
    }));
    if (rows.length === 0) { toast.error("No entries to export"); return; }
    setExporting(kind);
    try {
      if (kind === "excel") await exportLearningLogExcel(rows);
      else if (kind === "pdf") exportLearningLogPdf(rows);
      else await exportLearningLogPptx(rows);
      toast.success(`Exported ${rows.length} entries to ${kind.toUpperCase()}`);
    } catch (err) {
      console.error(err);
      toast.error("Export failed");
    } finally {
      setExporting(null);
    }
  };

  const canDelete = (e: MergedEntry) =>
    e.source === "db" && (canManageAny || (e as DbEntry).createdBy === user?.id);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="sticky top-0 z-20 border-b bg-gradient-to-r from-[#0c2340] to-[#1a4a6e] px-4 py-3">
        <div className="mx-auto flex max-w-5xl items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} aria-label="Back" className="text-white hover:bg-white/10">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <BookOpen className="h-6 w-6 text-white" />
          <div className="min-w-0 flex-1">
            <h1 className="text-base font-bold text-white sm:text-lg">Learning Log</h1>
            <p className="truncate text-xs text-white/70">Feature reliability journey — field issues, resolutions & current status</p>
          </div>
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="secondary" size="sm" disabled={!!exporting} className="gap-1.5">
                  {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                  <span className="hidden sm:inline">Export</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => runExport("excel")}>
                  <FileSpreadsheet className="mr-2 h-4 w-4 text-emerald-600" /> Excel (.xlsx)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => runExport("pdf")}>
                  <FileText className="mr-2 h-4 w-4 text-red-600" /> PDF (.pdf)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => runExport("pptx")}>
                  <Presentation className="mr-2 h-4 w-4 text-orange-600" /> PowerPoint (.pptx)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button size="sm" onClick={() => setDialogOpen(true)} className="gap-1.5 bg-white text-[#0c2340] hover:bg-white/90">
              <Plus className="h-4 w-4" /> <span className="hidden sm:inline">New Entry</span>
            </Button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-5xl space-y-5 p-4 pb-16">
        {/* Status summary */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {STATUSES.map((st) => {
            const Icon = STATUS_ICON[st];
            const style = STATUS_STYLES[st];
            return (
              <Card key={st} className={`p-4 ${style.bg}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className={`text-xs font-medium ${style.text}`}>{st}</p>
                    <p className="mt-1 text-2xl font-bold text-foreground">{counts[st]}</p>
                  </div>
                  <Icon className={`h-6 w-6 ${style.text}`} />
                </div>
              </Card>
            );
          })}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search features, issues, resolutions…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
          </div>
          <select value={category} onChange={(e) => setCategory(e.target.value)}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm">
            <option value="all">All categories</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={status} onChange={(e) => setStatus(e.target.value)}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm">
            <option value="all">All statuses</option>
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        {/* Entries */}
        {loading ? (
          <div className="flex h-40 items-center justify-center text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex h-40 flex-col items-center justify-center gap-2 text-muted-foreground">
            <ClipboardList className="h-8 w-8 opacity-40" />
            <p className="text-sm">No matching features.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((e) => {
              const style = STATUS_STYLES[e.status];
              const Icon = STATUS_ICON[e.status];
              return (
                <Card key={`${e.source}-${e.id}`} className="overflow-hidden">
                  <div className="flex flex-wrap items-start justify-between gap-2 border-b bg-muted/30 px-4 py-3">
                    <div className="min-w-0">
                      <h3 className="text-sm font-bold text-foreground">{e.feature}</h3>
                      <p className="text-xs text-muted-foreground">{e.category}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${style.bg} ${style.text} ${style.ring}`}>
                        <Icon className="h-3.5 w-3.5" /> {e.status}
                      </span>
                      {canDelete(e) && (
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={() => setDeleteId(e.id)} aria-label="Delete entry">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="space-y-2.5 p-4 text-sm">
                    <p className="text-muted-foreground">{e.description}</p>
                    <div className="grid gap-2.5 sm:grid-cols-2">
                      <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3 dark:border-amber-500/30 dark:bg-amber-500/5">
                        <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-300">
                          <AlertTriangle className="h-3.5 w-3.5" /> Field issue identified
                        </p>
                        <p className="text-xs text-foreground/80">{e.fieldIssue || "None reported."}</p>
                      </div>
                      <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 dark:border-emerald-500/30 dark:bg-emerald-500/5">
                        <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                          <Wrench className="h-3.5 w-3.5" /> How it was resolved
                        </p>
                        <p className="text-xs text-foreground/80">{e.resolution || "—"}</p>
                      </div>
                    </div>
                    {e.source === "db" && (e as DbEntry).author && (
                      <p className="flex items-center gap-1.5 pt-1 text-xs italic text-muted-foreground">
                        <UserIcon className="h-3 w-3" /> Recorded by {(e as DbEntry).author}
                      </p>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Create dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>New Learning Log Entry</DialogTitle>
            <DialogDescription>Record a feature, any field issue found, how it was resolved, and its status.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="ll-feature">Feature *</Label>
              <Input id="ll-feature" value={form.feature} onChange={(e) => setForm({ ...form, feature: e.target.value })} placeholder="e.g. Coverage Evaluation 3D" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="ll-cat">Category</Label>
                <Input id="ll-cat" list="ll-categories" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="e.g. Analytics" />
                <datalist id="ll-categories">
                  {categories.map((c) => <option key={c} value={c} />)}
                </datalist>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ll-status">Status</Label>
                <select id="ll-status" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as FeatureStatus })}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                  {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ll-desc">Description</Label>
              <Textarea id="ll-desc" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="What the feature does" rows={2} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ll-issue">Field issue identified</Label>
              <Textarea id="ll-issue" value={form.fieldIssue} onChange={(e) => setForm({ ...form, fieldIssue: e.target.value })} placeholder="What went wrong in the field" rows={2} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ll-res">Resolution steps</Label>
              <Textarea id="ll-res" value={form.resolution} onChange={(e) => setForm({ ...form, resolution: e.target.value })} placeholder="How it was resolved" rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save entry
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this entry?</AlertDialogTitle>
            <AlertDialogDescription>This permanently removes the learning log entry. This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

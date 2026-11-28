import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle,
  CloudOff,
  Download,
  FileText,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { fetchProjectFormCatalogue } from "@/lib/projectFormCatalogue";
import {
  buildFormDownloadItems,
  downloadableFormIds,
  type FormDownloadForm,
  type FormDownloadResult,
} from "@/lib/offlineFormDownload";

interface FormDownloadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  online: boolean;
  userId?: string;
  offlineForms: Record<string, any>[];
  projects: { id: string; name: string }[];
  onDownload: (forms: FormDownloadForm[]) => Promise<FormDownloadResult>;
}

export default function FormDownloadDialog({
  open,
  onOpenChange,
  online,
  userId,
  offlineForms,
  projects,
  onDownload,
}: FormDownloadDialogProps) {
  const [authorizedForms, setAuthorizedForms] = useState<FormDownloadForm[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [projectFilter, setProjectFilter] = useState("all");
  const [downloading, setDownloading] = useState(false);
  const [result, setResult] = useState<FormDownloadResult | null>(null);
  const requestId = useRef(0);

  const refresh = useCallback(async () => {
    if (!userId || !online) return;
    const request = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      const rows = await fetchProjectFormCatalogue(userId);
      if (request !== requestId.current) return;
      setAuthorizedForms(rows as FormDownloadForm[]);
      setSelected((current) => new Set(Array.from(current).filter((id) => rows.some((form) => form.id === id))));
    } catch (cause: any) {
      if (request !== requestId.current) return;
      setAuthorizedForms(null);
      setError(cause?.message || "The form list could not be refreshed. Your saved forms are still available.");
    } finally {
      if (request === requestId.current) setLoading(false);
    }
  }, [online, userId]);

  useEffect(() => {
    requestId.current += 1;
    if (!open) {
      return;
    }
    setAuthorizedForms(null);
    setSelected(new Set());
    setResult(null);
    setSearch("");
    setProjectFilter("all");
    if (online) void refresh();
    else {
      setAuthorizedForms(null);
      setError(null);
      setLoading(false);
    }
  }, [open, online, refresh]);

  const verified = online && authorizedForms !== null && !error;
  const sourceForms = authorizedForms ?? (offlineForms as FormDownloadForm[]);
  const items = useMemo(
    () => buildFormDownloadItems(sourceForms, offlineForms, projects),
    [sourceForms, offlineForms, projects],
  );
  const filteredItems = useMemo(() => {
    const term = search.trim().toLowerCase();
    return items.filter((item) =>
      (projectFilter === "all" || item.form.project_id === projectFilter) &&
      (!term || `${item.form.name} ${item.form.description || ""} ${item.projectName}`.toLowerCase().includes(term)),
    );
  }, [items, projectFilter, search]);
  const visibleDownloadableIds = downloadableFormIds(filteredItems);
  const allVisibleSelected = visibleDownloadableIds.length > 0 && visibleDownloadableIds.every((id) => selected.has(id));
  const updates = verified ? items.filter((item) => item.status === "update").length : 0;
  const newForms = verified ? items.filter((item) => item.status === "new").length : 0;
  const current = verified ? items.filter((item) => item.status === "current").length : 0;
  const selectedCount = selected.size;

  const toggle = (id: string, checked: boolean) => {
    setSelected((currentSelection) => {
      const next = new Set(currentSelection);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
    setResult(null);
  };

  const downloadSelected = async () => {
    if (downloading || !verified || loading) return;
    const chosen = items.filter((item) => selected.has(item.form.id) && item.status !== "current").map((item) => item.form);
    if (!chosen.length) return;
    setDownloading(true);
    setError(null);
    setResult(null);
    try {
      const outcome = await onDownload(chosen);
      setResult(outcome);
      setSelected(new Set());
      await refresh();
    } catch (cause: any) {
      setAuthorizedForms(null);
      setError(cause?.message || "The selected forms could not be downloaded. Please try again.");
    } finally {
      setDownloading(false);
    }
  };

  const statusFor = (item: (typeof items)[number]) => {
    if (!verified) return { label: "Saved offline", className: "bg-muted text-muted-foreground" };
    if (item.status === "update") return {
      label: "Update available",
      className: "bg-[hsl(var(--status-warning)/0.12)] text-[hsl(var(--status-warning-light))] border-[hsl(var(--status-warning)/0.3)]",
    };
    if (item.status === "new") return { label: "Not downloaded", className: "bg-primary/10 text-primary border-primary/20" };
    return { label: "Up to date", className: "bg-[hsl(var(--status-success)/0.1)] text-[hsl(var(--status-success-light))] border-[hsl(var(--status-success)/0.25)]" };
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!downloading) onOpenChange(next); }}>
      <DialogContent className="flex h-[min(820px,92dvh)] w-[calc(100vw-1rem)] max-w-3xl flex-col gap-0 overflow-hidden p-0 sm:rounded-2xl">
        <DialogHeader className="border-b bg-muted/35 px-5 py-5 pr-12 text-left sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
              <Download className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-xl">Download forms</DialogTitle>
              <DialogDescription className="mt-1.5 leading-relaxed">
                Choose exactly which forms to save or update on this device.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <div className="space-y-4 p-4 sm:p-6">
            {!online ? (
              <div className="flex gap-3 rounded-xl border bg-muted/50 p-4 text-sm">
                <CloudOff className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
                <div>
                  <p className="font-semibold">You’re offline</p>
                  <p className="mt-1 text-muted-foreground">Your saved forms are shown below. Connect to the internet to see new forms or check for updates.</p>
                </div>
              </div>
            ) : error ? (
              <div className="flex flex-col gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm sm:flex-row sm:items-center">
                <p className="flex-1 text-foreground">{error} Saved forms remain available.</p>
                <Button variant="outline" size="sm" onClick={() => { setResult(null); void refresh(); }} disabled={loading}>
                  <RefreshCw className={loading ? "mr-2 h-4 w-4 animate-spin" : "mr-2 h-4 w-4"} /> Try again
                </Button>
              </div>
            ) : null}

            {result ? (
              <div className="flex gap-3 rounded-xl border border-[hsl(var(--status-success)/0.3)] bg-[hsl(var(--status-success)/0.08)] p-4 text-sm" role="status">
                <CheckCircle className="mt-0.5 h-5 w-5 shrink-0 text-[hsl(var(--status-success-light))]" />
                <div>
                  <p className="font-semibold">Selected forms saved on this device</p>
                  <p className="mt-1 text-muted-foreground">{result.added} downloaded · {result.updated} updated{result.unchanged ? ` · ${result.unchanged} already current` : ""}</p>
                </div>
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-2" aria-live="polite">
              <Badge variant="secondary" className="px-3 py-1.5">{items.length} {verified ? "accessible" : "saved"}</Badge>
              {verified && <Badge variant="outline" className="border-primary/25 px-3 py-1.5 text-primary">{newForms} new</Badge>}
              {verified && updates > 0 && (
                <Badge variant="outline" className="border-[hsl(var(--status-warning)/0.35)] bg-[hsl(var(--status-warning)/0.1)] px-3 py-1.5 text-[hsl(var(--status-warning-light))]">
                  <Sparkles className="mr-1.5 h-3.5 w-3.5" /> {updates} {updates === 1 ? "update" : "updates"}
                </Badge>
              )}
              {verified && <Badge variant="outline" className="px-3 py-1.5 text-muted-foreground">{current} current</Badge>}
            </div>

            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_220px]">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search your accessible forms" className="h-11 pl-9" aria-label="Search forms to download" />
              </div>
              <Select value={projectFilter} onValueChange={setProjectFilter}>
                <SelectTrigger className="h-11" aria-label="Filter forms by project"><SelectValue placeholder="All projects" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All projects</SelectItem>
                  {projects.map((project) => <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="flex min-h-10 flex-wrap items-center justify-between gap-2 border-b pb-3">
              <p className="text-sm text-muted-foreground">
                {loading ? "Checking for new forms and updates…" : verified ? `${filteredItems.length} shown · select the forms you want` : "Saved forms on this device"}
              </p>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={!verified || loading || downloading || visibleDownloadableIds.length === 0}
                  onClick={() => setSelected((currentSelection) => {
                    const next = new Set(currentSelection);
                    if (allVisibleSelected) visibleDownloadableIds.forEach((id) => next.delete(id));
                    else visibleDownloadableIds.forEach((id) => next.add(id));
                    return next;
                  })}
                >
                  {allVisibleSelected ? "Clear shown" : "Select all shown"}
                </Button>
                <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => { setResult(null); void refresh(); }} disabled={!online || loading || downloading} aria-label="Check again for form updates" title="Check for updates">
                  <RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
                </Button>
              </div>
            </div>

            {loading && !items.length ? (
              <div className="flex min-h-48 flex-col items-center justify-center gap-3 text-center text-muted-foreground">
                <Loader2 className="h-7 w-7 animate-spin text-primary" />
                <p className="text-sm">Loading every form you can access…</p>
              </div>
            ) : !filteredItems.length ? (
              <div className="flex min-h-48 flex-col items-center justify-center gap-3 rounded-xl border border-dashed px-6 text-center">
                <FileText className="h-8 w-8 text-muted-foreground" />
                <div>
                  <p className="font-semibold">{items.length ? "No forms match this search" : online ? "No forms are currently assigned to you" : "No forms have been downloaded yet"}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{items.length ? "Try a different name or project." : online ? "Ask your project administrator for access, then check again." : "Connect to the internet to choose your first form."}</p>
                </div>
              </div>
            ) : (
              <div className="space-y-2" role="list" aria-label="Forms available for download">
                {filteredItems.map((item) => {
                  const status = statusFor(item);
                  const selectable = verified && !loading && !downloading && item.status !== "current";
                  const id = `download-form-${item.form.id}`;
                  return (
                    <div
                      key={item.form.id}
                      role="listitem"
                      className={`grid min-h-[76px] grid-cols-[20px_40px_minmax(0,1fr)] items-start gap-3 rounded-lg border bg-card p-3.5 transition-colors sm:flex sm:items-center ${selected.has(item.form.id) ? "border-primary bg-primary/5" : item.status === "update" && verified ? "border-[hsl(var(--status-warning)/0.35)]" : ""}`}
                    >
                      <Checkbox
                        id={id}
                        checked={selected.has(item.form.id)}
                        onCheckedChange={(checked) => toggle(item.form.id, checked === true)}
                        disabled={!selectable}
                        className="mt-1 h-5 w-5 sm:mt-0"
                        aria-label={`${selected.has(item.form.id) ? "Deselect" : "Select"} ${item.form.name}`}
                      />
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <FileText className="h-5 w-5" />
                      </div>
                      <label htmlFor={id} className={`min-w-0 flex-1 ${selectable ? "cursor-pointer" : "cursor-default"}`}>
                        <span className="block break-words text-sm font-semibold leading-snug">{item.form.name}</span>
                        <span className="mt-1 block text-xs text-muted-foreground">{item.projectName}</span>
                        {item.form.settings?.specialCollector && <span className="mt-1 block text-xs text-muted-foreground">Special form{item.form.settings.onlineRequired ? " · Internet required to submit" : ""}</span>}
                        {item.form.description && <span className="mt-1 line-clamp-2 block text-xs leading-relaxed text-muted-foreground">{item.form.description}</span>}
                      </label>
                      <Badge variant="outline" className={`col-start-3 max-w-[124px] justify-self-start shrink-0 whitespace-normal text-center leading-tight ${status.className}`}>{status.label}</Badge>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="border-t bg-background p-4 sm:px-6">
          <div className="mb-3 flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
            <p>Only forms you choose are downloaded. Existing drafts and completed entries are never removed by an update.</p>
          </div>
          <Button className="h-12 w-full text-base" disabled={!selectedCount || downloading || loading || !verified} onClick={() => void downloadSelected()}>
            {downloading ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Download className="mr-2 h-5 w-5" />}
            {downloading ? "Downloading selected forms…" : selectedCount ? `Download selected (${selectedCount})` : "Select forms to download"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

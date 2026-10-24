import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, CheckCircle2, Clock, Eye, Loader2, MessageSquareHeart,
  RefreshCw, Search, ShieldCheck, UserPlus, X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import FeedbackQrCard from "./FeedbackQrCard";

// Newly created tables are not yet in the generated Supabase types.
const db = supabase as unknown as {
  from: (t: string) => any; // eslint-disable-line @typescript-eslint/no-explicit-any
};

interface FeedbackRow {
  id: string;
  reference: string;
  category: string;
  severity: string;
  message: string;
  community: string | null;
  ward: string | null;
  lga: string | null;
  state: string | null;
  is_anonymous: boolean;
  reporter_name: string | null;
  reporter_phone: string | null;
  reporter_email: string | null;
  status: string;
  resolution_note: string | null;
  created_at: string;
}

interface ViewerRow {
  id: string;
  user_id: string;
  profiles?: { full_name: string | null; email: string | null } | null;
}

const CATEGORY_LABELS: Record<string, string> = {
  service_quality: "Quality of services",
  staff_conduct: "Staff conduct",
  medicine_supply: "Medicines & supplies",
  exclusion_inclusion: "Inclusion / exclusion",
  safety_dignity: "Safety & dignity",
  corruption_diversion: "Corruption / diversion",
  data_privacy: "Data privacy",
  appreciation: "Appreciation",
  suggestion: "Suggestion",
  other: "Other",
};

const STATUS_STYLES: Record<string, string> = {
  new: "bg-sky-50 text-sky-700 border-sky-200",
  in_review: "bg-amber-50 text-amber-700 border-amber-200",
  resolved: "bg-emerald-50 text-emerald-700 border-emerald-200",
  closed: "bg-slate-100 text-slate-600 border-slate-200",
};

interface Props {
  projectId: string;
  projectName: string;
  canManage: boolean; // owner / super admin — can grant viewer access
  /** Team members granted feedback sharing see only the QR code and public link. */
  shareOnly?: boolean;
}

const FeedbackReportsPanel = ({ projectId, projectName, canManage, shareOnly = false }: Props) => {
  const { toast } = useToast();
  const [rows, setRows] = useState<FeedbackRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [selected, setSelected] = useState<FeedbackRow | null>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [viewers, setViewers] = useState<ViewerRow[]>([]);
  const [viewersOpen, setViewersOpen] = useState(false);
  const [viewerEmail, setViewerEmail] = useState("");
  const [addingViewer, setAddingViewer] = useState(false);

  const load = useCallback(async () => {
    if (shareOnly) { setLoading(false); return; }
    setLoading(true);
    const { data, error } = await db
      .from("project_feedback")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });
    if (error) {
      // RLS denial surfaces as an error or empty set for non-viewers.
      setDenied(true);
      setRows([]);
    } else {
      setDenied(false);
      setRows((data || []) as FeedbackRow[]);
    }
    setLoading(false);
  }, [projectId]);

  const loadViewers = useCallback(async () => {
    if (!canManage) return;
    const { data } = await db
      .from("feedback_viewers")
      .select("id, user_id, profiles(first_name, last_name, email)")
      .eq("project_id", projectId);
    const rows = ((data || []) as unknown as { id: string; user_id: string; profiles: { first_name: string | null; last_name: string | null; email: string | null } | null }[]).map((r) => ({
      ...r,
      profiles: r.profiles
        ? { full_name: [r.profiles.first_name, r.profiles.last_name].filter(Boolean).join(" ").trim() || r.profiles.email, email: r.profiles.email }
        : null,
    }));
    setViewers(rows as ViewerRow[]);
  }, [projectId, canManage]);

  useEffect(() => { load(); loadViewers(); }, [load, loadViewers]);

  const filtered = useMemo(() => rows.filter((r) => {
    if (statusFilter !== "all" && r.status !== statusFilter) return false;
    if (categoryFilter !== "all" && r.category !== categoryFilter) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return [r.reference, r.message, r.community, r.lga, r.state, r.reporter_name]
      .filter(Boolean).some((v) => String(v).toLowerCase().includes(q));
  }), [rows, search, statusFilter, categoryFilter]);

  const counts = useMemo(() => ({
    total: rows.length,
    new: rows.filter((r) => r.status === "new").length,
    sensitive: rows.filter((r) => r.severity === "sensitive").length,
    resolved: rows.filter((r) => r.status === "resolved" || r.status === "closed").length,
  }), [rows]);

  const updateStatus = async (status: string) => {
    if (!selected) return;
    setSaving(true);
    const { data: auth } = await supabase.auth.getUser();
    const { error } = await db
      .from("project_feedback")
      .update({
        status,
        resolution_note: note || null,
        resolved_by: status === "resolved" || status === "closed" ? auth.user?.id : null,
        resolved_at: status === "resolved" || status === "closed" ? new Date().toISOString() : null,
      } as never)
      .eq("id", selected.id);
    setSaving(false);
    if (error) {
      toast({ title: "Could not update", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Report updated" });
    setSelected(null);
    load();
  };

  const addViewer = async () => {
    const email = viewerEmail.trim().toLowerCase();
    if (!email) return;
    setAddingViewer(true);
    const { data: profile, error: pErr } = await supabase
      .from("profiles")
      .select("id")
      .ilike("email", email)
      .maybeSingle();
    if (pErr || !profile) {
      setAddingViewer(false);
      toast({ title: "User not found", description: "No account with that email exists.", variant: "destructive" });
      return;
    }
    const { data: auth } = await supabase.auth.getUser();
    const { error } = await db
      .from("feedback_viewers")
      .insert({ project_id: projectId, user_id: (profile as { id: string }).id, granted_by: auth.user?.id } as never);
    setAddingViewer(false);
    if (error) {
      toast({ title: "Could not add viewer", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Viewer added", description: email });
    setViewerEmail("");
    loadViewers();
  };

  const removeViewer = async (id: string) => {
    const { error } = await db.from("feedback_viewers").delete().eq("id", id);
    if (error) toast({ title: "Could not remove", description: error.message, variant: "destructive" });
    else loadViewers();
  };

  if (denied && !loading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <ShieldCheck className="mx-auto h-10 w-10 text-slate-300" />
        <h3 className="mt-3 font-semibold text-slate-900">Restricted area</h3>
        <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">
          Community feedback reports are confidential. Only Super Admins and
          approved viewers can see them.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <FeedbackQrCard projectId={projectId} projectName={projectName} />

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Total reports", value: counts.total, icon: MessageSquareHeart, tone: "text-slate-900" },
          { label: "New", value: counts.new, icon: Clock, tone: "text-sky-600" },
          { label: "Sensitive", value: counts.sensitive, icon: AlertTriangle, tone: "text-rose-600" },
          { label: "Resolved", value: counts.resolved, icon: CheckCircle2, tone: "text-emerald-600" },
        ].map(({ label, value, icon: Icon, tone }) => (
          <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-slate-500">{label}</p>
              <Icon className={cn("h-4 w-4", tone)} />
            </div>
            <p className={cn("mt-1 text-2xl font-bold tabular-nums", tone)}>{value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search reference, message, location…" className="rounded-xl pl-9" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px] rounded-xl"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="new">New</SelectItem>
            <SelectItem value="in_review">In review</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
            <SelectItem value="closed">Closed</SelectItem>
          </SelectContent>
        </Select>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-[180px] rounded-xl"><SelectValue placeholder="Category" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {Object.entries(CATEGORY_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button variant="outline" size="icon" onClick={load} className="rounded-xl" aria-label="Refresh">
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
        </Button>
        {canManage && (
          <Button variant="outline" onClick={() => setViewersOpen(true)} className="rounded-xl">
            <UserPlus className="mr-1.5 h-4 w-4" /> Manage viewers
          </Button>
        )}
      </div>

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-14"><Loader2 className="h-7 w-7 animate-spin text-teal-600" /></div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <MessageSquareHeart className="mx-auto h-9 w-9 text-slate-300" />
          <p className="mt-2 text-sm text-slate-500">No reports match. Share the QR code above to start receiving community feedback.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((r) => (
            <button
              key={r.id}
              onClick={() => { setSelected(r); setNote(r.resolution_note || ""); }}
              className="w-full rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition-all hover:border-teal-300 hover:shadow"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs font-semibold text-slate-500">{r.reference}</span>
                <Badge variant="outline" className={cn("border text-[10px]", STATUS_STYLES[r.status] || STATUS_STYLES.new)}>
                  {r.status.replace("_", " ")}
                </Badge>
                {r.severity === "sensitive" && (
                  <Badge variant="outline" className="border-rose-200 bg-rose-50 text-[10px] text-rose-700">sensitive</Badge>
                )}
                {r.severity === "serious" && (
                  <Badge variant="outline" className="border-amber-200 bg-amber-50 text-[10px] text-amber-700">serious</Badge>
                )}
                <span className="ml-auto text-xs text-slate-400">{new Date(r.created_at).toLocaleString()}</span>
              </div>
              <p className="mt-1.5 text-sm font-semibold text-slate-900">{CATEGORY_LABELS[r.category] || r.category}</p>
              <p className="mt-0.5 line-clamp-2 text-sm text-slate-600">{r.message}</p>
              <p className="mt-1 text-xs text-slate-400">
                {[r.community, r.ward, r.lga, r.state].filter(Boolean).join(" · ") || "Location not given"}
                {" — "}{r.is_anonymous ? "Anonymous reporter" : r.reporter_name || "Unnamed reporter"}
              </p>
            </button>
          ))}
        </div>
      )}

      {/* Detail dialog */}
      <Dialog open={Boolean(selected)} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-lg rounded-2xl">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <span className="font-mono text-sm text-slate-500">{selected.reference}</span>
                  <Badge variant="outline" className={cn("border text-[10px]", STATUS_STYLES[selected.status])}>
                    {selected.status.replace("_", " ")}
                  </Badge>
                </DialogTitle>
                <DialogDescription>
                  {CATEGORY_LABELS[selected.category]} · {new Date(selected.created_at).toLocaleString()}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3 text-sm">
                <p className="rounded-xl bg-slate-50 p-3 leading-relaxed text-slate-700">{selected.message}</p>
                <div className="grid grid-cols-2 gap-2 text-xs text-slate-500">
                  <p><span className="font-medium text-slate-700">Location:</span> {[selected.community, selected.ward, selected.lga, selected.state].filter(Boolean).join(", ") || "—"}</p>
                  <p><span className="font-medium text-slate-700">Reporter:</span> {selected.is_anonymous ? "Anonymous" : selected.reporter_name || "—"}</p>
                  {!selected.is_anonymous && (
                    <>
                      <p><span className="font-medium text-slate-700">Phone:</span> {selected.reporter_phone || "—"}</p>
                      <p><span className="font-medium text-slate-700">Email:</span> {selected.reporter_email || "—"}</p>
                    </>
                  )}
                </div>
                <div>
                  <p className="mb-1 text-xs font-medium text-slate-700">Resolution note</p>
                  <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="What was done about this report…" className="rounded-xl" />
                </div>
              </div>
              <DialogFooter className="flex-wrap gap-2">
                <Button variant="outline" disabled={saving} onClick={() => updateStatus("in_review")} className="rounded-lg">
                  <Eye className="mr-1.5 h-4 w-4" /> Mark in review
                </Button>
                <Button disabled={saving} onClick={() => updateStatus("resolved")} className="rounded-lg bg-emerald-600 hover:bg-emerald-700">
                  {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-1.5 h-4 w-4" />} Resolve
                </Button>
                <Button variant="ghost" disabled={saving} onClick={() => updateStatus("closed")} className="rounded-lg">Close</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Viewers dialog */}
      <Dialog open={viewersOpen} onOpenChange={setViewersOpen}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle>Who can see these reports</DialogTitle>
            <DialogDescription>
              Super Admins always have access. Add other trusted users below.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <Input value={viewerEmail} onChange={(e) => setViewerEmail(e.target.value)} placeholder="user@example.com" type="email" className="rounded-xl" />
            <Button onClick={addViewer} disabled={addingViewer} className="rounded-xl bg-teal-600 hover:bg-teal-700">
              {addingViewer ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add"}
            </Button>
          </div>
          <div className="mt-3 space-y-2">
            {viewers.length === 0 && <p className="text-sm text-slate-400">No additional viewers yet.</p>}
            {viewers.map((v) => (
              <div key={v.id} className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2">
                <div>
                  <p className="text-sm font-medium text-slate-900">{v.profiles?.full_name || "Unnamed user"}</p>
                  <p className="text-xs text-slate-400">{v.profiles?.email}</p>
                </div>
                <Button variant="ghost" size="icon" onClick={() => removeViewer(v.id)} aria-label="Remove viewer">
                  <X className="h-4 w-4 text-slate-400" />
                </Button>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default FeedbackReportsPanel;

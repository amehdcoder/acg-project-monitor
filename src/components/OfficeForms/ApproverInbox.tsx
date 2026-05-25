import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Inbox, CheckCircle2, XCircle, ShieldCheck, CalendarCheck, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { APPROVER_ROLE_META, type ApproverRole } from "./approvals";
import { OFFICE_FORMS } from "./types";

const ICON: Record<string, any> = { leave: CalendarCheck, stationery: Package, srf: ShieldCheck, incident: ShieldCheck };

export default function ApproverInbox({ roles, onBack }: { roles: ApproverRole[]; onBack: () => void }) {
  const { user } = useAuth();
  const [activeRole, setActiveRole] = useState<ApproverRole>(roles[0]);
  const [rows, setRows] = useState<any[]>([]);
  const [filter, setFilter] = useState<"pending" | "all">("pending");
  const [active, setActive] = useState<any | null>(null);

  const codes = APPROVER_ROLE_META[activeRole].codes;

  async function load() {
    const { data } = await supabase
      .from("office_form_submissions" as any)
      .select("*")
      .in("form_code", codes as any)
      .order("created_at", { ascending: false })
      .limit(500);
    setRows((data as any[]) || []);
  }
  useEffect(() => { load(); }, [activeRole]);

  const filtered = useMemo(() => filter === "pending" ? rows.filter(r => r.approval_status === "pending") : rows, [rows, filter]);
  const meta = APPROVER_ROLE_META[activeRole];

  if (active) {
    return <DecisionPanel sub={active} role={activeRole} onBack={() => { setActive(null); load(); }} approverId={user?.id} />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-slate-50">
      <div className="bg-white border-b border-border/60 sticky top-0 z-30 px-3 sm:px-6 py-3 flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="h-4 w-4 mr-1" /> Back</Button>
        <h1 className="text-base sm:text-lg font-bold truncate flex-1 flex items-center gap-2"><Inbox className="h-5 w-5" /> Approver Inbox</h1>
      </div>
      <div className="p-3 sm:p-6 max-w-5xl mx-auto space-y-4">
        {roles.length > 1 && (
          <Tabs value={activeRole} onValueChange={v => setActiveRole(v as ApproverRole)}>
            <TabsList>
              {roles.map(r => <TabsTrigger key={r} value={r}>{APPROVER_ROLE_META[r].title}</TabsTrigger>)}
            </TabsList>
          </Tabs>
        )}

        <Card className={`p-4 ${meta.tintBg} border-0`}>
          <p className={`text-sm font-bold ${meta.tintFg}`}>{meta.title}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{meta.subtitle}</p>
        </Card>

        <div className="flex gap-2">
          <Button variant={filter === "pending" ? "default" : "outline"} size="sm" onClick={() => setFilter("pending")}>
            Pending ({rows.filter(r => r.approval_status === "pending").length})
          </Button>
          <Button variant={filter === "all" ? "default" : "outline"} size="sm" onClick={() => setFilter("all")}>
            All ({rows.length})
          </Button>
        </div>

        <Card className="border border-border/60 divide-y divide-border/60">
          {filtered.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">
              <Inbox className="h-10 w-10 mx-auto mb-3 opacity-40" /> No items.
            </div>
          ) : filtered.map(r => {
            const Icon = ICON[r.form_code] || Inbox;
            const fmeta = OFFICE_FORMS.find(f => f.code === r.form_code);
            return (
              <button key={r.id} onClick={() => setActive(r)} className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-muted/40 transition-colors">
                <div className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ${fmeta?.tintBg}`}>
                  <Icon className={`h-5 w-5 ${fmeta?.tintFg}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-[10px] font-semibold uppercase bg-muted px-1.5 py-0.5 rounded">{r.reference_code}</span>
                    <span className="text-sm font-medium truncate">{fmeta?.title}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">
                    {summarize(r)} · {format(new Date(r.created_at), "dd MMM yyyy")}
                  </p>
                </div>
                <span className={`shrink-0 text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full ${statusTint(r.approval_status)}`}>
                  {r.approval_status}
                </span>
              </button>
            );
          })}
        </Card>
      </div>
    </div>
  );
}

function statusTint(s: string) {
  return s === "approved" ? "bg-emerald-100 text-emerald-700"
    : s === "rejected" ? "bg-rose-100 text-rose-700"
    : s === "in_progress" ? "bg-blue-100 text-blue-700"
    : s === "closed" ? "bg-slate-100 text-slate-700"
    : "bg-amber-100 text-amber-700";
}

function summarize(r: any) {
  const d = r.data || {};
  if (r.form_code === "leave") return `${d.staff_name || "—"} · ${d.leave_type || "leave"} · ${d.total_working_days || 0}d`;
  if (r.form_code === "stationery") return `${d.requesting_officer || "—"} · ${(d.items || []).length} item(s)`;
  if (r.form_code === "srf") return `${d.category || "Concern"} · ${d.state || ""}`;
  if (r.form_code === "incident") return `${d.incident_type || "Incident"} · ${d.severity || ""}`;
  return "";
}

function DecisionPanel({ sub, role, onBack, approverId }: { sub: any; role: ApproverRole; onBack: () => void; approverId?: string }) {
  const d = sub.data || {};
  const [notes, setNotes] = useState(sub.approver_notes || "");
  const [action, setAction] = useState(sub.approver_action || "");
  const [nextStep, setNextStep] = useState(sub.next_step || "");
  const [items, setItems] = useState<any[]>(() => {
    if (sub.approved_items?.length) return sub.approved_items;
    return (d.items || []).map((i: any) => ({ ...i, approved_quantity: i.quantity, approved: true }));
  });
  const [saving, setSaving] = useState(false);

  async function update(status: string) {
    setSaving(true);
    const patch: any = {
      approval_status: status,
      approver_notes: notes || null,
      approved_by: approverId,
      approved_at: new Date().toISOString(),
    };
    if (role === "admin") {
      patch.approved_items = items.filter(i => i.approved !== false);
    }
    if (role === "safeguarding") {
      patch.approver_action = action || null;
      patch.next_step = nextStep || null;
    }
    const { error } = await supabase.from("office_form_submissions" as any).update(patch).eq("id", sub.id);
    setSaving(false);
    if (error) { toast({ title: "Failed", description: error.message, variant: "destructive" }); return; }
    toast({ title: `Marked ${status}` });
    onBack();
  }

  const fmeta = OFFICE_FORMS.find(f => f.code === sub.form_code);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-slate-50">
      <div className="bg-white border-b border-border/60 sticky top-0 z-30 px-3 sm:px-6 py-3 flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="h-4 w-4 mr-1" /> Back</Button>
        <h1 className="text-base sm:text-lg font-bold truncate flex-1">{fmeta?.title} · <span className="font-mono text-xs">{sub.reference_code}</span></h1>
      </div>
      <div className="p-3 sm:p-6 max-w-3xl mx-auto space-y-4">
        <Card className="p-5 border border-border/60">
          <h3 className="font-semibold text-sm mb-3">Submission details</h3>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-sm">
            {Object.entries(d).filter(([k]) => k !== "items").slice(0, 16).map(([k, v]) => (
              <div key={k}><dt className="text-[11px] uppercase tracking-wider text-muted-foreground">{k.replace(/_/g, " ")}</dt><dd className="text-foreground/90 truncate">{String(v || "—")}</dd></div>
            ))}
          </dl>
        </Card>

        {role === "admin" && (
          <Card className="p-5 border border-border/60">
            <h3 className="font-semibold text-sm mb-3">Approve items & quantities</h3>
            <table className="w-full text-sm">
              <thead className="text-xs uppercase text-muted-foreground"><tr><th className="text-left py-2">Item</th><th className="text-left">Requested</th><th className="text-left">Approve Qty</th><th className="text-right">Drop</th></tr></thead>
              <tbody className="divide-y">
                {items.map((it, i) => (
                  <tr key={i} className={it.approved === false ? "opacity-40" : ""}>
                    <td className="py-2"><div className="font-medium">{it.item}</div><div className="text-xs text-muted-foreground">{it.specification}</div></td>
                    <td>{it.quantity} {it.unit}</td>
                    <td><Input type="number" min={0} value={it.approved_quantity ?? it.quantity} onChange={e => setItems(prev => prev.map((x, j) => j === i ? { ...x, approved_quantity: Number(e.target.value) } : x))} className="h-8 w-24" /></td>
                    <td className="text-right"><Button size="sm" variant="ghost" onClick={() => setItems(prev => prev.map((x, j) => j === i ? { ...x, approved: x.approved === false } : x))}>{it.approved === false ? "Restore" : "Drop"}</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}

        {role === "safeguarding" && (
          <Card className="p-5 border border-border/60 space-y-3">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Action taken</label>
              <Textarea rows={4} value={action} onChange={e => setAction(e.target.value)} placeholder="Describe the action taken on this report…" />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Next step</label>
              <Textarea rows={3} value={nextStep} onChange={e => setNextStep(e.target.value)} placeholder="What happens next…" />
            </div>
          </Card>
        )}

        <Card className="p-5 border border-border/60">
          <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Officer note</label>
          <Textarea rows={3} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Add a note to the submitter…" />
        </Card>

        <div className="flex flex-wrap items-center gap-2 sticky bottom-0 bg-white/90 backdrop-blur border-t border-border/60 -mx-3 sm:-mx-6 px-3 sm:px-6 py-3">
          {role === "safeguarding" && (
            <Button variant="outline" disabled={saving} onClick={() => update("in_progress")}>Mark in progress</Button>
          )}
          <Button variant="outline" disabled={saving} onClick={() => update("rejected")}>
            <XCircle className="h-4 w-4 mr-1.5" /> Reject
          </Button>
          <Button disabled={saving} onClick={() => update(role === "safeguarding" ? "closed" : "approved")} className="bg-emerald-600 hover:bg-emerald-700">
            <CheckCircle2 className="h-4 w-4 mr-1.5" /> {role === "safeguarding" ? "Mark closed" : "Approve"}
          </Button>
        </div>
      </div>
    </div>
  );
}

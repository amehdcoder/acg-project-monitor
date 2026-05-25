import { useEffect, useState } from "react";
import { CheckCircle2, Clock, XCircle, CalendarCheck, Package, ShieldCheck, ArrowRight } from "lucide-react";
import { format, addDays, parseISO } from "date-fns";
import { ANNUAL_LEAVE_DAYS, getAnnualLeaveBalance } from "./approvals";

interface Props {
  submission: any;
  submitterName?: string;
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { bg: string; fg: string; icon: any; label: string }> = {
    pending:     { bg: "bg-amber-50",   fg: "text-amber-700",   icon: Clock,       label: "Pending review" },
    in_progress: { bg: "bg-blue-50",    fg: "text-blue-700",    icon: Clock,       label: "In progress" },
    approved:    { bg: "bg-emerald-50", fg: "text-emerald-700", icon: CheckCircle2, label: "Approved" },
    rejected:    { bg: "bg-rose-50",    fg: "text-rose-700",    icon: XCircle,     label: "Rejected" },
    closed:      { bg: "bg-slate-100",  fg: "text-slate-700",   icon: CheckCircle2, label: "Closed" },
  };
  const s = map[status] || map.pending;
  const Icon = s.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${s.bg} ${s.fg}`}>
      <Icon className="h-3.5 w-3.5" /> {s.label}
    </span>
  );
}

export default function ApprovalStatusCard({ submission, submitterName }: Props) {
  const s = submission;
  const code = s.form_code as string;
  const status = s.approval_status as string;
  const decisionAt = s.approved_at ? format(new Date(s.approved_at), "dd MMM yyyy, HH:mm") : null;

  // Leave
  if (code === "leave") {
    return <LeaveCard sub={s} submitterName={submitterName} status={status} decisionAt={decisionAt} />;
  }
  if (code === "stationery") {
    return <StationeryCard sub={s} status={status} decisionAt={decisionAt} />;
  }
  // SRF / Incident
  return <SafeguardingCard sub={s} status={status} decisionAt={decisionAt} />;
}

function LeaveCard({ sub, submitterName, status, decisionAt }: any) {
  const d = sub.data || {};
  const [balance, setBalance] = useState<{ used: number; remaining: number; total: number } | null>(null);
  useEffect(() => {
    if (status === "approved" && sub.submitted_by) {
      getAnnualLeaveBalance(sub.submitted_by).then(setBalance);
    }
  }, [status, sub.submitted_by]);
  const resumeDate = d.end_date ? format(addDays(parseISO(d.end_date), 1), "EEEE, dd MMMM yyyy") : "—";

  if (status === "approved") {
    return (
      <div className="rounded-2xl overflow-hidden border border-emerald-200 shadow-md bg-gradient-to-br from-emerald-50 via-white to-emerald-50">
        <div className="px-5 py-3 bg-emerald-600 text-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5" />
            <span className="font-semibold">Leave Approved</span>
          </div>
          <span className="text-xs opacity-90 font-mono">{sub.reference_code}</span>
        </div>
        <div className="p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-12 w-12 rounded-full bg-emerald-100 flex items-center justify-center">
              <CalendarCheck className="h-6 w-6 text-emerald-700" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-emerald-700 font-semibold">Approved for</p>
              <h3 className="text-lg font-bold text-foreground">{d.staff_name || submitterName || "Staff"}</h3>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Stat label="Leave Type" value={(d.leave_type || "annual").replace(/_/g, " ")} className="capitalize" />
            <Stat label="Days Approved" value={`${d.total_working_days || 0}`} />
            <Stat label="Resume Date" value={resumeDate} />
            <Stat label="Balance Left" value={balance ? `${balance.remaining} / ${balance.total}` : "—"} highlight />
          </div>
          {sub.approver_notes && (
            <div className="mt-4 p-3 bg-white/70 border border-emerald-100 rounded-lg">
              <p className="text-xs font-semibold text-emerald-800 mb-1">HR Officer's Note</p>
              <p className="text-sm text-foreground/80">{sub.approver_notes}</p>
            </div>
          )}
          {decisionAt && <p className="text-[11px] text-muted-foreground mt-3">Approved {decisionAt}</p>}
        </div>
      </div>
    );
  }

  return (
    <SimpleStatusCard
      icon={<CalendarCheck className="h-5 w-5" />}
      title="Leave Application"
      reference={sub.reference_code}
      status={status}
      meta={`${d.leave_type || "leave"} · ${d.total_working_days || 0} day(s)`}
      notes={sub.approver_notes}
      decisionAt={decisionAt}
    />
  );
}

function StationeryCard({ sub, status, decisionAt }: any) {
  const d = sub.data || {};
  if (status !== "approved" && status !== "in_progress") {
    return (
      <SimpleStatusCard
        icon={<Package className="h-5 w-5" />}
        title="Stationery Request"
        reference={sub.reference_code}
        status={status}
        meta={`${(d.items || []).length} item(s) requested`}
        notes={sub.approver_notes}
        decisionAt={decisionAt}
      />
    );
  }
  const approvedItems: any[] = sub.approved_items || d.items || [];
  return (
    <div className="rounded-2xl overflow-hidden border border-blue-200 shadow-md bg-gradient-to-br from-blue-50 via-white to-blue-50">
      <div className="px-5 py-3 bg-blue-600 text-white flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5" />
          <span className="font-semibold">Stationery Request Approved</span>
        </div>
        <span className="text-xs opacity-90 font-mono">{sub.reference_code}</span>
      </div>
      <div className="p-5">
        <p className="text-xs uppercase tracking-wide text-blue-700 font-semibold mb-2">Items approved by Administration Officer</p>
        <div className="rounded-lg border border-blue-100 overflow-hidden bg-white">
          <table className="w-full text-sm">
            <thead className="bg-blue-50 text-xs uppercase text-blue-900">
              <tr><th className="text-left px-3 py-2">Item</th><th className="text-left px-3 py-2">Spec</th><th className="text-right px-3 py-2 w-20">Qty</th><th className="text-left px-3 py-2 w-24">Unit</th></tr>
            </thead>
            <tbody className="divide-y divide-blue-50">
              {approvedItems.map((it: any, i: number) => (
                <tr key={i}>
                  <td className="px-3 py-2 font-medium">{it.item}</td>
                  <td className="px-3 py-2 text-muted-foreground">{it.specification || "—"}</td>
                  <td className="px-3 py-2 text-right font-semibold">{it.approved_quantity ?? it.quantity}</td>
                  <td className="px-3 py-2">{it.unit}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {sub.approver_notes && (
          <div className="mt-4 p-3 bg-white/70 border border-blue-100 rounded-lg">
            <p className="text-xs font-semibold text-blue-800 mb-1">Administration Officer's Note</p>
            <p className="text-sm text-foreground/80">{sub.approver_notes}</p>
          </div>
        )}
        {decisionAt && <p className="text-[11px] text-muted-foreground mt-3">Approved {decisionAt}</p>}
      </div>
    </div>
  );
}

function SafeguardingCard({ sub, status, decisionAt }: any) {
  if (status === "pending") {
    return (
      <SimpleStatusCard
        icon={<ShieldCheck className="h-5 w-5" />}
        title={sub.form_code === "srf" ? "Safeguarding Report" : "Safeguarding Incident"}
        reference={sub.reference_code}
        status={status}
        meta="Awaiting Safeguarding Officer"
        notes={sub.approver_notes}
        decisionAt={decisionAt}
      />
    );
  }
  return (
    <div className="rounded-2xl overflow-hidden border border-violet-200 shadow-md bg-gradient-to-br from-violet-50 via-white to-violet-50">
      <div className="px-5 py-3 bg-violet-600 text-white flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5" />
          <span className="font-semibold">Safeguarding Officer Update</span>
        </div>
        <span className="text-xs opacity-90 font-mono">{sub.reference_code}</span>
      </div>
      <div className="p-5 space-y-4">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-full bg-violet-100 flex items-center justify-center shrink-0">
            <CheckCircle2 className="h-5 w-5 text-violet-700" />
          </div>
          <div className="flex-1">
            <p className="text-xs uppercase tracking-wide text-violet-700 font-semibold">Action taken</p>
            <p className="text-sm text-foreground mt-1 whitespace-pre-wrap">{sub.approver_action || sub.approver_notes || "Action recorded by the officer."}</p>
          </div>
        </div>
        {sub.next_step && (
          <div className="flex items-start gap-3 p-3 rounded-lg bg-white border border-violet-100">
            <ArrowRight className="h-5 w-5 text-violet-600 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs uppercase tracking-wide text-violet-700 font-semibold">Next step</p>
              <p className="text-sm text-foreground mt-0.5 whitespace-pre-wrap">{sub.next_step}</p>
            </div>
          </div>
        )}
        <div className="flex items-center justify-between">
          <StatusPill status={status} />
          {decisionAt && <p className="text-[11px] text-muted-foreground">Updated {decisionAt}</p>}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, highlight, className }: { label: string; value: string; highlight?: boolean; className?: string }) {
  return (
    <div className={`rounded-lg p-3 ${highlight ? "bg-emerald-100" : "bg-white/70"} border border-emerald-100`}>
      <p className="text-[10px] uppercase tracking-wider text-emerald-700 font-semibold">{label}</p>
      <p className={`text-sm font-bold text-foreground mt-0.5 ${className || ""}`}>{value}</p>
    </div>
  );
}

function SimpleStatusCard({ icon, title, reference, status, meta, notes, decisionAt }: any) {
  return (
    <div className="rounded-xl border border-border/60 bg-white shadow-sm p-4 flex items-start gap-3">
      <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-[10px] font-semibold uppercase bg-muted px-1.5 py-0.5 rounded">{reference}</span>
          <span className="text-sm font-semibold">{title}</span>
          <StatusPill status={status} />
        </div>
        <p className="text-xs text-muted-foreground mt-1">{meta}</p>
        {notes && <p className="text-xs text-foreground/80 mt-2 p-2 bg-muted/40 rounded">{notes}</p>}
        {decisionAt && <p className="text-[11px] text-muted-foreground mt-1.5">{decisionAt}</p>}
      </div>
    </div>
  );
}

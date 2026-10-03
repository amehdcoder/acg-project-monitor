import { useMemo, useState } from "react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell,
  PieChart, Pie, Legend, AreaChart, Area,
} from "recharts";
import { Trash2, Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { BmzRow } from "@/hooks/useBmzDashboard";
import { BMZ_GREEN, BMZ_TEAL, cadreLabel, availLabel, readinessBand } from "@/lib/bmz/definition";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const Box = ({ title, children, wide }: { title: string; children: React.ReactNode; wide?: boolean }) => (
  <div className={`rounded-2xl bg-white p-4 shadow-sm ${wide ? "md:col-span-2" : ""}`}>
    <h3 className="mb-3 text-sm font-bold" style={{ color: BMZ_GREEN }}>{title}</h3>
    {children}
  </div>
);

const yesNo = (rows: BmzRow[], key: keyof BmzRow) => {
  const y = rows.filter((r) => r[key] === true).length;
  const n = rows.filter((r) => r[key] === false).length;
  return [
    { name: "Yes", value: y, color: "#16a34a" },
    { name: "No", value: n, color: "#dc2626" },
  ].filter((x) => x.value > 0);
};

interface Props { rows: BmzRow[]; canDelete: boolean; onDeleted: () => void }

export default function BmzExtraInsights({ rows, canDelete, onDeleted }: Props) {
  const visits = useMemo(() => rows.filter((r) => r.status === "sent" || r.status === "finalized"), [rows]);
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(50);
  const [target, setTarget] = useState<BmzRow | null>(null);
  const [busy, setBusy] = useState(false);

  const overTime = useMemo(() => {
    const m = new Map<string, { visits: number; screened: number; referrals: number }>();
    visits.forEach((v) => {
      const k = (v.date_of_visit || v.created_at || "").slice(0, 10);
      if (!k) return;
      const e = m.get(k) || { visits: 0, screened: 0, referrals: 0 };
      e.visits++; e.screened += v.total_screened ?? 0; e.referrals += v.num_referrals ?? 0;
      m.set(k, e);
    });
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, e]) => ({ date, ...e }));
  }, [visits]);

  const byLga = useMemo(() => {
    const m = new Map<string, { screened: number; referrals: number; gatherings: number }>();
    visits.forEach((v) => {
      const k = v.lga || "Unknown";
      const e = m.get(k) || { screened: 0, referrals: 0, gatherings: 0 };
      e.screened += v.total_screened ?? 0; e.referrals += v.num_referrals ?? 0; e.gatherings += v.gatherings_count ?? 0;
      m.set(k, e);
    });
    return [...m.entries()].map(([name, e]) => ({ name, ...e })).sort((a, b) => b.screened - a.screened);
  }, [visits]);

  const bands = useMemo(() => {
    const m = new Map<string, { value: number; color: string }>();
    visits.forEach((v) => {
      const b = readinessBand(Number(v.compliance_score ?? 0));
      const e = m.get(b.label) || { value: 0, color: b.color };
      e.value++; m.set(b.label, e);
    });
    return [...m.entries()].map(([name, e]) => ({ name, ...e }));
  }, [visits]);

  const facilities = useMemo(() => {
    const m = new Map<string, number>();
    visits.forEach((v) => { const k = (v.linked_facility || "").trim(); if (k) m.set(k, (m.get(k) || 0) + 1); });
    return [...m.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 15);
  }, [visits]);

  const trained = useMemo(() => yesNo(visits, "trained_eye_care"), [visits]);
  const register = useMemo(() => yesNo(visits, "register_updated"), [visits]);
  const refEvidence = useMemo(() => yesNo(visits, "referrals_evidence"), [visits]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    const list = [...rows].sort((a, b) => (b.date_of_visit || b.created_at).localeCompare(a.date_of_visit || a.created_at));
    if (!s) return list;
    return list.filter((r) => [r.community_ward, r.lga, r.linked_facility, r.state_supervisor, cadreLabel(r.cadre || "")]
      .some((x) => (x || "").toLowerCase().includes(s)));
  }, [rows, q]);

  const doDelete = async () => {
    if (!target) return;
    setBusy(true);
    const { error, count } = await supabase.from("bmz_monitoring" as any).delete({ count: "exact" }).eq("id", target.id);
    setBusy(false);
    if (error || !count) { toast.error(error?.message || "You don't have permission to delete this record."); return; }
    toast.success("Record deleted");
    setTarget(null);
    onDeleted();
  };

  const pie = (data: { name: string; value: number; color: string }[]) => (
    <ResponsiveContainer width="100%" height={190}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius={42} outerRadius={70} paddingAngle={2}>
          {data.map((r, i) => <Cell key={i} fill={r.color} />)}
        </Pie>
        <Legend wrapperStyle={{ fontSize: 11 }} /><Tooltip />
      </PieChart>
    </ResponsiveContainer>
  );

  return (
    <>
      {overTime.length > 0 && (
        <Box title="Visits, screening & referrals over time">
          <ResponsiveContainer width="100%" height={230}>
            <AreaChart data={overTime} margin={{ left: -10, right: 10 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip /><Legend wrapperStyle={{ fontSize: 11 }} />
              <Area dataKey="screened" name="Screened" stroke={BMZ_TEAL} fill={BMZ_TEAL} fillOpacity={0.2} />
              <Area dataKey="referrals" name="Referrals" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.2} />
              <Area dataKey="visits" name="Visits" stroke={BMZ_GREEN} fill={BMZ_GREEN} fillOpacity={0.15} />
            </AreaChart>
          </ResponsiveContainer>
        </Box>
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Box title="Trained on primary eye care">{pie(trained)}</Box>
        <Box title="Register up to date">{pie(register)}</Box>
        <Box title="Evidence of referrals">{pie(refEvidence)}</Box>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Box title="Readiness band distribution">{pie(bands)}</Box>
        <Box title="People screened, referrals & gatherings by LGA" wide>
          <ResponsiveContainer width="100%" height={Math.max(200, byLga.length * 30)}>
            <BarChart data={byLga} layout="vertical" margin={{ left: 10, right: 20 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 10 }} />
              <Tooltip /><Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="screened" name="Screened" fill={BMZ_TEAL} radius={[0, 4, 4, 0]} />
              <Bar dataKey="referrals" name="Referrals" fill="#f59e0b" radius={[0, 4, 4, 0]} />
              <Bar dataKey="gatherings" name="Gatherings" fill={BMZ_GREEN} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Box>
      </div>

      {facilities.length > 0 && (
        <Box title="Visits by linked health facility (top 15)">
          <ResponsiveContainer width="100%" height={Math.max(200, facilities.length * 28)}>
            <BarChart data={facilities} layout="vertical" margin={{ left: 10, right: 24 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="name" width={170} tick={{ fontSize: 10 }} />
              <Tooltip />
              <Bar dataKey="value" name="Visits" fill={BMZ_GREEN} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Box>
      )}

      <Box title={`All monitoring records (${filtered.length})`}>
        <div className="mb-2 flex items-center gap-2 rounded-lg border border-border px-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search community, LGA, facility, supervisor…"
            className="h-9 flex-1 bg-transparent text-xs outline-none" />
        </div>
        <div className="-mx-2 overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-xs">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="px-2 py-2">Date</th><th className="px-2 py-2">Community / Ward</th><th className="px-2 py-2">LGA</th>
                <th className="px-2 py-2">Cadre</th><th className="px-2 py-2">Facility</th><th className="px-2 py-2">Kits</th>
                <th className="px-2 py-2 text-right">Screened</th><th className="px-2 py-2 text-right">Compliance</th><th className="px-2 py-2">Status</th>
                {canDelete && <th className="px-2 py-2" />}
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, limit).map((r) => (
                <tr key={r.id} className="border-b border-border/60 hover:bg-muted/40">
                  <td className="px-2 py-2 font-mono">{r.date_of_visit || r.created_at.slice(0, 10)}</td>
                  <td className="px-2 py-2 font-medium text-foreground">{r.community_ward || "—"}</td>
                  <td className="px-2 py-2">{r.lga || "—"}</td>
                  <td className="px-2 py-2">{cadreLabel(r.cadre || "")}</td>
                  <td className="px-2 py-2">{r.linked_facility || "—"}</td>
                  <td className="px-2 py-2">{availLabel(r.screening_kits || "")}</td>
                  <td className="px-2 py-2 text-right">{r.total_screened ?? 0}</td>
                  <td className="px-2 py-2 text-right">{Math.round(Number(r.compliance_score ?? 0))}%</td>
                  <td className="px-2 py-2 capitalize">{r.status}</td>
                  {canDelete && (
                    <td className="px-2 py-2 text-right">
                      <button onClick={() => setTarget(r)} title="Delete record"
                        className="rounded-md p-1.5 text-destructive hover:bg-destructive/10">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length > limit && (
          <button onClick={() => setLimit((l) => l + 100)} className="mt-2 w-full rounded-lg border border-border py-2 text-xs font-semibold">
            Show more ({filtered.length - limit} remaining)
          </button>
        )}
      </Box>

      <AlertDialog open={!!target} onOpenChange={(o) => !o && setTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this monitoring record?</AlertDialogTitle>
            <AlertDialogDescription>
              {target?.community_ward || "Record"} · {target?.lga} · {target?.date_of_visit}. This permanently removes it from the dashboard and exports.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); void doDelete(); }} disabled={busy}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

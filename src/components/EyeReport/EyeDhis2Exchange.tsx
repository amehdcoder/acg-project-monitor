import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ArrowDownToLine, ArrowUpFromLine, CheckCircle2, Loader2, Network, ShieldCheck, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { EYE_INDICATORS, computeEyeIndicators } from "@/lib/eyeReport/eyeIndicators";
import { eyeExchangePull, eyeExchangePush, listConnections, listMappings, type ExchangeConnection } from "@/lib/programmeModule/healthExchange";
import type { EyeReportRow } from "@/lib/eyeReport/definition";

interface PullRow { indicator_key: string; label: string; amehnities: number; dhis2: number | null; match: boolean }

/** DHIS2 Data Exchange for the daily report's standard Eye Health indicators. */
export default function EyeDhis2Exchange({ projectId, rows }: { projectId: string; rows: EyeReportRow[] }) {
  const [conns, setConns] = useState<ExchangeConnection[]>([]);
  const [connId, setConnId] = useState("");
  const [mapped, setMapped] = useState<Set<string>>(new Set());
  const prev = new Date(); prev.setUTCDate(1); prev.setUTCMonth(prev.getUTCMonth() - 1);
  const [month, setMonth] = useState(prev.toISOString().slice(0, 7));
  const [busy, setBusy] = useState("");
  const [pull, setPull] = useState<PullRow[] | null>(null);

  useEffect(() => {
    listConnections(projectId).then((c) => { const d = c.filter((x) => x.kind === "dhis2" && (x as any).scope !== "integrations"); setConns(d); setConnId((id) => id || d[0]?.id || ""); }).catch(() => setConns([]));
  }, [projectId]);
  useEffect(() => {
    if (!connId) return;
    setPull(null);
    listMappings(connId).then((m: any[]) => setMapped(new Set(m.filter((x) => x.remote_id && x.remote_id !== "UNMAPPED" && String(x.indicator_key).startsWith("eye_daily:")).map((x) => x.indicator_key)))).catch(() => setMapped(new Set()));
  }, [connId]);

  const period = month.replace("-", "");
  const values = useMemo(() => {
    const v = computeEyeIndicators(rows.filter((r) => r.report_date.startsWith(month)));
    return EYE_INDICATORS.map((d, i) => ({ ...d, value: v[i].value }));
  }, [rows, month]);
  const conn = conns.find((c) => c.id === connId);

  const run = async (kind: "dry" | "push" | "pull") => {
    if (!connId) return;
    setBusy(kind);
    try {
      if (kind === "pull") { const r = await eyeExchangePull(connId, period); setPull(r.rows); toast.success(`Pulled from DHIS2 — ${r.rows.filter((x: PullRow) => x.match).length}/${r.rows.length} match`); }
      else { const r = await eyeExchangePush(connId, period, {}, kind === "dry"); toast.success(r.message || (kind === "dry" ? "Dry run passed" : "Sent to DHIS2")); }
    } catch (e) { toast.error(e instanceof Error ? e.message : "DHIS2 exchange failed"); } finally { setBusy(""); }
  };

  const groups = [...new Set(values.map((v) => v.group))];
  const pullBy = new Map((pull ?? []).map((p) => [p.indicator_key, p]));

  return (
    <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
      <div className="bg-gradient-to-r from-eye-deep via-eye-blue to-eye-teal p-4 text-primary-foreground">
        <h3 className="flex items-center gap-2 text-base font-extrabold"><Network className="h-5 w-5" /> DHIS2 Data Exchange · Eye Health standard indicators</h3>
        <p className="text-xs opacity-85">Monthly totals from daily facility reports, pushed to and pulled from any connected DHIS2 server. Link each indicator to a data element under Beneficiary Records → DHIS2 Data Exchange. Pinhole/BCVA zeros mean it was not used and are never treated as poor results.</p>
      </div>
      <div className="flex flex-wrap items-end gap-3 border-b p-4">
        <label className="text-xs font-semibold">DHIS2 server
          <select value={connId} onChange={(e) => setConnId(e.target.value)} className="mt-1 block h-10 min-w-[220px] rounded-md border bg-background px-2 text-sm">
            {conns.length ? conns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>) : <option value="">No DHIS2 server connected</option>}
          </select>
        </label>
        <label className="text-xs font-semibold">Reporting month
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="mt-1 block h-10 rounded-md border bg-background px-2 text-sm" />
        </label>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={!connId || !!busy} onClick={() => void run("dry")}>{busy === "dry" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-1 h-4 w-4" />} Dry run</Button>
          <Button disabled={!connId || !!busy} onClick={() => void run("push")} className="bg-eye-blue text-primary-foreground hover:bg-eye-blue/90">{busy === "push" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <ArrowUpFromLine className="mr-1 h-4 w-4" />} Push to DHIS2</Button>
          <Button variant="secondary" disabled={!connId || !!busy} onClick={() => void run("pull")}>{busy === "pull" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <ArrowDownToLine className="mr-1 h-4 w-4" />} Pull & compare</Button>
        </div>
        {conn && <p className="w-full text-[11px] text-muted-foreground">Org unit: <span className="font-mono">{conn.org_unit_id || "not set"}</span> · Data set: <span className="font-mono">{conn.dataset_id || "any"}</span> · {mapped.size}/{EYE_INDICATORS.length} indicators linked</p>}
      </div>
      <div className="max-h-[420px] overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-muted text-left text-xs text-muted-foreground"><tr><th className="p-2">Indicator</th><th className="p-2 text-right">Amehnities</th><th className="p-2 text-right">DHIS2</th><th className="p-2">Link</th></tr></thead>
          <tbody>
            {groups.map((g) => (
              <>
                <tr key={g} className="bg-eye-sky"><td colSpan={4} className="p-2 text-xs font-bold uppercase tracking-wide text-eye-blue">{g}</td></tr>
                {values.filter((v) => v.group === g).map((v, i) => {
                  const p = pullBy.get(v.key);
                  return (
                    <motion.tr key={v.key} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: Math.min(i * 0.01, 0.3) }} className="border-t">
                      <td className="p-2">{v.label}</td>
                      <td className="p-2 text-right font-bold tabular-nums">{v.value}</td>
                      <td className="p-2 text-right tabular-nums">{p ? (p.dhis2 ?? "—") : ""}{p && (p.match ? <CheckCircle2 className="ml-1 inline h-4 w-4 text-status-success" /> : <XCircle className="ml-1 inline h-4 w-4 text-destructive" />)}</td>
                      <td className="p-2 text-xs">{mapped.has(v.key) ? <span className="rounded-full bg-status-success/15 px-2 py-0.5 font-semibold text-status-success">Linked</span> : <span className="text-muted-foreground">Not linked</span>}</td>
                    </motion.tr>
                  );
                })}
              </>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

import { useEffect, useMemo, useState } from "react";
import { ShieldCheck, Check, Ban, RotateCcw, Loader2, Search, Copy, AlertTriangle, Layers, Star } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useAcsmDuplicateOverrides } from "@/hooks/useAcsmDuplicateOverrides";
import {
  flagDuplicates, applyOverrides, buildOverrideMap,
  irfSignature, irfOrder, acsmSignature, acsmOrder,
} from "@/lib/acsm/irfBridge";
import type { IrfReport } from "@/lib/irf/definition";

interface Props {
  projectId?: string | null;
  /** light/dark theme tokens for embedding in the navy ACSM dashboard */
  dark?: boolean;
}

type SourceTable = "irf_reports" | "acsm_reports";

interface FlagItem {
  source: SourceTable;
  id: string;
  signature: string;
  label: string;
  sub: string;
  who: string;
  when: string;
  /** true if this row was auto-detected as a duplicate of an earlier one */
  autoDuplicate: boolean;
  /** true when this is the authoritative (first) row of its duplicate set */
  isOriginal: boolean;
}

/** A group of submissions that share the same signature (one original + duplicates). */
interface FlagGroup {
  key: string;
  signature: string;
  source: SourceTable;
  title: string;
  items: FlagItem[];
}

const fmtWhen = (s?: string | null) => (s ? new Date(s).toLocaleDateString() : "—");
const periodLabel = (value: unknown) => String(value ?? "").slice(0, 7) || "no period";

export default function DuplicateReviewPanel({ projectId, dark }: Props) {
  const { isAdmin, isOwnerLevel } = useAuth();
  const canReview = isAdmin || isOwnerLevel;
  const { overrides, irfMap, acsmMap, setOverride, clearOverride } = useAcsmDuplicateOverrides(projectId);

  const [irfRows, setIrfRows] = useState<IrfReport[]>([]);
  const [acsmRows, setAcsmRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      let irfQ = supabase.from("irf_reports" as any).select("*");
      let acsmQ = supabase.from("acsm_reports" as any).select("*");
      if (projectId) { irfQ = irfQ.eq("project_id", projectId); acsmQ = acsmQ.eq("project_id", projectId); }
      const [{ data: irf }, { data: acsm }] = await Promise.all([irfQ, acsmQ]);
      setIrfRows((irf as any) || []);
      setAcsmRows((acsm as any) || []);
    } finally { setLoading(false); }
  };

  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [projectId]);

  // Refresh when source data changes in realtime.
  useEffect(() => {
    const ch = supabase
      .channel(`dup_review_${projectId || "all"}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "irf_reports" }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "acsm_reports" }, () => void load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line
  }, [projectId]);

  // Reconciled counts shared with the LGA ACSM Focal Person + Advocacy dashboards.
  // We run the SAME flagDuplicates + applyOverrides pipeline the dashboards use so the
  // numbers shown here always match the unique counts rendered everywhere else.
  const reconciled = useMemo(() => {
    const irfOv = buildOverrideMap(
      overrides.map((o) => ({ submission_id: o.submission_id, decision: o.decision })),
    );
    const irfBase = flagDuplicates(irfRows, irfSignature, (r) => r.id, irfOrder);
    const irfFinal = applyOverrides(irfBase, (r) => r.id, irfMap);
    const acsmBase = flagDuplicates(acsmRows, acsmSignature, (r) => r.id, acsmOrder);
    const acsmFinal = applyOverrides(acsmBase, (r) => r.id, acsmMap);
    return {
      total: irfRows.length + acsmRows.length,
      unique: irfFinal.uniqueCount + acsmFinal.uniqueCount,
      duplicates: irfFinal.duplicateCount + acsmFinal.duplicateCount,
      rejected: irfFinal.rejectedCount + acsmFinal.rejectedCount,
      overriddenToUnique: irfFinal.overriddenToUnique + acsmFinal.overriddenToUnique,
    };
  }, [irfRows, acsmRows, overrides, irfMap, acsmMap]);

  // Build duplicate-set groups: any signature with more than one submission OR any
  // submission that already carries an admin decision (so reviewers can revisit it).
  const groups = useMemo<FlagGroup[]>(() => {
    const out: FlagGroup[] = [];

    const buildGroups = (
      rows: any[],
      source: SourceTable,
      sigFn: (r: any) => string,
      orderFn: (r: any) => number,
      ovMap: Map<string, string>,
      describe: (r: any) => { label: string; sub: string; who: string },
    ) => {
      const res = flagDuplicates(rows, sigFn, (r) => r.id, orderFn);
      res.groups.forEach((groupRows, signature) => {
        const hasOverride = groupRows.some((r) => ovMap.get(r.id));
        if (groupRows.length < 2 && !hasOverride) return;
        const items: FlagItem[] = groupRows.map((r, idx) => {
          const d = describe(r);
          return {
            source,
            id: r.id,
            signature,
            label: d.label,
            sub: d.sub,
            who: d.who,
            when: fmtWhen(r.created_at),
            autoDuplicate: res.duplicateIds.has(r.id),
            isOriginal: idx === 0,
          };
        });
        out.push({
          key: `${source}:${signature}`,
          signature,
          source,
          title: items[0]?.label || "Duplicate set",
          items,
        });
      });
    };

    buildGroups(irfRows, "irf_reports", irfSignature, irfOrder, irfMap, (r) => ({
      label: `${r.lga || "Unspecified LGA"}${r.ward ? " — " + r.ward : ""}`,
      sub: `IRF • ${periodLabel(r.reporting_month || r.reporting_period)}`,
      who: r.focal_person_name || r.created_by || "—",
    }));

    buildGroups(acsmRows, "acsm_reports", acsmSignature, acsmOrder, acsmMap, (r) => ({
      label: `${r.indicator || "indicator"} — ${r.lga || "Unspecified LGA"}`,
      sub: `ACSM • ${periodLabel(r.reporting_period)}`,
      who: r.responsible_officer || "—",
    }));

    return out.sort((a, b) => a.title.localeCompare(b.title));
  }, [irfRows, acsmRows, irfMap, acsmMap]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return groups;
    return groups
      .map((g) => ({
        ...g,
        items: g.items.filter((i) => `${i.label} ${i.sub} ${i.who}`.toLowerCase().includes(q)),
      }))
      .filter((g) => g.items.length > 0);
  }, [groups, search]);

  const decisionFor = (i: FlagItem) =>
    (i.source === "irf_reports" ? irfMap : acsmMap).get(i.id) || null;

  const act = async (i: FlagItem, decision: "unique" | "rejected" | "reset") => {
    setBusyId(i.id);
    try {
      if (decision === "reset") {
        await clearOverride(i.source, i.id);
        toast({ title: "Decision cleared", description: "Reverted to automatic detection." });
      } else {
        await setOverride({ sourceTable: i.source, submissionId: i.id, decision, signature: i.signature });
        toast({
          title: decision === "unique" ? "Marked as unique" : "Submission rejected",
          description: "Unique counts recomputed across both dashboards.",
        });
      }
    } catch (e: any) {
      toast({ title: "Action failed", description: e?.message || "Try again.", variant: "destructive" });
    } finally { setBusyId(null); }
  };

  const t = dark
    ? { card: "border-[#1c3a5e] bg-[#0f1f38]", sub: "text-[#8aa2c4]", text: "text-[#e6eefb]", row: "border-[#16304f]", chip: "bg-[#0b1830] border-[#1c3a5e]" }
    : { card: "border-border bg-card", sub: "text-muted-foreground", text: "text-foreground", row: "border-border", chip: "bg-muted/40 border-border" };

  const openCount = reconciled.duplicates;

  return (
    <section className={`rounded-xl border ${t.card} p-4`} aria-labelledby="dup-review-heading">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-amber-500" />
          <h3 id="dup-review-heading" className={`text-sm font-semibold ${t.text}`}>Duplicate submission review</h3>
          <Badge variant="secondary">{openCount} open</Badge>
        </div>
        <div className="relative w-44">
          <Search className={`absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 ${t.sub}`} aria-hidden="true" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search"
            aria-label="Search duplicate submissions" className="h-8 pl-7 text-xs" />
        </div>
      </div>

      {/* Reconciled counts — identical to the unique counts shown on every linked dashboard. */}
      <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { k: "Total", v: reconciled.total, tone: t.text },
          { k: "Unique", v: reconciled.unique, tone: "text-emerald-500" },
          { k: "Duplicates", v: reconciled.duplicates, tone: "text-amber-500" },
          { k: "Rejected", v: reconciled.rejected, tone: "text-red-500" },
        ].map((s) => (
          <div key={s.k} className={`rounded-lg border ${t.chip} px-3 py-2`}>
            <dt className={`text-[11px] ${t.sub}`}>{s.k}</dt>
            <dd className={`text-lg font-semibold tabular-nums ${s.tone}`}>{s.v}</dd>
          </div>
        ))}
      </dl>

      {!canReview && (
        <p className={`mt-3 flex items-center gap-1.5 text-xs ${t.sub}`}>
          <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" /> Only project admins and owners can change duplicate decisions.
        </p>
      )}

      <div className="mt-3 max-h-96 overflow-y-auto pr-1">
        {loading ? (
          <div className={`flex items-center gap-2 py-8 text-xs ${t.sub}`}>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading submissions…
          </div>
        ) : filtered.length === 0 ? (
          <div className={`py-8 text-center text-xs ${t.sub}`}>
            <Copy className="mx-auto mb-2 h-5 w-5 opacity-60" aria-hidden="true" />
            No duplicate flags to review. Unique counts are clean.
          </div>
        ) : (
          <ul className="space-y-3">
            {filtered.map((g) => (
              <li key={g.key} className={`rounded-lg border ${t.row}`}>
                <div className={`flex items-center gap-2 border-b ${t.row} px-3 py-2`}>
                  <Layers className={`h-3.5 w-3.5 ${t.sub}`} aria-hidden="true" />
                  <p className={`truncate text-xs font-semibold ${t.text}`}>{g.title}</p>
                  <Badge variant="outline" className="ml-auto text-[10px]">{g.items.length} in set</Badge>
                </div>
                <ul className="divide-y divide-border/40">
                  {g.items.map((i) => {
                    const d = decisionFor(i);
                    return (
                      <li key={`${i.source}:${i.id}`}
                        className="flex items-center justify-between gap-2 px-3 py-2">
                        <div className="min-w-0">
                          <p className={`flex items-center gap-1 truncate text-xs font-medium ${t.text}`}>
                            {i.isOriginal && (
                              <span title="Authoritative original" aria-label="Authoritative original">
                                <Star className="h-3 w-3 shrink-0 text-amber-400" aria-hidden="true" />
                              </span>
                            )}
                            {i.label}
                          </p>
                          <p className={`truncate text-[11px] ${t.sub}`}>{i.sub} • {i.who} • {i.when}</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          {d === "unique" && <Badge className="bg-emerald-600 hover:bg-emerald-600">Unique</Badge>}
                          {d === "rejected" && <Badge variant="destructive">Rejected</Badge>}
                          {!d && i.isOriginal && !i.autoDuplicate && <Badge variant="outline" className="text-emerald-600">Original</Badge>}
                          {!d && i.autoDuplicate && <Badge variant="outline" className="text-amber-600">Auto-dup</Badge>}
                          {canReview && (
                            <>
                              <Button size="icon" variant="ghost" className="h-7 w-7 min-h-7" disabled={busyId === i.id || d === "unique"}
                                aria-label={`Mark ${i.label} as unique`} title="Mark as unique" onClick={() => act(i, "unique")}>
                                {busyId === i.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5 text-emerald-500" />}
                              </Button>
                              <Button size="icon" variant="ghost" className="h-7 w-7 min-h-7" disabled={busyId === i.id || d === "rejected"}
                                aria-label={`Reject ${i.label}`} title="Reject submission" onClick={() => act(i, "rejected")}>
                                <Ban className="h-3.5 w-3.5 text-red-500" />
                              </Button>
                              {d && (
                                <Button size="icon" variant="ghost" className="h-7 w-7 min-h-7" disabled={busyId === i.id}
                                  aria-label={`Reset decision for ${i.label}`} title="Reset to automatic" onClick={() => act(i, "reset")}>
                                  <RotateCcw className="h-3.5 w-3.5" />
                                </Button>
                              )}
                            </>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className={`mt-2 text-[11px] ${t.sub}`}>
        The <Star className="inline h-2.5 w-2.5 text-amber-400" aria-hidden="true" /> row is the authoritative original kept in every count.
        Marking a flagged row <b>unique</b> includes it; <b>rejecting</b> removes it entirely.
        Decisions recompute unique counts in realtime across the LGA ACSM Focal Person and Advocacy dashboards.
      </p>
    </section>
  );
}

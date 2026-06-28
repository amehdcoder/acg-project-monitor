import { useEffect, useMemo, useState } from "react";
import { ShieldCheck, Check, Ban, RotateCcw, Loader2, Search, Copy, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useAcsmDuplicateOverrides } from "@/hooks/useAcsmDuplicateOverrides";
import {
  flagDuplicates, irfSignature, irfOrder, acsmSignature, acsmOrder,
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
}

const fmtWhen = (s?: string | null) => (s ? new Date(s).toLocaleDateString() : "—");

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

  // Build the list of reviewable flags: any auto-detected duplicate OR any row that
  // already has an admin override (so reviewers can revisit their decisions).
  const items = useMemo<FlagItem[]>(() => {
    const out: FlagItem[] = [];

    const irfRes = flagDuplicates(irfRows, irfSignature, (r) => r.id, irfOrder);
    irfRows.forEach((r) => {
      const auto = irfRes.duplicateIds.has(r.id);
      const ov = irfMap.get(r.id);
      if (!auto && !ov) return;
      out.push({
        source: "irf_reports",
        id: r.id,
        signature: irfSignature(r),
        label: `${r.lga || "Unspecified LGA"}${r.ward ? " — " + r.ward : ""}`,
        sub: `IRF • ${(r.reporting_month || r.reporting_period || "").slice(0, 7) || "no period"}`,
        who: r.focal_person_name || r.created_by || "—",
        when: fmtWhen(r.created_at),
        autoDuplicate: auto,
      });
    });

    const acsmRes = flagDuplicates(acsmRows, acsmSignature, (r) => r.id, acsmOrder);
    acsmRows.forEach((r) => {
      const auto = acsmRes.duplicateIds.has(r.id);
      const ov = acsmMap.get(r.id);
      if (!auto && !ov) return;
      out.push({
        source: "acsm_reports",
        id: r.id,
        signature: acsmSignature(r),
        label: `${r.indicator || "indicator"} — ${r.lga || "Unspecified LGA"}`,
        sub: `ACSM • ${(r.reporting_period || "").slice(0, 7) || "no period"}`,
        who: r.responsible_officer || "—",
        when: fmtWhen(r.created_at),
        autoDuplicate: auto,
      });
    });

    return out.sort((a, b) => a.signature.localeCompare(b.signature));
  }, [irfRows, acsmRows, irfMap, acsmMap]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) =>
      `${i.label} ${i.sub} ${i.who}`.toLowerCase().includes(q));
  }, [items, search]);

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
    ? { card: "border-[#1c3a5e] bg-[#0f1f38]", sub: "text-[#8aa2c4]", text: "text-[#e6eefb]", row: "border-[#16304f]" }
    : { card: "border-border bg-card", sub: "text-muted-foreground", text: "text-foreground", row: "border-border" };

  const flaggedCount = items.filter((i) => i.autoDuplicate && !decisionFor(i)).length;

  return (
    <div className={`rounded-xl border ${t.card} p-4`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-amber-500" />
          <h3 className={`text-sm font-semibold ${t.text}`}>Duplicate review</h3>
          <Badge variant="secondary">{flaggedCount} open</Badge>
        </div>
        <div className="relative w-44">
          <Search className={`absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 ${t.sub}`} />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search"
            className="h-8 pl-7 text-xs" />
        </div>
      </div>

      {!canReview && (
        <p className={`mt-3 flex items-center gap-1.5 text-xs ${t.sub}`}>
          <AlertTriangle className="h-3.5 w-3.5" /> Only project admins and owners can change duplicate decisions.
        </p>
      )}

      <div className="mt-3 max-h-80 overflow-y-auto pr-1">
        {loading ? (
          <div className={`flex items-center gap-2 py-8 text-xs ${t.sub}`}>
            <Loader2 className="h-4 w-4 animate-spin" /> Loading submissions…
          </div>
        ) : filtered.length === 0 ? (
          <div className={`py-8 text-center text-xs ${t.sub}`}>
            <Copy className="mx-auto mb-2 h-5 w-5 opacity-60" />
            No duplicate flags to review. Unique counts are clean.
          </div>
        ) : (
          <ul className="space-y-1.5">
            {filtered.map((i) => {
              const d = decisionFor(i);
              return (
                <li key={`${i.source}:${i.id}`}
                  className={`flex items-center justify-between gap-2 rounded-lg border ${t.row} px-3 py-2`}>
                  <div className="min-w-0">
                    <p className={`truncate text-xs font-medium ${t.text}`}>{i.label}</p>
                    <p className={`truncate text-[11px] ${t.sub}`}>{i.sub} • {i.who} • {i.when}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {d === "unique" && <Badge className="bg-emerald-600 hover:bg-emerald-600">Unique</Badge>}
                    {d === "rejected" && <Badge variant="destructive">Rejected</Badge>}
                    {!d && i.autoDuplicate && <Badge variant="outline" className="text-amber-600">Auto-dup</Badge>}
                    {canReview && (
                      <>
                        <Button size="icon" variant="ghost" className="h-7 w-7" disabled={busyId === i.id || d === "unique"}
                          title="Mark as unique" onClick={() => act(i, "unique")}>
                          {busyId === i.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5 text-emerald-500" />}
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7" disabled={busyId === i.id || d === "rejected"}
                          title="Reject submission" onClick={() => act(i, "rejected")}>
                          <Ban className="h-3.5 w-3.5 text-red-500" />
                        </Button>
                        {d && (
                          <Button size="icon" variant="ghost" className="h-7 w-7" disabled={busyId === i.id}
                            title="Reset to automatic" onClick={() => act(i, "reset")}>
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
        )}
      </div>
      <p className={`mt-2 text-[11px] ${t.sub}`}>
        Marking a flagged row <b>unique</b> includes it in counts; <b>rejecting</b> removes it entirely.
        Decisions sync in realtime to the LGA ACSM Focal Person and Advocacy dashboards.
      </p>
    </div>
  );
}

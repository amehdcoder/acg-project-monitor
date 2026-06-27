/**
 * MDA Supervisory Checklist — Advanced Analyses
 * ────────────────────────────────────────────────────────────────────────
 * Professional, insight-rich analyses wired to the checklist data source:
 *   • Status of MDA registers (Completed vs Halted/Not-started) with green/red
 *     conditional formatting + statistical inference on completion.
 *   • Adverse-reaction (SAE) complaints register with amber highlighting.
 *   • Commodity & job-aide readiness with red "No" conditional formatting.
 *   • Community-visit trendlines per LGA.
 *   • Field-worker accountability (communities visited & days worked) + a
 *     chronological visit timeline.
 *   • A data-quality panel that flags missing / inconsistent sections per LGA.
 *
 * Every field is resolved by question LABEL so each project's checklist binds
 * to the correct underlying data automatically.
 *
 * Every card, chart and table row supports CLICK-TO-DRILL into the exact
 * underlying checklist submissions (respecting the current project / LGA / date
 * filters, since this component receives the already-filtered submissions).
 * All confidence-interval and ANOVA inferences carry professional tooltips
 * explaining what the statistic and its p-value mean.
 */
import { useMemo, useState } from "react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Legend,
  Tooltip as RTooltip, BarChart, Bar,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  CheckCircle2, AlertTriangle, Pill, TrendingUp, Users2, Sigma, ClipboardCheck,
  HelpCircle, ChevronRight, ShieldCheck, ShieldAlert, Download, ListChecks, Ban,
} from "lucide-react";
import {
  MdaQuestionIndex, aggregateByCommunity, geo, visitTrendByLga, workerAccountability,
  type AQuestion, type ASubmission, type CommunityAgg, type ResolvedQ,
} from "@/lib/mda/analyses";
import { buildQualityReport, type QualityLevel } from "@/lib/mda/dataQuality";
import { communityKey } from "@/lib/mda/dashboardData";
import { meanConfidenceInterval, oneWayAnova, formatP } from "@/lib/statisticalInference";
import { toneBg, toneFg, type Tone } from "@/lib/conditionalFormatting";
import { buildSubmissionsCsv, downloadCsv, slugify, type CsvRow } from "@/lib/mda/csvExport";
import MdaMethodsDialog from "./MdaMethodsDialog";
import MdaDrillDownSheet, { type DrillData, type DrillSubmission } from "./MdaDrillDownSheet";

const NAVY = "#0c2340";
const BLUE = "#2563eb";
const TEAL = "#14b8a6";
const EMERALD = "#10b981";
const AMBER = "#f59e0b";
const RED = "#ef4444";
const PINK = "#ec4899";
const VIOLET = "#8b5cf6";
const ORANGE = "#f97316";
const LINE_COLORS = [AMBER, TEAL, BLUE, PINK, ORANGE, VIOLET];

const norm = (v: any) => String(v ?? "").trim().toLowerCase();
const fmt = (n: number) => n.toLocaleString();
const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);

interface Props {
  submissions: ASubmission[];
  questions: AQuestion[];
  projectName?: string;
  followUpFields?: Set<string>;
  /** When true, renders an "offline — showing cached data" banner. */
  offline?: boolean;
}

// ── Small UI atoms ──
function InfoTip({ children }: { children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label="What does this mean?"
          className="inline-flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground/70 hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <HelpCircle className="h-3.5 w-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-[280px] text-[11px] leading-relaxed">
        {children}
      </TooltipContent>
    </Tooltip>
  );
}

function Pill2({ text, tone }: { text: string; tone: Tone }) {
  return (
    <span
      className="inline-block rounded-md px-2 py-0.5 text-[11px] font-semibold"
      style={{ background: toneBg(tone), color: toneFg(tone) }}
    >
      {text}
    </span>
  );
}

function StatCallout({
  icon: Icon, title, tint, info, children,
}: { icon: any; title: string; tint: string; info?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 rounded-xl border border-border bg-card p-3" style={{ background: `linear-gradient(135deg, ${tint}0d, transparent 70%)` }}>
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg" style={{ background: `${tint}1a`, color: tint }}>
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 text-[11px] leading-relaxed text-muted-foreground">
        <p className="flex items-center gap-1 text-xs font-semibold text-foreground">
          {title}
          {info && <InfoTip>{info}</InfoTip>}
        </p>
        {children}
      </div>
    </div>
  );
}

/** A clickable "drill" affordance shown in card headers / rows. */
function DrillCue({ count, label = "View submissions" }: { count?: number; label?: string }) {
  return (
    <span className="inline-flex items-center gap-0.5 text-[11px] font-medium text-primary opacity-80 transition group-hover:opacity-100">
      {label}{typeof count === "number" ? ` (${fmt(count)})` : ""}
      <ChevronRight className="h-3 w-3" />
    </span>
  );
}

function SectionTable({ headers, children, align }: { headers: string[]; children: React.ReactNode; align?: Record<number, "right" | "center"> }) {
  return (
    <div className="max-h-[420px] overflow-auto rounded-lg border border-border">
      <table className="w-full text-xs">
        <thead className="sticky top-0 z-10" style={{ background: NAVY }}>
          <tr className="text-left text-[11px] font-semibold text-white">
            {headers.map((h, i) => (
              <th key={h} className={`px-3 py-2 ${align?.[i] === "right" ? "text-right" : align?.[i] === "center" ? "text-center" : ""}`}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

const CI_INFO = (
  <>
    <strong>95% confidence interval (CI):</strong> if supervision were repeated many
    times, the true rate would fall inside this range 95% of the time. A narrower
    interval means a more precise estimate; a wider one means more uncertainty
    (usually from a smaller sample, <em>n</em>).
  </>
);
const ANOVA_INFO = (
  <>
    <strong>One-way ANOVA</strong> tests whether the average differs across LGAs.
    The <strong>F-statistic</strong> compares between-LGA variation to within-LGA
    variation. The <strong>p-value</strong> is the probability of seeing
    differences this large by chance alone — <strong>p &lt; 0.05</strong> means the
    LGA differences are statistically significant (unlikely to be random).
    <strong> η² (eta-squared)</strong> is the effect size: the share of variation
    explained by the LGA (0–1).
  </>
);

const QUALITY_TONE: Record<QualityLevel, { tone: Tone; tint: string }> = {
  good: { tone: "good", tint: EMERALD },
  warn: { tone: "warn", tint: AMBER },
  bad: { tone: "bad", tint: RED },
};

export default function MdaAdvancedAnalyses({ submissions, questions, projectName, followUpFields }: Props) {
  const idx = useMemo(() => new MdaQuestionIndex(questions), [questions]);
  const communities = useMemo(() => aggregateByCommunity(submissions), [submissions]);

  // Map communityKey → raw submissions, to drill into the EXACT records.
  const subsByCommunity = useMemo(() => {
    const m = new Map<string, ASubmission[]>();
    for (const s of submissions) {
      const k = communityKey(s as any);
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(s);
    }
    return m;
  }, [submissions]);

  // ── Drill-down state ──
  const [drill, setDrill] = useState<DrillData | null>(null);

  const toDrillRows = (subs: ASubmission[]): DrillSubmission[] =>
    subs.map((s) => ({
      id: s.id,
      state: s.state ?? null,
      lga: s.lga ?? null,
      ward: s.ward ?? null,
      submitter: s.submitter ?? null,
      submittedAt: s.submittedAt ?? null,
      status: s.status ?? null,
      data: s.data || {},
    }));

  const openDrillForKeys = (title: string, keys: string[], tint: string, subtitle?: string) => {
    const seen = new Set(keys);
    const subs: ASubmission[] = [];
    for (const k of keys) subs.push(...(subsByCommunity.get(k) || []));
    setDrill({ title, subtitle, tint, rows: toDrillRows(subs) });
  };
  const openDrillForCommunity = (c: CommunityAgg, tint: string) =>
    openDrillForKeys(c.community || c.lga || "Community", [c.key], tint,
      [c.community, c.ward, c.lga].filter(Boolean).join(" › "));
  const openDrillForSubs = (title: string, subs: ASubmission[], tint: string, subtitle?: string) =>
    setDrill({ title, subtitle, tint, rows: toDrillRows(subs) });

  // Resolve the questions that drive each analysis (by label).
  const qStatus = useMemo(() => idx.find([/current.*status of mda/i, /status of mda/i]), [idx]);
  const qCdd = useMemo(() => idx.find([/are there cdds/i, /cdds in the community/i]), [idx]);
  const qNumCdd = useMemo(() => idx.find([/how many cdds/i, /number of cdds/i, /no\.? of cdds/i]), [idx]);
  const qSae = useMemo(() => idx.find([/complain.*side effect/i, /side effects during mda/i, /complain of side/i]), [idx]);
  const qSaeType = useMemo(() => idx.find([/type of side effect/i, /type of adverse/i]), [idx]);
  const qRegister = useMemo(() => idx.find([/treatment registers? .*available/i, /registers available/i, /treatment register available/i]), [idx]);
  const qEntries = useMemo(() => idx.find([/entries.*correct/i]), [idx]);
  const qDosePole = useMemo(() => idx.find([/dose pole.*available/i, /is dose pole/i]), [idx]);
  const qDoseKnow = useMemo(() => idx.find([/know how to use dose pole/i, /how to use dose/i]), [idx]);

  const val = (c: CommunityAgg, q: ResolvedQ | null) => (q ? c.values[q.key] : undefined);
  const lbl = (c: CommunityAgg, q: ResolvedQ | null) => idx.label(q, val(c, q));

  // ── Data-quality report (per LGA section coverage) ──
  const qualitySectionDefs = useMemo(() => [
    { id: "status", label: "Status of MDA", q: qStatus },
    { id: "cdd", label: "CDD presence", q: qCdd },
    { id: "sae", label: "Adverse reactions", q: qSae },
    { id: "register", label: "Treatment register", q: qRegister },
    { id: "dosePole", label: "Dose pole", q: qDosePole },
  ], [qStatus, qCdd, qSae, qRegister, qDosePole]);
  const quality = useMemo(
    () => buildQualityReport(communities, qualitySectionDefs, projectName || ""),
    [communities, qualitySectionDefs, projectName],
  );

  // ── CSV export of the filtered analyses dataset ──
  const exportDatasetCsv = () => {
    const rows: CsvRow[] = submissions.map((s) => ({
      id: s.id,
      state: s.state ?? null,
      lga: s.lga ?? null,
      ward: s.ward ?? null,
      submitter: s.submitter ?? null,
      submittedAt: s.submittedAt ?? null,
      status: s.status ?? null,
      data: s.data || {},
    }));
    const csv = buildSubmissionsCsv(rows, questions as any);
    downloadCsv(`mda-analyses-${slugify(projectName || "dataset")}-${new Date().toISOString().slice(0, 10)}`, csv);
  };

  // ── Status of MDA ──
  const statusRows = useMemo(() => {
    if (!qStatus) return [];
    return communities
      .map((c) => ({ c, status: idx.label(qStatus, val(c, qStatus)) }))
      .filter((r) => r.status);
  }, [communities, qStatus, idx]);

  const statusTone = (s: string): Tone => {
    const n = norm(s);
    if (n.includes("complet")) return "good";
    if (n.includes("ongoing") || n.includes("progress")) return "ok";
    if (n.includes("halt")) return "bad";
    if (n.includes("not started") || n.includes("not_started")) return "warn";
    return "neutral";
  };
  const completedRows = statusRows.filter((r) => norm(r.status).includes("complet"));
  const issueRows = statusRows.filter((r) => !norm(r.status).includes("complet"));

  // Statistical inference — completion proportion + per-LGA ANOVA
  const completionStat = useMemo(() => {
    if (statusRows.length < 2) return null;
    const flags = statusRows.map((r) => (norm(r.status).includes("complet") ? 100 : 0));
    const ci = meanConfidenceInterval(flags);
    const byLga = new Map<string, number[]>();
    for (const r of statusRows) {
      const k = r.c.lga || "Unspecified";
      if (!byLga.has(k)) byLga.set(k, []);
      byLga.get(k)!.push(norm(r.status).includes("complet") ? 100 : 0);
    }
    const groups = [...byLga.values()].filter((g) => g.length >= 2);
    const anova = groups.length >= 2 ? oneWayAnova(groups) : null;
    return { ci, anova, groupCount: byLga.size };
  }, [statusRows]);

  // ── Adverse reaction (SAE) complaints ──
  const saeRows = useMemo(() => {
    if (!qSae) return [];
    return communities
      .map((c) => ({ c, sae: idx.label(qSae, val(c, qSae)), type: lbl(c, qSaeType) }))
      .filter((r) => norm(r.sae).startsWith("yes"));
  }, [communities, qSae, qSaeType, idx]);
  const saeStat = useMemo(() => {
    if (!qSae) return null;
    const answered = communities.filter((c) => idx.label(qSae, val(c, qSae)));
    const flags = answered.map((c) => (norm(idx.label(qSae, val(c, qSae))).startsWith("yes") ? 100 : 0));
    return { ci: meanConfidenceInterval(flags), answered: answered.length };
  }, [communities, qSae, idx]);

  // ── Commodity & job-aide readiness ──
  const hasCommodity = qRegister || qEntries || qDosePole || qDoseKnow;
  const commodityRows = useMemo(() => {
    if (!hasCommodity) return [];
    return communities
      .map((c) => ({
        c,
        register: lbl(c, qRegister),
        entries: lbl(c, qEntries),
        dosePole: lbl(c, qDosePole),
        doseKnow: lbl(c, qDoseKnow),
      }))
      .filter((r) => r.register || r.entries || r.dosePole || r.doseKnow);
  }, [communities, qRegister, qEntries, qDosePole, qDoseKnow]);
  const readiness = useMemo(() => {
    const score = (q: ResolvedQ | null) => {
      if (!q) return null;
      let yes = 0, tot = 0;
      for (const c of communities) {
        const v = idx.label(q, val(c, q));
        if (!v) continue; tot++; if (norm(v).startsWith("yes")) yes++;
      }
      return tot ? { yes, tot, pct: pct(yes, tot) } : null;
    };
    return {
      register: score(qRegister), entries: score(qEntries),
      dosePole: score(qDosePole), doseKnow: score(qDoseKnow),
    };
  }, [communities, qRegister, qEntries, qDosePole, qDoseKnow, idx]);

  // ── Visit trend per LGA ──
  const { rows: trendRows, lgas: trendLgas } = useMemo(() => visitTrendByLga(submissions), [submissions]);

  // ── Field-worker accountability ──
  const workers = useMemo(() => workerAccountability(submissions).slice(0, 12), [submissions]);
  const workerChart = useMemo(
    () => workers.map((w) => ({ name: w.name, Communities: w.communities, Days: w.days })),
    [workers],
  );
  const timeline = useMemo(() => {
    return [...communities]
      .filter((c) => c.firstTs)
      .sort((a, b) => b.lastTs - a.lastTs)
      .slice(0, 60)
      .map((c) => ({
        id: c.key,
        c,
        community: c.community || "Unspecified",
        start: c.firstTs ? new Date(c.firstTs).toLocaleString() : "—",
        end: c.lastTs ? new Date(c.lastTs).toLocaleString() : "—",
        worker: c.submitter || "—",
      }));
  }, [communities]);

  // helpers to drill from charts
  const drillLga = (lga: string, tint: string) => {
    const subs = submissions.filter((s) => (geo(s, "lga") || "Unspecified") === lga);
    openDrillForSubs(`LGA — ${lga}`, subs, tint, `${subs.length} checklist submission${subs.length === 1 ? "" : "s"}`);
  };
  const drillWorker = (name: string, tint: string) => {
    const subs = submissions.filter((s) => (String(s.submitter || s.data?.supervisor_name || "Unknown").replace(/<[^>]*>/g, "").trim()) === name);
    openDrillForSubs(`Monitor — ${name}`, subs, tint);
  };

  const cellYesNo = (text: string, badWhenNo = true) => {
    if (!text) return <span className="text-muted-foreground">—</span>;
    const n = norm(text);
    const tone: Tone = n.startsWith("yes") ? "good" : (badWhenNo && n.startsWith("no")) ? "bad" : "neutral";
    return <Pill2 text={text} tone={tone} />;
  };

  const nothingResolved = !qStatus && !qSae && !hasCommodity;

  return (
    <TooltipProvider delayDuration={150}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Sigma className="h-4 w-4 text-primary" />
          <h3 className="font-display text-sm font-bold text-foreground">Insightful Analyses</h3>
          <span className="hidden text-[11px] text-muted-foreground sm:inline">— click any card, chart or row to drill into the exact submissions</span>
          <div className="ml-auto flex items-center gap-2">
            <MdaMethodsDialog />
            <Button
              variant="outline"
              size="sm"
              onClick={exportDatasetCsv}
              disabled={submissions.length === 0}
              className="h-8 gap-1.5 text-xs"
            >
              <Download className="h-3.5 w-3.5" /> Export dataset (CSV)
            </Button>
          </div>
        </div>
        {offline && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-700 dark:text-amber-400">
            Offline — showing the last synced checklist data. Analyses, data quality and drill-downs reflect cached submissions.
          </div>
        )}

        {/* ── Data-quality panel ── */}
        {communities.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex flex-wrap items-center gap-1.5 text-sm">
                {quality.overallLevel === "good"
                  ? <ShieldCheck className="h-4 w-4" style={{ color: EMERALD }} />
                  : <ShieldAlert className="h-4 w-4" style={{ color: quality.overallLevel === "bad" ? RED : AMBER }} />}
                Data Quality &amp; Trust
                <InfoTip>
                  Each section maps to a checklist question. A section is "covered" for a community
                  when it has a non-empty answer. Low coverage means the related statistical
                  inference is based on partial data — interpret with care.
                </InfoTip>
                <span className="ml-auto flex items-center gap-2 text-xs font-normal">
                  <span className="text-muted-foreground">Completeness</span>
                  <Pill2 text={`${quality.overallScore}%`} tone={QUALITY_TONE[quality.overallLevel].tone} />
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 p-3 pt-0">
              {quality.unresolved.length > 0 && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-2.5 text-[11px] text-amber-700 dark:text-amber-400">
                  <strong>Not in this checklist:</strong> {quality.unresolved.join(", ")}. These sections
                  can't be assessed because the form has no matching question.
                </div>
              )}
              <SectionTable
                headers={["LGA / Area Council", "Communities", ...quality.lgas[0]?.sections.filter((s) => s.resolved).map((s) => s.label) ?? [], "Completeness", "Action"]}
                align={{ 1: "center" }}
              >
                {quality.lgas.map((l) => {
                  const resolvedSecs = l.sections.filter((s) => s.resolved);
                  return (
                    <tr key={l.lga} className="border-t border-border/60 hover:bg-muted/40">
                      <td className="px-3 py-2 font-medium text-foreground">{l.lga}</td>
                      <td className="px-3 py-2 text-center tabular-nums text-muted-foreground">{fmt(l.communities)}</td>
                      {resolvedSecs.map((s) => (
                        <td key={s.id} className="px-3 py-2">
                          <Pill2 text={`${s.pct}%`} tone={QUALITY_TONE[s.level].tone} />
                        </td>
                      ))}
                      <td className="px-3 py-2"><Pill2 text={`${l.score}%`} tone={QUALITY_TONE[l.level].tone} /></td>
                      <td className="px-3 py-2">
                        {l.incompleteKeys.length > 0 ? (
                          <button
                            onClick={() => openDrillForKeys(`Incomplete records — ${l.lga}`, l.incompleteKeys, AMBER,
                              `${l.incompleteKeys.length} communit${l.incompleteKeys.length === 1 ? "y" : "ies"} missing a section`)}
                            className="inline-flex items-center gap-0.5 text-[11px] font-medium text-primary hover:underline"
                          >
                            Review {fmt(l.incompleteKeys.length)} <ChevronRight className="h-3 w-3" />
                          </button>
                        ) : <span className="text-[11px] text-emerald-600 dark:text-emerald-400">Complete</span>}
                      </td>
                    </tr>
                  );
                })}
              </SectionTable>
            </CardContent>
          </Card>
        )}

        {nothingResolved && (
          <Card><CardContent className="py-8 text-center text-xs text-muted-foreground">
            These analyses populate automatically once the checklist captures status, adverse-event and commodity questions.
          </CardContent></Card>
        )}

        {/* ── Visit Trendline per LGA ── */}
        {trendRows.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-1.5 text-sm">
                <TrendingUp className="h-4 w-4" style={{ color: ORANGE }} /> Communities Visited — Trend by LGA
                <span className="font-normal text-muted-foreground">(distinct communities first supervised per day — click a line to drill)</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={trendRows} margin={{ top: 8, right: 16, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                  <RTooltip />
                  <Legend wrapperStyle={{ fontSize: 11, cursor: "pointer" }} onClick={(e: any) => e?.value && drillLga(e.value, LINE_COLORS[0])} />
                  {trendLgas.map((lga, i) => (
                    <Line
                      key={lga} type="monotone" dataKey={lga} stroke={LINE_COLORS[i % LINE_COLORS.length]}
                      strokeWidth={2.5} dot={{ r: 2.5 }} style={{ cursor: "pointer" }}
                      onClick={() => drillLga(lga, LINE_COLORS[i % LINE_COLORS.length])}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* ── Status of MDA ── */}
        {qStatus && statusRows.length > 0 && (
          <div className="space-y-3">
            {completionStat?.ci && (
              <div className="grid gap-3 md:grid-cols-2">
                <StatCallout icon={CheckCircle2} title="MDA Completion — statistical inference" tint={EMERALD} info={CI_INFO}>
                  Completion rate <strong className="text-foreground">{completionStat.ci.mean.toFixed(1)}%</strong>{" "}
                  (95% CI {completionStat.ci.ciLow.toFixed(1)}–{completionStat.ci.ciHigh.toFixed(1)}%, n={completionStat.ci.n}).{" "}
                  {fmt(completedRows.length)} of {fmt(statusRows.length)} supervised communities report MDA completed.
                </StatCallout>
                {completionStat.anova && (
                  <StatCallout icon={Sigma} title="Variation across LGAs (one-way ANOVA)" tint={completionStat.anova.significant ? AMBER : BLUE} info={ANOVA_INFO}>
                    {completionStat.anova.significant
                      ? <>Completion differs <strong className="text-foreground">significantly</strong> between LGAs (F={completionStat.anova.fStat.toFixed(2)}, {formatP(completionStat.anova.pValue)}, η²={completionStat.anova.etaSquared.toFixed(2)}). Target lagging LGAs.</>
                      : <>No statistically significant difference in completion between LGAs (F={completionStat.anova.fStat.toFixed(2)}, {formatP(completionStat.anova.pValue)}) — coverage is consistent.</>}
                  </StatCallout>
                )}
              </div>
            )}

            <Card className="group">
              <CardHeader className="pb-2 cursor-pointer" onClick={() => openDrillForKeys("Communities — MDA Completed", completedRows.map((r) => r.c.key), EMERALD)}>
                <CardTitle className="flex items-center gap-1.5 text-sm">
                  <CheckCircle2 className="h-4 w-4" style={{ color: EMERALD }} /> Communities where MDA is Completed
                  <span className="ml-auto flex items-center gap-2 text-xs font-normal text-muted-foreground">
                    {fmt(completedRows.length)}<DrillCue />
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 pt-0">
                {completedRows.length ? (
                  <SectionTable headers={["LGA", "Ward", "FLHF", "Community", "CDDs in Community", "Status of MDA", "No. of CDDs"]} align={{ 6: "right" }}>
                    {completedRows.map(({ c, status }) => (
                      <tr key={c.key} className="cursor-pointer border-t border-border/60 hover:bg-muted/40" onClick={() => openDrillForCommunity(c, EMERALD)}>
                        <td className="px-3 py-2 font-medium text-foreground">{c.lga || "—"}</td>
                        <td className="px-3 py-2 text-muted-foreground">{c.ward || "—"}</td>
                        <td className="px-3 py-2 text-muted-foreground">{c.flhf || "—"}</td>
                        <td className="px-3 py-2 text-foreground">{c.community || "—"}</td>
                        <td className="px-3 py-2">{cellYesNo(lbl(c, qCdd), false)}</td>
                        <td className="px-3 py-2"><Pill2 text={status} tone={statusTone(status)} /></td>
                        <td className="px-3 py-2 text-right tabular-nums">{val(c, qNumCdd) ?? "—"}</td>
                      </tr>
                    ))}
                  </SectionTable>
                ) : <p className="py-6 text-center text-xs text-muted-foreground">No communities reported MDA completed yet.</p>}
              </CardContent>
            </Card>

            <Card className="group">
              <CardHeader className="pb-2 cursor-pointer" onClick={() => openDrillForKeys("Communities — MDA Halted / Not Started / Ongoing", issueRows.map((r) => r.c.key), RED)}>
                <CardTitle className="flex items-center gap-1.5 text-sm">
                  <AlertTriangle className="h-4 w-4" style={{ color: RED }} /> Communities where MDA is Halted / Not Started / Ongoing
                  <span className="ml-auto flex items-center gap-2 text-xs font-normal text-muted-foreground">
                    {fmt(issueRows.length)}<DrillCue />
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 pt-0">
                {issueRows.length ? (
                  <SectionTable headers={["LGA", "Ward", "FLHF", "Community", "CDDs in Community", "Status of MDA", "No. of CDDs"]} align={{ 6: "right" }}>
                    {issueRows.map(({ c, status }) => (
                      <tr key={c.key} className="cursor-pointer border-t border-border/60 hover:bg-muted/40" onClick={() => openDrillForCommunity(c, RED)}>
                        <td className="px-3 py-2 font-medium text-foreground">{c.lga || "—"}</td>
                        <td className="px-3 py-2 text-muted-foreground">{c.ward || "—"}</td>
                        <td className="px-3 py-2 text-muted-foreground">{c.flhf || "—"}</td>
                        <td className="px-3 py-2 text-foreground">{c.community || "—"}</td>
                        <td className="px-3 py-2">{cellYesNo(lbl(c, qCdd), false)}</td>
                        <td className="px-3 py-2"><Pill2 text={status} tone={statusTone(status)} /></td>
                        <td className="px-3 py-2 text-right tabular-nums">{val(c, qNumCdd) ?? "—"}</td>
                      </tr>
                    ))}
                  </SectionTable>
                ) : <p className="py-6 text-center text-xs text-muted-foreground">Excellent — no halted or unstarted MDA communities.</p>}
              </CardContent>
            </Card>
          </div>
        )}

        {/* ── Adverse reaction (SAE) complaints ── */}
        {qSae && (
          <Card className="group">
            <CardHeader className="pb-2 cursor-pointer" onClick={() => openDrillForKeys("Adverse Reaction (SAE) Complaints", saeRows.map((r) => r.c.key), ORANGE)}>
              <CardTitle className="flex items-center gap-1.5 text-sm">
                <AlertTriangle className="h-4 w-4" style={{ color: ORANGE }} /> Adverse Reaction (SAE) Complaints
                <span className="ml-auto flex items-center gap-2 text-xs font-normal text-muted-foreground">
                  {fmt(saeRows.length)} communit{saeRows.length === 1 ? "y" : "ies"}<DrillCue />
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 p-3 pt-0">
              {saeStat?.ci && saeStat.answered > 1 && (
                <StatCallout icon={Sigma} title="SAE complaint rate — statistical inference" tint={ORANGE} info={CI_INFO}>
                  <strong className="text-foreground">{saeStat.ci.mean.toFixed(1)}%</strong> of {fmt(saeStat.answered)} supervised communities
                  reported side-effect complaints (95% CI {saeStat.ci.ciLow.toFixed(1)}–{saeStat.ci.ciHigh.toFixed(1)}%).
                </StatCallout>
              )}
              {saeRows.length ? (
                <SectionTable headers={["LGA", "Ward", "FLHF", "Community", "SAE Complaint", "Type of SAE"]}>
                  {saeRows.map(({ c, sae, type }) => (
                    <tr key={c.key} className="cursor-pointer border-t border-border/60 hover:bg-muted/40" onClick={() => openDrillForCommunity(c, ORANGE)}>
                      <td className="px-3 py-2 font-medium text-foreground">{c.lga || "—"}</td>
                      <td className="px-3 py-2 text-muted-foreground">{c.ward || "—"}</td>
                      <td className="px-3 py-2 text-muted-foreground">{c.flhf || "—"}</td>
                      <td className="px-3 py-2 text-foreground">{c.community || "—"}</td>
                      <td className="px-3 py-2"><Pill2 text={sae} tone="warn" /></td>
                      <td className="px-3 py-2 text-muted-foreground">{type || "—"}</td>
                    </tr>
                  ))}
                </SectionTable>
              ) : <p className="py-6 text-center text-xs text-muted-foreground">No adverse-reaction complaints reported.</p>}
            </CardContent>
          </Card>
        )}

        {/* ── Commodity & job-aide readiness ── */}
        {hasCommodity && (
          <Card className="group">
            <CardHeader className="pb-2 cursor-pointer" onClick={() => openDrillForKeys("Commodity & Job-Aide Readiness", commodityRows.map((r) => r.c.key), TEAL)}>
              <CardTitle className="flex items-center gap-1.5 text-sm">
                <Pill className="h-4 w-4" style={{ color: TEAL }} /> Commodity &amp; Job-Aide Readiness
                <span className="ml-auto flex items-center gap-2 text-xs font-normal text-muted-foreground">
                  {fmt(commodityRows.length)} communit{commodityRows.length === 1 ? "y" : "ies"}<DrillCue />
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 p-3 pt-0">
              <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                {[
                  { label: "Treatment Register", s: readiness.register, tint: BLUE },
                  { label: "Entries Correct", s: readiness.entries, tint: TEAL },
                  { label: "Dose Pole Available", s: readiness.dosePole, tint: VIOLET },
                  { label: "Knows Dose Pole Use", s: readiness.doseKnow, tint: EMERALD },
                ].filter((x) => x.s).map((x) => (
                  <div key={x.label} className="rounded-lg border border-border bg-card p-2.5">
                    <p className="text-[10px] text-muted-foreground">{x.label}</p>
                    <p className="font-display text-lg font-bold" style={{ color: x.s!.pct >= 60 ? EMERALD : x.s!.pct >= 40 ? AMBER : RED }}>{x.s!.pct}%</p>
                    <p className="text-[10px] text-muted-foreground">{x.s!.yes}/{x.s!.tot} yes</p>
                  </div>
                ))}
              </div>
              {commodityRows.length ? (
                <SectionTable headers={["LGA / Area Council", "FLHF", "Community", "Treatment Register Available", "Entries Correct", "Dose Pole Available", "Knows How to Use"]} align={{ 6: "center" }}>
                  {commodityRows.map(({ c, register, entries, dosePole, doseKnow }) => (
                    <tr key={c.key} className="cursor-pointer border-t border-border/60 hover:bg-muted/40" onClick={() => openDrillForCommunity(c, TEAL)}>
                      <td className="px-3 py-2 font-medium text-foreground">{c.lga || "—"}</td>
                      <td className="px-3 py-2 text-muted-foreground">{c.flhf || "—"}</td>
                      <td className="px-3 py-2 text-foreground">{c.community || "—"}</td>
                      <td className="px-3 py-2">{cellYesNo(register)}</td>
                      <td className="px-3 py-2">{cellYesNo(entries)}</td>
                      <td className="px-3 py-2">{cellYesNo(dosePole)}</td>
                      <td className="px-3 py-2 text-center">{cellYesNo(doseKnow)}</td>
                    </tr>
                  ))}
                </SectionTable>
              ) : <p className="py-6 text-center text-xs text-muted-foreground">No commodity readiness data captured yet.</p>}
            </CardContent>
          </Card>
        )}

        {/* ── Field-worker accountability ── */}
        {workers.length > 0 && (
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-1.5 text-sm">
                  <Users2 className="h-4 w-4" style={{ color: EMERALD }} /> Monitor Accountability
                  <span className="font-normal text-muted-foreground">— click a bar to drill</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={Math.max(240, workerChart.length * 34)}>
                  <BarChart data={workerChart} layout="vertical" margin={{ top: 4, right: 24, left: 8, bottom: 0 }} barGap={2}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
                    <YAxis type="category" dataKey="name" width={84} tick={{ fontSize: 10 }} />
                    <RTooltip />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="Communities" name="Communities visited" fill={EMERALD} radius={[0, 3, 3, 0]} style={{ cursor: "pointer" }} onClick={(d: any) => d?.name && drillWorker(d.name, EMERALD)} />
                    <Bar dataKey="Days" name="Days monitor worked" fill={ORANGE} radius={[0, 3, 3, 0]} style={{ cursor: "pointer" }} onClick={(d: any) => d?.name && drillWorker(d.name, ORANGE)} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-1.5 text-sm">
                  <ClipboardCheck className="h-4 w-4 text-primary" /> Community Visit Timeline
                  <span className="ml-auto text-xs font-normal text-muted-foreground">{fmt(timeline.length)}</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 pt-0">
                <SectionTable headers={["Community", "Start", "End", "Monitor"]}>
                  {timeline.map((t) => (
                    <tr key={t.id} className="cursor-pointer border-t border-border/60 hover:bg-muted/40" onClick={() => openDrillForCommunity(t.c, BLUE)}>
                      <td className="px-3 py-2 font-medium text-foreground">{t.community}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{t.start}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{t.end}</td>
                      <td className="px-3 py-2 text-muted-foreground">{t.worker}</td>
                    </tr>
                  ))}
                </SectionTable>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ── Drill-down sheet (exact underlying submissions) ── */}
        <MdaDrillDownSheet
          data={drill}
          questions={questions as any}
          followUpFields={followUpFields}
          onClose={() => setDrill(null)}
        />
      </div>
    </TooltipProvider>
  );
}

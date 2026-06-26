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
 *
 * Every field is resolved by question LABEL so each project's checklist binds
 * to the correct underlying data automatically.
 */
import { useMemo } from "react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Legend,
  Tooltip as RTooltip, BarChart, Bar, Cell as RCell,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  CheckCircle2, AlertTriangle, Pill, TrendingUp, Users2, Sigma, ClipboardCheck,
} from "lucide-react";
import {
  MdaQuestionIndex, aggregateByCommunity, geo, visitTrendByLga, workerAccountability,
  type AQuestion, type ASubmission, type CommunityAgg, type ResolvedQ,
} from "@/lib/mda/analyses";
import { meanConfidenceInterval, oneWayAnova, formatP } from "@/lib/statisticalInference";
import { toneBg, toneFg, type Tone } from "@/lib/conditionalFormatting";

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
}

// ── Small UI atoms ──
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

function StatCallout({ icon: Icon, title, children, tint }: { icon: any; title: string; children: React.ReactNode; tint: string }) {
  return (
    <div className="flex items-start gap-2.5 rounded-xl border border-border bg-card p-3" style={{ background: `linear-gradient(135deg, ${tint}0d, transparent 70%)` }}>
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg" style={{ background: `${tint}1a`, color: tint }}>
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 text-[11px] leading-relaxed text-muted-foreground">
        <p className="text-xs font-semibold text-foreground">{title}</p>
        {children}
      </div>
    </div>
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

export default function MdaAdvancedAnalyses({ submissions, questions }: Props) {
  const idx = useMemo(() => new MdaQuestionIndex(questions), [questions]);
  const communities = useMemo(() => aggregateByCommunity(submissions), [submissions]);

  // Resolve the questions that drive each analysis (by label).
  const qStatus = useMemo(() => idx.find([/current.*status of mda/i, /status of mda/i, /treatment commenced/i]), [idx]);
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
        community: c.community || "Unspecified",
        start: c.firstTs ? new Date(c.firstTs).toLocaleString() : "—",
        end: c.lastTs ? new Date(c.lastTs).toLocaleString() : "—",
        worker: c.submitter || "—",
      }));
  }, [communities]);

  const cellYesNo = (text: string, badWhenNo = true) => {
    if (!text) return <span className="text-muted-foreground">—</span>;
    const n = norm(text);
    const tone: Tone = n.startsWith("yes") ? "good" : (badWhenNo && n.startsWith("no")) ? "bad" : "neutral";
    return <Pill2 text={text} tone={tone} />;
  };

  const nothingResolved = !qStatus && !qSae && !hasCommodity;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Sigma className="h-4 w-4 text-primary" />
        <h3 className="font-display text-sm font-bold text-foreground">Insightful Analyses</h3>
        <span className="text-[11px] text-muted-foreground">— statistical, conditionally-formatted views of the checklist</span>
      </div>

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
              <span className="font-normal text-muted-foreground">(distinct communities first supervised per day)</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={trendRows} margin={{ top: 8, right: 16, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <RTooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {trendLgas.map((lga, i) => (
                  <Line key={lga} type="monotone" dataKey={lga} stroke={LINE_COLORS[i % LINE_COLORS.length]} strokeWidth={2.5} dot={{ r: 2.5 }} />
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
              <StatCallout icon={CheckCircle2} title="MDA Completion — statistical inference" tint={EMERALD}>
                Completion rate <strong className="text-foreground">{completionStat.ci.mean.toFixed(1)}%</strong>{" "}
                (95% CI {completionStat.ci.ciLow.toFixed(1)}–{completionStat.ci.ciHigh.toFixed(1)}%, n={completionStat.ci.n}).{" "}
                {fmt(completedRows.length)} of {fmt(statusRows.length)} supervised communities report MDA completed.
              </StatCallout>
              {completionStat.anova && (
                <StatCallout icon={Sigma} title="Variation across LGAs (one-way ANOVA)" tint={completionStat.anova.significant ? AMBER : BLUE}>
                  {completionStat.anova.significant
                    ? <>Completion differs <strong className="text-foreground">significantly</strong> between LGAs (F={completionStat.anova.fStat.toFixed(2)}, {formatP(completionStat.anova.pValue)}, η²={completionStat.anova.etaSquared.toFixed(2)}). Target lagging LGAs.</>
                    : <>No statistically significant difference in completion between LGAs (F={completionStat.anova.fStat.toFixed(2)}, {formatP(completionStat.anova.pValue)}) — coverage is consistent.</>}
                </StatCallout>
              )}
            </div>
          )}

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-1.5 text-sm">
                <CheckCircle2 className="h-4 w-4" style={{ color: EMERALD }} /> Communities where MDA is Completed
                <span className="ml-auto text-xs font-normal text-muted-foreground">{fmt(completedRows.length)}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0">
              {completedRows.length ? (
                <SectionTable headers={["LGA", "Ward", "FLHF", "Community", "CDDs in Community", "Status of MDA", "No. of CDDs"]} align={{ 6: "right" }}>
                  {completedRows.map(({ c, status }) => (
                    <tr key={c.key} className="border-t border-border/60 hover:bg-muted/40">
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

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-1.5 text-sm">
                <AlertTriangle className="h-4 w-4" style={{ color: RED }} /> Communities where MDA is Halted / Not Started / Ongoing
                <span className="ml-auto text-xs font-normal text-muted-foreground">{fmt(issueRows.length)}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0">
              {issueRows.length ? (
                <SectionTable headers={["LGA", "Ward", "FLHF", "Community", "CDDs in Community", "Status of MDA", "No. of CDDs"]} align={{ 6: "right" }}>
                  {issueRows.map(({ c, status }) => (
                    <tr key={c.key} className="border-t border-border/60 hover:bg-muted/40">
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
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-1.5 text-sm">
              <AlertTriangle className="h-4 w-4" style={{ color: ORANGE }} /> Adverse Reaction (SAE) Complaints
              <span className="ml-auto text-xs font-normal text-muted-foreground">{fmt(saeRows.length)} communit{saeRows.length === 1 ? "y" : "ies"}</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 p-3 pt-0">
            {saeStat?.ci && saeStat.answered > 1 && (
              <StatCallout icon={Sigma} title="SAE complaint rate — statistical inference" tint={ORANGE}>
                <strong className="text-foreground">{saeStat.ci.mean.toFixed(1)}%</strong> of {fmt(saeStat.answered)} supervised communities
                reported side-effect complaints (95% CI {saeStat.ci.ciLow.toFixed(1)}–{saeStat.ci.ciHigh.toFixed(1)}%).
              </StatCallout>
            )}
            {saeRows.length ? (
              <SectionTable headers={["LGA", "Ward", "FLHF", "Community", "SAE Complaint", "Type of SAE"]}>
                {saeRows.map(({ c, sae, type }) => (
                  <tr key={c.key} className="border-t border-border/60 hover:bg-muted/40">
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
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-1.5 text-sm">
              <Pill className="h-4 w-4" style={{ color: TEAL }} /> Commodity &amp; Job-Aide Readiness
              <span className="ml-auto text-xs font-normal text-muted-foreground">{fmt(commodityRows.length)} communit{commodityRows.length === 1 ? "y" : "ies"}</span>
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
                  <tr key={c.key} className="border-t border-border/60 hover:bg-muted/40">
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
                <span className="font-normal text-muted-foreground">— communities visited &amp; days worked</span>
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
                  <Bar dataKey="Communities" name="Communities visited" fill={EMERALD} radius={[0, 3, 3, 0]} />
                  <Bar dataKey="Days" name="Days monitor worked" fill={ORANGE} radius={[0, 3, 3, 0]} />
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
                  <tr key={t.id} className="border-t border-border/60 hover:bg-muted/40">
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
    </div>
  );
}

/**
 * MDA Longitudinal Insights
 * ────────────────────────────────────────────────────────────────────────
 * Two professional, decision-grade panels:
 *   1. Longitudinal follow-up OUTCOME trend (per ISO-week): MDA completion rate,
 *      commodity-issue rate and adverse-managed rate over time.
 *   2. Duplicate-community flag table with conditional formatting — communities
 *      visited more than once within the same State/LGA/Ward/FLHF, showing who
 *      visited, when, and exactly which questions diverged.
 */
import { useMemo, useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip,
  Legend, ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, CopyCheck, ChevronDown, ChevronRight, Users2, Clock } from "lucide-react";
import { buildFollowUpTimeline, findDuplicateCommunities } from "@/lib/mda/longitudinal";
import type { ASubmission } from "@/lib/mda/analyses";

const EMERALD = "#10b981";
const AMBER = "#f59e0b";
const RED = "#ef4444";
const BLUE = "#2563eb";

interface Props {
  /** checklist (primary) submissions for duplicate detection */
  checklist: ASubmission[];
  /** all submissions (checklist + follow-ups) for the timeline */
  submissions: ASubmission[];
  questions: any[];
}

function sevTint(sev: number): { bg: string; label: string; tint: string } {
  if (sev >= 8) return { bg: "bg-red-50 dark:bg-red-950/30", label: "Critical", tint: RED };
  if (sev >= 5) return { bg: "bg-amber-50 dark:bg-amber-950/30", label: "High", tint: AMBER };
  return { bg: "bg-blue-50 dark:bg-blue-950/20", label: "Review", tint: BLUE };
}

export default function MdaLongitudinalInsights({ checklist, submissions, questions }: Props) {
  const timeline = useMemo(
    () => buildFollowUpTimeline(submissions, questions),
    [submissions, questions],
  );
  const duplicates = useMemo(
    () => findDuplicateCommunities(checklist, questions),
    [checklist, questions],
  );
  const [open, setOpen] = useState<Record<string, boolean>>({});

  return (
    <>
      {/* ── Longitudinal follow-up outcome trend ── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-1.5 text-sm">
            <TrendingUp className="h-4 w-4 text-primary" /> Longitudinal Follow-up Outcomes
            <span className="ml-auto text-xs font-normal text-muted-foreground">by week</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {timeline.hasData && timeline.trend.length > 0 ? (
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={timeline.trend} margin={{ top: 8, right: 16, left: -8, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
                  <RTooltip
                    formatter={(v: any, n: any) => [v == null ? "—" : `${v}%`, n]}
                    contentStyle={{ fontSize: 12, borderRadius: 8 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="completionRate" name="MDA completed" stroke={EMERALD} strokeWidth={2.5} dot={{ r: 3 }} connectNulls />
                  <Line type="monotone" dataKey="commodityIssueRate" name="Commodity issues" stroke={AMBER} strokeWidth={2.5} dot={{ r: 3 }} connectNulls />
                  <Line type="monotone" dataKey="adverseManagedRate" name="Adverse managed" stroke={BLUE} strokeWidth={2.5} dot={{ r: 3 }} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="py-10 text-center text-sm text-muted-foreground">
              No follow-up submissions yet. Outcome trends appear once communities are followed up.
            </p>
          )}
        </CardContent>
      </Card>

      {/* ── Duplicate community flag table ── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-1.5 text-sm">
            <CopyCheck className="h-4 w-4 text-primary" /> Duplicate Community Visits
            <Badge variant={duplicates.length ? "destructive" : "secondary"} className="ml-auto">
              {duplicates.length} flagged
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {duplicates.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              No duplicate community visits detected. Each community within its FLHF, Ward, LGA and State was visited once.
            </p>
          ) : (
            <div className="max-h-[520px] overflow-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 z-10 bg-muted/90 backdrop-blur">
                  <tr className="text-left text-[11px] text-muted-foreground">
                    <th className="px-3 py-2 font-semibold">Community</th>
                    <th className="px-3 py-2 font-semibold">FLHF · Ward · LGA · State</th>
                    <th className="px-3 py-2 text-center font-semibold">Visits</th>
                    <th className="px-3 py-2 text-center font-semibold">Conflicts</th>
                    <th className="px-3 py-2 font-semibold">Flag</th>
                  </tr>
                </thead>
                <tbody>
                  {duplicates.map((g) => {
                    const t = sevTint(g.severity);
                    const isOpen = !!open[g.key];
                    return (
                      <>
                        <tr
                          key={g.key}
                          className={`cursor-pointer border-t border-border/60 ${t.bg} hover:brightness-95`}
                          onClick={() => setOpen((o) => ({ ...o, [g.key]: !o[g.key] }))}
                        >
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-1 font-semibold text-foreground">
                              {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                              {g.community || "—"}
                            </div>
                          </td>
                          <td className="px-3 py-2 text-muted-foreground">
                            {[g.flhf, g.ward, g.lga, g.state].filter(Boolean).join(" · ") || "—"}
                          </td>
                          <td className="px-3 py-2 text-center">
                            <span className="inline-flex items-center gap-1 tabular-nums font-semibold" style={{ color: t.tint }}>
                              {g.visits.length}
                              {g.distinctSubmitters > 1 && <Users2 className="h-3 w-3" />}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-center tabular-nums" style={{ color: g.diffs.length ? RED : undefined }}>
                            {g.diffs.length}
                          </td>
                          <td className="px-3 py-2">
                            <span
                              className="rounded-full px-2 py-0.5 text-[10px] font-semibold text-white"
                              style={{ backgroundColor: t.tint }}
                            >
                              {t.label}
                            </span>
                          </td>
                        </tr>
                        {isOpen && (
                          <tr key={g.key + "-detail"} className="border-t border-border/40 bg-background">
                            <td colSpan={5} className="px-4 py-3">
                              {/* Visitors */}
                              <div className="mb-3">
                                <div className="mb-1 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                  <Clock className="h-3 w-3" /> Visits
                                </div>
                                <div className="flex flex-wrap gap-2">
                                  {g.visits.map((v) => (
                                    <div key={v.id} className="rounded-md border border-border/60 bg-muted/40 px-2 py-1">
                                      <div className="font-medium text-foreground">{v.submitter}</div>
                                      <div className="text-[10px] text-muted-foreground">{v.date}</div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                              {/* Diffs */}
                              {g.diffs.length > 0 ? (
                                <div>
                                  <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                    Conflicting answers
                                  </div>
                                  <div className="overflow-x-auto rounded-md border border-border/60">
                                    <table className="w-full text-[11px]">
                                      <thead className="bg-muted/60">
                                        <tr className="text-left text-muted-foreground">
                                          <th className="px-2 py-1 font-semibold">Question</th>
                                          {g.visits.map((v) => (
                                            <th key={v.id} className="px-2 py-1 font-semibold">{v.submitter}</th>
                                          ))}
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {g.diffs.map((d, i) => (
                                          <tr key={i} className="border-t border-border/40">
                                            <td className="px-2 py-1 font-medium text-foreground">{d.label}</td>
                                            {d.values.map((val, j) => (
                                              <td key={j} className="px-2 py-1 text-amber-700 dark:text-amber-400">
                                                {val.value}
                                              </td>
                                            ))}
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              ) : (
                                <p className="text-[11px] text-muted-foreground">
                                  Same answers across visits — likely a genuine re-visit or accidental resubmission.
                                </p>
                              )}
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}

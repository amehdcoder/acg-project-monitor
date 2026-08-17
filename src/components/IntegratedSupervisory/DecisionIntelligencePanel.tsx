/**
 * Decision Intelligence — four operational questions rendered from
 * `@/lib/isc/decisionIntelligence` over the three live sources
 * (Medicine Accountability ledger · Supervisory Checklist · Geo Microplanning).
 *
 *   Who delays us?    — graph betweenness centrality
 *   Why coverage low? — OLS multiple regression
 *   Is this diversion?— Z-score + unaccounted foil %
 *   Will we fail?     — naive Bayes P(Fail | Delay, NoSupervision)
 */
import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertTriangle, Activity, Gauge, ShieldAlert, TrendingDown } from "lucide-react";
import computeDecisionIntelligence from "@/lib/isc/decisionIntelligence";
import type { CommunityDiagnosis, NetworkStats, ChecklistSite } from "@/lib/isc/humanPatterns";
import type { LogisticsDataset } from "@/lib/isc/medicineAccountability";

interface Props {
  dataset: LogisticsDataset;
  network: NetworkStats;
  diagnoses: CommunityDiagnosis[];
  sites: ChecklistSite[];
  coverageFloor: number;   // percent (e.g. 70)
  lateStartDays: number;
}

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
const pct0 = (n: number) => `${(n * 100).toFixed(0)}%`;

const VERDICT_TONE: Record<string, string> = {
  clear: "border-emerald-300 bg-emerald-50 text-emerald-700",
  review: "border-amber-300 bg-amber-50 text-amber-700",
  investigate: "border-destructive/40 bg-destructive/10 text-destructive",
};

export default function DecisionIntelligencePanel({
  dataset, network, diagnoses, sites, coverageFloor, lateStartDays,
}: Props) {
  const di = useMemo(
    () => computeDecisionIntelligence(dataset, network, diagnoses, sites, {
      coverageFloor: coverageFloor / 100,
      lateStartDays,
    }),
    [dataset, network, diagnoses, sites, coverageFloor, lateStartDays],
  );

  const { delayBrokers, regression, diversion, risk } = di;

  return (
    <div className="space-y-4">
      <Card className="border-primary/30">
        <CardHeader className="pb-2">
          <CardTitle className="flex flex-wrap items-center gap-2 text-sm">
            <Gauge className="h-4 w-4 text-primary" /> Decision intelligence
            <Badge variant="outline" className="text-[10px] font-normal">Centrality · Regression · Z-score · Bayes</Badge>
          </CardTitle>
          <p className="text-[11px] text-muted-foreground">
            Four operational questions answered from the ledger, the checklist and the bound microplan together —
            recomputed on every sync so action can be taken in near real time.
          </p>
        </CardHeader>
      </Card>

      {/* 1 — Who delays us? */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Activity className="h-4 w-4 text-sky-600" /> Who delays us?
            <Badge variant="outline" className="text-[10px] font-normal">Betweenness centrality</Badge>
          </CardTitle>
          <p className="text-[11px] text-muted-foreground">
            Share of shortest supply paths that pass through each person, and the excess commencement lag observed on
            the communities they touch versus everyone else.
          </p>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {delayBrokers.length ? (
            <>
              <div className="mb-3 rounded-lg border border-sky-300 bg-sky-50 p-3 text-xs text-sky-900">
                {delayBrokers[0].statement}
              </div>
              <Table>
                <TableHeader><TableRow>
                  <TableHead className="text-xs">Actor</TableHead>
                  <TableHead className="text-xs">Role</TableHead>
                  <TableHead className="text-xs text-right">Path share</TableHead>
                  <TableHead className="text-xs text-right">Communities</TableHead>
                  <TableHead className="text-xs text-right">Mean lag (d)</TableHead>
                  <TableHead className="text-xs text-right">Baseline (d)</TableHead>
                  <TableHead className="text-xs text-right">Excess (d)</TableHead>
                  <TableHead className="text-xs text-right">Late</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {delayBrokers.map((b) => (
                    <TableRow key={b.id}>
                      <TableCell className="text-xs font-medium">{b.name}</TableCell>
                      <TableCell className="text-xs">{b.role}</TableCell>
                      <TableCell className="text-xs text-right font-semibold">{pct0(b.pathShare)}</TableCell>
                      <TableCell className="text-xs text-right">{b.communities}</TableCell>
                      <TableCell className="text-xs text-right">{b.meanLagDays.toFixed(1)}</TableCell>
                      <TableCell className="text-xs text-right text-muted-foreground">{b.baselineLagDays.toFixed(1)}</TableCell>
                      <TableCell className={`text-xs text-right font-semibold ${b.excessLagDays > 0 ? "text-destructive" : "text-emerald-600"}`}>
                        {b.excessLagDays > 0 ? "+" : ""}{b.excessLagDays.toFixed(1)}
                      </TableCell>
                      <TableCell className="text-xs text-right">{b.lateCommunities}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </>
          ) : (
            <p className="py-6 text-center text-xs text-muted-foreground">
              Not enough connected handovers yet to compute centrality — at least three linked actors are required.
            </p>
          )}
        </CardContent>
      </Card>

      {/* 2 — Why coverage low? */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <TrendingDown className="h-4 w-4 text-amber-600" /> Why is coverage low?
            <Badge variant="outline" className="text-[10px] font-normal">OLS multiple regression</Badge>
          </CardTitle>
          {regression && (
            <p className="text-[11px] text-muted-foreground">
              {regression.narrative} · n = {regression.n} · R² = {regression.r2.toFixed(2)} · adj. R² = {regression.adjR2.toFixed(2)}
            </p>
          )}
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {regression ? (
            <Table>
              <TableHeader><TableRow>
                <TableHead className="text-xs">Driver</TableHead>
                <TableHead className="text-xs text-right">Effect on coverage</TableHead>
                <TableHead className="text-xs text-right">Std. β</TableHead>
                <TableHead className="text-xs text-right">t</TableHead>
                <TableHead className="text-xs text-right">p</TableHead>
                <TableHead className="text-xs">Verdict</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {regression.terms.map((t) => (
                  <TableRow key={t.key}>
                    <TableCell className="text-xs font-medium">{t.label}</TableCell>
                    <TableCell className={`text-xs text-right ${t.direction === "reduces" ? "text-destructive" : "text-emerald-600"}`}>
                      {t.coefficient >= 0 ? "+" : ""}{(t.coefficient * 100).toFixed(2)} pts
                    </TableCell>
                    <TableCell className="text-xs text-right">{t.standardized.toFixed(3)}</TableCell>
                    <TableCell className="text-xs text-right">{t.tStat.toFixed(2)}</TableCell>
                    <TableCell className="text-xs text-right">{t.pValue < 0.001 ? "<0.001" : t.pValue.toFixed(3)}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`text-[10px] ${t.significant ? "border-destructive/40 bg-destructive/10 text-destructive" : "border-muted-foreground/30"}`}>
                        {t.significant ? "Significant" : "Not significant"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="py-6 text-center text-xs text-muted-foreground">
              Too few diagnosed communities to fit the model — it activates automatically as submissions sync.
            </p>
          )}
        </CardContent>
      </Card>

      {/* 3 — Is this diversion? */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <ShieldAlert className="h-4 w-4 text-destructive" /> Is this diversion?
            <Badge variant="outline" className="text-[10px] font-normal">Z-score + unaccounted foil %</Badge>
          </CardTitle>
          <p className="text-[11px] text-muted-foreground">
            Volume handled versus peers (Z-score) combined with the share of issued medicines neither distributed nor
            returned. High on both, with weak proof-of-delivery, warrants physical verification.
          </p>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {diversion.length ? (
            <Table>
              <TableHeader><TableRow>
                <TableHead className="text-xs">Facility / actor</TableHead>
                <TableHead className="text-xs">Context</TableHead>
                <TableHead className="text-xs text-right">Issued</TableHead>
                <TableHead className="text-xs text-right">Distributed</TableHead>
                <TableHead className="text-xs text-right">Returned</TableHead>
                <TableHead className="text-xs text-right">Unaccounted</TableHead>
                <TableHead className="text-xs text-right">Foil %</TableHead>
                <TableHead className="text-xs text-right">Z</TableHead>
                <TableHead className="text-xs text-right">POD</TableHead>
                <TableHead className="text-xs">Verdict</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {diversion.map((d) => (
                  <TableRow key={`${d.scope}-${d.id}`}>
                    <TableCell className="text-xs font-medium">
                      {d.name}
                      <span className="ml-1 text-[10px] uppercase text-muted-foreground">{d.scope}</span>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{d.context || "—"}</TableCell>
                    <TableCell className="text-xs text-right">{Math.round(d.issued).toLocaleString()}</TableCell>
                    <TableCell className="text-xs text-right">{Math.round(d.distributed).toLocaleString()}</TableCell>
                    <TableCell className="text-xs text-right">{Math.round(d.returned).toLocaleString()}</TableCell>
                    <TableCell className="text-xs text-right">{Math.round(d.unaccounted).toLocaleString()}</TableCell>
                    <TableCell className={`text-xs text-right font-semibold ${d.foilPct > 0.1 ? "text-destructive" : ""}`}>{pct(d.foilPct)}</TableCell>
                    <TableCell className="text-xs text-right">{d.zScore.toFixed(2)}</TableCell>
                    <TableCell className="text-xs text-right">{pct0(d.signatureRate)}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`text-[10px] ${VERDICT_TONE[d.verdict] ?? ""}`} title={d.reasons.join(" · ")}>
                        {d.verdict === "investigate" ? "Investigate" : d.verdict === "review" ? "Review" : "Clear"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="py-6 text-center text-xs text-muted-foreground">No issue/return records to test for diversion yet.</p>
          )}
        </CardContent>
      </Card>

      {/* 4 — Will we fail? */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <AlertTriangle className="h-4 w-4 text-destructive" /> Will we fail?
            <Badge variant="outline" className="text-[10px] font-normal">Bayesian risk</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {risk ? (
            <>
              <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3">
                <p className="text-2xl font-bold text-destructive">
                  P(Fail) = {risk.headline.posterior.toFixed(2)}
                </p>
                <p className="mt-1 font-mono text-[10px] text-muted-foreground">{risk.formula}</p>
                <p className="mt-1.5 text-xs">{risk.translation}</p>
                <Progress value={risk.headline.posterior * 100} className="mt-2 h-1.5" />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Prior P(Fail) = {risk.prior.toFixed(2)} across {risk.n} communities · failure = coverage &lt; {pct0(risk.coverageFloor)} ·
                  delay ≥ {risk.lateStartDays} days.
                </p>
              </div>

              <Table>
                <TableHeader><TableRow>
                  <TableHead className="text-xs">Delay</TableHead>
                  <TableHead className="text-xs">No supervision</TableHead>
                  <TableHead className="text-xs text-right">P(Fail | evidence)</TableHead>
                  <TableHead className="text-xs text-right">Observed</TableHead>
                  <TableHead className="text-xs text-right">Observed failures</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {risk.cells.map((c, i) => (
                    <TableRow key={i} className={c.delay && c.noSupervision ? "bg-destructive/5" : ""}>
                      <TableCell className="text-xs">{c.delay ? "Yes" : "No"}</TableCell>
                      <TableCell className="text-xs">{c.noSupervision ? "Yes" : "No"}</TableCell>
                      <TableCell className="text-xs text-right font-semibold">{c.posterior.toFixed(2)}</TableCell>
                      <TableCell className="text-xs text-right">{c.observed}</TableCell>
                      <TableCell className="text-xs text-right">{c.observedFail}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {!!risk.exposed.length && (
                <div className="overflow-x-auto">
                  <p className="mb-1.5 text-[11px] font-medium text-muted-foreground">
                    Communities currently exposed (delay + no supervision)
                  </p>
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead className="text-xs">Community</TableHead>
                      <TableHead className="text-xs">Ward</TableHead>
                      <TableHead className="text-xs">LGA</TableHead>
                      <TableHead className="text-xs text-right">Lag (d)</TableHead>
                      <TableHead className="text-xs text-right">Coverage</TableHead>
                      <TableHead className="text-xs text-right">P(Fail)</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {risk.exposed.map((e, i) => (
                        <TableRow key={`${e.community}-${i}`}>
                          <TableCell className="text-xs font-medium">{e.community || "—"}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{e.ward || "—"}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{e.lga || "—"}</TableCell>
                          <TableCell className="text-xs text-right">{e.lagDays || "—"}</TableCell>
                          <TableCell className="text-xs text-right">{pct(e.coverage)}</TableCell>
                          <TableCell className="text-xs text-right font-semibold">{e.posterior.toFixed(2)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </>
          ) : (
            <p className="py-6 text-center text-xs text-muted-foreground">
              At least eight diagnosed communities are needed before the risk model reports.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

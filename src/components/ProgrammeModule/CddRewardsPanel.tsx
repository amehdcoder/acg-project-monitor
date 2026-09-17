// CDD recognition & rewards — leaderboard derived from confirmed case-search
// output. Presentation only: every figure is computed from the cases already
// in the register.

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Award, Download, Medal, Trophy, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { toneClasses } from "@/lib/programmeModule/defaults";
import type { CddRow, PotentialCaseRow } from "@/lib/programmeModule/cddCaseSearch";
import {
  CYCLE_OPTIONS, DEFAULT_REWARD_RULES, REWARD_TIERS, currentCycleStart,
  rewardBreakdown, rewardSummary, useCddRewards, pointsByCdd,
  type CddPointRow,
} from "@/lib/programmeModule/cddRewards";

interface Props {
  cdds: CddRow[];
  cases: PotentialCaseRow[];
  facilityName: (id?: string | null) => string;
  /** Points the database credited automatically, case by case. */
  ledger?: CddPointRow[];
}

const rankIcon = (rank: number) => {
  if (rank === 1) return <Trophy className="h-4 w-4 text-[hsl(var(--health-amber))]" />;
  if (rank <= 3) return <Medal className="h-4 w-4 text-muted-foreground" />;
  return null;
};

const CddRewardsPanel = ({ cdds, cases, facilityName }: Props) => {
  const [period, setPeriod] = useState("cycle");
  const [rulesOpen, setRulesOpen] = useState(false);
  const rows = useCddRewards(cdds, cases, period);
  const totals = rewardSummary(rows);
  const top = rows[0];

  const exportCsv = () => {
    const head = [
      "Rank", "CDD", "Facility", "Community", "Cases found", "Confirmed",
      "Registered", "Not a case", "Accuracy %", "Points", "Tier", "Recognition",
    ];
    const lines = rows.map((r) => [
      r.rank, r.name, facilityName(r.facilityId), r.community, r.found, r.confirmed,
      r.registered, r.notACase, r.precision, r.points, r.tier.label, r.tier.recognition,
    ]);
    const csv = [head, ...lines]
      .map((l) => l.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `cdd-rewards-${period === "cycle" ? currentCycleStart() : "all-time"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card className="p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Award className="h-4 w-4 text-[hsl(var(--health-amber))]" />
        <h4 className="font-semibold text-foreground">CDD recognition &amp; rewards</h4>
        <Badge variant="outline">{totals.scoring} scoring</Badge>
        <div className="flex-1" />
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="h-9 w-[230px]"><SelectValue /></SelectTrigger>
          <SelectContent className="z-[1200] bg-popover">
            {CYCLE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" className="gap-1" onClick={() => setRulesOpen(true)}>
          <Info className="h-4 w-4" /> How points work
        </Button>
        <Button variant="outline" size="sm" className="gap-1" onClick={exportCsv} disabled={!rows.length}>
          <Download className="h-4 w-4" /> Export
        </Button>
      </div>

      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          Register CDDs to start recognising confirmed case-search output.
        </p>
      ) : (
        <>
          <div className="mb-3 grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-border p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Leading CDD</p>
              <p className="mt-1 truncate font-semibold text-foreground">
                {top && top.points > 0 ? top.name : "No points yet"}
              </p>
              <p className="text-xs text-muted-foreground">
                {top && top.points > 0
                  ? `${top.points} points · ${top.confirmed} confirmed · ${facilityName(top.facilityId)}`
                  : "Points start once a clinician confirms a case"}
              </p>
            </div>
            <div className="rounded-lg border border-border p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Confirmed cases</p>
              <p className="mt-1 text-2xl font-semibold text-foreground">{totals.confirmed}</p>
              <p className="text-xs text-muted-foreground">{totals.totalPoints} points awarded in total</p>
            </div>
            <div className="rounded-lg border border-border p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Gold &amp; Champion</p>
              <p className="mt-1 text-2xl font-semibold text-foreground">{totals.topTier}</p>
              <p className="text-xs text-muted-foreground">CDDs due a performance stipend</p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <Table className="min-w-[860px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>CDD</TableHead>
                  <TableHead>Facility</TableHead>
                  <TableHead className="text-right">Found</TableHead>
                  <TableHead className="text-right">Confirmed</TableHead>
                  <TableHead className="text-right">Registered</TableHead>
                  <TableHead className="text-right">Accuracy</TableHead>
                  <TableHead className="text-right">Points</TableHead>
                  <TableHead>Tier &amp; progress</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.cddId}>
                    <TableCell>
                      <span className="flex items-center gap-1 font-medium">
                        {rankIcon(r.rank)}{r.rank}
                      </span>
                    </TableCell>
                    <TableCell>
                      <p className="font-medium text-foreground">{r.name}</p>
                      <p className="text-xs text-muted-foreground">{rewardBreakdown(r)}</p>
                    </TableCell>
                    <TableCell className="text-sm">
                      <p>{facilityName(r.facilityId)}</p>
                      {r.community && <p className="text-xs text-muted-foreground">{r.community}</p>}
                    </TableCell>
                    <TableCell className="text-right">{r.found}</TableCell>
                    <TableCell className="text-right font-medium">{r.confirmed}</TableCell>
                    <TableCell className="text-right">{r.registered}</TableCell>
                    <TableCell className="text-right">
                      {r.confirmed + r.notACase ? `${r.precision}%` : "—"}
                      {r.precisionEarned && (
                        <Badge variant="outline" className={cn("ml-1 border", toneClasses.success)}>
                          bonus
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right text-base font-semibold text-foreground">
                      {r.points}
                    </TableCell>
                    <TableCell className="min-w-[200px]">
                      <Badge variant="outline" className={cn("border", toneClasses[r.tier.tone])}>
                        {r.tier.label}
                      </Badge>
                      {r.nextTier ? (
                        <>
                          <Progress
                            className="mt-1.5 h-1.5"
                            value={Math.min(100, Math.round((r.points / r.nextTier.min) * 100))}
                          />
                          <p className="mt-1 text-xs text-muted-foreground">
                            {r.toNextTier} points to {r.nextTier.label}
                          </p>
                        </>
                      ) : (
                        <p className="mt-1 text-xs text-muted-foreground">Top tier reached</p>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      <Dialog open={rulesOpen} onOpenChange={setRulesOpen}>
        <DialogContent className="max-h-[85dvh] max-w-lg overflow-y-auto">
          <DialogHeader><DialogTitle>How CDD points are earned</DialogTitle></DialogHeader>
          <div className="space-y-4 text-sm">
            <ul className="space-y-1.5 text-muted-foreground">
              <li>
                <span className="font-medium text-foreground">
                  {DEFAULT_REWARD_RULES.confirmedPoints} points
                </span>{" "}
                for every case a clinician confirms as a true MMDP case.
              </li>
              <li>
                <span className="font-medium text-foreground">
                  +{DEFAULT_REWARD_RULES.registeredBonus} points
                </span>{" "}
                once that person is registered at a facility with a Case ID.
              </li>
              <li>
                <span className="font-medium text-foreground">
                  {DEFAULT_REWARD_RULES.pendingPoints} point
                </span>{" "}
                for a case still waiting for the clinician, so effort is recognised.
              </li>
              <li>
                <span className="font-medium text-foreground">
                  +{DEFAULT_REWARD_RULES.precisionBonus} points
                </span>{" "}
                accuracy bonus when at least {DEFAULT_REWARD_RULES.precisionMinCases} reviewed cases
                are {DEFAULT_REWARD_RULES.precisionTarget}% or more correct.
              </li>
            </ul>
            <p className="text-xs text-muted-foreground">
              Cases a clinician rules out score nothing, so bringing many unlikely names lowers
              accuracy rather than raising points.
            </p>
            <div>
              <p className="mb-2 font-medium text-foreground">Tiers</p>
              <div className="space-y-1.5">
                {REWARD_TIERS.map((t) => (
                  <div key={t.key} className="flex items-start gap-2">
                    <Badge variant="outline" className={cn("border", toneClasses[t.tone])}>
                      {t.label}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      from {t.min} points — {t.recognition}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Points are recalculated from the case register, so correcting a clinician decision
              updates the scores immediately. Rewards are a recognition scheme, not payment for
              individual cases.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default CddRewardsPanel;

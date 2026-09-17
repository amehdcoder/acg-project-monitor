// Mass drug administration history for one beneficiary — what they received in
// each household round, how it was given, and any side effect recorded.

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { AlertTriangle, Home, Pill, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { toneClasses } from "@/lib/programmeModule/defaults";
import {
  diseaseLabel, householdCoverage, notEligibleLabel, outcomeLabel,
  personalMdaSummary, useBeneficiaryMda,
} from "@/lib/programmeModule/households";

interface Props {
  beneficiaryId: string;
  householdId?: string | null;
}

const fmtDate = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" }) : "—";

const Metric = ({ label, value, hint }: { label: string; value: string | number; hint?: string }) => (
  <Card className="p-4">
    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
    <p className="mt-1 text-2xl font-semibold text-foreground">{value}</p>
    {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
  </Card>
);

const outcomeTone = (o: string) =>
  o === "treated" ? toneClasses.success
    : o === "refused" || o === "absent" ? toneClasses.warning
      : toneClasses.neutral;

const BeneficiaryMdaPanel = ({ beneficiaryId, householdId }: Props) => {
  const { rounds, mine, household, loading } = useBeneficiaryMda(beneficiaryId, householdId);
  const summary = personalMdaSummary(mine);
  const coverage = householdCoverage(rounds);
  const roundFor = (id?: string) => rounds.find((r) => r.id === id);

  if (loading) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Loading treatment history…</p>;
  }

  if (!householdId && mine.length === 0) {
    return (
      <Card className="p-6 text-center">
        <Home className="mx-auto h-6 w-6 text-muted-foreground" />
        <p className="mt-2 text-sm font-medium text-foreground">Not linked to a household yet</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Add this person to a household on the Households &amp; MDA screen. Their treatment rounds,
          coverage and any side effects will then appear here.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Rounds recorded" value={summary.rounds} hint="Against this person" />
        <Metric label="Treated" value={summary.treated} hint={`${summary.adherence}% of rounds`} />
        <Metric label="Missed" value={summary.missed} hint="Absent or refused" />
        <Metric
          label="Household coverage"
          value={`${coverage.percent}%`}
          hint={`${coverage.treated} of ${coverage.eligible} eligible · ${coverage.rounds} rounds`}
        />
      </div>

      {household && (
        <Card className="flex flex-wrap items-center gap-2 p-3 text-sm">
          <Home className="h-4 w-4 text-primary" />
          <span className="font-medium text-foreground">{household.household_code}</span>
          <span className="text-muted-foreground">
            {[household.name, household.village, household.ward, household.lga].filter(Boolean).join(" · ") || "—"}
          </span>
        </Card>
      )}

      {summary.adverse > 0 && (
        <Card className={cn("flex flex-wrap items-center gap-2 border p-3 text-sm", toneClasses.warning)}>
          <AlertTriangle className="h-4 w-4" />
          {summary.adverse} side effect{summary.adverse > 1 ? "s" : ""} recorded
          {summary.serious > 0 && ` — ${summary.serious} marked serious, follow up`}.
        </Card>
      )}

      <Card className="p-4">
        <div className="mb-3 flex items-center gap-2">
          <Pill className="h-4 w-4 text-primary" />
          <h4 className="font-semibold text-foreground">Treatment history</h4>
          <Badge variant="outline">{mine.length}</Badge>
        </div>
        {mine.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No treatment recorded against this person yet. Record a round on the Households &amp; MDA
            screen and pick them from the household register.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Round</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Disease</TableHead>
                  <TableHead>Outcome</TableHead>
                  <TableHead>Medicine</TableHead>
                  <TableHead className="text-right">Tablets</TableHead>
                  <TableHead>Swallowing watched</TableHead>
                  <TableHead>Side effect</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mine.map((t) => {
                  const r = roundFor(t.round_id);
                  return (
                    <TableRow key={String(t.id)}>
                      <TableCell className="font-medium text-foreground">{r?.round_name || "—"}</TableCell>
                      <TableCell>{fmtDate(r?.round_date)}</TableCell>
                      <TableCell>{diseaseLabel(r?.disease)}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={cn("border", outcomeTone(t.outcome))}>
                          {outcomeLabel(t.outcome)}
                        </Badge>
                        {t.outcome === "not_eligible" && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            {notEligibleLabel(t.not_eligible_reason)}
                          </p>
                        )}
                      </TableCell>
                      <TableCell>{t.drug || r?.drug || "—"}</TableCell>
                      <TableCell className="text-right">{t.tablets ?? "—"}</TableCell>
                      <TableCell>
                        {t.directly_observed ? (
                          <span className="inline-flex items-center gap-1 text-sm">
                            <ShieldCheck className="h-3.5 w-3.5 text-primary" /> Yes
                          </span>
                        ) : "No"}
                      </TableCell>
                      <TableCell className="text-sm">
                        {t.adverse_event
                          ? <span className={cn(t.adverse_event_serious && "font-medium text-destructive")}>
                              {t.adverse_event}{t.adverse_event_serious ? " (serious)" : ""}
                            </span>
                          : "None"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
    </div>
  );
};

export default BeneficiaryMdaPanel;

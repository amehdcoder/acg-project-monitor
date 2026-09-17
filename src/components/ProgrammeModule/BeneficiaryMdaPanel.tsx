// Mass drug administration history for one beneficiary — their own treatment
// passport across the five preventive-chemotherapy diseases, the household they
// belong to, the water they drink, and the morbidity care they receive.

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { AlertTriangle, Droplets, Home, Pill, ShieldCheck, Stethoscope, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { toneClasses } from "@/lib/programmeModule/defaults";
import {
  diseaseLabel, householdCoverage, notEligibleLabel, outcomeLabel,
  personalMdaSummary, useBeneficiaryMda, washStatusLabel, washTypeLabel, washIsUsable,
  type WashSourceRow,
} from "@/lib/programmeModule/households";
import {
  relationshipLabel, useMembersOfHousehold,
} from "@/lib/programmeModule/householdMembers";
import {
  careGaps, conditionLabel, measurementTrend, stageLabel, surgeryLabel, useMorbidityForPerson,
} from "@/lib/programmeModule/morbidity";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import PassportMatrix from "./PassportMatrix";

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

/** The community water point linked to this household, if any. */
const useWashSource = (id?: string | null) => {
  const [source, setSource] = useState<WashSourceRow | null>(null);
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!id) { setSource(null); return; }
      const { data } = await (supabase as unknown as { from: (t: string) => any })
        .from("community_wash_sources").select("*").eq("id", id).maybeSingle();
      if (!cancelled) setSource((data as WashSourceRow) || null);
    };
    void run();
    return () => { cancelled = true; };
  }, [id]);
  return source;
};

const BeneficiaryMdaPanel = ({ beneficiaryId, householdId }: Props) => {
  const { rounds, treatments, mine, household, loading } = useBeneficiaryMda(beneficiaryId, householdId);
  const { members } = useMembersOfHousehold(household?.id || householdId);
  const { records: morbidity } = useMorbidityForPerson(beneficiaryId);
  const washSource = useWashSource(household?.wash_source_id);

  const summary = personalMdaSummary(mine);
  const coverage = householdCoverage(rounds);
  const roundFor = (id?: string) => rounds.find((r) => r.id === id);
  const me = members.find((m) => m.beneficiary_id === beneficiaryId);
  const gaps = careGaps(morbidity);
  const trend = measurementTrend(morbidity);

  if (loading) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Loading treatment history…</p>;
  }

  if (!householdId && !household && mine.length === 0) {
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
          <div className="flex-1" />
          <Droplets className="h-4 w-4 text-primary" />
          {washSource ? (
            <>
              <span className="font-medium text-foreground">{washSource.name}</span>
              <Badge variant="outline">{washTypeLabel(washSource.source_type)}</Badge>
              <Badge
                variant="outline"
                className={cn((!washSource.is_improved || !washIsUsable(washSource.functional_status))
                  && "border-destructive/40 text-destructive")}
              >
                {washSource.is_improved ? "Improved" : "Unimproved"} · {washStatusLabel(washSource.functional_status)}
              </Badge>
            </>
          ) : (
            <span className="text-muted-foreground">No working water point recorded for this community</span>
          )}
        </Card>
      )}

      {summary.adverse > 0 && (
        <Card className={cn("flex flex-wrap items-center gap-2 border p-3 text-sm", toneClasses.warning)}>
          <AlertTriangle className="h-4 w-4" />
          {summary.adverse} side effect{summary.adverse > 1 ? "s" : ""} recorded
          {summary.serious > 0 && ` — ${summary.serious} marked serious, follow up`}.
        </Card>
      )}

      {/* Passport */}
      <Card className="p-4">
        <div className="mb-3 flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-primary" />
          <h4 className="font-semibold text-foreground">Preventive chemotherapy passport</h4>
        </div>
        <PassportMatrix
          treatments={mine}
          rounds={rounds}
          person={me ? {
            age: me.age_years,
            heightCm: me.height_cm,
            isPregnant: me.is_pregnant,
            isBreastfeeding: me.is_breastfeeding,
          } : undefined}
          showEligibility={!!me}
        />
      </Card>

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

      {/* Morbidity care */}
      <Card className="p-4">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <Stethoscope className="h-4 w-4 text-primary" />
          <h4 className="font-semibold text-foreground">Morbidity management &amp; disability prevention</h4>
          <Badge variant="outline">{morbidity.length}</Badge>
          {trend && (
            <Badge variant="outline" className={cn(trend.improving
              ? "border-emerald-500/40 text-emerald-700"
              : "border-amber-500/40 text-amber-700")}>
              {Math.abs(trend.delta)} cm {trend.improving ? "smaller" : "larger"} since {fmtDate(trend.from)}
            </Badge>
          )}
          {gaps.map((g) => (
            <Badge key={g} variant="outline" className="border-destructive/40 text-destructive">{g}</Badge>
          ))}
        </div>
        {morbidity.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            No morbidity care recorded. Record it from this person's household on the Households &amp;
            MDA screen.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table className="min-w-[720px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Recorded</TableHead>
                  <TableHead>Condition</TableHead>
                  <TableHead>Stage</TableHead>
                  <TableHead>Side</TableHead>
                  <TableHead className="text-right">Limb (cm)</TableHead>
                  <TableHead className="text-right">Attacks/yr</TableHead>
                  <TableHead>Self-care</TableHead>
                  <TableHead>Surgery</TableHead>
                  <TableHead>Next review</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {morbidity.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell>{fmtDate(m.recorded_on)}</TableCell>
                    <TableCell className="font-medium text-foreground">{conditionLabel(m.condition)}</TableCell>
                    <TableCell>{stageLabel(m.stage)}</TableCell>
                    <TableCell>{m.affected_side || "—"}</TableCell>
                    <TableCell className="text-right">{m.limb_circumference_cm ?? "—"}</TableCell>
                    <TableCell className="text-right">{m.acute_attacks_last_year ?? "—"}</TableCell>
                    <TableCell>
                      {m.self_care_kit_issued ? "Kit issued" : "No kit"}{m.self_care_trained ? " · trained" : ""}
                    </TableCell>
                    <TableCell>{surgeryLabel(m.surgery_status)}</TableCell>
                    <TableCell>{fmtDate(m.next_review_date)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      {/* The rest of the household */}
      {members.length > 0 && (
        <Card className="p-4">
          <div className="mb-2 flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            <h4 className="font-semibold text-foreground">Others in this household</h4>
            <Badge variant="outline">{members.length - (me ? 1 : 0)}</Badge>
          </div>
          <div className="overflow-x-auto">
            <Table className="min-w-[560px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Relationship</TableHead>
                  <TableHead>Sex / age</TableHead>
                  <TableHead className="text-right">Doses swallowed</TableHead>
                  <TableHead className="text-right">Missed</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.filter((m) => m.id !== me?.id).map((m) => {
                  const theirs = treatments.filter((t) =>
                    t.member_id === m.id ||
                    (m.beneficiary_id && t.beneficiary_id === m.beneficiary_id));
                  const s = personalMdaSummary(theirs);
                  return (
                    <TableRow key={m.id}>
                      <TableCell className="font-medium text-foreground">{m.full_name}</TableCell>
                      <TableCell>{relationshipLabel(m.relationship)}</TableCell>
                      <TableCell>
                        {[m.sex, m.age_years != null ? `${m.age_years} yrs` : null]
                          .filter(Boolean).join(" · ") || "—"}
                      </TableCell>
                      <TableCell className="text-right">{s.treated}</TableCell>
                      <TableCell className={cn("text-right", s.missed > 0 && "text-destructive")}>
                        {s.missed}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {members.filter((m) => m.id !== me?.id).length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground">
                      Nobody else listed in this household yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}
    </div>
  );
};

export default BeneficiaryMdaPanel;

// The NTD treatment passport for one person in a household.
//
// Five preventive-chemotherapy diseases down the side, treatment years across
// the top: a single glance says whether this person has actually swallowed the
// medicine every round, or has been quietly missed for years. Underneath sits
// the dose-by-dose history and the morbidity care they are receiving.

import { useMemo, useState } from "react";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Activity, AlertTriangle, ArrowDownRight, ArrowUpRight, Loader2, Pill, Plus, ShieldCheck, Stethoscope,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  diseaseLabel, notEligibleLabel, outcomeLabel,
  type MdaRoundRow, type MdaTreatmentRow,
} from "@/lib/programmeModule/households";
import {
  PASSPORT_MARK, PASSPORT_STATE_LABEL, PASSPORT_TONE, buildPassport, diseaseEligibility,
  relationshipLabel, type RosterPerson,
} from "@/lib/programmeModule/householdMembers";
import {
  AFFECTED_SIDES, MORBIDITY_CONDITIONS, MORBIDITY_STAGES, SURGERY_STATUS,
  careGaps, conditionLabel, measurementTrend, stageLabel, surgeryLabel,
  type MorbidityRow,
} from "@/lib/programmeModule/morbidity";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  person: RosterPerson;
  householdLabel: string;
  rounds: MdaRoundRow[];
  treatments: MdaTreatmentRow[];
  morbidity: MorbidityRow[];
  /** The community water point this person's household drinks from. */
  washSource?: { name: string; is_improved: boolean; source_type: string } | null;
  canManage?: boolean;
  saving?: boolean;
  onSaveMorbidity: (draft: Partial<MorbidityRow>) => Promise<void> | void;
  onOpenRecord?: () => void;
}

const fmt = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" }) : "—";

const PersonNtdPassport = ({
  open, onOpenChange, person, householdLabel, rounds, treatments, morbidity,
  canManage = true, saving, onSaveMorbidity, onOpenRecord,
}: Props) => {
  const [morbOpen, setMorbOpen] = useState(false);
  const [draft, setDraft] = useState<Partial<MorbidityRow>>({});

  const mine = useMemo(
    () => treatments.filter((t) =>
      (person.beneficiaryId && t.beneficiary_id === person.beneficiaryId) ||
      (person.memberId && t.member_id === person.memberId)),
    [treatments, person],
  );

  const passport = useMemo(() => buildPassport(mine, rounds), [mine, rounds]);
  const roundById = useMemo(() => new Map(rounds.map((r) => [r.id, r])), [rounds]);
  const gaps = careGaps(morbidity);
  const trend = measurementTrend(morbidity);

  const eligibility = useMemo(() => passport.diseases.map((d) => ({
    disease: d,
    verdict: diseaseEligibility(d.value, {
      age: person.age,
      heightCm: person.heightCm,
      isPregnant: person.isPregnant,
      isBreastfeeding: person.isBreastfeeding,
    }),
  })), [passport.diseases, person]);

  const openMorbidity = (row?: MorbidityRow) => {
    setDraft(row ? { ...row } : {
      condition: "lymphoedema",
      stage: "not_staged",
      affected_side: "left",
      self_care_kit_issued: false,
      self_care_trained: false,
      surgery_status: "not_required",
      recorded_on: new Date().toISOString().slice(0, 10),
    });
    setMorbOpen(true);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[92dvh] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex flex-wrap items-center gap-2">
              {person.name}
              <Badge variant="outline">{relationshipLabel(person.relationship)}</Badge>
              {person.registered
                ? <Badge variant="outline" className="border-primary/40 text-primary">Registered beneficiary</Badge>
                : <Badge variant="outline">Household member</Badge>}
            </DialogTitle>
          </DialogHeader>

          <p className="-mt-2 text-sm text-muted-foreground">
            {householdLabel} · {person.sex || "Sex not recorded"} ·{" "}
            {person.age != null ? `${person.age} years` : "Age not recorded"}
            {person.heightCm ? ` · ${person.heightCm} cm` : ""}
          </p>

          {/* Passport matrix */}
          <Card className="p-4">
            <div className="mb-3 flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" />
              <h4 className="font-semibold text-foreground">Preventive chemotherapy passport</h4>
              <Badge variant="outline">{passport.doses} doses swallowed</Badge>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] border-separate border-spacing-1 text-sm">
                <thead>
                  <tr>
                    <th className="text-left text-xs font-medium uppercase text-muted-foreground">Disease</th>
                    {passport.years.map((y) => (
                      <th key={y} className="w-12 text-xs font-medium text-muted-foreground">{y}</th>
                    ))}
                    <th className="text-left text-xs font-medium uppercase text-muted-foreground">Eligibility today</th>
                  </tr>
                </thead>
                <tbody>
                  {passport.diseases.map((d) => {
                    const e = eligibility.find((x) => x.disease.value === d.value)?.verdict;
                    const miss = passport.persistentMisses.find((m) => m.disease === d.value);
                    return (
                      <tr key={d.value}>
                        <td className="pr-2">
                          <span className="font-medium text-foreground">{d.label}</span>
                          {miss && (
                            <span className="ml-2 inline-flex items-center gap-1 text-xs text-destructive">
                              <AlertTriangle className="h-3 w-3" /> missed {miss.streak} in a row
                            </span>
                          )}
                        </td>
                        {passport.years.map((y) => {
                          const c = passport.cell(d.value, y);
                          return (
                            <td key={y} className="text-center">
                              <span
                                title={`${d.label} ${y}: ${PASSPORT_STATE_LABEL[c.state]}`}
                                className={cn(
                                  "inline-flex h-8 w-10 items-center justify-center rounded-md border text-xs font-semibold",
                                  PASSPORT_TONE[c.state],
                                )}
                              >
                                {PASSPORT_MARK[c.state]}
                              </span>
                            </td>
                          );
                        })}
                        <td className="pl-2 text-xs">
                          {e?.eligible
                            ? <span className="text-emerald-700 dark:text-emerald-300">Eligible{e.reason ? ` — ${e.reason}` : ""}</span>
                            : <span className="text-muted-foreground">{e?.reason || "Not eligible"}</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              ✓ treated · A absent · R refused · — not eligible · · no round recorded.
              Eligibility is guidance for the distributor, not a clinical decision.
            </p>
            {passport.neverTreated.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-2 text-sm">
                <AlertTriangle className="h-4 w-4 text-destructive" />
                Never treated for {passport.neverTreated.map(diseaseLabel).join(", ")} despite rounds in this household.
              </div>
            )}
          </Card>

          {/* Dose history */}
          <Card className="p-4">
            <div className="mb-2 flex items-center gap-2">
              <Pill className="h-4 w-4 text-primary" />
              <h4 className="font-semibold text-foreground">Treatment history</h4>
              <Badge variant="outline">{mine.length}</Badge>
            </div>
            <div className="overflow-x-auto">
              <Table className="min-w-[680px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Round</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Disease</TableHead>
                    <TableHead>Outcome</TableHead>
                    <TableHead>Medicine</TableHead>
                    <TableHead className="text-right">Tablets</TableHead>
                    <TableHead>Watched</TableHead>
                    <TableHead>Side effect</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {mine.map((t, i) => {
                    const r = t.round_id ? roundById.get(t.round_id) : undefined;
                    return (
                      <TableRow key={t.id || i}>
                        <TableCell className="font-medium text-foreground">{r?.round_name || "—"}</TableCell>
                        <TableCell>{fmt(r?.round_date)}</TableCell>
                        <TableCell>{diseaseLabel(r?.disease)}</TableCell>
                        <TableCell>
                          {outcomeLabel(t.outcome)}
                          {t.outcome === "not_eligible" && (
                            <p className="text-xs text-muted-foreground">{notEligibleLabel(t.not_eligible_reason)}</p>
                          )}
                        </TableCell>
                        <TableCell>{t.drug || r?.drug || "—"}</TableCell>
                        <TableCell className="text-right">{t.tablets ?? "—"}</TableCell>
                        <TableCell>{t.outcome === "treated" ? (t.directly_observed ? "Yes" : "No") : "—"}</TableCell>
                        <TableCell className={cn(t.adverse_event_serious && "font-semibold text-destructive")}>
                          {t.adverse_event || "None"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {mine.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-muted-foreground">
                        No dose recorded against this person yet.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>

          {/* Morbidity management */}
          <Card className="p-4">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Stethoscope className="h-4 w-4 text-primary" />
              <h4 className="font-semibold text-foreground">Morbidity management &amp; disability prevention</h4>
              <Badge variant="outline">{morbidity.length}</Badge>
              <div className="flex-1" />
              {canManage && (
                <Button size="sm" className="gap-1" onClick={() => openMorbidity()}>
                  <Plus className="h-4 w-4" /> Record care
                </Button>
              )}
            </div>

            {(gaps.length > 0 || trend) && (
              <div className="mb-3 flex flex-wrap gap-2">
                {trend && (
                  <Badge variant="outline" className={cn("gap-1", trend.improving
                    ? "border-emerald-500/40 text-emerald-700"
                    : "border-amber-500/40 text-amber-700")}>
                    {trend.improving ? <ArrowDownRight className="h-3 w-3" /> : <ArrowUpRight className="h-3 w-3" />}
                    {Math.abs(trend.delta)} cm {trend.improving ? "smaller" : "larger"} since {fmt(trend.from)}
                  </Badge>
                )}
                {gaps.map((g) => (
                  <Badge key={g} variant="outline" className="gap-1 border-destructive/40 text-destructive">
                    <AlertTriangle className="h-3 w-3" /> {g}
                  </Badge>
                ))}
              </div>
            )}

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
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {morbidity.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell>{fmt(m.recorded_on)}</TableCell>
                      <TableCell className="font-medium text-foreground">{conditionLabel(m.condition)}</TableCell>
                      <TableCell>{stageLabel(m.stage)}</TableCell>
                      <TableCell>{m.affected_side || "—"}</TableCell>
                      <TableCell className="text-right">{m.limb_circumference_cm ?? "—"}</TableCell>
                      <TableCell className="text-right">{m.acute_attacks_last_year ?? "—"}</TableCell>
                      <TableCell>
                        {m.self_care_kit_issued ? "Kit issued" : "No kit"}
                        {m.self_care_trained ? " · trained" : ""}
                      </TableCell>
                      <TableCell>{surgeryLabel(m.surgery_status)}</TableCell>
                      <TableCell>{fmt(m.next_review_date)}</TableCell>
                      <TableCell className="text-right">
                        {canManage && (
                          <Button size="sm" variant="ghost" onClick={() => openMorbidity(m)}>Edit</Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {morbidity.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center text-muted-foreground">
                        No morbidity care recorded. Use “Record care” for lymphoedema, hydrocoele,
                        trichiasis or skin disease.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>

          <DialogFooter className="flex-wrap gap-2">
            {person.registered && onOpenRecord && (
              <Button variant="outline" className="gap-1" onClick={onOpenRecord}>
                <Activity className="h-4 w-4" /> Open full beneficiary record
              </Button>
            )}
            <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Morbidity entry */}
      <Dialog open={morbOpen} onOpenChange={setMorbOpen}>
        <DialogContent className="max-h-[88vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{draft.id ? "Edit morbidity care" : "Record morbidity care"} — {person.name}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-sm">Condition</Label>
              <Select value={draft.condition || "lymphoedema"} onValueChange={(v) => setDraft({ ...draft, condition: v })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent className="z-[1200] bg-popover">
                  {MORBIDITY_CONDITIONS.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm">Stage</Label>
              <Select value={draft.stage || "not_staged"} onValueChange={(v) => setDraft({ ...draft, stage: v })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent className="z-[1200] max-h-72 bg-popover">
                  {MORBIDITY_STAGES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm">Affected side</Label>
              <Select value={draft.affected_side || "left"} onValueChange={(v) => setDraft({ ...draft, affected_side: v })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent className="z-[1200] bg-popover">
                  {AFFECTED_SIDES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm">Limb circumference (cm)</Label>
              <Input
                type="number" step="0.1" className="mt-1"
                value={draft.limb_circumference_cm ?? ""}
                onChange={(e) => setDraft({
                  ...draft,
                  limb_circumference_cm: e.target.value === "" ? null : Number(e.target.value),
                })}
              />
            </div>
            <div>
              <Label className="text-sm">Acute attacks in the last year</Label>
              <Input
                type="number" min={0} className="mt-1"
                value={draft.acute_attacks_last_year ?? ""}
                onChange={(e) => setDraft({
                  ...draft,
                  acute_attacks_last_year: e.target.value === "" ? null : Number(e.target.value),
                })}
              />
            </div>
            <div>
              <Label className="text-sm">Surgery</Label>
              <Select value={draft.surgery_status || "not_required"} onValueChange={(v) => setDraft({ ...draft, surgery_status: v })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent className="z-[1200] bg-popover">
                  {SURGERY_STATUS.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm">Surgery date</Label>
              <Input
                type="date" className="mt-1" value={draft.surgery_date || ""}
                onChange={(e) => setDraft({ ...draft, surgery_date: e.target.value || null })}
              />
            </div>
            <div>
              <Label className="text-sm">Visit date</Label>
              <Input
                type="date" className="mt-1"
                value={draft.recorded_on || new Date().toISOString().slice(0, 10)}
                onChange={(e) => setDraft({ ...draft, recorded_on: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-sm">Next review</Label>
              <Input
                type="date" className="mt-1" value={draft.next_review_date || ""}
                onChange={(e) => setDraft({ ...draft, next_review_date: e.target.value || null })}
              />
            </div>
            <div className="flex items-center justify-between rounded-md border border-border p-3">
              <span className="text-sm font-medium text-foreground">Self-care kit issued</span>
              <Switch
                checked={!!draft.self_care_kit_issued}
                onCheckedChange={(v) => setDraft({ ...draft, self_care_kit_issued: v })}
              />
            </div>
            <div className="flex items-center justify-between rounded-md border border-border p-3">
              <span className="text-sm font-medium text-foreground">Self-care training given</span>
              <Switch
                checked={!!draft.self_care_trained}
                onCheckedChange={(v) => setDraft({ ...draft, self_care_trained: v })}
              />
            </div>
            <div className="sm:col-span-2">
              <Label className="text-sm">Notes</Label>
              <Textarea
                className="mt-1" rows={2} value={draft.notes || ""}
                onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
              />
            </div>
          </div>
          <Separator />
          <DialogFooter>
            <Button variant="outline" onClick={() => setMorbOpen(false)}>Cancel</Button>
            <Button
              disabled={saving}
              onClick={async () => { await onSaveMorbidity(draft); setMorbOpen(false); }}
            >
              {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} Save care record
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default PersonNtdPassport;

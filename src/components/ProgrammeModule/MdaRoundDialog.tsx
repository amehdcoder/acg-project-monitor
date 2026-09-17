// Person-level mass drug administration round entry.
//
// Household coverage totals are derived from the person rows recorded here, so
// what the dashboard reports can always be traced back to a named individual.

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { AlertTriangle, Loader2, Plus, Trash2, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BeneficiaryRow } from "@/lib/programmeModule/types";
import {
  DOSE_BASIS, MDA_OUTCOMES, MDA_ROUND_TYPES, NOT_ELIGIBLE_REASONS, NTD_DISEASES,
  tallyTreatments, validateRound,
  type HouseholdRow, type MdaRoundRow, type MdaTreatmentRow,
} from "@/lib/programmeModule/households";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  projectId: string;
  moduleId?: string;
  household: HouseholdRow;
  members: BeneficiaryRow[];
  existingRounds: MdaRoundRow[];
  /** Round being edited, if any. */
  round?: MdaRoundRow | null;
  /** Person rows already saved against the edited round. */
  roundTreatments?: MdaTreatmentRow[];
  saving?: boolean;
  onSave: (round: Partial<MdaRoundRow>, rows: MdaTreatmentRow[]) => Promise<void> | void;
}

const ageOf = (b: BeneficiaryRow): number | null => {
  const p = (b.profile || {}) as Record<string, unknown>;
  const direct = Number(p.age ?? p.age_years);
  if (Number.isFinite(direct) && direct > 0) return direct;
  const dob = String(p.date_of_birth || p.dob || "");
  if (dob) {
    const d = new Date(dob);
    if (!Number.isNaN(d.getTime())) {
      return Math.max(0, Math.floor((Date.now() - d.getTime()) / 31557600000));
    }
  }
  return null;
};

const sexOf = (b: BeneficiaryRow): string | null => {
  const p = (b.profile || {}) as Record<string, unknown>;
  const v = p.sex ?? p.gender;
  return v ? String(v) : null;
};

const blankRow = (
  projectId: string, moduleId: string | undefined, householdId: string,
  b?: BeneficiaryRow,
): MdaTreatmentRow => ({
  project_id: projectId,
  module_id: moduleId || null,
  household_id: householdId,
  beneficiary_id: b?.id || null,
  person_name: b?.full_name || "",
  age_years: b ? ageOf(b) : null,
  sex: b ? sexOf(b) : null,
  outcome: "treated",
  not_eligible_reason: null,
  drug: null,
  tablets: null,
  dose_basis: "height_pole",
  dose_value: null,
  directly_observed: true,
  adverse_event: null,
  adverse_event_serious: false,
  notes: null,
});

const MdaRoundDialog = ({
  open, onOpenChange, projectId, moduleId, household, members, existingRounds,
  round, roundTreatments, saving, onSave,
}: Props) => {
  const [draft, setDraft] = useState<Partial<MdaRoundRow>>({});
  const [rows, setRows] = useState<MdaTreatmentRow[]>([]);
  const [showErrors, setShowErrors] = useState(false);

  useEffect(() => {
    if (!open) return;
    setShowErrors(false);
    if (round) {
      setDraft({ ...round });
      setRows((roundTreatments || []).map((r) => ({ ...r })));
    } else {
      const d = NTD_DISEASES[0];
      setDraft({
        project_id: projectId,
        module_id: moduleId || null,
        household_id: household.id,
        round_name: "",
        round_date: new Date().toISOString().slice(0, 10),
        round_type: "annual",
        disease: d.value,
        drug: d.drug,
        community: household.village || null,
        revisit_done: false,
        unregistered_eligible: 0,
        unregistered_treated: 0,
        notes: null,
      });
      setRows(members.map((b) => ({
        ...blankRow(projectId, moduleId, household.id, b),
        drug: d.drug,
      })));
    }
  }, [open, round, roundTreatments, members, household, projectId, moduleId]);

  const { errors, warnings, tally } = useMemo(
    () => validateRound(draft, rows, existingRounds, round?.id),
    [draft, rows, existingRounds, round?.id],
  );

  const setRow = (i: number, patch: Partial<MdaTreatmentRow>) =>
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const submit = async () => {
    if (errors.length) { setShowErrors(true); return; }
    await onSave(draft, rows);
  };

  const field = (label: string, node: React.ReactNode) => (
    <div>
      <Label className="text-sm">{label}</Label>
      <div className="mt-1">{node}</div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {round ? "Edit treatment round" : "Record a treatment round"} — {household.name || household.household_code}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* Round details */}
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {field("Round name", (
              <Input
                placeholder="e.g. 2026 Round 1" value={draft.round_name || ""}
                onChange={(e) => setDraft({ ...draft, round_name: e.target.value })}
              />
            ))}
            {field("Visit date", (
              <Input
                type="date" value={draft.round_date || ""}
                onChange={(e) => setDraft({ ...draft, round_date: e.target.value })}
              />
            ))}
            {field("Round type", (
              <Select value={draft.round_type || "annual"} onValueChange={(v) => setDraft({ ...draft, round_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="z-[1200] bg-popover">
                  {MDA_ROUND_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            ))}
            {field("Disease", (
              <Select
                value={draft.disease || ""}
                onValueChange={(v) => {
                  const d = NTD_DISEASES.find((x) => x.value === v);
                  setDraft({ ...draft, disease: v, drug: d?.drug || draft.drug });
                  if (d?.drug) setRows((prev) => prev.map((r) => ({ ...r, drug: d.drug })));
                }}
              >
                <SelectTrigger><SelectValue placeholder="Choose a disease" /></SelectTrigger>
                <SelectContent className="z-[1200] bg-popover">
                  {NTD_DISEASES.map((d) => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
                </SelectContent>
              </Select>
            ))}
            {field("Medicine", (
              <Input value={draft.drug || ""} onChange={(e) => setDraft({ ...draft, drug: e.target.value })} />
            ))}
            {field("Batch number", (
              <Input value={draft.drug_batch || ""} onChange={(e) => setDraft({ ...draft, drug_batch: e.target.value })} />
            ))}
            {field("Medicine expiry", (
              <Input
                type="date" value={draft.drug_expiry || ""}
                onChange={(e) => setDraft({ ...draft, drug_expiry: e.target.value })}
              />
            ))}
            {field("Distributor (CDD)", (
              <Input value={draft.distributor_name || ""} onChange={(e) => setDraft({ ...draft, distributor_name: e.target.value })} />
            ))}
            {field("Supervisor", (
              <Input value={draft.supervisor_name || ""} onChange={(e) => setDraft({ ...draft, supervisor_name: e.target.value })} />
            ))}
            {field("Community", (
              <Input value={draft.community || ""} onChange={(e) => setDraft({ ...draft, community: e.target.value })} />
            ))}
            <div className="flex items-center justify-between rounded-md border border-border p-3 sm:col-span-2 lg:col-span-1">
              <div>
                <p className="text-sm font-medium text-foreground">Revisit done</p>
                <p className="text-xs text-muted-foreground">Household called back for absentees.</p>
              </div>
              <Switch
                checked={Boolean(draft.revisit_done)}
                onCheckedChange={(v) => setDraft({ ...draft, revisit_done: v })}
              />
            </div>
          </section>

          <Separator />

          {/* Person register */}
          <section>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <h4 className="font-semibold text-foreground">Who was treated</h4>
              <Badge variant="outline">{rows.length} people</Badge>
              <div className="flex-1" />
              <Button
                size="sm" variant="outline" className="gap-1"
                onClick={() => setRows([...rows, { ...blankRow(projectId, moduleId, household.id), drug: draft.drug || null }])}
              >
                <Plus className="h-4 w-4" /> Add a person
              </Button>
            </div>

            <div className="space-y-3">
              {rows.map((r, i) => (
                <div key={i} className="rounded-lg border border-border p-3">
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {field("Name", (
                      <Input
                        value={r.person_name}
                        disabled={Boolean(r.beneficiary_id)}
                        onChange={(e) => setRow(i, { person_name: e.target.value })}
                      />
                    ))}
                    {field("Age", (
                      <Input
                        type="number" min={0} value={r.age_years ?? ""}
                        onChange={(e) => setRow(i, { age_years: e.target.value === "" ? null : Number(e.target.value) })}
                      />
                    ))}
                    {field("Sex", (
                      <Select value={r.sex || "unknown"} onValueChange={(v) => setRow(i, { sex: v === "unknown" ? null : v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent className="z-[1200] bg-popover">
                          <SelectItem value="unknown">Not recorded</SelectItem>
                          <SelectItem value="female">Female</SelectItem>
                          <SelectItem value="male">Male</SelectItem>
                        </SelectContent>
                      </Select>
                    ))}
                    {field("Outcome", (
                      <Select value={r.outcome} onValueChange={(v) => setRow(i, { outcome: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent className="z-[1200] bg-popover">
                          {MDA_OUTCOMES.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    ))}

                    {r.outcome === "not_eligible" && field("Reason not eligible", (
                      <Select
                        value={r.not_eligible_reason || ""}
                        onValueChange={(v) => setRow(i, { not_eligible_reason: v })}
                      >
                        <SelectTrigger><SelectValue placeholder="Choose a reason" /></SelectTrigger>
                        <SelectContent className="z-[1200] bg-popover">
                          {NOT_ELIGIBLE_REASONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    ))}

                    {r.outcome === "treated" && (
                      <>
                        {field("Tablets given", (
                          <Input
                            type="number" min={0} value={r.tablets ?? ""}
                            onChange={(e) => setRow(i, { tablets: e.target.value === "" ? null : Number(e.target.value) })}
                          />
                        ))}
                        {field("Dose measured by", (
                          <Select value={r.dose_basis || "height_pole"} onValueChange={(v) => setRow(i, { dose_basis: v })}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent className="z-[1200] bg-popover">
                              {DOSE_BASIS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        ))}
                        {field("Height (cm) / weight (kg)", (
                          <Input
                            type="number" min={0} value={r.dose_value ?? ""}
                            onChange={(e) => setRow(i, { dose_value: e.target.value === "" ? null : Number(e.target.value) })}
                          />
                        ))}
                        {field("Side effect noticed", (
                          <Input
                            placeholder="None" value={r.adverse_event || ""}
                            onChange={(e) => setRow(i, { adverse_event: e.target.value || null })}
                          />
                        ))}
                      </>
                    )}
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-4">
                    {r.outcome === "treated" && (
                      <label className="flex items-center gap-2 text-sm text-foreground">
                        <Switch
                          checked={r.directly_observed}
                          onCheckedChange={(v) => setRow(i, { directly_observed: v })}
                        />
                        Swallowing directly observed
                      </label>
                    )}
                    {r.adverse_event && (
                      <label className="flex items-center gap-2 text-sm text-foreground">
                        <Switch
                          checked={r.adverse_event_serious}
                          onCheckedChange={(v) => setRow(i, { adverse_event_serious: v })}
                        />
                        Serious side effect
                      </label>
                    )}
                    <div className="flex-1" />
                    <Button size="sm" variant="ghost" className="gap-1 text-destructive"
                      onClick={() => setRows(rows.filter((_, idx) => idx !== i))}>
                      <Trash2 className="h-4 w-4" /> Remove
                    </Button>
                  </div>
                </div>
              ))}
              {rows.length === 0 && (
                <p className="rounded-md border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
                  No people recorded yet. Add household members, or enter unregistered members below.
                </p>
              )}
            </div>
          </section>

          <Separator />

          {/* Unregistered members */}
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {field("Other household members eligible", (
              <Input
                type="number" min={0} value={draft.unregistered_eligible ?? 0}
                onChange={(e) => setDraft({ ...draft, unregistered_eligible: Number(e.target.value) || 0 })}
              />
            ))}
            {field("Other household members treated", (
              <Input
                type="number" min={0} value={draft.unregistered_treated ?? 0}
                onChange={(e) => setDraft({ ...draft, unregistered_treated: Number(e.target.value) || 0 })}
              />
            ))}
            {field("Notes", (
              <Textarea
                rows={2} value={draft.notes || ""}
                onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
              />
            ))}
          </section>

          {/* Live tally */}
          <div className="grid gap-3 rounded-lg border border-border bg-muted/40 p-3 sm:grid-cols-5">
            {[
              ["Eligible", tally.eligible], ["Treated", tally.treated],
              ["Absent", tally.absent], ["Refused", tally.refused],
              ["Coverage", `${tally.percent}%`],
            ].map(([label, value]) => (
              <div key={String(label)}>
                <p className="text-xs uppercase text-muted-foreground">{label}</p>
                <p className="text-lg font-semibold text-foreground">{value}</p>
              </div>
            ))}
          </div>

          {showErrors && errors.length > 0 && (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3">
              {errors.map((e) => (
                <p key={e} className="flex items-start gap-2 text-sm text-destructive">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {e}
                </p>
              ))}
            </div>
          )}
          {warnings.length > 0 && (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3">
              {warnings.map((w) => (
                <p key={w} className="flex items-start gap-2 text-sm text-amber-700">
                  <Info className="mt-0.5 h-4 w-4 shrink-0" /> {w}
                </p>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            disabled={saving}
            className={cn(showErrors && errors.length > 0 && "opacity-70")}
            onClick={() => void submit()}
          >
            {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            {round ? "Save changes" : "Save round"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default MdaRoundDialog;

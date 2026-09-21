// Livelihood & economic empowerment targeting.
//
// Set up an opportunity with the number of places available, then let the
// device rank the whole register the way a livelihood committee would: most
// vulnerable first, inclusion floors honoured, one place per household, people
// without consent or with an open safeguarding concern held back.

import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Briefcase, Plus, Loader2, Download, Search, Sparkles, ClipboardCheck,
  ShieldCheck, Brain, MapPinned,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { toneClasses } from "@/lib/programmeModule/defaults";
import type { BeneficiaryRow } from "@/lib/programmeModule/types";
import { useMorbidityRecords } from "@/lib/programmeModule/morbidity";
import {
  BAND_LABELS, BAND_TONE, DECISIONS, OPPORTUNITY_TYPES,
  buildShortlist, saveOpportunity, scoreLivelihood, setAssessmentDecision,
  useLivelihoodAssessments, useLivelihoodOpportunities,
  type LivelihoodOpportunityRow, type TargetingResult,
} from "@/lib/programmeModule/livelihood";
import {
  FINDINGS, applyCalibration, learnFromVerifications, useLivelihoodVerifications,
  verificationQueue, type AdjustedResult,
} from "@/lib/programmeModule/livelihoodVerification";
import LivelihoodAssessmentDialog from "./LivelihoodAssessmentDialog";
import LivelihoodVerificationDialog from "./LivelihoodVerificationDialog";
import GeoCascadeFields from "./GeoCascadeFields";
import { useFacilities } from "@/lib/programmeModule/facilities";
import { haversineKm } from "@/lib/microplanning/distance";

interface Props {
  projectId: string;
  moduleId?: string;
  beneficiaries: BeneficiaryRow[];
  canManage?: boolean;
  /** People allowed to complete the vulnerability assessment form. */
  canAssess?: boolean;
  /** People allowed to verify a shortlisted person on the ground. */
  canVerify?: boolean;
  onOpenBeneficiary?: (b: BeneficiaryRow) => void;
}

const STAGE_NUMBER = (stage?: string | null) => {
  const m = /stage_(\d)/.exec(String(stage || ""));
  return m ? Number(m[1]) : null;
};

const daysSince = (d?: string | null) => {
  if (!d) return null;
  const t = new Date(d).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.floor((Date.now() - t) / 86_400_000);
};

const sameName = (a?: string | null, b?: string | null) =>
  String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();

const emptyOpportunity = {
  title: "",
  partner: "",
  opportunity_type: "cash_grant",
  target_beneficiaries: 20,
  state: "",
  lga: "",
  ward: "",
  community: "",
  start_date: "",
  quota_women_pct: 50,
  quota_disability_pct: 20,
  one_per_household: true,
  status: "planned",
  notes: "",
};

const LivelihoodPanel = ({
  projectId, moduleId, beneficiaries, canManage = false, canAssess = true, canVerify = true,
  onOpenBeneficiary,
}: Props) => {
  const { toast } = useToast();
  const { opportunities, reload: reloadOpportunities } = useLivelihoodOpportunities(projectId);
  const { byBeneficiary, reload: reloadAssessments } = useLivelihoodAssessments(projectId);
  const { verifications, reload: reloadVerifications } = useLivelihoodVerifications(projectId);
  const { records: morbidity } = useMorbidityRecords(projectId) as unknown as {
    records: { beneficiary_id: string | null; stage: string | null; acute_attacks_last_year: number | null; surgery_status: string | null }[];
  };

  const [opportunityId, setOpportunityId] = useState<string>("");
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<Record<string, unknown>>({ ...emptyOpportunity });
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [assessing, setAssessing] = useState<BeneficiaryRow | null>(null);
  const [verifying, setVerifying] = useState<AdjustedResult | null>(null);

  useEffect(() => {
    if (!opportunityId && opportunities.length) setOpportunityId(opportunities[0].id);
  }, [opportunities, opportunityId]);

  const opportunity: LivelihoodOpportunityRow | undefined =
    opportunities.find((o) => o.id === opportunityId);

  /** Clinical signals per person, so nobody scores zero for a blank form. */
  const clinical = useMemo(() => {
    const map = new Map<string, { stage: number | null; attacks: number; surgery: boolean }>();
    for (const r of morbidity || []) {
      if (!r.beneficiary_id) continue;
      const cur = map.get(r.beneficiary_id) || { stage: null, attacks: 0, surgery: false };
      const s = STAGE_NUMBER(r.stage);
      if (s && (cur.stage == null || s > cur.stage)) cur.stage = s;
      cur.attacks = Math.max(cur.attacks, Number(r.acute_attacks_last_year || 0));
      if (r.surgery_status === "referred" || r.surgery_status === "scheduled") cur.surgery = true;
      map.set(r.beneficiary_id, cur);
    }
    return map;
  }, [morbidity]);

  const signalsFor = (b: BeneficiaryRow) => {
    const c = clinical.get(b.id);
    const overdue = daysSince(b.next_follow_up_date);
    const missed = overdue == null || overdue <= 0 ? 0 : overdue > 90 ? 2 : overdue > 30 ? 1 : 0;
    return {
      morbidityStage: c?.stage ?? null,
      acuteAttacks: c?.attacks ?? null,
      surgeryPending: c?.surgery ?? false,
      missedVisits: missed,
    };
  };

  /* ---- Distance: how far people really are from care and from the venue -- */
  const { facilities } = useFacilities(projectId);
  const facilityPoint = useMemo(() => {
    const m = new Map<string, [number, number]>();
    for (const f of facilities) {
      if (f.latitude != null && f.longitude != null) m.set(f.id, [f.latitude, f.longitude]);
    }
    return m;
  }, [facilities]);

  /** Venue point: the recorded venue if given, otherwise the centre of the
   *  registered homes in the area the opportunity covers. */
  const venuePoint = useMemo<[number, number] | null>(() => {
    if (!opportunity) return null;
    if (opportunity.venue_latitude != null && opportunity.venue_longitude != null) {
      return [opportunity.venue_latitude, opportunity.venue_longitude];
    }
    const inArea = beneficiaries.filter((b) =>
      b.latitude != null && b.longitude != null
      && (!opportunity.state || sameName(b.state, opportunity.state))
      && (!opportunity.lga || sameName(b.lga, opportunity.lga))
      && (!opportunity.ward || sameName(b.ward, opportunity.ward)));
    if (!inArea.length) return null;
    const lat = inArea.reduce((a, b) => a + Number(b.latitude), 0) / inArea.length;
    const lng = inArea.reduce((a, b) => a + Number(b.longitude), 0) / inArea.length;
    return [lat, lng];
  }, [opportunity, beneficiaries]);

  const geoFor = (b: BeneficiaryRow) => {
    const home: [number, number] | null =
      b.latitude != null && b.longitude != null ? [Number(b.latitude), Number(b.longitude)] : null;
    const fac = b.facility_id ? facilityPoint.get(b.facility_id) : undefined;
    const round1 = (n: number) => Math.round(n * 10) / 10;
    // Where the assessment says the person lives now wins over the registration record.
    const ans = (byBeneficiary.get(b.id)?.answers as Record<string, unknown>) || {};
    const pick = (key: string, fallback?: string | null) =>
      String(ans[key] ?? "").trim() || fallback || "";
    const state = pick("res_state", b.state);
    const lga = pick("res_lga", b.lga);
    const ward = pick("res_ward", b.ward);
    const locationTier: "ward" | "lga" | "state" | "outside" | null = !opportunity
      ? null
      : opportunity.ward && sameName(ward, opportunity.ward) ? "ward"
        : opportunity.lga && sameName(lga, opportunity.lga) ? "lga"
          : opportunity.state && sameName(state, opportunity.state) ? "state"
            : opportunity.state || opportunity.lga || opportunity.ward ? "outside" : null;
    return {
      distanceToFacilityKm: home && fac ? round1(haversineKm(home[0], home[1], fac[0], fac[1])) : null,
      distanceToOpportunityKm: home && venuePoint
        ? round1(haversineKm(home[0], home[1], venuePoint[0], venuePoint[1])) : null,
      opportunityType: opportunity?.opportunity_type ?? null,
      locationTier,
    };
  };

  const rawResults: TargetingResult[] = useMemo(
    () => beneficiaries.map((b) => scoreLivelihood({
      beneficiary: b,
      answers: (byBeneficiary.get(b.id)?.answers as Record<string, unknown>) || {},
      ...signalsFor(b),
      ...geoFor(b),
    })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [beneficiaries, byBeneficiary, clinical, opportunity, facilityPoint, venuePoint],
  );

  /** What the ground visits have taught the system so far. */
  const calibration = useMemo(() => {
    const byId = new Map(rawResults.map((r) => [r.beneficiaryId, r]));
    return learnFromVerifications(
      verifications,
      (id) => byId.get(id)?.community || "—",
      (id) => byId.get(id)?.completeness ?? 0,
    );
  }, [verifications, rawResults]);

  /** Scores after the system corrects itself against what verifiers found. */
  const results: AdjustedResult[] = useMemo(
    () => rawResults.map((r) => applyCalibration(r, calibration)),
    [rawResults, calibration],
  );

  const locationById = useMemo(() => {
    const m = new Map<string, BeneficiaryRow>();
    for (const b of beneficiaries) m.set(b.id, b);
    return m;
  }, [beneficiaries]);

  const outcome = useMemo(() => {
    if (!opportunity) return null;
    return buildShortlist(results, {
      target: opportunity.target_beneficiaries,
      quotaWomenPct: opportunity.quota_women_pct,
      quotaDisabilityPct: opportunity.quota_disability_pct,
      onePerHousehold: opportunity.one_per_household,
      state: opportunity.state,
      lga: opportunity.lga,
      ward: opportunity.ward,
    }, (r) => {
      const b = locationById.get(r.beneficiaryId);
      return { state: b?.state, lga: b?.lga, ward: b?.ward };
    });
  }, [opportunity, results, locationById]);

  /** Who a verifier should be sent to next. */
  const queue = useMemo(() => {
    if (!outcome || !opportunity) return [];
    const ranked = [...outcome.selected, ...outcome.waitlist].map((e) => e.result as AdjustedResult);
    return verificationQueue(ranked, opportunity.target_beneficiaries, calibration).slice(0, 8);
  }, [outcome, opportunity, calibration]);

  const filtered = (rows: { result: TargetingResult }[]) => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      r.result.name.toLowerCase().includes(q) || r.result.caseId.toLowerCase().includes(q));
  };

  const submitOpportunity = async () => {
    if (!String(form.title || "").trim()) {
      toast({ title: "Give the opportunity a title", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await saveOpportunity({
        ...(form as Record<string, unknown>),
        project_id: projectId,
        module_id: moduleId || null,
        title: String(form.title),
        target_beneficiaries: Number(form.target_beneficiaries) || 1,
        quota_women_pct: Number(form.quota_women_pct) || 0,
        quota_disability_pct: Number(form.quota_disability_pct) || 0,
        start_date: String(form.start_date || "") || null,
      } as never);
      toast({ title: "Opportunity saved" });
      setFormOpen(false);
      setForm({ ...emptyOpportunity });
      await reloadOpportunities();
    } catch (e) {
      toast({
        title: "Could not save",
        description: e instanceof Error ? e.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const decide = async (beneficiaryId: string, decision: string) => {
    const row = byBeneficiary.get(beneficiaryId);
    if (!row) {
      toast({
        title: "Assess this person first",
        description: "Open the assessment so the decision is recorded against a score.",
      });
      return;
    }
    await setAssessmentDecision(row.id, decision);
    await reloadAssessments();
  };

  const exportCsv = () => {
    if (!outcome) return;
    const head = ["Rank", "Case ID", "Name", "Community", "Vulnerability", "Readiness", "Band",
      "Preferred livelihood", "Why they chose it", "Preference match %", "Km to facility",
      "Km to venue", "Basis", "Package", "List"];
    const line = (e: { rank: number; basis: string; result: TargetingResult }, list: string) => [
      e.rank, e.result.caseId, e.result.name, e.result.community,
      e.result.vulnerability, e.result.readiness, BAND_LABELS[e.result.band],
      e.result.preferenceLabel || "", e.result.preferenceNarrative || e.result.preferenceReason || "",
      e.result.preferenceFit, e.result.distanceToFacilityKm ?? "",
      e.result.distanceToOpportunityKm ?? "", e.basis, e.result.package, list,
    ];
    const rows = [
      ...outcome.selected.map((e) => line(e, "Selected")),
      ...outcome.waitlist.map((e) => line(e, "Waitlist")),
    ];
    const csv = [head, ...rows]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `livelihood-shortlist-${opportunity?.title || "list"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const renderRow = (entry: { result: AdjustedResult; rank: number; basis: string }, list: string) => {
    const b = locationById.get(entry.result.beneficiaryId);
    const assessed = byBeneficiary.get(entry.result.beneficiaryId);
    const v = entry.result.verification;
    const findingLabel = v ? FINDINGS.find((f) => f.value === v.finding)?.label || v.finding : null;
    return (
      <TableRow key={list + entry.result.beneficiaryId}>
        <TableCell className="tabular-nums">{entry.rank}</TableCell>
        <TableCell>
          <button
            className="text-left font-medium hover:underline"
            onClick={() => b && onOpenBeneficiary?.(b)}
          >
            {entry.result.name}
          </button>
          <p className="text-xs text-muted-foreground">{entry.result.caseId} · {entry.result.community}</p>
        </TableCell>
        <TableCell>
          <Badge className={cn("border", toneClasses[BAND_TONE[entry.result.band]])}>
            {entry.result.vulnerability}
          </Badge>
          {entry.result.adjustment !== 0 && (
            <p className="mt-1 text-[10px] text-muted-foreground">
              was {entry.result.predicted} ({entry.result.adjustment > 0 ? "+" : ""}{entry.result.adjustment})
            </p>
          )}
        </TableCell>
        <TableCell className="tabular-nums text-muted-foreground">{entry.result.readiness}</TableCell>
        <TableCell className="text-xs">
          {v ? (
            <Badge variant="outline" className="text-[10px]">{findingLabel}</Badge>
          ) : (
            <span className="text-muted-foreground">Not verified</span>
          )}
          <p className="mt-1 text-[10px] text-muted-foreground">{entry.result.certainty}% sure</p>
        </TableCell>
        <TableCell className="max-w-[18rem] text-xs text-muted-foreground">
          {entry.basis}
          {entry.result.preferenceLabel && (
            <span className="mt-1 block text-[11px] text-foreground">
              Wants: {entry.result.preferenceLabel} · match {entry.result.preferenceFit}%
            </span>
          )}
          {entry.result.preferenceNotes.map((n) => (
            <span key={n} className="mt-1 block text-[11px]">{n}</span>
          ))}
          {entry.result.distanceToFacilityKm != null && (
            <span className="mt-1 block text-[11px]">
              {entry.result.distanceToFacilityKm} km from their facility
            </span>
          )}
          {entry.result.adjustmentReasons.map((r) => (
            <span key={r} className="mt-1 block text-[11px]">{r}</span>
          ))}
          {entry.result.flags.length > 0 && (
            <span className="mt-1 flex flex-wrap gap-1">
              {entry.result.flags.map((f) => (
                <Badge key={f} variant="outline" className="text-[10px]">{f}</Badge>
              ))}
            </span>
          )}
        </TableCell>
        <TableCell className="text-xs">{entry.result.completeness}%</TableCell>
        <TableCell className="text-right">
          <div className="flex flex-wrap justify-end gap-1">
            {(canAssess || canManage) && (
              <Button size="sm" variant="outline" className="gap-1" onClick={() => b && setAssessing(b)}>
                <ClipboardCheck className="h-3.5 w-3.5" /> {assessed ? "Review" : "Assess"}
              </Button>
            )}
            {(canVerify || canManage) && (
              <Button
                size="sm"
                variant={v ? "outline" : "secondary"}
                className="gap-1"
                onClick={() => setVerifying(entry.result)}
              >
                <ShieldCheck className="h-3.5 w-3.5" /> {v ? "Re-verify" : "Verify"}
              </Button>
            )}
            {canManage && (
              <Select
                value={assessed?.decision || ""}
                onValueChange={(v) => void decide(entry.result.beneficiaryId, v)}
              >
                <SelectTrigger className="h-8 w-[9.5rem] text-xs"><SelectValue placeholder="Decision" /></SelectTrigger>
                <SelectContent className="z-[120]">
                  {DECISIONS.map((d) => (
                    <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </TableCell>
      </TableRow>
    );
  };

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-end justify-between gap-3 p-4">
        <div className="space-y-1">
          <p className="flex items-center gap-2 font-semibold">
            <Briefcase className="h-4 w-4" /> Livelihood & empowerment targeting
          </p>
          <p className="max-w-2xl text-xs text-muted-foreground">
            The register is scored on economic deprivation, dependency, disease and disability burden,
            exclusion and shocks — using registration details, the condition and follow-up behaviour —
            then matched to the number of places the opportunity has.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {opportunities.length > 0 && (
            <Select value={opportunityId} onValueChange={setOpportunityId}>
              <SelectTrigger className="w-[16rem]"><SelectValue placeholder="Choose opportunity" /></SelectTrigger>
              <SelectContent className="z-[120]">
                {opportunities.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.title} · {o.target_beneficiaries} places
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {canManage && (
            <Button size="sm" className="gap-1" onClick={() => { setForm({ ...emptyOpportunity }); setFormOpen(true); }}>
              <Plus className="h-4 w-4" /> New opportunity
            </Button>
          )}
          {outcome && (
            <Button size="sm" variant="outline" className="gap-1" onClick={exportCsv}>
              <Download className="h-4 w-4" /> Export
            </Button>
          )}
        </div>
      </Card>

      {!opportunity && (
        <Card className="p-10 text-center text-sm text-muted-foreground">
          No livelihood opportunity set up yet. Add one with the number of places available and the
          shortlist builds itself.
        </Card>
      )}

      {opportunity && outcome && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: "Places available", value: outcome.summary.target },
              { label: "Selected", value: outcome.summary.selected },
              {
                label: "Women",
                value: `${outcome.summary.women} (${outcome.summary.womenPct}%)`,
                warn: !outcome.summary.quotaWomenMet,
              },
              {
                label: "Persons with disabilities",
                value: `${outcome.summary.disability} (${outcome.summary.disabilityPct}%)`,
                warn: !outcome.summary.quotaDisabilityMet,
              },
            ].map((k) => (
              <Card key={k.label} className="p-3">
                <p className="text-xs text-muted-foreground">{k.label}</p>
                <p className={cn("text-2xl font-semibold tabular-nums", k.warn && "text-destructive")}>
                  {k.value}
                </p>
              </Card>
            ))}
          </div>

          <Card className="flex flex-wrap items-center gap-3 p-3 text-xs text-muted-foreground">
            <Sparkles className="h-4 w-4" />
            <span>
              Mean vulnerability of the selected list is {outcome.summary.meanVulnerability}/100 across{" "}
              {outcome.summary.communities} communities. {outcome.summary.ownChoice} of{" "}
              {outcome.summary.selected} asked for this livelihood themselves (average match{" "}
              {outcome.summary.meanPreferenceFit}%)
              {outcome.summary.meanDistanceKm != null
                && `, living on average ${outcome.summary.meanDistanceKm} km from where it runs`}
              {outcome.summary.farFromVenue > 0
                && ` — ${outcome.summary.farFromVenue} further than they said they can travel`}.{" "}
              {outcome.waitlist.length} on the waitlist, {outcome.excluded.length} held back.
            </span>
          </Card>

          <div className="grid gap-3 lg:grid-cols-2">
            <Card className="space-y-2 p-4">
              <p className="flex items-center gap-2 font-semibold">
                <Brain className="h-4 w-4" /> What the system has learned on the ground
              </p>
              <div className="flex flex-wrap gap-2 text-xs">
                <Badge variant="outline">{calibration.visits} verified</Badge>
                <Badge variant="outline">{Math.round(calibration.agreement * 100)}% matched the record</Badge>
                <Badge variant="outline">{calibration.confidence}% confidence in its own correction</Badge>
              </div>
              <ul className="list-disc space-y-1 pl-4 text-xs text-muted-foreground">
                {calibration.lessons.map((l) => <li key={l}>{l}</li>)}
              </ul>
            </Card>

            <Card className="space-y-2 p-4">
              <p className="flex items-center gap-2 font-semibold">
                <MapPinned className="h-4 w-4" /> Verify these next
              </p>
              <p className="text-xs text-muted-foreground">
                Names where being wrong would change who gets a place.
              </p>
              {queue.length === 0 ? (
                <p className="text-xs text-muted-foreground">Everyone on the list has been verified.</p>
              ) : (
                <ul className="space-y-1 text-xs">
                  {queue.map((q) => (
                    <li key={q.result.beneficiaryId} className="flex items-center justify-between gap-2">
                      <span>
                        <span className="font-medium">{q.result.name}</span>
                        <span className="text-muted-foreground"> — {q.why}</span>
                      </span>
                      {(canVerify || canManage) && (
                        <Button size="sm" variant="ghost" className="h-7 gap-1 px-2"
                          onClick={() => setVerifying(q.result)}>
                          <ShieldCheck className="h-3.5 w-3.5" /> Verify
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          <Card className="space-y-3 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold">Selected — {outcome.selected.length} of {outcome.summary.target} places</p>
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  className="w-[14rem] pl-8" placeholder="Search name or Case ID"
                  value={search} onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Beneficiary</TableHead>
                    <TableHead>Vuln.</TableHead>
                    <TableHead>Ready</TableHead>
                    <TableHead>Ground check</TableHead>
                    <TableHead>Why</TableHead>
                    <TableHead>Assessed</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered(outcome.selected).map((e) => renderRow(e as never, "sel"))}
                  {outcome.selected.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-sm text-muted-foreground">
                        Nobody qualifies yet — register beneficiaries or complete assessments.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            {outcome.waitlist.length > 0 && (
              <>
                <Separator />
                <p className="font-semibold">Waitlist — next in line</p>
                <div className="overflow-x-auto">
                  <Table>
                    <TableBody>
                      {filtered(outcome.waitlist).slice(0, 25).map((e) => renderRow(e as never, "wait"))}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}

            {outcome.excluded.length > 0 && (
              <>
                <Separator />
                <p className="font-semibold">Held back</p>
                <ul className="space-y-1 text-xs text-muted-foreground">
                  {outcome.excluded.slice(0, 20).map((x) => (
                    <li key={x.result.beneficiaryId}>
                      <span className="font-medium text-foreground">{x.result.name}</span> — {x.why}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Card>
        </>
      )}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader><DialogTitle>Livelihood opportunity</DialogTitle></DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1 sm:col-span-2">
              <Label className="text-xs">Title</Label>
              <Input
                value={String(form.title || "")}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="e.g. 2026 petty trade start-up grant"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Implementing partner</Label>
              <Input value={String(form.partner || "")} onChange={(e) => setForm({ ...form, partner: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Type of support</Label>
              <Select
                value={String(form.opportunity_type || "")}
                onValueChange={(v) => setForm({ ...form, opportunity_type: v })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="z-[120]">
                  {OPPORTUNITY_TYPES.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Places available</Label>
              <Input
                type="number" min={1}
                value={String(form.target_beneficiaries ?? "")}
                onChange={(e) => setForm({ ...form, target_beneficiaries: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Start date</Label>
              <Input
                type="date" value={String(form.start_date || "")}
                onChange={(e) => setForm({ ...form, start_date: e.target.value })}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label className="text-xs">Where the opportunity runs (optional filter)</Label>
              <GeoCascadeFields
                value={{
                  state: String(form.state || ""),
                  lga: String(form.lga || ""),
                  ward: String(form.ward || ""),
                  community: String(form.community || ""),
                }}
                onChange={(patch) => setForm({
                  ...form,
                  state: patch.state ?? "",
                  lga: patch.lga ?? "",
                  ward: patch.ward ?? "",
                  community: patch.community ?? "",
                })}
                communityLabel="Community / venue"
              />
              <p className="text-[11px] text-muted-foreground">
                Leave a level blank to cover everywhere below it. Travel distance is measured from
                each person's home to this area.
              </p>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Minimum women (%)</Label>
              <Input
                type="number" min={0} max={100}
                value={String(form.quota_women_pct ?? "")}
                onChange={(e) => setForm({ ...form, quota_women_pct: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Minimum persons with disabilities (%)</Label>
              <Input
                type="number" min={0} max={100}
                value={String(form.quota_disability_pct ?? "")}
                onChange={(e) => setForm({ ...form, quota_disability_pct: e.target.value })}
              />
            </div>
            <div className="flex items-center justify-between rounded-md border p-3 sm:col-span-2">
              <div>
                <p className="text-sm font-medium">One place per household</p>
                <p className="text-xs text-muted-foreground">Spreads the benefit across more families.</p>
              </div>
              <Switch
                checked={Boolean(form.one_per_household)}
                onCheckedChange={(v) => setForm({ ...form, one_per_household: v })}
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label className="text-xs">Notes</Label>
              <Textarea
                rows={3} value={String(form.notes || "")}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button onClick={() => void submitOpportunity()} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <LivelihoodAssessmentDialog
        open={Boolean(assessing)}
        onOpenChange={(v) => { if (!v) setAssessing(null); }}
        projectId={projectId}
        moduleId={moduleId}
        beneficiary={assessing}
        existing={assessing ? byBeneficiary.get(assessing.id) : null}
        signals={assessing ? signalsFor(assessing) : undefined}
        opportunityId={opportunityId || null}
        onSaved={() => void reloadAssessments()}
      />

      <LivelihoodVerificationDialog
        open={Boolean(verifying)}
        onOpenChange={(v) => { if (!v) setVerifying(null); }}
        projectId={projectId}
        moduleId={moduleId}
        opportunityId={opportunityId || null}
        beneficiary={verifying ? locationById.get(verifying.beneficiaryId) || null : null}
        predicted={verifying?.predicted ?? 0}
        assessmentId={verifying ? byBeneficiary.get(verifying.beneficiaryId)?.id || null : null}
        existing={verifying?.verification || null}
        onSaved={() => void reloadVerifications()}
      />
    </div>
  );
};

export default LivelihoodPanel;

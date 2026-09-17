// CDD case search for MMDP — CDD register, potential cases, clinician
// confirmation, and registration or referral of confirmed cases.

import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  UserPlus, Plus, Search, Stethoscope, Send, CheckCircle2, Trash2, Pencil,
  Users, ClipboardList, Hospital, BadgeCheck, Award,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { toneClasses } from "@/lib/programmeModule/defaults";
import { URGENCY_OPTIONS, useFacilities, useMyFacilityAccess } from "@/lib/programmeModule/facilities";
import {
  CASE_STATUS_LABEL, CASE_STATUS_TONE, cddPerformance, caseSearchTotals,
  deleteCdd, deletePotentialCase, referPotentialCase, registerConfirmedCase,
  useCaseFilter, useCdds, usePotentialCases, withdrawCaseReferral,
  type CddRow, type PotentialCaseRow,
} from "@/lib/programmeModule/cddCaseSearch";
import { conditionLabel } from "@/lib/programmeModule/lesionVision";
import CddDialog from "./CddDialog";
import PotentialCaseDialog from "./PotentialCaseDialog";
import CaseConfirmationDialog from "./CaseConfirmationDialog";
import CddRewardsPanel from "./CddRewardsPanel";
import CddFacilityDashboard from "./CddFacilityDashboard";
import { pointsByCase, useCddPointsLedger } from "@/lib/programmeModule/cddRewards";

interface Props {
  projectId: string;
  moduleId?: string;
  /** Administrators and facility staff with recording rights. */
  canRecord?: boolean;
  /** Empty for administrators — otherwise the facilities the user belongs to. */
  allowedFacilityIds?: string[] | null;
  onBeneficiaryRegistered?: () => void;
}

const fmtDate = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" }) : "—";

const Metric = ({ label, value, hint }: { label: string; value: number | string; hint?: string }) => (
  <Card className="p-4">
    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
    <p className="mt-1 text-2xl font-semibold text-foreground">{value}</p>
    {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
  </Card>
);

const CddCaseSearchPanel = ({
  projectId, moduleId, canRecord = false, allowedFacilityIds = null, onBeneficiaryRegistered,
}: Props) => {
  const { toast } = useToast();
  const { facilities } = useFacilities(projectId);
  const { levels } = useMyFacilityAccess();
  const { cdds, reload: reloadCdds } = useCdds(projectId);
  const { cases, loading, reload: reloadCases } = usePotentialCases(projectId);
  const { ledger, reload: reloadLedger } = useCddPointsLedger(projectId);
  const casePoints = pointsByCase(ledger);
  // Points are credited by the database as a case moves, so refresh the ledger
  // whenever the case register changes.
  useEffect(() => { void reloadLedger(); }, [cases, reloadLedger]);

  const [cddOpen, setCddOpen] = useState(false);
  const [editingCdd, setEditingCdd] = useState<CddRow | null>(null);
  const [deleteCddRow, setDeleteCddRow] = useState<CddRow | null>(null);
  const [caseOpen, setCaseOpen] = useState(false);
  const [editingCase, setEditingCase] = useState<PotentialCaseRow | null>(null);
  const [deleteCaseRow, setDeleteCaseRow] = useState<PotentialCaseRow | null>(null);
  const [confirmCase, setConfirmCase] = useState<PotentialCaseRow | null>(null);
  /** Case just confirmed by a clinician, awaiting the keep-or-refer decision. */
  const [decisionCaseId, setDecisionCaseId] = useState("");
  const [referCase, setReferCase] = useState<PotentialCaseRow | null>(null);
  const [referTo, setReferTo] = useState("");
  const [referUrgency, setReferUrgency] = useState("routine");
  const [referSummary, setReferSummary] = useState("");
  const [busyId, setBusyId] = useState("");
  const [term, setTerm] = useState("");
  const [status, setStatus] = useState("all");

  const scoped = useMemo(() => {
    if (!allowedFacilityIds || allowedFacilityIds.length === 0) return cases;
    const allow = new Set(allowedFacilityIds);
    return cases.filter((c) =>
      allow.has(c.facility_id) || (c.referred_to_facility_id && allow.has(c.referred_to_facility_id)));
  }, [cases, allowedFacilityIds]);

  const scopedCdds = useMemo(() => {
    if (!allowedFacilityIds || allowedFacilityIds.length === 0) return cdds;
    const allow = new Set(allowedFacilityIds);
    return cdds.filter((c) => allow.has(c.facility_id));
  }, [cdds, allowedFacilityIds]);

  const visible = useCaseFilter(scoped, term, status);
  /** Cases a CDD has submitted that no clinician has reviewed yet. */
  const pendingQueue = useMemo(
    () => scoped.filter((c) => c.status === "pending")
      .sort((a, b) => String(a.case_date).localeCompare(String(b.case_date))),
    [scoped],
  );
  const decisionCase = useMemo(
    () => cases.find((c) => c.id === decisionCaseId) || null,
    [cases, decisionCaseId],
  );
  const totals = caseSearchTotals(scoped);

  const facilityName = (id?: string | null) =>
    facilities.find((f) => f.id === id)?.name || "—";
  const cddName = (id?: string | null) => {
    const c = cdds.find((x) => x.id === id);
    return c ? `${c.full_name}${c.cdd_code ? ` (${c.cdd_code})` : ""}` : "—";
  };

  /** A case referred to one of my facilities and waiting for me to accept it. */
  const isIncoming = (c: PotentialCaseRow) =>
    c.status === "referred" && !!c.referred_to_facility_id && !!levels[c.referred_to_facility_id];

  const canActOn = (c: PotentialCaseRow) =>
    canRecord && (!allowedFacilityIds || allowedFacilityIds.length === 0
      || levels[c.facility_id] === "record" || levels[c.facility_id] === "manage"
      || (c.referred_to_facility_id
        && ["record", "manage"].includes(levels[c.referred_to_facility_id] || "")));

  const register = async (c: PotentialCaseRow, facilityId: string) => {
    setBusyId(c.id);
    try {
      await registerConfirmedCase(c.id, facilityId);
      toast({
        title: "Beneficiary registered",
        description: `Case ID issued at ${facilityName(facilityId)}.`,
      });
      await reloadCases();
      onBeneficiaryRegistered?.();
    } catch (e) {
      toast({ title: "Could not register", description: (e as Error).message, variant: "destructive" });
    } finally {
      setBusyId("");
    }
  };

  const submitReferral = async () => {
    if (!referCase || !referTo) return;
    setBusyId(referCase.id);
    try {
      await referPotentialCase(referCase.id, {
        toFacilityId: referTo, urgency: referUrgency, summary: referSummary,
      });
      toast({
        title: "Case referred",
        description: "A Case ID will be issued when the receiving facility accepts it.",
      });
      setReferCase(null); setReferTo(""); setReferSummary(""); setReferUrgency("routine");
      await reloadCases();
    } catch (e) {
      toast({ title: "Could not refer", description: (e as Error).message, variant: "destructive" });
    } finally {
      setBusyId("");
    }
  };

  const withdraw = async (c: PotentialCaseRow) => {
    setBusyId(c.id);
    try {
      await withdrawCaseReferral(c.id);
      await reloadCases();
      toast({ title: "Referral withdrawn" });
    } catch (e) {
      toast({ title: "Could not withdraw", description: (e as Error).message, variant: "destructive" });
    } finally {
      setBusyId("");
    }
  };

  const removeCdd = async () => {
    if (!deleteCddRow) return;
    try {
      await deleteCdd(deleteCddRow.id);
      setDeleteCddRow(null);
      await reloadCdds();
      toast({ title: "CDD removed" });
    } catch (e) {
      toast({ title: "Could not remove", description: (e as Error).message, variant: "destructive" });
    }
  };

  const removeCase = async () => {
    if (!deleteCaseRow) return;
    try {
      await deletePotentialCase(deleteCaseRow.id);
      setDeleteCaseRow(null);
      await reloadCases();
      toast({ title: "Potential case removed" });
    } catch (e) {
      toast({ title: "Could not remove", description: (e as Error).message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-center gap-3 p-4">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Search className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h3 className="font-semibold text-foreground">CDD case search — MMDP</h3>
          <p className="text-xs text-muted-foreground">
            Cases found in the community by trained CDDs, confirmed by a clinician, then registered
            at a facility with a Case ID.
          </p>
        </div>
        <div className="flex-1" />
        {canRecord && (
          <>
            <Button
              variant="outline" size="sm" className="gap-1"
              onClick={() => { setEditingCdd(null); setCddOpen(true); }}
            >
              <UserPlus className="h-4 w-4" /> Register CDD
            </Button>
            <Button
              size="sm" className="gap-1"
              onClick={() => { setEditingCase(null); setCaseOpen(true); }}
            >
              <Plus className="h-4 w-4" /> Record potential case
            </Button>
          </>
        )}
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Metric label="CDDs" value={scopedCdds.filter((c) => c.is_active).length} hint="Active for case search" />
        <Metric label="Potential cases" value={totals.total} />
        <Metric label="Awaiting clinician" value={totals.pending} />
        <Metric label="Confirmed" value={totals.confirmed + totals.referred} hint="Not yet registered" />
        <Metric label="Registered" value={totals.registered} hint="Case ID issued" />
      </div>

      {/* Clinician review queue — the step between a CDD finding a case and it
          becoming a registered beneficiary. */}
      <Card className="p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Stethoscope className="h-4 w-4 text-primary" />
          <h4 className="font-semibold text-foreground">Clinician review queue</h4>
          <Badge variant="outline">{pendingQueue.length} waiting</Badge>
          <div className="flex-1" />
          <p className="text-xs text-muted-foreground">
            Review the CDD's pictures, stage the lesion, then confirm or rule the case out.
          </p>
        </div>
        {pendingQueue.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Nothing waiting for a clinician. New case-search findings appear here automatically.
          </p>
        ) : (
          <div className="space-y-2">
            {pendingQueue.map((c) => (
              <div
                key={c.id}
                className="flex flex-wrap items-center gap-3 rounded-lg border border-border p-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-foreground">
                    {c.full_name}
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      {conditionLabel(c.condition)} · {c.community || "—"}
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Found by {cddName(c.cdd_id)} · {fmtDate(c.case_date)} · {facilityName(c.facility_id)}
                  </p>
                </div>
                {canActOn(c) && (
                  <Button size="sm" className="gap-1" onClick={() => setConfirmCase(c)}>
                    <Stethoscope className="h-4 w-4" /> Review &amp; stage
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* CDD register */}
      <Card className="p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Users className="h-4 w-4 text-primary" />
          <h4 className="font-semibold text-foreground">CDDs trained for case search</h4>
          <Badge variant="outline">{scopedCdds.length}</Badge>
        </div>
        {scopedCdds.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No CDD registered yet. Facility staff register the CDDs working under their facility.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>CDD</TableHead>
                  <TableHead>Facility</TableHead>
                  <TableHead>Community</TableHead>
                  <TableHead>Training</TableHead>
                  <TableHead className="text-right">Found</TableHead>
                  <TableHead className="text-right">Confirmed</TableHead>
                  <TableHead className="text-right">Registered</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {scopedCdds.map((c) => {
                  const p = cddPerformance(scoped, c.id);
                  return (
                    <TableRow key={c.id}>
                      <TableCell>
                        <p className="font-medium text-foreground">{c.full_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {[c.cdd_code, c.phone].filter(Boolean).join(" · ") || "—"}
                        </p>
                      </TableCell>
                      <TableCell className="text-sm">{facilityName(c.facility_id)}</TableCell>
                      <TableCell className="text-sm">
                        {[c.community, c.ward].filter(Boolean).join(", ") || "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {c.training_status.replace(/_/g, " ")}
                        </Badge>
                        {!c.is_active && <Badge variant="outline" className="ml-1">Inactive</Badge>}
                      </TableCell>
                      <TableCell className="text-right">{p.found}</TableCell>
                      <TableCell className="text-right">{p.confirmed + p.referred + p.registered}</TableCell>
                      <TableCell className="text-right">{p.registered}</TableCell>
                      <TableCell className="text-right">
                        {canRecord && (
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost" size="sm" aria-label="Edit CDD"
                              onClick={() => { setEditingCdd(c); setCddOpen(true); }}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost" size="sm" aria-label="Remove CDD"
                              onClick={() => setDeleteCddRow(c)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      <CddFacilityDashboard
        cdds={scopedCdds} cases={scoped} facilities={facilities} ledger={ledger}
      />

      <CddRewardsPanel
        cdds={scopedCdds} cases={scoped} facilityName={facilityName} ledger={ledger}
      />

      {/* Potential cases */}
      <Card className="p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <ClipboardList className="h-4 w-4 text-primary" />
          <h4 className="font-semibold text-foreground">Potential cases from case search</h4>
          <div className="flex-1" />
          <Input
            className="h-9 w-[200px]" placeholder="Search name or community…"
            value={term} onChange={(e) => setTerm(e.target.value)}
          />
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="h-9 w-[220px]"><SelectValue /></SelectTrigger>
            <SelectContent className="z-[1200] bg-popover">
              <SelectItem value="all">All statuses</SelectItem>
              {Object.entries(CASE_STATUS_LABEL).map(([v, l]) => (
                <SelectItem key={v} value={v}>{l}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {loading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>
        ) : visible.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No potential case recorded yet.
          </p>
        ) : (
          <div className="space-y-3">
            {visible.map((c) => {
              const tone = CASE_STATUS_TONE[c.status];
              const incoming = isIncoming(c);
              const actable = canActOn(c);
              return (
                <div key={c.id} className="rounded-lg border border-border p-3">
                  <div className="flex flex-wrap items-start gap-3">
                    <div className="min-w-[220px] flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-foreground">{c.full_name}</p>
                        <Badge variant="outline" className={cn("border", toneClasses[tone])}>
                          {CASE_STATUS_LABEL[c.status]}
                        </Badge>
                        <Badge variant="outline">{conditionLabel(c.confirmed_condition || c.condition)}</Badge>
                        {c.confirmed_stage_label && (
                          <Badge variant="outline" className="gap-1">
                            <BadgeCheck className="h-3 w-3" /> {c.confirmed_stage_label}
                          </Badge>
                        )}
                        {incoming && <Badge variant="outline">Referred to your facility</Badge>}
                        {!!casePoints.get(c.id)?.points && (
                          <Badge
                            variant="outline"
                            className={cn("gap-1 border", toneClasses.success)}
                            title={casePoints.get(c.id)?.reasons.join(" · ")}
                          >
                            <Award className="h-3 w-3" />
                            {casePoints.get(c.id)?.points} pts to {cddName(c.cdd_id)}
                          </Badge>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {c.sex || "—"}{c.age != null ? `, ${c.age} yrs` : ""} ·{" "}
                        {[c.community, c.ward, c.lga].filter(Boolean).join(", ") || "No location"} ·{" "}
                        Found {fmtDate(c.search_date)} by {cddName(c.cdd_id)}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        <Hospital className="mr-1 inline h-3 w-3" />
                        {facilityName(c.facility_id)}
                        {c.referred_to_facility_id && c.status !== "registered" &&
                          ` → referred to ${facilityName(c.referred_to_facility_id)}`}
                        {c.affected_side ? ` · ${c.affected_side}` : ""}
                      </p>
                      {c.rejection_reason && (
                        <p className="mt-0.5 text-xs text-muted-foreground">Not a case: {c.rejection_reason}</p>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {actable && c.status !== "registered" && (
                        <Button
                          variant="outline" size="sm" className="gap-1"
                          onClick={() => setConfirmCase(c)}
                        >
                          <Stethoscope className="h-4 w-4" />
                          {c.status === "pending" ? "Confirm case" : "Review staging"}
                        </Button>
                      )}
                      {actable && c.status === "confirmed" && (
                        <>
                          <Button
                            size="sm" className="gap-1" disabled={busyId === c.id}
                            onClick={() => void register(c, c.facility_id)}
                          >
                            <CheckCircle2 className="h-4 w-4" /> Keep & register here
                          </Button>
                          <Button
                            variant="outline" size="sm" className="gap-1"
                            onClick={() => { setReferCase(c); setReferTo(""); }}
                          >
                            <Send className="h-4 w-4" /> Refer
                          </Button>
                        </>
                      )}
                      {actable && c.status === "referred" && incoming && (
                        <Button
                          size="sm" className="gap-1" disabled={busyId === c.id}
                          onClick={() => void register(c, c.referred_to_facility_id as string)}
                        >
                          <CheckCircle2 className="h-4 w-4" /> Accept & issue Case ID
                        </Button>
                      )}
                      {actable && c.status === "referred" && !incoming && (
                        <Button
                          variant="outline" size="sm" disabled={busyId === c.id}
                          onClick={() => void withdraw(c)}
                        >
                          Withdraw referral
                        </Button>
                      )}
                      {actable && c.status !== "registered" && (
                        <>
                          <Button
                            variant="ghost" size="sm" aria-label="Edit case"
                            onClick={() => { setEditingCase(c); setCaseOpen(true); }}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost" size="sm" aria-label="Remove case"
                            onClick={() => setDeleteCaseRow(c)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <CddDialog
        open={cddOpen} onOpenChange={setCddOpen}
        projectId={projectId} moduleId={moduleId}
        facilities={facilities} cdd={editingCdd}
        defaultFacilityId={allowedFacilityIds?.[0]}
        onSaved={() => void reloadCdds()}
      />

      <PotentialCaseDialog
        open={caseOpen} onOpenChange={setCaseOpen}
        projectId={projectId} moduleId={moduleId}
        facilities={facilities} cdds={cdds}
        defaultFacilityId={allowedFacilityIds?.[0]}
        caseRow={editingCase}
        onSaved={() => void reloadCases()}
      />

      <CaseConfirmationDialog
        open={!!confirmCase}
        onOpenChange={(v) => { if (!v) setConfirmCase(null); }}
        projectId={projectId}
        caseRow={confirmCase}
        onSaved={(confirmed) => {
          const id = confirmCase?.id || "";
          void reloadCases();
          if (confirmed && id) setDecisionCaseId(id);
        }}
      />

      {/* Straight after confirmation: keep the person here, or refer them on */}
      <Dialog open={!!decisionCase} onOpenChange={(v) => { if (!v) setDecisionCaseId(""); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Case confirmed — what happens next?</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className={cn("rounded-md border p-3 text-sm", toneClasses.success)}>
              <p className="font-medium">{decisionCase?.full_name}</p>
              <p className="text-xs">
                {conditionLabel(decisionCase?.confirmed_condition || decisionCase?.condition)}
                {decisionCase?.confirmed_stage != null && ` · stage ${decisionCase.confirmed_stage}`}
                {" · found by "}{cddName(decisionCase?.cdd_id)}
              </p>
            </div>
            <p className="text-sm text-muted-foreground">
              Keep them at {facilityName(decisionCase?.facility_id)} and a Case ID is issued now, or refer
              them to another facility — the Case ID is then issued when that facility accepts.
            </p>
          </div>
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button
              variant="outline"
              onClick={() => {
                const c = decisionCase;
                setDecisionCaseId("");
                if (c) { setReferCase(c); setReferTo(""); setReferSummary(""); setReferUrgency("routine"); }
              }}
            >
              <Send className="mr-1 h-4 w-4" /> Refer to another facility
            </Button>
            <Button
              disabled={!!busyId}
              onClick={async () => {
                const c = decisionCase;
                setDecisionCaseId("");
                if (c) await register(c, c.facility_id);
              }}
            >
              <BadgeCheck className="mr-1 h-4 w-4" /> Register here &amp; issue Case ID
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Refer a confirmed case to another facility */}
      <Dialog open={!!referCase} onOpenChange={(v) => { if (!v) setReferCase(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Refer {referCase?.full_name}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-sm">Refer to facility</Label>
              <Select value={referTo} onValueChange={setReferTo}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select facility…" /></SelectTrigger>
                <SelectContent className="z-[1200] bg-popover">
                  {facilities.filter((f) => f.id !== referCase?.facility_id).map((f) => (
                    <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm">Urgency</Label>
              <Select value={referUrgency} onValueChange={setReferUrgency}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent className="z-[1200] bg-popover">
                  {URGENCY_OPTIONS.map((u) => <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm">Clinical summary</Label>
              <Textarea
                className="mt-1" rows={3} value={referSummary}
                onChange={(e) => setReferSummary(e.target.value)}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              The Case ID is only issued when the receiving facility accepts the case.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReferCase(null)}>Cancel</Button>
            <Button disabled={!referTo || !!busyId} onClick={() => void submitReferral()}>Send referral</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteCddRow} onOpenChange={(v) => { if (!v) setDeleteCddRow(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {deleteCddRow?.full_name}?</AlertDialogTitle>
            <AlertDialogDescription>
              The cases they found stay in the register.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void removeCdd()}>Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteCaseRow} onOpenChange={(v) => { if (!v) setDeleteCaseRow(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this potential case?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteCaseRow?.full_name} will be deleted from the case-search register.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void removeCase()}>Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default CddCaseSearchPanel;

import VulnerabilityScore from "./VulnerabilityScore";
import LivelihoodAssessmentDialog from "./LivelihoodAssessmentDialog";
import type { LivelihoodAssessmentRow } from "@/lib/programmeModule/livelihood";
import { useMemo, useState } from "react";
import { ClipboardCheck, Sparkles, CheckCircle2, Circle, Loader2, MapPin, Plus, ShieldCheck, UserCheck, XCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  GraduationGate, SelectionStatus, gateFromAssessment, SELECTION_STEPS, pathwayPercent, readGate, stageProgress,
} from "@/lib/programmeModule/graduation";
import type { BeneficiaryRow } from "@/lib/programmeModule/types";
import { offlineMutate, currentUserId } from "@/lib/programmeModule/offlineWrite";
import { cachedRead } from "@/lib/programmeModule/offlineReadCache";

interface Props {
  projectId: string;
  moduleId?: string;
  beneficiary: BeneficiaryRow;
  componentKey: string;
  services: { component_key?: string; service_name?: string | null; service_date?: string | null }[];
  onRecord: (componentKey: string, serviceName: string) => void;
  onChanged: () => void;
}

const ORDER: SelectionStatus[] = ["mapped", "verified", "selected"];
const STEP_ICON = { mapped: MapPin, verified: ShieldCheck, selected: UserCheck } as const;

const GraduationPathwayPanel = ({ projectId, moduleId, beneficiary, componentKey, services, onRecord, onChanged }: Props) => {
  const { toast } = useToast();
  const profile = (beneficiary.profile || {}) as Record<string, unknown>;
  const gate = readGate(profile);
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [assessOpen, setAssessOpen] = useState(false);
  const [existing, setExisting] = useState<LivelihoodAssessmentRow | null>(null);
  const [scoreKey, setScoreKey] = useState(0);

  const openAssessment = async () => {
    const { data } = await cachedRead<LivelihoodAssessmentRow[]>(`livelihood-person:${await currentUserId()}:${beneficiary.id}`, () => (supabase as unknown as { from: (t: string) => any }).from("livelihood_assessments")
      .select("*").eq("beneficiary_id", beneficiary.id).order("created_at", { ascending: false }).limit(1));
    setExisting((data?.[0] as LivelihoodAssessmentRow) ?? null);
    setAssessOpen(true);
  };

  const applyAssessment = async () => {
    setScoreKey((k) => k + 1);
    onChanged();
  };

  const livelihood = useMemo(() => services.filter((s) => s.component_key === componentKey), [services, componentKey]);
  const progress = useMemo(() => stageProgress(livelihood), [livelihood]);
  const pct = pathwayPercent(progress);
  const selected = gate?.status === "selected";
  const currentIdx = gate ? (gate.status === "not_selected" ? 1 : ORDER.indexOf(gate.status)) : -1;
  const nextStage = selected ? progress.find((p) => p.count === 0)?.stage : undefined;

  const setStatus = async (status: SelectionStatus, why?: string) => {
    setBusy(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const now = new Date().toISOString();
      const next: GraduationGate = {
        ...(gate || { status }),
        status,
        decision_source: "manual",
        updated_by: auth.user?.id,
        ...(status === "mapped" ? { mapped_at: now } : {}),
        ...(status === "verified" ? { verified_at: now, mapped_at: gate?.mapped_at || now } : {}),
        ...(status === "selected" || status === "not_selected"
          ? { decided_at: now, verified_at: gate?.verified_at || now, mapped_at: gate?.mapped_at || now, reason: why || undefined }
          : {}),
      };
      await offlineMutate({ table: "beneficiaries", action: "update", values: { profile: { ...profile, graduation: next } }, id: beneficiary.id });
      toast({ title: status === "not_selected" ? "Marked not selected" : `Household ${SELECTION_STEPS.find((s) => s.value === status)?.label.toLowerCase()}` });
      setRejecting(false);
      setReason("");
      onChanged();
    } catch (e) {
      toast({ title: "Could not update pathway", description: (e as Error).message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="overflow-hidden">
      <div className="bg-gradient-to-r from-health-teal to-health-blue px-4 py-3 text-primary-foreground">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide opacity-85">Graduation Approach</p>
            <h3 className="text-base font-bold">Household pathway</h3>
          </div>
          {selected && <span className="rounded-full bg-primary-foreground/20 px-3 py-1 text-xs font-bold">{pct}% complete</span>}
        </div>
      </div>
      <div className="space-y-3 px-4 pt-3">
        <Button variant="outline" onClick={() => void openAssessment()}
          className="group relative flex h-auto w-full items-center gap-3 whitespace-normal rounded-lg border border-health-teal/40 bg-health-teal/10 p-3 text-left">
          <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-health-teal text-primary-foreground">
            <ClipboardCheck className="relative h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1 text-sm font-semibold text-health-ink">Livelihood Needs Assessment <Sparkles className="h-3.5 w-3.5 text-health-amber" /></span>
            <span className="block text-xs text-muted-foreground">Every beneficiary is eligible. Vulnerability guides recommendations; project Admins can confirm selection in the opportunity register regardless of score.</span>
          </span>
          <span className="shrink-0 rounded-full bg-health-teal px-3 py-1 text-xs font-bold text-primary-foreground transition-transform group-hover:scale-105">{gate ? "Update" : "Fill form"}</span>
        </Button>
        <VulnerabilityScore key={scoreKey} beneficiaryId={beneficiary.id} />
      </div>
      <LivelihoodAssessmentDialog open={assessOpen} onOpenChange={setAssessOpen} projectId={projectId} moduleId={moduleId}
        beneficiary={beneficiary} existing={existing} onSaved={applyAssessment} />

      <div className="space-y-4 p-4">
        {/* Mapping → verification → selection */}
        <ol className="grid grid-cols-3 gap-2">
          {SELECTION_STEPS.map((s, i) => {
            const Icon = STEP_ICON[s.value as keyof typeof STEP_ICON];
            const done = currentIdx >= i && !(gate?.status === "not_selected" && s.value === "selected");
            const rejected = gate?.status === "not_selected" && s.value === "selected";
            return (
              <li key={s.value} className={cn(
                "rounded-xl border p-2.5 text-center",
                done ? "border-health-teal/50 bg-health-teal/10" : rejected ? "border-destructive/40 bg-destructive/5" : "border-border",
              )}>
                {rejected ? <XCircle className="mx-auto h-5 w-5 text-destructive" /> : <Icon className={cn("mx-auto h-5 w-5", done ? "text-health-teal" : "text-muted-foreground")} />}
                <p className="mt-1 text-xs font-semibold text-health-ink">{rejected ? "Not selected" : s.label}</p>
              </li>
            );
          })}
        </ol>

        {gate?.status === "not_selected" && gate.reason && (
          <p className="rounded-lg bg-destructive/5 px-3 py-2 text-xs text-muted-foreground">Reason: {gate.reason}</p>
        )}

        {!selected && (
          <div className="flex flex-wrap gap-2">
            {!gate && <Button size="sm" disabled={busy} onClick={() => setStatus("mapped")}><MapPin className="mr-1 h-4 w-4" />Mark mapped</Button>}
            {gate?.status === "mapped" && <Button size="sm" disabled={busy} onClick={() => setStatus("verified")}><ShieldCheck className="mr-1 h-4 w-4" />Confirm verified</Button>}
            {(gate?.status === "verified" || gate?.status === "not_selected") && (
              <Button size="sm" disabled={busy} onClick={() => void openAssessment()}><ClipboardCheck className="mr-1 h-4 w-4" />Review assessment for selection</Button>
            )}
            {gate?.status === "verified" && !rejecting && (
              <Button size="sm" variant="outline" disabled={busy} onClick={() => setRejecting(true)}>Not selected</Button>
            )}
            {busy && <Loader2 className="h-4 w-4 animate-spin self-center" />}
          </div>
        )}
        {rejecting && (
          <div className="space-y-2">
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why was this household not selected?" />
            <div className="flex gap-2">
              <Button size="sm" variant="destructive" disabled={!reason.trim() || busy} onClick={() => setStatus("not_selected", reason.trim())}>Confirm</Button>
              <Button size="sm" variant="ghost" onClick={() => setRejecting(false)}>Cancel</Button>
            </div>
          </div>
        )}

        {/* Delivery stages */}
        {selected ? (
          <div className="space-y-2">
            <Progress value={pct} className="h-2" />
            {nextStage && (
              <p className="text-xs text-muted-foreground">Next step: <span className="font-semibold text-health-ink">{nextStage}</span></p>
            )}
            <ul className="divide-y divide-border/60 rounded-xl border border-border/60">
              {progress.map((p) => (
                <li key={p.stage} className="flex items-center gap-3 px-3 py-2.5">
                  {p.count > 0 ? <CheckCircle2 className="h-5 w-5 shrink-0 text-status-success" /> : <Circle className={cn("h-5 w-5 shrink-0", p.stage === nextStage ? "text-health-teal" : "text-muted-foreground/50")} />}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-health-ink">{p.stage}</p>
                    {p.count > 0 && <p className="text-xs text-muted-foreground">{p.count}× · last {p.lastDate}</p>}
                  </div>
                  <Button size="sm" variant={p.stage === nextStage ? "default" : "ghost"} className="h-9 shrink-0" onClick={() => onRecord(componentKey, p.stage)}>
                    <Plus className="h-4 w-4" /><span className="sr-only sm:not-sr-only sm:ml-1">Record</span>
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Delivery stages unlock after selection. Admins can select any assessed beneficiary in the opportunity register regardless of vulnerability score, with consent and safeguarding checks.</p>
        )}
      </div>
    </Card>
  );
};

export default GraduationPathwayPanel;

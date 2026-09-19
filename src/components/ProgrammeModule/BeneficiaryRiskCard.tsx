// Live loss-to-follow-up risk for a single beneficiary record.
//
// Scored on the device from the person's own attendance rhythm, appointment
// pressure, distance to the treating facility and demographics, so it works
// offline and refreshes the moment a service or follow-up is recorded.

import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ShieldAlert, Loader2, Home } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { bandLabel, scoreLtfuRisk } from "@/lib/programmeModule/ltfuRisk";
import { useFacilities } from "@/lib/programmeModule/facilities";
import {
  useBeneficiaryHomeVisits, isVisitOpen, visitSummary,
} from "@/lib/programmeModule/homeVisits";
import HomeVisitOutcomeDialog from "./HomeVisitOutcomeDialog";
import type {
  BeneficiaryReferralRow, BeneficiaryRow, BeneficiaryServiceRow,
} from "@/lib/programmeModule/types";

const BAND_CLASS: Record<string, string> = {
  low: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  moderate: "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  high: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  very_high: "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300",
};

interface Props {
  beneficiary: BeneficiaryRow;
  services: BeneficiaryServiceRow[];
  referrals: BeneficiaryReferralRow[];
  projectId: string;
  /** Administrators and facility managers can dispatch a home visit. */
  canDispatch?: boolean;
}

const SURGICAL_HINTS = ["surger", "operat", "hydrocoel", "hydrocele", "trichiasis", "tt ", "post-op"];

const BeneficiaryRiskCard = ({
  beneficiary, services, referrals, projectId, canDispatch = false,
}: Props) => {
  const { toast } = useToast();
  const { facilities } = useFacilities(projectId);
  const [age, setAge] = useState<number | null>(null);
  const [dispatching, setDispatching] = useState(false);
  const [dispatched, setDispatched] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const { visits, reload } = useBeneficiaryHomeVisits(beneficiary.id);
  const openVisit = visits.find(isVisitOpen) || null;
  const visitCount = visits.length;

  const facilityId = (beneficiary as unknown as { facility_id?: string | null }).facility_id || null;
  const facility = facilities.find((f) => f.id === facilityId) || null;

  useEffect(() => {
    const dob = (beneficiary.profile?.date_of_birth || beneficiary.profile?.dob) as string | undefined;
    if (dob) {
      const d = new Date(dob);
      if (!Number.isNaN(d.getTime())) {
        setAge(Math.floor((Date.now() - d.getTime()) / (365.25 * 86_400_000)));
        return;
      }
    }
    const n = Number(beneficiary.profile?.age);
    setAge(Number.isFinite(n) && n > 0 ? n : null);
  }, [beneficiary]);

  useEffect(() => { if (dispatched) void reload(); }, [dispatched, reload]);

  const risk = useMemo(() => {
    const surgical = services.some((s) => {
      const text = `${s.service_name || ""} ${s.result || ""}`.toLowerCase();
      return SURGICAL_HINTS.some((h) => text.includes(h));
    });
    return scoreLtfuRisk({
      beneficiaryId: beneficiary.id,
      name: beneficiary.full_name,
      caseId: beneficiary.case_id,
      visitDates: [
        ...services.map((s) => s.service_date),
        ...referrals.map((r) => r.referral_date),
      ].filter(Boolean) as string[],
      nextFollowUp: beneficiary.next_follow_up_date,
      lat: beneficiary.latitude,
      lng: beneficiary.longitude,
      facilityLat: facility?.latitude ?? null,
      facilityLng: facility?.longitude ?? null,
      age,
      sex: (beneficiary.profile?.sex || beneficiary.profile?.gender) as string | undefined,
      surgical,
      status: beneficiary.status,
    });
  }, [beneficiary, services, referrals, facility, age]);

  const dispatch = async () => {
    setDispatching(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await supabase.from("beneficiary_home_visits").insert({
        project_id: projectId,
        beneficiary_id: beneficiary.id,
        risk_score: risk.score,
        risk_band: risk.band,
        reasons: risk.reasons,
        due_date: beneficiary.next_follow_up_date,
        status: "dispatched",
        created_by: auth.user?.id,
      });
      if (error) throw error;
      setDispatched(true);
      toast({ title: "Home visit dispatched", description: risk.recommendation });
    } catch (e) {
      toast({ title: "Could not dispatch the visit", description: (e as Error).message, variant: "destructive" });
    } finally {
      setDispatching(false);
    }
  };

  return (
    <Card className="p-4">
      <h3 className="mb-2 flex items-center gap-2 font-semibold text-foreground">
        <ShieldAlert className="h-4 w-4" /> Follow-up risk
      </h3>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-3xl font-semibold text-foreground">{risk.score}<span className="text-base text-muted-foreground">/100</span></p>
          <p className="text-xs text-muted-foreground">Chance of missing the next appointment</p>
        </div>
        <Badge variant="outline" className={cn("border", BAND_CLASS[risk.band])}>{bandLabel(risk.band)}</Badge>
      </div>
      <Progress value={risk.score} className="mt-3 h-2" />

      <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
        {risk.reasons.slice(0, 4).map((r) => <li key={r}>• {r}</li>)}
      </ul>

      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>Distance: {risk.distanceKm != null ? `${risk.distanceKm} km` : "—"}</span>
        <span>Average gap: {risk.meanIntervalDays != null ? `${risk.meanIntervalDays} days` : "—"}</span>
        <span>
          Appointment: {risk.daysToAppointment == null ? "not booked"
            : risk.daysToAppointment < 0 ? `${Math.abs(risk.daysToAppointment)} days overdue`
              : `in ${risk.daysToAppointment} days`}
        </span>
        <span className="flex items-center gap-1"><Home className="h-3 w-3" /> Home visits: {visitCount ?? "—"}</span>
      </div>

      <p className="mt-3 rounded-md bg-muted/60 p-2 text-xs text-foreground">{risk.recommendation}</p>

      {canDispatch && (risk.band === "high" || risk.band === "very_high") && (
        <Button
          size="sm" variant="outline" className="mt-3 w-full"
          disabled={dispatching || dispatched} onClick={() => void dispatch()}
        >
          {dispatching && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
          {dispatched ? "Home visit dispatched" : "Dispatch a community health worker"}
        </Button>
      )}
      {visits.length > 0 && (
        <div className="mt-3 space-y-1 border-t border-border pt-3">
          <p className="text-xs font-medium text-foreground">Home visits</p>
          {visits.slice(0, 4).map((v) => (
            <p key={v.id} className="text-xs text-muted-foreground">• {visitSummary(v)}</p>
          ))}
        </div>
      )}

      {openVisit && (
        <Button size="sm" className="mt-3 w-full" onClick={() => setReportOpen(true)}>
          Report the visit outcome
        </Button>
      )}

      <p className="mt-2 text-[11px] text-muted-foreground">
        Decision support for the care team — it prioritises tracing, it does not judge the person.
      </p>

      <HomeVisitOutcomeDialog
        open={reportOpen}
        onOpenChange={setReportOpen}
        projectId={projectId}
        visit={openVisit}
        beneficiaryName={beneficiary.full_name}
        facilityId={facilityId}
        onReported={() => void reload()}
      />
    </Card>
  );
};

export default BeneficiaryRiskCard;

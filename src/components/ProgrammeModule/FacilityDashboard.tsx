import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Building2, ArrowDownLeft, ArrowUpRight, Users, RefreshCw, CalendarClock, ClipboardCheck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import type { BeneficiaryReferralRow, BeneficiaryRow } from "@/lib/programmeModule/types";
import {
  FACILITY_TYPE_LABEL, useFacilities, useMyFacilityAccess,
} from "@/lib/programmeModule/facilities";
import {
  CLOSED_OUTCOMES, REFERRAL_OUTCOME_LABEL, setReferralStatus, useFacilityDashboard,
} from "@/lib/programmeModule/facilityOps";
import ReferralOutcomeDialog from "./ReferralOutcomeDialog";

interface Props {
  projectId?: string;
  /** Administrators can look at any facility, focal persons only at their own. */
  canSeeAllFacilities?: boolean;
  onOpenBeneficiary?: (b: BeneficiaryRow) => void;
}

const urgencyTone: Record<string, string> = {
  routine: "border-slate-300 bg-slate-100 text-slate-700",
  urgent: "border-amber-400/40 bg-amber-500/10 text-amber-700",
  emergency: "border-red-400/40 bg-red-500/10 text-red-700",
};

const statusTone: Record<string, string> = {
  initiated: "border-blue-400/40 bg-blue-500/10 text-blue-700",
  accepted: "border-emerald-400/40 bg-emerald-500/10 text-emerald-700",
  declined: "border-red-400/40 bg-red-500/10 text-red-700",
  completed: "border-slate-300 bg-slate-100 text-slate-700",
};

/**
 * Facility dashboard — one registered health facility's own beneficiaries and
 * the referrals sent to and from it, so focal persons can track cases locally.
 */
const FacilityDashboard = ({ projectId, canSeeAllFacilities = false, onOpenBeneficiary }: Props) => {
  const { toast } = useToast();
  const { facilities } = useFacilities(projectId);
  const { levels } = useMyFacilityAccess();
  const [facilityId, setFacilityId] = useState("");

  const visible = useMemo(
    () => (canSeeAllFacilities ? facilities : facilities.filter((f) => levels[f.id])),
    [facilities, levels, canSeeAllFacilities],
  );

  useEffect(() => {
    if (!facilityId && visible.length > 0) setFacilityId(visible[0].id);
  }, [visible, facilityId]);

  const facility = visible.find((f) => f.id === facilityId);
  const { beneficiaries, incoming, outgoing, loading, reload } = useFacilityDashboard(facilityId);
  const [referredNames, setReferredNames] = useState<Record<string, string>>({});
  const [outcomeFor, setOutcomeFor] = useState<BeneficiaryReferralRow | null>(null);

  const nameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const b of beneficiaries) m.set(b.id, b.full_name);
    for (const [id, n] of Object.entries(referredNames)) if (!m.has(id)) m.set(id, n);
    return m;
  }, [beneficiaries, referredNames]);

  // Names of patients referred in from other facilities (not on our own list).
  useEffect(() => {
    const own = new Set(beneficiaries.map((b) => b.id));
    const missing = Array.from(new Set(incoming.map((r) => r.beneficiary_id)))
      .filter((id) => !own.has(id) && !referredNames[id]);
    if (missing.length === 0) return;
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from("beneficiaries").select("id,full_name").in("id", missing);
      if (cancelled || !data) return;
      setReferredNames((prev) => {
        const next = { ...prev };
        for (const r of data as { id: string; full_name: string }[]) next[r.id] = r.full_name;
        return next;
      });
    })();
    return () => { cancelled = true; };
  }, [incoming, beneficiaries, referredNames]);

  const pendingIn = incoming.filter((r) => r.status === "initiated");
  const dueFollowUps = incoming.filter(
    (r) => r.followup_date && !CLOSED_OUTCOMES.includes(r.outcome || "pending"),
  );
  const closedIn = incoming.filter((r) => CLOSED_OUTCOMES.includes(r.outcome || "pending"));
  const completionRate = incoming.length
    ? Math.round((closedIn.length / incoming.length) * 100)
    : 0;

  const decide = async (id: string, status: string) => {
    try {
      await setReferralStatus(id, status);
      toast({ title: `Referral ${status}` });
      void reload();
    } catch (e) {
      toast({ title: "Could not update referral", description: (e as Error).message, variant: "destructive" });
    }
  };

  if (visible.length === 0) {
    return (
      <Card className="p-10 text-center text-muted-foreground">
        You are not a focal person at any registered facility yet.
      </Card>
    );
  }

  const stat = (label: string, value: number, tone: string) => (
    <Card className="p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-2xl font-bold", tone)}>{value}</p>
    </Card>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Building2 className="h-5 w-5 text-primary" />
        <Select value={facilityId} onValueChange={setFacilityId}>
          <SelectTrigger className="w-[280px]"><SelectValue placeholder="Select facility" /></SelectTrigger>
          <SelectContent className="z-[1200] max-h-72 bg-popover">
            {visible.map((f) => (
              <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {facility && (
          <Badge variant="outline">{FACILITY_TYPE_LABEL[facility.facility_type]}</Badge>
        )}
        <div className="flex-1" />
        <Button variant="outline" size="icon" onClick={() => void reload()} aria-label="Refresh facility dashboard">
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
        </Button>
      </div>

      {facility && (
        <p className="text-sm text-muted-foreground">
          {[facility.ward, facility.lga, facility.state].filter(Boolean).join(" · ")}
          {facility.contact_person ? ` — Contact: ${facility.contact_person}` : ""}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {stat("Beneficiaries", beneficiaries.length, "text-foreground")}
        {stat("Referrals in", incoming.length, "text-blue-600")}
        {stat("Awaiting response", pendingIn.length, "text-amber-600")}
        {stat("Follow-ups due", dueFollowUps.length, "text-purple-600")}
        {stat("Closed referrals", closedIn.length, "text-emerald-600")}
        {stat("Referrals out", outgoing.length, "text-slate-600")}
      </div>

      <Card className="p-4">
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="font-medium text-foreground">Referral follow-up progress</span>
          <span className="text-muted-foreground">{completionRate}% closed</span>
        </div>
        <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${completionRate}%` }} />
        </div>
      </Card>

      <Tabs defaultValue="incoming">
        <TabsList>
          <TabsTrigger value="incoming" className="gap-1">
            <ArrowDownLeft className="h-4 w-4" /> Referrals in
            {pendingIn.length > 0 && <Badge className="ml-1">{pendingIn.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="outgoing" className="gap-1">
            <ArrowUpRight className="h-4 w-4" /> Referrals out
          </TabsTrigger>
          <TabsTrigger value="people" className="gap-1">
            <Users className="h-4 w-4" /> Beneficiaries
          </TabsTrigger>
        </TabsList>

        <TabsContent value="incoming" className="mt-3 space-y-2">
          {incoming.length === 0 && (
            <Card className="p-8 text-center text-muted-foreground">No referrals to this facility yet.</Card>
          )}
          {incoming.map((r) => (
            <Card key={r.id} className="flex flex-wrap items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-foreground">
                  {nameById.get(r.beneficiary_id) || "Referred beneficiary"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {r.referral_date} · {r.reason || "No reason recorded"}
                </p>
                {r.notes && <p className="mt-1 text-xs text-muted-foreground">{r.notes}</p>}
              </div>
              <Badge variant="outline" className={cn("border", urgencyTone[(r as unknown as { urgency?: string }).urgency || "routine"])}>
                {(r as unknown as { urgency?: string }).urgency || "routine"}
              </Badge>
              <Badge variant="outline" className={cn("border", statusTone[r.status] || "")}>{r.status}</Badge>
              {r.status === "initiated" && (
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => void decide(r.id, "accepted")}>Accept</Button>
                  <Button size="sm" variant="outline" onClick={() => void decide(r.id, "declined")}>Decline</Button>
                </div>
              )}
              {r.status === "accepted" && (
                <Button size="sm" variant="outline" onClick={() => void decide(r.id, "completed")}>
                  Mark completed
                </Button>
              )}
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="outgoing" className="mt-3 space-y-2">
          {outgoing.length === 0 && (
            <Card className="p-8 text-center text-muted-foreground">No referrals sent from this facility.</Card>
          )}
          {outgoing.map((r) => (
            <Card key={r.id} className="flex flex-wrap items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-foreground">{r.referred_to}</p>
                <p className="text-xs text-muted-foreground">
                  {r.referral_date} · {r.reason || "No reason recorded"}
                </p>
              </div>
              <Badge variant="outline" className={cn("border", statusTone[r.status] || "")}>{r.status}</Badge>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="people" className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {beneficiaries.length === 0 && (
            <Card className="p-8 text-center text-muted-foreground sm:col-span-2 xl:col-span-3">
              No beneficiaries registered at this facility yet.
            </Card>
          )}
          {beneficiaries.map((b) => (
            <Card
              key={b.id}
              role={onOpenBeneficiary ? "button" : undefined}
              tabIndex={onOpenBeneficiary ? 0 : undefined}
              onClick={() => onOpenBeneficiary?.(b)}
              onKeyDown={(e) => e.key === "Enter" && onOpenBeneficiary?.(b)}
              className={cn("p-4", onOpenBeneficiary && "cursor-pointer transition-shadow hover:shadow-md")}
            >
              <p className="truncate font-semibold text-foreground">{b.full_name}</p>
              <p className="text-xs text-muted-foreground">{b.case_id}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {[b.village, b.lga, b.state].filter(Boolean).join(" · ") || "Location not recorded"}
              </p>
              <Badge variant="outline" className="mt-2">{b.status}</Badge>
            </Card>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default FacilityDashboard;

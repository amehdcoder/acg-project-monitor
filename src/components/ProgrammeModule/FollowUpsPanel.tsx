import { useCallback, useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CalendarClock, RefreshCw, Share2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import type { BeneficiaryReferralRow, BeneficiaryRow } from "@/lib/programmeModule/types";
import { useFacilities } from "@/lib/programmeModule/facilities";

interface Props {
  projectId?: string;
  onOpenBeneficiary?: (b: BeneficiaryRow) => void;
}

const dayDiff = (iso: string) =>
  Math.round((new Date(iso).getTime() - new Date().setHours(0, 0, 0, 0)) / 86400000);

/** Upcoming visits and referral traffic across the whole project. */
const FollowUpsPanel = ({ projectId, onOpenBeneficiary }: Props) => {
  const [beneficiaries, setBeneficiaries] = useState<BeneficiaryRow[]>([]);
  const [referrals, setReferrals] = useState<BeneficiaryReferralRow[]>([]);
  const [loading, setLoading] = useState(false);
  const { facilities } = useFacilities(projectId);

  const load = useCallback(async () => {
    if (!projectId) { setBeneficiaries([]); setReferrals([]); return; }
    setLoading(true);
    const [b, r] = await Promise.all([
      supabase.from("beneficiaries").select("*").eq("project_id", projectId)
        .not("next_follow_up_date", "is", null)
        .order("next_follow_up_date", { ascending: true }).limit(300),
      supabase.from("beneficiary_referrals").select("*").eq("project_id", projectId)
        .order("referral_date", { ascending: false }).limit(200),
    ]);
    setBeneficiaries((b.data as unknown as BeneficiaryRow[]) || []);
    setReferrals((r.data as unknown as BeneficiaryReferralRow[]) || []);
    setLoading(false);
  }, [projectId]);

  useEffect(() => { void load(); }, [load]);

  const nameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const b of beneficiaries) m.set(b.id, b.full_name);
    return m;
  }, [beneficiaries]);

  const facilityName = (id?: string | null) =>
    facilities.find((f) => f.id === id)?.name || "";

  if (!projectId) {
    return <Card className="p-8 text-center text-muted-foreground">Select a project to see follow-ups.</Card>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <CalendarClock className="h-5 w-5 text-primary" />
        <h3 className="font-display text-base font-semibold text-foreground">Follow-up visits</h3>
        <div className="flex-1" />
        <Button variant="outline" size="icon" onClick={() => void load()} aria-label="Refresh follow-ups">
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {beneficiaries.length === 0 && (
          <Card className="p-8 text-center text-muted-foreground sm:col-span-2 xl:col-span-3">
            No follow-up visits scheduled yet.
          </Card>
        )}
        {beneficiaries.map((b) => {
          const d = dayDiff(b.next_follow_up_date as string);
          const tone = d < 0
            ? "border-red-400/40 bg-red-500/10 text-red-700"
            : d <= 7
              ? "border-amber-400/40 bg-amber-500/10 text-amber-700"
              : "border-emerald-400/40 bg-emerald-500/10 text-emerald-700";
          return (
            <Card
              key={b.id}
              role={onOpenBeneficiary ? "button" : undefined}
              tabIndex={onOpenBeneficiary ? 0 : undefined}
              onClick={() => onOpenBeneficiary?.(b)}
              onKeyDown={(e) => e.key === "Enter" && onOpenBeneficiary?.(b)}
              className={cn("p-4", onOpenBeneficiary && "cursor-pointer transition-shadow hover:shadow-md")}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-foreground">{b.full_name}</p>
                  <p className="text-xs text-muted-foreground">{b.case_id}</p>
                </div>
                <Badge variant="outline" className={cn("border", tone)}>
                  {d < 0 ? `${Math.abs(d)}d overdue` : d === 0 ? "Today" : `in ${d}d`}
                </Badge>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {b.next_follow_up_date}
                {facilityName((b as unknown as { facility_id?: string }).facility_id)
                  ? ` · ${facilityName((b as unknown as { facility_id?: string }).facility_id)}`
                  : ""}
              </p>
            </Card>
          );
        })}
      </div>

      <div className="flex items-center gap-2 pt-2">
        <Share2 className="h-5 w-5 text-primary" />
        <h3 className="font-display text-base font-semibold text-foreground">Recent referrals</h3>
      </div>
      <div className="space-y-2">
        {referrals.length === 0 && (
          <Card className="p-8 text-center text-muted-foreground">No referrals recorded yet.</Card>
        )}
        {referrals.map((r) => (
          <Card key={r.id} className="flex flex-wrap items-center gap-3 p-4">
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold text-foreground">
                {nameById.get(r.beneficiary_id) || "Beneficiary"} → {r.referred_to}
              </p>
              <p className="text-xs text-muted-foreground">
                {r.referral_date} · {r.reason || "No reason recorded"}
              </p>
            </div>
            <Badge variant="outline">{r.status}</Badge>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default FollowUpsPanel;

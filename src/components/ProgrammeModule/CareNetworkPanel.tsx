// Facilities, Pharmacy and Referrals for one beneficiary — the care network
// that makes referrals definitive: the receiving facility's focal persons can
// open the complete patient record and move the referral forward.

import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Building2, Pill, Share2, Phone, MapPin, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useFacilities, FACILITY_TYPE_LABEL } from "@/lib/programmeModule/facilities";
import type { BeneficiaryReferralRow, BeneficiaryRow } from "@/lib/programmeModule/types";

interface StockRow {
  id: string; drug_name: string; drug_class: string;
  quantity_on_hand: number; reorder_level: number; unit: string; facility_id: string;
}

interface Props {
  beneficiary: BeneficiaryRow & { facility_id?: string | null };
  projectId: string;
  referrals: BeneficiaryReferralRow[];
  onRefer: () => void;
  onChanged: () => void;
}

const REFERRAL_STATUSES = [
  { value: "initiated", label: "Initiated" },
  { value: "accepted", label: "Accepted" },
  { value: "declined", label: "Declined" },
  { value: "completed", label: "Completed" },
];

const statusTone: Record<string, string> = {
  initiated: "bg-amber-100 text-amber-800 border-amber-200",
  accepted: "bg-sky-100 text-sky-800 border-sky-200",
  declined: "bg-rose-100 text-rose-800 border-rose-200",
  completed: "bg-emerald-100 text-emerald-800 border-emerald-200",
};

const CareNetworkPanel = ({ beneficiary, projectId, referrals, onRefer, onChanged }: Props) => {
  const { toast } = useToast();
  const { facilities } = useFacilities(projectId);
  const [stock, setStock] = useState<StockRow[]>([]);
  const [stockFacility, setStockFacility] = useState<string>(beneficiary.facility_id || "");

  const homeFacility = useMemo(
    () => facilities.find((f) => f.id === beneficiary.facility_id),
    [facilities, beneficiary.facility_id],
  );

  useEffect(() => {
    if (!stockFacility && facilities.length) setStockFacility(beneficiary.facility_id || facilities[0].id);
  }, [facilities, beneficiary.facility_id, stockFacility]);

  useEffect(() => {
    if (!stockFacility) return;
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from("antidepressant_stock")
        .select("id,drug_name,drug_class,quantity_on_hand,reorder_level,unit,facility_id")
        .eq("facility_id", stockFacility)
        .order("drug_name");
      if (!cancelled) setStock((data as StockRow[]) || []);
    })();
    return () => { cancelled = true; };
  }, [stockFacility]);

  const setReferralStatus = async (id: string, status: string) => {
    const { error } = await supabase
      .from("beneficiary_referrals")
      .update({ status } as never)
      .eq("id", id);
    if (error) {
      toast({ title: "Could not update referral", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Referral updated" });
    onChanged();
  };

  const nameOf = (id?: string | null) => facilities.find((f) => f.id === id)?.name;

  return (
    <Tabs defaultValue="facilities" className="space-y-4">
      <TabsList>
        <TabsTrigger value="facilities" className="gap-1"><Building2 className="h-4 w-4" /> Facilities</TabsTrigger>
        <TabsTrigger value="pharmacy" className="gap-1"><Pill className="h-4 w-4" /> Pharmacy</TabsTrigger>
        <TabsTrigger value="referrals" className="gap-1"><Share2 className="h-4 w-4" /> Referrals</TabsTrigger>
      </TabsList>

      <TabsContent value="facilities" className="space-y-3">
        <Card className="space-y-2 p-4">
          <p className="text-xs uppercase text-muted-foreground">Home facility</p>
          {homeFacility ? (
            <>
              <h3 className="font-semibold text-foreground">{homeFacility.name}</h3>
              <p className="text-sm text-muted-foreground">{FACILITY_TYPE_LABEL[homeFacility.facility_type]}</p>
              <p className="flex items-center gap-1 text-sm text-muted-foreground">
                <MapPin className="h-3.5 w-3.5" />
                {[homeFacility.ward, homeFacility.lga, homeFacility.state].filter(Boolean).join(" · ") || "—"}
              </p>
              {homeFacility.contact_person && (
                <p className="flex items-center gap-1 text-sm text-muted-foreground">
                  <Phone className="h-3.5 w-3.5" /> {homeFacility.contact_person}
                  {homeFacility.contact_phone ? ` · ${homeFacility.contact_phone}` : ""}
                </p>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              No facility assigned yet. Edit the beneficiary to attach a registered health facility.
            </p>
          )}
        </Card>

        <Card className="p-4">
          <p className="mb-2 text-xs uppercase text-muted-foreground">Registered facilities in this project</p>
          <div className="max-h-72 space-y-2 overflow-y-auto">
            {facilities.map((f) => (
              <div key={f.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{f.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {[FACILITY_TYPE_LABEL[f.facility_type], f.lga, f.state].filter(Boolean).join(" · ")}
                  </p>
                </div>
                {f.id === beneficiary.facility_id && <Badge variant="outline">Home</Badge>}
              </div>
            ))}
            {!facilities.length && <p className="text-sm text-muted-foreground">No facilities registered yet.</p>}
          </div>
        </Card>
      </TabsContent>

      <TabsContent value="pharmacy" className="space-y-3">
        <Card className="space-y-3 p-4">
          <div className="max-w-sm space-y-1.5">
            <p className="text-xs uppercase text-muted-foreground">Facility pharmacy</p>
            <Select value={stockFacility} onValueChange={setStockFacility}>
              <SelectTrigger><SelectValue placeholder="Select facility…" /></SelectTrigger>
              <SelectContent className="z-[1200] bg-popover">
                {facilities.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            {stock.map((s) => {
              const low = s.quantity_on_hand <= s.reorder_level;
              return (
                <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-2.5">
                  <div>
                    <p className="text-sm font-medium text-foreground">{s.drug_name}</p>
                    <p className="text-xs text-muted-foreground">{s.drug_class}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {low && (
                      <Badge variant="outline" className="gap-1 border-amber-200 bg-amber-50 text-amber-800">
                        <AlertTriangle className="h-3 w-3" /> Low stock
                      </Badge>
                    )}
                    <span className="text-sm font-semibold text-foreground">
                      {s.quantity_on_hand} {s.unit}
                    </span>
                  </div>
                </div>
              );
            })}
            {!stock.length && <p className="text-sm text-muted-foreground">No medicines recorded for this facility.</p>}
          </div>
        </Card>
      </TabsContent>

      <TabsContent value="referrals" className="space-y-3">
        <div className="flex justify-end">
          <Button size="sm" className="gap-1" onClick={onRefer}>
            <Share2 className="h-4 w-4" /> New referral
          </Button>
        </div>
        {referrals.map((r) => {
          const row = r as BeneficiaryReferralRow & {
            to_facility_id?: string | null; from_facility_id?: string | null;
            urgency?: string | null; clinical_summary?: string | null;
          };
          return (
            <Card key={r.id} className="space-y-2 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <h4 className="font-semibold text-foreground">
                    {nameOf(row.to_facility_id) || r.referred_to}
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    From {nameOf(row.from_facility_id) || "—"} · {r.referral_date}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {row.urgency && <Badge variant="outline">{row.urgency}</Badge>}
                  <Badge variant="outline" className={statusTone[r.status] || ""}>{r.status}</Badge>
                </div>
              </div>
              {r.reason && <p className="text-sm text-muted-foreground">Reason: {r.reason}</p>}
              {row.clinical_summary && (
                <p className="rounded-md bg-muted/50 p-2 text-sm text-foreground">{row.clinical_summary}</p>
              )}
              {!r.__pending && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {REFERRAL_STATUSES.filter((s) => s.value !== r.status).map((s) => (
                    <Button key={s.value} size="sm" variant="outline" onClick={() => void setReferralStatus(r.id, s.value)}>
                      Mark {s.label.toLowerCase()}
                    </Button>
                  ))}
                </div>
              )}
            </Card>
          );
        })}
        {!referrals.length && (
          <Card className="p-8 text-center text-sm text-muted-foreground">No referrals for this beneficiary yet.</Card>
        )}
      </TabsContent>
    </Tabs>
  );
};

export default CareNetworkPanel;

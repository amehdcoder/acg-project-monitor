// Predictive default & surgical follow-up risk scoring.
//
// Every beneficiary on the register is scored on the device for the chance of
// missing their next appointment, using attendance rhythm, distance to the
// treating facility, demographics and surgical status. High scorers can be
// dispatched to a Community Health Extension Worker for a home visit before
// the appointment is missed.

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { Activity, Send, Loader2, MapPin, CheckCircle2, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { toneClasses, ageFromDob } from "@/lib/programmeModule/defaults";
import { useFacilities } from "@/lib/programmeModule/facilities";
import type { BeneficiaryRow } from "@/lib/programmeModule/types";
import {
  bandLabel, bandTone, rankLtfuRisk, type RiskInput, type RiskResult,
} from "@/lib/programmeModule/ltfuRisk";

interface Props {
  projectId: string;
  moduleId?: string;
  beneficiaries: BeneficiaryRow[];
  canDispatch?: boolean;
  onOpenBeneficiary?: (b: BeneficiaryRow) => void;
}

interface VisitRow { beneficiary_id: string; service_date: string; service_name: string | null }
interface HomeVisitRow {
  id: string; beneficiary_id: string; assigned_name: string | null; risk_score: number | null;
  risk_band: string | null; due_date: string | null; status: string; outcome: string | null;
}
interface ProfileRow { user_id: string; first_name: string; last_name: string; email: string }

const db = supabase as unknown as { from: (t: string) => any };

const SURGICAL_HINTS = ["surgery", "surgical", "hydrocoelectomy", "trichiasis", "tt surgery", "operation"];

const VISIT_STATUSES = [
  { value: "dispatched", label: "Dispatched" },
  { value: "in_progress", label: "In progress" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

const OUTCOMES = [
  { value: "seen_rebooked", label: "Seen at home — appointment re-booked" },
  { value: "seen_attended", label: "Seen — attended the facility" },
  { value: "not_found", label: "Not found at home" },
  { value: "relocated", label: "Has relocated" },
  { value: "refused", label: "Declined further care" },
  { value: "deceased", label: "Reported deceased" },
];

const LtfuRiskPanel = ({
  projectId, moduleId, beneficiaries, canDispatch = true, onOpenBeneficiary,
}: Props) => {
  const { toast } = useToast();
  const { facilities } = useFacilities(projectId);
  const [visits, setVisits] = useState<VisitRow[]>([]);
  const [dispatches, setDispatches] = useState<HomeVisitRow[]>([]);
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [bandFilter, setBandFilter] = useState("all");

  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<RiskResult | null>(null);
  const [chewId, setChewId] = useState("");
  const [dueDate, setDueDate] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + 3);
    return d.toISOString().slice(0, 10);
  });
  const [visitNotes, setVisitNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [v, d, p] = await Promise.all([
      db.from("beneficiary_services").select("beneficiary_id,service_date,service_name")
        .eq("project_id", projectId).order("service_date", { ascending: false }).limit(8000),
      db.from("beneficiary_home_visits")
        .select("id,beneficiary_id,assigned_name,risk_score,risk_band,due_date,status,outcome")
        .eq("project_id", projectId).order("created_at", { ascending: false }).limit(1000),
      supabase.from("profiles").select("user_id,first_name,last_name,email").order("first_name").limit(1000),
    ]);
    setVisits((v.data as VisitRow[]) || []);
    setDispatches((d.data as HomeVisitRow[]) || []);
    setProfiles((p.data as ProfileRow[]) || []);
    setLoading(false);
  }, [projectId]);

  useEffect(() => { void load(); }, [load]);

  const results = useMemo(() => {
    const byBeneficiary = new Map<string, VisitRow[]>();
    for (const v of visits) {
      byBeneficiary.set(v.beneficiary_id, [...(byBeneficiary.get(v.beneficiary_id) || []), v]);
    }
    const facilityById = new Map(facilities.map((f) => [f.id, f]));

    const inputs: RiskInput[] = beneficiaries
      .filter((b) => !["exited", "deceased", "completed"].includes(String(b.status)))
      .map((b) => {
        const rows = byBeneficiary.get(b.id) || [];
        const facility = facilityById.get((b as unknown as { facility_id?: string }).facility_id || "") as
          unknown as { latitude?: number | null; longitude?: number | null } | undefined;
        const profile = (b.profile || {}) as Record<string, unknown>;
        const ageText = profile.date_of_birth ? ageFromDob(profile.date_of_birth) : String(profile.age ?? "");
        const age = Number(String(ageText).replace(/\D+/g, "")) || null;
        const surgical = rows.some((r) =>
          SURGICAL_HINTS.some((h) => String(r.service_name || "").toLowerCase().includes(h)));
        return {
          beneficiaryId: b.id,
          name: b.full_name,
          caseId: b.case_id,
          visitDates: rows.map((r) => r.service_date),
          nextFollowUp: b.next_follow_up_date,
          lat: b.latitude, lng: b.longitude,
          facilityLat: facility?.latitude ?? null,
          facilityLng: facility?.longitude ?? null,
          age,
          sex: String(profile.sex ?? profile.gender ?? ""),
          surgical,
          status: b.status,
        };
      });
    return rankLtfuRisk(inputs);
  }, [beneficiaries, visits, facilities]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return results.filter((r) =>
      (bandFilter === "all" || r.band === bandFilter)
      && (!q || r.name.toLowerCase().includes(q) || r.caseId.toLowerCase().includes(q)));
  }, [results, search, bandFilter]);

  const summary = useMemo(() => ({
    veryHigh: results.filter((r) => r.band === "very_high").length,
    high: results.filter((r) => r.band === "high").length,
    overdue: results.filter((r) => (r.daysToAppointment ?? 1) < 0).length,
    dispatched: dispatches.filter((d) => d.status === "dispatched" || d.status === "in_progress").length,
  }), [results, dispatches]);

  const nameOf = (uid: string) => {
    const p = profiles.find((x) => x.user_id === uid);
    return p ? `${p.first_name} ${p.last_name}`.trim() || p.email : "";
  };

  const dispatch = async () => {
    if (!target) return;
    setBusy(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await db.from("beneficiary_home_visits").insert({
        project_id: projectId,
        module_id: moduleId || null,
        beneficiary_id: target.beneficiaryId,
        assigned_to: chewId || null,
        assigned_name: chewId ? nameOf(chewId) : null,
        risk_score: target.score,
        risk_band: target.band,
        reasons: target.reasons,
        due_date: dueDate,
        status: "dispatched",
        outcome_notes: visitNotes || null,
        created_by: auth.user?.id,
      });
      if (error) throw error;
      toast({ title: "Home visit dispatched", description: `${target.name} — due ${new Date(dueDate).toLocaleDateString()}` });
      setOpen(false); setVisitNotes(""); setChewId("");
      await load();
    } catch (e) {
      toast({ title: "Could not dispatch the visit", description: (e as Error).message, variant: "destructive" });
    } finally { setBusy(false); }
  };

  const updateVisit = async (id: string, patch: Record<string, unknown>) => {
    const { error } = await db.from("beneficiary_home_visits").update(patch).eq("id", id);
    if (error) {
      toast({ title: "Could not update the visit", description: error.message, variant: "destructive" });
      return;
    }
    await load();
  };

  const Metric = ({ label, value, hint, tone }: { label: string; value: string; hint: string; tone: string }) => (
    <Card className="p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-3xl font-bold" style={{ color: `hsl(${tone})` }}>{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </Card>
  );

  const openDispatch = (r: RiskResult) => {
    setTarget(r);
    const d = new Date();
    d.setDate(d.getDate() + (r.daysToAppointment != null && r.daysToAppointment > 2 ? r.daysToAppointment - 2 : 2));
    setDueDate(d.toISOString().slice(0, 10));
    setOpen(true);
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Very high risk" value={String(summary.veryHigh)} hint="Dispatch a home visit now" tone="var(--health-red, 356 63% 56%)" />
        <Metric label="High risk" value={String(summary.high)} hint="Visit before the appointment" tone="var(--health-amber, 45 87% 61%)" />
        <Metric label="Overdue appointments" value={String(summary.overdue)} hint="Already past the follow-up date" tone="var(--health-blue, 209 100% 36%)" />
        <Metric label="Open home visits" value={String(summary.dispatched)} hint="Dispatched or in progress" tone="var(--health-teal, 176 100% 31%)" />
      </div>

      <Card className="p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Activity className="h-5 w-5 text-primary" />
          <div className="min-w-0">
            <h3 className="font-semibold text-foreground">Loss-to-follow-up risk register</h3>
            <p className="text-xs text-muted-foreground">
              Scored on this device from attendance rhythm, distance, age, sex and surgical status.
            </p>
          </div>
          <div className="flex-1" />
          <div className="relative w-full sm:w-56">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="pl-8" placeholder="Search name or case ID" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select value={bandFilter} onValueChange={setBandFilter}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent className="z-[1200] bg-popover">
              <SelectItem value="all">All risk bands</SelectItem>
              <SelectItem value="very_high">Very high</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="moderate">Moderate</SelectItem>
              <SelectItem value="low">Low</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Beneficiary</TableHead>
                <TableHead>Risk</TableHead>
                <TableHead>Appointment</TableHead>
                <TableHead>Distance</TableHead>
                <TableHead>Why</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.slice(0, 200).map((r) => {
                const b = beneficiaries.find((x) => x.id === r.beneficiaryId);
                return (
                  <TableRow key={r.beneficiaryId}>
                    <TableCell>
                      <button
                        className="font-medium text-primary hover:underline"
                        onClick={() => b && onOpenBeneficiary?.(b)}
                      >
                        {r.name}
                      </button>
                      <div className="text-xs text-muted-foreground">{r.caseId}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn("border", toneClasses[bandTone(r.band)])}>
                        {r.score} · {bandLabel(r.band)}
                      </Badge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm">
                      {r.daysToAppointment == null ? "Not booked"
                        : r.daysToAppointment < 0 ? `${Math.abs(r.daysToAppointment)} days overdue`
                          : `in ${r.daysToAppointment} days`}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm">
                      {r.distanceKm == null ? "—" : (
                        <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{r.distanceKm} km</span>
                      )}
                    </TableCell>
                    <TableCell className="max-w-[320px] text-xs text-muted-foreground">
                      {r.reasons.slice(0, 2).join(" ")}
                    </TableCell>
                    <TableCell className="text-right">
                      {canDispatch && (
                        <Button size="sm" variant={r.band === "very_high" ? "default" : "outline"} className="gap-1" onClick={() => openDispatch(r)}>
                          <Send className="h-3.5 w-3.5" /> Dispatch CHEW
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
              {!loading && filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    No beneficiaries match this filter.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      <Card className="p-4">
        <h4 className="mb-2 font-semibold text-foreground">Home visits dispatched</h4>
        <Separator className="mb-2" />
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Beneficiary</TableHead>
                <TableHead>Assigned to</TableHead>
                <TableHead>Due</TableHead>
                <TableHead>Risk</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Outcome</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dispatches.map((d) => {
                const b = beneficiaries.find((x) => x.id === d.beneficiary_id);
                return (
                  <TableRow key={d.id}>
                    <TableCell className="font-medium text-foreground">{b?.full_name || "—"}</TableCell>
                    <TableCell>{d.assigned_name || "Unassigned"}</TableCell>
                    <TableCell>{d.due_date ? new Date(d.due_date).toLocaleDateString() : "—"}</TableCell>
                    <TableCell>{d.risk_score ?? "—"}</TableCell>
                    <TableCell>
                      <Select value={d.status} onValueChange={(v) => void updateVisit(d.id, { status: v, visited_at: v === "completed" ? new Date().toISOString() : null })}>
                        <SelectTrigger className="h-8 w-[150px]"><SelectValue /></SelectTrigger>
                        <SelectContent className="z-[1200] bg-popover">
                          {VISIT_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Select value={d.outcome || ""} onValueChange={(v) => void updateVisit(d.id, { outcome: v })}>
                        <SelectTrigger className="h-8 w-[220px]"><SelectValue placeholder="Record outcome" /></SelectTrigger>
                        <SelectContent className="z-[1200] bg-popover">
                          {OUTCOMES.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </TableCell>
                  </TableRow>
                );
              })}
              {dispatches.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    No home visit dispatched yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Dispatch a community health worker</DialogTitle></DialogHeader>
          {target && (
            <div className="space-y-3">
              <div className="rounded-lg border border-border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-foreground">{target.name}</span>
                  <Badge variant="outline" className={cn("border", toneClasses[bandTone(target.band)])}>
                    {target.score} · {bandLabel(target.band)}
                  </Badge>
                </div>
                <ul className="mt-2 list-inside list-disc space-y-0.5 text-xs text-muted-foreground">
                  {target.reasons.map((r) => <li key={r}>{r}</li>)}
                </ul>
                <p className="mt-2 flex items-start gap-1.5 text-xs font-medium text-foreground">
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 text-primary" /> {target.recommendation}
                </p>
              </div>
              <div>
                <Label className="text-sm">Community health extension worker</Label>
                <Select value={chewId} onValueChange={setChewId}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Choose a team member" /></SelectTrigger>
                  <SelectContent className="z-[1200] max-h-72 bg-popover">
                    {profiles.map((p) => (
                      <SelectItem key={p.user_id} value={p.user_id}>
                        {`${p.first_name} ${p.last_name}`.trim() || p.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-sm">Visit by</Label>
                <Input type="date" className="mt-1" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </div>
              <div>
                <Label className="text-sm">Instructions for the visit</Label>
                <Textarea
                  className="mt-1" rows={2} value={visitNotes} onChange={(e) => setVisitNotes(e.target.value)}
                  placeholder="What the worker should check, carry or counsel on."
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={busy} onClick={() => void dispatch()}>
              {busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} Dispatch visit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default LtfuRiskPanel;

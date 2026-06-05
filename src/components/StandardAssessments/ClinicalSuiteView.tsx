import { useEffect, useMemo, useState, useCallback } from "react";
import {
  ArrowLeft, Building2, Pill, Send, Plus, Loader2, RefreshCw, Search,
  MapPin, PackagePlus, PackageMinus, AlertTriangle, BellRing, CheckCircle2,
  XCircle, Hospital, ArrowRightLeft, ShieldAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { getAllStates } from "@/lib/nigeriaAdminData";

interface Props {
  projectId?: string | null;
  onClose: () => void;
}

type Tab = "facilities" | "pharmacy" | "referrals";

interface Facility {
  id: string;
  name: string;
  facility_type: "phc" | "secondary" | "tertiary";
  state: string | null;
  lga: string | null;
  ward: string | null;
  contact_person: string | null;
  contact_phone: string | null;
}

interface StockItem {
  id: string;
  facility_id: string;
  drug_name: string;
  unit: string;
  quantity_on_hand: number;
  reorder_level: number;
}

interface Referral {
  id: string;
  patient_id: string;
  patient_name: string | null;
  from_facility_id: string | null;
  to_facility_id: string;
  reason: string;
  clinical_summary: string | null;
  urgency: string;
  status: "initiated" | "accepted" | "declined" | "completed";
  created_at: string;
}

const TYPE_LABEL: Record<Facility["facility_type"], string> = {
  phc: "Primary Health Center",
  secondary: "Secondary Health Facility",
  tertiary: "Tertiary Health Facility",
};

const ANTIDEPRESSANTS = ["Amitriptyline", "Fluoxetine", "Sertraline", "Imipramine", "Citalopram", "Paroxetine"];

const ClinicalSuiteView = ({ projectId, onClose }: Props) => {
  const { user, isSuperAdmin } = useAuth();
  const [tab, setTab] = useState<Tab>("facilities");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [stock, setStock] = useState<StockItem[]>([]);
  const [referrals, setReferrals] = useState<Referral[]>([]);

  const facById = useMemo(() => {
    const m = new Map<string, Facility>();
    facilities.forEach((f) => m.set(f.id, f));
    return m;
  }, [facilities]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [f, s, r] = await Promise.all([
        supabase.from("health_facilities").select("id,name,facility_type,state,lga,ward,contact_person,contact_phone").order("name").limit(2000),
        supabase.from("antidepressant_stock").select("id,facility_id,drug_name,unit,quantity_on_hand,reorder_level").limit(5000),
        supabase.from("patient_referrals").select("id,patient_id,patient_name,from_facility_id,to_facility_id,reason,clinical_summary,urgency,status,created_at").order("created_at", { ascending: false }).limit(2000),
      ]);
      if (f.error) throw f.error;
      setFacilities((f.data as Facility[]) || []);
      setStock((s.data as StockItem[]) || []);
      setReferrals((r.data as Referral[]) || []);
    } catch (e: any) {
      toast({ title: "Could not load", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ---------------- Facility registration ----------------
  const [facOpen, setFacOpen] = useState(false);
  const [facForm, setFacForm] = useState({
    name: "", facility_type: "phc" as Facility["facility_type"],
    state: "", lga: "", ward: "", contact_person: "", contact_phone: "",
  });

  const saveFacility = async () => {
    if (!facForm.name.trim()) { toast({ title: "Facility name required", variant: "destructive" }); return; }
    setBusy(true);
    try {
      const { error } = await supabase.from("health_facilities").insert({
        ...facForm,
        name: facForm.name.trim(),
        project_id: projectId ?? null,
        created_by: user?.id ?? null,
      });
      if (error) throw error;
      toast({ title: "Facility registered", description: TYPE_LABEL[facForm.facility_type] });
      setFacOpen(false);
      setFacForm({ name: "", facility_type: "phc", state: "", lga: "", ward: "", contact_person: "", contact_phone: "" });
      await load();
    } catch (e: any) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    } finally { setBusy(false); }
  };

  // ---------------- Pharmacy / stock ----------------
  const [pharmFacility, setPharmFacility] = useState<string>("");
  useEffect(() => { if (!pharmFacility && facilities[0]) setPharmFacility(facilities[0].id); }, [facilities, pharmFacility]);

  const facilityStock = useMemo(() => stock.filter((s) => s.facility_id === pharmFacility), [stock, pharmFacility]);

  const [stockOpen, setStockOpen] = useState(false);
  const [stockForm, setStockForm] = useState({ drug_name: ANTIDEPRESSANTS[0], unit: "tablet", reorder_level: "30" });

  const addStockItem = async () => {
    if (!pharmFacility) { toast({ title: "Select a facility first", variant: "destructive" }); return; }
    setBusy(true);
    try {
      const { error } = await supabase.from("antidepressant_stock").insert({
        facility_id: pharmFacility,
        project_id: projectId ?? null,
        drug_name: stockForm.drug_name.trim(),
        unit: stockForm.unit.trim() || "tablet",
        reorder_level: Number(stockForm.reorder_level) || 0,
        quantity_on_hand: 0,
        created_by: user?.id ?? null,
      });
      if (error) throw error;
      toast({ title: "Drug added to stock" });
      setStockOpen(false);
      await load();
    } catch (e: any) {
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    } finally { setBusy(false); }
  };

  // Receipt / dispense dialog
  const [moveOpen, setMoveOpen] = useState(false);
  const [moveItem, setMoveItem] = useState<StockItem | null>(null);
  const [moveType, setMoveType] = useState<"receipt" | "dispense">("receipt");
  const [moveQty, setMoveQty] = useState("");
  const [movePatient, setMovePatient] = useState("");

  const openMove = (item: StockItem, type: "receipt" | "dispense") => {
    setMoveItem(item); setMoveType(type); setMoveQty(""); setMovePatient(""); setMoveOpen(true);
  };

  // Notify the assigned approver (fallback to super admins) about low/out of stock
  const raiseStockRequest = async (item: StockItem, reason: "low" | "out") => {
    try {
      const { data: assigns } = await supabase
        .from("stock_approver_assignments")
        .select("approver_user_id,facility_id");
      let approver: string | null =
        (assigns || []).find((a: any) => a.facility_id === item.facility_id)?.approver_user_id ??
        (assigns || []).find((a: any) => !a.facility_id)?.approver_user_id ?? null;

      let recipients: string[] = [];
      if (approver) recipients = [approver];
      else {
        const { data: admins } = await supabase.from("user_roles").select("user_id").eq("role", "super_admin");
        recipients = (admins || []).map((a: any) => a.user_id);
      }

      const suggested = Math.max(item.reorder_level * 2, 50);
      const { data: reqRow } = await supabase.from("stock_requests").insert({
        facility_id: item.facility_id,
        stock_id: item.id,
        drug_name: item.drug_name,
        quantity_requested: suggested,
        reason,
        requested_by: user?.id ?? null,
        approver_id: approver,
        notes: `Auto-raised: ${reason === "out" ? "out of stock" : "below reorder level"}.`,
      }).select("id").single();

      const fac = facById.get(item.facility_id);
      if (recipients.length) {
        await supabase.from("notifications").insert(
          recipients.map((uid) => ({
            user_id: uid,
            type: reason === "out" ? "error" : "warning",
            category: "pharmacy",
            title: reason === "out" ? "🚑 Out of stock — resupply needed" : "⚠ Low stock — resupply needed",
            message: `${item.drug_name} at ${fac?.name || "a facility"} is ${reason === "out" ? "out of stock" : "below the reorder level"}. Requested ${suggested} ${item.unit}(s).`,
            related_id: (reqRow as any)?.id ?? null,
          })),
        );
      }
    } catch {
      // non-blocking
    }
  };

  const submitMove = async () => {
    if (!moveItem) return;
    const qty = Number(moveQty);
    if (!qty || qty <= 0) { toast({ title: "Enter a valid quantity", variant: "destructive" }); return; }
    if (moveType === "dispense" && qty > moveItem.quantity_on_hand) {
      toast({ title: "Insufficient stock", description: `Only ${moveItem.quantity_on_hand} ${moveItem.unit}(s) available.`, variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.from("stock_movements").insert({
        stock_id: moveItem.id,
        facility_id: moveItem.facility_id,
        drug_name: moveItem.drug_name,
        movement_type: moveType,
        quantity: qty,
        patient_id: moveType === "dispense" ? (movePatient.trim() || null) : null,
        performed_by: user?.id ?? null,
      });
      if (error) throw error;
      const newBalance = moveType === "receipt" ? moveItem.quantity_on_hand + qty : moveItem.quantity_on_hand - qty;
      toast({ title: moveType === "receipt" ? "Stock received" : "Drug dispensed", description: `New balance: ${newBalance} ${moveItem.unit}(s).` });
      setMoveOpen(false);
      // Auto raise request if low/out after dispensing
      if (moveType === "dispense") {
        if (newBalance <= 0) await raiseStockRequest({ ...moveItem, quantity_on_hand: newBalance }, "out");
        else if (newBalance <= moveItem.reorder_level) await raiseStockRequest({ ...moveItem, quantity_on_hand: newBalance }, "low");
      }
      await load();
    } catch (e: any) {
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    } finally { setBusy(false); }
  };

  // ---------------- Referrals ----------------
  const [refOpen, setRefOpen] = useState(false);
  const [refForm, setRefForm] = useState({
    patient_id: "", patient_name: "", from_facility_id: "", to_facility_id: "",
    reason: "", clinical_summary: "", urgency: "routine",
  });

  const saveReferral = async () => {
    if (!refForm.patient_id.trim() || !refForm.to_facility_id || !refForm.reason.trim()) {
      toast({ title: "Patient ID, destination & reason are required", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const { data: row, error } = await supabase.from("patient_referrals").insert({
        project_id: projectId ?? null,
        patient_id: refForm.patient_id.trim(),
        patient_name: refForm.patient_name.trim() || null,
        from_facility_id: refForm.from_facility_id || null,
        to_facility_id: refForm.to_facility_id,
        reason: refForm.reason.trim(),
        clinical_summary: refForm.clinical_summary.trim() || null,
        urgency: refForm.urgency,
        referred_by: user?.id ?? null,
      }).select("id").single();
      if (error) throw error;
      // Notify staff at destination facility (creators of stock there) + super admins
      const to = facById.get(refForm.to_facility_id);
      const { data: admins } = await supabase.from("user_roles").select("user_id").eq("role", "super_admin");
      const recipients = [...new Set((admins || []).map((a: any) => a.user_id))];
      if (recipients.length) {
        await supabase.from("notifications").insert(recipients.map((uid) => ({
          user_id: uid,
          type: refForm.urgency === "emergency" ? "error" : "info",
          category: "referral",
          title: refForm.urgency === "emergency" ? "🚨 Emergency patient referral" : "↪ New patient referral",
          message: `Patient ${refForm.patient_id} referred to ${to?.name || "a facility"}: ${refForm.reason.trim()}.`,
          related_id: (row as any)?.id ?? null,
        })));
      }
      toast({ title: "Referral sent", description: to?.name });
      setRefOpen(false);
      setRefForm({ patient_id: "", patient_name: "", from_facility_id: "", to_facility_id: "", reason: "", clinical_summary: "", urgency: "routine" });
      await load();
    } catch (e: any) {
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    } finally { setBusy(false); }
  };

  const updateReferral = async (id: string, status: Referral["status"]) => {
    setBusy(true);
    try {
      const { error } = await supabase.from("patient_referrals").update({
        status,
        accepted_by: status === "accepted" ? (user?.id ?? null) : undefined,
        resolved_at: status === "completed" || status === "declined" ? new Date().toISOString() : null,
      }).eq("id", id);
      if (error) throw error;
      toast({ title: `Referral ${status}` });
      await load();
    } catch (e: any) {
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    } finally { setBusy(false); }
  };

  const TabBtn = ({ id, icon: Icon, label }: { id: Tab; icon: any; label: string }) => (
    <button
      onClick={() => setTab(id)}
      className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition ${tab === id ? "bg-white text-emerald-700 shadow-sm" : "text-white/80 hover:text-white"}`}
    >
      <Icon className="h-4 w-4" /> {label}
    </button>
  );

  return (
    <div className="min-h-full bg-[#F4F8F5]">
      <div className="bg-gradient-to-br from-emerald-800 to-violet-800 px-4 pb-4 pt-4 text-white">
        <button onClick={onClose} className="mb-3 inline-flex items-center gap-1.5 text-sm text-white/80 hover:text-white">
          <ArrowLeft className="h-4 w-4" /> Mental Health
        </button>
        <h1 className="text-lg font-bold leading-tight">Facilities, Pharmacy & Referrals</h1>
        <p className="mt-1 text-xs text-white/85">Register facilities, manage antidepressant stock, and refer patients.</p>
        <div className="mt-3 flex gap-1 rounded-xl bg-white/10 p-1">
          <TabBtn id="facilities" icon={Hospital} label="Facilities" />
          <TabBtn id="pharmacy" icon={Pill} label="Pharmacy" />
          <TabBtn id="referrals" icon={ArrowRightLeft} label="Referrals" />
        </div>
      </div>

      <div className="mx-auto max-w-3xl space-y-4 p-4">
        <div className="flex justify-end">
          <Button onClick={load} variant="outline" size="sm" className="gap-1.5">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Refresh
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading…
          </div>
        ) : tab === "facilities" ? (
          <>
            <Button onClick={() => setFacOpen(true)} className="w-full gap-2"><Plus className="h-4 w-4" /> Register Health Facility</Button>
            {facilities.length === 0 ? (
              <EmptyState icon={Building2} text="No facilities registered yet." />
            ) : (
              <div className="space-y-2">
                {facilities.map((f) => (
                  <div key={f.id} className="flex items-center gap-3 rounded-xl border border-emerald-100 bg-white p-3 shadow-sm">
                    <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${f.facility_type === "tertiary" ? "bg-violet-100 text-violet-700" : f.facility_type === "secondary" ? "bg-sky-100 text-sky-700" : "bg-emerald-100 text-emerald-700"}`}>
                      <Hospital className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-foreground">{f.name}</p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        <Badge variant="outline" className="mr-1 text-[9px]">{TYPE_LABEL[f.facility_type]}</Badge>
                        {[f.ward, f.lga, f.state].filter(Boolean).join(", ") || "—"}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : tab === "pharmacy" ? (
          <>
            <div className="space-y-1.5">
              <Label className="text-xs">Facility</Label>
              <Select value={pharmFacility} onValueChange={setPharmFacility}>
                <SelectTrigger><SelectValue placeholder="Select facility" /></SelectTrigger>
                <SelectContent>
                  {facilities.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={() => setStockOpen(true)} disabled={!pharmFacility} variant="outline" className="w-full gap-2"><Plus className="h-4 w-4" /> Add antidepressant to stock</Button>
            {facilityStock.length === 0 ? (
              <EmptyState icon={Pill} text="No stock items for this facility yet." />
            ) : (
              <div className="space-y-2">
                {facilityStock.map((s) => {
                  const out = s.quantity_on_hand <= 0;
                  const low = !out && s.quantity_on_hand <= s.reorder_level;
                  return (
                    <div key={s.id} className="rounded-xl border border-emerald-100 bg-white p-3 shadow-sm">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700"><Pill className="h-5 w-5" /></div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-foreground">{s.drug_name}
                            {out && <Badge className="ml-2 bg-rose-100 text-rose-700 hover:bg-rose-100 text-[9px]"><ShieldAlert className="h-2.5 w-2.5 mr-0.5" />Out</Badge>}
                            {low && <Badge className="ml-2 bg-amber-100 text-amber-700 hover:bg-amber-100 text-[9px]"><AlertTriangle className="h-2.5 w-2.5 mr-0.5" />Low</Badge>}
                          </p>
                          <p className="text-[11px] text-muted-foreground">Balance: <span className="font-semibold text-foreground tabular-nums">{s.quantity_on_hand}</span> {s.unit}(s) · reorder at {s.reorder_level}</p>
                        </div>
                      </div>
                      <div className="mt-2 flex gap-2">
                        <Button size="sm" variant="outline" className="h-7 flex-1 gap-1 text-[11px]" onClick={() => openMove(s, "receipt")}><PackagePlus className="h-3.5 w-3.5" /> Receive</Button>
                        <Button size="sm" variant="outline" className="h-7 flex-1 gap-1 text-[11px]" onClick={() => openMove(s, "dispense")} disabled={out}><PackageMinus className="h-3.5 w-3.5" /> Dispense</Button>
                        <Button size="sm" variant="outline" className="h-7 flex-1 gap-1 text-[11px]" onClick={() => raiseStockRequest(s, out ? "out" : "low")}><BellRing className="h-3.5 w-3.5" /> Request</Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        ) : (
          <>
            <Button onClick={() => setRefOpen(true)} disabled={facilities.length === 0} className="w-full gap-2"><Send className="h-4 w-4" /> Refer / Transfer Patient</Button>
            {facilities.length === 0 && <p className="text-center text-xs text-muted-foreground">Register at least one facility first.</p>}
            {referrals.length === 0 ? (
              <EmptyState icon={ArrowRightLeft} text="No referrals yet." />
            ) : (
              <div className="space-y-2">
                {referrals.map((r) => (
                  <div key={r.id} className="rounded-xl border border-emerald-100 bg-white p-3 shadow-sm">
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-foreground">
                          {r.patient_name || r.patient_id}
                          {r.urgency === "emergency" && <Badge className="ml-2 bg-rose-100 text-rose-700 hover:bg-rose-100 text-[9px]">Emergency</Badge>}
                        </p>
                        <p className="truncate text-[11px] text-muted-foreground">
                          {facById.get(r.from_facility_id || "")?.name || "—"} → {facById.get(r.to_facility_id)?.name || "—"}
                        </p>
                        <p className="mt-0.5 text-[11px] text-foreground/80">{r.reason}</p>
                      </div>
                      <Badge variant="outline" className={`shrink-0 text-[9px] ${r.status === "completed" ? "border-emerald-300 text-emerald-700" : r.status === "declined" ? "border-rose-300 text-rose-700" : r.status === "accepted" ? "border-sky-300 text-sky-700" : "border-slate-300 text-slate-600"}`}>{r.status}</Badge>
                    </div>
                    {(r.status === "initiated" || r.status === "accepted") && (
                      <div className="mt-2 flex gap-2">
                        {r.status === "initiated" && <Button size="sm" variant="outline" className="h-7 flex-1 gap-1 text-[11px] border-sky-300 text-sky-700" onClick={() => updateReferral(r.id, "accepted")}><CheckCircle2 className="h-3.5 w-3.5" /> Accept</Button>}
                        {r.status === "accepted" && <Button size="sm" variant="outline" className="h-7 flex-1 gap-1 text-[11px] border-emerald-300 text-emerald-700" onClick={() => updateReferral(r.id, "completed")}><CheckCircle2 className="h-3.5 w-3.5" /> Complete</Button>}
                        <Button size="sm" variant="outline" className="h-7 flex-1 gap-1 text-[11px] border-rose-300 text-rose-700" onClick={() => updateReferral(r.id, "declined")}><XCircle className="h-3.5 w-3.5" /> Decline</Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Facility dialog */}
      <Dialog open={facOpen} onOpenChange={setFacOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Register Health Facility</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Field label="Facility name"><Input value={facForm.name} onChange={(e) => setFacForm((f) => ({ ...f, name: e.target.value }))} /></Field>
            <Field label="Facility type">
              <Select value={facForm.facility_type} onValueChange={(v) => setFacForm((f) => ({ ...f, facility_type: v as any }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="phc">Primary Health Center</SelectItem>
                  <SelectItem value="secondary">Secondary Health Facility</SelectItem>
                  <SelectItem value="tertiary">Tertiary Health Facility</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="State">
              <Select value={facForm.state} onValueChange={(v) => setFacForm((f) => ({ ...f, state: v }))}>
                <SelectTrigger><SelectValue placeholder="Select state" /></SelectTrigger>
                <SelectContent>{getAllStates().map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="LGA"><Input value={facForm.lga} onChange={(e) => setFacForm((f) => ({ ...f, lga: e.target.value }))} /></Field>
              <Field label="Ward"><Input value={facForm.ward} onChange={(e) => setFacForm((f) => ({ ...f, ward: e.target.value }))} /></Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Contact person"><Input value={facForm.contact_person} onChange={(e) => setFacForm((f) => ({ ...f, contact_person: e.target.value }))} /></Field>
              <Field label="Contact phone"><Input value={facForm.contact_phone} onChange={(e) => setFacForm((f) => ({ ...f, contact_phone: e.target.value }))} /></Field>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFacOpen(false)}>Cancel</Button>
            <Button onClick={saveFacility} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Register"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add stock item dialog */}
      <Dialog open={stockOpen} onOpenChange={setStockOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Add antidepressant to stock</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Field label="Antidepressant">
              <Select value={stockForm.drug_name} onValueChange={(v) => setStockForm((s) => ({ ...s, drug_name: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{ANTIDEPRESSANTS.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Unit"><Input value={stockForm.unit} onChange={(e) => setStockForm((s) => ({ ...s, unit: e.target.value }))} /></Field>
              <Field label="Reorder level"><Input type="number" value={stockForm.reorder_level} onChange={(e) => setStockForm((s) => ({ ...s, reorder_level: e.target.value }))} /></Field>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStockOpen(false)}>Cancel</Button>
            <Button onClick={addStockItem} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Movement dialog */}
      <Dialog open={moveOpen} onOpenChange={setMoveOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{moveType === "receipt" ? "Receive stock" : "Dispense"} — {moveItem?.drug_name}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">Current balance: {moveItem?.quantity_on_hand} {moveItem?.unit}(s)</p>
            <Field label={`Quantity (${moveItem?.unit})`}><Input type="number" value={moveQty} onChange={(e) => setMoveQty(e.target.value)} autoFocus /></Field>
            {moveType === "dispense" && <Field label="Patient ID (optional)"><Input value={movePatient} onChange={(e) => setMovePatient(e.target.value)} placeholder="Link to a patient" /></Field>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMoveOpen(false)}>Cancel</Button>
            <Button onClick={submitMove} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : moveType === "receipt" ? "Receive" : "Dispense"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Referral dialog */}
      <Dialog open={refOpen} onOpenChange={setRefOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Refer / Transfer Patient</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Patient ID"><Input value={refForm.patient_id} onChange={(e) => setRefForm((f) => ({ ...f, patient_id: e.target.value }))} /></Field>
              <Field label="Patient name (optional)"><Input value={refForm.patient_name} onChange={(e) => setRefForm((f) => ({ ...f, patient_name: e.target.value }))} /></Field>
            </div>
            <Field label="From facility (optional)">
              <Select value={refForm.from_facility_id} onValueChange={(v) => setRefForm((f) => ({ ...f, from_facility_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Originating facility" /></SelectTrigger>
                <SelectContent>{facilities.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="To facility">
              <Select value={refForm.to_facility_id} onValueChange={(v) => setRefForm((f) => ({ ...f, to_facility_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Destination facility" /></SelectTrigger>
                <SelectContent>{facilities.filter((f) => f.id !== refForm.from_facility_id).map((f) => <SelectItem key={f.id} value={f.id}>{f.name} · {TYPE_LABEL[f.facility_type]}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Urgency">
              <Select value={refForm.urgency} onValueChange={(v) => setRefForm((f) => ({ ...f, urgency: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="routine">Routine</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                  <SelectItem value="emergency">Emergency</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Reason for referral"><Input value={refForm.reason} onChange={(e) => setRefForm((f) => ({ ...f, reason: e.target.value }))} /></Field>
            <Field label="Clinical summary (optional)">
              <textarea value={refForm.clinical_summary} onChange={(e) => setRefForm((f) => ({ ...f, clinical_summary: e.target.value }))} rows={3} className="w-full rounded-md border border-input bg-background p-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRefOpen(false)}>Cancel</Button>
            <Button onClick={saveReferral} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send referral"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="space-y-1.5"><Label className="text-xs">{label}</Label>{children}</div>
);

const EmptyState = ({ icon: Icon, text }: { icon: any; text: string }) => (
  <div className="rounded-xl border border-dashed border-slate-200 bg-white py-12 text-center text-muted-foreground">
    <Icon className="mx-auto mb-2 h-9 w-9 text-slate-300" />
    <p className="text-sm">{text}</p>
  </div>
);

export default ClinicalSuiteView;

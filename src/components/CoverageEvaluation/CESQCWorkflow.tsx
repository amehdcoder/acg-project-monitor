import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/fetchAllRows";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  MapPin, Loader2, Camera, Save, Crosshair, AlertTriangle, ShieldCheck,
  CheckCircle2, XCircle, Shield, Footprints, FileSearch,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import CESSurveyMap from "./CESSurveyMap";
import CESPeerValidationsPanel from "./CESPeerValidationsPanel";
import { useAuth } from "@/hooks/useAuth";

interface CESQCWorkflowProps {
  surveyId: string;
  onClose: () => void;
}

type Mode = "revisit" | "desk_review";
type Verdict = "confirmed" | "disputed" | "needs_resample";

const COVERAGE_OPTIONS = [
  { value: "treated", label: "Treated", icon: CheckCircle2, color: "text-green-600" },
  { value: "not_treated", label: "Not Treated", icon: XCircle, color: "text-red-600" },
  { value: "absent", label: "Absent", icon: MapPin, color: "text-slate-500" },
  { value: "refused", label: "Refused", icon: Shield, color: "text-red-700" },
  { value: "ineligible", label: "Ineligible", icon: AlertTriangle, color: "text-yellow-600" },
];

export default function CESQCWorkflow({ surveyId, onClose }: CESQCWorkflowProps) {
  const { isOwner } = useAuth();
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<Mode>("revisit");
  const [survey, setSurvey] = useState<any>(null);
  const [me, setMe] = useState<string | null>(null);
  const [households, setHouseholds] = useState<any[]>([]);
  const [existingValidation, setExistingValidation] = useState<any | null>(null);

  // Revisit mode state
  const [gps, setGps] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [revisits, setRevisits] = useState<Record<string, { agree: boolean; status: string; photo?: string }>>({});
  const [pickerOpen, setPickerOpen] = useState(false);
  const [activeHH, setActiveHH] = useState<any | null>(null);
  const [revisitForm, setRevisitForm] = useState({ status: "treated", photo: "" });

  // Desk-review mode state
  const [deskReview, setDeskReview] = useState<Record<string, Verdict>>({});

  const [verdict, setVerdict] = useState<Verdict>("confirmed");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  // GPS lock (revisit mode)
  useEffect(() => {
    if (mode !== "revisit") return;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => setGps({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }),
      (err) => console.error("GPS error", err),
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 20000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [mode]);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: u } = await supabase.auth.getUser();
    setMe(u.user?.id ?? null);

    const { data: s } = await supabase.from("ces_surveys" as any).select("*").eq("id", surveyId).single();
    setSurvey(s);

    const hh = await fetchAllRows<any>((from, to) =>
      supabase.from("ces_household_visits" as any).select("*").eq("survey_id", surveyId).range(from, to)
    );
    setHouseholds(hh);

    // Existing validation by this user (if any)
    if (u.user?.id) {
      const { data: ex } = await supabase
        .from("ces_peer_validations" as any)
        .select("*")
        .eq("survey_id", surveyId)
        .eq("validator_id", u.user.id)
        .maybeSingle();
      if (ex) {
        setExistingValidation(ex);
        setMode((ex as any).mode);
        setVerdict((ex as any).verdict);
        setNotes((ex as any).notes ?? "");
      }
    }
    setLoading(false);
  }, [surveyId]);

  useEffect(() => { load(); }, [load]);

  const isSelf = !!(survey && me && survey.created_by === me);
  const selfValidationBlocked = isSelf && !isOwner;
  const sampledForRevisit = (() => {
    if (households.length === 0) return [];
    const target = Math.max(2, Math.ceil(households.length * 0.1));
    // deterministic by id sort to keep selection stable across reloads
    return [...households].sort((a, b) => String(a.id).localeCompare(String(b.id))).slice(0, target);
  })();

  const handleMapTap = () => {
    if (!gps) { toast({ title: "No GPS", variant: "destructive" }); return; }
    const pending = sampledForRevisit.filter(h => !revisits[h.id]);
    for (const p of pending) {
      const R = 6371e3;
      const p1 = gps.lat * Math.PI / 180, p2 = p.latitude * Math.PI / 180;
      const dp = (p.latitude - gps.lat) * Math.PI / 180, dl = (p.longitude - gps.lng) * Math.PI / 180;
      const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
      const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      if (dist < 30) {
        setActiveHH(p);
        setRevisitForm({ status: "treated", photo: "" });
        setPickerOpen(true);
        return;
      }
    }
    toast({ title: "Too Far", description: "Stand within 30m of a pending household pin.", variant: "destructive" });
  };

  const handlePhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return;
    const r = new FileReader();
    r.onload = ev => setRevisitForm(s => ({ ...s, photo: String(ev.target?.result || "") }));
    r.readAsDataURL(f);
  };

  const submitRevisit = () => {
    if (!activeHH) return;
    if (!revisitForm.photo) { toast({ title: "Photo required", variant: "destructive" }); return; }
    const agree = activeHH.coverage_status === revisitForm.status;
    setRevisits(prev => ({ ...prev, [activeHH.id]: { agree, status: revisitForm.status, photo: revisitForm.photo } }));
    setPickerOpen(false);
    toast({ title: agree ? "Agreed ✅" : "Disagreed ⚠️", description: `Logged for HH ${activeHH.hh_number}` });
  };

  const revisitStats = (() => {
    const total = sampledForRevisit.length;
    const done = Object.keys(revisits).length;
    const agreed = Object.values(revisits).filter(r => r.agree).length;
    const pct = done > 0 ? Math.round((agreed / done) * 1000) / 10 : null;
    return { total, done, agreed, pct };
  })();

  const deskStats = (() => {
    const total = households.length;
    const done = Object.keys(deskReview).length;
    const confirmed = Object.values(deskReview).filter(v => v === "confirmed").length;
    return { total, done, confirmed };
  })();

  const computedVerdict = (): Verdict => {
    if (mode === "revisit") {
      const pct = revisitStats.pct ?? 0;
      if (pct >= 80) return "confirmed";
      if (pct < 50) return "needs_resample";
      return "disputed";
    }
    const total = deskStats.total || 1;
    const needs = Object.values(deskReview).filter(v => v === "needs_resample").length;
    const disputed = Object.values(deskReview).filter(v => v === "disputed").length;
    if (needs / total >= 0.2) return "needs_resample";
    if (disputed > 0) return "disputed";
    return "confirmed";
  };

  useEffect(() => { setVerdict(computedVerdict()); /* eslint-disable-next-line */ }, [revisits, deskReview, mode]);

  const submitValidation = async () => {
    if (selfValidationBlocked) {
      toast({ title: "Self-validation blocked", description: "You created this survey and cannot validate it.", variant: "destructive" });
      return;
    }
    if (!me) return;
    setSaving(true);

    const payload: any = {
      survey_id: surveyId,
      validator_id: me,
      mode,
      verdict,
      notes: notes.trim() || null,
    };
    if (mode === "revisit") {
      payload.households_revisited = revisitStats.done;
      payload.households_agreed = revisitStats.agreed;
      payload.agreement_pct = revisitStats.pct;
    } else {
      payload.households_revisited = deskStats.done;
      payload.households_agreed = deskStats.confirmed;
      payload.agreement_pct = deskStats.done > 0
        ? Math.round((deskStats.confirmed / deskStats.done) * 1000) / 10
        : null;
    }

    const op = existingValidation
      ? supabase.from("ces_peer_validations" as any).update(payload).eq("id", existingValidation.id)
      : supabase.from("ces_peer_validations" as any).insert(payload);
    const { error } = await op;
    setSaving(false);
    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Validation saved", description: `Verdict: ${verdict.replace("_", " ")}` });
    onClose();
  };

  if (loading) return <div className="p-8 flex justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>;

  if (selfValidationBlocked) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-primary" /> Peer Validation</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              You created this CES survey and cannot peer-validate your own work. Ask another team member with the
              <strong> peer_validator</strong> role to perform validation.
            </AlertDescription>
          </Alert>
          <div className="flex justify-end"><Button variant="outline" onClick={onClose}>Close</Button></div>
        </CardContent>
      </Card>
    );
  }

  const mapHouseholds = sampledForRevisit.map((h: any) => ({
    id: h.id, hh_number: h.hh_number,
    lat: h.latitude, lng: h.longitude,
    coverage_status: revisits[h.id] ? (revisits[h.id].agree ? "treated" : "not_treated") : "absent",
  }));

  const accuracyColor = !gps ? "text-muted-foreground" : gps.accuracy <= 20 ? "text-green-600" : "text-red-600";

  return (
    <div className="space-y-3">
      <CESPeerValidationsPanel surveyId={surveyId} collapsible />
      <Card>
        <CardHeader>
          <div className="flex justify-between items-start gap-2 flex-wrap">
            <div className="min-w-0">
              <CardTitle className="flex items-center gap-2 text-base">
                <ShieldCheck className="h-5 w-5 text-primary" />
                Peer Validation — choose mode per survey
              </CardTitle>
              <CardDescription className="text-xs">
                You may validate by physically revisiting a 10% sub-sample, or by reviewing submissions and photos at the desk.
              </CardDescription>
            </div>
            <ToggleGroup type="single" value={mode} onValueChange={(v) => v && setMode(v as Mode)} size="sm">
              <ToggleGroupItem value="revisit" className="text-xs"><Footprints className="h-3.5 w-3.5 mr-1" />Revisit</ToggleGroupItem>
              <ToggleGroupItem value="desk_review" className="text-xs"><FileSearch className="h-3.5 w-3.5 mr-1" />Desk review</ToggleGroupItem>
            </ToggleGroup>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
            <TabsList className="grid grid-cols-2 mb-3">
              <TabsTrigger value="revisit"><Footprints className="h-3.5 w-3.5 mr-1" />Revisit (≥10%)</TabsTrigger>
              <TabsTrigger value="desk_review"><FileSearch className="h-3.5 w-3.5 mr-1" />Desk review</TabsTrigger>
            </TabsList>

            <TabsContent value="revisit" className="space-y-3 mt-0">
              <div className="flex justify-between items-center">
                <Alert className="flex-1 mr-3 py-2">
                  <MapPin className="h-4 w-4" />
                  <AlertDescription className="text-xs">
                    Walk within 30m of a sampled household pin and tap it. Re-record coverage blindly; we auto-compare.
                  </AlertDescription>
                </Alert>
                <div className="flex flex-col items-end gap-1">
                  <div className="flex items-center gap-1 text-xs">
                    <Crosshair className={`h-3.5 w-3.5 ${accuracyColor}`} />
                    <span className={accuracyColor}>{gps ? `±${gps.accuracy.toFixed(0)}m` : "No GPS"}</span>
                  </div>
                  <Badge variant="outline" className="text-[10px]">
                    {revisitStats.done}/{revisitStats.total} done • {revisitStats.pct ?? 0}% agree
                  </Badge>
                </div>
              </div>
              {survey?.center_lat && (
                <CESSurveyMap
                  centerLat={survey.center_lat}
                  centerLng={survey.center_lng}
                  perimeter={survey.perimeter_coords || []}
                  segments={[]}
                  selectedSegmentIds={[]}
                  households={mapHouseholds as any}
                  basemap="google"
                  onMapTap={handleMapTap}
                  height="50vh"
                />
              )}
            </TabsContent>

            <TabsContent value="desk_review" className="space-y-2 mt-0">
              <Alert className="py-2">
                <FileSearch className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  Review each submission and any attached photo. Mark as Confirmed, Disputed, or Needs resample.
                </AlertDescription>
              </Alert>
              <div className="border rounded-md max-h-[55vh] overflow-y-auto divide-y">
                {households.length === 0 && <div className="p-6 text-center text-xs text-muted-foreground">No household visits to review.</div>}
                {households.map((h: any) => {
                  const v = deskReview[h.id];
                  return (
                    <div key={h.id} className="p-2 flex items-center gap-2 text-xs">
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold truncate">HH {h.hh_number} • {h.coverage_status}</div>
                        <div className="text-[10px] text-muted-foreground truncate">
                          {h.commodity || "—"} • {h.treated_persons ?? 0}/{h.eligible_persons ?? 0} treated
                          {h.notes ? ` • ${h.notes}` : ""}
                        </div>
                      </div>
                      {h.photo_url && <img src={h.photo_url} alt="" className="h-10 w-10 object-cover rounded" />}
                      <ToggleGroup type="single" size="sm" value={v ?? ""} onValueChange={(val) => val && setDeskReview(p => ({ ...p, [h.id]: val as Verdict }))}>
                        <ToggleGroupItem value="confirmed" className="text-[10px] h-7 px-2">OK</ToggleGroupItem>
                        <ToggleGroupItem value="disputed" className="text-[10px] h-7 px-2">Dispute</ToggleGroupItem>
                        <ToggleGroupItem value="needs_resample" className="text-[10px] h-7 px-2">Resample</ToggleGroupItem>
                      </ToggleGroup>
                    </div>
                  );
                })}
              </div>
              <div className="text-[10px] text-muted-foreground">{deskStats.done}/{deskStats.total} reviewed • {deskStats.confirmed} confirmed</div>
            </TabsContent>
          </Tabs>

          <div className="mt-4 grid sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Final verdict</Label>
              <ToggleGroup type="single" value={verdict} onValueChange={(v) => v && setVerdict(v as Verdict)} size="sm" className="justify-start">
                <ToggleGroupItem value="confirmed" className="text-xs">Confirmed</ToggleGroupItem>
                <ToggleGroupItem value="disputed" className="text-xs">Disputed</ToggleGroupItem>
                <ToggleGroupItem value="needs_resample" className="text-xs">Needs resample</ToggleGroupItem>
              </ToggleGroup>
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Notes (optional)</Label>
              <Textarea value={notes} onChange={e => setNotes(e.target.value)} className="text-xs min-h-[60px]" placeholder="What did you observe?" />
            </div>
          </div>

          <div className="flex justify-end gap-2 mt-3">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={submitValidation} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
              {existingValidation ? "Update validation" : "Submit validation"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Validate HH {activeHH?.hh_number}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Alert className="bg-amber-50 dark:bg-amber-950/30">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <AlertDescription className="text-xs">
                Original interviewer's answer is hidden. Re-record what you actually observe.
              </AlertDescription>
            </Alert>
            <div className="space-y-2">
              <Label className="text-xs font-semibold">1. Verification photo</Label>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" className="relative overflow-hidden">
                  <Camera className="h-4 w-4 mr-2" /> Capture
                  <input type="file" accept="image/*" capture="environment" className="absolute inset-0 opacity-0 cursor-pointer" onChange={handlePhoto} />
                </Button>
                {revisitForm.photo && <Badge variant="default" className="bg-green-600">Captured</Badge>}
              </div>
              {revisitForm.photo && <img src={revisitForm.photo} alt="Preview" className="h-24 w-auto rounded-md object-cover border" />}
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-semibold">2. Coverage status</Label>
              <div className="grid grid-cols-2 gap-2">
                {COVERAGE_OPTIONS.map((o) => (
                  <Button key={o.value} size="sm"
                    variant={revisitForm.status === o.value ? "default" : "outline"}
                    onClick={() => setRevisitForm(f => ({ ...f, status: o.value }))}
                    className="justify-start text-xs">
                    <o.icon className={`h-4 w-4 mr-1 ${o.color}`} />{o.label}
                  </Button>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPickerOpen(false)}>Cancel</Button>
            <Button onClick={submitRevisit}><Save className="h-4 w-4 mr-1" />Log result</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

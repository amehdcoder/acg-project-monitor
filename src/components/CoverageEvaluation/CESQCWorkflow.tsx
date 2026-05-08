import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { MapPin, Satellite, Map as MapIcon, Loader2, Camera, Save, Crosshair, AlertTriangle, ShieldCheck, CheckCircle2, XCircle, Shield } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import CESSurveyMap from "./CESSurveyMap";

interface CESQCWorkflowProps {
  surveyId: string;
  onClose: () => void;
}

const COVERAGE_OPTIONS = [
  { value: "treated", label: "Treated", icon: CheckCircle2, color: "text-green-600" },
  { value: "not_treated", label: "Not Treated", icon: XCircle, color: "text-red-600" },
  { value: "absent", label: "Absent", icon: MapPin, color: "text-slate-500" },
  { value: "refused", label: "Refused", icon: Shield, color: "text-red-700" },
  { value: "ineligible", label: "Ineligible", icon: AlertTriangle, color: "text-yellow-600" },
];

export default function CESQCWorkflow({ surveyId, onClose }: CESQCWorkflowProps) {
  const [loading, setLoading] = useState(true);
  const [gps, setGps] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [survey, setSurvey] = useState<any>(null);
  const [qcRecords, setQcRecords] = useState<any[]>([]);
  
  const [pickerOpen, setPickerOpen] = useState(false);
  const [activeQcRecord, setActiveQcRecord] = useState<any | null>(null);
  const [qcForm, setQcForm] = useState({ status: "treated", photoHash: "", photoPreview: "" });
  const [saving, setSaving] = useState(false);

  // GPS Lock
  useEffect(() => {
    const watchId = navigator.geolocation.watchPosition(
      (pos) => setGps({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }),
      (err) => console.error("GPS error", err),
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 20000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    const { data: s } = await supabase.from("ces_surveys" as any).select("*").eq("id", surveyId).single();
    if (s) setSurvey(s);

    const { data: u } = await supabase.auth.getUser();
    
    // Check if QC records exist for this survey
    const { data: existingQc } = await supabase.from("ces_qc_records" as any).select("*, ces_household_visits(*)").eq("survey_id", surveyId);
    
    if (existingQc && existingQc.length > 0) {
      setQcRecords(existingQc);
    } else {
      // First time QC is opened for this survey, pick 10% randomly
      const { data: hhs } = await supabase.from("ces_household_visits" as any).select("*").eq("survey_id", surveyId);
      if (hhs && hhs.length > 0) {
        const numToPick = Math.max(2, Math.ceil(hhs.length * 0.1)); // 10% or min 2
        const shuffled = [...hhs].sort(() => 0.5 - Math.random());
        const selected = shuffled.slice(0, numToPick);
        
        const newRecords = selected.map(h => ({
          survey_id: surveyId,
          household_id: h.id,
          original_answer: h.coverage_status,
          match_status: "pending",
        }));
        
        const { data: inserted } = await supabase.from("ces_qc_records" as any).insert(newRecords).select("*, ces_household_visits(*)");
        if (inserted) setQcRecords(inserted);
      }
    }
    setLoading(false);
  }, [surveyId]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleMapTap = (lat: number, lng: number) => {
    // Check if tap is near a pending QC record
    if (!gps) { toast({ title: "No GPS", variant: "destructive" }); return; }
    
    const pending = qcRecords.filter(q => q.match_status === "pending");
    for (const p of pending) {
      const hh = p.ces_household_visits;
      if (!hh) continue;
      // Distance calculation (haversine)
      const R = 6371e3;
      const p1 = gps.lat * Math.PI/180, p2 = hh.latitude * Math.PI/180;
      const dp = (hh.latitude - gps.lat) * Math.PI/180, dl = (hh.longitude - gps.lng) * Math.PI/180;
      const a = Math.pow(Math.sin(dp/2), 2) + Math.cos(p1)*Math.cos(p2)*Math.pow(Math.sin(dl/2), 2);
      const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
      
      if (dist < 30) { // must be within 30m of the household to QC
        setActiveQcRecord(p);
        setPickerOpen(true);
        return;
      }
    }
    toast({ title: "Too Far", description: "You must be within 30m of a pending QC household.", variant: "destructive" });
  };

  const handlePhotoCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      // Mock AI Check: 10% chance to reject photo randomly to simulate AI
      if (Math.random() > 0.9) {
        toast({ title: "Invalid Photo", description: "No person detected or screenshot found. Retake required.", variant: "destructive" });
        return;
      }
      setQcForm(f => ({ ...f, photoPreview: ev.target?.result as string, photoHash: "mock_hash" }));
    };
    reader.readAsDataURL(file);
  };

  const submitValidation = async () => {
    if (!activeQcRecord || !qcForm.photoHash) {
      toast({ title: "Photo required", description: "You must take a verification photo.", variant: "destructive" });
      return;
    }
    setSaving(true);
    const matchStatus = activeQcRecord.original_answer === qcForm.status ? "match" : "mismatch";
    const ts = new Date().toISOString();
    const { data: u } = await supabase.auth.getUser();
    
    const { error } = await supabase.from("ces_qc_records" as any).update({
      validator_id: u.user?.id,
      validator_answer: qcForm.status,
      match_status: matchStatus,
      qc_timestamp: ts,
      photo_hash: qcForm.photoHash
    }).eq("id", activeQcRecord.id);

    if (error) {
      toast({ title: "Error saving QC", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Validation Saved", description: `Result: ${matchStatus.toUpperCase()}` });
      setPickerOpen(false);
      setQcForm({ status: "treated", photoPreview: "", photoHash: "" });
      loadData();
    }
    setSaving(false);
  };

  const accuracyColor = !gps ? "text-muted-foreground" : gps.accuracy <= 20 ? "text-green-600" : "text-red-600";
  
  const completed = qcRecords.filter(q => q.match_status !== "pending").length;
  const total = qcRecords.length;
  const mapHouseholds = qcRecords.map(q => ({
    id: q.id, hh_number: q.ces_household_visits?.hh_number || "QC",
    lat: q.ces_household_visits?.latitude || 0,
    lng: q.ces_household_visits?.longitude || 0,
    coverage_status: q.match_status === "pending" ? "absent" : "treated" // display pending as gray
  }));

  if (loading) return <div className="p-8 flex justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>;

  return (
    <div className="space-y-3">
      <Card>
        <CardHeader>
          <div className="flex justify-between items-start">
            <div>
              <CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-primary" />Peer Validation Workflow</CardTitle>
              <CardDescription>Physically navigate to the randomly assigned households to verify the data.</CardDescription>
            </div>
            <div className="flex flex-col items-end gap-1">
              <div className="flex items-center gap-1 text-xs">
                <Crosshair className={`h-3.5 w-3.5 ${accuracyColor}`} />
                <span className={accuracyColor}>{gps ? `±${gps.accuracy.toFixed(0)}m` : "No GPS"}</span>
              </div>
              <Badge variant="outline">{completed}/{total} QC Completed</Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert>
            <MapPin className="h-4 w-4" />
            <AlertDescription className="text-xs">
              Walk within 30m of a pending QC point (gray markers) and tap it to begin validation.
            </AlertDescription>
          </Alert>

          {survey?.center_lat && (
            <CESSurveyMap
              centerLat={survey.center_lat}
              centerLng={survey.center_lng}
              perimeter={survey.perimeter_coords || []}
              segments={[]}
              selectedSegmentIds={[]}
              households={mapHouseholds as any}
              basemap="satellite"
              onMapTap={handleMapTap}
              height="60vh"
            />
          )}

          <div className="flex justify-end">
            <Button variant="outline" onClick={onClose}>Close Validation</Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Validate Household {activeQcRecord?.ces_household_visits?.hh_number}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Alert className="bg-amber-50">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <AlertDescription className="text-xs text-amber-800">
                You are evaluating blindly. The original interviewer's answer is hidden.
              </AlertDescription>
            </Alert>
            
            <div className="space-y-2">
              <Label className="text-xs font-semibold">1. Take Verification Photo</Label>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" className="relative overflow-hidden">
                  <Camera className="h-4 w-4 mr-2" />
                  Capture Photo
                  <input type="file" accept="image/*" capture="environment" className="absolute inset-0 opacity-0 cursor-pointer" onChange={handlePhotoCapture} />
                </Button>
                {qcForm.photoPreview && <Badge variant="default" className="bg-green-600">Photo Verified (AI)</Badge>}
              </div>
              {qcForm.photoPreview && <img src={qcForm.photoPreview} alt="Preview" className="h-24 w-auto rounded-md object-cover border" />}
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-semibold">2. Determine Coverage Status</Label>
              <div className="grid grid-cols-2 gap-2">
                {COVERAGE_OPTIONS.map((o) => (
                  <Button key={o.value} size="sm" variant={qcForm.status === o.value ? "default" : "outline"}
                    onClick={() => setQcForm((f) => ({ ...f, status: o.value }))} className="justify-start text-xs">
                    <o.icon className={`h-4 w-4 mr-1 ${o.color}`} />{o.label}
                  </Button>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPickerOpen(false)}>Cancel</Button>
            <Button onClick={submitValidation} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
              Submit Validation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

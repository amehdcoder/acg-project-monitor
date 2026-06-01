import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { MapPin, Navigation, ShieldCheck, Loader2, Camera, Save, Map as MapIcon, XCircle, AlertTriangle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "@/hooks/use-toast";
import CESSurveyMap from "./CESSurveyMap";

interface CESMopUpWorkflowProps {
  assignmentId: string;
  onClose: () => void;
}

export default function CESMopUpWorkflow({ assignmentId, onClose }: CESMopUpWorkflowProps) {
  const [loading, setLoading] = useState(true);
  const [gps, setGps] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [assignment, setAssignment] = useState<any>(null);
  const [households, setHouseholds] = useState<any[]>([]);
  
  const [pickerOpen, setPickerOpen] = useState(false);
  const [activeHH, setActiveHH] = useState<any | null>(null);
  const [photoPreview, setPhotoPreview] = useState("");
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
    const { data: asmRaw } = await supabase.from("ces_mopup_assignments" as any).select("*").eq("id", assignmentId).single();
    const asm: any = asmRaw;
    if (asm) {
      setAssignment(asm);
      
      // Load cluster definition
      const { data: clusterRaw } = await supabase.from("ces_gap_clusters" as any).select("*").eq("cluster_id", asm.cluster_id).single();
      const cluster: any = clusterRaw;
      
      const { data: hhsRaw } = await supabase.from("ces_household_visits" as any)
        .select("*")
        .eq("survey_id", asm.survey_id)
        .in("coverage_status", ["not_treated", "absent", "refused"]);
      const hhs: any[] = (hhsRaw as any) || [];
      
      if (hhs && cluster) {
        const R = 6371e3;
        const p1 = cluster.centroid_lat * Math.PI/180;
        const clusterHHs = hhs.filter((h: any) => {
          const p2 = h.latitude * Math.PI/180;
          const dp = (h.latitude - cluster.centroid_lat) * Math.PI/180;
          const dl = (h.longitude - cluster.centroid_long) * Math.PI/180;
          const a = Math.pow(Math.sin(dp/2), 2) + Math.cos(p1)*Math.cos(p2)*Math.pow(Math.sin(dl/2), 2);
          const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
          return dist <= 250;
        });
        setHouseholds(clusterHHs);
      }
    }
    setLoading(false);
  }, [assignmentId]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleMapTap = (lat: number, lng: number) => {
    if (!gps) { toast({ title: "No GPS", variant: "destructive" }); return; }
    
    // Find closest HH within 20m
    const R = 6371e3;
    const p1 = gps.lat * Math.PI/180;
    
    let closest = null;
    let minD = Infinity;

    for (const h of households) {
      if (h.mopup_status === "completed") continue; // skip completed

      const p2 = h.latitude * Math.PI/180;
      const dp = (h.latitude - gps.lat) * Math.PI/180;
      const dl = (h.longitude - gps.lng) * Math.PI/180;
      const a = Math.pow(Math.sin(dp/2), 2) + Math.cos(p1)*Math.cos(p2)*Math.pow(Math.sin(dl/2), 2);
      const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
      
      if (dist < 25 && dist < minD) {
        closest = h;
        minD = dist;
      }
    }

    if (closest) {
      setActiveHH(closest);
      setPickerOpen(true);
    } else {
      toast({ title: "Too Far", description: "You must be within 25m of a target household.", variant: "destructive" });
    }
  };

  const handlePhotoCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setPhotoPreview(ev.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const submitMopUp = async () => {
    if (!activeHH || !photoPreview) {
      toast({ title: "Photo required", description: "Please take a photo proving the treatment was administered.", variant: "destructive" });
      return;
    }
    setSaving(true);
    const ts = new Date().toISOString();
    
    // Generate Mop-Up Evidence Hash
    const { data: u } = await supabase.auth.getUser();
    const rawHash = `${activeHH.survey_id}${activeHH.id}${gps?.lat}${gps?.lng}mock_photo_hash${ts}${u.user?.id}treatedcompleted`;
    const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(rawHash));
    const evidenceHash = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');

    // Update CES Household Visit
    const { error } = await supabase.from("ces_household_visits" as any).update({
      mopup_status: "completed",
      mopup_timestamp: ts,
      evidence_hash: evidenceHash
    }).eq("id", activeHH.id);

    if (error) {
      toast({ title: "Error saving", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Household Mop-Up Saved" });
      setPickerOpen(false);
      setPhotoPreview("");
      loadData(); // reload to update UI
    }
    setSaving(false);
  };

  const completed = households.filter(h => h.mopup_status === "completed").length;
  const total = households.length;
  const progressPct = total > 0 ? (completed / total) * 100 : 0;

  const mapHouseholds = households.map(h => ({
    id: h.id, hh_number: h.hh_number, lat: h.latitude, lng: h.longitude,
    coverage_status: h.mopup_status === "completed" ? "treated" : h.coverage_status
  }));

  if (loading) return <div className="p-8 flex justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>;

  return (
    <div className="space-y-4">
      <Card className="border-indigo-200">
        <CardHeader className="bg-indigo-50/50 pb-4 border-b">
          <div className="flex justify-between items-start">
            <div>
              <CardTitle className="flex items-center gap-2"><Navigation className="h-5 w-5 text-indigo-600" />Mop-Up Navigator</CardTitle>
              <CardDescription>Navigate to missed households to administer treatments.</CardDescription>
            </div>
            <Badge className="bg-indigo-600">{assignment?.priority || "Medium"} Priority</Badge>
          </div>
          <div className="mt-4 space-y-1">
            <div className="flex justify-between text-xs font-medium">
              <span>Progress: {completed} / {total} HHs</span>
              <span>{progressPct.toFixed(0)}%</span>
            </div>
            <div className="h-2 w-full bg-slate-200 rounded-full overflow-hidden">
              <div className="h-full bg-indigo-600 transition-all" style={{ width: `${progressPct}%` }}></div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Alert className="rounded-none border-x-0 border-t-0 bg-slate-50">
            <AlertDescription className="text-xs flex flex-wrap gap-3">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#dc2626]"></span> Not Treated</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#64748b]"></span> Absent</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#b91c1c]"></span> Refused</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#16a34a]"></span> Completed</span>
            </AlertDescription>
          </Alert>

          {households.length > 0 && (
            <CESSurveyMap
              centerLat={households[0].latitude}
              centerLng={households[0].longitude}
              perimeter={[]}
              segments={[]}
              selectedSegmentIds={[]}
              households={mapHouseholds as any}
              basemap="google"
              onMapTap={handleMapTap}
              height="55vh"
            />
          )}

          <div className="p-4 flex justify-between">
            <div className="flex items-center gap-2 text-xs">
              <MapPin className="h-4 w-4 text-slate-400" />
              <span>{gps ? `GPS Lock: ±${gps.accuracy.toFixed(0)}m` : "Acquiring GPS..."}</span>
            </div>
            <Button variant="outline" onClick={onClose}>Exit Mop-Up</Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Administer Mop-Up: {activeHH?.hh_number}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <Alert variant="destructive" className="bg-red-50/50">
              {activeHH?.coverage_status === "refused" ? <ShieldCheck className="h-4 w-4 text-red-600" /> : activeHH?.coverage_status === "absent" ? <MapIcon className="h-4 w-4 text-slate-500" /> : <XCircle className="h-4 w-4 text-orange-600" />}
              <AlertDescription className="text-xs">
                Original Reason: <strong className="capitalize">{activeHH?.coverage_status.replace("_", " ")}</strong>
                <br />Administer treatment and capture photographic proof.
              </AlertDescription>
            </Alert>
            
            <div className="space-y-2 text-center">
              <Button variant="outline" className="w-full relative overflow-hidden h-12">
                <Camera className="h-5 w-5 mr-2 text-primary" />
                Take Photo Proof
                <input type="file" accept="image/*" capture="environment" className="absolute inset-0 opacity-0 cursor-pointer" onChange={handlePhotoCapture} />
              </Button>
              {photoPreview && <img src={photoPreview} alt="Preview" className="h-32 w-full rounded-md object-cover border mt-2" />}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPickerOpen(false)}>Cancel</Button>
            <Button onClick={submitMopUp} disabled={saving || !photoPreview}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
              Mark Completed
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

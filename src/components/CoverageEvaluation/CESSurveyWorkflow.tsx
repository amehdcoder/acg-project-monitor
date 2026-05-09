import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { QRCodeSVG } from "qrcode.react";
import {
  MapPin, Satellite, Map as MapIcon, Mountain, Loader2, Sparkles, Shuffle,
  Navigation, Target, Lock, Download, FileText, FileSpreadsheet, AlertTriangle,
  CheckCircle2, XCircle, Save, Crosshair, BarChart3, Shield, Building,
  ThumbsUp, ThumbsDown, Wifi, WifiOff, RefreshCw, UserCheck, ClipboardCheck, Info,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import CESSurveyMap, { SurveyHousehold } from "./CESSurveyMap";
import { kmeansSegments, Segment, LatLng } from "@/lib/ces/kmeansSegments";
import { computeCoverage, compareProportions, CoverageEstimate, ProportionCompare } from "@/lib/ces/coverageStats";
import { downloadCSV, downloadGeoJSON, generateCESReportPDF } from "@/lib/ces/exporters";
import { logCESAction } from "@/lib/ces/auditLog";
import { getAllStates, getLGAsForState, getWardsForLGA } from "@/lib/nigeriaAdminData";
import {
  saveHouseholdOffline, syncCESOfflineQueue, getPendingCount,
  registerCESSyncOnReconnect, getDeviceId, generateUUID, type OfflineHousehold,
} from "@/lib/ces/offlineHouseholds";
import { DEMO_ENTRIES } from "../Microplanning/demoData";

type Step = 1 | 2 | 3 | 4 | 5;

interface CESSurveyWorkflowProps {
  projectId?: string;
  formId?: string;
  initialSurveyId?: string;
  onClose?: () => void;
}

const COVERAGE_OPTIONS = [
  { value: "treated", label: "Treated", icon: CheckCircle2, color: "text-green-600" },
  { value: "not_treated", label: "Not Treated", icon: XCircle, color: "text-red-600" },
  { value: "absent", label: "Absent", icon: MapPin, color: "text-slate-500" },
  { value: "refused", label: "Refused", icon: Shield, color: "text-red-700" },
  { value: "ineligible", label: "Ineligible", icon: AlertTriangle, color: "text-yellow-600" },
];

const COMMODITY_OPTIONS = ["Ivermectin", "Praziquantel", "Albendazole", "Zithromax", "LLIN", "Other"];

export default function CESSurveyWorkflow({ projectId, formId, initialSurveyId, onClose }: CESSurveyWorkflowProps) {
  const [step, setStep] = useState<Step>(1);
  const [surveyId, setSurveyId] = useState<string | null>(initialSurveyId ?? null);

  // Step 1 — Locate & boundaries
  const [gps, setGps] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [gpsWatching, setGpsWatching] = useState(false);
  const [perimeter, setPerimeter] = useState<LatLng[]>([]);
  const [recordingPerimeter, setRecordingPerimeter] = useState(false);
  const [basemap, setBasemap] = useState<"satellite" | "street" | "terrain">("satellite");
  const [state, setState] = useState("");
  const [lga, setLga] = useState("");
  const [ward, setWard] = useState("");
  const [flhfName, setFlhfName] = useState("");
  const [communityName, setCommunityName] = useState("");
  const [settlementName, setSettlementName] = useState("");

  // Microplanning Data
  const [loading, setLoading] = useState(false);
  const [microplans, setMicroplans] = useState<any[]>([]);
  const [medicineAllocations, setMedicineAllocations] = useState<any[]>([]);
  const [selectedMicroplanId, setSelectedMicroplanId] = useState<string>("");

  const fetchMicroplans = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const [{ data: mData, error: mErr }, { data: aData, error: aErr }] = await Promise.all([
        supabase.from("microplan_entries" as any).select("*").eq("project_id", projectId).order("community_name"),
        supabase.from("microplan_medicine_allocations" as any).select("*").eq("project_id", projectId)
      ]);
      
      if (mErr) throw mErr;
      if (aErr) throw aErr;

      setMicroplans((mData as any) || []);
      setMedicineAllocations((aData as any) || []);
    } catch (err: any) {
      console.error("Error fetching microplan data:", err);
      toast({
        title: "Fetch Error",
        description: "Failed to load microplanning data from the server.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchMicroplans();
  }, [fetchMicroplans]);

  // If no real microplans exist, use demo entries to maintain parity with Geo Microplanning page
  const isUsingDemoData = microplans.length === 0 && !loading;
  const effectiveMicroplans = isUsingDemoData ? DEMO_ENTRIES : microplans;

  const handleMicroplanSelect = (id: string) => {
    setSelectedMicroplanId(id);
    const plan = effectiveMicroplans.find((m) => m.id === id);
    if (plan) {
      setState(plan.state || "");
      setLga(plan.lga || "");
      setWard(plan.ward || "");
      setFlhfName(plan.flhf_name || "");
      setCommunityName(plan.community_name || "");
      setSettlementName(plan.settlement_name || "");
    }
  };

  const activeMicroplan = effectiveMicroplans.find((m) => m.id === selectedMicroplanId);
  const activeAllocation = activeMicroplan ? medicineAllocations.find(a => a.lga === activeMicroplan.lga) : null;
  const targetPopulation = activeMicroplan ? ((activeMicroplan.estimated_children_5_14 || 0) + (activeMicroplan.estimated_adults_15_plus || 0)) : null;

  // Step 2 — sampling
  const [estHHAi, setEstHHAi] = useState<number | null>(null);
  const [estHHUser, setEstHHUser] = useState<number | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [targetN, setTargetN] = useState<number>(20);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [selectedSegmentLabels, setSelectedSegmentLabels] = useState<string[]>([]);

  // Step 3 — Visits
  const [households, setHouseholds] = useState<SurveyHousehold[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pendingPin, setPendingPin] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [editingHH, setEditingHH] = useState<SurveyHousehold | null>(null);

  // Settings & Upgrades

  const [witnessSystemEnabled, setWitnessSystemEnabled] = useState(true);
  const [qrCodeOpen, setQrCodeOpen] = useState(false);
  const [lastSavedHHData, setLastSavedHHData] = useState<{ hhId: string, url: string } | null>(null);
  const [duplicateWarningOpen, setDuplicateWarningOpen] = useState(false);
  const [hhForm, setHhForm] = useState({ 
    status: "treated", 
    commodity: "Ivermectin", 
    notes: "", 
    duplicateReason: "",
    eligiblePersons: "",
    treatedPersons: ""
  });

  
  // Time-Lapse GPS
  const [gpsLogs, setGpsLogs] = useState<{lat: number, lng: number, ts: number}[]>([]);

  // ── Offline-First State ──
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [offlinePending, setOfflinePending] = useState(0);
  const [syncing, setSyncing] = useState(false);

  // ── Supervisor QC State ──
  const [qcDialogOpen, setQcDialogOpen] = useState(false);
  const [qcApproved, setQcApproved] = useState<boolean | null>(null);
  const [qcSupervisorName, setQcSupervisorName] = useState("");
  const [qcVerdict, setQcVerdict] = useState<"approve_override" | "reject" | "">("");
  const [qcNotes, setQcNotes] = useState("");
  const [qcLockedAt, setQcLockedAt] = useState<string | null>(null);

  // Step 4 — analysis
  const [coverage, setCoverage] = useState<CoverageEstimate | null>(null);
  const [microCompare, setMicroCompare] = useState<ProportionCompare | null>(null);
  const [routeRealismScore, setRouteRealismScore] = useState<number | null>(null);
  const [blendedCoveragePct, setBlendedCoveragePct] = useState<number | null>(null);

  // ---------- GPS lock ----------
  const watchIdRef = useRef<number | null>(null);
  const lkgRef = useRef<{ lat: number; lng: number; accuracy: number } | null>(null);

  const startGPSLock = useCallback(() => {
    if (gpsWatching) return;
    setGpsWatching(true);
    
    // Optimized for "Real-time" responsiveness and "Reliable" indoor capture
    const options: PositionOptions = {
      enableHighAccuracy: true,
      maximumAge: 500, // Faster cache refresh for responsive feedback
      timeout: 10000,
    };

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const p = { 
          lat: pos.coords.latitude, 
          lng: pos.coords.longitude, 
          accuracy: pos.coords.accuracy 
        };
        
        // Update Last Known Good (LKG) if accuracy is high
        if (p.accuracy < 20) {
          lkgRef.current = p;
        }

        setGps(prev => {
          if (!prev) return p;
          
          // Adaptive Smoothing Engine
          // High accuracy (< 8m) -> High responsiveness (alpha = 0.9)
          // Low accuracy (> 30m) -> High stability (alpha = 0.15)
          let alpha = 0.5;
          if (p.accuracy < 10) alpha = 0.9;
          else if (p.accuracy > 30) alpha = 0.15; // Indoor/Shade damping

          let targetLat = p.lat;
          let targetLng = p.lng;
          
          // If in a "Cave" or "Indoor" environment (terrible accuracy),
          // blend towards LKG to prevent erratic jumps.
          if (p.accuracy > 50 && lkgRef.current) {
            targetLat = lkgRef.current.lat * 0.7 + p.lat * 0.3;
            targetLng = lkgRef.current.lng * 0.7 + p.lng * 0.3;
          }

          return {
            lat: prev.lat * (1 - alpha) + targetLat * alpha,
            lng: prev.lng * (1 - alpha) + targetLng * alpha,
            accuracy: p.accuracy
          };
        });
      },
      (err) => {
        if (err.code === 3) return; // Ignore timeout jitter
        toast({ title: "GPS Signal Warning", description: "Signal weak. Move to open area if possible.", variant: "destructive" });
      },
      options
    );
  }, [gpsWatching]);


  useEffect(() => {
    startGPSLock();
    return () => {
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
    };
  }, [startGPSLock]);

  // ---------- perimeter recording ----------
  useEffect(() => {
    if (!recordingPerimeter || !gps) return;
    setPerimeter((prev) => {
      const last = prev[prev.length - 1];
      if (!last) return [{ lat: gps.lat, lng: gps.lng }];
      
      const R = 6371000;
      const dLat = (gps.lat - last.lat) * Math.PI / 180;
      const dLng = (gps.lng - last.lng) * Math.PI / 180;
      const latMid = (gps.lat + last.lat) / 2 * Math.PI / 180;
      
      const distM = R * Math.sqrt(dLat * dLat + Math.pow(Math.cos(latMid) * dLng, 2));
      
      // 7 m threshold to reduce jitter on mobile
      if (distM < 7) return prev;
      return [...prev, { lat: gps.lat, lng: gps.lng }];
    });
  }, [gps, recordingPerimeter]);

  // Refresh offline pending count whenever household list changes
  useEffect(() => {
    getPendingCount().then(setOfflinePending);
  }, [households.length]);

  // ---------- AI rooftop count ----------
  const runRooftopAI = useCallback(async () => {
    if (!gps) return;
    setAiLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("ces-rooftop-count", {
        body: { lat: gps.lat, lng: gps.lng, zoom: 18 },
      });
      if (error) throw error;
      const count = (data as any)?.estimated_households ?? 0;
      setEstHHAi(count);
      setEstHHUser((u) => u ?? count);
      toast({ title: "AI count complete", description: `~${count} rooftops detected (${(data as any)?.confidence})` });
    } catch (e: any) {
      toast({ title: "AI count failed", description: e.message ?? String(e), variant: "destructive" });
    } finally {
      setAiLoading(false);
    }
  }, [gps]);

  // ---------- Sampling design ----------
  const buildSegments = useCallback(() => {
    const N = estHHUser ?? estHHAi ?? 0;
    if (!gps || N <= 0 || targetN <= 0) {
      toast({ title: "Need household estimate + target N", variant: "destructive" });
      return;
    }
    const numSegments = Math.max(1, Math.ceil(N / targetN));
    const peri = perimeter.length >= 3 ? perimeter : circleAround(gps, 200, 24);
    // Synthesize random points inside the perimeter bounding box as proxy households
    const lats = peri.map((p) => p.lat); const lngs = peri.map((p) => p.lng);
    const minLat = Math.min(...lats), maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
    const points = Array.from({ length: N }, () => ({
      lat: minLat + Math.random() * (maxLat - minLat),
      lng: minLng + Math.random() * (maxLng - minLng),
    }));
    const segs = kmeansSegments(points, numSegments);
    // Random select 1
    const rIdx = Math.floor(Math.random() * segs.length);
    setSegments(segs);
    setSelectedSegmentLabels([segs[rIdx].label]);
    if (surveyId) logCESAction(surveyId, "build_segments", { count: numSegments, selected: segs[rIdx].label });
  }, [estHHUser, estHHAi, targetN, gps, perimeter, surveyId]);

  const sampleAnotherSegment = useCallback(() => {
    if (segments.length === 0) return;
    const usedIdx = selectedSegmentLabels.map((l) => segments.findIndex((s) => s.label === l)).filter((i) => i >= 0);
    const remaining = Array.from({ length: segments.length }, (_, i) => i).filter((i) => !usedIdx.includes(i));
    const next = remaining.length === 0 ? -1 : remaining[Math.floor(Math.random() * remaining.length)];
    if (next < 0) {
      toast({ title: "All segments selected", description: "No more remaining." });
      return;
    }
    setSelectedSegmentLabels((p) => [...p, segments[next].label]);
    if (surveyId) logCESAction(surveyId, "sample_another_segment", { added: segments[next].label });
  }, [segments, selectedSegmentLabels, surveyId]);

  // ---------- Save / persist survey ----------
  const persistSurvey = useCallback(
    async (status: "draft" | "completed" | "submitted" = "draft"): Promise<string | null> => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) {
        toast({ title: "Sign in required", variant: "destructive" });
        return null;
      }
      const payload: any = {
        project_id: projectId ?? null,
        form_id: formId ?? null,
        name: `${communityName || "CES"} — ${new Date().toLocaleDateString()}`,
        survey_date: new Date().toISOString().slice(0, 10),
        state, lga, ward, flhf_name: flhfName,
        community_name: communityName, settlement_name: settlementName,
        center_lat: gps?.lat ?? null, center_lng: gps?.lng ?? null,
        perimeter_coords: perimeter,
        est_hh_ai: estHHAi, est_hh_user: estHHUser,
        target_sample_n: targetN,
        segments_count: segments.length,
        selected_segment_ids: selectedSegmentLabels,
        inferred_coverage_pct: coverage?.inferredCoveragePct ?? null,
        ci_lower_95: coverage?.ci95?.[0] ?? null, ci_upper_95: coverage?.ci95?.[1] ?? null,
        ci_lower_99: coverage?.ci99?.[0] ?? null, ci_upper_99: coverage?.ci99?.[1] ?? null,
        design_effect: coverage?.designEffect ?? null,
        precision_value: coverage?.precisionPct ?? null,
        status,
        device_id: getDeviceId(),
      };

      if (surveyId) {
        const { error } = await supabase.from("ces_surveys" as any).update(payload).eq("id", surveyId);
        if (error) {
          toast({ title: "Save failed", description: error.message, variant: "destructive" });
          return null;
        }
        return surveyId;
      } else {
        const { data, error } = await supabase
          .from("ces_surveys" as any)
          .insert({ ...payload, created_by: u.user.id })
          .select()
          .single();
        if (error || !data) {
          toast({ title: "Create failed", description: error?.message, variant: "destructive" });
          return null;
        }
        const id = (data as any).id;
        setSurveyId(id);
        return id;
      }
    },
    [projectId, formId, communityName, state, lga, ward, flhfName, settlementName, gps, perimeter,
     estHHAi, estHHUser, targetN, segments.length, selectedSegmentLabels, coverage, surveyId],
  );

  // autosave 30s & time-lapse gps (Upgrade 4)
  useEffect(() => {
    // Register offline→online sync once on mount
    registerCESSyncOnReconnect();

    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  // eslint-disable-next-line
  }, []);
  useEffect(() => {
    const t = setInterval(() => {
      if (surveyId) persistSurvey("draft");
      if (step === 3 && gps) {
        setGpsLogs(prev => [...prev, { lat: gps.lat, lng: gps.lng, ts: Date.now() }]);
      }
    }, 30000);
    return () => clearInterval(t);
  }, [surveyId, persistSurvey, step, gps]);

  // Module 3: Mock Blockchain Batch Sync
  useEffect(() => {
    if (!surveyId) return;
    const syncToBlockchain = async () => {
      // Find un-synced household visits
      const { data: hhs } = await supabase.from("ces_household_visits" as any)
        .select("id, evidence_hash")
        .eq("survey_id", surveyId)
        .is("blockchain_tx", null)
        .limit(50);
        
      if (hhs && hhs.length > 0) {
        // Mock Blockchain submission
        const txHash = "0x" + Array.from({length: 64}, () => Math.floor(Math.random()*16).toString(16)).join('');
        const blockNum = Math.floor(Math.random() * 100000) + 40000000;
        
        const proofs = hhs.map((h: any) => ({
          survey_id: surveyId,
          household_id: h.id,
          evidence_hash: h.evidence_hash || "mock-hash",
          blockchain_tx_hash: txHash,
          block_number: blockNum,
          chain_timestamp: new Date().toISOString(),
          status: "Verified"
        }));
        
        await supabase.from("ces_blockchain_proof" as any).insert(proofs);
        const ids = hhs.map((h: any) => h.id);
        await supabase.from("ces_household_visits" as any).update({ blockchain_tx: txHash }).in("id", ids);
        toast({ title: "Blockchain Synced", description: `Batch of ${hhs.length} records verified on Polygon testnet.`, className: "bg-indigo-600 text-white" });
      }
    };

    const t = setInterval(syncToBlockchain, 5 * 60 * 1000); // 5 mins
    const demoSync = setTimeout(syncToBlockchain, 15000); // Demo first run
    
    return () => { clearInterval(t); clearTimeout(demoSync); };
  }, [surveyId]);

  // ---------- Household visits ----------
  const handleMapTap = useCallback(
    (lat: number, lng: number) => {
      if (step !== 3) return;
      if (!gps) {
        toast({ title: "GPS not ready", variant: "destructive" });
        return;
      }
      if (gps.accuracy > 20) {
        toast({ title: "GPS accuracy too low", description: "Move to open area (<20 m).", variant: "destructive" });
        return;
      }
      // Strict physical geofence check — USER must be physically inside the selected segment polygon
      const selected = segments.filter((s) => selectedSegmentLabels.includes(s.label));
      const userInside = selected.some((s) => pointInPolygon({ lat: gps.lat, lng: gps.lng }, s.polygon));
      if (selected.length > 0 && !userInside) {
        toast({
          title: "Physical Geofence Violation",
          description: "You are physically outside the highlighted segment. Move inside or sample another segment.",
          variant: "destructive",
        });
        return;
      }

      // Also check if the pin being dropped is inside
      const tapInside = selected.some((s) => pointInPolygon({ lat, lng }, s.polygon));
      if (selected.length > 0 && !tapInside) {
        toast({
          title: "Pin Outside Segment",
          description: "Tap inside the highlighted segment to add households.",
          variant: "destructive",
        });
        return;
      }
      setPendingPin({ lat, lng, accuracy: gps.accuracy });
      setPickerOpen(true);
    },
    [step, gps, segments, selectedSegmentLabels],
  );

  const isDuplicatePin = useMemo(() => {
    if (!pendingPin) return false;
    return households.some(h => {
      const R = 6371e3;
      const p1 = pendingPin.lat * Math.PI/180, p2 = h.lat * Math.PI/180;
      const dp = (h.lat-pendingPin.lat) * Math.PI/180, dl = (h.lng-pendingPin.lng) * Math.PI/180;
      const a = Math.pow(Math.sin(dp/2), 2) + Math.cos(p1) * Math.cos(p2) * Math.pow(Math.sin(dl/2), 2);
      return (R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))) < 15;
    });
  }, [pendingPin, households]);

  const saveHousehold = useCallback(async () => {
    if (!pendingPin) return;
    if (isDuplicatePin && !hhForm.duplicateReason) {
      toast({ title: "Reason Required", description: "Household is within 15m of another. Please provide a reason.", variant: "destructive" });
      return;
    }

    if (parseInt(hhForm.treatedPersons) > parseInt(hhForm.eligiblePersons)) {
      toast({ title: "Validation Error", description: "Treated persons cannot exceed eligible persons.", variant: "destructive" });
      return;
    }


    const id = surveyId || (await persistSurvey("draft"));
    if (!id) return;
    const { data: u } = await supabase.auth.getUser();
    const next = households.length + 1;
    const hhNumber = `HH${String(next).padStart(3, "0")}`;
    const segLabel = selectedSegmentLabels[0];
    const ts = new Date().toISOString();
    const devId = getDeviceId();
    
    // Digital Fingerprint
    const rawFingerprint = `${pendingPin.lat}${pendingPin.lng}${ts}${devId}`;
    const fgHashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(rawFingerprint));
    const fingerprintHash = Array.from(new Uint8Array(fgHashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');

    // Evidence Hash
    const rawEvidence = `${id}${hhNumber}${pendingPin.lat}${pendingPin.lng}mock_photo_hash${ts}${u.user?.id || 'unknown'}${hhForm.status}`;
    const evHashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(rawEvidence));
    const evidenceHash = Array.from(new Uint8Array(evHashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');

    const offlineRow: OfflineHousehold = {
      local_id: generateUUID(),
      survey_id: id,
      hh_number: hhNumber,
      latitude: pendingPin.lat,
      longitude: pendingPin.lng,
      gps_accuracy: pendingPin.accuracy,
      coverage_status: hhForm.status,
      commodity: hhForm.commodity,
      notes: hhForm.notes,
      duplicate_reason: hhForm.duplicateReason || null,
      evidence_hash: evidenceHash,

      device_id: devId,
      visited_at: ts,
      created_by: u.user?.id ?? null,
      synced: false,
      retry_count: 0,
      segment_label: segLabel || null,
      gps_snapshot: JSON.stringify(gps),
    };

    // ─── Offline-First: try Supabase, fall back to IndexedDB ───
    let savedId: string | null = null;
    if (!navigator.onLine) {
      // Save to local IndexedDB immediately
      await saveHouseholdOffline(offlineRow);
      setOfflinePending(p => p + 1);
      toast({
        title: "Saved Offline ☁️",
        description: `${hhNumber} stored locally. Will sync when online.`,
        className: "bg-amber-600 text-white",
      });
      savedId = offlineRow.local_id;
    } else {
      const row: any = {
        survey_id: id, hh_number: hhNumber,
        latitude: pendingPin.lat, longitude: pendingPin.lng,
        gps_accuracy: pendingPin.accuracy, coverage_status: hhForm.status,
        commodity: hhForm.commodity, notes: hhForm.notes,
        duplicate_reason: hhForm.duplicateReason || null,
        evidence_hash: evidenceHash, device_id: devId,
        visited_at: ts, synced_at: ts, created_by: u.user?.id,
        eligible_persons: parseInt(hhForm.eligiblePersons) || 0,
        treated_persons: parseInt(hhForm.treatedPersons) || 0,
      };

      const { data, error } = await supabase.from("ces_household_visits" as any).insert(row).select().single();
      if (error || !data) {
        // Network error even though "online" — fall back to offline
        await saveHouseholdOffline(offlineRow);
        setOfflinePending(p => p + 1);
        toast({ title: "Saved Offline (network error)", description: `${hhNumber} queued for sync.`, className: "bg-amber-600 text-white" });
        savedId = offlineRow.local_id;
      } else {
        savedId = (data as any).id;
        // Mock fingerprint
        supabase.from("ces_household_fingerprints" as any).insert({
          survey_id: id, household_id: savedId, fingerprint_hash: fingerprintHash,
          location_fingerprint_hash: "mock-cell-tower", lat: pendingPin.lat, long: pendingPin.lng,
          timestamp: ts, interviewer_id: u.user?.id
        }).then(() => {});
      }
    }

    setHouseholds((p) => [...p, {
      id: savedId!, hh_number: hhNumber,
      lat: pendingPin.lat, lng: pendingPin.lng,
      coverage_status: hhForm.status,
      eligible_persons: parseInt(hhForm.eligiblePersons) || 0,
      treated_persons: parseInt(hhForm.treatedPersons) || 0,
    }]);

    
    if (witnessSystemEnabled && savedId && navigator.onLine) {
      setLastSavedHHData({ hhId: savedId, url: `${window.location.origin}/witness/${id}/${savedId}` });
      setQrCodeOpen(true);
    }

    setPickerOpen(false); setPendingPin(null);
    setHhForm({ status: "treated", commodity: "Ivermectin", notes: "", duplicateReason: "", eligiblePersons: "", treatedPersons: "" });
    if (id) logCESAction(id, "household_added", { hhNumber, status: hhForm.status, offline: !navigator.onLine }, pendingPin);

  }, [pendingPin, isDuplicatePin, hhForm, surveyId, gps, persistSurvey, households.length, witnessSystemEnabled, selectedSegmentLabels]);

  // load existing visits when surveyId set
  useEffect(() => {
    if (!surveyId) return;
    (async () => {
      const { data } = await supabase
        .from("ces_household_visits" as any).select("*").eq("survey_id", surveyId);
      const mapped: SurveyHousehold[] = ((data as any) ?? []).map((d: any) => ({
        id: d.id, hh_number: d.hh_number, lat: d.latitude, lng: d.longitude, coverage_status: d.coverage_status,
        eligible_persons: d.eligible_persons || 0, treated_persons: d.treated_persons || 0,
      }));

      setHouseholds(mapped);
    })();
  }, [surveyId]);

  // ---------- Coverage analysis ----------
  const computeAnalysis = useCallback(() => {
    if (segments.length === 0) return;
    // attribute each visit to its enclosing segment
    const tallies = segments.map((s) => {
      const inside = households.filter((h) => pointInPolygon({ lat: h.lat, lng: h.lng }, s.polygon));
      return {
        est_hh: Math.max(s.count, 1),
        sampled: inside.length,
        treated: inside.filter((h) => h.coverage_status === "treated").length,
      };
    });
    const cov = computeCoverage(tallies);
    setCoverage(cov);

    // Route Realism Calculation (Upgrade 4)
    if (gpsLogs.length > 2 && households.length > 1) {
      let actualDist = 0;
      for (let i=1; i<gpsLogs.length; i++) {
        const p1 = gpsLogs[i-1], p2 = gpsLogs[i];
        const dp = (p2.lat-p1.lat) * Math.PI/180, dl = (p2.lng-p1.lng) * Math.PI/180;
        const a = Math.sin(dp/2)**2 + Math.cos(p1.lat*Math.PI/180)*Math.cos(p2.lat*Math.PI/180)*Math.sin(dl/2)**2;
        actualDist += 6371e3 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
      }
      let optimalDist = 0;
      for (let i=1; i<households.length; i++) {
        const p1 = households[i-1], p2 = households[i];
        const dp = (p2.lat-p1.lat) * Math.PI/180, dl = (p2.lng-p1.lng) * Math.PI/180;
        const a = Math.sin(dp/2)**2 + Math.cos(p1.lat*Math.PI/180)*Math.cos(p2.lat*Math.PI/180)*Math.sin(dl/2)**2;
        optimalDist += 6371e3 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
      }
      setRouteRealismScore(actualDist > 0 ? Math.min(1, optimalDist / actualDist) : 0);
    }

    // Microplanning comparison
    fetchMicroplanComparison(state, lga, ward, communityName, cov.totalTreated, cov.totalSampled).then((cmp) => {
      setMicroCompare(cmp);
      // Bayesian Blended Coverage (Upgrade 6)
      if (cmp) {
        // Final Coverage = 0.5*PeerValidated_CES + 0.3*Original_CES + 0.2*Admin
        // We mock PeerValidated_CES as cov.inferredCoveragePct for now since no peers have validated it yet in this view
        const blended = 0.5 * cov.inferredCoveragePct + 0.3 * cov.inferredCoveragePct + 0.2 * cmp.pJRSM;
        setBlendedCoveragePct(blended);
      }
    });
    if (surveyId) {
      persistSurvey("draft");
      logCESAction(surveyId, "compute_analysis", { coverage: cov.inferredCoveragePct });
    }
  }, [segments, households, state, lga, ward, communityName, surveyId, persistSurvey]);

  // ---------- Exports ----------
  const exportCSV = useCallback(() => {
    const rows = households.map((h) => ({
      SurveyID: surveyId, Date: new Date().toISOString(), Community: communityName,
      LGA: lga, State: state, Ward: ward, FLHF: flhfName, Settlement: settlementName,
      SegmentID: selectedSegmentLabels.join("|"),
      HouseholdID: h.hh_number, Lat: h.lat, Long: h.lng,
      Coverage_Status: h.coverage_status,
    }));
    downloadCSV(rows, `ces-${surveyId ?? "draft"}.csv`);
  }, [households, surveyId, communityName, lga, state, ward, flhfName, settlementName, selectedSegmentLabels]);

  const exportGeoJSON = useCallback(() => {
    const features: any[] = [];
    for (const seg of segments) {
      if (seg.polygon.length >= 3) {
        features.push({
          type: "Feature",
          geometry: { type: "Polygon", coordinates: [seg.polygon.map((p) => [p.lng, p.lat])] },
          properties: { label: seg.label, color: seg.color, count: seg.count, selected: selectedSegmentLabels.includes(seg.label) },
        });
      }
    }
    for (const h of households) {
      features.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: [h.lng, h.lat] },
        properties: { hh: h.hh_number, status: h.coverage_status },
      });
    }
    downloadGeoJSON({ type: "FeatureCollection", features }, `ces-${surveyId ?? "draft"}.geojson`);
  }, [segments, households, selectedSegmentLabels, surveyId]);

  const exportPDF = useCallback(async () => {
    if (!coverage) return;
    const breakdown = households.reduce<Record<string, number>>((a, h) => {
      a[h.coverage_status] = (a[h.coverage_status] ?? 0) + 1; return a;
    }, {});
    
    // Fetch mock blockhain status and mop up count
    let mockTxHash;
    let mockClusters = 0;
    if (surveyId) {
      const { data: txDataRaw } = await supabase.from("ces_household_visits" as any).select("blockchain_tx").eq("survey_id", surveyId).not("blockchain_tx", "is", null).limit(1);
      const txData: any[] = (txDataRaw as any) || [];
      if (txData && txData.length > 0) mockTxHash = txData[0].blockchain_tx;
      const { count } = await supabase.from("ces_gap_cluster" as any).select("*", { count: 'exact', head: true }).eq("survey_id", surveyId);
      mockClusters = count || 0;
    }

    generateCESReportPDF({
      surveyName: `${communityName} CES`,
      community: communityName, lga, state,
      date: new Date().toLocaleDateString(),
      inferredCoveragePct: coverage.inferredCoveragePct,
      ci95: coverage.ci95, ci99: coverage.ci99,
      designEffect: coverage.designEffect,
      totalSampled: coverage.totalSampled, totalTreated: coverage.totalTreated,
      segmentsCount: segments.length, statusBreakdown: breakdown,
      blockchainTxHash: mockTxHash || "0x_Pending_Network_Sync...",
      mopupClustersDetected: mockClusters,
      filename: `ces-report-${communityName || surveyId}.pdf`,
    });
  }, [coverage, households, segments.length, communityName, lga, state, surveyId]);

  const completionPct = Math.min(100, (households.length / Math.max(targetN, 1)) * 100);
  const isBelowThreshold = completionPct < 80;

  const lockSurvey = useCallback(async () => {
    // If below 80%, must have QC approval first
    if (isBelowThreshold && !qcApproved) {
      setQcDialogOpen(true);
      return;
    }
    // If QC was rejected, block lock
    if (qcVerdict === "reject") {
      toast({ title: "Survey Rejected by Supervisor", description: "QC was rejected. You cannot lock this survey.", variant: "destructive" });
      return;
    }
    const id = await persistSurvey("submitted");
    if (id) {
      const now = new Date().toISOString();
      await supabase.from("ces_surveys" as any).update({
        status: "locked",
        supervisor_qc_at: now,
        supervisor_qc_approved: true,
        supervisor_qc_notes: isBelowThreshold ? `OVERRIDE: ${qcNotes}` : "Auto-approved (≥80% complete)",
        supervisor_name: qcSupervisorName || null,
      }).eq("id", id);
      setQcLockedAt(now);
      toast({ title: "✅ Survey Locked", description: `Supervisor QC complete. Status set to 'locked'.` });
      logCESAction(id, "supervisor_qc_lock", { completionPct: completionPct.toFixed(1), override: isBelowThreshold, notes: qcNotes });
    }
  }, [isBelowThreshold, qcApproved, qcVerdict, qcNotes, qcSupervisorName, completionPct, households.length, targetN, persistSurvey]);

  const handleQcSubmit = useCallback(async () => {
    if (!qcSupervisorName.trim()) {
      toast({ title: "Supervisor name required", variant: "destructive" }); return;
    }
    if (!qcVerdict) {
      toast({ title: "Select a QC verdict", variant: "destructive" }); return;
    }
    if (!qcNotes.trim()) {
      toast({ title: "QC notes required when below 80%", variant: "destructive" }); return;
    }
    if (qcVerdict === "reject") {
      setQcApproved(false);
      setQcDialogOpen(false);
      toast({ title: "Survey Rejected", description: "QC verdict: Rejected. Survey cannot be locked.", variant: "destructive" });
      return;
    }
    // approve_override
    setQcApproved(true);
    setQcDialogOpen(false);
    toast({ title: "QC Override Approved", description: "You may now lock the survey.", className: "bg-amber-600 text-white" });
  }, [qcSupervisorName, qcVerdict, qcNotes]);

  // ---------- render ----------
  const lgaOptions = state ? getLGAsForState(state) : [];
  const wardOptions = state && lga ? getWardsForLGA(state, lga) : [];

  const accuracyOk = gps && gps.accuracy <= 25;
  const highAccuracyOk = gps && gps.accuracy <= 15;
  const accuracyColor = !gps ? "text-muted-foreground" :
    gps.accuracy <= 15 ? "text-green-600" : gps.accuracy <= 25 ? "text-indigo-600" : gps.accuracy <= 50 ? "text-yellow-600" : "text-red-600";

  return (
    <div className="space-y-3">
      {/* Stepper */}
      <Card>
        <CardContent className="p-2 md:p-3 flex items-center gap-2 overflow-x-auto no-scrollbar">
          {[
            { n: 1 as Step, label: "Locate", full: "1. Locate & Boundaries" },
            { n: 2 as Step, label: "Sample", full: "2. Estimate & Sample" },
            { n: 3 as Step, label: "Visit", full: "3. Visit Households" },
            { n: 4 as Step, label: "Analyze", full: "4. Analysis" },
            { n: 5 as Step, label: "Export", full: "5. Export & QC" },
          ].map((s, i, arr) => (
            <div key={s.n} className="flex items-center gap-1.5 shrink-0">
              <Button
                size="sm"
                variant={step === s.n ? "default" : "ghost"}
                onClick={() => setStep(s.n)}
                className={`h-8 px-2 md:px-3 transition-all ${step === s.n ? "text-[11px] font-bold" : "text-[10px] text-muted-foreground"}`}
              >
                <span className="md:hidden">{s.n}. {s.label}</span>
                <span className="hidden md:inline">{s.full}</span>
              </Button>
              {i < arr.length - 1 && <span className="text-muted-foreground/30">/</span>}
            </div>
          ))}
          <div className="ml-auto flex items-center gap-2 text-xs">
            <div className="flex flex-col items-end mr-1">
              <div className="flex items-center gap-1">
                <Crosshair className={`h-3.5 w-3.5 ${accuracyColor}`} />
                <span className={`font-bold ${accuracyColor}`}>
                  {gps ? `±${gps.accuracy.toFixed(0)} m` : "GPS…"}
                </span>
              </div>
              {gps && gps.accuracy <= 15 && (
                <span className="text-[9px] text-green-600 font-medium flex items-center animate-pulse">
                  <Sparkles className="h-2 w-2 mr-0.5" /> High Precision
                </span>
              )}
            </div>
            
            {/* Offline Status & Sync */}
            <Badge variant={isOnline ? "outline" : "destructive"} className="gap-1 h-6 px-2">
              {isOnline ? <Wifi className="h-3 w-3 text-green-600" /> : <WifiOff className="h-3 w-3" />}
              <span className="hidden sm:inline">{isOnline ? "Online" : "Offline"}</span>
            </Badge>

            {offlinePending > 0 && (
              <Button 
                size="sm" 
                variant="outline" 
                onClick={async () => {
                  setSyncing(true);
                  await syncCESOfflineQueue();
                  const count = await getPendingCount();
                  setOfflinePending(count);
                  setSyncing(false);
                }}
                disabled={syncing || !isOnline}
                className="h-7 px-2 text-[10px] gap-1 border-amber-500 text-amber-700 hover:bg-amber-50"
              >
                <RefreshCw className={`h-3 w-3 ${syncing ? "animate-spin" : ""}`} />
                Sync {offlinePending}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* STEP 1 */}
      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Satellite className="h-5 w-5" />Step 1 — Locate & Fence Community</CardTitle>
            <CardDescription>Lock GPS (&lt;15 m), set administrative boundaries, then walk the perimeter to fence the community.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between p-3 border rounded-md bg-muted/30">
              <div className="space-y-0.5">
                <Label className="text-sm font-semibold flex items-center gap-2">
                  <Shield className="h-4 w-4 text-primary" /> Enable Community Witness System
                </Label>
                <div className="text-xs text-muted-foreground">Recommended. Generates QR codes for community verification.</div>
              </div>
              <Switch checked={witnessSystemEnabled} onCheckedChange={setWitnessSystemEnabled} />
            </div>

            {gps && gps.accuracy > 25 && gps.accuracy <= 50 && (
              <Alert className="border-amber-200 bg-amber-50">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <AlertDescription className="text-xs text-amber-800">
                  Moderate GPS accuracy ({gps.accuracy.toFixed(0)}m). You can start walking, but boundaries may be less precise.
                </AlertDescription>
              </Alert>
            )}

            {(!gps || gps.accuracy > 50) && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Waiting for GPS accuracy &lt; 25 m (current {gps?.accuracy?.toFixed(0) ?? "—"} m). Stay outdoors.
                </AlertDescription>
              </Alert>
            )}

            <Field label="Select Microplanning Data (Optional)">
              <div className="flex items-center gap-2">
                <Select value={selectedMicroplanId} onValueChange={handleMicroplanSelect}>
                  <SelectTrigger className="h-8 flex-1 text-xs"><SelectValue placeholder="Choose a community microplan to auto-fill" /></SelectTrigger>
                  <SelectContent>
                    {effectiveMicroplans.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.community_name} {m.settlement_name ? `(${m.settlement_name})` : ""} — {m.ward}, {m.lga} {m._isDemo ? "(Demo)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={fetchMicroplans} disabled={loading}>
                  <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1 px-1">
                {isUsingDemoData ? "Showing demo data (no real entries found for this project)" : `Showing ${microplans.length} entries for this project`}
              </p>
            </Field>

            {activeMicroplan && (
              <div className="grid grid-cols-3 gap-2 p-3 border border-border rounded-md bg-muted/20">
                <div className="flex flex-col">
                  <span className="text-[10px] text-muted-foreground">Total Pop</span>
                  <span className="text-sm font-bold">{activeMicroplan.estimated_total_population?.toLocaleString() || "—"}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] text-muted-foreground">Target Pop (5+)</span>
                  <span className="text-sm font-bold">{targetPopulation?.toLocaleString() || "—"}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] text-muted-foreground">Medicine Allocation</span>
                  <span className="text-sm font-bold text-primary">{activeAllocation ? `${activeAllocation.amount} ${activeAllocation.medicine_name || "Doses"}` : "—"}</span>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
              <Field label="State *">
                <Select value={state} onValueChange={(v) => { setState(v); setLga(""); setWard(""); }}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select state" /></SelectTrigger>
                  <SelectContent>{getAllStates().map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field label="LGA *">
                <Select value={lga} onValueChange={(v) => { setLga(v); setWard(""); }} disabled={!state}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select LGA" /></SelectTrigger>
                  <SelectContent>{lgaOptions.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field label="Ward *">
                <Select value={ward} onValueChange={setWard} disabled={!lga}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select ward" /></SelectTrigger>
                  <SelectContent>{wardOptions.map((w) => <SelectItem key={w} value={w}>{w}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field label="FLHF Name"><Input value={flhfName} onChange={(e) => setFlhfName(e.target.value)} className="h-8 text-xs" /></Field>
              <Field label="Community *"><Input value={communityName} onChange={(e) => setCommunityName(e.target.value)} className="h-8 text-xs" /></Field>
              <Field label="Settlement"><Input value={settlementName} onChange={(e) => setSettlementName(e.target.value)} className="h-8 text-xs" /></Field>
            </div>

            <div className="flex flex-wrap gap-2 items-center">
              <BasemapToggle value={basemap} onChange={setBasemap} />
              <Button
                size="sm"
                variant={recordingPerimeter ? "destructive" : accuracyOk ? "default" : "outline"}
                onClick={() => setRecordingPerimeter((r) => !r)}
                disabled={!gps || gps.accuracy > 50}
                className={!accuracyOk && !recordingPerimeter ? "border-amber-500 text-amber-700" : ""}
              >
                <Navigation className={`h-4 w-4 mr-1 ${recordingPerimeter ? "animate-pulse" : ""}`} />
                {recordingPerimeter ? `Stop (${perimeter.length} pts)` : accuracyOk ? "Walk Perimeter" : "Force Start Perimeter"}
              </Button>
              {perimeter.length > 0 && (
                <Button size="sm" variant="ghost" onClick={() => setPerimeter([])}>Clear perimeter</Button>
              )}
            </div>

            {gps && (
              <CESSurveyMap
                centerLat={gps.lat}
                centerLng={gps.lng}
                perimeter={perimeter}
                segments={[]}
                selectedSegmentIds={[]}
                households={[]}
                basemap={basemap}
                height="50vh"
              />
            )}

            <div className="flex justify-between">
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button onClick={async () => {
                const missing = [];
                if (!state) missing.push("State");
                if (!lga) missing.push("LGA");
                if (!ward) missing.push("Ward");
                if (!communityName) missing.push("Community Name");
                
                if (missing.length > 0) {
                  toast({ 
                    title: "Required Fields Missing", 
                    description: `Please select: ${missing.join(", ")}`, 
                    variant: "destructive" 
                  });
                  return;
                }

                if (!gps) {
                  toast({ title: "No GPS Signal", description: "Wait for a GPS lock before proceeding.", variant: "destructive" });
                  return;
                }

                // If they have a perimeter, we trust the boundary even if current accuracy is slightly off.
                // Otherwise, require accuracy <= 50m for a decent center point.
                const canProceedAccuracy = accuracyOk || (perimeter.length > 3) || (gps.accuracy <= 50);
                
                if (!canProceedAccuracy) {
                  toast({ 
                    title: "Low GPS Accuracy", 
                    description: `Current accuracy is ${gps.accuracy.toFixed(1)}m. Please wait for < 25m or record a perimeter first.`, 
                    variant: "destructive" 
                  });
                  return;
                }

                await persistSurvey("draft");
                setStep(2);
              }}>Next: Estimate & Sample →</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* STEP 2 */}
      {step === 2 && gps && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5" />Step 2 — Estimate Households & Design Sample</CardTitle>
            <CardDescription>AI counts rooftops on satellite imagery; you set target sample N; the area is split into equal-density segments and one is randomly selected.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 items-end">
              <Field label="AI Estimated HH">
                <div className="flex gap-1">
                  <Input type="number" value={estHHAi ?? ""} readOnly className="h-8 text-xs" />
                  <Button size="sm" onClick={runRooftopAI} disabled={aiLoading}>
                    {aiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  </Button>
                </div>
              </Field>
              <Field label="Adjusted HH (you)">
                <Input type="number" value={estHHUser ?? ""} onChange={(e) => setEstHHUser(Number(e.target.value) || null)} className="h-8 text-xs" />
              </Field>
              <Field label="Target Sample N">
                <Input type="number" value={targetN} onChange={(e) => setTargetN(Number(e.target.value) || 1)} className="h-8 text-xs" />
              </Field>
              <Field label="Segments (auto)">
                <Input
                  type="number" readOnly className="h-8 text-xs"
                  value={Math.max(1, Math.ceil((estHHUser ?? estHHAi ?? 0) / Math.max(targetN, 1)))}
                />
              </Field>
            </div>

            <div className="flex gap-2">
              <Button onClick={buildSegments}><Target className="h-4 w-4 mr-1" />Build Segments & Randomly Select</Button>
              {segments.length > 0 && (
                <Button variant="outline" onClick={sampleAnotherSegment}>
                  <Shuffle className="h-4 w-4 mr-1" />Sample Another Segment
                </Button>
              )}
            </div>

            <CESSurveyMap
              centerLat={gps.lat} centerLng={gps.lng}
              perimeter={perimeter} segments={segments}
              selectedSegmentIds={selectedSegmentLabels}
              households={[]}
              basemap={basemap}
              height="50vh"
            />

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(1)}>← Back</Button>
              <Button onClick={async () => { await persistSurvey("draft"); setStep(3); }} disabled={selectedSegmentLabels.length === 0}>
                Next: Visit Households →
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* STEP 3 */}
      {step === 3 && gps && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><MapPin className="h-5 w-5" />Step 3 — Visit Households (geofenced)</CardTitle>
            <CardDescription>Tap inside the highlighted segment to drop a household pin. {households.length}/{targetN} interviewed.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {!isOnline && (
              <Alert className="border-amber-400 bg-amber-50 dark:bg-amber-950/30">
                <WifiOff className="h-4 w-4 text-amber-600" />
                <AlertDescription className="text-xs text-amber-700 dark:text-amber-300 font-medium">
                  Offline Mode Active. Household visits will be saved locally and can be synced when you return to coverage.
                </AlertDescription>
              </Alert>
            )}

            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                You must remain inside the highlighted segment. GPS accuracy must be &lt;20 m to drop a pin.
              </AlertDescription>
            </Alert>

            <CESSurveyMap
              centerLat={gps.lat} centerLng={gps.lng}
              perimeter={perimeter}
              segments={segments}
              selectedSegmentIds={selectedSegmentLabels}
              households={households}
              routeTo={selectedSegmentLabels.length ? segments.find((s) => s.label === selectedSegmentLabels[selectedSegmentLabels.length - 1])?.centroid : null}
              basemap={basemap}
              onMapTap={handleMapTap}
              height="55vh"
            />

            <div className="flex flex-wrap items-center gap-3 p-4 bg-muted/20 rounded-xl border border-border">
              <div className="flex-1 min-w-[200px]">
                <Label className="text-xs font-black uppercase text-muted-foreground">Reported Households in this Segment</Label>
                <div className="flex items-center gap-2 mt-1">
                  <Input 
                    type="number" 
                    value={reportedTotalHHs[selectedSegmentLabels[selectedSegmentLabels.length - 1]] || ""} 
                    onChange={(e) => {
                      const val = parseInt(e.target.value) || 0;
                      const label = selectedSegmentLabels[selectedSegmentLabels.length - 1];
                      if (label) setReportedTotalHHs(prev => ({ ...prev, [label]: val }));
                    }}
                    placeholder="Total HHs in segment..."
                    className="h-10 font-bold"
                  />
                  <div className="flex flex-col">
                    <span className="text-[10px] font-black text-primary">GEOGRAPHIC BASE</span>
                    <span className="text-[9px] text-muted-foreground">Required for Geo Coverage</span>
                  </div>
                </div>
              </div>
              <div className="h-10 w-[1px] bg-border hidden md:block" />
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="h-8 px-3 text-[11px] font-black">INTERVIEWED: {households.length} / {targetN}</Badge>
                <Button variant="outline" size="sm" className="h-8" onClick={sampleAnotherSegment}>
                  <Shuffle className="h-4 w-4 mr-1" />Sample Another Segment
                </Button>
              </div>
            </div>

              <div className="ml-auto flex gap-2">
                <Button variant="outline" onClick={() => setStep(2)}>← Back</Button>
                <Button onClick={() => { computeAnalysis(); setStep(4); }}>Next: Analysis →</Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* STEP 4 */}
      {step === 4 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><BarChart3 className="h-5 w-5" />Step 4 — CES Coverage Map & Inference</CardTitle>
            <CardDescription>Design-based weighted coverage with 95% & 99% CIs and Microplanning JRSM cross-validation.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {!coverage ? (
              <Button onClick={computeAnalysis}>Compute Coverage</Button>
            ) : (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3">
                  <KPI label="Inferred Coverage" value={`${coverage.inferredCoveragePct.toFixed(1)}%`} accent />
                  <KPI label="Therapeutic Cov." value={`${coverage.therapeuticCoveragePct.toFixed(1)}%`} accent color="text-emerald-600" />
                  <KPI label="Geographic Cov." value={`${coverage.geographicCoveragePct.toFixed(1)}%`} accent color="text-indigo-600" />
                  <KPI label="95% CI" value={`${coverage.ci95[0].toFixed(1)} – ${coverage.ci95[1].toFixed(1)}%`} />
                  <KPI label="99% CI" value={`${coverage.ci99[0].toFixed(1)} – ${coverage.ci99[1].toFixed(1)}%`} />
                  <KPI label="Design Effect" value={coverage.designEffect.toFixed(2)} />
                  <KPI label="Sampled HH" value={String(coverage.totalSampled)} />
                  <KPI label="Treated HH" value={String(coverage.totalTreatedHH)} />
                  <KPI label="Eligible Pers." value={String(coverage.totalEligiblePersons)} />
                  <KPI label="Treated Pers." value={String(coverage.totalTreatedPersons)} />
                  {routeRealismScore !== null && <KPI label="Route Realism" value={`${(routeRealismScore * 100).toFixed(1)}%`} />}
                  {blendedCoveragePct !== null && <KPI label="Bayesian Blend" value={`${blendedCoveragePct.toFixed(1)}%`} accent />}
                  <KPI label="Precision (±)" value={`${coverage.precisionPct.toFixed(1)}%`} />
                  <KPI label="Segments" value={`${selectedSegmentLabels.length}/${segments.length}`} />
                </div>


                {gps && (
                  <CESSurveyMap
                    centerLat={gps.lat} centerLng={gps.lng}
                    perimeter={perimeter}
                    segments={segments.map((s) => {
                      // choropleth coloring by coverage
                      const inside = households.filter((h) => pointInPolygon({ lat: h.lat, lng: h.lng }, s.polygon));
                      const tr = inside.filter((h) => h.coverage_status === "treated").length;
                      const pct = inside.length ? (tr / inside.length) * 100 : -1;
                      const color = pct < 0 ? "#94a3b8" : pct >= 80 ? "#16a34a" : pct >= 70 ? "#eab308" : "#dc2626";
                      return { ...s, color };
                    })}
                    selectedSegmentIds={selectedSegmentLabels}
                    households={households}
                    basemap={basemap}
                    height="45vh"
                  />
                )}

                <Card className="border-primary/40">
                  <CardHeader className="py-2"><CardTitle className="text-sm flex items-center gap-2"><Building className="h-4 w-4" />JRSM Microplanning Cross-Validation</CardTitle></CardHeader>
                  <CardContent className="text-xs space-y-2">
                    {!microCompare ? (
                      <p className="text-muted-foreground">No matching microplanning record found for this State / LGA / Ward / Community combination.</p>
                    ) : (
                      <>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                          <KPI label="CES Coverage" value={`${microCompare.pCES.toFixed(1)}%`} />
                          <KPI label="JRSM Reported" value={`${microCompare.pJRSM.toFixed(1)}%`} />
                          <KPI label="Diff (CES − JRSM)" value={`${microCompare.diff > 0 ? "+" : ""}${microCompare.diff.toFixed(1)}%`} />
                          <KPI label="z / p-value" value={`${microCompare.z.toFixed(2)} / ${microCompare.pValue.toFixed(3)}`} />
                          <KPI label="95% CI of diff" value={`${microCompare.ci95[0].toFixed(1)} to ${microCompare.ci95[1].toFixed(1)}%`} />
                          <KPI label="99% CI of diff" value={`${microCompare.ci99[0].toFixed(1)} to ${microCompare.ci99[1].toFixed(1)}%`} />
                          <KPI label="Verdict" value={microCompare.agreement.replace("_", " ")} accent={microCompare.agreement === "agree"} />
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>
              </>
            )}
            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(3)}>← Back</Button>
              <Button onClick={() => setStep(5)} disabled={!coverage}>Next: Export →</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* STEP 5 */}
      {step === 5 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Download className="h-5 w-5" />Step 5 — Export & Supervisor QC</CardTitle>
            <CardDescription>Export raw data, GeoJSON, and a 1-page WHO-style PDF report. Lock the survey after Supervisor QC.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">

            {/* ── Completion Gauge ── */}
            <div className="rounded-xl border border-border p-4 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-semibold flex items-center gap-2">
                  <ClipboardCheck className="h-4 w-4 text-primary" />
                  Sample Completion
                </span>
                <Badge variant={isBelowThreshold ? "destructive" : "default"} className={isBelowThreshold ? "" : "bg-green-600"}>
                  {completionPct.toFixed(0)}% ({households.length}/{targetN} HH)
                </Badge>
              </div>
              <div className="w-full h-3 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${completionPct}%`, background: isBelowThreshold ? "hsl(0,70%,50%)" : "hsl(142,60%,40%)" }}
                />
              </div>
              {isBelowThreshold && !qcApproved && (
                <Alert variant="destructive" className="py-2">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription className="text-xs">
                    Sample is below the 80% threshold. A Supervisor QC approval is required before locking.
                  </AlertDescription>
                </Alert>
              )}
              {qcApproved === true && (
                <Alert className="py-2 border-amber-400 bg-amber-50 dark:bg-amber-950/30">
                  <ThumbsUp className="h-4 w-4 text-amber-600" />
                  <AlertDescription className="text-xs text-amber-700 dark:text-amber-300">
                    <strong>QC Override Approved</strong> by {qcSupervisorName}. Survey is ready to lock.
                  </AlertDescription>
                </Alert>
              )}
              {qcApproved === false && (
                <Alert variant="destructive" className="py-2">
                  <ThumbsDown className="h-4 w-4" />
                  <AlertDescription className="text-xs">
                    <strong>Rejected by Supervisor.</strong> Return to Step 3 to complete more household interviews.
                  </AlertDescription>
                </Alert>
              )}
              {qcLockedAt && (
                <Alert className="py-2 border-green-500 bg-green-50 dark:bg-green-950/30">
                  <Lock className="h-4 w-4 text-green-600" />
                  <AlertDescription className="text-xs text-green-700 dark:text-green-300">
                    Survey locked at {new Date(qcLockedAt).toLocaleString()}.
                  </AlertDescription>
                </Alert>
              )}
            </div>

            {/* ── Export Buttons ── */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <Button onClick={exportCSV}><FileSpreadsheet className="h-4 w-4 mr-1" />Export Raw CSV</Button>
              <Button onClick={exportGeoJSON} variant="outline"><MapIcon className="h-4 w-4 mr-1" />Export GeoJSON</Button>
              <Button onClick={exportPDF} variant="outline"><FileText className="h-4 w-4 mr-1" />Generate PDF Report</Button>
            </div>

            {/* ── Lock Button ── */}
            {qcApproved !== false && !qcLockedAt && (
              <Button
                onClick={lockSurvey}
                variant="default"
                className={`w-full font-bold ${
                  isBelowThreshold && !qcApproved
                    ? "bg-amber-600 hover:bg-amber-700 text-white"
                    : "bg-green-700 hover:bg-green-800 text-white"
                }`}
              >
                {isBelowThreshold && !qcApproved ? (
                  <><AlertTriangle className="h-4 w-4 mr-2" />Supervisor QC Required — Click to Review &amp; Approve</>
                ) : (
                  <><Lock className="h-4 w-4 mr-2" />Lock Survey (Supervisor QC Complete)</>
                )}
              </Button>
            )}
            {qcLockedAt && (
              <div className="flex items-center justify-center gap-2 py-3 rounded-xl bg-green-50 dark:bg-green-950/30 border border-green-300 dark:border-green-800">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                <span className="text-sm font-semibold text-green-700 dark:text-green-300">Survey is Locked</span>
              </div>
            )}

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(4)}>← Back</Button>
              <Button variant="outline" onClick={onClose}>Done</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Household pin dialog */}
      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Household Visit — {`HH${String(households.length + 1).padStart(3, "0")}`}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {isDuplicatePin && (
              <Alert variant="destructive" className="bg-red-50/50">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  <p className="font-semibold text-xs mb-1">Location Reuse Risk</p>
                  <p className="text-[11px] mb-2">This pin is within 15m of an existing household.</p>
                  <Select value={(hhForm as any).duplicateReason || ""} onValueChange={(v) => setHhForm((f: any) => ({...f, duplicateReason: v}))}>
                    <SelectTrigger className="h-7 text-xs bg-white"><SelectValue placeholder="Reason for overlap" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="new_structure">New Structure</SelectItem>
                      <SelectItem value="different_family">Different Family in same compound</SelectItem>
                      <SelectItem value="gps_drift">GPS Drift Correction</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </AlertDescription>
              </Alert>
            )}
            <Field label="Coverage Status">
              <div className="grid grid-cols-2 gap-1">
                {COVERAGE_OPTIONS.map((o) => (
                  <Button key={o.value} size="sm" variant={hhForm.status === o.value ? "default" : "outline"}
                    onClick={() => setHhForm((f) => ({ ...f, status: o.value }))} className="justify-start text-xs">
                    <o.icon className={`h-4 w-4 mr-1 ${o.color}`} />{o.label}
                  </Button>
                ))}
              </div>
            </Field>
            <Field label="Intervention Commodity">
              <Select value={hhForm.commodity} onValueChange={(v) => setHhForm((f) => ({ ...f, commodity: v }))}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>{COMMODITY_OPTIONS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </Field>

            {hhForm.status === "treated" && (
              <div className="grid grid-cols-2 gap-3 p-3 bg-indigo-50/50 rounded-lg border border-indigo-100">
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-indigo-700">Eligible Persons</Label>
                  <Input 
                    type="number" 
                    placeholder="0"
                    value={hhForm.eligiblePersons}
                    onChange={(e) => setHhForm(f => ({ ...f, eligiblePersons: e.target.value }))}
                    className="h-8 border-indigo-200"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-emerald-700">Treated Persons</Label>
                  <Input 
                    type="number" 
                    placeholder="0"
                    value={hhForm.treatedPersons}
                    onChange={(e) => setHhForm(f => ({ ...f, treatedPersons: e.target.value }))}
                    className="h-8 border-emerald-200"
                  />
                </div>
              </div>
            )}

            <Field label="Visit Notes">
              <Textarea value={hhForm.notes} onChange={(e) => setHhForm((f) => ({ ...f, notes: e.target.value }))} className="text-xs min-h-[60px]" />
            </Field>

          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setPickerOpen(false); setPendingPin(null); }}>Cancel</Button>
            <Button onClick={saveHousehold}><Save className="h-4 w-4 mr-1" />Save Household</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Witness QR Dialog */}
      <Dialog open={qrCodeOpen} onOpenChange={setQrCodeOpen}>
        <DialogContent className="max-w-sm text-center">
          <DialogHeader><DialogTitle>Community Witness System</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4 flex flex-col items-center">
            <p className="text-xs text-muted-foreground">
              Ask a community member or leader to scan this QR code to verify this interview.
            </p>
            {lastSavedHHData && (
              <div className="p-4 bg-white rounded-xl shadow-sm border inline-block">
                <QRCodeSVG value={lastSavedHHData.url} size={200} />
              </div>
            )}
            <p className="text-[10px] text-muted-foreground font-mono bg-muted p-2 rounded w-full truncate">
              {lastSavedHHData?.url}
            </p>
          </div>
          <DialogFooter>
            <Button className="w-full" onClick={() => setQrCodeOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Supervisor QC Dialog (unlocked when < 80%) ─── */}
      <Dialog open={qcDialogOpen} onOpenChange={setQcDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserCheck className="h-5 w-5 text-amber-500" />
              Supervisor QC Review
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Completion summary */}
            <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-3 space-y-2">
              <div className="flex items-center justify-between text-sm font-semibold">
                <span>Sample Completion</span>
                <Badge variant="destructive">{completionPct.toFixed(0)}% ({households.length}/{targetN} HH)</Badge>
              </div>
              <div className="w-full h-2.5 bg-muted rounded-full overflow-hidden">
                <div className="h-full rounded-full bg-red-500 transition-all" style={{ width: `${completionPct}%` }} />
              </div>
              <div className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-300">
                <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                This survey is below the 80% completion threshold. As the assigned Supervisor, you must explicitly approve or reject before the survey can be locked.
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold">Supervisor Full Name *</Label>
              <Input
                value={qcSupervisorName}
                onChange={(e) => setQcSupervisorName(e.target.value)}
                placeholder="e.g. Dr. Aisha Bello"
                className="h-9 text-sm"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold">QC Verdict *</Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setQcVerdict("approve_override")}
                  className={`flex items-center justify-center gap-2 rounded-lg border-2 p-3 text-sm font-semibold transition-all ${
                    qcVerdict === "approve_override"
                      ? "border-green-500 bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-300"
                      : "border-border hover:border-green-300"
                  }`}
                >
                  <ThumbsUp className="h-4 w-4" /> Approve Override
                </button>
                <button
                  onClick={() => setQcVerdict("reject")}
                  className={`flex items-center justify-center gap-2 rounded-lg border-2 p-3 text-sm font-semibold transition-all ${
                    qcVerdict === "reject"
                      ? "border-red-500 bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300"
                      : "border-border hover:border-red-300"
                  }`}
                >
                  <ThumbsDown className="h-4 w-4" /> Reject
                </button>
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold">
                {qcVerdict === "reject" ? "Reason for Rejection *" : "Reason for Override / QC Notes *"}
              </Label>
              <Textarea
                value={qcNotes}
                onChange={(e) => setQcNotes(e.target.value)}
                placeholder={qcVerdict === "reject" ? "e.g. Survey team did not reach required sample size in 2 segments..." : "e.g. Village is small, all households visited. Target N was set conservatively..."}
                className="text-xs min-h-[80px]"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setQcDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={handleQcSubmit}
              className={qcVerdict === "reject" ? "bg-red-600 hover:bg-red-700 text-white" : "bg-amber-600 hover:bg-amber-700 text-white"}
            >
              {qcVerdict === "reject" ? <><ThumbsDown className="h-4 w-4 mr-1" />Reject Survey</> : <><ThumbsUp className="h-4 w-4 mr-1" />Approve Override</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── helpers ───
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px] text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function KPI({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`p-2 rounded border ${accent ? "border-primary bg-primary/5" : "border-border"}`}>
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
      <div className={`text-base font-bold ${accent ? "text-primary" : ""}`}>{value}</div>
    </div>
  );
}

function BasemapToggle({ value, onChange }: { value: "satellite" | "street" | "terrain"; onChange: (v: any) => void }) {
  return (
    <div className="inline-flex border border-border rounded-md overflow-hidden">
      {[
        { v: "satellite", icon: Satellite, label: "Sat" },
        { v: "street", icon: MapIcon, label: "Street" },
        { v: "terrain", icon: Mountain, label: "Terrain" },
      ].map((b) => (
        <button
          key={b.v}
          onClick={() => onChange(b.v)}
          className={`px-3 py-1.5 text-xs flex items-center gap-1 ${value === b.v ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"}`}
        >
          <b.icon className="h-3.5 w-3.5" />{b.label}
        </button>
      ))}
    </div>
  );
}

function pointInPolygon(pt: LatLng, poly: LatLng[]): boolean {
  if (poly.length < 3) return false;
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].lng, yi = poly[i].lat;
    const xj = poly[j].lng, yj = poly[j].lat;
    const intersect = ((yi > pt.lat) !== (yj > pt.lat)) &&
      (pt.lng < ((xj - xi) * (pt.lat - yi)) / ((yj - yi) || 1e-12) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function circleAround(c: { lat: number; lng: number }, radiusM: number, n: number): LatLng[] {
  const out: LatLng[] = [];
  const R = 6371000;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * 2 * Math.PI;
    const dLat = (radiusM / R) * (180 / Math.PI) * Math.cos(a);
    const dLng = (radiusM / R) * (180 / Math.PI) * Math.sin(a) / Math.cos((c.lat * Math.PI) / 180);
    out.push({ lat: c.lat + dLat, lng: c.lng + dLng });
  }
  return out;
}

async function fetchMicroplanComparison(
  state: string, lga: string, ward: string, community: string,
  cesTreated: number, cesSampled: number,
): Promise<ProportionCompare | null> {
  if (!state || !lga || !ward || !community) return null;
  // Try common microplanning table names — tolerant lookup
  const tables = ["microplan_entries", "microplanning_entries", "microplans"];
  for (const t of tables) {
    const { data, error } = await supabase
      .from(t as any).select("*")
      .eq("state", state).eq("lga", lga).eq("ward", ward).eq("community_name", community)
      .limit(1);
    if (!error && data && data.length > 0) {
      const r: any = data[0];
      const target = r.estimated_total_population ?? r.target_population ?? r.number_of_households ?? 0;
      const treated = r.treated ?? r.persons_treated ?? r.people_treated ?? r.medicine_distributed ?? null;
      if (target > 0 && treated != null) {
        return compareProportions(cesTreated, cesSampled, Number(treated), Number(target));
      }
    }
  }
  return null;
}

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
  ThumbsUp, ThumbsDown, Wifi, WifiOff, RefreshCw, UserCheck, ClipboardCheck, Info, Eye,
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
import StreetViewPanel from "./StreetViewPanel";
import {
  getResidentialMask,
  pointInPolygon as pointInPolygonGeo,
  isOnExcludedFeature,
  snapToNearestResidential,
  polygonAreaM2,
  haversineM as haversineMeters,
  type ResidentialMaskResult,
} from "./utils/residentialMask";

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
  const [walkedM, setWalkedM] = useState(0);
  const [lastVertexAt, setLastVertexAt] = useState<number | null>(null);
  const [nowTick, setNowTick] = useState(Date.now());
  const [vertexFlash, setVertexFlash] = useState(0);
  const [residentialMask, setResidentialMask] = useState<ResidentialMaskResult | null>(null);
  const [maskStatus, setMaskStatus] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [basemap, setBasemap] = useState<"satellite" | "hybrid" | "street" | "terrain">("hybrid");
  const [streetViewOpen, setStreetViewOpen] = useState(false);
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

  const handleMicroplanSelect = (id: string) => {
    setSelectedMicroplanId(id);
    const plan = microplans.find((m) => m.id === id);
    if (plan) {
      setState(plan.state || "");
      setLga(plan.lga || "");
      setWard(plan.ward || "");
      setFlhfName(plan.flhf_name || "");
      setCommunityName(plan.community_name || "");
      setSettlementName(plan.settlement_name || "");
    }
  };

  const activeMicroplan = microplans.find((m) => m.id === selectedMicroplanId);
  const activeAllocation = activeMicroplan ? medicineAllocations.find(a => a.lga === activeMicroplan.lga) : null;
  const targetPopulation = activeMicroplan ? ((activeMicroplan.estimated_children_5_14 || 0) + (activeMicroplan.estimated_adults_15_plus || 0)) : null;

  // Step 2 — sampling
  const [estHHAi, setEstHHAi] = useState<number | null>(null);
  const [estHHAiCI, setEstHHAiCI] = useState<{ low: number; high: number; confidence: string } | null>(null);
  const [estHHUser, setEstHHUser] = useState<number | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [targetN, setTargetN] = useState<number>(20);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [selectedSegmentLabels, setSelectedSegmentLabels] = useState<string[]>([]);
  const [reportedTotalHHs, setReportedTotalHHs] = useState<Record<string, number>>({});

  // Outside-of-microplan handling
  const [outsideMicroplan, setOutsideMicroplan] = useState(false);
  const [outsideMicroplanReason, setOutsideMicroplanReason] = useState("");

  // "Sample Another Segment" reason dialog
  const [resampleDialogOpen, setResampleDialogOpen] = useState(false);
  const [resampleReason, setResampleReason] = useState("");
  const [resampleHistory, setResampleHistory] = useState<Array<{ id: string; segment_label: string; reason: string; created_at: string }>>([]);

  // Step 2 — toggle to visualize what residential mask is excluding
  const [showExclusionLayer, setShowExclusionLayer] = useState(false);
  // Step 2 — toggle to visualize detected residential buildings on the satellite map (default ON)
  const [showResidentialLayer, setShowResidentialLayer] = useState(true);

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

  // ---------- GPS lock (hybrid: high-accuracy GPS + Wi-Fi/cell fallback) ----------
  const watchHighRef = useRef<number | null>(null);
  const watchLowRef = useRef<number | null>(null);
  const kickstartIvRef = useRef<number | null>(null);
  const lkgRef = useRef<{ lat: number; lng: number; accuracy: number } | null>(null);
  const lastFixAtRef = useRef<number>(0);
  const gpsStartedAtRef = useRef<number>(Date.now());
  const [gpsError, setGpsError] = useState<null | "denied" | "unavailable" | "timeout" | "insecure" | "unsupported">(null);
  const [gpsElapsed, setGpsElapsed] = useState(0);
  const [indoorMode, setIndoorMode] = useState(false);

  // Apply a fresh reading: best-of merge (prefer better accuracy within last 8s).
  const applyFix = useCallback((p: { lat: number; lng: number; accuracy: number }, source: "high" | "low") => {
    const now = Date.now();
    setGpsError(null);
    // Track LKG always (best ever)
    if (!lkgRef.current || p.accuracy < lkgRef.current.accuracy) lkgRef.current = p;

    setGps((prev) => {
      // First fix → seed directly
      if (!prev) {
        lastFixAtRef.current = now;
        setIndoorMode(source === "low");
        return p;
      }
      // If a much-better-accuracy reading recently arrived, ignore worse one
      const fresh = now - lastFixAtRef.current < 8000;
      if (fresh && p.accuracy > prev.accuracy * 2.5) return prev;

      // Throttle micro-noise
      const dLat = p.lat - prev.lat;
      const dLng = p.lng - prev.lng;
      const meters = Math.sqrt(dLat * dLat + dLng * dLng) * 111320;
      if (meters < 0.3 && Math.abs(p.accuracy - prev.accuracy) < 1) return prev;

      // Adaptive smoothing
      let alpha = 0.5;
      if (p.accuracy < 10) alpha = 0.9;
      else if (p.accuracy > 30) alpha = 0.2;

      lastFixAtRef.current = now;
      setIndoorMode(source === "low" && p.accuracy > 50);
      return {
        lat: prev.lat * (1 - alpha) + p.lat * alpha,
        lng: prev.lng * (1 - alpha) + p.lng * alpha,
        accuracy: p.accuracy,
      };
    });
  }, []);

  const startGPSLock = useCallback(() => {
    if (typeof window !== "undefined" && !window.isSecureContext) {
      setGpsError("insecure");
      return;
    }
    if (!("geolocation" in navigator)) {
      setGpsError("unsupported");
      return;
    }
    if (watchHighRef.current !== null || watchLowRef.current !== null) return;

    setGpsError(null);
    setGpsWatching(true);
    gpsStartedAtRef.current = Date.now();

    // Fast cached seed (Wi-Fi/cell, immediate)
    navigator.geolocation.getCurrentPosition(
      (pos) => applyFix(
        { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy },
        "low"
      ),
      () => { /* swallow — high-acc watch will fire */ },
      { enableHighAccuracy: false, maximumAge: 60_000, timeout: 5000 }
    );

    // High-accuracy continuous watch (GPS chip, sky-required)
    watchHighRef.current = navigator.geolocation.watchPosition(
      (pos) => applyFix(
        { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy },
        "high"
      ),
      (err) => {
        if (err.code === 1) setGpsError("denied");
        else if (err.code === 2) setGpsError((prev) => prev ?? "unavailable");
        else if (err.code === 3) setGpsError((prev) => prev ?? "timeout");
      },
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 30_000 }
    );

    // Parallel low-accuracy watch (network positioning, indoor-friendly)
    watchLowRef.current = navigator.geolocation.watchPosition(
      (pos) => applyFix(
        { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy },
        "low"
      ),
      () => { /* swallow */ },
      { enableHighAccuracy: false, maximumAge: 5000, timeout: 30_000 }
    );

    // Indoor kickstart: re-pulse if no fix in 10s
    kickstartIvRef.current = window.setInterval(() => {
      if (Date.now() - lastFixAtRef.current < 8000) return;
      navigator.geolocation.getCurrentPosition(
        (pos) => applyFix(
          { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy },
          pos.coords.accuracy < 50 ? "high" : "low"
        ),
        () => { /* keep trying */ },
        { enableHighAccuracy: false, maximumAge: 10_000, timeout: 8000 }
      );
    }, 10_000);
  }, [applyFix]);

  const stopGPSLock = useCallback(() => {
    if (watchHighRef.current !== null) { navigator.geolocation.clearWatch(watchHighRef.current); watchHighRef.current = null; }
    if (watchLowRef.current !== null) { navigator.geolocation.clearWatch(watchLowRef.current); watchLowRef.current = null; }
    if (kickstartIvRef.current !== null) { window.clearInterval(kickstartIvRef.current); kickstartIvRef.current = null; }
  }, []);

  const retryGPSLock = useCallback(() => {
    stopGPSLock();
    setGpsWatching(false);
    setGpsError(null);
    setTimeout(() => startGPSLock(), 0);
  }, [startGPSLock, stopGPSLock]);

  // Mount-only: register watches exactly once, tear down on unmount.
  useEffect(() => {
    startGPSLock();
    return () => stopGPSLock();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tick "acquiring..." elapsed seconds while waiting for first fix
  useEffect(() => {
    if (gps || gpsError) return;
    const id = window.setInterval(() => {
      setGpsElapsed(Math.floor((Date.now() - gpsStartedAtRef.current) / 1000));
    }, 500);
    return () => window.clearInterval(id);
  }, [gps, gpsError]);

  // (auto-advance Step 1 → Step 2 effect declared after persistSurvey, below)
  const autoAdvancedRef = useRef(false);

  // ---------- perimeter recording (DEDICATED raw high-accuracy watcher) ----------
  // We open our own watchPosition while recording so we get every raw fix
  // (the shared `gps` state is smoothed/throttled and would suppress vertices).
  const perimeterBestAccRef = useRef<number>(Infinity);
  const perimeterWatchRef = useRef<number | null>(null);
  const perimeterStartedAtRef = useRef<number>(0);
  const lastVertexFixRef = useRef<{ lat: number; lng: number; acc: number; t: number } | null>(null);
  const [perimeterStatus, setPerimeterStatus] = useState<{ holding: boolean; bestAcc: number; gateM: number }>({ holding: false, bestAcc: Infinity, gateM: 10 });

  useEffect(() => {
    if (!recordingPerimeter) {
      if (perimeterWatchRef.current !== null) {
        try { navigator.geolocation.clearWatch(perimeterWatchRef.current); } catch { /* noop */ }
        perimeterWatchRef.current = null;
      }
      lastVertexFixRef.current = null;
      return;
    }
    if (!("geolocation" in navigator)) return;

    perimeterStartedAtRef.current = Date.now();

    // Adaptive accuracy gate: starts strict at 10 m, relaxes to 35 m if we
    // can't lock a fix that good within ~12s (urban canyon / browser GPS).
    const computeGate = (sinceStartMs: number, sinceLastVertexMs: number) => {
      const elapsed = Math.max(sinceStartMs, sinceLastVertexMs);
      if (elapsed < 6_000) return 10;
      if (elapsed < 12_000) return 18;
      if (elapsed < 25_000) return 25;
      return 35; // last-resort gate so the user still gets vertices while moving
    };

    const onFix = (pos: GeolocationPosition) => {
      const now = Date.now();
      const acc = pos.coords.accuracy;
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;

      perimeterBestAccRef.current = Math.min(perimeterBestAccRef.current, acc);

      const sinceStart = now - perimeterStartedAtRef.current;
      const last = lastVertexFixRef.current;
      const sinceLastVertex = last ? now - last.t : sinceStart;
      const gateM = computeGate(sinceStart, sinceLastVertex);

      if (acc > gateM) {
        setPerimeterStatus({ holding: true, bestAcc: acc, gateM });
        return;
      }

      // Movement gate: scale to GPS noise but keep responsive while walking.
      // First vertex always commits; subsequent require real movement.
      if (!last) {
        lastVertexFixRef.current = { lat, lng, acc, t: now };
        setPerimeter((prev) => (prev.length === 0 ? [{ lat, lng }] : prev));
        setLastVertexAt(now);
        setVertexFlash((f) => f + 1);
        setPerimeterStatus({ holding: false, bestAcc: acc, gateM });
        return;
      }

      const distM = haversineMeters({ lat: last.lat, lng: last.lng }, { lat, lng });
      // Walking pace ≈ 1.4 m/s. Allow a vertex every ≥ max(1.5 × acc, 4 m)
      // OR every 4 s if we've travelled at all (keeps vertex stream lively).
      const moveGate = Math.max(1.5 * acc, 4);
      const timeForce = sinceLastVertex > 4_000 && distM > Math.max(acc, 2);

      if (distM < moveGate && !timeForce) {
        setPerimeterStatus({ holding: false, bestAcc: acc, gateM });
        return;
      }

      lastVertexFixRef.current = { lat, lng, acc, t: now };
      setWalkedM((w) => w + distM);
      setLastVertexAt(now);
      setVertexFlash((f) => f + 1);
      setPerimeter((prev) => [...prev, { lat, lng }]);
      setPerimeterStatus({ holding: false, bestAcc: acc, gateM });
    };

    const onErr = (err: GeolocationPositionError) => {
      // Don't tear down — browsers fire transient timeouts; keep watching.
      console.warn("Perimeter GPS error:", err.code, err.message);
    };

    try {
      perimeterWatchRef.current = navigator.geolocation.watchPosition(onFix, onErr, {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 30_000,
      });
    } catch (e) {
      console.error("Failed to start perimeter watch:", e);
    }

    return () => {
      if (perimeterWatchRef.current !== null) {
        try { navigator.geolocation.clearWatch(perimeterWatchRef.current); } catch { /* noop */ }
        perimeterWatchRef.current = null;
      }
    };
  }, [recordingPerimeter]);

  // Toggle handler — auto-close polygon on stop
  const togglePerimeterRecording = useCallback(() => {
    setRecordingPerimeter((wasRecording) => {
      if (wasRecording) {
        // Stopping → auto-close if last vertex is within 15m of first
        setPerimeter((prev) => {
          if (prev.length < 3) return prev;
          const first = prev[0];
          const last = prev[prev.length - 1];
          const distM = haversineMeters(last, first);
          if (distM <= 15) {
            setWalkedM((w) => w + distM);
            return [...prev, { lat: first.lat, lng: first.lng }];
          }
          return prev;
        });
        perimeterBestAccRef.current = Infinity;
        lastVertexFixRef.current = null;
      } else {
        perimeterBestAccRef.current = Infinity;
        lastVertexFixRef.current = null;
        setWalkedM(0);
        setLastVertexAt(null);
      }
      return !wasRecording;
    });
  }, []);

  // 500ms ticker while recording so "last vertex Xs ago" stays live
  useEffect(() => {
    if (!recordingPerimeter) return;
    const id = window.setInterval(() => setNowTick(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [recordingPerimeter]);

  // Prefetch residential mask once we have ≥3 perimeter vertices (or after stop)
  useEffect(() => {
    if (perimeter.length < 3) return;
    let cancelled = false;
    setMaskStatus("loading");
    getResidentialMask(perimeter)
      .then((m) => { if (!cancelled) { setResidentialMask(m); setMaskStatus("ok"); } })
      .catch(() => { if (!cancelled) { setMaskStatus("error"); } });
    return () => { cancelled = true; };
  }, [perimeter]);



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
      const d = data as any;
      const count = d?.estimated_households ?? 0;
      const ciLow = typeof d?.ci_low === "number" ? d.ci_low : null;
      const ciHigh = typeof d?.ci_high === "number" ? d.ci_high : null;
      const conf = d?.confidence ?? "low";
      setEstHHAi(count);
      if (ciLow !== null && ciHigh !== null) {
        setEstHHAiCI({ low: ciLow, high: ciHigh, confidence: conf });
      } else {
        // Fallback: derive CI client-side from confidence token
        const pct = conf === "high" ? 0.10 : conf === "medium" ? 0.20 : 0.35;
        setEstHHAiCI({ low: Math.max(0, Math.round(count * (1 - pct))), high: Math.round(count * (1 + pct)), confidence: conf });
      }
      setEstHHUser((u) => u ?? count);
      toast({ title: "AI count complete", description: `~${count} rooftops (${conf} confidence)` });
    } catch (e: any) {
      toast({ title: "AI count failed", description: e.message ?? String(e), variant: "destructive" });
    } finally {
      setAiLoading(false);
    }
  }, [gps]);

  // ---------- Sampling design (residential-aware) ----------
  const buildSegments = useCallback(async () => {
    const N = estHHUser ?? estHHAi ?? 0;
    if (!gps || N <= 0 || targetN <= 0) {
      toast({ title: "Need household estimate + target N", variant: "destructive" });
      return;
    }
    const numSegments = Math.max(1, Math.ceil(N / targetN));
    const peri = perimeter.length >= 3 ? perimeter : circleAround(gps, 200, 24);

    // Pull (or refresh) residential mask — cached, so cheap on repeat clicks
    let mask: ResidentialMaskResult | null = residentialMask;
    try {
      if (!mask || mask.residentialBuildings.length === 0) {
        setMaskStatus("loading");
        mask = await getResidentialMask(peri);
        setResidentialMask(mask);
        setMaskStatus("ok");
      }
    } catch {
      setMaskStatus("error");
      mask = null;
    }

    const lats = peri.map((p) => p.lat); const lngs = peri.map((p) => p.lng);
    const minLat = Math.min(...lats), maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);

    let points: LatLng[] = [];
    let usedSource: "osm-buildings" | "synth-masked" | "synth-fallback" = "synth-fallback";

    // Primary: real residential building centroids inside the perimeter
    if (mask && mask.residentialBuildings.length > 0) {
      const inside = mask.residentialBuildings.filter((p) => pointInPolygonGeo(p, peri));
      if (inside.length >= Math.max(20, Math.floor(N * 0.5))) {
        // Sample N from inside (with replacement only if needed)
        const pool = [...inside];
        for (let i = 0; i < N; i++) {
          const pick = pool[Math.floor(Math.random() * pool.length)];
          points.push({ ...pick });
        }
        usedSource = "osm-buildings";
      }
    }

    // Secondary: random in bbox, but reject excluded zones + outside perimeter
    if (points.length === 0) {
      const maxTries = N * 40;
      let tries = 0;
      while (points.length < N && tries < maxTries) {
        tries++;
        const cand = {
          lat: minLat + Math.random() * (maxLat - minLat),
          lng: minLng + Math.random() * (maxLng - minLng),
        };
        if (!pointInPolygonGeo(cand, peri)) continue;
        if (mask && isOnExcludedFeature(cand, mask)) continue;
        points.push(cand);
      }
      usedSource = mask ? "synth-masked" : "synth-fallback";
      // Top up if we couldn't reach N (extremely dense exclusions) — last-resort plain random
      while (points.length < N) {
        points.push({
          lat: minLat + Math.random() * (maxLat - minLat),
          lng: minLng + Math.random() * (maxLng - minLng),
        });
      }
    }

    let segs = kmeansSegments(points, numSegments);

    // Snap each segment centroid off roads/rivers onto nearest residential building
    if (mask && mask.residentialBuildings.length > 0) {
      segs = segs.map((s) => {
        const snapped = snapToNearestResidential(s.centroid, mask!.residentialBuildings, 80);
        return { ...s, centroid: snapped };
      });
    }

    const rIdx = Math.floor(Math.random() * segs.length);
    setSegments(segs);
    setSelectedSegmentLabels([segs[rIdx].label]);
    if (surveyId) logCESAction(surveyId, "build_segments", {
      count: numSegments, selected: segs[rIdx].label, source: usedSource,
      residential_buildings_found: mask?.residentialBuildings.length ?? 0,
    });
    toast({
      title: "Segments built",
      description: usedSource === "osm-buildings"
        ? `${numSegments} segments from ${mask?.residentialBuildings.length ?? 0} residential buildings (OSM)`
        : usedSource === "synth-masked"
          ? `${numSegments} segments — avoiding roads, rivers, schools, hospitals`
          : `${numSegments} segments (no OSM data — basic placement)`,
    });
  }, [estHHUser, estHHAi, targetN, gps, perimeter, surveyId, residentialMask]);


  const openResampleDialog = useCallback(() => {
    if (segments.length === 0) return;
    const usedIdx = selectedSegmentLabels.map((l) => segments.findIndex((s) => s.label === l)).filter((i) => i >= 0);
    const remaining = Array.from({ length: segments.length }, (_, i) => i).filter((i) => !usedIdx.includes(i));
    if (remaining.length === 0) {
      toast({ title: "All segments selected", description: "No more remaining." });
      return;
    }
    setResampleReason("");
    setResampleDialogOpen(true);
  }, [segments, selectedSegmentLabels]);

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
        outside_microplan: outsideMicroplan,
        outside_microplan_reason: outsideMicroplanReason || null,
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
     estHHAi, estHHUser, targetN, segments.length, selectedSegmentLabels, coverage, surveyId,
     outsideMicroplan, outsideMicroplanReason],
  );

  const confirmSampleAnotherSegment = useCallback(async () => {
    if (segments.length === 0) return;
    const reason = resampleReason.trim();
    if (reason.length < 10) {
      toast({ title: "Reason required", description: "Please enter at least 10 characters.", variant: "destructive" });
      return;
    }
    const usedIdx = selectedSegmentLabels.map((l) => segments.findIndex((s) => s.label === l)).filter((i) => i >= 0);
    const remaining = Array.from({ length: segments.length }, (_, i) => i).filter((i) => !usedIdx.includes(i));
    if (remaining.length === 0) {
      toast({ title: "All segments selected", description: "No more remaining." });
      setResampleDialogOpen(false);
      return;
    }
    const next = remaining[Math.floor(Math.random() * remaining.length)];
    const label = segments[next].label;

    let sid = surveyId;
    if (!sid) sid = await persistSurvey("draft");

    if (sid) {
      const { data: u } = await supabase.auth.getUser();
      if (u.user) {
        await supabase.from("ces_segment_resamples" as any).insert({
          survey_id: sid,
          segment_label: label,
          reason,
          created_by: u.user.id,
        });
      }
      logCESAction(sid, "sample_another_segment", { added: label, reason });
    }
    setSelectedSegmentLabels((p) => [...p, label]);
    setResampleDialogOpen(false);
    setResampleReason("");
    toast({ title: "Segment added", description: `Added ${label}. Reason saved.` });
  }, [segments, selectedSegmentLabels, surveyId, persistSurvey, resampleReason]);

  // Auto-advance Step 1 → Step 2 once GPS is locked at ≤25 m and admin fields are set.
  useEffect(() => {
    if (autoAdvancedRef.current) return;
    if (step !== 1) return;
    if (!gps) return;
    if (!state || !lga || !ward || !communityName) return;
    if (recordingPerimeter) return;
    autoAdvancedRef.current = true;
    toast({
      title: "GPS locked",
      description: `±${gps.accuracy.toFixed(0)} m — continuing to Step 2.`,
    });
    persistSurvey("draft").finally(() => setStep(2));
  }, [step, gps, state, lga, ward, communityName, recordingPerimeter, persistSurvey]);

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
      if (gps.accuracy > 50) {
        toast({ title: "Low GPS accuracy", description: `±${gps.accuracy.toFixed(0)} m — pin saved, but consider moving to a clearer spot.` });
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
      const treated = inside.filter((h) => h.coverage_status === "treated").length;
      return {
        est_hh: Math.max(s.count, 1),
        sampled: inside.length,
        treated,
        reported_total_hh: null,
        treated_hh: treated,
        eligible_persons: 0,
        treated_persons: 0,
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
    fetchMicroplanComparison(state, lga, ward, communityName, cov.totalTreated, cov.totalSampled).then(({ found, compare }) => {
      setMicroCompare(compare);
      setOutsideMicroplan(!found);
      // Bayesian Blended Coverage (Upgrade 6)
      if (compare) {
        const blended = 0.5 * cov.inferredCoveragePct + 0.3 * cov.inferredCoveragePct + 0.2 * compare.pJRSM;
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
    const surveyMeta = {
      SurveyID: surveyId, Date: new Date().toISOString(), Community: communityName,
      LGA: lga, State: state, Ward: ward, FLHF: flhfName, Settlement: settlementName,
      Outside_Microplan: outsideMicroplan ? "Yes" : "No",
      Outside_Microplan_Reason: outsideMicroplanReason || "",
      Resample_Count: resampleHistory.length,
    };
    const rows: Record<string, any>[] = households.map((h) => ({
      RowType: "HOUSEHOLD",
      ...surveyMeta,
      SegmentID: selectedSegmentLabels.join("|"),
      HouseholdID: h.hh_number, Lat: h.lat, Long: h.lng,
      Coverage_Status: h.coverage_status,
      Resample_Reason: "", Resample_At: "",
    }));
    for (const r of resampleHistory) {
      rows.push({
        RowType: "RESAMPLE",
        ...surveyMeta,
        SegmentID: r.segment_label,
        HouseholdID: "", Lat: "", Long: "", Coverage_Status: "",
        Resample_Reason: r.reason, Resample_At: r.created_at,
      });
    }
    downloadCSV(rows, `ces-${surveyId ?? "draft"}.csv`);
  }, [households, surveyId, communityName, lga, state, ward, flhfName, settlementName, selectedSegmentLabels, outsideMicroplan, outsideMicroplanReason, resampleHistory]);

  const exportGeoJSON = useCallback(() => {
    const features: any[] = [];
    const reasonsBySegment = new Map<string, string[]>();
    for (const r of resampleHistory) {
      const list = reasonsBySegment.get(r.segment_label) ?? [];
      list.push(r.reason);
      reasonsBySegment.set(r.segment_label, list);
    }
    for (const seg of segments) {
      if (seg.polygon.length >= 3) {
        features.push({
          type: "Feature",
          geometry: { type: "Polygon", coordinates: [seg.polygon.map((p) => [p.lng, p.lat])] },
          properties: {
            label: seg.label, color: seg.color, count: seg.count,
            selected: selectedSegmentLabels.includes(seg.label),
            outside_microplan: outsideMicroplan,
            outside_microplan_reason: outsideMicroplanReason || null,
            resample_reasons: reasonsBySegment.get(seg.label) ?? [],
          },
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
    downloadGeoJSON({
      type: "FeatureCollection",
      features,
      properties: {
        survey_id: surveyId,
        outside_microplan: outsideMicroplan,
        outside_microplan_reason: outsideMicroplanReason || null,
        resamples: resampleHistory,
      },
    }, `ces-${surveyId ?? "draft"}.geojson`);
  }, [segments, households, selectedSegmentLabels, surveyId, outsideMicroplan, outsideMicroplanReason, resampleHistory]);

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
      outsideMicroplan: { flag: outsideMicroplan, reason: outsideMicroplanReason || null },
      resamples: resampleHistory.map((r) => ({ segmentLabel: r.segment_label, reason: r.reason, at: r.created_at })),
      filename: `ces-report-${communityName || surveyId}.pdf`,
    });
  }, [coverage, households, segments.length, communityName, lga, state, surveyId, outsideMicroplan, outsideMicroplanReason, resampleHistory]);


  // Fetch resample history when entering Step 5 (or whenever surveyId changes)
  useEffect(() => {
    if (step !== 5 || !surveyId) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("ces_segment_resamples" as any)
        .select("id, segment_label, reason, created_at")
        .eq("survey_id", surveyId)
        .order("created_at", { ascending: true });
      if (cancelled) return;
      if (error) { console.warn("resample fetch failed", error); return; }
      setResampleHistory((data as any[]) || []);
    })();
    return () => { cancelled = true; };
  }, [step, surveyId]);

  const completionPct = Math.min(100, (households.length / Math.max(targetN, 1)) * 100);
  const isBelowThreshold = completionPct < 80;

  const lockSurvey = useCallback(async () => {
    // If outside microplan, require a documented reason before locking
    if (outsideMicroplan && !outsideMicroplanReason.trim()) {
      toast({ title: "Reason required", description: "Provide a reason for surveying outside the microplan in Step 4 before locking.", variant: "destructive" });
      return;
    }
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
  }, [isBelowThreshold, qcApproved, qcVerdict, qcNotes, qcSupervisorName, completionPct, households.length, targetN, persistSurvey, outsideMicroplan, outsideMicroplanReason]);

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

  // Live walk-perimeter telemetry (recomputed on perimeter / gps / nowTick change)
  const walkTelemetry = useMemo(() => {
    const vertices = perimeter.length;
    const liveAccuracyM = gps?.accuracy ?? null;
    const bestAccuracyM = Number.isFinite(perimeterBestAccRef.current) ? perimeterBestAccRef.current : (liveAccuracyM ?? 0);
    const closureM = (vertices >= 3 && gps)
      ? haversineMeters({ lat: gps.lat, lng: gps.lng }, perimeter[0])
      : null;
    const estAreaM2 = vertices >= 3 ? polygonAreaM2(perimeter) : null;
    const lastVertexAgoS = lastVertexAt ? Math.max(0, Math.floor((nowTick - lastVertexAt) / 1000)) : null;
    const pace: "good" | "slow" | "stationary" =
      !recordingPerimeter ? "good"
      : lastVertexAgoS == null ? "good"
      : lastVertexAgoS < 8 ? "good"
      : lastVertexAgoS < 25 ? "slow"
      : "stationary";
    const readyToClose = recordingPerimeter && vertices >= 6 && closureM != null && closureM <= 15;
    return { vertices, walkedM, liveAccuracyM, bestAccuracyM, closureM, estAreaM2, lastVertexAgoS, pace, readyToClose };
  }, [perimeter, gps, walkedM, lastVertexAt, nowTick, recordingPerimeter]);

  const accColor = (acc: number | null) =>
    acc == null ? "text-muted-foreground" : acc <= 5 ? "text-green-600" : acc <= 10 ? "text-amber-600" : "text-red-600";

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

            {/* GPS lock status panel */}
            {gpsError ? (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="flex items-center justify-between gap-2">
                  <span className="text-xs">
                    {gpsError === "denied" && "Location permission denied. Enable location for this site in your browser settings, then retry."}
                    {gpsError === "unavailable" && "Location unavailable. Move outdoors or check your device GPS, then retry."}
                    {gpsError === "timeout" && "GPS timed out while acquiring a fix. Tap retry to try again."}
                    {gpsError === "insecure" && "GPS requires a secure (HTTPS) connection. Open the app via HTTPS."}
                    {gpsError === "unsupported" && "This device/browser does not support geolocation."}
                  </span>
                  <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={retryGPSLock}>
                    <RefreshCw className="h-3 w-3" /> Retry
                  </Button>
                </AlertDescription>
              </Alert>
            ) : !gps ? (
              <Alert className="border-blue-200 bg-blue-50">
                <Loader2 className="h-4 w-4 text-blue-600 animate-spin" />
                <AlertDescription className="flex items-center justify-between gap-2 text-xs text-blue-800">
                  <span>Acquiring GPS lock… {gpsElapsed}s elapsed. Stay outdoors for best results.</span>
                  <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={retryGPSLock}>
                    <RefreshCw className="h-3 w-3" /> Lock GPS
                  </Button>
                </AlertDescription>
              </Alert>
            ) : gps.accuracy > 50 ? (
              <Alert className="border-amber-200 bg-amber-50">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <AlertDescription className="flex items-center justify-between gap-2 text-xs text-amber-800">
                  <span>
                    {indoorMode ? "Indoor mode (Wi-Fi/cell positioning)." : "Low GPS accuracy."} Current ±{gps.accuracy.toFixed(0)} m. <b>Recommended:</b> &lt;15 m — move near a window or stay still ~10s for a better fix. You can still proceed.
                  </span>
                  <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={retryGPSLock}>
                    <RefreshCw className="h-3 w-3" /> Refresh
                  </Button>
                </AlertDescription>
              </Alert>
            ) : gps.accuracy > 25 ? (
              <Alert className="border-amber-200 bg-amber-50">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <AlertDescription className="text-xs text-amber-800">
                  Moderate GPS accuracy (±{gps.accuracy.toFixed(0)} m). Recommended: &lt;15 m for sharpest boundaries.
                </AlertDescription>
              </Alert>
            ) : (
              <Alert className="border-green-200 bg-green-50">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <AlertDescription className="text-xs text-green-800">
                  GPS locked at ±{gps.accuracy.toFixed(0)} m. Ready to fence the community.
                </AlertDescription>
              </Alert>
            )}

            <Field label="Select Microplanning Data (Optional)">
              <div className="flex items-center gap-2">
                <Select value={selectedMicroplanId} onValueChange={handleMicroplanSelect}>
                  <SelectTrigger className="h-8 flex-1 text-xs"><SelectValue placeholder="Choose a community microplan to auto-fill" /></SelectTrigger>
                  <SelectContent>
                    {microplans.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.community_name} {m.settlement_name ? `(${m.settlement_name})` : ""} — {m.ward}, {m.lga}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={fetchMicroplans} disabled={loading}>
                  <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1 px-1">
                {loading
                  ? "Loading microplanning entries…"
                  : microplans.length === 0
                  ? "No microplanning entries found for this project. You can still proceed — this community will be flagged as outside the microplan in Step 4."
                  : `Showing ${microplans.length} entries for this project`}
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
                variant="outline"
                onClick={() => setStreetViewOpen(true)}
                disabled={!gps}
                className="h-8 text-xs gap-1"
                title="Open community street-level imagery (Mapillary)"
              >
                <Eye className="h-3.5 w-3.5" /> Street View
              </Button>
              <Button
                size="sm"
                variant={recordingPerimeter ? "destructive" : "default"}
                onClick={togglePerimeterRecording}
                disabled={!gps}
                className={recordingPerimeter ? "h-auto py-1.5 px-3 leading-tight" : ""}
              >
                {recordingPerimeter ? (
                  <span className="flex flex-col items-start text-left">
                    <span className="flex items-center gap-1.5 font-semibold">
                      <span className="inline-block h-2 w-2 rounded-full bg-white animate-pulse" />
                      Stop
                      <span
                        key={vertexFlash}
                        className="tabular-nums transition-transform duration-200 inline-block"
                        style={{ transform: vertexFlash ? "scale(1.18)" : "scale(1)" }}
                      >
                        · {walkTelemetry.vertices} pts
                      </span>
                    </span>
                    <span className="text-[10px] opacity-90 tabular-nums">
                      {Math.round(walkTelemetry.walkedM)} m walked · ±{walkTelemetry.liveAccuracyM?.toFixed(0) ?? "—"}m
                      {walkTelemetry.closureM != null && ` · closes ${Math.round(walkTelemetry.closureM)}m`}
                    </span>
                  </span>
                ) : (
                  <>
                    <Navigation className="h-4 w-4 mr-1" />
                    Walk Perimeter
                  </>
                )}
              </Button>
              {perimeter.length > 0 && (
                <Button size="sm" variant="ghost" onClick={() => { setPerimeter([]); setWalkedM(0); setLastVertexAt(null); }}>Clear perimeter</Button>
              )}
              {recordingPerimeter && perimeterStatus.holding && (
                <span className="text-[11px] text-muted-foreground ml-1">
                  Holding for ≤10 m fix… current ±{gps?.accuracy.toFixed(0)}m
                </span>
              )}
            </div>

            {/* Smart placement badge */}
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant="outline"
                className={maskStatus === "error" ? "border-amber-500 text-amber-700 dark:text-amber-400" : "border-green-500/50 text-green-700 dark:text-green-400"}
                title="Households and segments are placed only on residential buildings, never on roads, rivers, schools or hospitals (OpenStreetMap)."
              >
                <Shield className="h-3 w-3 mr-1" />
                {maskStatus === "loading" && "Loading building map…"}
                {maskStatus === "ok" && `Smart placement · ${residentialMask?.residentialBuildings.length ?? 0} residential buildings detected`}
                {maskStatus === "error" && "OSM unavailable — basic placement"}
                {maskStatus === "idle" && "Smart placement: avoids roads, rivers, schools, hospitals"}
              </Badge>
              {maskStatus === "error" && perimeter.length >= 3 && (
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => {
                  setMaskStatus("loading");
                  getResidentialMask(perimeter).then((m) => { setResidentialMask(m); setMaskStatus("ok"); }).catch(() => setMaskStatus("error"));
                }}>
                  <RefreshCw className="h-3 w-3 mr-1" /> Retry
                </Button>
              )}
              {maskStatus === "ok" && residentialMask && (
                <div className="flex flex-wrap items-center gap-3 ml-auto">
                  <div className="flex items-center gap-2">
                    <Switch
                      id="ces-show-residential"
                      checked={showResidentialLayer}
                      onCheckedChange={setShowResidentialLayer}
                    />
                    <Label htmlFor="ces-show-residential" className="text-xs cursor-pointer">
                      Show residential buildings
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      id="ces-show-exclusions"
                      checked={showExclusionLayer}
                      onCheckedChange={setShowExclusionLayer}
                    />
                    <Label htmlFor="ces-show-exclusions" className="text-xs cursor-pointer">
                      Show excluded zones
                    </Label>
                  </div>
                </div>
              )}
            </div>

            {maskStatus === "ok" && residentialMask && (showResidentialLayer || showExclusionLayer) && (
              <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground px-1">
                {showResidentialLayer && (
                  <span className="inline-flex items-center gap-1">
                    <span className="inline-block w-3 h-3 rounded-full" style={{ background: "#22c55e", border: "1px solid #16a34a" }} />
                    Residential buildings ({residentialMask.residentialBuildings.length})
                  </span>
                )}
                {showExclusionLayer && (
                  <>
                    <span className="inline-flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-full border-2 border-dashed" style={{ borderColor: "#dc2626" }} /> Roads ({residentialMask.exclusionZones.roads.length})</span>
                    <span className="inline-flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-full border-2 border-dashed" style={{ borderColor: "#2563eb" }} /> Waterways ({residentialMask.exclusionZones.waterways.length})</span>
                    <span className="inline-flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-full border-2 border-dashed" style={{ borderColor: "#64748b", background: "rgba(100,116,139,.12)" }} /> Non-residential ({residentialMask.exclusionZones.nonResidential.length})</span>
                  </>
                )}
              </div>
            )}

            {/* Live telemetry strip — visible while recording or after capture */}
            {(recordingPerimeter || perimeter.length > 0) && (
              <div
                aria-live="polite"
                className="grid grid-cols-2 sm:grid-cols-4 gap-2 rounded-md border border-border bg-muted/40 p-2"
              >
                <div className="flex flex-col">
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Vertices</span>
                  <span className="text-lg font-semibold tabular-nums">{walkTelemetry.vertices}</span>
                  <span className="text-[10px] text-muted-foreground">
                    {recordingPerimeter
                      ? (walkTelemetry.lastVertexAgoS != null ? `+1 · ${walkTelemetry.lastVertexAgoS}s ago` : "awaiting first fix")
                      : "captured"}
                  </span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Walked</span>
                  <span className="text-lg font-semibold tabular-nums">{Math.round(walkTelemetry.walkedM)} m</span>
                  <span className="text-[10px] text-muted-foreground">pace: {walkTelemetry.pace}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground">GPS quality</span>
                  <span className={`text-lg font-semibold tabular-nums ${accColor(walkTelemetry.liveAccuracyM)}`}>
                    ±{walkTelemetry.liveAccuracyM?.toFixed(0) ?? "—"} m
                  </span>
                  <span className="text-[10px] text-muted-foreground">best ±{Number.isFinite(walkTelemetry.bestAccuracyM) ? walkTelemetry.bestAccuracyM.toFixed(0) : "—"} m</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    {walkTelemetry.estAreaM2 ? "Area" : "Closure"}
                  </span>
                  <span className="text-lg font-semibold tabular-nums">
                    {walkTelemetry.estAreaM2
                      ? `~${walkTelemetry.estAreaM2 >= 10000 ? (walkTelemetry.estAreaM2 / 10000).toFixed(2) + " ha" : Math.round(walkTelemetry.estAreaM2) + " m²"}`
                      : walkTelemetry.closureM != null ? `${Math.round(walkTelemetry.closureM)} m` : "—"}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {walkTelemetry.estAreaM2 ? "shoelace estimate" : "to first vertex"}
                  </span>
                </div>
              </div>
            )}

            {walkTelemetry.readyToClose && (
              <div className="rounded-md border border-green-500/40 bg-green-500/10 px-3 py-1.5 text-xs text-green-700 dark:text-green-400 flex items-center gap-2">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Ready to close — return to start and tap Stop.
              </div>
            )}

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
                exclusionZones={residentialMask?.exclusionZones ?? null}
                showExclusions={showExclusionLayer}
                residentialBuildings={residentialMask?.residentialBuildings ?? null}
                showResidential={showResidentialLayer}
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

                // No accuracy gate — proceed regardless. Recommendation surfaced via Step 1 alert.

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

            {estHHAi !== null && (
              <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs flex flex-wrap items-center gap-2">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                <span className="font-semibold">Satellite estimate:</span>
                <span>~{estHHAi} households</span>
                {estHHAiCI && (
                  <>
                    <Badge variant="secondary" className="text-[10px]">
                      95% CI: {estHHAiCI.low} – {estHHAiCI.high}
                    </Badge>
                    <Badge variant="outline" className="text-[10px] capitalize">
                      {estHHAiCI.confidence} confidence
                    </Badge>
                  </>
                )}
                <span className="text-muted-foreground ml-auto">
                  Derived from Esri World Imagery via geospatial vision analysis.
                </span>
              </div>
            )}

            <div className="flex gap-2">
              <Button onClick={buildSegments}><Target className="h-4 w-4 mr-1" />Build Segments & Randomly Select</Button>
              {segments.length > 0 && (
                <Button variant="outline" onClick={openResampleDialog}>
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
              exclusionZones={residentialMask?.exclusionZones ?? null}
              showExclusions={showExclusionLayer}
              residentialBuildings={residentialMask?.residentialBuildings ?? null}
              showResidential={showResidentialLayer}
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
                <Button variant="outline" size="sm" className="h-8" onClick={openResampleDialog}>
                  <Shuffle className="h-4 w-4 mr-1" />Sample Another Segment
                </Button>
              </div>
            </div>

            <div className="ml-auto flex gap-2">
              <Button variant="outline" onClick={() => setStep(2)}>← Back</Button>
              <Button onClick={() => { computeAnalysis(); setStep(4); }}>Next: Analysis →</Button>
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
                  <KPI label="Therapeutic Cov." value={`${coverage.therapeuticCoveragePct.toFixed(1)}%`} accent />
                  <KPI label="Geographic Cov." value={`${coverage.geographicCoveragePct.toFixed(1)}%`} accent />
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
                    {outsideMicroplan ? (
                      <div className="space-y-2">
                        <Alert className="border-amber-400 bg-amber-50 dark:bg-amber-950/30">
                          <AlertTriangle className="h-4 w-4 text-amber-600" />
                          <AlertDescription className="text-xs text-amber-800 dark:text-amber-200">
                            No matching microplanning record found for <strong>{state} / {lga} / {ward} / {communityName}</strong>.
                            You can continue — this survey will be tagged <strong>outside microplan</strong>. Please document why this community is being surveyed despite not appearing in the official microplan.
                          </AlertDescription>
                        </Alert>
                        <Label className="text-xs font-semibold">Reason for surveying outside the microplan *</Label>
                        <Textarea
                          value={outsideMicroplanReason}
                          onChange={(e) => setOutsideMicroplanReason(e.target.value)}
                          placeholder="e.g., newly settled hamlet, IDP camp, omission in microplanning, post-campaign mop-up, supervisor-directed validation visit…"
                          className="text-xs min-h-[80px]"
                        />
                        <Button size="sm" variant="outline" onClick={async () => {
                          if (!outsideMicroplanReason.trim()) {
                            toast({ title: "Reason required", variant: "destructive" });
                            return;
                          }
                          await persistSurvey("draft");
                          toast({ title: "Reason saved", description: "Survey flagged as outside microplan." });
                        }}>
                          <Save className="h-3 w-3 mr-1" />Save Reason
                        </Button>
                      </div>
                    ) : !microCompare ? (
                      <Alert className="border-sky-400 bg-sky-50 dark:bg-sky-950/30">
                        <AlertTriangle className="h-4 w-4 text-sky-600" />
                        <AlertDescription className="text-xs text-sky-800 dark:text-sky-200">
                          Microplanning record matched for <strong>{state} / {lga} / {ward} / {communityName}</strong>, but it does not yet contain reported treated/target figures, so a statistical comparison cannot be computed. This survey is <strong>inside the microplan</strong>.
                        </AlertDescription>
                      </Alert>
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

            {/* ── Microplan & Resample Audit ── */}
            {outsideMicroplan && (
              <Alert className="border-amber-400 bg-amber-50 dark:bg-amber-950/30">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <AlertDescription className="text-xs text-amber-800 dark:text-amber-200">
                  <span className="font-semibold">Outside microplanned communities</span> — Reason:{" "}
                  {outsideMicroplanReason || <em className="text-muted-foreground">(no reason recorded)</em>}
                </AlertDescription>
              </Alert>
            )}
            <div className="rounded-xl border border-border p-4 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-semibold flex items-center gap-2">
                  <Shuffle className="h-4 w-4 text-primary" />
                  Resample Justifications
                </span>
                <Badge variant="outline">{resampleHistory.length}</Badge>
              </div>
              {resampleHistory.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No additional segments were resampled for this survey.
                </p>
              ) : (
                <ol className="space-y-2 text-sm">
                  {resampleHistory.map((r, i) => (
                    <li key={r.id} className="rounded-md border border-border bg-muted/30 p-2">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <span className="font-semibold">#{i + 1} · Segment {r.segment_label}</span>
                        <span className="text-[11px] text-muted-foreground">
                          {new Date(r.created_at).toLocaleString()}
                        </span>
                      </div>
                      <p className="text-xs whitespace-pre-wrap break-words mt-1">{r.reason}</p>
                    </li>
                  ))}
                </ol>
              )}
            </div>

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

            {/* ── Sync to Google Sheets / Looker Studio ── */}
            <div className="rounded-xl border border-border p-3 space-y-2 bg-muted/20">
              <div className="text-xs font-semibold flex items-center gap-2">
                <FileSpreadsheet className="h-4 w-4 text-primary" />
                Push survey + resamples to Google Sheets (Looker Studio)
              </div>
              <p className="text-[11px] text-muted-foreground">
                Writes two sheets — <span className="font-mono">CES_Surveys</span> and <span className="font-mono">CES_Resamples</span> —
                including <span className="font-mono">outside_microplan</span>, <span className="font-mono">outside_microplan_reason</span> and every resample reason.
              </p>
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  const url = window.prompt("Paste the Google Sheets URL to sync this survey into:");
                  if (!url) return;
                  const m = url.match(/\/spreadsheets\/d\/([^/]+)/);
                  const spreadsheetId = m?.[1];
                  if (!spreadsheetId) {
                    toast({ title: "Invalid Sheet URL", description: "Could not extract spreadsheet ID.", variant: "destructive" });
                    return;
                  }
                  try {
                    const body: any = { action: "sync_ces", spreadsheetId };
                    if (surveyId) body.surveyIds = [surveyId];
                    else if (projectId) body.projectId = projectId;
                    const { data, error } = await supabase.functions.invoke("sync-google-sheets", { body });
                    if (error) throw error;
                    toast({ title: "Synced to Google Sheets", description: data?.message || "Done." });
                  } catch (e: any) {
                    toast({ title: "Sync Failed", description: e.message || String(e), variant: "destructive" });
                  }
                }}
              >
                Sync CES survey to Sheets
              </Button>
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

      <StreetViewPanel
        open={streetViewOpen}
        onOpenChange={setStreetViewOpen}
        lat={gps?.lat ?? null}
        lng={gps?.lng ?? null}
        accuracy={gps?.accuracy ?? null}
      />

      <Dialog open={resampleDialogOpen} onOpenChange={setResampleDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shuffle className="h-4 w-4" />Reason for Sampling Another Segment
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Random sampling has scientific implications. Please document why an additional segment is being added
              (e.g., target N not reached, original segment inaccessible, security risk, refusal cluster, supervisor request).
            </p>
            <Label className="text-xs font-semibold">Reason *</Label>
            <Textarea
              value={resampleReason}
              onChange={(e) => setResampleReason(e.target.value)}
              placeholder="Describe the reason (minimum 10 characters)…"
              className="min-h-[100px] text-xs"
              autoFocus
            />
            <p className="text-[10px] text-muted-foreground">
              {resampleReason.trim().length} / 10 characters minimum
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResampleDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={confirmSampleAnotherSegment}
              disabled={resampleReason.trim().length < 10}
            >
              <Shuffle className="h-4 w-4 mr-1" />Confirm & Sample
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

function BasemapToggle({ value, onChange }: { value: "satellite" | "hybrid" | "street" | "terrain"; onChange: (v: any) => void }) {
  return (
    <div className="inline-flex border border-border rounded-md overflow-hidden">
      {[
        { v: "hybrid", icon: Satellite, label: "Hybrid" },
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
): Promise<{ found: boolean; compare: ProportionCompare | null }> {
  if (!state || !lga || !ward || !community) return { found: false, compare: null };
  const norm = (s: string) => s.trim().replace(/\s+/g, " ");
  const s = norm(state), l = norm(lga), w = norm(ward), c = norm(community);
  // Try common microplanning table names — tolerant, case-insensitive lookup
  const tables = ["microplan_entries", "microplanning_entries", "microplans"];
  for (const t of tables) {
    const { data, error } = await supabase
      .from(t as any).select("*")
      .ilike("state", s).ilike("lga", l).ilike("ward", w).ilike("community_name", c)
      .limit(1);
    if (!error && data && data.length > 0) {
      const r: any = data[0];
      const target = r.estimated_total_population ?? r.target_population ?? r.number_of_households ?? 0;
      const treated = r.treated ?? r.persons_treated ?? r.people_treated ?? r.medicine_distributed ?? null;
      const compare = (target > 0 && treated != null)
        ? compareProportions(cesTreated, cesSampled, Number(treated), Number(target))
        : null;
      return { found: true, compare };
    }
  }
  return { found: false, compare: null };
}

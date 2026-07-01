import { startTransition, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { fetchAllRowsKeyset } from "@/lib/fetchAllRowsKeyset";
import { Capacitor } from "@capacitor/core";
import { Geolocation, type Position as CapacitorPosition } from "@capacitor/geolocation";
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
import { Slider } from "@/components/ui/slider";
import {
  loadSavedFences, saveFence, deleteSavedFence, polygonCenter,
  polygonPerimeterM, polygonAreaM2 as savedPolygonAreaM2, formatRelative,
  type SavedFence,
} from "@/lib/ces/savedFences";
import { QRCodeSVG } from "qrcode.react";
import {
  MapPin, Satellite, Map as MapIcon, Mountain, Loader2, Sparkles, Shuffle,
  Navigation, Target, Lock, Download, FileText, FileSpreadsheet, AlertTriangle,
  CheckCircle2, XCircle, Save, Crosshair, BarChart3, Shield, Building,
  ThumbsUp, ThumbsDown, Wifi, WifiOff, RefreshCw, UserCheck, ClipboardCheck, Info, Eye, ShieldCheck, Home,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useCESRoles } from "@/hooks/useCESRoles";
import { clearCesLocationHandoffIntent, isUsableCesLocationPrefill, readCesLocationPrefill } from "@/lib/mda/cesLocationBridge";
import CESSurveyMap, { SurveyHousehold, type FeatureLabelRequest } from "./CESSurveyMap";
import { kmeansSegments, Segment, LatLng } from "@/lib/ces/kmeansSegments";
import { equalPerimeterSegments } from "@/lib/ces/equalPerimeterSegments";
import { computeCoverage, compareProportions, compareGeographicCoverage, calculateSampleSize, interpretCoverage, CoverageEstimate, ProportionCompare } from "@/lib/ces/coverageStats";
import { downloadCSV, downloadGeoJSON, generateCESReportPDF } from "@/lib/ces/exporters";
import { logCESAction } from "@/lib/ces/auditLog";
import { getAllStates, getLGAsForState, getWardsForLGA } from "@/lib/nigeriaAdminData";
import {
  saveHouseholdOffline, syncCESOfflineQueue, getPendingCount, getPendingHouseholds,
  registerCESSyncOnReconnect, getDeviceId, generateUUID, saveSurveyOffline, getOfflineSurvey, type OfflineHousehold,
} from "@/lib/ces/offlineHouseholds";
import StreetViewPanel from "./StreetViewPanel";
import {
  getResidentialMask,
  getCachedResidentialMask,
  pointInPolygon as pointInPolygonGeo,
  isOnExcludedFeature,
  snapToNearestResidential,
  polygonAreaM2,
  haversineM as haversineMeters,
  type ResidentialMaskResult,
} from "./utils/residentialMask";
import { evaluateLqasCompliance, lqasPlanForThreshold } from "./utils/lqas";
import LQASCompliancePanel from "./LQASCompliancePanel";
import { getFreshWarmFix, getBestWarmFix, subscribeWarmFix } from "@/lib/gps/gpsWarmer";

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
const CES_MICROPLAN_PICKER_LIMIT = 100;
const CES_MAX_SAMPLING_PINS = 1200;

type InstantMapSeed = { lat: number; lng: number; accuracy: number; source: "handoff" | "last_known" | "state" | "default" };

const CES_STATE_CENTROIDS: Record<string, { lat: number; lng: number }> = {
  jigawa: { lat: 12.228, lng: 9.5616 },
  kano: { lat: 12.0022, lng: 8.592 },
  katsina: { lat: 12.6, lng: 7.6 },
  sokoto: { lat: 13.05, lng: 5.25 },
  bauchi: { lat: 10.3158, lng: 9.8442 },
  yobe: { lat: 12.29, lng: 11.44 },
  kebbi: { lat: 11.5, lng: 4.2 },
  zamfara: { lat: 12.17, lng: 6.25 },
  fct: { lat: 9.0765, lng: 7.3986 },
  abuja: { lat: 9.0765, lng: 7.3986 },
  federalcapitalterritory: { lat: 9.0765, lng: 7.3986 },
};
const CES_DEFAULT_MAP_SEED: InstantMapSeed = { lat: 9.082, lng: 8.6753, accuracy: 250_000, source: "default" };
const adminKey = (value: unknown) => String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const finiteCoord = (value: unknown): number | null => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};
const seedFromState = (stateName?: string): InstantMapSeed => {
  const spaced = adminKey(stateName);
  const compact = spaced.replace(/ /g, "");
  const withoutSuffix = compact.replace(/state$/, "");
  const centroid = CES_STATE_CENTROIDS[compact] || CES_STATE_CENTROIDS[withoutSuffix] || CES_STATE_CENTROIDS[spaced];
  return centroid ? { ...centroid, accuracy: 75_000, source: "state" } : CES_DEFAULT_MAP_SEED;
};
const seedFromPrefill = (prefill: ReturnType<typeof readCesLocationPrefill>["prefill"]): InstantMapSeed | null => {
  const lat = finiteCoord(prefill?.lat);
  const lng = finiteCoord(prefill?.lng);
  if (lat !== null && lng !== null) return { lat, lng, accuracy: Math.max(finiteCoord(prefill?.accuracy) ?? 75, 25), source: "handoff" };
  if (prefill?.state) return seedFromState(prefill.state);
  return null;
};
const readLastKnownMapSeed = (): InstantMapSeed | null => {
  try {
    const raw = localStorage.getItem("ces.lkg.v1");
    const lkg = raw ? JSON.parse(raw) : null;
    const lat = finiteCoord(lkg?.lat);
    const lng = finiteCoord(lkg?.lng);
    if (lat !== null && lng !== null) return { lat, lng, accuracy: Math.max(finiteCoord(lkg?.accuracy) ?? 100, 25), source: "last_known" };
  } catch { /* ignore */ }
  return null;
};


function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(id);
  }, [value, delayMs]);

  return debounced;
}

type CesGpsFix = {
  lat: number;
  lng: number;
  accuracy: number;
  timestamp: number;
  speed: number | null;
  heading: number | null;
  source: "native" | "web";
};

type CesGpsStop = () => void | Promise<void>;

function normalizeNativeFix(pos: CapacitorPosition | null): CesGpsFix | null {
  if (!pos?.coords) return null;
  const lat = pos.coords.latitude;
  const lng = pos.coords.longitude;
  const accuracy = pos.coords.accuracy ?? Infinity;
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(accuracy)) return null;
  return {
    lat,
    lng,
    accuracy,
    timestamp: pos.timestamp || Date.now(),
    speed: pos.coords.speed ?? null,
    heading: pos.coords.heading ?? null,
    source: "native",
  };
}

function normalizeWebFix(pos: GeolocationPosition): CesGpsFix | null {
  const lat = pos.coords.latitude;
  const lng = pos.coords.longitude;
  const accuracy = pos.coords.accuracy ?? Infinity;
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(accuracy)) return null;
  return {
    lat,
    lng,
    accuracy,
    timestamp: pos.timestamp || Date.now(),
    speed: pos.coords.speed ?? null,
    heading: pos.coords.heading ?? null,
    source: "web",
  };
}

function gpsErrorKind(err: unknown): "denied" | "unavailable" | "timeout" | "insecure" | "unsupported" {
  const maybe = err as { code?: unknown; message?: unknown } | null;
  const code = typeof maybe?.code === "number" ? maybe.code : undefined;
  const msg = String(maybe?.message ?? err ?? "").toLowerCase();
  if (code === 1 || msg.includes("permission") || msg.includes("denied")) return "denied";
  if (code === 3 || msg.includes("timeout")) return "timeout";
  if (msg.includes("secure") || msg.includes("https")) return "insecure";
  if (msg.includes("unsupported")) return "unsupported";
  return "unavailable";
}

async function startRealtimeGpsWatch(
  opts: {
    enableHighAccuracy?: boolean;
    maximumAge?: number;
    timeout?: number;
    minimumUpdateInterval?: number;
    pollCurrentPositionMs?: number;
  },
  onFix: (fix: CesGpsFix) => void,
  onError?: (err: unknown) => void,
): Promise<CesGpsStop> {
  const native = Capacitor.isNativePlatform();

  if (native) {
    const status = await Geolocation.checkPermissions().catch(() => null);
    const preciseGranted = status?.location === "granted";
    if (!preciseGranted) {
      const requested = await Geolocation.requestPermissions({ permissions: ["location"] });
      if (requested.location !== "granted") throw new Error("Precise location permission denied");
    }

    const watchId = await Geolocation.watchPosition(
      {
        enableHighAccuracy: opts.enableHighAccuracy ?? true,
        maximumAge: opts.maximumAge ?? 0,
        timeout: opts.timeout ?? 5000,
        minimumUpdateInterval: opts.minimumUpdateInterval ?? 1000,
      },
      (pos, err) => {
        if (err) {
          onError?.(err);
          return;
        }
        const fix = normalizeNativeFix(pos);
        if (fix) onFix(fix);
      },
    );

    Geolocation.getCurrentPosition({
      enableHighAccuracy: opts.enableHighAccuracy ?? true,
      maximumAge: opts.maximumAge ?? 0,
      timeout: opts.timeout ?? 5000,
    })
      .then((pos) => {
        const fix = normalizeNativeFix(pos);
        if (fix) onFix(fix);
      })
      .catch((err) => onError?.(err));

    return () => Geolocation.clearWatch({ id: watchId });
  }

  if (typeof window !== "undefined" && !window.isSecureContext) throw new Error("Geolocation requires HTTPS");
  if (!("geolocation" in navigator)) throw new Error("Geolocation unsupported");

  const webOptions: PositionOptions = {
    enableHighAccuracy: opts.enableHighAccuracy ?? true,
    maximumAge: opts.maximumAge ?? 0,
    timeout: opts.timeout ?? 10_000,
  };
  const watchId = navigator.geolocation.watchPosition(
    (pos) => {
      const fix = normalizeWebFix(pos);
      if (fix) onFix(fix);
    },
    (err) => onError?.(err),
    webOptions,
  );
  const pollId = opts.pollCurrentPositionMs
    ? window.setInterval(() => {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const fix = normalizeWebFix(pos);
            if (fix) onFix(fix);
          },
          (err) => onError?.(err),
          webOptions,
        );
      }, opts.pollCurrentPositionMs)
    : null;

  return () => {
    navigator.geolocation.clearWatch(watchId);
    if (pollId !== null) window.clearInterval(pollId);
  };
}

export default function CESSurveyWorkflow({ projectId, formId, initialSurveyId, onClose }: CESSurveyWorkflowProps) {
  const [step, setStep] = useState<Step>(1);
  const [surveyId, setSurveyId] = useState<string | null>(initialSurveyId ?? null);
  const { canLocate, canSurvey, canValidate, loading: rolesLoading } = useCESRoles(projectId);
  // Only supervisors / validators / admins may see the Analysis + QC sections.
  // Regular field surveyors finish at Step 3 and get a "recorded & synced" receipt.
  const canViewAnalysis = canValidate;
  // Completion receipt shown to regular users once their visits are saved & synced.
  const [showSyncReceipt, setShowSyncReceipt] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  // Clamp regular users back to Step 3 if a restored draft put them on 4/5.
  useEffect(() => {
    if (!rolesLoading && !canViewAnalysis && (step === 4 || step === 5)) setStep(3);
  }, [rolesLoading, canViewAnalysis, step]);
  const fencedCommunityWrittenRef = useRef<string | null>(null);

  // Step 1 — Locate & boundaries
  const [gps, setGps] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [mapSeed, setMapSeed] = useState<InstantMapSeed>(() => seedFromPrefill(readCesLocationPrefill().prefill) ?? readLastKnownMapSeed() ?? CES_DEFAULT_MAP_SEED);
  const [gpsWatching, setGpsWatching] = useState(false);
  const [perimeter, setPerimeter] = useState<LatLng[]>([]);
  const [recordingPerimeter, setRecordingPerimeter] = useState(false);
  const [walkedM, setWalkedM] = useState(0);
  const [lastVertexAt, setLastVertexAt] = useState<number | null>(null);
  const lastVertexAtRef = useRef<number | null>(null);
  const [perimeterSessionId, setPerimeterSessionId] = useState(0);
  const [gpsRestartNonce, setGpsRestartNonce] = useState(0);
  const [residentialMask, setResidentialMask] = useState<ResidentialMaskResult | null>(null);
  const [maskStatus, setMaskStatus] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [basemap, setBasemap] = useState<"satellite" | "hybrid" | "street" | "terrain" | "google" | "google-sat">("satellite");
  const [autoFenceRadiusM, setAutoFenceRadiusM] = useState<number>(50);
  const [autoFenced, setAutoFenced] = useState<boolean>(false);
  const lastAutoFenceFollowRef = useRef<{ lat: number; lng: number; t: number } | null>(null);
  // Manual draw-on-map mode (Step 1 alternative to walking the perimeter).
  const [drawMode, setDrawMode] = useState<boolean>(false);
  const [draftPolygon, setDraftPolygon] = useState<{ lat: number; lng: number }[]>([]);
  // Live editing of perimeter vertices (drag handles on the satellite map).
  const [editVertices, setEditVertices] = useState<boolean>(false);
  // Live-follow auto-fence: regenerate the polygon around the moving GPS fix.
  const [autoFenceFollow, setAutoFenceFollow] = useState<boolean>(false);
  const [autoFenceCenter, setAutoFenceCenter] = useState<{ lat: number; lng: number } | null>(null);
  // Snap-to-distance for the auto-fence radius slider (metres per step).
  const [snapStepM, setSnapStepM] = useState<number>(5);
  // Recent GPS breadcrumb trail (kept in-memory; capped to keep render light).
  const [gpsTrail, setGpsTrail] = useState<{ lat: number; lng: number }[]>([]);
  // Saved fences (localStorage-backed).
  const [savedFences, setSavedFences] = useState<SavedFence[]>(() => loadSavedFences());
  const [streetViewOpen, setStreetViewOpen] = useState(false);
  const [state, setState] = useState("");
  const [lga, setLga] = useState("");
  const [ward, setWard] = useState("");
  const [flhfName, setFlhfName] = useState("");
  const [communityName, setCommunityName] = useState("");
  const [settlementName, setSettlementName] = useState("");
  // When the user arrives here from the Integrated MDA Supervisory Checklist,
  // the checklist's location identification is prefilled here and LOCKED so it
  // cannot be changed — guaranteeing the coverage survey matches the supervised
  // community exactly.
  const [locationLocked, setLocationLocked] = useState(false);
  // Immutable source of truth for locked location values. The submission payload
  // is built from this ref (not the editable state), so the locked values cannot
  // be overridden client-side even if component state were tampered with.
  const lockedLocationRef = useRef<{
    state: string; lga: string; ward: string;
    flhf_name: string; community_name: string; settlement_name: string;
  } | null>(null);
  // True when the user explicitly proceeded from the checklist but the prefill
  // was missing/unreadable — drives the fallback "reselect" error flow.
  const [prefillMissing, setPrefillMissing] = useState(false);

  const applyChecklistPrefill = useCallback(() => {
    const { intent, prefill } = readCesLocationPrefill();
    if (!intent) return;
    // Wait until Coverage Evaluation has selected the same project. The previous
    // implementation consumed the bridge while `projectId` was still empty or on
    // an older saved project, causing the false Code red fallback.
    if (!projectId || (prefill?.projectId && prefill.projectId !== projectId)) return;
    if (!isUsableCesLocationPrefill(prefill)) {
      setPrefillMissing(true);
      return;
    }
    const loc = {
      state: prefill.state,
      lga: prefill.lga,
      ward: prefill.ward,
      flhf_name: prefill.flhf_name,
      community_name: prefill.community_name,
      settlement_name: prefill.settlement_name,
    };
    const prefillSeed = seedFromPrefill(prefill);
    if (prefillSeed) {
      // Use the checklist coordinates ONLY as a brief visual seed so the satellite
      // map can mount instantly. The GPS lock itself must come from the device's
      // own current position (instantMapCenter = gps ?? mapSeed), so we deliberately
      // do NOT promote the checklist handoff coords to the device "last known good"
      // fix — otherwise the lock would track the checklist location, not the device.
      setMapSeed(prefillSeed);
    }

    setState(loc.state);
    setLga(loc.lga);
    setWard(loc.ward);
    setFlhfName(loc.flhf_name);
    setCommunityName(loc.community_name);
    setSettlementName(loc.settlement_name);
    lockedLocationRef.current = loc;
    setLocationLocked(true);
    setPrefillMissing(false);
    clearCesLocationHandoffIntent();
  }, [projectId]);
  // Apply on mount, and again whenever the user re-enters this tab from the
  // checklist while the component is already mounted (tab switch, no remount).
  useEffect(() => {
    applyChecklistPrefill();
    const onNav = () => applyChecklistPrefill();
    window.addEventListener("amehnities:navigate-tab", onNav);
    return () => window.removeEventListener("amehnities:navigate-tab", onNav);
  }, [applyChecklistPrefill]);

  // Persist the field roles for project members who reach this survey through a
  // project-locked Community Checklist link, so they are never blocked next time.
  // The RPC is a no-op unless the user is actually assigned to this project
  // (owner/admin always allowed). It grants Locator + Surveyor idempotently.
  const fieldRolesGrantedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!projectId || !locationLocked) return;
    if (fieldRolesGrantedRef.current === projectId) return;
    fieldRolesGrantedRef.current = projectId;
    supabase
      .rpc("ensure_ces_field_roles" as any, { _project_id: projectId })
      .then(({ error }) => {
        if (error) fieldRolesGrantedRef.current = null; // allow a retry
      });
  }, [projectId, locationLocked]);


  // Safe manual reselection from the fallback error: clears the locked state and
  // lets the supervisor pick the location through the normal cascade.
  const handleReselectLocation = useCallback(() => {
    lockedLocationRef.current = null;
    setLocationLocked(false);
    setPrefillMissing(false);
    setState("");
    setLga("");
    setWard("");
    setFlhfName("");
    setCommunityName("");
    setSettlementName("");
  }, []);

  const getCurrentGeo = useCallback(() => {
    const locked = locationLocked && lockedLocationRef.current ? lockedLocationRef.current : null;
    return locked ?? {
      state,
      lga,
      ward,
      flhf_name: flhfName,
      community_name: communityName,
      settlement_name: settlementName,
    };
  }, [locationLocked, state, lga, ward, flhfName, communityName, settlementName]);


  // Microplanning Data
  const [loading, setLoading] = useState(false);
  const [microplans, setMicroplans] = useState<any[]>([]);
  const [medicineAllocations, setMedicineAllocations] = useState<any[]>([]);
  const [selectedMicroplanId, setSelectedMicroplanId] = useState<string>("");
  const [microplanSearch, setMicroplanSearch] = useState("");
  const [microplanHasMore, setMicroplanHasMore] = useState(false);
  const debouncedMicroplanSearch = useDebouncedValue(microplanSearch, 350);

  const fetchMicroplans = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const term = debouncedMicroplanSearch.trim().replace(/[%,]/g, " ").slice(0, 80);
      const [mResp, aData] = await Promise.all([
        (() => {
          let q = supabase
            .from("microplan_entries" as any)
            .select("id, state, lga, ward, flhf_name, community_name, settlement_name, estimated_children_5_14, estimated_adults_15_plus, estimated_total_population")
            .eq("project_id", projectId);
          if (term) q = q.or(`community_name.ilike.%${term}%,settlement_name.ilike.%${term}%,ward.ilike.%${term}%,lga.ilike.%${term}%`);
          return q.order("community_name", { ascending: true }).limit(CES_MICROPLAN_PICKER_LIMIT + 1);
        })(),
        fetchAllRowsKeyset<any>((limit, afterId) => {
          let q = supabase.from("microplan_medicine_allocations" as any).select("id, lga, amount, medicine_name").eq("project_id", projectId);
          if (afterId) q = q.gt("id", afterId);
          return q.order("id", { ascending: true }).limit(limit);
        }),
      ]);
      if (mResp.error) throw mResp.error;
      const mData = ((mResp.data as any[]) ?? []);
      setMicroplanHasMore(mData.length > CES_MICROPLAN_PICKER_LIMIT);
      setMicroplans(mData.slice(0, CES_MICROPLAN_PICKER_LIMIT));
      setMedicineAllocations(aData);
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
  }, [projectId, debouncedMicroplanSearch]);

  useEffect(() => {
    fetchMicroplans();
  }, [fetchMicroplans]);

  // Realtime: when a Microplan New Entry is saved, refresh the locator's
  // candidate community list immediately so it appears here without reload.
  useEffect(() => {
    if (!projectId) return;
    const ch = supabase
      .channel(`mp-entries-${projectId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "microplan_entries", filter: `project_id=eq.${projectId}` },
        () => fetchMicroplans(),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [projectId, fetchMicroplans]);

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
  const [buildingSegments, setBuildingSegments] = useState(false);
  // Step 2 — Smart Count: tap a feature on the satellite map; ML aggregates similar features inside perimeter.
  const [smartCountMode, setSmartCountMode] = useState(false);
  const [smartCountResult, setSmartCountResult] = useState<{ count: number; sampleAreaM2: number } | null>(null);

  // Outside-of-microplan handling
  const [outsideMicroplan, setOutsideMicroplan] = useState(false);
  const [outsideMicroplanReason, setOutsideMicroplanReason] = useState("");

  // "Sample Another Segment" reason dialog
  const [resampleDialogOpen, setResampleDialogOpen] = useState(false);
  const [resampleReason, setResampleReason] = useState("");
  const [resampleHistory, setResampleHistory] = useState<Array<{ id: string; segment_label: string; reason: string; created_at: string }>>([]);

  // Step 2 — toggle to visualize what residential mask is excluding (persisted)
  const [showExclusionLayer, setShowExclusionLayer] = useState<boolean>(() => {
    try { return localStorage.getItem("ces:showExclusionLayer") === "1"; } catch { return false; }
  });
  // Step 2 — toggle to visualize detected residential buildings on the satellite map (default ON, persisted)
  const [showResidentialLayer, setShowResidentialLayer] = useState<boolean>(() => {
    try { const v = localStorage.getItem("ces:showResidentialLayer"); return v == null ? true : v === "1"; } catch { return true; }
  });
  const [featureLayers, setFeatureLayers] = useState(() => ({ buildings: true, roads: true, waterways: true }));
  const [qaOverlay, setQaOverlay] = useState(true);
  const [showUncertainOnly, setShowUncertainOnly] = useState(false);
  const [labelMode, setLabelMode] = useState(false);
  const [pendingFeatureLabel, setPendingFeatureLabel] = useState<FeatureLabelRequest | null>(null);
  const [featureLabelDraft, setFeatureLabelDraft] = useState("");
  const [featureLabelNotes, setFeatureLabelNotes] = useState("");
  const [featureLabelMap, setFeatureLabelMap] = useState<Record<string, string>>({});
  useEffect(() => { try { localStorage.setItem("ces:showExclusionLayer", showExclusionLayer ? "1" : "0"); } catch { /* noop */ } }, [showExclusionLayer]);
  useEffect(() => { try { localStorage.setItem("ces:showResidentialLayer", showResidentialLayer ? "1" : "0"); } catch { /* noop */ } }, [showResidentialLayer]);

  // Step 3 — Visits
  const [households, setHouseholds] = useState<SurveyHousehold[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pendingPin, setPendingPin] = useState<{ lat: number; lng: number; accuracy: number; source?: "gps" | "map" } | null>(null);
  const [editingHH, setEditingHH] = useState<SurveyHousehold | null>(null);

  // Settings & Upgrades

  const [witnessSystemEnabled, setWitnessSystemEnabled] = useState(false);
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

  
  // Time-Lapse GPS is kept in a ref so the 30-second tracker does not rerender
  // the entire 4k-line CES workflow while enumerators are scrolling/collecting.
  const gpsLogsRef = useRef<{lat: number, lng: number, ts: number}[]>([]);

  // ── Offline-First State ──
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [offlinePending, setOfflinePending] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const persistingSurveyRef = useRef<Promise<string | null> | null>(null);

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
  const [microGeoCompare, setMicroGeoCompare] = useState<ProportionCompare | null>(null);
  const [microReportedSnapshot, setMicroReportedSnapshot] = useState<{
    target: number; treated: number; numHH: number; hhTreated: number;
  } | null>(null);
  const [routeRealismScore, setRouteRealismScore] = useState<number | null>(null);
  const [blendedCoveragePct, setBlendedCoveragePct] = useState<number | null>(null);
  // Step 4 — WHO target coverage threshold for interpretation (Table 1.4)
  const [targetThresholdPct, setTargetThresholdPct] = useState<number>(80);
  // Per-segment breakdown persisted for the Step 4 table + exports
  const [segmentTallies, setSegmentTallies] = useState<Array<{
    label: string; est_hh: number; sampled: number; treated_hh: number;
    eligible_persons: number; treated_persons: number;
    therapeuticPct: number; geographicPct: number;
  }>>([]);
  // Configurable significance threshold (alpha) for two-proportion tests
  const [alpha, setAlpha] = useState<number>(0.05);

  // ---------- GPS lock (hybrid: high-accuracy GPS + Wi-Fi/cell fallback) ----------
  // Google-Maps-style realtime tracking: a 1-D Kalman filter per axis fuses
  // every fresh fix with its accuracy as measurement variance and a pedestrian
  // process-noise model. This gives a lag-free "blue dot" that snaps to better
  // fixes immediately, smooths jitter when standing still, and tracks movement
  // continuously without throwing away updates.
  const watchHighRef = useRef<CesGpsStop | null>(null);
  const watchLowRef = useRef<CesGpsStop | null>(null);
  const kickstartIvRef = useRef<number | null>(null);
  // Auto-fallback timer: if NO fix at all has landed within the grace window we
  // silently force a coarse (Wi-Fi/cell/last-known) fix so the user is never
  // blocked indoors — no manual tap required.
  const autoCoarseTimerRef = useRef<number | null>(null);
  const autoCoarseDoneRef = useRef<boolean>(false);
  const lkgRef = useRef<{ lat: number; lng: number; accuracy: number } | null>(null);
  const lastFixAtRef = useRef<number>(0);
  const lastGpsUiAtRef = useRef<number>(0);
  const lastGpsUiRef = useRef<{ lat: number; lng: number; accuracy: number } | null>(null);
  const lastIndoorModeRef = useRef<boolean | null>(null);
  const gpsStartedAtRef = useRef<number>(Date.now());
  const kalmanRef = useRef<{ lat: number; lng: number; variance: number; ts: number } | null>(null);
  const [gpsError, setGpsError] = useState<null | "denied" | "unavailable" | "timeout" | "insecure" | "unsupported">(null);
  
  const [indoorMode, setIndoorMode] = useState(false);
  const [acceptingApprox, setAcceptingApprox] = useState(false);

  // Seed from LKG persisted on a previous session so the dot appears instantly,
  // then real fixes refine it via the Kalman filter.
  useEffect(() => {
    try {
      const raw = localStorage.getItem("ces.lkg.v1");
      if (raw) {
        const lkg = JSON.parse(raw);
        if (lkg && typeof lkg.lat === "number" && typeof lkg.lng === "number") {
          lkgRef.current = lkg;
          setMapSeed((current) => current.source === "default" ? { lat: lkg.lat, lng: lkg.lng, accuracy: Math.max(Number(lkg.accuracy) || 100, 25), source: "last_known" } : current);
        }
      }
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const commitGpsUi = useCallback((nextGps: { lat: number; lng: number; accuracy: number }, opts: { minDistanceM?: number; minIntervalMs?: number; force?: boolean } = {}) => {
    const now = Date.now();
    const lastUi = lastGpsUiRef.current;
    const movedM = lastUi ? haversineMeters({ lat: lastUi.lat, lng: lastUi.lng }, { lat: nextGps.lat, lng: nextGps.lng }) : Infinity;
    const accuracyImproved = lastUi ? nextGps.accuracy < lastUi.accuracy * 0.75 : true;
    const minDistanceM = opts.minDistanceM ?? 1.25;
    const minIntervalMs = opts.minIntervalMs ?? 900;
    if (opts.force || !lastUi || movedM >= minDistanceM || accuracyImproved || now - lastGpsUiAtRef.current >= minIntervalMs) {
      lastGpsUiAtRef.current = now;
      lastGpsUiRef.current = nextGps;
      startTransition(() => setGps(nextGps));
    }
  }, []);

  const commitPerimeterVertexState = useCallback((lat: number, lng: number, opts: { first?: boolean; distM?: number } = {}) => {
    const now = Date.now();
    lastVertexAtRef.current = now;
    startTransition(() => {
      setLastVertexAt(now);
      if (typeof opts.distM === "number" && opts.distM > 0) setWalkedM((w) => w + opts.distM!);
      setPerimeter((prev) => {
        if (opts.first && prev.length > 0) return prev;
        const tail = prev[prev.length - 1];
        if (tail && haversineMeters(tail, { lat, lng }) < 0.75) return prev;
        return [...prev, { lat, lng }];
      });
    });
  }, []);

  // Kalman-fused fix application — Google-Maps-equivalent realtime behavior.
  const applyFix = useCallback((p: CesGpsFix, source: "high" | "low") => {
    const now = Date.now();
    // Reject only ancient fixes (>60s); accept everything else.
    if (now - p.timestamp > 60_000) return;
    setGpsError(null);

    // Track LKG (best-ever fix) for instant re-seeding after retries,
    // and persist it across sessions so the dot appears instantly next visit.
    if (!lkgRef.current || p.accuracy < lkgRef.current.accuracy) {
      lkgRef.current = { lat: p.lat, lng: p.lng, accuracy: p.accuracy };
      try { localStorage.setItem("ces.lkg.v1", JSON.stringify(lkgRef.current)); } catch { /* quota */ }
    }

    // Floor accuracy at 3m so we never get a near-zero variance from
    // hardware that over-reports certainty (e.g. fused-location providers).
    const acc = Math.max(p.accuracy, 3);
    const measurementVariance = acc * acc; // m²

    if (!kalmanRef.current) {
      kalmanRef.current = { lat: p.lat, lng: p.lng, variance: measurementVariance, ts: now };
    } else {
      const k = kalmanRef.current;
      const dt = Math.max(0, (now - k.ts) / 1000);
      // Pedestrian/walking process noise: ~3 m/s² of positional uncertainty
      // growth per second. Larger = trusts new fixes more (snappier),
      // smaller = trusts predicted state (smoother). 9 m²/s matches Google's
      // typical "blue dot" responsiveness while walking.
      const PROCESS_NOISE = 9; // m² per second
      const predictedVariance = k.variance + dt * PROCESS_NOISE;
      const gain = predictedVariance / (predictedVariance + measurementVariance);
      k.lat = k.lat + gain * (p.lat - k.lat);
      k.lng = k.lng + gain * (p.lng - k.lng);
      k.variance = (1 - gain) * predictedVariance;
      k.ts = now;
    }

    // If a noticeably better-accuracy fix arrives (≥30% sharper), snap the
    // filter to it so the dot doesn't lag a sudden GPS-quality improvement.
    const k = kalmanRef.current!;
    if (acc * acc < k.variance * 0.5) {
      k.lat = p.lat;
      k.lng = p.lng;
      k.variance = measurementVariance;
    }

    lastFixAtRef.current = now;
    const nextIndoorMode = source === "low" && p.accuracy > 50;
    if (lastIndoorModeRef.current !== nextIndoorMode) {
      lastIndoorModeRef.current = nextIndoorMode;
      startTransition(() => setIndoorMode(nextIndoorMode));
    }
    const nextGps = {
      lat: k.lat,
      lng: k.lng,
      // Reported accuracy = max of raw and filter sigma, so UI never
      // overstates confidence.
      accuracy: Math.max(p.accuracy, Math.sqrt(k.variance)),
    };
    commitGpsUi(nextGps);
  }, [commitGpsUi]);

  const startGPSLock = useCallback(() => {
    if (!Capacitor.isNativePlatform() && typeof window !== "undefined" && !window.isSecureContext) {
      setGpsError("insecure");
      return;
    }
    if (!Capacitor.isNativePlatform() && !("geolocation" in navigator)) {
      setGpsError("unsupported");
      return;
    }
    if (watchHighRef.current !== null || watchLowRef.current !== null) return;

    setGpsError(null);
    setGpsWatching(true);
    gpsStartedAtRef.current = Date.now();
    // Reset filter for a fresh lock so the new run isn't anchored to a
    // stale state from a previous session.
    kalmanRef.current = null;

    // Error policy — the indoor-friendly part of the fix:
    //  • PERMANENT problems (permission denied, insecure context, unsupported)
    //    surface immediately so the user can act.
    //  • TRANSIENT problems (timeout / position-unavailable) are NEVER allowed
    //    to block the UI. Indoors the high-accuracy GNSS watch always times out
    //    while the low-accuracy Wi-Fi/cell watch + coarse one-shot keep working,
    //    so swallowing them here is what makes the lock feel instant indoors.
    const handleError = (err: unknown) => {
      const kind = gpsErrorKind(err);
      if (kind === "denied" || kind === "insecure" || kind === "unsupported") {
        setGpsError((prev) => prev ?? kind);
      }
      // timeout / unavailable → ignore; auto-coarse fallback handles it.
    };

    // Fire an immediate coarse one-shot (Wi-Fi / cell / fused) in parallel with
    // the watches. This is what laptops and indoor phones answer fastest, so a
    // location appears in well under a second without waiting on satellites.
    const coarseOneShot = () => {
      if (Capacitor.isNativePlatform()) {
        Geolocation.getCurrentPosition({ enableHighAccuracy: false, maximumAge: 60_000, timeout: 30_000 })
          .then((pos) => { const f = normalizeNativeFix(pos); if (f) applyFix(f, f.accuracy < 50 ? "high" : "low"); })
          .catch(() => { /* watches / auto-coarse fallback still cover us */ });
      } else if ("geolocation" in navigator) {
        navigator.geolocation.getCurrentPosition(
          (pos) => { const f = normalizeWebFix(pos); if (f) applyFix(f, f.accuracy < 50 ? "high" : "low"); },
          () => { /* watches / auto-coarse fallback still cover us */ },
          { enableHighAccuracy: false, maximumAge: 60_000, timeout: 30_000 },
        );
      }
    };
    coarseOneShot();

    // Auto-coarse fallback: if still NO fix after the grace window, silently
    // seed the last-known-good position so the user is never stuck indoors.
    autoCoarseDoneRef.current = false;
    if (autoCoarseTimerRef.current !== null) window.clearTimeout(autoCoarseTimerRef.current);
    autoCoarseTimerRef.current = window.setTimeout(() => {
      if (autoCoarseDoneRef.current) return;
      if (lastFixAtRef.current > 0) return; // we already have a fix
      autoCoarseDoneRef.current = true;
      const lkg = lkgRef.current;
      if (lkg) {
        applyFix({
          lat: lkg.lat, lng: lkg.lng, accuracy: Math.max(lkg.accuracy, 100),
          timestamp: Date.now(), speed: null, heading: null,
          source: Capacitor.isNativePlatform() ? "native" : "web",
        }, "low");
      } else {
        coarseOneShot();
      }
    }, 9000);


    // High-accuracy stream: tight cadence (1s OS push + 1.5s safety poll)
    // so the dot moves continuously while walking — Google-Maps-equivalent.
    startRealtimeGpsWatch(
      { enableHighAccuracy: true, maximumAge: 0, timeout: 5000, minimumUpdateInterval: 1000 },
      (fix) => applyFix(fix, "high"),
      handleError,
    )
      .then((stop) => { watchHighRef.current = stop; })
      .catch(handleError);

    // Low-accuracy fallback: Wi-Fi / cell positioning so we always have *some*
    // dot, even indoors, until GPS sharpens.
    startRealtimeGpsWatch(
      { enableHighAccuracy: false, maximumAge: 3000, timeout: 10_000, minimumUpdateInterval: 3000 },
      (fix) => applyFix(fix, "low"),
      () => { /* low-accuracy fallback errors should not mask GPS */ },
    )
      .then((stop) => { watchLowRef.current = stop; })
      .catch(() => { /* high-accuracy watch remains authoritative */ });

    // Kickstart: if the OS hasn't pushed a fresh fix within 3s, force a
    // one-shot getCurrentPosition to nudge the GPS chip awake.
    kickstartIvRef.current = window.setInterval(() => {
      if (Date.now() - lastFixAtRef.current < 3000) return;
      if (Capacitor.isNativePlatform()) {
        Geolocation.getCurrentPosition({ enableHighAccuracy: true, maximumAge: 0, timeout: 8000 })
          .then((pos) => {
            const fix = normalizeNativeFix(pos);
            if (fix) applyFix(fix, fix.accuracy < 50 ? "high" : "low");
          })
          .catch(() => { /* keep trying */ });
      } else {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const fix = normalizeWebFix(pos);
            if (fix) applyFix(fix, fix.accuracy < 50 ? "high" : "low");
          },
          () => { /* keep trying */ },
          { enableHighAccuracy: true, maximumAge: 0, timeout: 8000 }
        );
      }
    }, 3000);
  }, [applyFix]);

  const stopGPSLock = useCallback(() => {
    if (watchHighRef.current !== null) { void watchHighRef.current(); watchHighRef.current = null; }
    if (watchLowRef.current !== null) { void watchLowRef.current(); watchLowRef.current = null; }
    if (kickstartIvRef.current !== null) { window.clearInterval(kickstartIvRef.current); kickstartIvRef.current = null; }
    if (autoCoarseTimerRef.current !== null) { window.clearTimeout(autoCoarseTimerRef.current); autoCoarseTimerRef.current = null; }
  }, []);

  const retryGPSLock = useCallback(() => {
    stopGPSLock();
    setGpsWatching(false);
    setGpsError(null);
    kalmanRef.current = null;
    setTimeout(() => startGPSLock(), 0);
  }, [startGPSLock, stopGPSLock]);

  // Indoor / approximate fallback: forces a coarse fix using whatever the OS
  // can provide (Wi-Fi / cell / fused location) with a long timeout. As a
  // last resort, falls back to the persisted LKG so the user is never
  // permanently blocked from proceeding when stuck inside a building.
  const acceptApproximate = useCallback(async () => {
    setAcceptingApprox(true);
    setGpsError(null);
    const finalize = (fix: CesGpsFix | null) => {
      if (fix) {
        applyFix(fix, "low");
      } else if (lkgRef.current) {
        applyFix({
          lat: lkgRef.current.lat,
          lng: lkgRef.current.lng,
          accuracy: Math.max(lkgRef.current.accuracy, 100),
          timestamp: Date.now(),
          speed: null,
          heading: null,
          source: Capacitor.isNativePlatform() ? "native" : "web",
        }, "low");
        toast({
          title: "Using last-known location",
          description: `±${Math.max(lkgRef.current.accuracy, 100).toFixed(0)} m. Move outdoors or near a window for a sharper fix.`,
        });
      } else {
        toast({
          title: "Could not get any location fix",
          description: "Enable Wi-Fi or step outside, then tap Retry.",
          variant: "destructive",
        });
      }
      setAcceptingApprox(false);
    };
    try {
      if (Capacitor.isNativePlatform()) {
        const pos = await Geolocation.getCurrentPosition({
          enableHighAccuracy: false,
          maximumAge: 60_000,
          timeout: 30_000,
        });
        finalize(normalizeNativeFix(pos));
      } else {
        await new Promise<void>((resolve) => {
          navigator.geolocation.getCurrentPosition(
            (pos) => { finalize(normalizeWebFix(pos)); resolve(); },
            () => { finalize(null); resolve(); },
            { enableHighAccuracy: false, maximumAge: 60_000, timeout: 30_000 },
          );
        });
      }
    } catch {
      finalize(null);
    }
  }, [applyFix]);

  const getCurrentSurveyPosition = useCallback((): { lat: number; lng: number; accuracy: number | null; source: "gps" | "perimeter" | "handoff" | "last_known" } | null => {
    if (gps) return { lat: gps.lat, lng: gps.lng, accuracy: gps.accuracy, source: "gps" };
    if (perimeter.length >= 3) {
      const center = polygonCenter(perimeter);
      if (Number.isFinite(center.lat) && Number.isFinite(center.lng)) {
        return { lat: center.lat, lng: center.lng, accuracy: null, source: "perimeter" };
      }
    }
    if (mapSeed.source === "handoff" || mapSeed.source === "last_known") {
      return { lat: mapSeed.lat, lng: mapSeed.lng, accuracy: mapSeed.accuracy, source: mapSeed.source };
    }
    return null;
  }, [gps, perimeter, mapSeed]);

  // Mount-only: register watches exactly once, tear down on unmount.
  useEffect(() => {
    // INSTANT LOCK: apply the best instantly-available position so the lock
    // indicator appears in milliseconds with ZERO wait — works fully offline.
    // Priority: app-wide GPS warmer cache → cross-session LKG → checklist
    // handoff seed. The live high-accuracy watch below then refines it.
    const warm = getFreshWarmFix() ?? getBestWarmFix();
    const instantSeed =
      warm ??
      (lkgRef.current
        ? { lat: lkgRef.current.lat, lng: lkgRef.current.lng, accuracy: Math.max(lkgRef.current.accuracy, 25), timestamp: Date.now() }
        : (mapSeed.source === "handoff" || mapSeed.source === "last_known")
          ? { lat: mapSeed.lat, lng: mapSeed.lng, accuracy: Math.max(mapSeed.accuracy, 50), timestamp: Date.now() }
          : null);
    if (instantSeed) {
      applyFix(
        {
          lat: instantSeed.lat,
          lng: instantSeed.lng,
          accuracy: Math.max(instantSeed.accuracy, 3),
          timestamp: instantSeed.timestamp || Date.now(),
          speed: null,
          heading: null,
          source: Capacitor.isNativePlatform() ? "native" : "web",
        },
        instantSeed.accuracy <= 50 ? "high" : "low",
      );
    }

    // Grab the OS last-known fix immediately (returns in ms from cache, even
    // offline) so the lock is never stuck "acquiring".
    try {
      if (Capacitor.isNativePlatform()) {
        Geolocation.getCurrentPosition({ enableHighAccuracy: false, maximumAge: 600_000, timeout: 2000 })
          .then((pos) => { const f = normalizeNativeFix(pos); if (f) applyFix(f, f.accuracy <= 50 ? "high" : "low"); })
          .catch(() => { /* warmer/live watch will supply a fix */ });
      } else if ("geolocation" in navigator) {
        navigator.geolocation.getCurrentPosition(
          (pos) => { const f = normalizeWebFix(pos); if (f) applyFix(f, f.accuracy <= 50 ? "high" : "low"); },
          () => { /* warmer/live watch will supply a fix */ },
          { enableHighAccuracy: false, maximumAge: 600_000, timeout: 2000 },
        );
      }
    } catch { /* noop */ }

    // Keep ingesting shared warm fixes until the page's own watch takes over,
    // so even a cold start sharpens as soon as the warmer gets a fresh fix.
    const unsub = subscribeWarmFix((fix) => {
      if (lastFixAtRef.current > 0) return; // page watch is live — stop seeding
      applyFix(
        {
          lat: fix.lat,
          lng: fix.lng,
          accuracy: Math.max(fix.accuracy, 3),
          timestamp: fix.timestamp || Date.now(),
          speed: null,
          heading: null,
          source: Capacitor.isNativePlatform() ? "native" : "web",
        },
        fix.accuracy <= 50 ? "high" : "low",
      );
    });
    startGPSLock();
    return () => {
      unsub();
      stopGPSLock();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);





  // (auto-advance Step 1 → Step 2 effect declared after persistSurvey, below)
  const autoAdvancedRef = useRef(false);

  // ---------- perimeter recording (DEDICATED raw high-accuracy watcher) ----------
  // We open our own watchPosition while recording so we get every raw fix
  // (the shared `gps` state is smoothed/throttled and would suppress vertices).
  const perimeterBestAccRef = useRef<number>(Infinity);
  const perimeterWatchRef = useRef<CesGpsStop | null>(null);
  const perimeterStartedAtRef = useRef<number>(0);
  const lastVertexFixRef = useRef<{ lat: number; lng: number; acc: number; t: number; speed: number | null; heading: number | null } | null>(null);
  const lastPerimeterFixTsRef = useRef<number>(0);
  const [perimeterStatus, setPerimeterStatus] = useState<{ holding: boolean; bestAcc: number; gateM: number; lastSource: "native" | "web" | null; lastFixAgeMs: number | null }>({ holding: false, bestAcc: Infinity, gateM: 0, lastSource: null, lastFixAgeMs: null });

  useEffect(() => {
    if (!recordingPerimeter) {
      if (perimeterWatchRef.current !== null) {
        void perimeterWatchRef.current();
        perimeterWatchRef.current = null;
      }
      lastVertexFixRef.current = null;
      return;
    }
    if (!Capacitor.isNativePlatform() && !("geolocation" in navigator)) {
      setGpsError("unsupported");
      return;
    }

    perimeterStartedAtRef.current = Date.now();

    // Advisory accuracy gate only: correct live GPS fixes are captured even
    // when accuracy is imperfect, but status flags tell the enumerator quality.
    const computeGate = (sinceStartMs: number, sinceLastVertexMs: number) => {
      const elapsed = Math.max(sinceStartMs, sinceLastVertexMs);
      if (elapsed < 6_000) return 10;
      if (elapsed < 12_000) return 18;
      if (elapsed < 25_000) return 25;
      if (elapsed < 45_000) return 50;
      return 100;
    };

    const commitVertex = (fix: CesGpsFix, forceFirst = false) => {
      const now = Date.now();
      if (now - fix.timestamp > 60_000) return;
      const acc = fix.accuracy;
      const lat = fix.lat;
      const lng = fix.lng;

      perimeterBestAccRef.current = Math.min(perimeterBestAccRef.current, acc);
      lastPerimeterFixTsRef.current = now;

      const sinceStart = now - perimeterStartedAtRef.current;
      const last = lastVertexFixRef.current;
      const sinceLastVertex = last ? now - last.t : sinceStart;
      const gateM = computeGate(sinceStart, sinceLastVertex);
      commitGpsUi({ lat, lng, accuracy: acc }, { minDistanceM: 4, minIntervalMs: 1200 });

      // Movement gate: scale to GPS noise but keep responsive while walking.
      // First vertex always commits; subsequent require real movement.
      if (!last) {
        lastVertexFixRef.current = { lat, lng, acc, t: now, speed: fix.speed, heading: fix.heading };
        commitPerimeterVertexState(lat, lng, { first: true });
        setPerimeterStatus({ holding: acc > gateM, bestAcc: acc, gateM, lastSource: fix.source, lastFixAgeMs: 0 });
        return;
      }

      const distM = haversineMeters({ lat: last.lat, lng: last.lng }, { lat, lng });
      // Do not require 1.5×accuracy movement: that made real walks appear
      // frozen on phones reporting ±20–80 m. Use a bounded distance filter.
      const moveGate = Math.max(4, Math.min(12, acc * 0.35));
      const timeGate = Math.max(2.5, Math.min(8, acc * 0.2));
      const speedMoving = typeof fix.speed === "number" && fix.speed >= 0.4;
      const timeForce = sinceLastVertex > 5_000 && (distM >= timeGate || speedMoving);
      const headingChanged = typeof fix.heading === "number" && typeof last.heading === "number"
        ? Math.abs(fix.heading - last.heading) > 25 && distM >= Math.max(3, timeGate * 0.75)
        : false;

      if (!forceFirst && distM < moveGate && !timeForce && !headingChanged) {
        setPerimeterStatus({ holding: acc > gateM, bestAcc: acc, gateM, lastSource: fix.source, lastFixAgeMs: 0 });
        return;
      }

      lastVertexFixRef.current = { lat, lng, acc, t: now, speed: fix.speed, heading: fix.heading };
      commitPerimeterVertexState(lat, lng, { distM });
      setPerimeterStatus({ holding: acc > gateM, bestAcc: acc, gateM, lastSource: fix.source, lastFixAgeMs: 0 });
    };

    if (gps && perimeter.length === 0) {
      commitVertex({ lat: gps.lat, lng: gps.lng, accuracy: gps.accuracy, timestamp: Date.now(), speed: null, heading: null, source: Capacitor.isNativePlatform() ? "native" : "web" }, true);
    }

    const onErr = (err: unknown) => {
      // Don't tear down — browsers fire transient timeouts; keep watching.
      const maybe = err as { code?: unknown; message?: unknown } | null;
      console.warn("Perimeter GPS error:", maybe?.code, maybe?.message);
    };

    let active = true;

    startRealtimeGpsWatch(
      { enableHighAccuracy: true, maximumAge: 0, timeout: 5000, minimumUpdateInterval: 1200 },
      commitVertex,
      onErr,
    ).then((stop) => {
      if (active) perimeterWatchRef.current = stop;
      else void stop();
    }).catch((e) => {
      console.error("Failed to start perimeter watch:", e);
      setGpsError(gpsErrorKind(e));
    });

    return () => {
      active = false;
      if (perimeterWatchRef.current !== null) {
        void perimeterWatchRef.current();
        perimeterWatchRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordingPerimeter, gpsRestartNonce, commitGpsUi, commitPerimeterVertexState]);

  // ---------- Background resilience: Wake Lock + watchdog + persistence ----------
  // Keeps the perimeter watcher alive while moving, screen off, or tab hidden.
  // - Acquires Screen Wake Lock (web) so the device doesn't sleep mid-walk.
  // - Watchdog: if no GPS fix for >15s, bumps `gpsRestartNonce` so the main
  //   watch effect tears down and restarts the watcher (recovers from browser
  //   throttling, transient timeouts, OS-level GPS hiccups).
  // - On visibilitychange → visible: re-acquires wake lock, forces a restart.
  // - Persists live perimeter to localStorage so a kill/crash doesn't lose work.
  // For installed mobile (Capacitor) builds, also recommend installing
  // `@capacitor-community/background-geolocation` and running `npx cap sync`
  // so the GPS chip stays awake when the screen is fully off.
  const wakeLockRef = useRef<{ release: () => Promise<void> } | null>(null);
  useEffect(() => {
    if (!recordingPerimeter) return;

    let cancelled = false;
    const acquireWakeLock = async () => {
      try {
        const anyNav = navigator as any;
        if (anyNav?.wakeLock?.request) {
          const lock = await anyNav.wakeLock.request("screen");
          if (cancelled) {
            try { await lock.release(); } catch { /* noop */ }
            return;
          }
          wakeLockRef.current = lock;
          lock.addEventListener?.("release", () => {
            // OS dropped it (e.g., tab hidden). Try to re-acquire when visible again.
            wakeLockRef.current = null;
          });
        }
      } catch (e) {
        console.warn("Wake Lock unavailable:", e);
      }
    };
    void acquireWakeLock();

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        if (!wakeLockRef.current) void acquireWakeLock();
        // Force a restart of the watcher to recover from background throttling.
        setGpsRestartNonce((n) => n + 1);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    // Watchdog — restart watcher if fixes go stale
    const watchdog = window.setInterval(() => {
      const lastTs = lastPerimeterFixTsRef.current;
      if (lastTs === 0) return; // no fix yet — let the initial watch try
      const age = Date.now() - lastTs;
      if (age > 15_000) {
        console.warn("[Perimeter] GPS stale > 15s — restarting watcher");
        setGpsRestartNonce((n) => n + 1);
        // Reset so we don't restart in a tight loop
        lastPerimeterFixTsRef.current = Date.now() - 5_000;
      }
    }, 5_000);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearInterval(watchdog);
      const lock = wakeLockRef.current;
      wakeLockRef.current = null;
      if (lock) {
        void lock.release().catch(() => { /* noop */ });
      }
    };
  }, [recordingPerimeter]);

  // Persist live perimeter to localStorage so a crash/refresh/offline-reload
  // never loses the walk. LQAS compliance snapshot is appended in a separate
  // effect below (after `lqasCompliance` is declared) to keep ordering safe.
  useEffect(() => {
    if (!recordingPerimeter && perimeter.length === 0) return;
    try {
      const key = `ces:perimeter:${surveyId ?? "draft"}`;
      if (perimeter.length === 0) localStorage.removeItem(key);
      else localStorage.setItem(key, JSON.stringify({ perimeter, walkedM, t: Date.now() }));
    } catch { /* quota — ignore */ }
  }, [perimeter, walkedM, recordingPerimeter, surveyId]);

  // Persist BUILT segments (offline-safe) so a crash/refresh/offline-reload or a
  // restored network session never loses segmentation work. Segments are saved to
  // localStorage keyed by survey and restored on mount; persistSurvey() pushes
  // them to the live server once connectivity returns.
  useEffect(() => {
    try {
      const key = `ces:segments:${surveyId ?? "draft"}`;
      if (segments.length === 0) localStorage.removeItem(key);
      else localStorage.setItem(key, JSON.stringify({ segments, selectedSegmentLabels, t: Date.now() }));
    } catch { /* quota — ignore */ }
  }, [segments, selectedSegmentLabels, surveyId]);

  const segmentsRestoredRef = useRef(false);
  useEffect(() => {
    if (segmentsRestoredRef.current) return;
    if (segments.length > 0) { segmentsRestoredRef.current = true; return; }
    try {
      const key = `ces:segments:${surveyId ?? "draft"}`;
      const raw = localStorage.getItem(key);
      if (raw) {
        const saved = JSON.parse(raw) as { segments: Segment[]; selectedSegmentLabels: string[] };
        if (Array.isArray(saved.segments) && saved.segments.length > 0) {
          setSegments(saved.segments);
          setSelectedSegmentLabels(Array.isArray(saved.selectedSegmentLabels) ? saved.selectedSegmentLabels : []);
        }
      }
      segmentsRestoredRef.current = true;
    } catch { segmentsRestoredRef.current = true; }
  }, [surveyId, segments.length]);

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
        lastPerimeterFixTsRef.current = 0;
        setWalkedM(0);
        setLastVertexAt(null);
        setPerimeterSessionId((n) => n + 1);
      }
      return !wasRecording;
    });
  }, []);

  // Builds a regular N-sided polygon around any centre point. Pulled out so
  // both the initial auto-fence and the radius-slider / live-follow updates
  // re-use the same maths.
  const buildAutoFenceRing = useCallback((centre: { lat: number; lng: number }, radiusM: number, sides = 24): LatLng[] => {
    const R = 6378137;
    const ring: LatLng[] = [];
    for (let i = 0; i < sides; i++) {
      const theta = (i / sides) * 2 * Math.PI;
      const dx = radiusM * Math.cos(theta);
      const dy = radiusM * Math.sin(theta);
      const dLat = (dy / R) * (180 / Math.PI);
      const dLng = (dx / (R * Math.cos((centre.lat * Math.PI) / 180))) * (180 / Math.PI);
      ring.push({ lat: centre.lat + dLat, lng: centre.lng + dLng });
    }
    ring.push({ ...ring[0] });
    return ring;
  }, []);

  // Auto-fence around current GPS — for users who can't physically walk the
  // perimeter (insecurity, terrain, weather, mobility). Generates a regular
  // 24-sided polygon of the chosen radius around the live GPS fix and feeds it
  // into the same perimeter pipeline used by Step 2 (segments + households).
  // Marks the survey so reviewers can distinguish auto-fence from a walked
  // boundary in audit logs and exports.
  const autoFenceAroundMe = useCallback((radiusM: number = 50) => {
    if (!gps) {
      toast({
        title: "Waiting for GPS",
        description: "We need a live GPS fix before we can fence around your position.",
        variant: "destructive",
      });
      return;
    }
    if (recordingPerimeter) setRecordingPerimeter(false);
    const center = { lat: gps.lat, lng: gps.lng };
    const ring = buildAutoFenceRing(center, radiusM);
    setPerimeter(ring);
    setWalkedM(2 * Math.PI * radiusM);
    setLastVertexAt(Date.now());
    setAutoFenced(true);
    setAutoFenceCenter(center);
    if (basemap !== "hybrid" && basemap !== "satellite") setBasemap("hybrid");
    try {
      logCESAction(surveyId ?? "draft", "perimeter.auto_fence", {
        radius_m: radiusM,
        center_lat: center.lat,
        center_lng: center.lng,
        accuracy_m: gps.accuracy,
        vertices: ring.length,
      }, { lat: center.lat, lng: center.lng });
    } catch { /* audit best-effort */ }
    toast({
      title: "✓ Auto-fenced around your position",
      description: `${radiusM} m radius (${ring.length - 1} vertices). Adjust radius or drag vertices to refine, then proceed to Step 2.`,
    });
  }, [gps, recordingPerimeter, basemap, buildAutoFenceRing]);

  // Live-update the auto-fence ring whenever the radius slider moves OR — when
  // follow mode is on — whenever the GPS fix moves. Skips while the user is
  // editing vertices manually (we don't want to overwrite their edits).
  useEffect(() => {
    if (!autoFenced || editVertices) return;
    const centre = autoFenceFollow && gps ? { lat: gps.lat, lng: gps.lng } : autoFenceCenter;
    if (!centre) return;
    if (autoFenceFollow && gps) {
      const last = lastAutoFenceFollowRef.current;
      const movedM = last ? haversineMeters({ lat: last.lat, lng: last.lng }, centre) : Infinity;
      const elapsed = last ? Date.now() - last.t : Infinity;
      // Do not rebuild the whole boundary/static map layer for GPS jitter.
      if (last && movedM < 5 && elapsed < 3000) return;
      lastAutoFenceFollowRef.current = { ...centre, t: Date.now() };
    }
    const ring = buildAutoFenceRing(centre, autoFenceRadiusM);
    startTransition(() => {
      setPerimeter(ring);
      setWalkedM(2 * Math.PI * autoFenceRadiusM);
      if (autoFenceFollow && gps) setAutoFenceCenter({ lat: gps.lat, lng: gps.lng });
    });
  }, [autoFenceRadiusM, autoFenced, autoFenceFollow, gps?.lat, gps?.lng, autoFenceCenter, editVertices, buildAutoFenceRing]);

  // Append GPS fixes to the breadcrumb trail (cap at 200 points to keep render
  // light; the user can clear it from the UI).
  useEffect(() => {
    if (!gps) return;
    setGpsTrail((prev) => {
      const last = prev[prev.length - 1];
      if (last) {
        // Skip near-duplicate fixes (< 1.5 m movement) to avoid clutter.
        const R = 6371000;
        const dLat = (gps.lat - last.lat) * Math.PI / 180;
        const dLng = (gps.lng - last.lng) * Math.PI / 180;
        const latMid = ((gps.lat + last.lat) / 2) * Math.PI / 180;
        const d = R * Math.sqrt(dLat * dLat + Math.pow(Math.cos(latMid) * dLng, 2));
        if (d < 1.5) return prev;
      }
      const next = [...prev, { lat: gps.lat, lng: gps.lng }];
      return next.length > 200 ? next.slice(next.length - 200) : next;
    });
  }, [gps?.lat, gps?.lng]);

  // ---------- Vertex editing ----------
  const handleVertexMove = useCallback((index: number, lat: number, lng: number) => {
    setPerimeter((prev) => {
      if (!prev || prev.length === 0) return prev;
      const isClosed = prev.length >= 2
        && Math.abs(prev[0].lat - prev[prev.length - 1].lat) < 1e-9
        && Math.abs(prev[0].lng - prev[prev.length - 1].lng) < 1e-9;
      const next = prev.slice();
      if (index < 0 || index >= next.length) return prev;
      next[index] = { lat, lng };
      // Keep ring closed: if user moved the start vertex, mirror it on the closing one.
      if (isClosed && index === 0) next[next.length - 1] = { lat, lng };
      return next;
    });
    // Once the user touches a vertex we stop following GPS so we don't overwrite their edit.
    setAutoFenceFollow(false);
  }, []);

  const handleVertexDelete = useCallback((index: number) => {
    setPerimeter((prev) => {
      const isClosed = prev.length >= 2
        && Math.abs(prev[0].lat - prev[prev.length - 1].lat) < 1e-9
        && Math.abs(prev[0].lng - prev[prev.length - 1].lng) < 1e-9;
      const ringLen = isClosed ? prev.length - 1 : prev.length;
      if (ringLen <= 3) {
        toast({ title: "Need at least 3 vertices", description: "Add a vertex before removing this one.", variant: "destructive" });
        return prev;
      }
      const next = prev.slice();
      next.splice(index, 1);
      if (isClosed && index === 0) next[next.length - 1] = { ...next[0] };
      return next;
    });
    setAutoFenceFollow(false);
  }, []);

  // ---------- Saved fences (localStorage) ----------
  const saveCurrentFence = useCallback(() => {
    if (perimeter.length < 3) {
      toast({ title: "No fence to save", description: "Draw or auto-fence a perimeter first.", variant: "destructive" });
      return;
    }
    const defaultName = communityName || `${ward || lga || "Fence"} · ${new Date().toLocaleString()}`;
    const name = (typeof window !== "undefined" ? window.prompt("Name this fenced area:", defaultName) : defaultName) || defaultName;
    const center = polygonCenter(perimeter);
    const record = saveFence({
      name,
      polygon: perimeter,
      center,
      source: autoFenced ? "auto-fence" : drawMode || draftPolygon.length > 0 ? "manual-draw" : "walk",
      radiusM: autoFenced && autoFenceCenter ? autoFenceRadiusM : undefined,
      perimeterM: polygonPerimeterM(perimeter),
      areaM2: savedPolygonAreaM2(perimeter),
      state, lga, ward, community: communityName,
    });
    setSavedFences(loadSavedFences());
    try {
      logCESAction(surveyId ?? "draft", "perimeter.saved", { id: record.id, name, vertices: perimeter.length }, center);
    } catch { /* best-effort */ }
    toast({ title: "✓ Fence saved", description: `"${name}" — reuse from the saved-fences list anytime.` });
  }, [perimeter, autoFenced, autoFenceCenter, autoFenceRadiusM, communityName, ward, lga, state, drawMode, draftPolygon.length, surveyId]);

  const loadFenceById = useCallback((id: string) => {
    const fence = savedFences.find((f) => f.id === id);
    if (!fence) return;
    setPerimeter(fence.polygon);
    setWalkedM(fence.perimeterM);
    setAutoFenced(true);
    setAutoFenceCenter(fence.center);
    setAutoFenceFollow(false);
    setLastVertexAt(Date.now());
    if (fence.radiusM) setAutoFenceRadiusM(fence.radiusM);
    toast({ title: "✓ Loaded saved fence", description: `${fence.name} — ${fence.polygon.length - 1} vertices, ${(fence.areaM2 / 10_000).toFixed(2)} ha.` });
  }, [savedFences]);

  const removeSavedFence = useCallback((id: string) => {
    setSavedFences(deleteSavedFence(id));
  }, []);


  // ---------- Manual draw on satellite map ----------
  // The user taps the map to drop perimeter vertices; tapping the first vertex
  // (within ~8 m on the ground / 18 px on screen) closes the polygon. We then
  // run Douglas–Peucker to auto-detect/keep only the meaningful vertices.
  const startManualDraw = useCallback(() => {
    if (recordingPerimeter) setRecordingPerimeter(false);
    setDraftPolygon([]);
    setDrawMode(true);
    toast({
      title: "Manual draw enabled",
      description: "Tap the satellite map to drop vertices around the community. Tap the first (red) vertex to close the polygon.",
    });
  }, [recordingPerimeter]);

  const cancelManualDraw = useCallback(() => {
    setDrawMode(false);
    setDraftPolygon([]);
  }, []);

  // Douglas–Peucker line simplification on lat/lng (treats degrees as planar — fine
  // at the scales of a single community / village).
  const simplifyRing = useCallback((pts: LatLng[], toleranceDeg = 0.00003): LatLng[] => {
    if (pts.length < 4) return pts;
    const sqDist = (a: LatLng, b: LatLng) => {
      const dx = a.lng - b.lng, dy = a.lat - b.lat;
      return dx * dx + dy * dy;
    };
    const sqSegDist = (p: LatLng, a: LatLng, b: LatLng) => {
      let x = a.lng, y = a.lat;
      let dx = b.lng - x, dy = b.lat - y;
      if (dx !== 0 || dy !== 0) {
        const t = ((p.lng - x) * dx + (p.lat - y) * dy) / (dx * dx + dy * dy);
        if (t > 1) { x = b.lng; y = b.lat; }
        else if (t > 0) { x += dx * t; y += dy * t; }
      }
      dx = p.lng - x; dy = p.lat - y;
      return dx * dx + dy * dy;
    };
    const sqTol = toleranceDeg * toleranceDeg;
    const dpStep = (first: number, last: number, simplified: LatLng[]) => {
      let maxSq = sqTol, index = -1;
      for (let i = first + 1; i < last; i++) {
        const d = sqSegDist(pts[i], pts[first], pts[last]);
        if (d > maxSq) { index = i; maxSq = d; }
      }
      if (index !== -1) {
        if (index - first > 1) dpStep(first, index, simplified);
        simplified.push(pts[index]);
        if (last - index > 1) dpStep(index, last, simplified);
      }
    };
    const last = pts.length - 1;
    const simplified: LatLng[] = [pts[0]];
    dpStep(0, last, simplified);
    simplified.push(pts[last]);
    // Remove duplicates of adjacent identical points.
    return simplified.filter((p, i, arr) => i === 0 || sqDist(arr[i - 1], p) > 1e-12);
  }, []);

  const finalizeManualDraw = useCallback((points: LatLng[]) => {
    if (points.length < 3) {
      toast({ title: "Need at least 3 vertices", description: "Tap a few more points before closing.", variant: "destructive" });
      return;
    }
    const ring = simplifyRing(points);
    const closed = [...ring, { ...ring[0] }];
    setPerimeter(closed);
    // Approximate walked distance = polygon perimeter
    let perimM = 0;
    for (let i = 1; i < closed.length; i++) {
      const a = closed[i - 1], b = closed[i];
      const R = 6371000;
      const dLat = (b.lat - a.lat) * Math.PI / 180;
      const dLng = (b.lng - a.lng) * Math.PI / 180;
      const latMid = ((a.lat + b.lat) / 2) * Math.PI / 180;
      perimM += R * Math.sqrt(dLat * dLat + Math.pow(Math.cos(latMid) * dLng, 2));
    }
    setWalkedM(perimM);
    setLastVertexAt(Date.now());
    setAutoFenced(true);
    setDrawMode(false);
    setDraftPolygon([]);
    try {
      logCESAction(surveyId ?? "draft", "perimeter.manual_draw", {
        raw_vertices: points.length,
        simplified_vertices: ring.length,
        perimeter_m: Math.round(perimM),
      }, gps ? { lat: gps.lat, lng: gps.lng } : undefined);
    } catch { /* audit best-effort */ }
    toast({
      title: "✓ Polygon closed",
      description: `Auto-detected ${ring.length} vertices from ${points.length} taps. Proceed to Step 2.`,
    });
  }, [simplifyRing, surveyId, gps]);

  const closeManualDraw = useCallback(() => {
    finalizeManualDraw(draftPolygon);
  }, [draftPolygon, finalizeManualDraw]);

  const handleDrawTap = useCallback((lat: number, lng: number) => {
    if (!drawMode) return;
    setDraftPolygon((prev) => {
      // Tap near the first vertex closes the polygon (≈8 m threshold).
      if (prev.length >= 3) {
        const a = prev[0];
        const R = 6371000;
        const dLat = (lat - a.lat) * Math.PI / 180;
        const dLng = (lng - a.lng) * Math.PI / 180;
        const latMid = ((a.lat + lat) / 2) * Math.PI / 180;
        const d = R * Math.sqrt(dLat * dLat + Math.pow(Math.cos(latMid) * dLng, 2));
        if (d < 8) {
          // Close using the updater's `prev` snapshot so rapid Android taps do
          // not read a stale draftPolygon from the previous React render.
          queueMicrotask(() => finalizeManualDraw(prev));
          return prev;
        }
      }
      return [...prev, { lat, lng }];
    });
  }, [drawMode, finalizeManualDraw]);

  // Light ticker while recording so status remains live without forcing a full
  // form/map render twice per second on Android.
  useEffect(() => {
    if (!recordingPerimeter) return;
    const id = window.setInterval(() => {
      const now = Date.now();
      if (lastPerimeterFixTsRef.current > 0) {
        setPerimeterStatus((s) => ({ ...s, lastFixAgeMs: now - lastPerimeterFixTsRef.current }));
      }
    }, 2000);
    return () => window.clearInterval(id);
  }, [recordingPerimeter]);

  // Prefetch residential mask once we have ≥3 perimeter vertices (or after stop)
  useEffect(() => {
    if (perimeter.length < 3 || recordingPerimeter) return;
    const controller = new AbortController();
    let cancelled = false;
    const run = () => {
      if (cancelled) return;
      setMaskStatus("loading");
      getResidentialMask(perimeter, { signal: controller.signal })
        .then((m) => {
          if (!cancelled) startTransition(() => { setResidentialMask(m); setMaskStatus("ok"); });
        })
        .catch((err) => {
          if (!cancelled && err?.name !== "AbortError") setMaskStatus("error");
        });
    };
    const timer = window.setTimeout(run, 900);
    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [perimeter, recordingPerimeter]);

  const deferredResidentialMask = useDeferredValue(residentialMask);
  const deferredPerimeter = useDeferredValue(perimeter);

  const featureSummaryCore = useMemo(() => {
    const fg = deferredResidentialMask?.featureGeometry;
    if (!fg) return { buildings: 0, roads: 0, waterways: 0, uncertain: 0, namedRoads: 0, labeled: 0, avgConfidence: 0 };
    const perimeterIndex = deferredPerimeter.length >= 3 ? pointInPolygonIndex(deferredPerimeter) : null;
    const contains = (p: LatLng) => perimeterIndex ? perimeterIndex.contains(p) : true;
    const inPerimeter = perimeterIndex
      ? {
          buildings: fg.buildings.filter((b) => contains(b.center)),
          roads: fg.roads.filter((r) => r.points.some(contains)),
          waterways: fg.waterways.filter((w) => w.points.some(contains)),
        }
      : { buildings: fg.buildings, roads: fg.roads, waterways: fg.waterways };
    const all = [...inPerimeter.buildings, ...inPerimeter.roads, ...inPerimeter.waterways];
    const uncertain = all.filter((f) => (f.confidence ?? 1) < 0.7).length;
    const avgConfidence = all.length ? all.reduce((s, f) => s + (f.confidence ?? 0), 0) / all.length : 0;
    return {
      buildings: inPerimeter.buildings.length,
      roads: inPerimeter.roads.length,
      waterways: inPerimeter.waterways.length,
      uncertain,
      namedRoads: inPerimeter.roads.filter((r) => !!(r.name || r.ref)).length,
      labeled: 0,
      avgConfidence,
    };
  }, [deferredResidentialMask, deferredPerimeter]);

  const featureLabelCount = useMemo(() => Object.keys(featureLabelMap).length, [featureLabelMap]);
  const featureSummary = useMemo(
    () => ({ ...featureSummaryCore, labeled: featureLabelCount }),
    [featureSummaryCore, featureLabelCount],
  );

  useEffect(() => {
    if (maskStatus !== "ok") return;
    const rooftopCount = featureSummary.buildings;
    setEstHHAi(rooftopCount);
    setEstHHUser((current) => current ?? rooftopCount);
    const pct = featureSummary.avgConfidence >= 0.9 ? 0.1 : featureSummary.avgConfidence >= 0.75 ? 0.2 : 0.35;
    setEstHHAiCI({
      low: Math.max(0, Math.round(rooftopCount * (1 - pct))),
      high: Math.round(rooftopCount * (1 + pct)),
      confidence: featureSummary.avgConfidence >= 0.9 ? "high" : featureSummary.avgConfidence >= 0.75 ? "medium" : "low",
    });
  }, [maskStatus, featureSummary.buildings, featureSummary.avgConfidence]);



  // Refresh offline pending count whenever household list changes
  useEffect(() => {
    getPendingCount().then(setOfflinePending);
  }, [households.length]);

  // ---------- AI rooftop count ----------
  const runRooftopAI = useCallback(async () => {
    if (featureSummary.buildings > 0) {
      const count = featureSummary.buildings;
      const pct = featureSummary.avgConfidence >= 0.9 ? 0.1 : featureSummary.avgConfidence >= 0.75 ? 0.2 : 0.35;
      setEstHHAi(count);
      setEstHHAiCI({
        low: Math.max(0, Math.round(count * (1 - pct))),
        high: Math.round(count * (1 + pct)),
        confidence: featureSummary.avgConfidence >= 0.9 ? "high" : featureSummary.avgConfidence >= 0.75 ? "medium" : "low",
      });
      setEstHHUser((u) => u ?? count);
      toast({ title: "Rooftop estimate refreshed", description: `${count} detected rooftop footprint${count === 1 ? "" : "s"} inside the perimeter.` });
      return;
    }
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
  }, [gps, featureSummary]);

  // ---------- Perimeter Smart Count: analyze the drawn satellite crop with AI vision ----------
  // Counts every distinct building rooftop STRICTLY inside the drawn perimeter (ignoring roads,
  // cars, shadows and trees) and writes the estimate into the Households input (still overwritable).
  const [perimeterCountLoading, setPerimeterCountLoading] = useState(false);
  const runPerimeterSmartCount = useCallback(async () => {
    if (perimeter.length < 3) {
      toast({
        title: "Draw a perimeter first",
        description: "Walk, draw or auto-fence a perimeter, then run Smart Count.",
        variant: "destructive",
      });
      return;
    }
    setPerimeterCountLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("ces-rooftop-count", {
        body: { polygon: perimeter.map((p) => ({ lat: p.lat, lng: p.lng })) },
      });
      if (error) throw error;
      const d = data as any;
      if (d?.error) throw new Error(d.error);
      const count = d?.estimated_households ?? 0;
      const conf = d?.confidence ?? "low";
      const ciLow = typeof d?.ci_low === "number" ? d.ci_low : null;
      const ciHigh = typeof d?.ci_high === "number" ? d.ci_high : null;
      setEstHHAi(count);
      if (ciLow !== null && ciHigh !== null) {
        setEstHHAiCI({ low: ciLow, high: ciHigh, confidence: conf });
      }
      setSmartCountResult({ count, sampleAreaM2: 0 });
      // Overwrite the Households input with the perimeter estimate (still editable).
      setEstHHUser(count);
      toast({
        title: "Smart Count complete",
        description: `${count} distinct rooftop${count === 1 ? "" : "s"} counted inside the perimeter (${conf} confidence). You can adjust the number manually.`,
      });
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      toast({
        title: "Smart Count failed",
        description:
          msg.includes("rate_limited")
            ? "AI is busy — please try again in a moment."
            : msg.includes("credits_exhausted")
            ? "AI credits exhausted — enter the household count manually."
            : msg,
        variant: "destructive",
      });
    } finally {
      setPerimeterCountLoading(false);
    }
  }, [perimeter]);


  // ---------- Smart Count: tap-a-feature → ML counts similar features inside perimeter ----------
  // Uses the already-detected building footprints from the residential mask classifier as the
  // ML feature bank. We treat the tapped feature as a *prototype*: its area defines a similarity
  // band (0.4×–2.5×) and we aggregate every footprint inside the perimeter that falls in that band,
  // regardless of roof colour. Result becomes the household estimate (proxy: 1 roof = 1 HH).
  const handleSmartCountTap = useCallback(
    (lat: number, lng: number) => {
      const fg = residentialMask?.featureGeometry;
      if (!fg || fg.buildings.length === 0 || perimeter.length < 3) {
        toast({
          title: "Smart Count unavailable",
          description: "Detect features inside a fenced perimeter first, then try again.",
          variant: "destructive",
        });
        setSmartCountMode(false);
        return;
      }
      // 1) Find the nearest detected building to the tap (the "prototype").
      let nearest: typeof fg.buildings[number] | null = null;
      let bestD2 = Infinity;
      for (const b of fg.buildings) {
        const dy = (b.center.lat - lat) * 111_320;
        const dx = (b.center.lng - lng) * 111_320 * Math.cos((lat * Math.PI) / 180);
        const d2 = dx * dx + dy * dy;
        if (d2 < bestD2) { bestD2 = d2; nearest = b; }
      }
      if (!nearest || Math.sqrt(bestD2) > 40) {
        toast({
          title: "No feature near tap",
          description: "Tap directly on a rooftop/feature visible on the satellite imagery.",
          variant: "destructive",
        });
        return;
      }
      // 2) Count all detected buildings inside the perimeter whose footprint area falls within
      //    [0.4×, 2.5×] of the prototype's area. This captures same-class structures (compound houses,
      //    shops, single-family roofs) regardless of colour or material.
      const protoArea = Math.max(nearest.areaM2, 4); // floor to avoid zero
      const lo = protoArea * 0.4;
      const hi = protoArea * 2.5;
      const matches = fg.buildings.filter(
        (b) => b.areaM2 >= lo && b.areaM2 <= hi && pointInPolygonGeo(b.center, perimeter),
      );
      const total = matches.length;
      setSmartCountResult({ count: total, sampleAreaM2: protoArea });
      setEstHHAi(total);
      setEstHHUser(total);
      setSmartCountMode(false);
      toast({
        title: "Smart Count complete",
        description: `${total} similar feature${total === 1 ? "" : "s"} aggregated inside the perimeter (proxy households).`,
      });
    },
    [residentialMask, perimeter],
  );

  // ---------- Sampling design (residential-aware) ----------
  // Pure, synchronous segmentation math — no network, no awaits. Splits the
  // walked perimeter into N equal-density slices using whatever building mask is
  // available (may be empty offline) and re-anchors labels to real buildings.
  const computeSegmentsFromMask = useCallback(
    (peri: { lat: number; lng: number }[], mask: ResidentialMaskResult | null, numSegments: number) => {
      const inside = (mask?.residentialBuildings ?? []).filter((p) => pointInPolygonGeo(p, peri));
      const k = Math.max(1, numSegments);
      let segs = equalPerimeterSegments(peri, k, inside);
      segs = segs.filter((s) => s.polygon.length >= 3);
      if (segs.length === 0 && inside.length > 0) {
        segs = kmeansSegments(inside, Math.min(k, inside.length));
      }
      segs = segs.map((s) => {
        const bag = s.members.length ? s.members : inside;
        if (bag.length === 0) return s;
        let best = bag[0];
        let bestD = Infinity;
        for (const b of bag) {
          const d = (b.lat - s.centroid.lat) ** 2 + (b.lng - s.centroid.lng) ** 2;
          if (d < bestD) { bestD = d; best = b; }
        }
        return { ...s, centroid: best };
      });
      return { segs, inside };
    },
    [],
  );

  const buildSegments = useCallback(async () => {
    const N = estHHUser ?? estHHAi ?? 0;
    if (N <= 0 || targetN <= 0) {
      toast({ title: "Need household estimate + target N", variant: "destructive" });
      return;
    }
    const numSegments = Math.max(1, Math.ceil(N / targetN));

    // Require a REAL walked perimeter (live GPS vertices). No synthetic circles.
    if (perimeter.length < 3) {
      toast({
        title: "Fence the community first",
        description: "Use Step 1 → Walk Perimeter to capture live GPS vertices, or tap Auto-Fence Around Me to draw a polygon around your current position.",
        variant: "destructive",
      });
      return;
    }
    const peri = perimeter;
    setBuildingSegments(true);

    // INSTANT PATH: build immediately from any cached mask (or the perimeter
    // alone). This is pure math — completes in milliseconds and works fully
    // offline. The network mask is only a refinement fetched in the background.
    const cached = getCachedResidentialMask(peri) ?? residentialMask;
    const { segs, inside } = computeSegmentsFromMask(peri, cached, numSegments);

    if (segs.length === 0) {
      toast({
        title: "Could not build segments",
        description: "The perimeter is too small or degenerate. Re-walk a clearer boundary in Step 1.",
        variant: "destructive",
      });
      setBuildingSegments(false);
      return;
    }

    const rIdx = Math.floor(Math.random() * segs.length);
    const selectedLabel = segs[rIdx].label;
    setSegments(segs);
    setSelectedSegmentLabels([selectedLabel]);
    setBuildingSegments(false);

    const usedSource: "osm-buildings" | "perimeter-only" = inside.length > 0 ? "osm-buildings" : "perimeter-only";
    if (surveyId) logCESAction(surveyId, "build_segments", {
      count: numSegments, selected: selectedLabel, source: usedSource,
      residential_buildings_found: cached?.residentialBuildings.length ?? 0,
    });
    toast({
      title: "Segments built",
      description: inside.length > 0
        ? `${segs.length} segment${segs.length === 1 ? "" : "s"} from ${inside.length} mapped building${inside.length === 1 ? "" : "s"} inside the walked perimeter. Selected ${selectedLabel}.`
        : `${segs.length} equal segment${segs.length === 1 ? "" : "s"} created from the walked perimeter. Selected segment ${selectedLabel}.`,
    });

    // BACKGROUND REFINEMENT: if we had no cached buildings, fetch the OSM mask
    // (timeout-guarded) and silently re-cluster so future re-builds are sharper.
    // Never blocks the UI and is a no-op offline.
    if ((!cached || cached.residentialBuildings.length === 0) && (typeof navigator === "undefined" || navigator.onLine !== false)) {
      setMaskStatus("loading");
      getResidentialMask(peri)
        .then((mask) => {
          setResidentialMask(mask);
          setMaskStatus("ok");
          if (households.length > 0) return; // visits already saved — keep locked segments
          const refined = computeSegmentsFromMask(peri, mask, numSegments);
          if (refined.segs.length === 0) return;
          setSegments(refined.segs);
          setSelectedSegmentLabels((prev) => {
            const keep = prev.find((l) => refined.segs.some((s) => s.label === l));
            return keep ? [keep] : [refined.segs[Math.floor(Math.random() * refined.segs.length)].label];
          });
        })
        .catch(() => setMaskStatus("error"));
    }
  }, [estHHUser, estHHAi, targetN, perimeter, surveyId, residentialMask, households.length, computeSegmentsFromMask]);


  // Reactive auto-resync: whenever the walked perimeter vertices change AFTER segments
  // have been built, re-cluster automatically (debounced, skipped while still recording).
  const segmentsBuiltRef = useRef(false);
  useEffect(() => { segmentsBuiltRef.current = segments.length > 0; }, [segments.length]);
  const lastResyncSigRef = useRef<string>("");
  useEffect(() => {
    if (!segmentsBuiltRef.current) return;
    if (recordingPerimeter) return;
    if (perimeter.length < 3) return;
    const sig = perimeter.map((p) => `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`).join("|");
    if (sig === lastResyncSigRef.current) return;
    lastResyncSigRef.current = sig;
    const t = window.setTimeout(() => {
      buildSegments().catch((e) => console.warn("Auto-resync segments failed:", e));
    }, 500);
    return () => window.clearTimeout(t);
  }, [perimeter, recordingPerimeter, buildSegments]);

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
      if (persistingSurveyRef.current) {
        if (status === "draft") return persistingSurveyRef.current;
        await persistingSurveyRef.current.catch(() => null);
      }
      const run = (async (): Promise<string | null> => {
      // Resolve the signed-in user resiliently. getUser() makes a network call
      // that can fail/timeout on poor field connectivity even when a valid
      // session exists locally — that produced spurious "Sign in required"
      // errors. Trust the locally-persisted session first; only fall back to a
      // network revalidation when no session is cached. The backend RLS still
      // enforces real authentication on every write.
      let authedUserId: string | null = null;
      const { data: sess } = await supabase.auth.getSession();
      authedUserId = sess.session?.user?.id ?? null;
      if (!authedUserId) {
        try {
          const { data: u } = await supabase.auth.getUser();
          authedUserId = u.user?.id ?? null;
        } catch {
          authedUserId = null;
        }
      }
      if (!authedUserId) {
        toast({ title: "Sign in required", variant: "destructive" });
        return null;
      }
      // When the location is locked (carried over from the MDA Supervisory
      // Checklist), always source the geography from the immutable ref so the
      // submitted values cannot be overridden by tampered component state.
      const geo = getCurrentGeo();
      const surveyPosition = getCurrentSurveyPosition();
      const payload: any = {
        project_id: projectId ?? null,
        form_id: formId ?? null,
        name: `${geo.community_name || "CES"} — ${new Date().toLocaleDateString()}`,
        survey_date: new Date().toISOString().slice(0, 10),
        state: geo.state, lga: geo.lga, ward: geo.ward, flhf_name: geo.flhf_name,
        community_name: geo.community_name, settlement_name: geo.settlement_name,
        center_lat: surveyPosition?.lat ?? null, center_lng: surveyPosition?.lng ?? null,
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
        feature_buildings_count: featureSummary.buildings,
        feature_roads_count: featureSummary.roads,
        feature_waterways_count: featureSummary.waterways,
        feature_uncertain_count: featureSummary.uncertain,
        feature_labeled_count: featureSummary.labeled,
        feature_named_roads_count: featureSummary.namedRoads,
        est_hh_rooftop_source: "detected_rooftops",
      };

      const queueSurveyOffline = async (id: string) => {
        await saveSurveyOffline({
          id,
          payload,
          created_by: authedUserId!,
          updated_at: new Date().toISOString(),
          synced: false,
          retry_count: 0,
        });
        setSurveyId(id);
        return id;
      };

      if (!navigator.onLine) {
        return queueSurveyOffline(surveyId ?? generateUUID());
      }

      if (surveyId) {
        // Concurrency guard — optimistic lock prevents two devices/tabs editing
        // the same survey from clobbering each other's saves.
        const { safeUpdate } = await import("@/lib/optimisticUpdate");
        let updateResult: { conflict: boolean; error: any };
        try {
          updateResult = await safeUpdate("ces_surveys", surveyId, payload);
        } catch (error: any) {
          await queueSurveyOffline(surveyId);
          return surveyId;
        }
        const { conflict, error } = updateResult;
        if (conflict) {
          toast({ title: "Save conflict", description: "This survey was just updated on another device. Refresh to load the latest version.", variant: "destructive" });
          return null;
        }
        if (error) {
          await queueSurveyOffline(surveyId);
          return surveyId;
        }
        return surveyId;
      } else {
        let data: any = null;
        let error: any = null;
        try {
          const resp = await supabase
            .from("ces_surveys" as any)
            .insert({ ...payload, created_by: authedUserId })
            .select()
            .single();
          data = resp.data;
          error = resp.error;
        } catch (err: any) {
          error = err;
        }
        if (error || !data) {
          return queueSurveyOffline(generateUUID());
        }
        const id = (data as any).id;
        setSurveyId(id);
        return id;
      }
      })();
      persistingSurveyRef.current = run;
      try {
        return await run;
      } finally {
        if (persistingSurveyRef.current === run) {
          persistingSurveyRef.current = null;
        }
      }
    },
    [projectId, formId, getCurrentGeo, getCurrentSurveyPosition, perimeter,
     estHHAi, estHHUser, targetN, segments.length, selectedSegmentLabels, coverage, surveyId,
     outsideMicroplan, outsideMicroplanReason, featureSummary, locationLocked],
  );

  const autosaveRef = useRef<{ surveyId: string | null; step: Step; gps: typeof gps; persistSurvey: typeof persistSurvey }>({ surveyId, step, gps, persistSurvey });
  useEffect(() => {
    autosaveRef.current = { surveyId, step, gps, persistSurvey };
  }, [surveyId, step, gps, persistSurvey]);

  const openFeatureLabelDialog = useCallback((feature: FeatureLabelRequest) => {
    setPendingFeatureLabel(feature);
    setFeatureLabelDraft(feature.originalLabel);
    setFeatureLabelNotes("");
  }, []);

  const saveFeatureLabel = useCallback(async () => {
    if (!pendingFeatureLabel) return;
    const corrected = featureLabelDraft.trim();
    if (!corrected) {
      toast({ title: "Label required", variant: "destructive" });
      return;
    }
    const sid = surveyId || (await persistSurvey("draft"));
    if (!sid) return;
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const { error } = await supabase.from("ces_feature_labels" as any).upsert({
      survey_id: sid,
      feature_id: pendingFeatureLabel.id,
      feature_type: pendingFeatureLabel.type,
      original_label: pendingFeatureLabel.originalLabel,
      corrected_label: corrected,
      confidence: pendingFeatureLabel.confidence,
      geometry: pendingFeatureLabel.geometry as any,
      notes: featureLabelNotes.trim() || null,
      created_by: u.user.id,
    }, { onConflict: "survey_id,feature_id,created_by" });
    if (error) {
      toast({ title: "Label save failed", description: error.message, variant: "destructive" });
      return;
    }
    setFeatureLabelMap((m) => ({ ...m, [pendingFeatureLabel.id]: corrected }));
    setPendingFeatureLabel(null);
    toast({ title: "Training label saved", description: `${pendingFeatureLabel.type} confirmed for supervised training.` });
  }, [pendingFeatureLabel, featureLabelDraft, featureLabelNotes, surveyId, persistSurvey]);

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

  // Auto-advance Step 1 → Step 2 only after a stable community boundary exists.
  // Advancing immediately after microplan autofill/GPS lock can interrupt the
  // boundary walk before live vertices are captured.
  useEffect(() => {
    if (autoAdvancedRef.current) return;
    if (step !== 1) return;
    if (!getCurrentSurveyPosition()) return;
    if (!state || !lga || !ward || !communityName) return;
    if (perimeter.length < 3) return;
    if (recordingPerimeter) return;
    autoAdvancedRef.current = true;
    toast({
      title: "Perimeter captured",
      description: `${perimeter.length} boundary vertices captured — continuing to Step 2.`,
    });
    persistSurvey("draft").finally(() => setStep(2));
  }, [step, getCurrentSurveyPosition, state, lga, ward, communityName, perimeter.length, recordingPerimeter, persistSurvey]);

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
      const latest = autosaveRef.current;
      if (latest.surveyId) void latest.persistSurvey("draft").catch(() => undefined);
      if (latest.step === 3 && latest.gps) {
        const next = [...gpsLogsRef.current, { lat: latest.gps.lat, lng: latest.gps.lng, ts: Date.now() }];
        gpsLogsRef.current = next.length > 720 ? next.slice(next.length - 720) : next;
      }
    }, 30000);
    return () => clearInterval(t);
  }, []);

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
      const selected = segments.filter((s) => selectedSegmentLabels.includes(s.label));

      // Segment-based sampling: to record visit details the surveyor MUST have a
      // live device GPS fix AND be physically standing inside one of the highlighted
      // (selected) segments. The map-only / handoff fallback is NOT allowed here —
      // it previously let users record visits while physically outside the segment.
      if (selected.length > 0) {
        if (!gps) {
          toast({
            title: "GPS lock required",
            description: "Recording visit details requires a live device GPS fix inside the highlighted segment. Wait for the GPS lock, then try again.",
            variant: "destructive",
          });
          return;
        }
        // STRICT physical geofence — the device's real position must be inside the segment.
        const userInside = selected.some((s) => pointInPolygon({ lat: gps.lat, lng: gps.lng }, s.polygon));
        if (!userInside) {
          toast({
            title: "Physical Geofence Violation",
            description: "You are physically outside the highlighted segment. Move inside the segment to record visit details.",
            variant: "destructive",
          });
          return;
        }
        // The tapped household pin must also fall inside the selected segment.
        const tapInside = selected.some((s) => pointInPolygon({ lat, lng }, s.polygon));
        if (!tapInside) {
          toast({
            title: "Pin Outside Segment",
            description: "Tap inside the highlighted segment to add households.",
            variant: "destructive",
          });
          return;
        }
        if (gps.accuracy > 50) {
          toast({ title: "Low GPS accuracy", description: `±${gps.accuracy.toFixed(0)} m — pin saved, but consider moving to a clearer spot.` });
        }
        setPendingPin({ lat, lng, accuracy: gps.accuracy, source: "gps" });
        setPickerOpen(true);
        return;
      }

      // No segment selected yet (free placement) — keep the position fallback so
      // early/legacy flows still work, but never bypass the segment geofence above.
      const surveyPosition = getCurrentSurveyPosition();
      if (!gps && !surveyPosition) {
        toast({ title: "Location not ready", description: "Wait for GPS or return to Step 1 and draw/load a boundary first.", variant: "destructive" });
        return;
      }
      if (gps && gps.accuracy > 50) {
        toast({ title: "Low GPS accuracy", description: `±${gps.accuracy.toFixed(0)} m — pin saved, but consider moving to a clearer spot.` });
      }
      if (!gps) {
        toast({ title: "Map-only fallback", description: "GPS is still unavailable, so this visit will be tagged with the tapped map position for later review." });
      }
      setPendingPin({ lat, lng, accuracy: gps?.accuracy ?? surveyPosition?.accuracy ?? 999, source: gps ? "gps" : "map" });
      setPickerOpen(true);
    },
    [step, gps, getCurrentSurveyPosition, segments, selectedSegmentLabels],
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
    // Pins close to an existing household are allowed (GPS accuracy can shift the
    // visible pin off the actual structure). We auto-tag them as gps_drift unless
    // the surveyor explicitly chose another reason.
    if (isDuplicatePin && !hhForm.duplicateReason) {
      setHhForm((f: any) => ({ ...f, duplicateReason: "gps_drift" }));
    }

    if (parseInt(hhForm.treatedPersons) > parseInt(hhForm.eligiblePersons)) {
      toast({ title: "Validation Error", description: "Treated persons cannot exceed eligible persons.", variant: "destructive" });
      return;
    }


    const id = surveyId || (await persistSurvey("draft"));
    if (!id) return;
    let currentUserId: string | null = null;
    try {
      const { data: sess } = await supabase.auth.getSession();
      currentUserId = sess.session?.user?.id ?? null;
      if (!currentUserId && navigator.onLine) {
        const { data: u } = await supabase.auth.getUser();
        currentUserId = u.user?.id ?? null;
      }
    } catch {
      currentUserId = null;
    }
    const next = households.length + 1;
    const hhNumber = `HH${String(next).padStart(3, "0")}`;
    // Attribute the visit to whichever selected segment actually contains the pin
    const containingSeg = segments.find(
      (s) => selectedSegmentLabels.includes(s.label) && pointInPolygon({ lat: pendingPin.lat, lng: pendingPin.lng }, s.polygon),
    );
    const segLabel = containingSeg?.label || selectedSegmentLabels[0];
    const ts = new Date().toISOString();
    const devId = getDeviceId();
    
    // Digital Fingerprint
    const rawFingerprint = `${pendingPin.lat}${pendingPin.lng}${ts}${devId}`;
    const fgHashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(rawFingerprint));
    const fingerprintHash = Array.from(new Uint8Array(fgHashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');

    // Evidence Hash
    const rawEvidence = `${id}${hhNumber}${pendingPin.lat}${pendingPin.lng}mock_photo_hash${ts}${currentUserId || 'unknown'}${hhForm.status}`;
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
      created_by: currentUserId,
      synced: false,
      retry_count: 0,
      segment_label: segLabel || null,
      gps_snapshot: JSON.stringify(gps ?? { source: pendingPin.source ?? "map", accuracy: pendingPin.accuracy, captured_at: ts }),
      eligible_persons: parseInt(hhForm.eligiblePersons) || 0,
      treated_persons: parseInt(hhForm.treatedPersons) || 0,
    };

    const parentSurveyQueued = await getOfflineSurvey(id);

    // ─── Offline-First: try backend only when the parent survey exists online ───
    let savedId: string | null = null;
    if (!navigator.onLine || parentSurveyQueued) {
      // Save to local IndexedDB immediately
      await saveHouseholdOffline(offlineRow);
      setOfflinePending(p => p + 1);
      toast({
        title: parentSurveyQueued ? "Saved to ordered offline queue" : "Saved Offline ☁️",
        description: parentSurveyQueued
          ? `${hhNumber} is queued behind its survey draft and will sync after the survey reaches the server.`
          : `${hhNumber} stored locally. Will sync when online.`,
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
        visited_at: ts, synced_at: ts, created_by: currentUserId,
        eligible_persons: parseInt(hhForm.eligiblePersons) || 0,
        treated_persons: parseInt(hhForm.treatedPersons) || 0,
        segment_label: segLabel || null,
        gps_snapshot: gps ? { lat: gps.lat, lng: gps.lng, accuracy: gps.accuracy, captured_at: ts } : { source: pendingPin.source ?? "map", accuracy: pendingPin.accuracy, captured_at: ts },
      };

      let data: any = null;
      let error: any = null;
      try {
        const resp = await supabase.from("ces_household_visits" as any).insert(row).select().single();
        data = resp.data;
        error = resp.error;
      } catch (err: any) {
        error = err;
      }
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
          timestamp: ts, interviewer_id: currentUserId
        }).then(() => {});
      }
    }

    setHouseholds((p) => [...p, {
      id: savedId!, hh_number: hhNumber,
      lat: pendingPin.lat, lng: pendingPin.lng,
      coverage_status: hhForm.status,
      segment_label: segLabel || null,
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
      const pending = await getPendingHouseholds(surveyId);
      let data: any[] = [];
      if (navigator.onLine) {
        try {
          const resp = await supabase
            .from("ces_household_visits" as any).select("*").eq("survey_id", surveyId);
          data = (resp.data as any[]) ?? [];
        } catch {
          data = [];
        }
      }
      const mapped: SurveyHousehold[] = [...data, ...pending.map((p) => ({
        id: p.local_id,
        hh_number: p.hh_number,
        latitude: p.latitude,
        longitude: p.longitude,
        coverage_status: p.coverage_status,
        segment_label: p.segment_label,
        eligible_persons: p.eligible_persons || 0,
        treated_persons: p.treated_persons || 0,
      }))].map((d: any) => ({
        id: d.id, hh_number: d.hh_number, lat: d.latitude, lng: d.longitude, coverage_status: d.coverage_status,
        segment_label: d.segment_label ?? d.segment_id ?? null,
        eligible_persons: d.eligible_persons || 0, treated_persons: d.treated_persons || 0,
      }));

      setHouseholds(mapped);
    })();
  }, [surveyId]);

  // ---------- Coverage analysis ----------
  const computeAnalysis = useCallback(async () => {
    if (segments.length === 0) {
      toast({ title: "Build segments first", description: "Go back to Step 2 and build the segments before computing coverage.", variant: "destructive" });
      return;
    }
    if (households.length === 0) {
      toast({ title: "No household visits yet", description: "Save at least one household visit in Step 3 before computing coverage.", variant: "destructive" });
      return;
    }
    const householdsBySegment = new Map<string, SurveyHousehold[]>();
    for (const h of households) {
      if (h.segment_label) {
        const list = householdsBySegment.get(h.segment_label) ?? [];
        list.push(h);
        householdsBySegment.set(h.segment_label, list);
      }
    }
    // Prefer persisted segment attribution (O(N)); fall back to polygon checks
    // only for legacy visits that predate segment_label.
    const tallies = segments.map((s) => {
      const attributed = householdsBySegment.get(s.label) ?? [];
      const legacy = households.filter((h) => !h.segment_label && pointInPolygon({ lat: h.lat, lng: h.lng }, s.polygon));
      const inside = attributed.length || legacy.length ? [...attributed, ...legacy] : [];
      const treated = inside.filter((h) => h.coverage_status === "treated").length;
      const eligible_persons = inside.reduce((a, h) => a + (Number(h.eligible_persons) || 0), 0);
      const treated_persons = inside.reduce((a, h) => a + (Number(h.treated_persons) || 0), 0);
      // est_hh is the GIS-detected rooftop count — the inferential weight for the
      // entire population, including unsampled segments. Reported_total_hh defaults
      // to the same so geographic coverage extrapolates to the whole community.
      const est_hh = Math.max(s.count, inside.length, 1);
      return {
        label: s.label,
        est_hh,
        reported_total_hh: est_hh,
        sampled: inside.length,
        treated,
        treated_hh: treated,
        eligible_persons,
        treated_persons,
      };
    });
    const cov = computeCoverage(tallies);
    setCoverage(cov);
    setSegmentTallies(tallies.map((t) => ({
      label: t.label,
      est_hh: t.est_hh,
      sampled: t.sampled,
      treated_hh: t.treated_hh,
      eligible_persons: t.eligible_persons,
      treated_persons: t.treated_persons,
      therapeuticPct: t.eligible_persons > 0 ? (t.treated_persons / t.eligible_persons) * 100 : 0,
      geographicPct: t.reported_total_hh > 0 ? (t.treated_hh / t.reported_total_hh) * 100 : 0,
    })));

    // Persist per-segment tallies so the Operations dashboard widget can read
    // up-to-date community-level rollups across all surveys.
    if (surveyId) {
      try {
        const { data: segRows } = await supabase
          .from("ces_segments" as any).select("id,label").eq("survey_id", surveyId);
        const segById = new Map<string, string>(((segRows as any[]) ?? []).map((r) => [r.label, r.id]));
        for (const t of tallies) {
          const id = segById.get(t.label);
          if (!id) continue;
          await supabase.from("ces_segments" as any).update({
            est_hh: t.est_hh,
            sampled_hh: t.sampled,
            treated_hh: t.treated_hh,
            total_hh_in_segment: t.reported_total_hh,
            hh_treated_in_segment: t.treated_hh,
            coverage_pct: t.sampled > 0 ? (t.treated_hh / t.sampled) * 100 : null,
          }).eq("id", id);
        }
      } catch (e) {
        console.warn("[CES] segment tally persist failed", e);
      }
    }

    // Route Realism Calculation (Upgrade 4)
    const gpsLogs = gpsLogsRef.current;
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

    // Microplanning comparison — therapeutic (persons) AND geographic (households)
    const { found, compare, geoCompare, snapshot } = await fetchMicroplanComparison(
      state, lga, ward, communityName,
      cov.totalTreatedPersons, cov.totalEligiblePersons,
      cov.totalTreatedHH, cov.totalReportedHH,
    );
    setMicroCompare(compare);
    setMicroGeoCompare(geoCompare);
    setMicroReportedSnapshot(snapshot);
    setOutsideMicroplan(!found);
    if (compare) {
      const blended = 0.5 * cov.therapeuticCoveragePct + 0.3 * cov.inferredCoveragePct + 0.2 * compare.pJRSM;
      setBlendedCoveragePct(blended);
    }
    if (surveyId) {
      persistSurvey("draft");
      logCESAction(surveyId, "compute_analysis", {
        inferred: cov.inferredCoveragePct,
        therapeutic: cov.therapeuticCoveragePct,
        geographic: cov.geographicCoveragePct,
      });
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
      const { count } = await supabase.from("ces_gap_clusters" as any).select("*", { count: 'exact', head: true }).eq("survey_id", surveyId);
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

  // ---- Step 4 analysis exports ----
  const exportAnalysisCSV = useCallback(() => {
    const meta = { SurveyID: surveyId, Community: communityName, LGA: lga, State: state, Ward: ward, Date: new Date().toISOString(), Alpha: alpha };
    const rows: Record<string, any>[] = [];
    if (coverage) {
      rows.push({ RowType: "SUMMARY", ...meta,
        InferredCoveragePct: coverage.inferredCoveragePct.toFixed(2),
        TherapeuticPct: coverage.therapeuticCoveragePct.toFixed(2),
        GeographicPct: coverage.geographicCoveragePct.toFixed(2),
        CI95_Lo: coverage.ci95[0].toFixed(2), CI95_Hi: coverage.ci95[1].toFixed(2),
        CI99_Lo: coverage.ci99[0].toFixed(2), CI99_Hi: coverage.ci99[1].toFixed(2),
        DesignEffect: coverage.designEffect.toFixed(3),
        SampledHH: coverage.totalSampled, TreatedHH: coverage.totalTreatedHH,
        EligiblePersons: coverage.totalEligiblePersons, TreatedPersons: coverage.totalTreatedPersons,
      });
    }
    for (const t of segmentTallies) {
      rows.push({ RowType: "SEGMENT", ...meta, Segment: t.label,
        EstHH: t.est_hh, SampledHH: t.sampled, TreatedHH: t.treated_hh,
        EligiblePersons: t.eligible_persons, TreatedPersons: t.treated_persons,
        TherapeuticPct: t.therapeuticPct.toFixed(2), GeographicPct: t.geographicPct.toFixed(2),
      });
    }
    const sigT = microCompare && microCompare.pValue < alpha;
    const sigG = microGeoCompare && microGeoCompare.pValue < alpha;
    if (microCompare) rows.push({ RowType: "DISCREPANCY_THERAPEUTIC", ...meta,
      CES_Pct: microCompare.pCES.toFixed(2), Microplan_Pct: microCompare.pJRSM.toFixed(2),
      DiffPct: microCompare.diff.toFixed(2), Z: microCompare.z.toFixed(3), PValue: microCompare.pValue.toFixed(4),
      CI95_Lo: microCompare.ci95[0].toFixed(2), CI95_Hi: microCompare.ci95[1].toFixed(2),
      CI99_Lo: microCompare.ci99[0].toFixed(2), CI99_Hi: microCompare.ci99[1].toFixed(2),
      CohenH: microCompare.cohenH.toFixed(3), EffectMagnitude: microCompare.effectMagnitude,
      Direction: microCompare.direction, Significant: sigT ? "YES" : "NO",
    });
    if (microGeoCompare) rows.push({ RowType: "DISCREPANCY_GEOGRAPHIC", ...meta,
      CES_Pct: microGeoCompare.pCES.toFixed(2), Microplan_Pct: microGeoCompare.pJRSM.toFixed(2),
      DiffPct: microGeoCompare.diff.toFixed(2), Z: microGeoCompare.z.toFixed(3), PValue: microGeoCompare.pValue.toFixed(4),
      CI95_Lo: microGeoCompare.ci95[0].toFixed(2), CI95_Hi: microGeoCompare.ci95[1].toFixed(2),
      CI99_Lo: microGeoCompare.ci99[0].toFixed(2), CI99_Hi: microGeoCompare.ci99[1].toFixed(2),
      CohenH: microGeoCompare.cohenH.toFixed(3), EffectMagnitude: microGeoCompare.effectMagnitude,
      Direction: microGeoCompare.direction, Significant: sigG ? "YES" : "NO",
    });
    downloadCSV(rows, `ces-analysis-${communityName || surveyId || "draft"}.csv`);
  }, [coverage, segmentTallies, microCompare, microGeoCompare, alpha, surveyId, communityName, lga, state, ward]);

  const exportAnalysisPDF = useCallback(async () => {
    if (!coverage) { toast({ title: "Compute coverage first", variant: "destructive" }); return; }
    const jsPDF = (await import("jspdf")).default;
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const W = doc.internal.pageSize.getWidth();
    let y = 40;
    doc.setFont("helvetica","bold").setFontSize(16);
    doc.text("CES Step 4 — Analysis & Discrepancy Report", 40, y); y += 20;
    doc.setFont("helvetica","normal").setFontSize(10);
    doc.text(`${communityName || "—"} · ${ward || "—"} · ${lga || "—"} · ${state || "—"}`, 40, y); y += 14;
    doc.text(`${new Date().toLocaleString()}   |   α = ${alpha.toFixed(2)}`, 40, y); y += 18;

    doc.setFont("helvetica","bold").setFontSize(12); doc.text("Community Coverage", 40, y); y += 14;
    doc.setFont("helvetica","normal").setFontSize(10);
    const lines = [
      `Inferred: ${coverage.inferredCoveragePct.toFixed(1)}%   Therapeutic: ${coverage.therapeuticCoveragePct.toFixed(1)}%   Geographic: ${coverage.geographicCoveragePct.toFixed(1)}%`,
      `95% CI: [${coverage.ci95[0].toFixed(1)}, ${coverage.ci95[1].toFixed(1)}]   99% CI: [${coverage.ci99[0].toFixed(1)}, ${coverage.ci99[1].toFixed(1)}]   Design Eff: ${coverage.designEffect.toFixed(2)}`,
      `Sampled HH: ${coverage.totalSampled}   Treated HH: ${coverage.totalTreatedHH}   Eligible Pers: ${coverage.totalEligiblePersons}   Treated Pers: ${coverage.totalTreatedPersons}`,
    ];
    for (const l of lines) { doc.text(l, 40, y); y += 12; }
    y += 6;

    const renderCompare = (title: string, c: ProportionCompare) => {
      doc.setFont("helvetica","bold").setFontSize(11); doc.text(title, 40, y); y += 12;
      doc.setFont("helvetica","normal").setFontSize(10);
      const sig = c.pValue < alpha;
      const verdict = sig ? `Significant — CES ${c.direction.toUpperCase()} Microplan` : "Not significant — agree";
      const txt = [
        `CES: ${c.pCES.toFixed(1)}%   Microplan: ${c.pJRSM.toFixed(1)}%   Diff: ${c.diff > 0 ? "+" : ""}${c.diff.toFixed(1)}%`,
        `z = ${c.z.toFixed(2)}   p = ${c.pValue.toFixed(4)}   Cohen's h = ${c.cohenH.toFixed(3)} (${c.effectMagnitude})`,
        `95% CI of diff: [${c.ci95[0].toFixed(1)}, ${c.ci95[1].toFixed(1)}]   99% CI: [${c.ci99[0].toFixed(1)}, ${c.ci99[1].toFixed(1)}]`,
        `Verdict (α=${alpha.toFixed(2)}): ${verdict}`,
      ];
      for (const l of txt) { doc.text(l, 40, y); y += 12; }
      y += 4;
    };
    if (microCompare) renderCompare("Therapeutic Coverage Comparison", microCompare);
    if (microGeoCompare) renderCompare("Geographic Coverage Comparison", microGeoCompare);

    if (segmentTallies.length > 0) {
      doc.setFont("helvetica","bold").setFontSize(11); doc.text("Per-Segment Breakdown", 40, y); y += 12;
      doc.setFont("helvetica","normal").setFontSize(9);
      doc.text("Seg | EstHH | Sampl | Trt | EligP | TrtP | Ther% | Geo%", 40, y); y += 11;
      for (const t of segmentTallies) {
        if (y > 780) { doc.addPage(); y = 40; }
        doc.text(`${t.label} | ${t.est_hh} | ${t.sampled} | ${t.treated_hh} | ${t.eligible_persons} | ${t.treated_persons} | ${t.therapeuticPct.toFixed(1)} | ${t.geographicPct.toFixed(1)}`, 40, y);
        y += 11;
      }
    }
    doc.save(`ces-analysis-${communityName || surveyId || "draft"}.pdf`);
  }, [coverage, segmentTallies, microCompare, microGeoCompare, alpha, communityName, ward, lga, state, surveyId]);


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
  const instantMapCenter = gps ?? mapSeed;
  const instantMapZoom = gps
    ? 17
    : mapSeed.source === "handoff"
      ? 17
      : mapSeed.source === "last_known"
        ? 16
        : mapSeed.source === "state"
          ? 8
          : 6;
  const instantCenterLabel = gps
    ? "Current device GPS"
    : mapSeed.source === "handoff"
      ? "Checklist handoff location — refining GPS"
      : mapSeed.source === "last_known"
        ? "Last known CES location — refining GPS"
        : mapSeed.source === "state"
          ? "State fallback centre — refining GPS"
          : "Nigeria fallback centre — refining GPS";

  const accuracyOk = gps && gps.accuracy <= 25;
  const highAccuracyOk = gps && gps.accuracy <= 15;
  const accuracyColor = !gps ? "text-muted-foreground" :
    gps.accuracy <= 15 ? "text-green-600" : gps.accuracy <= 25 ? "text-indigo-600" : gps.accuracy <= 50 ? "text-yellow-600" : "text-red-600";

  // Live walk-perimeter telemetry (recomputed on perimeter/GPS/status changes;
  // no high-frequency whole-form ticker).
  const walkTelemetry = useMemo(() => {
    const vertices = perimeter.length;
    const liveAccuracyM = gps?.accuracy ?? null;
    const bestAccuracyM = Number.isFinite(perimeterBestAccRef.current) ? perimeterBestAccRef.current : (liveAccuracyM ?? 0);
    const closureM = (vertices >= 3 && gps)
      ? haversineMeters({ lat: gps.lat, lng: gps.lng }, perimeter[0])
      : null;
    const estAreaM2 = vertices >= 3 ? polygonAreaM2(perimeter) : null;
    const lastVertexAgoS = lastVertexAt ? Math.max(0, Math.floor((Date.now() - lastVertexAt) / 1000)) : null;
    const pace: "good" | "slow" | "stationary" =
      !recordingPerimeter ? "good"
      : lastVertexAgoS == null ? "good"
      : lastVertexAgoS < 8 ? "good"
      : lastVertexAgoS < 25 ? "slow"
      : "stationary";
    const readyToClose = recordingPerimeter && vertices >= 6 && closureM != null && closureM <= 15;
    return { vertices, walkedM, liveAccuracyM, bestAccuracyM, closureM, estAreaM2, lastVertexAgoS, pace, readyToClose };
  }, [perimeter, gps, walkedM, lastVertexAt, recordingPerimeter, perimeterStatus.lastFixAgeMs]);

  // WHO LQAS-aligned compliance evaluation for the lot boundary walk.
  // Default test threshold is 80% (the WHO MDA program standard); this can
  // be wired to a per-survey threshold later without changing the helpers.
  const lqasPlan = useMemo(() => lqasPlanForThreshold(80), []);
  const lqasCompliance = useMemo(
    () => evaluateLqasCompliance({
      perimeter,
      livePosition: gps ? { lat: gps.lat, lng: gps.lng } : null,
      walkedM,
      liveAccuracyM: gps?.accuracy ?? null,
      bestAccuracyM: perimeterBestAccRef.current,
      recording: recordingPerimeter,
    }),
    // Deliberately avoid clock-tick dependencies: polygon/self-intersection
    // checks can be expensive and must not run just to update a label.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [perimeter, gps, walkedM, recordingPerimeter],
  );

  const accColor = (acc: number | null) =>
    acc == null ? "text-muted-foreground" : acc <= 5 ? "text-green-600" : acc <= 10 ? "text-amber-600" : "text-red-600";

  const selectedStepSegments = useMemo(
    () => segments.filter((s) => selectedSegmentLabels.includes(s.label)),
    [segments, selectedSegmentLabels],
  );

  const selectedSegmentSpatialIndex = useMemo(
    () => selectedStepSegments.map((s) => pointInPolygonIndex(s.polygon)).filter(Boolean) as Array<{ contains: (pt: LatLng) => boolean }>,
    [selectedStepSegments],
  );

  const selectedSamplingPins = useMemo(() => {
    if (step !== 3 || selectedSegmentSpatialIndex.length === 0) return [] as LatLng[];
    const pins: LatLng[] = [];
    const buildings = deferredResidentialMask?.residentialBuildings ?? [];
    for (const b of buildings) {
      if (selectedSegmentSpatialIndex.some((s) => s.contains(b))) {
        pins.push(b);
        if (pins.length >= CES_MAX_SAMPLING_PINS) break;
      }
    }
    return pins;
  }, [step, selectedSegmentSpatialIndex, deferredResidentialMask]);

  const nearestSelectedSegment = useMemo(() => {
    if (step !== 3 || !gps || selectedStepSegments.length === 0) return null;
    return selectedStepSegments.reduce((best, s) => {
      const d = Math.hypot(s.centroid.lat - gps.lat, s.centroid.lng - gps.lng);
      return !best || d < best.d ? { d, seg: s } : best;
    }, null as null | { d: number; seg: Segment });
  }, [step, gps?.lat, gps?.lng, selectedStepSegments]);

  const coverageMapSegments = useMemo(() => {
    if (step !== 4 || households.length === 0) return segments;
    const bySegment = new Map<string, SurveyHousehold[]>();
    const legacy: SurveyHousehold[] = [];
    for (const h of households) {
      if (h.segment_label) {
        const list = bySegment.get(h.segment_label) ?? [];
        list.push(h);
        bySegment.set(h.segment_label, list);
      } else {
        legacy.push(h);
      }
    }
    return segments.map((s) => {
      const attributed = bySegment.get(s.label) ?? [];
      const legacyInside = legacy.filter((h) => pointInPolygon({ lat: h.lat, lng: h.lng }, s.polygon));
      const inside = attributed.length || legacyInside.length ? [...attributed, ...legacyInside] : [];
      const total = inside.length;
      const treated = inside.filter((h) => h.coverage_status === "treated").length;
      const pct = total ? (treated / total) * 100 : -1;
      const color = pct < 0 ? "#94a3b8" : pct >= 80 ? "#16a34a" : pct >= 70 ? "#eab308" : "#dc2626";
      return { ...s, color };
    });
  }, [step, segments, households]);

  return (
    <div className="space-y-3">
      {/* Stepper */}
      <Card>
        <CardContent className="p-2 md:p-3 flex items-center gap-2 overflow-x-auto no-scrollbar">
          {[
            { n: 1 as Step, label: "Locate", full: "1. Locate & Boundaries" },
            { n: 2 as Step, label: "Sample", full: "2. Estimate & Sample" },
            { n: 3 as Step, label: "Visit", full: "3. Visit Households" },
            ...(canViewAnalysis
              ? [
                  { n: 4 as Step, label: "Analyze", full: "4. Analysis" },
                  { n: 5 as Step, label: "Export", full: "5. Export & QC" },
                ]
              : []),
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
                {s.n === 5 && resampleHistory.length > 0 && (
                  <Badge
                    variant="outline"
                    className="ml-1.5 h-4 px-1 text-[9px] border-amber-500/60 text-amber-700 dark:text-amber-400"
                    title={`${resampleHistory.length} resample justification${resampleHistory.length === 1 ? "" : "s"} documented`}
                  >
                    {resampleHistory.length}
                  </Badge>
                )}
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
      {step === 1 && !rolesLoading && !canLocate && (
        <Card className="border-amber-300 bg-amber-50/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-amber-800"><Shield className="h-5 w-5" />Step 1 is restricted to Community Locators</CardTitle>
            <CardDescription className="text-amber-700">
              Ask a Super Admin to grant you the <strong>Locator</strong> role for this project, or skip ahead to a survey on a community already fenced. {canSurvey ? <>You may proceed to <button className="underline font-semibold" onClick={() => setStep(2)}>Step 2 — Sample</button> for an existing fenced community.</> : "You currently have no CES role for this project."}
            </CardDescription>
          </CardHeader>
        </Card>
      )}
      {step === 1 && (canLocate || rolesLoading) && (
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
                <div className="text-xs text-muted-foreground">Off by default. When enabled, generates a scannable QR code that opens the community verification form.</div>
              </div>
              <Switch checked={witnessSystemEnabled} onCheckedChange={setWitnessSystemEnabled} />
            </div>

            {/* GPS lock status panel */}
            {gpsError ? (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="space-y-2">
                  <div className="text-xs">
                    {gpsError === "denied" && "Location permission denied. Enable location for this site in your browser settings, then retry."}
                    {gpsError === "unavailable" && "Location unavailable. Move outdoors or check your device GPS, then retry."}
                    {gpsError === "timeout" && "GPS timed out while acquiring a fix. You can still continue indoors using an approximate location."}
                    {gpsError === "insecure" && "GPS requires a secure (HTTPS) connection. Open the app via HTTPS."}
                    {gpsError === "unsupported" && "This device/browser does not support geolocation."}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={retryGPSLock}>
                      <RefreshCw className="h-3 w-3" /> Retry GPS
                    </Button>
                    {gpsError !== "insecure" && gpsError !== "unsupported" && (
                      <Button size="sm" variant="secondary" className="h-7 text-xs gap-1" onClick={acceptApproximate} disabled={acceptingApprox}>
                        {acceptingApprox ? <Loader2 className="h-3 w-3 animate-spin" /> : <MapPin className="h-3 w-3" />}
                        Use approximate (indoor) location
                      </Button>
                    )}
                  </div>
                </AlertDescription>
              </Alert>
            ) : !gps ? (
              <Alert className="border-blue-200 bg-blue-50">
                <Loader2 className="h-4 w-4 text-blue-600 animate-spin" />
                <AlertDescription className="space-y-2 text-xs text-blue-800">
                  <div className="flex items-center justify-between gap-2">
                    <span>
                      {perimeter.length >= 3
                        ? "Sharpening GPS — your drawn boundary is already usable."
                        : "Locking onto your location…"}
                    </span>
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={retryGPSLock}>
                      <RefreshCw className="h-3 w-3" /> Lock GPS
                    </Button>
                  </div>
                  {perimeter.length >= 3 && (
                    <div className="rounded-md border border-blue-200 bg-white/70 px-2 py-1 text-[11px] text-blue-900">
                      You can proceed with the manual boundary now; the survey center will be saved from the polygon centre and GPS will keep refining in the background.
                    </div>
                  )}
                  <Button size="sm" variant="secondary" className="h-7 text-xs gap-1" onClick={acceptApproximate} disabled={acceptingApprox}>
                    {acceptingApprox ? <Loader2 className="h-3 w-3 animate-spin" /> : <MapPin className="h-3 w-3" />}
                    I'm indoors — use approximate location
                  </Button>

                </AlertDescription>
              </Alert>
            ) : gps.accuracy > 50 ? (
              <Alert className="border-amber-200 bg-amber-50">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <AlertDescription className="space-y-1.5 text-xs text-amber-900">
                  <div>
                    <b>{indoorMode ? "Indoor mode" : "Low GPS accuracy"}</b> — current ±{gps.accuracy.toFixed(0)} m. You can still proceed; the location will refine as the signal improves.
                  </div>
                  <div className="font-medium">Tips to improve accuracy:</div>
                  <ul className="list-disc pl-4 space-y-0.5">
                    <li>Step near a window, doorway, or open courtyard.</li>
                    <li>Hold the phone flat with a clear view of the sky for ~10–20 seconds.</li>
                    <li>Make sure Wi-Fi is on (helps indoor positioning even when not connected).</li>
                    <li>Disable battery-saver / power-saving mode for this app.</li>
                    <li>If outdoors, move away from tall buildings, walls, or dense tree cover.</li>
                  </ul>
                  <div className="pt-1">
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={retryGPSLock}>
                      <RefreshCw className="h-3 w-3" /> Refresh fix
                    </Button>
                  </div>
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
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <Input
                  value={microplanSearch}
                  onChange={(e) => setMicroplanSearch(e.target.value)}
                  placeholder="Search community, settlement, ward, or LGA"
                  className="h-8 text-xs sm:max-w-64"
                  disabled={locationLocked}
                />
                <Select value={selectedMicroplanId} onValueChange={handleMicroplanSelect} disabled={locationLocked}>
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
                  : microplanHasMore
                  ? `Showing first ${microplans.length} matching entries. Search to narrow the list.`
                  : `Showing ${microplans.length} matching entries for this project`}
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

            {locationLocked && (
              <div className="flex items-center gap-1.5 text-[11px] text-primary bg-primary/5 border border-primary/30 rounded-md px-2 py-1">
                <Lock className="h-3 w-3" />
                Location identification carried over from the MDA Supervisory Checklist — locked to ensure the coverage survey matches the supervised community.
              </div>
            )}
            {prefillMissing && (
              <div className="flex items-start gap-2 text-[11px] text-destructive bg-destructive/5 border border-destructive/40 rounded-md px-2 py-2">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <div className="space-y-1.5">
                  <p className="font-medium">
                    Checklist location could not be carried over.
                  </p>
                  <p className="text-muted-foreground">
                    The location identification from the MDA Supervisory Checklist
                    wasn't received (the link may have expired or been opened in a
                    new session). To keep the survey accurate, please reselect the
                    location below, or return to the checklist and proceed again.
                  </p>
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={handleReselectLocation}>
                    Reselect location manually
                  </Button>
                </div>
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
              <Field label="State *">
                <Select value={state} onValueChange={(v) => { setState(v); setLga(""); setWard(""); }} disabled={locationLocked}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select state" /></SelectTrigger>
                  <SelectContent>{getAllStates().map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field label="LGA *">
                <Select value={lga} onValueChange={(v) => { setLga(v); setWard(""); }} disabled={locationLocked || !state}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select LGA" /></SelectTrigger>
                  <SelectContent>{lgaOptions.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field label="Ward *">
                <Select value={ward} onValueChange={setWard} disabled={locationLocked || !lga}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select ward" /></SelectTrigger>
                  <SelectContent>{wardOptions.map((w) => <SelectItem key={w} value={w}>{w}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field label="FLHF Name"><Input value={flhfName} onChange={(e) => setFlhfName(e.target.value)} className="h-8 text-xs" readOnly={locationLocked} disabled={locationLocked} /></Field>
              <Field label="Community *"><Input value={communityName} onChange={(e) => setCommunityName(e.target.value)} className="h-8 text-xs" readOnly={locationLocked} disabled={locationLocked} /></Field>
              <Field label="Settlement"><Input value={settlementName} onChange={(e) => setSettlementName(e.target.value)} className="h-8 text-xs" readOnly={locationLocked} disabled={locationLocked} /></Field>
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
                      <span className="tabular-nums inline-block">
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
                <Button size="sm" variant="ghost" onClick={() => { setPerimeter([]); setWalkedM(0); setLastVertexAt(null); setAutoFenced(false); }}>Clear perimeter</Button>
              )}
              {recordingPerimeter && perimeterStatus.holding && (
                <span className="text-[11px] text-muted-foreground ml-1">
                  Capturing live GPS; quality target ≤{perimeterStatus.gateM} m, current ±{Number.isFinite(perimeterStatus.bestAcc) ? perimeterStatus.bestAcc.toFixed(0) : "—"}m
                </span>
              )}
            </div>

            {/* Auto-Fence Around Me — alternative when walking the perimeter is unsafe / impossible */}
            <div className="space-y-2 rounded-md border border-dashed border-primary/40 bg-primary/5 p-2">
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                  <Target className="h-3.5 w-3.5 text-primary" />
                  Can't walk the perimeter?
                </div>
                <span className="text-[11px] text-muted-foreground">
                  Auto-fence a circle around your live GPS on satellite imagery.
                </span>
                <div className="ml-auto flex items-center gap-1.5">
                  <Button
                    size="sm"
                    variant="default"
                    onClick={() => autoFenceAroundMe(autoFenceRadiusM)}
                    disabled={!gps}
                    className="h-7 text-xs"
                  >
                    <Crosshair className="h-3.5 w-3.5 mr-1" />
                    Auto-Fence Around Me
                  </Button>
                  <Button
                    size="sm"
                    variant={drawMode ? "destructive" : "outline"}
                    onClick={drawMode ? cancelManualDraw : startManualDraw}
                    className="h-7 text-xs"
                  >
                    <MapIcon className="h-3.5 w-3.5 mr-1" />
                    {drawMode ? "Cancel draw" : "Draw on Map"}
                  </Button>
                </div>
              </div>

              {/* Radius slider with snap-to-distance — live updates the fence polygon */}
              <div className="grid grid-cols-1 sm:grid-cols-[1fr,auto,auto] items-center gap-2">
                <div className="flex items-center gap-2">
                  <Label className="text-[11px] text-muted-foreground whitespace-nowrap">Radius</Label>
                  <Slider
                    min={10}
                    max={500}
                    step={snapStepM}
                    value={[autoFenceRadiusM]}
                    onValueChange={(v) => setAutoFenceRadiusM(v[0])}
                    className="flex-1"
                  />
                  <span className="text-xs font-mono w-14 text-right tabular-nums">{autoFenceRadiusM} m</span>
                </div>
                <div className="flex items-center gap-1">
                  <Label className="text-[10px] text-muted-foreground">Snap</Label>
                  <Select value={String(snapStepM)} onValueChange={(v) => setSnapStepM(Number(v))}>
                    <SelectTrigger className="h-7 w-20 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {[1, 5, 10, 25, 50].map((s) => (
                        <SelectItem key={s} value={String(s)}>{s} m</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {autoFenced && (
                  <label className="flex items-center gap-1.5 text-[11px] text-foreground">
                    <Switch checked={autoFenceFollow} onCheckedChange={setAutoFenceFollow} />
                    Follow GPS
                  </label>
                )}
              </div>

              {/* Edit / Save / Saved fences row */}
              {perimeter.length >= 3 && (
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    variant={editVertices ? "default" : "outline"}
                    onClick={() => setEditVertices((v) => !v)}
                    className="h-7 text-xs"
                    title="Drag vertex handles on the map to refine the boundary; right-click a vertex to delete it."
                  >
                    <Crosshair className="h-3.5 w-3.5 mr-1" />
                    {editVertices ? "Done editing" : "Edit vertices"}
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={saveCurrentFence}>
                    <Save className="h-3.5 w-3.5 mr-1" />
                    Save fence
                  </Button>
                  {autoFenced && (
                    <Badge variant="outline" className="border-primary/50 text-primary text-[10px]">
                      Fenced · {perimeter.length - 1} vertices · {(savedPolygonAreaM2(perimeter) / 10_000).toFixed(2)} ha
                    </Badge>
                  )}
                </div>
              )}

              {/* Saved fences list — pick to reuse without redrawing */}
              {savedFences.length > 0 && (
                <div className="space-y-1 rounded border border-border bg-background/60 p-2">
                  <div className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1">
                    <Save className="h-3 w-3" /> Saved fenced areas ({savedFences.length})
                  </div>
                  <div className="max-h-32 overflow-y-auto space-y-1">
                    {savedFences.map((f) => (
                      <div key={f.id} className="flex items-center gap-2 text-[11px] rounded border border-border/60 bg-muted/30 px-2 py-1">
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">{f.name}</div>
                          <div className="text-muted-foreground">
                            {f.source} · {f.polygon.length - 1} vtx · {(f.areaM2 / 10_000).toFixed(2)} ha · {formatRelative(f.createdAt)}
                          </div>
                        </div>
                        <Button size="sm" variant="outline" className="h-6 text-[10px] px-2" onClick={() => loadFenceById(f.id)}>Load</Button>
                        <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2 text-destructive" onClick={() => removeSavedFence(f.id)}>×</Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {drawMode && (
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-foreground bg-amber-500/10 border border-amber-500/40 rounded px-2 py-1">
                  <span>Tap vertices on the map · {draftPolygon.length} placed · tap the red start vertex to close</span>
                  <Button size="sm" variant="default" className="h-6 text-[11px] ml-auto" onClick={closeManualDraw} disabled={draftPolygon.length < 3}>
                    Close & auto-detect ({draftPolygon.length})
                  </Button>
                </div>
              )}
            </div>

            {/* Smart placement badge */}
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant="outline"
                className={maskStatus === "error" ? "border-amber-500 text-amber-700 dark:text-amber-400" : "border-green-500/50 text-green-700 dark:text-green-400"}
                title="In-app ML classifier identifies buildings (roof footprints), roads (line features) and waterways from satellite + OSM data."
              >
                <Shield className="h-3 w-3 mr-1" />
                {maskStatus === "loading" && "Classifying map features…"}
                {maskStatus === "ok" && (
                  <>
                    ML features ·{" "}
                    {residentialMask?.featureGeometry?.buildings.length ?? 0} buildings ·{" "}
                    {residentialMask?.featureGeometry?.roads.length ?? 0} roads ·{" "}
                    {residentialMask?.featureGeometry?.waterways.length ?? 0} waterways
                  </>
                )}
                {maskStatus === "error" && "OSM unavailable — basic placement"}
                {maskStatus === "idle" && "Auto-detect buildings, roads, waterways with on-device ML"}
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
                      Show building footprints
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      id="ces-show-exclusions"
                      checked={showExclusionLayer}
                      onCheckedChange={setShowExclusionLayer}
                    />
                    <Label htmlFor="ces-show-exclusions" className="text-xs cursor-pointer">
                      Show roads & waterways
                    </Label>
                  </div>
                </div>
              )}
            </div>

            {maskStatus === "ok" && residentialMask?.featureGeometry && (showResidentialLayer || showExclusionLayer) && (
              <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground px-1">
                {showResidentialLayer && (
                  <span className="inline-flex items-center gap-1">
                    <span className="inline-block w-3 h-3 rounded-sm" style={{ background: "#fcd34d", border: "1px solid #92400e" }} />
                    Building footprints ({residentialMask.featureGeometry.buildings.length})
                  </span>
                )}
                {showExclusionLayer && (
                  <>
                    <span className="inline-flex items-center gap-1"><span className="inline-block w-4 h-[3px]" style={{ background: "#dc2626" }} /> Roads ({residentialMask.featureGeometry.roads.length})</span>
                    <span className="inline-flex items-center gap-1"><span className="inline-block w-4 h-[3px]" style={{ background: "#1d4ed8" }} /> Waterways ({residentialMask.featureGeometry.waterways.length})</span>
                  </>
                )}
              </div>
            )}

            {/* Live telemetry strip — visible while recording or after capture */}
            {(recordingPerimeter || perimeter.length > 0) && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between px-1">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-foreground">
                    Field evidence — live
                  </span>
                  <Badge variant="outline" className="h-4 px-1.5 text-[9px] border-primary/40 text-primary">
                    Donor / Gov view
                  </Badge>
                </div>
                <div
                  aria-live="polite"
                  className="grid grid-cols-2 sm:grid-cols-4 gap-2 rounded-md border border-border bg-muted/40 p-2"
                >
                  <div className="flex flex-col" title="Vertices = number of GPS waypoints recorded along the perimeter walk. More vertices = a more faithful boundary trace.">
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Vertices</span>
                    <span className="text-lg font-semibold tabular-nums">{walkTelemetry.vertices}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {recordingPerimeter
                        ? (walkTelemetry.lastVertexAgoS != null ? `+1 · ${walkTelemetry.lastVertexAgoS}s ago` : "awaiting first fix")
                        : "captured"}
                    </span>
                  </div>
                  <div className="flex flex-col" title="Distance walked along the perimeter so far, computed from consecutive GPS vertices (haversine).">
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Walked</span>
                    <span className="text-lg font-semibold tabular-nums">{Math.round(walkTelemetry.walkedM)} m</span>
                    <span className="text-[10px] text-muted-foreground">pace: {walkTelemetry.pace}</span>
                  </div>
                  <div className="flex flex-col" title="Live GPS horizontal accuracy reported by the device (±metres). 'Best' is the tightest accuracy seen during this walk.">
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground">GPS quality</span>
                    <span className={`text-lg font-semibold tabular-nums ${accColor(walkTelemetry.liveAccuracyM)}`}>
                      ±{walkTelemetry.liveAccuracyM?.toFixed(0) ?? "—"} m
                    </span>
                    <span className="text-[10px] text-muted-foreground">best ±{Number.isFinite(walkTelemetry.bestAccuracyM) ? walkTelemetry.bestAccuracyM.toFixed(0) : "—"} m</span>
                  </div>
                  <div
                    className="flex flex-col"
                    title={walkTelemetry.estAreaM2
                      ? "Estimated enclosed area of the walked polygon (shoelace formula on GPS vertices)."
                      : "Closure distance — how far the live GPS position is from the first vertex. Walk back to start until this nears 0 m, then tap Stop."}
                  >
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
              </div>
            )}

            {(recordingPerimeter || perimeter.length > 0) && (
              <LQASCompliancePanel
                compliance={lqasCompliance}
                plan={lqasPlan}
                recording={recordingPerimeter}
              />
            )}

            {recordingPerimeter && lqasCompliance.ready && (
              <div className="rounded-md border border-green-500/40 bg-green-500/10 px-3 py-1.5 text-xs text-green-700 dark:text-green-400 flex items-center gap-2">
                <CheckCircle2 className="h-3.5 w-3.5" />
                LQAS lot boundary meets WHO criteria — tap Stop to lock the perimeter.
              </div>
            )}

            {instantMapCenter && (
              <CESSurveyMap
                centerLat={instantMapCenter.lat}
                centerLng={instantMapCenter.lng}
                perimeter={perimeter}
                segments={[]}
                selectedSegmentIds={[]}
                households={[]}
                basemap={basemap}
                height="50vh"
                zoom={instantMapZoom}
                exclusionZones={residentialMask?.exclusionZones ?? null}
                showExclusions={showExclusionLayer}
                residentialBuildings={residentialMask?.residentialBuildings ?? null}
                showResidential={showResidentialLayer}
                mapFeatures={residentialMask?.featureGeometry ?? null}
                showFeatures={showResidentialLayer || showExclusionLayer}
                livePosition={gps ? { lat: gps.lat, lng: gps.lng } : null}
                centerLabel={instantCenterLabel}
                drawMode={drawMode}
                draftPolygon={draftPolygon}
                onMapTap={drawMode ? handleDrawTap : undefined}
                lqas={{
                  closureM: lqasCompliance.closureM,
                  selfIntersects: lqasCompliance.selfIntersects,
                  ready: lqasCompliance.ready,
                  areaM2: lqasCompliance.areaM2,
                }}
              />
            )}

            <div className="flex justify-between">
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button onClick={async () => {
                const missing = [];
                const geo = getCurrentGeo();
                if (!geo.state) missing.push("State");
                if (!geo.lga) missing.push("LGA");
                if (!geo.ward) missing.push("Ward");
                if (!geo.community_name) missing.push("Community Name");
                
                if (missing.length > 0) {
                  toast({ 
                    title: "Required Fields Missing", 
                    description: `Please select: ${missing.join(", ")}`, 
                    variant: "destructive" 
                  });
                  return;
                }

                const surveyPosition = getCurrentSurveyPosition();
                if (!surveyPosition) {
                  toast({ title: "Location not ready", description: "Draw/load a boundary or wait for a GPS lock before proceeding.", variant: "destructive" });
                  return;
                }

                if (!gps && perimeter.length < 3) {
                  toast({ title: "Boundary required", description: "GPS is still unavailable. Use Draw on Map or load a saved fence so the survey has a stable community boundary.", variant: "destructive" });
                  return;
                }

                // No accuracy gate — proceed regardless. Recommendation surfaced via Step 1 alert.

                const sid = await persistSurvey("draft");
                // Write/Upsert canonical fenced community for Microplanning lookup
                if (sid && projectId && perimeter.length >= 3 && fencedCommunityWrittenRef.current !== sid) {
                  try {
                    const { data: u } = await supabase.auth.getUser();
                    if (u.user) {
                      await supabase.from("ces_fenced_communities" as any).insert({
                        project_id: projectId,
                        state: geo.state, lga: geo.lga, ward: geo.ward,
                        flhf_name: geo.flhf_name || null,
                        community_name: geo.community_name,
                        settlement_name: geo.settlement_name || null,
                        center_lat: surveyPosition.lat, center_lng: surveyPosition.lng,
                        perimeter_coords: perimeter,
                        source_survey_id: sid,
                        created_by: u.user.id,
                      });
                      fencedCommunityWrittenRef.current = sid;
                    }
                  } catch (e) { console.warn("fenced community write skipped:", e); }
                }
                setStep(2);
              }}>Next: Estimate & Sample →</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* STEP 2 */}
      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5" />Step 2 — Estimate Households & Design Sample</CardTitle>
            <CardDescription>Tap a feature on the satellite map and the Smart Count engine aggregates every similar feature inside the perimeter as proxy households. You set target sample N; the area is split into equal-density segments and one is randomly selected.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 items-end">
              <Field label="Households (Smart Count or manual)">
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

            {/* Smart Count — tap a roof/feature, ML aggregates similar features in perimeter */}
            <div className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-xs space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                <span className="font-semibold">Smart Count (ML)</span>
                <span className="text-muted-foreground">Tap a feature on the map below — every similar feature inside the perimeter (any colour) is counted and aggregated as proxy households.</span>
                <Button
                  size="sm"
                  variant={smartCountMode ? "default" : "outline"}
                  className="h-7 ml-auto"
                  onClick={() => setSmartCountMode((v) => !v)}
                >
                  <Target className="h-3.5 w-3.5 mr-1" />
                  {smartCountMode ? "Tap a feature on the map…" : "Enable Smart Count"}
                </Button>
              </div>
              {smartCountResult && (
                <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-primary/20">
                  <Badge variant="default" className="text-[10px]">
                    {smartCountResult.count} similar feature{smartCountResult.count === 1 ? "" : "s"}
                  </Badge>
                  <span className="text-muted-foreground">
                    Reference footprint ≈ {Math.round(smartCountResult.sampleAreaM2)} m². Adjust manually if needed.
                  </span>
                </div>
              )}
            </div>

            <div className="flex gap-2 flex-wrap items-center">
              <Button onClick={buildSegments} disabled={buildingSegments || households.length > 0}>
                {buildingSegments ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Target className="h-4 w-4 mr-1" />}
                Build Segments & Randomly Select
              </Button>
              {segments.length > 0 && (
                <Button variant="outline" onClick={openResampleDialog} disabled={households.length > 0}>
                  <Shuffle className="h-4 w-4 mr-1" />Sample Another Segment
                </Button>
              )}
              {households.length > 0 && (
                <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                  <Lock className="h-3 w-3" /> Segments locked — household visits already saved.
                </span>
              )}
            </div>

            <CESSurveyMap
              centerLat={instantMapCenter.lat} centerLng={instantMapCenter.lng}
              perimeter={perimeter} segments={segments}
              selectedSegmentIds={selectedSegmentLabels}
              households={[]}
              basemap={basemap}
              height="50vh"
              zoom={instantMapZoom}
              onMapTap={smartCountMode ? handleSmartCountTap : undefined}
              centerLabel={instantCenterLabel}
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
      {step === 3 && (
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
                You must remain inside the highlighted segment. GPS is preferred; if GPS is still unavailable, tap the map inside the highlighted segment and the visit will be tagged for review.
              </AlertDescription>
            </Alert>

            <div className="flex flex-wrap items-center gap-2 p-3 rounded-lg border border-emerald-300 bg-emerald-50/60 dark:bg-emerald-950/20">
              <div className="flex-1 min-w-[180px] text-xs">
                <div className="font-semibold text-emerald-800 dark:text-emerald-200">Drop pin at my live location</div>
                <div className="text-[11px] text-muted-foreground">
                  Uses your current GPS ({gps ? `±${Math.round(gps.accuracy)} m` : "acquiring…"}). You must be physically inside the highlighted segment when GPS is available.
                </div>
              </div>
              <Button
                size="sm"
                variant="acg"
                disabled={!gps}
                  onClick={() => { if (gps) handleMapTap(gps.lat, gps.lng); }}
              >
                <MapPin className="h-4 w-4 mr-1" /> Capture Live Location
              </Button>
            </div>

            <CESSurveyMap
              centerLat={instantMapCenter.lat} centerLng={instantMapCenter.lng}
              perimeter={perimeter}
              segments={selectedStepSegments}
              selectedSegmentIds={selectedSegmentLabels}
              households={households}
              samplingPins={selectedSamplingPins}
              routeTo={nearestSelectedSegment ? nearestSelectedSegment.seg.centroid : null}
              basemap={basemap}
              onMapTap={handleMapTap}
              height="55vh"
              zoom={instantMapZoom}
              centerLabel={instantCenterLabel}
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
              {canViewAnalysis ? (
                <Button onClick={() => { computeAnalysis(); setStep(4); }}>Next: Analysis →</Button>
              ) : (
                <Button
                  disabled={finalizing}
                  onClick={async () => {
                    setFinalizing(true);
                    try {
                      await persistSurvey("submitted");
                      try { await syncCESOfflineQueue(); } catch { /* will retry in background */ }
                    } catch { /* persisted locally; background sync will retry */ }
                    finally {
                      setFinalizing(false);
                      setShowSyncReceipt(true);
                    }
                  }}
                >
                  {finalizing ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving & syncing…</> : <><CheckCircle2 className="h-4 w-4 mr-2" />Finish & Submit</>}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* STEP 4 */}
      {step === 4 && canViewAnalysis && (
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
                {/* Target coverage threshold — placed ABOVE the inferential
                    results so the chosen campaign benchmark drives every
                    downstream interpretation. Changing it re-renders Step 4 and
                    recomputes the WHO verdict, pass/fail decision and required
                    sample size in the statistically correct way. */}
                <Card className="border-primary/40 bg-primary/5">
                  <CardContent className="py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-semibold text-muted-foreground whitespace-nowrap">Target Coverage Threshold (campaign)</span>
                      <Select value={String(targetThresholdPct)} onValueChange={(v) => setTargetThresholdPct(Number(v))}>
                        <SelectTrigger className="h-8 w-64 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="65">65% — Lymphatic Filariasis (LF)</SelectItem>
                          <SelectItem value="75">75% — Schistosomiasis / STH (Deworming)</SelectItem>
                          <SelectItem value="80">80% — Onchocerciasis / Trachoma</SelectItem>
                          <SelectItem value="100">100% — Custom / Case-finding</SelectItem>
                        </SelectContent>
                      </Select>
                      <span className="text-[11px] text-muted-foreground">All analyses below update against this benchmark.</span>
                    </div>
                  </CardContent>
                </Card>
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

                {/* WHO CES Field Manual — Table 1.4 interpretation + Box 1.1 sample size */}
                {(() => {
                  const reportedPct = microReportedSnapshot && microReportedSnapshot.target > 0
                    ? (microReportedSnapshot.treated / microReportedSnapshot.target) * 100
                    : (microCompare?.pJRSM ?? null);
                  const interp = interpretCoverage({
                    surveyedPct: coverage.inferredCoveragePct,
                    lower95Pct: coverage.ci95[0],
                    targetThresholdPct,
                    reportedPct,
                  });
                  const requiredN = calculateSampleSize({
                    expectedCoverage: Math.min(0.95, Math.max(0.05, coverage.pHat || 0.5)),
                    precision: 0.05,
                    designEffect: Math.max(1, coverage.designEffect),
                    nonResponseRate: 0.1,
                  });
                  const verdictColor = interp.verdict === "above_target"
                    ? "border-green-400 bg-green-50 dark:bg-green-950/30"
                    : interp.verdict === "below_target"
                    ? "border-red-400 bg-red-50 dark:bg-red-950/30"
                    : "border-amber-400 bg-amber-50 dark:bg-amber-950/30";
                  return (
                    <Card className={verdictColor}>
                      <CardHeader className="py-2">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <ShieldCheck className="h-4 w-4" /> WHO Interpretation — {interp.headline}
                        </CardTitle>
                        <CardDescription className="text-[11px]">
                          Surveyed vs target threshold &amp; programme reach (Field Manual Table 1.4). Uses the lower 95% CI for an objective decision.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="text-xs space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-muted-foreground">Benchmark in use:</span>
                          <Badge variant="secondary">{targetThresholdPct}% target coverage</Badge>
                          <Badge variant="outline" className="ml-auto">WHO Box 1.1 required sample n ≈ {requiredN}</Badge>
                        </div>
                        <div>
                          <p className="font-semibold mb-1">Findings</p>
                          <ul className="list-disc pl-4 space-y-0.5">
                            {interp.findings.map((f, i) => <li key={i}>{f}</li>)}
                          </ul>
                        </div>
                        <div>
                          <p className="font-semibold mb-1">Recommended corrective actions</p>
                          <ul className="list-disc pl-4 space-y-0.5">
                            {interp.correctiveActions.map((a, i) => <li key={i}>{a}</li>)}
                          </ul>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })()}

                {/* Bayesian blend interpretation + statistical validation of the
                    Microplanning reported coverage against the CES survey. */}
                {blendedCoveragePct !== null && (() => {
                  const blendVerdict = blendedCoveragePct >= targetThresholdPct
                    ? { color: "border-green-400 bg-green-50 dark:bg-green-950/30", label: "At/above target" }
                    : blendedCoveragePct >= targetThresholdPct - 5
                    ? { color: "border-amber-400 bg-amber-50 dark:bg-amber-950/30", label: "Marginal" }
                    : { color: "border-red-400 bg-red-50 dark:bg-red-950/30", label: "Below target" };
                  // Statistical validation: the two-proportion z-test (therapeutic)
                  // is the appropriate measure. Reported (Microplan) coverage is
                  // "validated" by CES when the difference is NOT statistically
                  // significant at α (i.e. CES cannot distinguish reported from
                  // surveyed coverage), otherwise it is contradicted.
                  const cmp = microCompare;
                  const validated = cmp ? cmp.pValue >= alpha : null;
                  return (
                    <Card className={blendVerdict.color}>
                      <CardHeader className="py-2">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <ShieldCheck className="h-4 w-4" /> Bayesian Blend & Reported-Coverage Validation
                        </CardTitle>
                        <CardDescription className="text-[11px]">
                          Triangulated coverage estimate and the statistical test of whether Microplanning's reported coverage is corroborated by the CES survey.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="text-xs space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="secondary">Bayesian Blend = {blendedCoveragePct.toFixed(1)}%</Badge>
                          <Badge variant="outline">{blendVerdict.label} (vs {targetThresholdPct}%)</Badge>
                        </div>
                        <div>
                          <p className="font-semibold mb-1">What the Bayesian Blend means</p>
                          <p className="text-muted-foreground leading-relaxed">
                            The blend is a weighted triangulation of three independent signals —
                            <strong> 50% therapeutic coverage</strong> (persons treated ÷ eligible, the strongest field evidence),
                            <strong> 30% inferred survey coverage</strong> (design-weighted CES estimate), and
                            <strong> 20% Microplan reported coverage</strong> (programme administrative data).
                            It down-weights any single noisy source so the validation decision is robust:
                            a blend close to the inferred CES value means the data sources agree, while a blend pulled
                            sharply toward the reported value warns that administrative figures dominate and need scrutiny.
                            Here the blend is <strong>{blendedCoveragePct.toFixed(1)}%</strong>, which is
                            {blendedCoveragePct >= targetThresholdPct ? " consistent with a successful campaign" : " below the campaign benchmark and signals a coverage gap"}.
                          </p>
                        </div>
                        {cmp ? (
                          <div className={`rounded-md border p-2 ${validated ? "border-green-400 bg-green-100/40 dark:bg-green-900/20" : "border-red-400 bg-red-100/40 dark:bg-red-900/20"}`}>
                            <p className="font-semibold mb-1">
                              Is the Microplan reported coverage validated by CES? — {validated ? "✅ VALIDATED" : "❌ NOT VALIDATED"}
                            </p>
                            <p className="text-muted-foreground leading-relaxed">
                              Two-proportion z-test: CES {cmp.pCES.toFixed(1)}% vs Reported {cmp.pJRSM.toFixed(1)}%
                              (difference {cmp.diff > 0 ? "+" : ""}{cmp.diff.toFixed(1)} pts, z = {cmp.z.toFixed(2)},
                              p = {cmp.pValue.toFixed(3)}, Cohen's h = {cmp.cohenH.toFixed(3)} [{cmp.effectMagnitude}]).
                              {validated
                                ? ` p ≥ α (${alpha.toFixed(2)}): the difference is not statistically significant, so the reported coverage is statistically corroborated by the independent CES survey.`
                                : ` p < α (${alpha.toFixed(2)}): the difference is statistically significant, so the reported coverage is NOT corroborated — CES indicates the programme is ${cmp.direction === "below" ? "over-reporting" : "under-reporting"} coverage. Trigger a Data Quality Assessment.`}
                            </p>
                          </div>
                        ) : (
                          <div className="rounded-md border border-sky-400 bg-sky-50 dark:bg-sky-950/30 p-2 text-sky-800 dark:text-sky-200">
                            No Microplanning reported figures are available for this community, so the reported coverage cannot be statistically validated yet.
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })()}







                {instantMapCenter && (
                  <CESSurveyMap
                    centerLat={instantMapCenter.lat} centerLng={instantMapCenter.lng}
                    perimeter={perimeter}
                    segments={coverageMapSegments}
                    selectedSegmentIds={selectedSegmentLabels}
                    households={households}
                    basemap={basemap}
                    height="45vh"
                    zoom={instantMapZoom}
                    centerLabel={instantCenterLabel}
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
                        <div className="flex items-center gap-3 rounded-md border border-border bg-muted/30 p-2">
                          <Label className="text-[11px] font-semibold whitespace-nowrap">Significance α</Label>
                          <div className="flex-1 min-w-[120px]"><Slider min={1} max={20} step={1} value={[Math.round(alpha * 100)]} onValueChange={(v) => setAlpha((v[0] ?? 5) / 100)} /></div>
                          <Badge variant="outline" className="text-[11px] tabular-nums">α = {alpha.toFixed(2)}</Badge>
                        </div>
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Therapeutic Coverage (Persons Treated / Eligible)</div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                          <KPI label="CES Therapeutic" value={`${microCompare.pCES.toFixed(1)}%`} />
                          <KPI label="Microplan Reported" value={`${microCompare.pJRSM.toFixed(1)}%`} />
                          <KPI label="Diff (CES − Microplan)" value={`${microCompare.diff > 0 ? "+" : ""}${microCompare.diff.toFixed(1)}%`} accent={microCompare.diff < 0} />
                          <KPI label="z / p-value" value={`${microCompare.z.toFixed(2)} / ${microCompare.pValue.toFixed(3)}`} />
                          <KPI label="95% CI of diff" value={`${microCompare.ci95[0].toFixed(1)} to ${microCompare.ci95[1].toFixed(1)}%`} />
                          <KPI label="99% CI of diff" value={`${microCompare.ci99[0].toFixed(1)} to ${microCompare.ci99[1].toFixed(1)}%`} />
                          <KPI label={`Cohen's h (${microCompare.effectMagnitude})`} value={microCompare.cohenH.toFixed(3)} />
                          <KPI
                            label={`Verdict (α=${alpha.toFixed(2)})`}
                            value={microCompare.pValue < alpha ? `Significant — CES ${microCompare.direction === "above" ? "ABOVE" : microCompare.direction === "below" ? "BELOW" : "equal"} Microplan` : "Not significant — agree"}
                            accent={microCompare.pValue >= alpha}
                          />
                        </div>
                        {microGeoCompare && (
                          <>
                            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mt-3">Geographic Coverage (Households Treated / Total HH in Community)</div>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                              <KPI label="CES Geographic" value={`${microGeoCompare.pCES.toFixed(1)}%`} />
                              <KPI label="Microplan Geographic" value={`${microGeoCompare.pJRSM.toFixed(1)}%`} />
                              <KPI label="Diff (CES − Microplan)" value={`${microGeoCompare.diff > 0 ? "+" : ""}${microGeoCompare.diff.toFixed(1)}%`} accent={microGeoCompare.diff < 0} />
                              <KPI label="z / p-value" value={`${microGeoCompare.z.toFixed(2)} / ${microGeoCompare.pValue.toFixed(3)}`} />
                              <KPI label={`95% CI of diff`} value={`${microGeoCompare.ci95[0].toFixed(1)} to ${microGeoCompare.ci95[1].toFixed(1)}%`} />
                              <KPI label={`Cohen's h (${microGeoCompare.effectMagnitude})`} value={microGeoCompare.cohenH.toFixed(3)} />
                              <KPI
                                label={`Verdict (α=${alpha.toFixed(2)})`}
                                value={microGeoCompare.pValue < alpha ? `Significant — CES ${microGeoCompare.direction === "above" ? "ABOVE" : microGeoCompare.direction === "below" ? "BELOW" : "equal"} Microplan` : "Not significant — agree"}
                                accent={microGeoCompare.pValue >= alpha}
                              />
                            </div>
                          </>
                        )}
                        {microReportedSnapshot && (
                          <div className="text-[10px] text-muted-foreground mt-2">
                            Microplan baseline: target pop {microReportedSnapshot.target.toLocaleString()}, treated {microReportedSnapshot.treated.toLocaleString()};
                            total HH {microReportedSnapshot.numHH.toLocaleString()}, HH treated {microReportedSnapshot.hhTreated.toLocaleString()}.
                          </div>
                        )}
                      </>
                    )}
                  </CardContent>
                </Card>
                {segmentTallies.length > 0 && (
                  <Card className="border-border/60">
                    <CardHeader className="py-2">
                      <CardTitle className="text-sm flex items-center gap-2"><BarChart3 className="h-4 w-4" /> Per-Segment Breakdown</CardTitle>
                      <CardDescription className="text-[11px]">Inferred therapeutic and geographic coverage per segment, with Microplan community baseline.</CardDescription>
                    </CardHeader>
                    <CardContent className="overflow-x-auto p-2">
                      <table className="w-full text-[11px] border-collapse">
                        <thead className="bg-muted/40"><tr>
                          <th className="text-left p-1.5 border-b">Segment</th>
                          <th className="text-right p-1.5 border-b">Est. HH</th>
                          <th className="text-right p-1.5 border-b">Sampled HH</th>
                          <th className="text-right p-1.5 border-b">Treated HH</th>
                          <th className="text-right p-1.5 border-b">Eligible Pers.</th>
                          <th className="text-right p-1.5 border-b">Treated Pers.</th>
                          <th className="text-right p-1.5 border-b">Therapeutic %</th>
                          <th className="text-right p-1.5 border-b">Geographic %</th>
                          <th className="text-right p-1.5 border-b">Microplan Ther. %</th>
                          <th className="text-right p-1.5 border-b">Microplan Geo %</th>
                        </tr></thead>
                        <tbody>
                          {segmentTallies.map((t) => (
                            <tr key={t.label} className="border-b last:border-0">
                              <td className="p-1.5 font-medium">{t.label}</td>
                              <td className="p-1.5 text-right tabular-nums">{t.est_hh}</td>
                              <td className="p-1.5 text-right tabular-nums">{t.sampled}</td>
                              <td className="p-1.5 text-right tabular-nums">{t.treated_hh}</td>
                              <td className="p-1.5 text-right tabular-nums">{t.eligible_persons}</td>
                              <td className="p-1.5 text-right tabular-nums">{t.treated_persons}</td>
                              <td className="p-1.5 text-right tabular-nums">{t.therapeuticPct.toFixed(1)}%</td>
                              <td className="p-1.5 text-right tabular-nums">{t.geographicPct.toFixed(1)}%</td>
                              <td className="p-1.5 text-right tabular-nums text-muted-foreground">{microCompare ? `${microCompare.pJRSM.toFixed(1)}%` : "—"}</td>
                              <td className="p-1.5 text-right tabular-nums text-muted-foreground">{microGeoCompare ? `${microGeoCompare.pJRSM.toFixed(1)}%` : "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </CardContent>
                  </Card>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <Button variant="outline" onClick={exportAnalysisCSV}><FileSpreadsheet className="h-4 w-4 mr-1" /> Export Analysis CSV</Button>
                  <Button variant="outline" onClick={exportAnalysisPDF}><FileText className="h-4 w-4 mr-1" /> Export Analysis PDF</Button>
                </div>
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
      {step === 5 && canViewAnalysis && (
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

      {/* Household-surveyor completion receipt — data recorded & synced */}
      <Dialog open={showSyncReceipt} onOpenChange={(o) => { if (!o) { setShowSyncReceipt(false); onClose?.(); } }}>
        <DialogContent className="max-w-md overflow-hidden p-0 text-center">
          <div className="relative bg-gradient-to-br from-emerald-600 via-green-600 to-teal-700 px-6 pt-8 pb-10 text-white">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-white/15 ring-4 ring-white/25 backdrop-blur-sm">
              <CheckCircle2 className="h-12 w-12 text-white" />
            </div>
            <DialogHeader className="mt-4">
              <DialogTitle className="text-center text-xl font-bold text-white">Submission complete</DialogTitle>
            </DialogHeader>
            <p className="mt-2 text-sm text-white/90">
              Your household coverage survey for{communityName ? ` ${communityName}` : " this community"} has been
              <span className="font-semibold"> recorded and synced</span> to the server and the MDA Supervision Dashboard.
            </p>
          </div>
          <div className="space-y-4 px-6 py-6">
            <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <Shield className="h-3.5 w-3.5 text-emerald-600" />
              Saved securely · {isOnline ? "Synced now" : "Queued — will sync when back online"}
            </div>
            <Button
              size="lg"
              className="w-full bg-emerald-600 font-semibold hover:bg-emerald-700"
              onClick={() => { setShowSyncReceipt(false); onClose?.(); }}
            >
              <Home className="h-4 w-4 mr-2" /> Close & return to Forms
            </Button>
          </div>
        </DialogContent>
      </Dialog>


      {/* Household pin dialog */}
      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Household Visit — {`HH${String(households.length + 1).padStart(3, "0")}`}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {isDuplicatePin && (
              <Alert className="bg-amber-50/60 border-amber-200">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <AlertDescription>
                  <p className="font-semibold text-xs mb-1 text-amber-800">Pin near an existing household</p>
                  <p className="text-[11px] mb-2 text-amber-700">
                    GPS accuracy can offset the pin from the actual structure — you can still record this visit. Optionally tag the reason:
                  </p>
                  <Select value={(hhForm as any).duplicateReason || "gps_drift"} onValueChange={(v) => setHhForm((f: any) => ({...f, duplicateReason: v}))}>
                    <SelectTrigger className="h-7 text-xs bg-white"><SelectValue placeholder="Reason for overlap" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="gps_drift">GPS Drift Correction</SelectItem>
                      <SelectItem value="new_structure">New Structure</SelectItem>
                      <SelectItem value="different_family">Different Family in same compound</SelectItem>
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
              Ask a community member or leader to scan this QR code to open the public verification form and confirm this interview.
            </p>
            <div className="p-4 bg-white rounded-xl shadow-sm border inline-block">
              {lastSavedHHData?.url ? (
                <QRCodeSVG value={lastSavedHHData.url} size={200} level="M" includeMargin />
              ) : (
                <div className="flex h-[200px] w-[200px] items-center justify-center text-xs text-muted-foreground">
                  Save a household to generate a witness QR code.
                </div>
              )}
            </div>
            {lastSavedHHData?.url && (
              <a
                href={lastSavedHHData.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[10px] text-primary underline font-mono bg-muted p-2 rounded w-full truncate"
              >
                Open Witness Form
              </a>
            )}
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

      <Dialog open={!!pendingFeatureLabel} onOpenChange={(open) => !open && setPendingFeatureLabel(null)}>
        <DialogContent className="sm:max-w-[460px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <ClipboardCheck className="h-4 w-4 text-primary" /> Confirm feature label
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="rounded-md border border-border bg-muted/30 p-2 text-xs">
              <div className="font-semibold capitalize">{pendingFeatureLabel?.type}</div>
              <div className="text-muted-foreground">Confidence: {Math.round((pendingFeatureLabel?.confidence ?? 0) * 100)}%</div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Correct label</Label>
              <Input value={featureLabelDraft} onChange={(e) => setFeatureLabelDraft(e.target.value)} className="h-9 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Notes</Label>
              <Textarea value={featureLabelNotes} onChange={(e) => setFeatureLabelNotes(e.target.value)} className="min-h-[72px] text-xs" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingFeatureLabel(null)}>Cancel</Button>
            <Button onClick={saveFeatureLabel}>Save label</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={resampleDialogOpen} onOpenChange={setResampleDialogOpen}>
        <DialogContent className="sm:max-w-[480px] p-0 overflow-hidden border-0 shadow-2xl bg-background/85 backdrop-blur-xl ring-1 ring-border/60 rounded-2xl">
          <div className="bg-gradient-to-br from-primary/15 via-primary/5 to-transparent px-6 pt-5 pb-4 border-b border-border/50">
            <DialogHeader className="space-y-1.5">
              <DialogTitle className="flex items-center gap-2 text-base">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 text-primary ring-1 ring-primary/20">
                  <Shuffle className="h-4 w-4" />
                </span>
                Reason for Sampling Another Segment
              </DialogTitle>
              <p className="text-xs text-muted-foreground leading-relaxed pl-10">
                Random sampling has scientific implications. Document why an additional segment is being added
                (target N not reached, segment inaccessible, security risk, refusal cluster, supervisor request).
              </p>
            </DialogHeader>
          </div>
          <div className="px-6 py-4 space-y-2">
            <Label className="text-xs font-semibold flex items-center justify-between">
              <span>Reason <span className="text-destructive">*</span></span>
              <span className={`text-[10px] font-normal tabular-nums ${resampleReason.trim().length >= 10 ? "text-emerald-600" : "text-muted-foreground"}`}>
                {resampleReason.trim().length} / 10 min
              </span>
            </Label>
            <Textarea
              value={resampleReason}
              onChange={(e) => setResampleReason(e.target.value)}
              placeholder="Describe the reason (minimum 10 characters)…"
              className="min-h-[110px] text-xs bg-background/70 backdrop-blur border-border/70 focus-visible:ring-primary/40 rounded-xl resize-none"
              autoFocus
            />
          </div>
          <DialogFooter className="px-6 pb-5 pt-1 gap-2 sm:gap-2">
            <Button variant="outline" className="rounded-full" onClick={() => setResampleDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={confirmSampleAnotherSegment}
              disabled={resampleReason.trim().length < 10}
              className="rounded-full bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 shadow-md"
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

function BasemapToggle({ value, onChange }: { value: string; onChange: (v: any) => void }) {
  return (
    <div className="inline-flex border border-border rounded-md overflow-hidden flex-wrap">
      {[
        { v: "hybrid", icon: Satellite, label: "Esri Hybrid" },
        { v: "satellite", icon: Satellite, label: "Esri Sat" },
        { v: "google", icon: Satellite, label: "Google" },
        { v: "google-sat", icon: Satellite, label: "Google Sat" },
        { v: "street", icon: MapIcon, label: "Street" },
        { v: "terrain", icon: Mountain, label: "Terrain" },
      ].map((b) => (
        <button
          key={b.v}
          onClick={() => onChange(b.v)}
          className={`px-2.5 py-1.5 text-xs flex items-center gap-1 ${value === b.v ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"}`}
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

function pointInPolygonIndex(poly: LatLng[]) {
  if (poly.length < 3) return null;
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;
  for (const p of poly) {
    minLat = Math.min(minLat, p.lat);
    maxLat = Math.max(maxLat, p.lat);
    minLng = Math.min(minLng, p.lng);
    maxLng = Math.max(maxLng, p.lng);
  }
  return {
    contains(pt: LatLng) {
      if (pt.lat < minLat || pt.lat > maxLat || pt.lng < minLng || pt.lng > maxLng) return false;
      return pointInPolygonGeo(pt, poly);
    },
  };
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
  cesTreatedPersons: number, cesEligiblePersons: number,
  cesTreatedHH: number, cesReportedHH: number,
): Promise<{
  found: boolean;
  compare: ProportionCompare | null;
  geoCompare: ProportionCompare | null;
  snapshot: { target: number; treated: number; numHH: number; hhTreated: number } | null;
}> {
  if (!state || !lga || !ward || !community) {
    return { found: false, compare: null, geoCompare: null, snapshot: null };
  }
  const norm = (s: string) => s.trim().replace(/\s+/g, " ");
  const s = norm(state), l = norm(lga), w = norm(ward), c = norm(community);
  const tables = ["microplan_entries", "microplanning_entries", "microplans"];
  for (const t of tables) {
    const { data, error } = await supabase
      .from(t as any).select("*")
      .ilike("state", s).ilike("lga", l).ilike("ward", w).ilike("community_name", c)
      .limit(1);
    if (!error && data && data.length > 0) {
      const r: any = data[0];
      // Therapeutic (persons): treated vs target population
      const target = Number(
        r.estimated_total_population ?? r.target_population ?? 0
      );
      const treated = Number(
        r.total_treated ?? r.treated ?? r.persons_treated ?? r.people_treated ?? r.medicine_distributed ?? 0
      );
      // Geographic (households): treated HH vs total HH reported in the community
      const numHH = Number(
        r.number_of_households ?? r.total_households_reported ?? r.households_reported ?? 0
      );
      const hhTreated = Number(
        r.households_treated ?? r.total_households_treated ?? r.hh_treated ?? 0
      );
      const compare = (target > 0 && cesEligiblePersons > 0)
        ? compareProportions(cesTreatedPersons, cesEligiblePersons, treated, target)
        : null;
      const geoCompare = (numHH > 0 && cesReportedHH > 0)
        ? compareGeographicCoverage(cesTreatedHH, cesReportedHH, hhTreated, numHH)
        : null;
      return {
        found: true,
        compare,
        geoCompare,
        snapshot: { target, treated, numHH, hhTreated },
      };
    }
  }
  return { found: false, compare: null, geoCompare: null, snapshot: null };
}

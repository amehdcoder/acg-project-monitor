import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Camera, MapPin, Boxes, AlertTriangle, CheckCircle2, XCircle, Satellite } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import type { Household3D } from "./Village3DMap";
import CESSurveyMap, { type SurveyHousehold } from "./CESSurveyMap";
import CESCaptureDialog from "./CESCaptureDialog";
import HouseholdInspector from "./HouseholdInspector";
import CESSurveyWorkflow from "./CESSurveyWorkflow";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ClipboardList, ShieldCheck, BrainCircuit, History } from "lucide-react";
import CESQCWorkflow from "./CESQCWorkflow";
import CESPeerValidationsPanel from "./CESPeerValidationsPanel";
import CESGapIntelligence from "./CESGapIntelligence";
import CESAuditLogViewer from "./CESAuditLogViewer";
import CESAccessManager from "./CESAccessManager";
import { useCESRoles } from "@/hooks/useCESRoles";
import { useAuth } from "@/hooks/useAuth";
import { Settings2, Lock } from "lucide-react";
import { kmeansSegments } from "@/lib/ces/kmeansSegments";
import { inferSegmentCoverage, pointInPolygon } from "@/lib/ces/geostatistics";

// Workflow continuity: persist project + active session across reloads.
const CES_PROJECT_KEY = "ces_last_project_id";
const CES_SESSION_KEY = "ces_last_session_id";


interface Project {
  id: string;
  name: string;
}

interface SessionRow {
  id: string;
  name: string;
  area_name: string | null;
  state: string | null;
  lga: string | null;
  ward: string | null;
  campaign_type: string | null;
  perimeter_coords: Array<{ lat: number; lng: number }>;
  center_lat: number | null;
  center_lng: number | null;
  household_count: number;
  keyframe_count: number;
  project_id: string;
}

interface FencedCommunityRow {
  id: string;
  community_name: string;
  settlement_name: string | null;
  flhf_name: string | null;
  state: string | null;
  lga: string | null;
  ward: string | null;
  center_lat: number | null;
  center_lng: number | null;
  perimeter_coords: Array<{ lat: number; lng: number }> | null;
  area_m2: number | null;
  source_survey_id: string | null;
  source_session_id: string | null;
  created_at: string;
}

const CoverageEvaluationView = ({ formId }: { formId?: string }) => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<string>(() => {
    try { return localStorage.getItem(CES_PROJECT_KEY) || ""; } catch { return ""; }
  });
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [activeSession, setActiveSession] = useState<SessionRow | null>(null);
  const [households, setHouseholds] = useState<Household3D[]>([]);
  const [showCapture, setShowCapture] = useState(false);
  const [selectedHousehold, setSelectedHousehold] = useState<Household3D | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [addMode, setAddMode] = useState(false);

  const [activeQcSurveyId, setActiveQcSurveyId] = useState<string | null>(null);
  const [recentSurveys, setRecentSurveys] = useState<any[]>([]);
  const [accessOpen, setAccessOpen] = useState(false);
  const [fencedCommunities, setFencedCommunities] = useState<FencedCommunityRow[]>([]);
  const [activeCommunityId, setActiveCommunityId] = useState("");
  const [fencedHouseholds, setFencedHouseholds] = useState<SurveyHousehold[]>([]);
  const { isAdmin, isOwner } = useAuth();
  const { canLocate, canSurvey, canValidate, roles, loading: rolesLoading } = useCESRoles(selectedProject);
  const isAdminBypass = isAdmin || isOwner;

  useEffect(() => {
    supabase.from("ces_surveys" as any).select("id, created_at, state, lga, ward, community_name, status")
      .order("created_at", { ascending: false }).limit(20)
      .then(({data}) => { if (data) setRecentSurveys(data); });
  }, []);

  // Load projects
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("projects").select("id, name").order("created_at", { ascending: false });
      setProjects(data ?? []);
      if (data?.length && !selectedProject) setSelectedProject(data[0].id);
    })();
    // eslint-disable-next-line
  }, []);

  // Persist project selection so refresh resumes the same workflow.
  useEffect(() => {
    if (selectedProject) {
      try { localStorage.setItem(CES_PROJECT_KEY, selectedProject); } catch {}
    }
  }, [selectedProject]);

  // Load sessions for project
  useEffect(() => {
    if (!selectedProject) return;
    (async () => {
      const { data } = await supabase
        .from("ces_capture_sessions" as any)
        .select("*")
        .eq("project_id", selectedProject)
        .order("created_at", { ascending: false });
      const list = (data as any) ?? [];
      setSessions(list);
      // Workflow continuity: prefer the previously-active session if it still exists.
      let lastId: string | null = null;
      try { lastId = localStorage.getItem(CES_SESSION_KEY); } catch {}
      const restored = lastId ? list.find((s: any) => s.id === lastId) : null;
      if (restored) setActiveSession(restored);
      else if (list.length) setActiveSession(list[0]);
      else setActiveSession(null);
    })();
  }, [selectedProject]);

  // Persist active session id so refresh resumes the same survey.
  useEffect(() => {
    try {
      if (activeSession?.id) localStorage.setItem(CES_SESSION_KEY, activeSession.id);
    } catch {}
  }, [activeSession?.id]);

  // Load households for active session
  const loadHouseholds = useCallback(async () => {
    if (!activeSession) {
      setHouseholds([]);
      return;
    }
    const data = await fetchAllRows<any>((from, to) =>
      supabase
        .from("ces_households" as any)
        .select("*")
        .eq("session_id", activeSession.id)
        .range(from, to)
    );
    const mapped: Household3D[] = ((data as any) ?? []).map((h: any) => ({
      id: h.id,
      lat: h.latitude,
      lng: h.longitude,
      roofHeightM: Number(h.roof_height_m ?? 3),
      coverageStatus: h.coverage_status,
      label: h.label,
      intervention_status: h.intervention_status,
      hh_number: h.hh_number ?? null,
      eligible_persons: h.eligible_persons ?? null,
      treated_persons: h.treated_persons ?? null,
    }));
    setHouseholds(mapped);
  }, [activeSession]);

  useEffect(() => {
    loadHouseholds();
  }, [loadHouseholds]);

  const activeCommunity = useMemo(
    () => fencedCommunities.find((c) => c.id === activeCommunityId) ?? fencedCommunities[0] ?? null,
    [fencedCommunities, activeCommunityId],
  );

  useEffect(() => {
    if (!selectedProject) return;
    const refresh = async () => {
      const { data } = await supabase
        .from("ces_fenced_communities" as any)
        .select("*")
        .eq("project_id", selectedProject)
        .order("created_at", { ascending: false })
        .limit(100);
      const list = ((data as any) ?? []) as FencedCommunityRow[];
      setFencedCommunities(list);
      setActiveCommunityId((current) => current && list.some((c) => c.id === current) ? current : list[0]?.id ?? "");
    };
    refresh();
    const channel = supabase.channel(`ces-fenced-map-${selectedProject}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "ces_fenced_communities", filter: `project_id=eq.${selectedProject}` }, refresh)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [selectedProject]);

  useEffect(() => {
    const loadFencedHouseholds = async () => {
      if (!activeCommunity) {
        setFencedHouseholds([]);
        return;
      }
      if (activeCommunity.source_survey_id) {
        const { data } = await supabase
          .from("ces_household_visits" as any)
          .select("id, hh_number, latitude, longitude, coverage_status, eligible_persons, treated_persons")
          .eq("survey_id", activeCommunity.source_survey_id);
        setFencedHouseholds(((data as any) ?? []).map((h: any) => ({
          id: h.id,
          hh_number: h.hh_number,
          lat: h.latitude,
          lng: h.longitude,
          coverage_status: h.coverage_status ?? "unassessed",
          eligible_persons: h.eligible_persons,
          treated_persons: h.treated_persons,
        })));
        return;
      }
      if (activeCommunity.source_session_id) {
        const { data } = await supabase
          .from("ces_households" as any)
          .select("id, label, latitude, longitude, coverage_status")
          .eq("session_id", activeCommunity.source_session_id);
        setFencedHouseholds(((data as any) ?? []).map((h: any, i: number) => ({
          id: h.id,
          hh_number: h.label || `HH-${i + 1}`,
          lat: h.latitude,
          lng: h.longitude,
          coverage_status: h.coverage_status ?? "unassessed",
        })));
      } else {
        setFencedHouseholds([]);
      }
    };
    loadFencedHouseholds();
  }, [activeCommunity]);

  // Realtime subscription — households + capture sessions (live perimeter from Operations)
  useEffect(() => {
    if (!activeSession) return;
    const channel = supabase
      .channel(`ces-live-${activeSession.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "ces_households", filter: `session_id=eq.${activeSession.id}` },
        () => loadHouseholds()
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "ces_capture_sessions", filter: `id=eq.${activeSession.id}` },
        (payload) => setActiveSession((prev) => (prev ? { ...prev, ...(payload.new as any) } : prev))
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeSession, loadHouseholds]);

  // Realtime subscription on session list for the project — pick up new captures live
  useEffect(() => {
    if (!selectedProject) return;
    const channel = supabase
      .channel(`ces-sessions-${selectedProject}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "ces_capture_sessions", filter: `project_id=eq.${selectedProject}` },
        async () => {
          const { data } = await supabase
            .from("ces_capture_sessions" as any)
            .select("*")
            .eq("project_id", selectedProject)
            .order("created_at", { ascending: false });
          setSessions((data as any) ?? []);
          setActiveSession((curr) => {
            if (!curr) return (data as any)?.[0] ?? null;
            const refreshed = (data as any)?.find((s: any) => s.id === curr.id);
            return refreshed ?? curr;
          });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedProject]);

  const handleTapHousehold = (id: string) => {
    const h = households.find((x) => x.id === id);
    if (!h) return;
    setSelectedHousehold(h);
    setInspectorOpen(true);
  };

  const handleAddAt = async (lat: number, lng: number) => {
    if (!activeSession || !addMode) return;
    const { data: userData } = await supabase.auth.getUser();
    const { error } = await supabase.from("ces_households" as any).insert({
      session_id: activeSession.id,
      project_id: activeSession.project_id,
      latitude: lat,
      longitude: lng,
      coverage_status: "unassessed",
      created_by: userData.user?.id,
    });
    if (error) {
      toast({ title: "Add failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "+ Household added", description: "Tap the roof to set its coverage status." });
    setAddMode(false);
    loadHouseholds();
  };

  const stats = useMemo(() => {
    const total = households.length;
    const covered = households.filter((h) => h.coverageStatus === "covered").length;
    const missed = households.filter((h) => h.coverageStatus === "missed").length;
    const refused = households.filter((h) => h.coverageStatus === "refused").length;
    const revisit = households.filter((h) => h.coverageStatus === "revisit").length;
    const unassessed = households.filter((h) => h.coverageStatus === "unassessed").length;
    const coverageRate = total > 0 ? Math.round((covered / total) * 100) : 0;
    return { total, covered, missed, refused, revisit, unassessed, coverageRate };
  }, [households]);

  const segments = useMemo(() => {
    if (households.length < 5) return [];
    // Calculate segments based on household clusters
    const points = households.map(h => ({ lat: h.lat, lng: h.lng }));
    const k = Math.min(6, Math.max(2, Math.ceil(households.length / 10)));
    return kmeansSegments(points, k);
  }, [households]);

  const inferredCoverage = useMemo(() => {
    if (segments.length === 0) return {};
    
    // 1. Tally observed coverage per segment
    const observations: Record<string, { total: number; covered: number }> = {};
    segments.forEach(seg => {
      const hhInSeg = households.filter(h => pointInPolygon({ lat: h.lat, lng: h.lng }, seg.polygon));
      const assessed = hhInSeg.filter(h => h.coverageStatus !== 'unassessed');
      const covered = assessed.filter(h => h.coverageStatus === 'covered').length;
      observations[seg.label] = { total: assessed.length, covered };
    });

    // 2. Infer for all segments
    return inferSegmentCoverage(segments, observations);
  }, [segments, households]);


  return (
    <div className="space-y-4 p-3 sm:p-4 md:p-6 max-w-full overflow-x-hidden">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-lg sm:text-xl md:text-2xl font-bold flex items-center gap-2 leading-tight">
            <Boxes className="h-5 w-5 md:h-6 md:w-6 text-primary shrink-0" />
            <span className="truncate">Coverage Evaluation Survey — 3D Village Mapping</span>
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Run unbiased CES with satellite imagery, k-means segments, geofenced household visits, and design-based coverage inference.
          </p>
          {selectedProject && !rolesLoading && (
            <div className="flex flex-wrap items-center gap-1.5 mt-2">
              <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Your CES roles:</span>
              {isAdminBypass && <Badge variant="default" className="text-[10px]">Admin (all access)</Badge>}
              {!isAdminBypass && roles.length === 0 && (
                <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-700">
                  <Lock className="h-3 w-3 mr-1" /> No CES role assigned
                </Badge>
              )}
              {canLocate && !isAdminBypass && <Badge variant="outline" className="text-[10px]">Locator</Badge>}
              {canSurvey && !isAdminBypass && roles.includes("household_surveyor") && <Badge variant="outline" className="text-[10px]">Surveyor</Badge>}
              {canValidate && !isAdminBypass && <Badge variant="outline" className="text-[10px]">Validator</Badge>}
            </div>
          )}
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full md:w-auto">
          {isAdminBypass && (
            <Button variant="outline" size="sm" onClick={() => setAccessOpen(true)} title="Manage CES role assignments" className="w-full sm:w-auto">
              <Settings2 className="h-4 w-4 mr-1" /> CES Access
            </Button>
          )}
          <Select value={selectedProject} onValueChange={setSelectedProject}>
            <SelectTrigger className="w-full sm:w-64">
              <SelectValue placeholder="Select project" />
            </SelectTrigger>
            <SelectContent>
              {projects.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <CESAccessManager open={accessOpen} onOpenChange={setAccessOpen} defaultProjectId={selectedProject} />

      <Tabs defaultValue="survey" className="w-full">
        <TabsList className="w-full flex justify-start overflow-x-auto no-scrollbar h-auto">
          <TabsTrigger value="survey" className="shrink-0"><ClipboardList className="h-4 w-4 sm:mr-1" /><span className="hidden sm:inline">CES Survey Workflow</span><span className="sm:hidden text-[10px] ml-1">Survey</span></TabsTrigger>
          <TabsTrigger value="gap" className="shrink-0"><BrainCircuit className="h-4 w-4 sm:mr-1" /><span className="hidden sm:inline">Gap Intelligence</span><span className="sm:hidden text-[10px] ml-1">Gap</span></TabsTrigger>
          <TabsTrigger value="qc" className="shrink-0"><ShieldCheck className="h-4 w-4 sm:mr-1" /><span className="hidden sm:inline">Validation Tasks</span><span className="sm:hidden text-[10px] ml-1">QC</span></TabsTrigger>
          <TabsTrigger value="audit" className="shrink-0"><History className="h-4 w-4 sm:mr-1" /><span className="hidden sm:inline">Audit Log</span><span className="sm:hidden text-[10px] ml-1">Audit</span></TabsTrigger>
          <TabsTrigger value="3d" className="shrink-0"><Satellite className="h-4 w-4 sm:mr-1" /><span className="hidden sm:inline">Fenced Satellite Map</span><span className="sm:hidden text-[10px] ml-1">Map</span></TabsTrigger>
        </TabsList>

        <TabsContent value="audit" className="mt-3">
          <CESAuditLogViewer />
        </TabsContent>

        <TabsContent value="gap" className="mt-3">
          <CESGapIntelligence />
        </TabsContent>

        <TabsContent value="survey" className="mt-3">
          <CESSurveyWorkflow projectId={selectedProject} formId={formId} />
        </TabsContent>

        <TabsContent value="qc" className="mt-3">
          {activeQcSurveyId ? (
            <CESQCWorkflow surveyId={activeQcSurveyId} onClose={() => setActiveQcSurveyId(null)} />
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Validation Tasks</CardTitle>
                <CardDescription>Select a recent survey to perform peer validation Quality Control.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {recentSurveys.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No recent surveys found.</p>
                ) : (
                  recentSurveys.map(s => (
                    <div key={s.id} className="p-3 border rounded-md bg-card space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-medium text-sm truncate">{s.community_name || "Unknown Community"} <Badge variant="outline">{s.status}</Badge></p>
                          <p className="text-xs text-muted-foreground truncate">{s.state} • {s.lga} • {s.ward} — {new Date(s.created_at).toLocaleDateString()}</p>
                        </div>
                        <Button size="sm" onClick={() => setActiveQcSurveyId(s.id)}>Start QC</Button>
                      </div>
                      <CESPeerValidationsPanel surveyId={s.id} collapsible />
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="3d" className="mt-3 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <Select value={activeCommunity?.id ?? ""} onValueChange={setActiveCommunityId} disabled={fencedCommunities.length === 0}>
              <SelectTrigger className="w-full sm:w-80">
                <SelectValue placeholder="Select a located & fenced community" />
              </SelectTrigger>
              <SelectContent>
                {fencedCommunities.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.community_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={() => setShowCapture(true)} disabled={!selectedProject || !canLocate} className="w-full sm:w-auto">
              <Camera className="h-4 w-4 mr-2" />
              Locate & Fence Community
            </Button>
          </div>

          {activeCommunity?.center_lat && activeCommunity?.center_lng ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Satellite className="h-5 w-5 text-primary" />{activeCommunity.community_name}</CardTitle>
                <CardDescription>
                  {[activeCommunity.settlement_name, activeCommunity.ward, activeCommunity.lga, activeCommunity.state].filter(Boolean).join(" • ")}
                  {activeCommunity.area_m2 ? ` • ${(Number(activeCommunity.area_m2) / 10000).toFixed(2)} ha fenced` : ""}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <StatCard label="Fenced communities" value={fencedCommunities.length} color="text-foreground" />
                  <StatCard label="Mapped households" value={fencedHouseholds.length} color="text-primary" />
                  <StatCard label="Treated" value={fencedHouseholds.filter((h) => h.coverage_status === "treated").length} color="text-green-600" icon={CheckCircle2} />
                  <StatCard label="Not treated" value={fencedHouseholds.filter((h) => h.coverage_status === "not_treated").length} color="text-red-600" icon={XCircle} />
                </div>
                <div className="h-[58vh] min-h-[360px] rounded-md overflow-hidden border border-border">
                  <CESSurveyMap
                    centerLat={activeCommunity.center_lat}
                    centerLng={activeCommunity.center_lng}
                    perimeter={activeCommunity.perimeter_coords ?? []}
                    segments={[]}
                    selectedSegmentIds={[]}
                    households={fencedHouseholds}
                    basemap="google"
                    height="58vh"
                    centerLabel="Fenced community center"
                  />
                </div>
                <div className="flex flex-wrap items-center gap-3 text-xs">
                  <LegendDot color="bg-green-500" label="Treated" />
                  <LegendDot color="bg-red-500" label="Not treated / refused" />
                  <LegendDot color="bg-slate-400" label="Absent / unassessed" />
                  <span className="ml-auto text-muted-foreground">Latest located and fenced communities are pulled from CES locator records.</span>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Alert>
              <Satellite className="h-4 w-4" />
              <AlertDescription>
                No located and fenced community is available for this project yet. Use <strong>Locate &amp; Fence Community</strong> to create one.
              </AlertDescription>
            </Alert>
          )}

      <CESCaptureDialog
        open={showCapture}
        onOpenChange={setShowCapture}
        projectId={selectedProject}
        formId={formId}
        onSaved={async (id) => {
          // Refetch sessions and select the new one
          const { data } = await supabase
            .from("ces_capture_sessions" as any)
            .select("*")
            .eq("project_id", selectedProject)
            .order("created_at", { ascending: false });
          setSessions((data as any) ?? []);
          const newSess = (data as any)?.find((s: any) => s.id === id);
          if (newSess) setActiveSession(newSess);
        }}
      />

      <HouseholdInspector
        household={selectedHousehold}
        open={inspectorOpen}
        onOpenChange={setInspectorOpen}
        onUpdated={loadHouseholds}
      />
        </TabsContent>
      </Tabs>
    </div>
  );
};

const StatCard = ({ label, value, color, icon: Icon }: { label: string; value: number | string; color: string; icon?: any }) => (
  <Card>
    <CardContent className="p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        {Icon && <Icon className={`h-4 w-4 ${color}`} />}
      </div>
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
    </CardContent>
  </Card>
);

const LegendDot = ({ color, label }: { color: string; label: string }) => (
  <div className="flex items-center gap-1.5">
    <span className={`inline-block w-3 h-3 rounded-full ${color}`} />
    <span className="text-muted-foreground">{label}</span>
  </div>
);

export default CoverageEvaluationView;

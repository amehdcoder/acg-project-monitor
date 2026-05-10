import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Plus, Camera, MapPin, Boxes, AlertTriangle, CheckCircle2, XCircle, Info } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import Village3DMap, { Household3D } from "./Village3DMap";
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

const CoverageEvaluationView = ({ formId }: { formId?: string }) => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<string>("");
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

  // Load sessions for project
  useEffect(() => {
    if (!selectedProject) return;
    (async () => {
      const { data } = await supabase
        .from("ces_capture_sessions" as any)
        .select("*")
        .eq("project_id", selectedProject)
        .order("created_at", { ascending: false });
      setSessions((data as any) ?? []);
      if (data?.length) setActiveSession(data[0] as any);
      else setActiveSession(null);
    })();
  }, [selectedProject]);

  // Load households for active session
  const loadHouseholds = useCallback(async () => {
    if (!activeSession) {
      setHouseholds([]);
      return;
    }
    const { data } = await supabase
      .from("ces_households" as any)
      .select("*")
      .eq("session_id", activeSession.id);
    const mapped: Household3D[] = ((data as any) ?? []).map((h: any) => ({
      id: h.id,
      lat: h.latitude,
      lng: h.longitude,
      roofHeightM: Number(h.roof_height_m ?? 3),
      coverageStatus: h.coverage_status,
      label: h.label,
      intervention_status: h.intervention_status,
    }));
    setHouseholds(mapped);
  }, [activeSession]);

  useEffect(() => {
    loadHouseholds();
  }, [loadHouseholds]);

  // Realtime subscription
  useEffect(() => {
    if (!activeSession) return;
    const channel = supabase
      .channel(`ces-households-${activeSession.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "ces_households", filter: `session_id=eq.${activeSession.id}` },
        () => loadHouseholds()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeSession, loadHouseholds]);

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
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Boxes className="h-6 w-6 text-primary" />
            Coverage Evaluation Survey — 3D Village Mapping
          </h1>
          <p className="text-sm text-muted-foreground">
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
        <div className="flex items-center gap-2">
          {isAdminBypass && (
            <Button variant="outline" size="sm" onClick={() => setAccessOpen(true)} title="Manage CES role assignments">
              <Settings2 className="h-4 w-4 mr-1" /> CES Access
            </Button>
          )}
          <Select value={selectedProject} onValueChange={setSelectedProject}>
            <SelectTrigger className="w-64">
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
        <TabsList className="w-full flex justify-start overflow-x-auto">
          <TabsTrigger value="survey"><ClipboardList className="h-4 w-4 mr-1" />CES Survey Workflow</TabsTrigger>
          <TabsTrigger value="gap"><BrainCircuit className="h-4 w-4 mr-1" />Gap Intelligence</TabsTrigger>
          <TabsTrigger value="qc"><ShieldCheck className="h-4 w-4 mr-1" />Validation Tasks</TabsTrigger>
          <TabsTrigger value="audit"><History className="h-4 w-4 mr-1" />Audit Log</TabsTrigger>
          <TabsTrigger value="3d"><Boxes className="h-4 w-4 mr-1" />3D Village Map</TabsTrigger>
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
          <div className="flex justify-end gap-2 items-center">
            {!canLocate && !rolesLoading && (
              <span className="text-[11px] text-muted-foreground"><Lock className="h-3 w-3 inline mr-1" />Locator role required</span>
            )}
            <Button onClick={() => setShowCapture(true)} disabled={!selectedProject || !canLocate}>
              <Camera className="h-4 w-4 mr-2" />
              New 3D Capture
            </Button>
          </div>

      {/* Sessions selector */}
      {sessions.length > 0 && (
        <Card>
          <CardContent className="p-3 flex flex-wrap gap-2">
            {sessions.map((s) => (
              <Button
                key={s.id}
                size="sm"
                variant={activeSession?.id === s.id ? "default" : "outline"}
                onClick={() => setActiveSession(s)}
              >
                <MapPin className="h-3 w-3 mr-1" />
                {s.name}
                <Badge variant="secondary" className="ml-2 text-xs">
                  {s.household_count} HH
                </Badge>
              </Button>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Stats strip */}
      {activeSession && (
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          <StatCard label="Total" value={stats.total} color="text-foreground" />
          <StatCard label="Covered" value={stats.covered} color="text-green-600" icon={CheckCircle2} />
          <StatCard label="Missed" value={stats.missed} color="text-red-600" icon={XCircle} />
          <StatCard label="Refused" value={stats.refused} color="text-yellow-600" icon={AlertTriangle} />
          <StatCard label="Revisit" value={stats.revisit} color="text-orange-600" />
          <StatCard label="Coverage" value={`${stats.coverageRate}%`} color="text-primary" />
        </div>
      )}

      {/* 3D Map */}
      {activeSession && activeSession.center_lat && activeSession.center_lng ? (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>{activeSession.name}</CardTitle>
              <CardDescription>
                {[activeSession.ward, activeSession.lga, activeSession.state].filter(Boolean).join(" • ")}
                {activeSession.campaign_type && ` • ${activeSession.campaign_type}`}
              </CardDescription>
            </div>
            <Button
              size="sm"
              variant={addMode ? "default" : "outline"}
              onClick={() => setAddMode((m) => !m)}
            >
              <Plus className="h-4 w-4 mr-1" />
              {addMode ? "Tap ground to place…" : "Add Household"}
            </Button>
          </CardHeader>
          <CardContent>
            <div className="h-[60vh] rounded-lg overflow-hidden border border-border">
              <Village3DMap
                centerLat={activeSession.center_lat}
                centerLng={activeSession.center_lng}
                perimeter={activeSession.perimeter_coords ?? []}
                households={households}
                segments={segments}
                inferredCoverage={inferredCoverage}
                onTapHousehold={handleTapHousehold}
                onAddHouseholdAt={addMode ? handleAddAt : undefined}
                selectedId={selectedHousehold?.id ?? null}
              />

            </div>
            <div className="flex flex-wrap items-center gap-3 mt-3 text-xs">
              <LegendDot color="bg-slate-400" label="Unassessed" />
              <LegendDot color="bg-green-500" label="Covered" />
              <LegendDot color="bg-red-500" label="Missed" />
              <LegendDot color="bg-yellow-500" label="Refused" />
              <LegendDot color="bg-orange-500" label="Revisit" />
              <div className="ml-auto text-muted-foreground flex items-center gap-1">
                <Info className="h-3 w-3" />
                Coverage for unsampled segments is geostatistically inferred (IDW).
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Alert>
          <Boxes className="h-4 w-4" />
          <AlertDescription>
            No 3D capture yet for this project. Click <strong>New Capture</strong> to walk a village
            perimeter and build the first 3D map.
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

import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { dbscanGeo, Cluster, GeoPoint } from "@/lib/ces/dbscan";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MapContainer, TileLayer, CircleMarker, Circle } from "react-leaflet";
import { BrainCircuit, MapPin, AlertTriangle, Users, Loader2, Save, RefreshCw } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import "leaflet/dist/leaflet.css";

interface Classification {
  label: string;
  recommendedAction: string;
  confidenceScore: number;
  reasoning: string;
}

interface EnrichedCluster extends Cluster {
  ai: Classification;
  dominant: string;
  counts: { refused: number; absent: number; not_treated: number };
}

interface Staff {
  user_id: string;
  name: string;
}

// Deterministic classification — strictly derived from the cluster's observed
// status distribution. No randomness, no fabricated context.
function classifyCluster(c: Cluster): { classification: Classification; dominant: string; counts: { refused: number; absent: number; not_treated: number } } {
  const counts = { refused: 0, absent: 0, not_treated: 0 };
  for (const p of c.points) {
    const s = (p as any).coverage_status as string;
    if (s === "refused") counts.refused++;
    else if (s === "absent") counts.absent++;
    else counts.not_treated++;
  }
  const total = c.points.length;
  const entries = Object.entries(counts) as Array<[keyof typeof counts, number]>;
  entries.sort((a, b) => b[1] - a[1]);
  const [dominant, dominantCount] = entries[0];
  const dominantShare = total > 0 ? dominantCount / total : 0;

  // Confidence: function of cluster size and dominance share. Capped at 95%
  // because we are inferring from coverage status alone.
  const sizeFactor = Math.min(1, total / 25); // saturates at 25 households
  const confidenceScore = Math.round(40 + sizeFactor * 35 + dominantShare * 20);

  let label = "";
  let recommendedAction = "";
  if (dominant === "refused") {
    label = "Refusal Cluster";
    recommendedAction = "Deploy social mobilizer and engage community leaders before re-visit.";
  } else if (dominant === "absent") {
    label = "Absent-Household Cluster";
    recommendedAction = "Schedule evening or weekend mop-up visits.";
  } else {
    label = "Untreated-Household Cluster";
    recommendedAction = "Re-deploy treatment team with sufficient drug stock.";
  }

  const reasoning =
    `${total} household${total === 1 ? "" : "s"} grouped within DBSCAN radius. ` +
    `Status mix: ${counts.refused} refused, ${counts.absent} absent, ${counts.not_treated} untreated. ` +
    `Dominant cause "${dominant.replace("_", " ")}" accounts for ${(dominantShare * 100).toFixed(0)}% of the cluster.`;

  return {
    classification: { label, recommendedAction, confidenceScore: Math.min(95, confidenceScore), reasoning },
    dominant,
    counts,
  };
}

// DBSCAN tuning — store in state so future tuning is trivial.
const DEFAULT_EPS_METERS = 200;
const DEFAULT_MIN_PTS = 3;

export default function CESGapIntelligence() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [clusters, setClusters] = useState<EnrichedCluster[]>([]);
  const [selectedCluster, setSelectedCluster] = useState<EnrichedCluster | null>(null);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [assignments, setAssignments] = useState<Record<string, { team: string; completed: number; total: number }>>({});

  const [mopUpOpen, setMopUpOpen] = useState(false);
  const [mopUpForm, setMopUpForm] = useState({
    teamUserId: "",
    teamName: "",
    targetDate: new Date(Date.now() + 86400000).toISOString().split("T")[0],
    resources: "Ivermectin, Praziquantel",
    priority: "Medium",
  });
  const [assigning, setAssigning] = useState(false);

  const loadGaps = useCallback(async () => {
    setRefreshing(true);
    const { data, error } = await supabase
      .from("ces_household_visits" as any)
      .select("id, latitude, longitude, coverage_status, survey_id")
      .in("coverage_status", ["not_treated", "absent", "refused"]);

    if (error || !data) {
      if (error) toast({ title: "Error loading gaps", description: error.message, variant: "destructive" });
      setClusters([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    const geoPoints: GeoPoint[] = (data as any[])
      .filter((d) => typeof d.latitude === "number" && typeof d.longitude === "number")
      .map((d) => ({
        id: d.id,
        lat: d.latitude,
        lng: d.longitude,
        coverage_status: d.coverage_status,
        survey_id: d.survey_id,
      }));

    const raw = dbscanGeo(geoPoints, DEFAULT_EPS_METERS, DEFAULT_MIN_PTS);
    const enriched: EnrichedCluster[] = raw.map((c) => {
      const { classification, dominant, counts } = classifyCluster(c);
      return { ...c, ai: classification, dominant, counts };
    });
    setClusters(enriched);
    setLoading(false);
    setRefreshing(false);
  }, []);

  const loadStaff = useCallback(async () => {
    const { data } = await supabase
      .from("profiles")
      .select("user_id, first_name, last_name, email")
      .eq("approval_status", "approved")
      .limit(200);
    if (data) {
      setStaff(
        data.map((p: any) => ({
          user_id: p.user_id,
          name: [p.first_name, p.last_name].filter(Boolean).join(" ").trim() || p.email,
        })),
      );
    }
  }, []);

  const loadAssignments = useCallback(async () => {
    const { data } = await supabase
      .from("ces_mopup_assignments" as any)
      .select("cluster_id, assigned_team_name, completed_hh_count, target_hh_count");
    if (data) {
      const map: Record<string, { team: string; completed: number; total: number }> = {};
      for (const a of data as any[]) {
        if (a.cluster_id) {
          map[a.cluster_id] = {
            team: a.assigned_team_name,
            completed: a.completed_hh_count || 0,
            total: a.target_hh_count || 0,
          };
        }
      }
      setAssignments(map);
    }
  }, []);

  useEffect(() => {
    loadGaps();
    loadStaff();
    loadAssignments();
  }, [loadGaps, loadStaff, loadAssignments]);

  // Real-time refresh when underlying visits or assignments change
  useEffect(() => {
    const ch = supabase
      .channel("gap-intel-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "ces_household_visits" }, () => loadGaps())
      .on("postgres_changes", { event: "*", schema: "public", table: "ces_mopup_assignments" }, () => loadAssignments())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [loadGaps, loadAssignments]);

  const mapCenter = useMemo<[number, number]>(() => {
    if (clusters.length > 0) return [clusters[0].centroid.lat, clusters[0].centroid.lng];
    return [9.082, 8.6753];
  }, [clusters]);

  const handleCreatePlan = () => {
    if (!selectedCluster) return;
    setMopUpForm((f) => ({
      ...f,
      priority: selectedCluster.points.length > 20 || selectedCluster.ai.confidenceScore > 80 ? "High" : "Medium",
    }));
    setMopUpOpen(true);
  };

  const submitMopUpPlan = async () => {
    if (!selectedCluster || !user) return;
    setAssigning(true);

    const clusterKey = selectedCluster.id; // stable within fetch session
    const householdIds = selectedCluster.points.map((p) => p.id);
    const surveyId = selectedCluster.points[0]?.survey_id ?? null;

    // Upsert the cluster record (using cluster_key uniqueness)
    const { data: clusterRow, error: clusterErr } = await supabase
      .from("ces_gap_clusters" as any)
      .upsert(
        [
          {
            cluster_key: clusterKey,
            survey_id: surveyId,
            centroid_lat: selectedCluster.centroid.lat,
            centroid_lng: selectedCluster.centroid.lng,
            household_count: selectedCluster.points.length,
            refused_count: selectedCluster.counts.refused,
            absent_count: selectedCluster.counts.absent,
            not_treated_count: selectedCluster.counts.not_treated,
            dominant_cause: selectedCluster.dominant,
            ai_confidence_score: selectedCluster.ai.confidenceScore,
            ai_label: selectedCluster.ai.label,
            recommended_action: selectedCluster.ai.recommendedAction,
            status: "mopup_assigned",
            household_ids: householdIds,
          },
        ],
        { onConflict: "cluster_key" },
      )
      .select("id")
      .single();

    if (clusterErr || !clusterRow) {
      setAssigning(false);
      toast({ title: "Failed to save cluster", description: clusterErr?.message, variant: "destructive" });
      return;
    }

    const { error: assignErr } = await supabase.from("ces_mopup_assignments" as any).insert([
      {
        cluster_id: (clusterRow as any).id,
        survey_id: surveyId,
        assigned_user_id: mopUpForm.teamUserId || null,
        assigned_team_name: mopUpForm.teamName,
        target_date: mopUpForm.targetDate,
        target_hh_count: selectedCluster.points.length,
        completed_hh_count: 0,
        resources: mopUpForm.resources,
        priority: mopUpForm.priority,
        status: "Pending",
        created_by: user.id,
      },
    ]);

    setAssigning(false);
    if (assignErr) {
      toast({ title: "Failed to assign", description: assignErr.message, variant: "destructive" });
      return;
    }
    toast({
      title: "Mop-up assigned",
      description: `${mopUpForm.teamName} dispatched for ${selectedCluster.points.length} households.`,
    });
    setMopUpOpen(false);
    setSelectedCluster(null);
    loadAssignments();
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 h-[calc(100vh-180px)] min-h-[600px]">
      <Card className="md:col-span-2 overflow-hidden flex flex-col">
        <CardHeader className="bg-slate-900 text-white py-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <BrainCircuit className="h-5 w-5 text-indigo-400" />
                Live Gap Intelligence Map
              </CardTitle>
              <CardDescription className="text-slate-300">
                DBSCAN clustering of verified refused, absent, and untreated households. {clusters.length} cluster
                {clusters.length === 1 ? "" : "s"} detected.
              </CardDescription>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="bg-white/10 border-white/20 text-white hover:bg-white/20"
              onClick={loadGaps}
              disabled={refreshing}
            >
              <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${refreshing ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0 flex-1 relative bg-slate-100">
          {loading ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
            </div>
          ) : (
            <MapContainer center={mapCenter} zoom={13} className="h-full w-full">
              <TileLayer
                url="https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}"
                subdomains={["mt0", "mt1", "mt2", "mt3"]}
                maxZoom={20}
              />
              {clusters.map((c) => {
                const assigned = !!assignments[c.id];
                return (
                  <div key={c.id}>
                    <Circle
                      center={[c.centroid.lat, c.centroid.lng]}
                      radius={Math.max(120, 40 + c.points.length * 10)}
                      pathOptions={{
                        color: assigned ? "#16a34a" : "#dc2626",
                        fillColor: assigned ? "#16a34a" : "#ef4444",
                        fillOpacity: 0.35,
                        weight: 2,
                        className: assigned ? "" : "gap-cluster-pulse",
                      }}
                      eventHandlers={{ click: () => setSelectedCluster(c) }}
                    />
                    {c.points.map((p) => (
                      <CircleMarker
                        key={p.id}
                        center={[p.lat, p.lng]}
                        radius={3}
                        pathOptions={{
                          color:
                            (p as any).coverage_status === "refused"
                              ? "#b91c1c"
                              : (p as any).coverage_status === "absent"
                                ? "#64748b"
                                : "#ea580c",
                          fillOpacity: 1,
                        }}
                      />
                    ))}
                  </div>
                );
              })}
            </MapContainer>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-col gap-4 overflow-y-auto">
        {selectedCluster ? (
          <Card className="border-indigo-200 shadow-md">
            <CardHeader className="bg-indigo-50/50 pb-4 border-b">
              <div className="flex justify-between items-start">
                <Badge variant="destructive" className="animate-pulse">
                  Active Cluster
                </Badge>
                <Badge variant="outline" className="bg-white">
                  {selectedCluster.ai.confidenceScore}% confidence
                </Badge>
              </div>
              <CardTitle className="mt-2 text-lg">{selectedCluster.ai.label}</CardTitle>
              <CardDescription className="flex items-center gap-1 text-slate-600">
                <MapPin className="h-3 w-3" /> {selectedCluster.centroid.lat.toFixed(5)},{" "}
                {selectedCluster.centroid.lng.toFixed(5)}
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-4 space-y-4">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="bg-slate-50 p-2 rounded border">
                  <div className="text-muted-foreground text-xs">Total HHs</div>
                  <div className="font-bold text-lg">{selectedCluster.points.length}</div>
                </div>
                <div className="bg-slate-50 p-2 rounded border">
                  <div className="text-muted-foreground text-xs">Dominant cause</div>
                  <div className="font-bold text-lg capitalize">{selectedCluster.dominant.replace("_", " ")}</div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-1 text-xs text-center">
                <div className="bg-red-50 border border-red-100 rounded p-1.5">
                  <div className="font-semibold text-red-700">{selectedCluster.counts.refused}</div>
                  <div className="text-red-600/80">refused</div>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded p-1.5">
                  <div className="font-semibold text-slate-700">{selectedCluster.counts.absent}</div>
                  <div className="text-slate-600">absent</div>
                </div>
                <div className="bg-orange-50 border border-orange-100 rounded p-1.5">
                  <div className="font-semibold text-orange-700">{selectedCluster.counts.not_treated}</div>
                  <div className="text-orange-600/80">untreated</div>
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs text-indigo-600 font-bold uppercase tracking-wider flex items-center gap-1">
                  <BrainCircuit className="h-3 w-3" /> Recommended action
                </Label>
                <div className="p-3 bg-indigo-50 rounded-md border border-indigo-100 text-sm font-medium text-indigo-900">
                  {selectedCluster.ai.recommendedAction}
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed pt-1">{selectedCluster.ai.reasoning}</p>
              </div>

              {assignments[selectedCluster.id] && (
                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span>Mop-up progress · {assignments[selectedCluster.id].team}</span>
                    <span>
                      {assignments[selectedCluster.id].completed}/{assignments[selectedCluster.id].total} HHs
                    </span>
                  </div>
                  <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-green-500 transition-all"
                      style={{
                        width: `${
                          assignments[selectedCluster.id].total > 0
                            ? Math.min(
                                100,
                                (assignments[selectedCluster.id].completed / assignments[selectedCluster.id].total) *
                                  100,
                              )
                            : 0
                        }%`,
                      }}
                    />
                  </div>
                </div>
              )}
            </CardContent>
            <CardFooter className="bg-slate-50 pt-4">
              <Button
                onClick={handleCreatePlan}
                className="w-full bg-indigo-600 hover:bg-indigo-700"
                disabled={!!assignments[selectedCluster.id]}
              >
                <Users className="h-4 w-4 mr-2" />
                {assignments[selectedCluster.id] ? "Already assigned" : "Create mop-up plan"}
              </Button>
            </CardFooter>
          </Card>
        ) : (
          <Card className="h-full flex items-center justify-center bg-slate-50 border-dashed">
            <div className="text-center p-6 space-y-2">
              <AlertTriangle className="h-10 w-10 text-slate-300 mx-auto" />
              <h3 className="font-medium text-slate-600">No cluster selected</h3>
              <p className="text-xs text-slate-400">
                Click a pulsing red cluster on the map to view the root-cause analysis and assign a mop-up team.
              </p>
            </div>
          </Card>
        )}
      </div>

      <Dialog open={mopUpOpen} onOpenChange={setMopUpOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign mop-up team</DialogTitle>
            <DialogDescription>
              Deploy a team for the {selectedCluster?.ai.label.toLowerCase()} covering {selectedCluster?.points.length}{" "}
              households.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label>Assigned field worker</Label>
              <Select
                value={mopUpForm.teamUserId}
                onValueChange={(v) => {
                  const s = staff.find((x) => x.user_id === v);
                  setMopUpForm((f) => ({ ...f, teamUserId: v, teamName: s?.name || f.teamName }));
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select field staff" />
                </SelectTrigger>
                <SelectContent>
                  {staff.length === 0 ? (
                    <SelectItem value="__none__" disabled>
                      No approved field staff
                    </SelectItem>
                  ) : (
                    staff.map((s) => (
                      <SelectItem key={s.user_id} value={s.user_id}>
                        {s.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Team / squad label</Label>
              <Input
                value={mopUpForm.teamName}
                onChange={(e) => setMopUpForm((f) => ({ ...f, teamName: e.target.value }))}
                placeholder="e.g. Mobile Team A"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Target date</Label>
                <Input
                  type="date"
                  value={mopUpForm.targetDate}
                  onChange={(e) => setMopUpForm((f) => ({ ...f, targetDate: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>Households</Label>
                <Input type="number" value={selectedCluster?.points.length ?? 0} disabled className="bg-slate-50" />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Resources</Label>
              <Input
                value={mopUpForm.resources}
                onChange={(e) => setMopUpForm((f) => ({ ...f, resources: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Priority</Label>
              <Select value={mopUpForm.priority} onValueChange={(v) => setMopUpForm((f) => ({ ...f, priority: v }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="High">High</SelectItem>
                  <SelectItem value="Medium">Medium</SelectItem>
                  <SelectItem value="Low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMopUpOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submitMopUpPlan} disabled={assigning || !mopUpForm.teamName.trim()}>
              {assigning ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
              Dispatch team
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

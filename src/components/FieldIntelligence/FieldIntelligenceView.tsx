import { useState, useEffect, Suspense, lazy } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Navigation, Route, Radar, Users, Activity, Bell, Network, Building2, Box,
  Camera, Shield, Fingerprint, Radio, Loader2
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import RouteOptimizerMap from "./RouteOptimizerMap";
import RealTimeTrackingMap from "./RealTimeTrackingMap";
import ProximityAlerts from "./ProximityAlerts";
import MovementAnalytics from "./MovementAnalytics";
import LocationNotifications from "./LocationNotifications";
import SocialNetworkMap from "./SocialNetworkMap";
import IndoorTrackingView from "./IndoorTrackingView";
import DigitalTwinView from "./DigitalTwinView";
import ARCameraOverlay from "./ARCameraOverlay";
import RiskScoreView from "./RiskScoreView";
import AnomalyDashboard from "./AnomalyDashboard";

const TabSkeleton = () => (
  <div className="space-y-4">
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {[1, 2, 3, 4].map(i => (
        <Card key={i} className="p-3">
          <div className="flex items-center gap-2">
            <Skeleton className="h-10 w-10 rounded-lg" />
            <div className="space-y-1.5 flex-1">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-6 w-10" />
            </div>
          </div>
        </Card>
      ))}
    </div>
    <Skeleton className="h-[400px] w-full rounded-lg" />
  </div>
);

const FieldIntelligenceView = () => {
  const [activeTab, setActiveTab] = useState("live-tracking");
  const [projects, setProjects] = useState<any[]>([]);
  const [selectedProject, setSelectedProject] = useState("");
  const [forms, setForms] = useState<any[]>([]);
  const [selectedForm, setSelectedForm] = useState("");
  const [loading, setLoading] = useState(true);
  const [realtimeEvents, setRealtimeEvents] = useState(0);

  useEffect(() => {
    const fetchProjects = async () => {
      try {
        const { data } = await supabase.from("projects").select("id, name").order("name");
        setProjects(data || []);
      } catch (e) {
        console.error("Failed to load projects:", e);
      } finally {
        setLoading(false);
      }
    };
    fetchProjects();
  }, []);

  useEffect(() => {
    if (!selectedProject) { setForms([]); setSelectedForm(""); return; }
    const fetchForms = async () => {
      try {
        const { data } = await supabase
          .from("forms")
          .select("id, name, geofence")
          .eq("project_id", selectedProject)
          .order("name");
        setForms(data || []);
      } catch (e) {
        console.error("Failed to load forms:", e);
      }
    };
    fetchForms();
  }, [selectedProject]);

  // Realtime subscriptions
  useEffect(() => {
    const channel = supabase
      .channel("field-intelligence-realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "form_submissions" }, () => {
        setRealtimeEvents(prev => prev + 1);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "field_activity" }, () => {
        setRealtimeEvents(prev => prev + 1);
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "profiles" }, () => {
        setRealtimeEvents(prev => prev + 1);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const geofencedForms = forms.filter(f => f.geofence);

  if (loading) {
    return (
      <div className="space-y-4 p-2 sm:p-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-72" />
        <TabSkeleton />
      </div>
    );
  }

  return (
    <div className="space-y-4 p-2 sm:p-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground flex items-center gap-2">
            <Navigation className="h-7 w-7 text-primary" />
            Field Intelligence
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Route optimization, real-time tracking, risk analysis & behavioral monitoring
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {realtimeEvents > 0 && (
            <Badge variant="secondary" className="gap-1 animate-pulse">
              <Radio className="h-3 w-3 text-status-success" />
              Live
            </Badge>
          )}
          <Select value={selectedProject} onValueChange={v => { setSelectedProject(v === "__all__" ? "" : v); setSelectedForm(""); }}>
            <SelectTrigger className="w-40 sm:w-48">
              <SelectValue placeholder="All Projects" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All Projects</SelectItem>
              {projects.map(p => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {forms.length > 0 && (
            <Select value={selectedForm} onValueChange={setSelectedForm}>
              <SelectTrigger className="w-40 sm:w-48">
                <SelectValue placeholder="All Forms" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All Forms</SelectItem>
                {forms.map(f => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.name} {f.geofence ? "📍" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex flex-wrap h-auto gap-1">
          <TabsTrigger value="live-tracking" className="gap-1 text-xs sm:text-sm">
            <Radar className="h-4 w-4" />Live Tracking
          </TabsTrigger>
          <TabsTrigger value="route-optimizer" className="gap-1 text-xs sm:text-sm">
            <Route className="h-4 w-4" />Route Optimizer
          </TabsTrigger>
          <TabsTrigger value="proximity" className="gap-1 text-xs sm:text-sm">
            <Users className="h-4 w-4" />Proximity
          </TabsTrigger>
          <TabsTrigger value="movement" className="gap-1 text-xs sm:text-sm">
            <Activity className="h-4 w-4" />Movement
          </TabsTrigger>
          <TabsTrigger value="risk-scores" className="gap-1 text-xs sm:text-sm">
            <Shield className="h-4 w-4" />Risk Scores
          </TabsTrigger>
          <TabsTrigger value="anomalies" className="gap-1 text-xs sm:text-sm">
            <Fingerprint className="h-4 w-4" />Anomalies
          </TabsTrigger>
          <TabsTrigger value="digital-twin" className="gap-1 text-xs sm:text-sm">
            <Box className="h-4 w-4" />Digital Twin
          </TabsTrigger>
          <TabsTrigger value="indoor" className="gap-1 text-xs sm:text-sm">
            <Building2 className="h-4 w-4" />Indoor
          </TabsTrigger>
          <TabsTrigger value="ar-overlay" className="gap-1 text-xs sm:text-sm">
            <Camera className="h-4 w-4" />AR View
          </TabsTrigger>
          <TabsTrigger value="notifications" className="gap-1 text-xs sm:text-sm">
            <Bell className="h-4 w-4" />Alerts
          </TabsTrigger>
          <TabsTrigger value="social-network" className="gap-1 text-xs sm:text-sm">
            <Network className="h-4 w-4" />Network
          </TabsTrigger>
        </TabsList>

        <TabsContent value="live-tracking">
          <RealTimeTrackingMap projectId={selectedProject} formId={selectedForm === "__all__" ? "" : selectedForm} realtimeKey={realtimeEvents} />
        </TabsContent>
        <TabsContent value="route-optimizer">
          <RouteOptimizerMap projectId={selectedProject} formId={selectedForm === "__all__" ? "" : selectedForm} forms={selectedProject ? geofencedForms : []} />
        </TabsContent>
        <TabsContent value="proximity">
          <ProximityAlerts projectId={selectedProject} realtimeKey={realtimeEvents} />
        </TabsContent>
        <TabsContent value="movement">
          <MovementAnalytics projectId={selectedProject} formId={selectedForm === "__all__" ? "" : selectedForm} realtimeKey={realtimeEvents} />
        </TabsContent>
        <TabsContent value="risk-scores">
          <RiskScoreView projectId={selectedProject} formId={selectedForm === "__all__" ? "" : selectedForm} />
        </TabsContent>
        <TabsContent value="anomalies">
          <AnomalyDashboard projectId={selectedProject} />
        </TabsContent>
        <TabsContent value="digital-twin">
          <DigitalTwinView projectId={selectedProject} formId={selectedForm === "__all__" ? "" : selectedForm} />
        </TabsContent>
        <TabsContent value="indoor">
          <IndoorTrackingView projectId={selectedProject} formId={selectedForm === "__all__" ? "" : selectedForm} />
        </TabsContent>
        <TabsContent value="ar-overlay">
          <ARCameraOverlay projectId={selectedProject} formId={selectedForm === "__all__" ? "" : selectedForm} />
        </TabsContent>
        <TabsContent value="notifications">
          <LocationNotifications projectId={selectedProject} />
        </TabsContent>
        <TabsContent value="social-network">
          <SocialNetworkMap projectId={selectedProject} formId={selectedForm === "__all__" ? "" : selectedForm} />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default FieldIntelligenceView;

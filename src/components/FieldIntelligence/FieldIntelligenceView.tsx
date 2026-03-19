import { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Navigation, Route, Radar, Users, Activity, Bell, Network, Building2, Box
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

const FieldIntelligenceView = () => {
  const [activeTab, setActiveTab] = useState("route-optimizer");
  const [projects, setProjects] = useState<any[]>([]);
  const [selectedProject, setSelectedProject] = useState("");
  const [forms, setForms] = useState<any[]>([]);
  const [selectedForm, setSelectedForm] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchProjects = async () => {
      const { data } = await supabase.from("projects").select("id, name").order("name");
      setProjects(data || []);
      setLoading(false);
    };
    fetchProjects();
  }, []);

  useEffect(() => {
    if (!selectedProject) { setForms([]); return; }
    const fetchForms = async () => {
      const { data } = await supabase
        .from("forms")
        .select("id, name, geofence")
        .eq("project_id", selectedProject)
        .order("name");
      setForms(data || []);
    };
    fetchForms();
  }, [selectedProject]);

  const geofencedForms = forms.filter(f => f.geofence);

  return (
    <div className="space-y-4 p-2 sm:p-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground flex items-center gap-2">
            <Navigation className="h-7 w-7 text-primary" />
            Field Intelligence
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Route optimization, real-time tracking, proximity alerts & movement analytics
          </p>
        </div>
        <div className="flex gap-2">
          <Select value={selectedProject} onValueChange={setSelectedProject}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Select Project" />
            </SelectTrigger>
            <SelectContent>
              {projects.map(p => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {forms.length > 0 && (
            <Select value={selectedForm} onValueChange={setSelectedForm}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Select Form" />
              </SelectTrigger>
              <SelectContent>
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
          <TabsTrigger value="route-optimizer" className="gap-1 text-xs sm:text-sm">
            <Route className="h-4 w-4" />Route Optimizer
          </TabsTrigger>
          <TabsTrigger value="live-tracking" className="gap-1 text-xs sm:text-sm">
            <Radar className="h-4 w-4" />Live Tracking
          </TabsTrigger>
          <TabsTrigger value="proximity" className="gap-1 text-xs sm:text-sm">
            <Users className="h-4 w-4" />Proximity
          </TabsTrigger>
          <TabsTrigger value="movement" className="gap-1 text-xs sm:text-sm">
            <Activity className="h-4 w-4" />Movement Analytics
          </TabsTrigger>
          <TabsTrigger value="indoor" className="gap-1 text-xs sm:text-sm">
            <Building2 className="h-4 w-4" />Indoor Tracking
          </TabsTrigger>
          <TabsTrigger value="digital-twin" className="gap-1 text-xs sm:text-sm">
            <Box className="h-4 w-4" />Digital Twin
          </TabsTrigger>
          <TabsTrigger value="notifications" className="gap-1 text-xs sm:text-sm">
            <Bell className="h-4 w-4" />Location Alerts
          </TabsTrigger>
          <TabsTrigger value="social-network" className="gap-1 text-xs sm:text-sm">
            <Network className="h-4 w-4" />Network Analysis
          </TabsTrigger>
        </TabsList>

        <TabsContent value="route-optimizer">
          <RouteOptimizerMap projectId={selectedProject} formId={selectedForm} forms={geofencedForms} />
        </TabsContent>
        <TabsContent value="live-tracking">
          <RealTimeTrackingMap projectId={selectedProject} formId={selectedForm} />
        </TabsContent>
        <TabsContent value="proximity">
          <ProximityAlerts projectId={selectedProject} />
        </TabsContent>
        <TabsContent value="movement">
          <MovementAnalytics projectId={selectedProject} formId={selectedForm} />
        </TabsContent>
        <TabsContent value="indoor">
          <IndoorTrackingView projectId={selectedProject} formId={selectedForm} />
        </TabsContent>
        <TabsContent value="digital-twin">
          <DigitalTwinView projectId={selectedProject} formId={selectedForm} />
        </TabsContent>
        <TabsContent value="notifications">
          <LocationNotifications projectId={selectedProject} />
        </TabsContent>
        <TabsContent value="social-network">
          <SocialNetworkMap projectId={selectedProject} formId={selectedForm} />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default FieldIntelligenceView;

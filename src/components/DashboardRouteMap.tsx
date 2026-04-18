import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Navigation, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import TravelRouteMap from "@/components/Microplanning/TravelRouteMap";

interface DashboardRouteMapProps {
  selectedProjectId?: string | null;
}

const DashboardRouteMap = ({ selectedProjectId }: DashboardRouteMapProps) => {
  const { user, isAdmin } = useAuth();
  const [hasAccess, setHasAccess] = useState(false);
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<any[]>([]);

  useEffect(() => {
    if (!user?.id) return;
    checkAccessAndLoad();
  }, [user?.id, selectedProjectId]);

  const checkAccessAndLoad = async () => {
    setLoading(true);
    try {
      // Check microplan_form_access or admin status
      if (isAdmin) {
        setHasAccess(true);
      } else {
        const { data } = await supabase
          .from("microplan_form_access")
          .select("id")
          .eq("user_id", user!.id)
          .limit(1);
        if (!data || data.length === 0) {
          setHasAccess(false);
          setLoading(false);
          return;
        }
        setHasAccess(true);
      }

      // Determine which projects to include.
      // - If a specific project is selected on the dashboard, scope to that project.
      // - Otherwise, include all projects the user is assigned to (admins see all).
      let projectIds: string[] | null = null;

      if (selectedProjectId) {
        projectIds = [selectedProjectId];
      } else if (!isAdmin) {
        const { data: assignments } = await supabase
          .from("user_project_assignments")
          .select("project_id")
          .eq("user_id", user!.id);
        projectIds = (assignments || []).map((a) => a.project_id);
        if (projectIds.length === 0) {
          setEntries([]);
          setLoading(false);
          return;
        }
      }

      // Fetch ALL microplan entries for the scoped projects, regardless of who
      // captured them (RLS already allows users with microplan_form_access to view all).
      let query = supabase
        .from("microplan_entries")
        .select(
          "id, state, lga, ward, flhf_name, community_name, settlement_name, community_latitude, community_longitude, settlement_latitude, settlement_longitude, flhf_latitude, flhf_longitude, community_distance_to_flhf_km, settlement_distance_to_flhf_km, accessibility, terrain_type, estimated_total_population, estimated_children_5_14, estimated_adults_15_plus, project_id, created_by"
        )
        .order("created_at", { ascending: false });

      if (projectIds && projectIds.length > 0) {
        query = query.in("project_id", projectIds);
      }

      const { data: entriesData } = await query;

      setEntries(entriesData || []);
    } catch (err) {
      console.error("Error loading route map data:", err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Card className="border-0 shadow-card">
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!hasAccess) return null;

  return (
    <Card className="border border-border/50 shadow-card overflow-hidden">
      <CardHeader className="pb-2 bg-gradient-to-r from-primary/5 to-transparent border-b border-border/30">
        <CardTitle className="font-display text-base sm:text-lg flex items-center gap-2">
          <div className="p-2 rounded-xl bg-primary/10 ring-1 ring-primary/20">
            <Navigation className="h-4 w-4 text-primary" />
          </div>
          Route Navigator
          {selectedProjectId && (
            <span className="text-xs font-normal text-muted-foreground ml-auto">
              {entries.length} location{entries.length === 1 ? "" : "s"} (all team members)
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0 sm:p-0">
        <TravelRouteMap entries={entries} />
      </CardContent>
    </Card>
  );
};

export default DashboardRouteMap;

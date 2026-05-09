import { useState, useEffect, useRef } from "react";

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

  const fetchRef = useRef(checkAccessAndLoad);
  useEffect(() => { fetchRef.current = checkAccessAndLoad; });

  useEffect(() => {
    if (!user?.id) return;
    fetchRef.current();
    const ch = supabase
      .channel("dss-route-map")
      .on("postgres_changes", { event: "*", schema: "public", table: "microplan_entries" }, () => fetchRef.current())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.id, selectedProjectId]);


  const checkAccessAndLoad = async () => {
    setLoading(true);
    try {
      // Access is granted to:
      //  - admins (all projects)
      //  - users with microplan_form_access (legacy explicit grant)
      //  - any user assigned to at least one project (project members)
      let projectIds: string[] | null = null;

      if (isAdmin) {
        setHasAccess(true);
        if (selectedProjectId) projectIds = [selectedProjectId];
      } else {
        const [formAccessRes, projectAssignRes] = await Promise.all([
          supabase.from("microplan_form_access").select("id").eq("user_id", user!.id).limit(1),
          supabase.from("user_project_assignments").select("project_id").eq("user_id", user!.id),
        ]);
        const hasFormAccess = !!(formAccessRes.data && formAccessRes.data.length > 0);
        const assignedProjects = (projectAssignRes.data || []).map((a) => a.project_id);

        if (!hasFormAccess && assignedProjects.length === 0) {
          setHasAccess(false);
          setLoading(false);
          return;
        }
        setHasAccess(true);

        if (selectedProjectId) {
          projectIds = [selectedProjectId];
        } else {
          // Always scope non-admins to their assigned projects so they can
          // see all locations captured by anyone in those projects.
          projectIds = assignedProjects;
          if (projectIds.length === 0) {
            setEntries([]);
            setLoading(false);
            return;
          }
        }
      }

      // Fetch ALL microplan entries for the scoped projects with pagination
      // Also use a 90-day window for consistency
      const since90 = new Date(Date.now() - 90 * 86400000).toISOString();
      const PAGE_SIZE = 1000;
      let allEntries: any[] = [];
      let from = 0;

      while (true) {
        let query = supabase
          .from("microplan_entries")
          .select(
            "id, state, lga, ward, flhf_name, community_name, settlement_name, community_latitude, community_longitude, settlement_latitude, settlement_longitude, flhf_latitude, flhf_longitude, community_distance_to_flhf_km, settlement_distance_to_flhf_km, accessibility, terrain_type, estimated_total_population, estimated_children_5_14, estimated_adults_15_plus, project_id, created_by, created_at"
          )
          .gte("created_at", since90)
          .order("created_at", { ascending: false })
          .range(from, from + PAGE_SIZE - 1);

        if (projectIds && projectIds.length > 0) {
          query = query.in("project_id", projectIds);
        }

        const { data, error } = await query;
        if (error || !data || data.length === 0) break;
        allEntries = allEntries.concat(data);
        if (data.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
      }

      setEntries(allEntries);

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

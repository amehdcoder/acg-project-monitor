import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Navigation, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import TravelRouteMap from "@/components/Microplanning/TravelRouteMap";

const DashboardRouteMap = () => {
  const { user, isAdmin } = useAuth();
  const [hasAccess, setHasAccess] = useState(false);
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<any[]>([]);

  useEffect(() => {
    if (!user?.id) return;
    checkAccessAndLoad();
  }, [user?.id]);

  const checkAccessAndLoad = async () => {
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

      // Fetch all microplan entries with GPS data
      const { data: entriesData } = await supabase
        .from("microplan_entries")
        .select("id, state, lga, ward, flhf_name, community_name, settlement_name, community_latitude, community_longitude, settlement_latitude, settlement_longitude, flhf_latitude, flhf_longitude, community_distance_to_flhf_km, settlement_distance_to_flhf_km, accessibility, terrain_type, estimated_total_population, estimated_children_5_14, estimated_adults_15_plus")
        .order("created_at", { ascending: false });

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
    <Card className="border-0 shadow-card overflow-hidden">
      <CardHeader className="pb-2">
        <CardTitle className="font-display text-base sm:text-lg flex items-center gap-2">
          <div className="p-1.5 rounded-full bg-primary/10">
            <Navigation className="h-4 w-4 text-primary" />
          </div>
          Route Navigator
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0 sm:p-0">
        <TravelRouteMap entries={entries} />
      </CardContent>
    </Card>
  );
};

export default DashboardRouteMap;

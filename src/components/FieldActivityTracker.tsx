import { useState, useEffect } from "react";
import {
  Users,
  MapPin,
  Clock,
  CheckCircle,
  XCircle,
  Activity,
  ChevronDown,
  ChevronUp,
  RefreshCw,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { supabase } from "@/integrations/supabase/client";

interface FieldActivity {
  id: string;
  user_id: string;
  form_id: string;
  started_at: string;
  ended_at: string | null;
  location: { lat: number; lng: number; accuracy?: number } | null;
  within_geofence: boolean | null;
  user?: {
    first_name: string;
    last_name: string;
    designation: string;
    state: string | null;
    lga: string | null;
  };
  form?: {
    name: string;
  };
}

interface DesignationGroup {
  designation: string;
  label: string;
  count: number;
  activities: FieldActivity[];
}

const DESIGNATION_LABELS: Record<string, string> = {
  independent_monitor: "Independent Monitor",
  enumerator: "Enumerator",
  data_collector: "Data Collector",
  electronic_data_manager: "Electronic Data Manager",
  community_directed_distributor: "CDD",
  flhf_supervisor: "FLHF Supervisor",
  lga_supervisor: "LGA Supervisor",
  state_supervisor: "State Supervisor",
  hands_staff: "HANDS Staff",
  cbmg_staff: "CBMG Staff",
  cbmi_staff: "CBMI Staff",
  sightsavers_staff: "Sightsavers Staff",
  plan_intl_staff: "Plan Int'l Staff",
  sci_staff: "SCI Staff",
  other: "Other",
};

// Nigerian Time is UTC+1
const NIGERIAN_CUTOFF_HOUR = 18; // 6 PM WAT

const isActiveSession = (activity: FieldActivity): boolean => {
  if (activity.ended_at) return false;
  
  const startedAt = new Date(activity.started_at);
  const now = new Date();
  
  // Get current time in Nigerian timezone (UTC+1)
  const nigerianTime = new Date(now.getTime() + (1 * 60 * 60 * 1000));
  const nigerianHour = nigerianTime.getUTCHours();
  
  // If past 6 PM Nigerian time, consider session ended for today
  if (nigerianHour >= NIGERIAN_CUTOFF_HOUR) {
    const startDay = startedAt.toDateString();
    const nowDay = now.toDateString();
    if (startDay === nowDay) {
      return false;
    }
  }
  
  return true;
};

const formatSessionDuration = (startedAt: string, endedAt: string | null): string => {
  const start = new Date(startedAt);
  const end = endedAt ? new Date(endedAt) : new Date();
  const diffMs = end.getTime() - start.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const hours = Math.floor(diffMins / 60);
  const mins = diffMins % 60;
  
  if (hours > 0) {
    return `${hours}h ${mins}m`;
  }
  return `${mins}m`;
};

const formatTime = (isoString: string): string => {
  return new Date(isoString).toLocaleTimeString("en-NG", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
};

const FieldActivityTracker = () => {
  const [activities, setActivities] = useState<FieldActivity[]>([]);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  const fetchActivities = async () => {
    setIsLoading(true);
    try {
      // Get today's start in Nigerian time
      const now = new Date();
      const todayStart = new Date(now);
      todayStart.setHours(0, 0, 0, 0);
      
      const { data, error } = await supabase
        .from("field_activity")
        .select(`
          *,
          profiles!field_activity_user_id_fkey (
            first_name,
            last_name,
            designation,
            state,
            lga
          ),
          forms!field_activity_form_id_fkey (
            name
          )
        `)
        .gte("started_at", todayStart.toISOString())
        .order("started_at", { ascending: false });

      if (error) {
        console.error("Error fetching field activities:", error);
        return;
      }

      // Transform data to match our interface
      const transformedData: FieldActivity[] = (data || []).map((item: any) => ({
        ...item,
        user: item.profiles,
        form: item.forms,
      }));

      setActivities(transformedData);
      setLastUpdated(new Date());
    } catch (error) {
      console.error("Error fetching field activities:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchActivities();

    // Set up real-time subscription
    const channel = supabase
      .channel("field-activity-changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "field_activity",
        },
        (payload) => {
          console.log("Field activity change:", payload);
          fetchActivities(); // Refetch to get joined data
        }
      )
      .subscribe();

    // Refresh every 30 seconds
    const interval = setInterval(fetchActivities, 30000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, []);

  const activeActivities = activities.filter(isActiveSession);
  
  // Group by designation
  const groupedByDesignation: DesignationGroup[] = Object.entries(
    activeActivities.reduce((acc, activity) => {
      const designation = activity.user?.designation || "other";
      if (!acc[designation]) {
        acc[designation] = [];
      }
      acc[designation].push(activity);
      return acc;
    }, {} as Record<string, FieldActivity[]>)
  ).map(([designation, activities]) => ({
    designation,
    label: DESIGNATION_LABELS[designation] || designation,
    count: activities.length,
    activities,
  })).sort((a, b) => b.count - a.count);

  const toggleGroup = (designation: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(designation)) {
        next.delete(designation);
      } else {
        next.add(designation);
      }
      return next;
    });
  };

  const uniqueLocations = new Set(
    activeActivities
      .filter((a) => a.user?.state || a.user?.lga)
      .map((a) => `${a.user?.state || ""}-${a.user?.lga || ""}`)
  ).size;

  const geofenceCompliant = activeActivities.filter((a) => a.within_geofence === true).length;
  const geofenceNonCompliant = activeActivities.filter((a) => a.within_geofence === false).length;

  return (
    <Card className="border-0 shadow-card">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="flex items-center gap-2 font-display text-lg">
          <Activity className="h-5 w-5 text-primary" />
          Field Activity
        </CardTitle>
        <Button
          variant="ghost"
          size="icon"
          onClick={fetchActivities}
          disabled={isLoading}
        >
          <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary Stats */}
        <div className="grid grid-cols-2 gap-3">
          <div className="flex items-center gap-3 rounded-lg bg-acg-gold/10 p-3">
            <Users className="h-5 w-5 text-acg-gold" />
            <div>
              <p className="font-display text-xl font-bold text-foreground">
                {activeActivities.length}
              </p>
              <p className="text-xs text-muted-foreground">Active Collectors</p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-lg bg-primary/10 p-3">
            <MapPin className="h-5 w-5 text-primary" />
            <div>
              <p className="font-display text-xl font-bold text-foreground">
                {uniqueLocations}
              </p>
              <p className="text-xs text-muted-foreground">Locations</p>
            </div>
          </div>
        </div>

        {/* Geofence Compliance */}
        <div className="flex items-center justify-between rounded-lg border border-border p-3">
          <span className="text-sm font-medium text-foreground">Geofence Compliance</span>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1">
              <CheckCircle className="h-4 w-4 text-green-500" />
              <span className="text-sm font-medium text-green-600">{geofenceCompliant}</span>
            </div>
            <div className="flex items-center gap-1">
              <XCircle className="h-4 w-4 text-destructive" />
              <span className="text-sm font-medium text-destructive">{geofenceNonCompliant}</span>
            </div>
          </div>
        </div>

        {/* Designation Groups */}
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            By Designation
          </p>
          {groupedByDesignation.length > 0 ? (
            groupedByDesignation.map((group) => (
              <Collapsible
                key={group.designation}
                open={expandedGroups.has(group.designation)}
                onOpenChange={() => toggleGroup(group.designation)}
              >
                <CollapsibleTrigger asChild>
                  <button className="flex w-full items-center justify-between rounded-lg bg-muted/50 p-3 text-left transition-colors hover:bg-muted">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="font-mono">
                        {group.count}
                      </Badge>
                      <span className="text-sm font-medium">{group.label}</span>
                    </div>
                    {expandedGroups.has(group.designation) ? (
                      <ChevronUp className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    )}
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-2">
                  <div className="space-y-2 pl-2">
                    {group.activities.map((activity) => (
                      <div
                        key={activity.id}
                        className="flex items-center justify-between rounded-lg border border-border bg-card p-3"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">
                            {activity.user?.first_name} {activity.user?.last_name}
                          </p>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            {(activity.user?.state || activity.user?.lga) && (
                              <span className="flex items-center gap-1">
                                <MapPin className="h-3 w-3" />
                                {[activity.user.state, activity.user.lga]
                                  .filter(Boolean)
                                  .join(", ")}
                              </span>
                            )}
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {formatTime(activity.started_at)} ({formatSessionDuration(activity.started_at, activity.ended_at)})
                            </span>
                          </div>
                        </div>
                        <div className="ml-2 shrink-0">
                          {activity.within_geofence === true ? (
                            <Badge variant="outline" className="border-green-500 text-green-600">
                              <CheckCircle className="mr-1 h-3 w-3" />
                              In Zone
                            </Badge>
                          ) : activity.within_geofence === false ? (
                            <Badge variant="outline" className="border-destructive text-destructive">
                              <XCircle className="mr-1 h-3 w-3" />
                              Outside
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-muted-foreground">
                              Unknown
                            </Badge>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            ))
          ) : (
            <div className="py-4 text-center text-sm text-muted-foreground">
              No active collectors at this time
            </div>
          )}
        </div>

        {/* Last Updated */}
        <p className="text-center text-xs text-muted-foreground">
          Last updated: {lastUpdated.toLocaleTimeString()}
        </p>
      </CardContent>
    </Card>
  );
};

export default FieldActivityTracker;

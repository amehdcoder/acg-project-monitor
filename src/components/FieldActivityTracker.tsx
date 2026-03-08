import { useState, useEffect } from "react";
import { format, subDays, startOfDay, endOfDay } from "date-fns";
import {
  Users,
  MapPin,
  ClipboardCheck,
  Activity,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  CalendarIcon,
  UserPlus,
  Repeat as RepeatIcon,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

interface SubmissionUser {
  user_id: string;
  first_name: string;
  last_name: string;
  designation: string;
  state: string | null;
  lga: string | null;
}

interface SubmissionEntry {
  id: string;
  user_id: string;
  form_id: string;
  submitted_at: string | null;
  created_at: string;
  data: Record<string, any>;
  location: { lat: number; lng: number } | null;
  submission_type?: string;
  user?: SubmissionUser;
  form_name?: string;
}

interface DesignationGroup {
  designation: string;
  label: string;
  count: number;
  users: { user_id: string; first_name: string; last_name: string; submissionCount: number }[];
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

// Extract state from submission data by checking common field patterns
const extractStateFromSubmission = (data: Record<string, any>): string | null => {
  if (!data || typeof data !== "object") return null;
  const stateKeys = Object.keys(data).filter((k) => {
    const lower = k.toLowerCase();
    return lower.includes("state") || lower.includes("province") || lower.includes("region");
  });
  for (const key of stateKeys) {
    const val = data[key];
    if (typeof val === "string" && val.trim()) return val.trim();
  }
  return null;
};

const PRESET_RANGES = [
  { label: "Today", days: 0 },
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "All", days: -1 },
];

const FieldActivityTracker = () => {
  const [submissions, setSubmissions] = useState<SubmissionEntry[]>([]);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);
  const [activePreset, setActivePreset] = useState<string>("All");

  const applyPreset = (label: string, days: number) => {
    setActivePreset(label);
    if (days === -1) {
      setDateFrom(undefined);
      setDateTo(undefined);
    } else if (days === 0) {
      setDateFrom(startOfDay(new Date()));
      setDateTo(endOfDay(new Date()));
    } else {
      setDateFrom(startOfDay(subDays(new Date(), days)));
      setDateTo(endOfDay(new Date()));
    }
  };

  const fetchData = async () => {
    setIsLoading(true);
    try {
      let query = supabase
        .from("form_submissions")
        .select("id, user_id, form_id, submitted_at, created_at, data, location, submission_type")
        .eq("status", "sent")
        .order("submitted_at", { ascending: false })
        .limit(1000);

      if (dateFrom) {
        query = query.gte("submitted_at", dateFrom.toISOString());
      }
      if (dateTo) {
        query = query.lte("submitted_at", dateTo.toISOString());
      }

      const { data: subData, error: subError } = await query;

      if (subError) {
        console.error("Error fetching submissions:", subError);
        return;
      }

      if (!subData || subData.length === 0) {
        setSubmissions([]);
        setLastUpdated(new Date());
        return;
      }

      // Get unique user IDs
      const userIds = [...new Set(subData.map((s) => s.user_id))];

      // Fetch profiles
      const { data: profilesData } = await supabase
        .from("profiles")
        .select("user_id, first_name, last_name, designation, state, lga")
        .in("user_id", userIds);

      // Fetch form names
      const formIds = [...new Set(subData.map((s) => s.form_id))];
      const { data: formsData } = await supabase
        .from("forms")
        .select("id, name")
        .in("id", formIds);

      const profilesMap = new Map(
        (profilesData || []).map((p) => [p.user_id, p])
      );
      const formsMap = new Map(
        (formsData || []).map((f) => [f.id, f.name])
      );

      const transformed: SubmissionEntry[] = subData.map((item: any) => ({
        ...item,
        data: typeof item.data === "object" && item.data !== null ? item.data : {},
        location: item.location as any,
        user: profilesMap.get(item.user_id) || undefined,
        form_name: formsMap.get(item.form_id) || undefined,
      }));

      setSubmissions(transformed);
      setLastUpdated(new Date());
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [dateFrom, dateTo]);

  useEffect(() => {
    const channel = supabase
      .channel("submission-activity-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "form_submissions" },
        () => fetchData()
      )
      .subscribe();

    const interval = setInterval(fetchData, 60000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, []);

  // Active Collectors: unique users who have submitted forms
  const uniqueActiveUsers = new Set(submissions.map((s) => s.user_id)).size;

  // Locations: distinct states from submission data or user profiles
  const distinctStates = new Set<string>();
  submissions.forEach((s) => {
    // Try extracting state from form submission data first
    const stateFromData = extractStateFromSubmission(s.data as Record<string, any>);
    if (stateFromData) {
      distinctStates.add(stateFromData.toLowerCase());
      return;
    }
    // Fallback to user profile state
    if (s.user?.state) {
      distinctStates.add(s.user.state.toLowerCase());
    }
  });

  // By Designation: group submissions by user designation
  const designationMap = new Map<string, Map<string, { first_name: string; last_name: string; count: number }>>();

  submissions.forEach((s) => {
    const designation = s.user?.designation || "other";
    if (!designationMap.has(designation)) {
      designationMap.set(designation, new Map());
    }
    const userMap = designationMap.get(designation)!;
    const existing = userMap.get(s.user_id);
    if (existing) {
      existing.count++;
    } else {
      userMap.set(s.user_id, {
        first_name: s.user?.first_name || "Unknown",
        last_name: s.user?.last_name || "",
        count: 1,
      });
    }
  });

  const groupedByDesignation: DesignationGroup[] = Array.from(designationMap.entries())
    .map(([designation, userMap]) => ({
      designation,
      label: DESIGNATION_LABELS[designation] || designation,
      count: Array.from(userMap.values()).reduce((sum, u) => sum + u.count, 0),
      users: Array.from(userMap.entries()).map(([user_id, u]) => ({
        user_id,
        first_name: u.first_name,
        last_name: u.last_name,
        submissionCount: u.count,
      })),
    }))
    .sort((a, b) => b.count - a.count);

  const toggleGroup = (designation: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(designation)) next.delete(designation);
      else next.add(designation);
      return next;
    });
  };

  return (
    <Card className="border-0 shadow-card">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="flex items-center gap-2 font-display text-lg">
          <Activity className="h-5 w-5 text-primary" />
          Field Activity
        </CardTitle>
        <Button variant="ghost" size="icon" onClick={fetchData} disabled={isLoading}>
          <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Date Range Filter */}
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1">
            {PRESET_RANGES.map((preset) => (
              <Button
                key={preset.label}
                variant={activePreset === preset.label ? "default" : "outline"}
                size="sm"
                className="h-7 text-xs"
                onClick={() => applyPreset(preset.label, preset.days)}
              >
                {preset.label}
              </Button>
            ))}
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant={activePreset === "custom" ? "default" : "outline"}
                  size="sm"
                  className="h-7 text-xs gap-1"
                >
                  <CalendarIcon className="h-3 w-3" />
                  {activePreset === "custom" && dateFrom
                    ? `${format(dateFrom, "MMM d")} - ${dateTo ? format(dateTo, "MMM d") : "..."}`
                    : "Custom"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="range"
                  selected={{ from: dateFrom, to: dateTo }}
                  onSelect={(range) => {
                    setActivePreset("custom");
                    setDateFrom(range?.from ? startOfDay(range.from) : undefined);
                    setDateTo(range?.to ? endOfDay(range.to) : undefined);
                  }}
                  numberOfMonths={1}
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="flex items-center gap-3 rounded-lg bg-acg-gold/10 p-3">
            <Users className="h-5 w-5 text-acg-gold" />
            <div>
              <p className="font-display text-xl font-bold text-foreground">
                {uniqueActiveUsers}
              </p>
              <p className="text-xs text-muted-foreground">Collectors</p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-lg bg-green-500/10 p-3">
            <ClipboardCheck className="h-5 w-5 text-green-600" />
            <div>
              <p className="font-display text-xl font-bold text-foreground">
                {submissions.length}
              </p>
              <p className="text-xs text-muted-foreground">Total</p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-lg bg-blue-500/10 p-3">
            <UserPlus className="h-5 w-5 text-blue-600" />
            <div>
              <p className="font-display text-xl font-bold text-foreground">
                {submissions.filter(s => s.submission_type === 'registration').length}
              </p>
              <p className="text-xs text-muted-foreground">Registrations</p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-lg bg-amber-500/10 p-3">
            <RepeatIcon className="h-5 w-5 text-amber-600" />
            <div>
              <p className="font-display text-xl font-bold text-foreground">
                {submissions.filter(s => s.submission_type === 'follow_up').length}
              </p>
              <p className="text-xs text-muted-foreground">Follow-ups</p>
            </div>
          </div>
        </div>
        {/* Location Stats */}
        <div className="flex items-center gap-3 rounded-lg bg-primary/10 p-3">
          <MapPin className="h-5 w-5 text-primary" />
          <div>
            <p className="font-display text-xl font-bold text-foreground">
              {distinctStates.size}
            </p>
            <p className="text-xs text-muted-foreground">States</p>
          </div>
        </div>

        {/* Designation Groups */}
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Submissions by Designation
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
                    {group.users.map((user) => (
                      <div
                        key={user.user_id}
                        className="flex items-center justify-between rounded-lg border border-border bg-card p-3"
                      >
                        <p className="truncate text-sm font-medium">
                          {user.first_name} {user.last_name}
                        </p>
                        <Badge variant="outline" className="text-muted-foreground">
                          {user.submissionCount} submission{user.submissionCount !== 1 ? "s" : ""}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            ))
          ) : (
            <div className="py-4 text-center text-sm text-muted-foreground">
              No submissions yet
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

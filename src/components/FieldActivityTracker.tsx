import { useState, useEffect, useMemo } from "react";
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
  FolderOpen,
  FileText,
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
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LabelList, Cell, PieChart, Pie,
} from "recharts";

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
  project_name?: string;
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

const DESIGNATION_COLORS = [
  "hsl(142, 60%, 35%)", "hsl(142, 50%, 45%)", "hsl(142, 40%, 55%)",
  "hsl(142, 30%, 65%)", "hsl(30, 80%, 50%)", "hsl(0, 70%, 50%)",
  "hsl(210, 60%, 50%)", "hsl(280, 50%, 50%)", "hsl(45, 80%, 50%)",
  "hsl(180, 50%, 45%)", "hsl(330, 50%, 50%)", "hsl(60, 70%, 40%)",
];

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

const FionetKPIBlock = ({
  label, value, color,
}: {
  label: string; value: string | number; color: string;
}) => (
  <div className={`rounded-lg p-2.5 text-white text-center ${color} shadow-sm`}>
    <p className="text-[8px] sm:text-[9px] font-semibold leading-tight uppercase tracking-wider opacity-90">{label}</p>
    <p className="text-base sm:text-lg font-bold">{typeof value === "number" ? value.toLocaleString() : value}</p>
  </div>
);

interface FieldActivityTrackerProps {
  selectedProjectId?: string | null;
}

const FieldActivityTracker = ({ selectedProjectId }: FieldActivityTrackerProps) => {
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
      let formIdFilter: string[] | null = null;
      if (selectedProjectId) {
        const { data: projForms } = await supabase.from("forms").select("id").eq("project_id", selectedProjectId);
        formIdFilter = (projForms || []).map(f => f.id);
        if (formIdFilter.length === 0) { setSubmissions([]); setLastUpdated(new Date()); setIsLoading(false); return; }
      }

      let query = supabase
        .from("form_submissions")
        .select("id, user_id, form_id, submitted_at, created_at, data, location, submission_type")
        .eq("status", "sent")
        .order("submitted_at", { ascending: false })
        .limit(1000);

      if (dateFrom) query = query.gte("submitted_at", dateFrom.toISOString());
      if (dateTo) query = query.lte("submitted_at", dateTo.toISOString());
      if (formIdFilter) query = query.in("form_id", formIdFilter);

      const { data: subData, error: subError } = await query;
      if (subError) { console.error(subError); return; }
      if (!subData || subData.length === 0) { setSubmissions([]); setLastUpdated(new Date()); return; }

      const userIds = [...new Set(subData.map(s => s.user_id))];
      const formIds = [...new Set(subData.map(s => s.form_id))];

      const [profilesRes, formsRes] = await Promise.all([
        supabase.from("profiles").select("user_id, first_name, last_name, designation, state, lga").in("user_id", userIds),
        supabase.from("forms").select("id, name, project_id").in("id", formIds),
      ]);

      // Get project names
      const projectIds = [...new Set((formsRes.data || []).map(f => f.project_id))];
      const { data: projectsData } = await supabase.from("projects").select("id, name").in("id", projectIds);

      const profilesMap = new Map((profilesRes.data || []).map(p => [p.user_id, p]));
      const formsMap = new Map((formsRes.data || []).map(f => [f.id, f]));
      const projectsMap = new Map((projectsData || []).map(p => [p.id, p.name]));

      const transformed: SubmissionEntry[] = subData.map((item: any) => {
        const form = formsMap.get(item.form_id);
        return {
          ...item,
          data: typeof item.data === "object" && item.data !== null ? item.data : {},
          location: item.location as any,
          user: profilesMap.get(item.user_id) || undefined,
          form_name: form?.name || undefined,
          project_name: form ? projectsMap.get(form.project_id) || undefined : undefined,
        };
      });

      setSubmissions(transformed);
      setLastUpdated(new Date());
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [dateFrom, dateTo, selectedProjectId]);

  useEffect(() => {
    const channel = supabase
      .channel("submission-activity-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "form_submissions" }, () => fetchData())
      .subscribe();
    const interval = setInterval(fetchData, 60000);
    return () => { supabase.removeChannel(channel); clearInterval(interval); };
  }, []);

  const uniqueActiveUsers = new Set(submissions.map(s => s.user_id)).size;
  const registrations = submissions.filter(s => s.submission_type === "registration").length;
  const followUps = submissions.filter(s => s.submission_type === "follow_up").length;

  const distinctStates = new Set<string>();
  submissions.forEach(s => {
    const stateFromData = extractStateFromSubmission(s.data as Record<string, any>);
    if (stateFromData) { distinctStates.add(stateFromData.toLowerCase()); return; }
    if (s.user?.state) distinctStates.add(s.user.state.toLowerCase());
  });

  // Build designation groups
  const designationMap = new Map<string, Map<string, { first_name: string; last_name: string; count: number }>>();
  submissions.forEach(s => {
    const designation = s.user?.designation || "other";
    if (!designationMap.has(designation)) designationMap.set(designation, new Map());
    const userMap = designationMap.get(designation)!;
    const existing = userMap.get(s.user_id);
    if (existing) existing.count++;
    else userMap.set(s.user_id, { first_name: s.user?.first_name || "Unknown", last_name: s.user?.last_name || "", count: 1 });
  });

  const groupedByDesignation: DesignationGroup[] = Array.from(designationMap.entries())
    .map(([designation, userMap]) => ({
      designation,
      label: DESIGNATION_LABELS[designation] || designation,
      count: Array.from(userMap.values()).reduce((sum, u) => sum + u.count, 0),
      users: Array.from(userMap.entries()).map(([user_id, u]) => ({ user_id, ...u, submissionCount: u.count })),
    }))
    .sort((a, b) => b.count - a.count);

  // Chart data for designation breakdown
  const designationChartData = groupedByDesignation.map((g, i) => ({
    name: g.label,
    value: g.count,
    pct: submissions.length > 0 ? Math.round((g.count / submissions.length) * 100) : 0,
    fill: DESIGNATION_COLORS[i % DESIGNATION_COLORS.length],
  }));

  const toggleGroup = (designation: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      next.has(designation) ? next.delete(designation) : next.add(designation);
      return next;
    });
  };

  return (
    <Card className="border-0 shadow-card">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="flex items-center gap-2 font-display text-base sm:text-lg">
          <Activity className="h-5 w-5 text-[hsl(142,60%,35%)]" />
          Field Activity
        </CardTitle>
        <Button variant="ghost" size="icon" onClick={fetchData} disabled={isLoading}>
          <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Date Range Filter */}
        <div className="flex flex-wrap gap-1">
          {PRESET_RANGES.map(preset => (
            <Button key={preset.label} variant={activePreset === preset.label ? "default" : "outline"} size="sm" className="h-7 text-xs" onClick={() => applyPreset(preset.label, preset.days)}>
              {preset.label}
            </Button>
          ))}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant={activePreset === "custom" ? "default" : "outline"} size="sm" className="h-7 text-xs gap-1">
                <CalendarIcon className="h-3 w-3" />
                {activePreset === "custom" && dateFrom ? `${format(dateFrom, "MMM d")} - ${dateTo ? format(dateTo, "MMM d") : "..."}` : "Custom"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="range" selected={{ from: dateFrom, to: dateTo }} onSelect={(range) => { setActivePreset("custom"); setDateFrom(range?.from ? startOfDay(range.from) : undefined); setDateTo(range?.to ? endOfDay(range.to) : undefined); }} numberOfMonths={1} className={cn("p-3 pointer-events-auto")} />
            </PopoverContent>
          </Popover>
        </div>

        {/* FIONET KPI Blocks */}
        <div className="grid grid-cols-2 gap-2">
          <FionetKPIBlock label="Active Collectors" value={uniqueActiveUsers} color="bg-[hsl(142,60%,35%)]" />
          <FionetKPIBlock label="Total Submissions" value={submissions.length} color="bg-[hsl(142,50%,45%)]" />
          <FionetKPIBlock label="Registrations" value={registrations} color="bg-[hsl(210,50%,50%)]" />
          <FionetKPIBlock label="Follow-ups" value={followUps} color="bg-[hsl(30,80%,50%)]" />
        </div>

        {/* States KPI */}
        <div className="rounded-lg p-2.5 text-white text-center bg-[hsl(142,40%,55%)] shadow-sm">
          <div className="flex items-center gap-1.5 justify-center">
            <MapPin className="h-3.5 w-3.5" />
            <p className="text-[9px] font-semibold uppercase tracking-wider opacity-90">States Covered</p>
          </div>
          <p className="text-lg font-bold">{distinctStates.size}</p>
        </div>

        {/* Designation FIONET Chart */}
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-[hsl(142,60%,35%)] flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5" />
            Submissions by Designation
          </p>

          {designationChartData.length > 0 && (
            <>
              {/* Stacked horizontal bars */}
              <div className="space-y-1.5">
                {designationChartData.map((item, i) => (
                  <div key={item.name} className="space-y-0.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-medium text-foreground truncate max-w-[60%]">{item.name}</span>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-bold" style={{ color: item.fill }}>{item.pct}%</span>
                        <span className="text-[9px] text-muted-foreground">({item.value})</span>
                      </div>
                    </div>
                    <div className="w-full h-2.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${item.pct}%`, backgroundColor: item.fill }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              {/* Legend */}
              <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
                {designationChartData.slice(0, 6).map(item => (
                  <div key={item.name} className="flex items-center gap-1">
                    <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: item.fill }} />
                    <span className="text-[9px] text-muted-foreground">{item.name}</span>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Expandable designation detail */}
          <div className="space-y-1 mt-2">
            {groupedByDesignation.map((group, i) => (
              <Collapsible
                key={group.designation}
                open={expandedGroups.has(group.designation)}
                onOpenChange={() => toggleGroup(group.designation)}
              >
                <CollapsibleTrigger asChild>
                  <button className="flex w-full items-center justify-between rounded-lg bg-muted/40 p-2.5 text-left transition-colors hover:bg-muted/70">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: DESIGNATION_COLORS[i % DESIGNATION_COLORS.length] }} />
                      <span className="text-xs font-medium">{group.label}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="font-mono text-[10px] h-5">{group.count}</Badge>
                      {expandedGroups.has(group.designation) ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
                    </div>
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-1 pl-4">
                  <div className="space-y-1">
                    {group.users.map(user => (
                      <div key={user.user_id} className="flex items-center justify-between rounded-md border border-border/50 bg-card p-2">
                        <p className="truncate text-[11px] font-medium">{user.first_name} {user.last_name}</p>
                        <Badge variant="outline" className="text-[9px] h-4 px-1.5">{user.submissionCount}</Badge>
                      </div>
                    ))}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            ))}
            {groupedByDesignation.length === 0 && (
              <div className="py-4 text-center text-xs text-muted-foreground">No submissions yet</div>
            )}
          </div>
        </div>

        <p className="text-center text-[10px] text-muted-foreground">
          Last updated: {lastUpdated.toLocaleTimeString()}
        </p>
      </CardContent>
    </Card>
  );
};

export default FieldActivityTracker;

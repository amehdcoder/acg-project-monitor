import { useState, useEffect, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  User,
  Calendar,
  Clock,
  FileText,
  History,
  UserPlus,
  RefreshCw,
  XCircle,
  Tag,
  BarChart3,
  TrendingUp,
  ArrowRight,
  ChevronDown,
  ChevronRight,
  Share2,
  StickyNote,
  CheckSquare,
  CheckCircle2,
  AlertCircle,
  UserCheck,
  Trash2,
  Users,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { format, differenceInDays, startOfMonth, endOfMonth, eachMonthOfInterval, eachWeekOfInterval, startOfWeek, endOfWeek, isWithinInterval } from "date-fns";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
} from "recharts";

interface CaseActivity {
  id: string;
  activityType: string;
  performedAt: string;
  performedBy: string;
  performerName?: string;
  formSubmissionId?: string;
  changes: Record<string, any>;
  notes?: string;
}

interface CaseReferral {
  id: string;
  referral_type: string | null;
  destination: string | null;
  reason: string | null;
  priority: string | null;
  status: string;
  created_at: string;
  assigned_to: string | null;
  accepted_by: string | null;
}

interface CaseNote {
  id: string;
  note: string;
  visibility: string | null;
  created_at: string;
  author_id: string;
  authorName?: string;
}

interface CaseTask {
  id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  status: string;
  created_at: string;
}

interface Member {
  user_id: string;
  name: string;
}

interface CasePermission {
  id: string;
  shared_with_user_id: string;
  share_level: string | null;
  created_at: string;
  userName?: string;
}


interface CaseDetailsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  caseId?: string;
}

const CaseDetails = ({ open, onOpenChange, caseId }: CaseDetailsProps) => {
  const { user } = useAuth();
  const [caseData, setCaseData] = useState<any>(null);
  const [activities, setActivities] = useState<CaseActivity[]>([]);
  const [referrals, setReferrals] = useState<CaseReferral[]>([]);
  const [notes, setNotes] = useState<CaseNote[]>([]);
  const [tasks, setTasks] = useState<CaseTask[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [permissions, setPermissions] = useState<CasePermission[]>([]);
  const [shareUserId, setShareUserId] = useState<string>("");
  const [shareLevel, setShareLevel] = useState<string>("read");
  const [loading, setLoading] = useState(true);

  const memberName = (id: string | null) =>
    id ? members.find((m) => m.user_id === id)?.name || "Unknown" : null;

  useEffect(() => {
    if (open && caseId) {
      fetchCaseDetails();
      fetchCaseActivities();
      fetchReferrals();
      fetchNotes();
      fetchTasks();
      fetchPermissions();
    }
  }, [open, caseId]);

  // Fetch assignable members once the case (and its project) is loaded
  useEffect(() => {
    if (open && caseData?.project_id) {
      fetchMembers(caseData.project_id);
    }
  }, [open, caseData?.project_id]);

  const fetchMembers = async (projectId: string) => {
    try {
      const { data: assignments } = await supabase
        .from("user_project_assignments")
        .select("user_id")
        .eq("project_id", projectId);
      const ids = [...new Set((assignments || []).map((a) => a.user_id))];
      if (caseData?.owner_id) ids.push(caseData.owner_id);
      const uniqueIds = [...new Set(ids)];
      if (uniqueIds.length === 0) {
        setMembers([]);
        return;
      }
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, first_name, last_name")
        .in("user_id", uniqueIds);
      setMembers(
        (profiles || []).map((p) => ({
          user_id: p.user_id,
          name: `${p.first_name || ""} ${p.last_name || ""}`.trim() || "Unnamed",
        }))
      );
    } catch (error) {
      console.error("Error fetching members:", error);
    }
  };

  const fetchPermissions = async () => {
    if (!caseId) return;
    try {
      const { data, error } = await supabase
        .from("case_permissions")
        .select("*")
        .eq("case_id", caseId)
        .order("created_at", { ascending: false });
      if (error) throw error;

      const ids = [...new Set((data || []).map((p) => p.shared_with_user_id))];
      let profilesMap = new Map<string, string>();
      if (ids.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id, first_name, last_name")
          .in("user_id", ids);
        profilesMap = new Map(
          (profiles || []).map((p) => [p.user_id, `${p.first_name || ""} ${p.last_name || ""}`.trim()])
        );
      }
      setPermissions(
        (data || []).map((p) => ({
          ...(p as CasePermission),
          userName: profilesMap.get(p.shared_with_user_id) || undefined,
        }))
      );
    } catch (error) {
      console.error("Error fetching permissions:", error);
    }
  };

  const assignReferral = async (referral: CaseReferral, assigneeId: string) => {
    try {
      const { error } = await supabase
        .from("case_referrals")
        .update({ assigned_to: assigneeId })
        .eq("id", referral.id);
      if (error) throw error;
      toast({ title: "Referral routed", description: `Assigned to ${memberName(assigneeId)}.` });
      fetchReferrals();
    } catch (error) {
      console.error("Error assigning referral:", error);
      toast({ title: "Error", description: "Failed to assign referral.", variant: "destructive" });
    }
  };

  const shareCase = async () => {
    if (!caseId || !shareUserId) return;
    try {
      const { error } = await supabase.from("case_permissions").insert({
        case_id: caseId,
        shared_with_user_id: shareUserId,
        share_level: shareLevel,
        granted_by: user?.id,
      });
      if (error) throw error;
      toast({ title: "Case shared", description: `Shared with ${memberName(shareUserId)}.` });
      setShareUserId("");
      fetchPermissions();
    } catch (error: any) {
      console.error("Error sharing case:", error);
      toast({
        title: "Error",
        description: error?.code === "23505" ? "Already shared with this user." : "Failed to share case.",
        variant: "destructive",
      });
    }
  };

  const revokeShare = async (permissionId: string) => {
    try {
      const { error } = await supabase.from("case_permissions").delete().eq("id", permissionId);
      if (error) throw error;
      fetchPermissions();
    } catch (error) {
      console.error("Error revoking share:", error);
      toast({ title: "Error", description: "Failed to revoke access.", variant: "destructive" });
    }
  };


  const fetchReferrals = async () => {
    if (!caseId) return;
    try {
      const { data, error } = await supabase
        .from("case_referrals")
        .select("*")
        .eq("case_id", caseId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      setReferrals((data || []) as CaseReferral[]);
    } catch (error) {
      console.error("Error fetching referrals:", error);
    }
  };

  const fetchNotes = async () => {
    if (!caseId) return;
    try {
      const { data, error } = await supabase
        .from("case_notes")
        .select("*")
        .eq("case_id", caseId)
        .order("created_at", { ascending: false });
      if (error) throw error;

      const authorIds = [...new Set((data || []).map((n) => n.author_id))];
      let profilesMap = new Map<string, string>();
      if (authorIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id, first_name, last_name")
          .in("user_id", authorIds);
        profilesMap = new Map(
          (profiles || []).map((p) => [p.user_id, `${p.first_name} ${p.last_name}`])
        );
      }
      setNotes(
        (data || []).map((n) => ({
          ...(n as CaseNote),
          authorName: profilesMap.get(n.author_id) || undefined,
        }))
      );
    } catch (error) {
      console.error("Error fetching notes:", error);
    }
  };

  const fetchTasks = async () => {
    if (!caseId) return;
    try {
      const { data, error } = await supabase
        .from("case_tasks")
        .select("*")
        .eq("case_id", caseId)
        .order("due_date", { ascending: true, nullsFirst: false });
      if (error) throw error;
      setTasks((data || []) as CaseTask[]);
    } catch (error) {
      console.error("Error fetching tasks:", error);
    }
  };

  const advanceReferralStatus = async (referral: CaseReferral) => {
    const flow: Record<string, string> = {
      pending: "accepted",
      accepted: "completed",
      completed: "completed",
      rejected: "rejected",
    };
    const next = flow[referral.status] || "accepted";
    if (next === referral.status) return;
    const payload: { status: string; accepted_by?: string; completed_at?: string } = { status: next };
    if (next === "accepted" && user?.id) payload.accepted_by = user.id;
    if (next === "completed") payload.completed_at = new Date().toISOString();
    try {
      const { error } = await supabase
        .from("case_referrals")
        .update(payload)
        .eq("id", referral.id);
      if (error) throw error;
      toast({ title: "Referral updated", description: `Status set to ${next}.` });
      fetchReferrals();
    } catch (error) {
      console.error("Error updating referral:", error);
      toast({ title: "Error", description: "Failed to update referral.", variant: "destructive" });
    }
  };


  const toggleTaskStatus = async (task: CaseTask) => {
    const next = task.status === "completed" ? "pending" : "completed";
    try {
      const { error } = await supabase
        .from("case_tasks")
        .update({
          status: next,
          completed_at: next === "completed" ? new Date().toISOString() : null,
        })
        .eq("id", task.id);
      if (error) throw error;
      fetchTasks();
    } catch (error) {
      console.error("Error updating task:", error);
      toast({ title: "Error", description: "Failed to update task.", variant: "destructive" });
    }
  };



  const fetchCaseDetails = async () => {
    if (!caseId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("cases")
        .select(`*, case_types(name, label, properties)`)
        .eq("id", caseId)
        .single();
      if (error) throw error;
      setCaseData(data);
    } catch (error) {
      console.error("Error fetching case details:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchCaseActivities = async () => {
    if (!caseId) return;
    try {
      const { data, error } = await supabase
        .from("case_activities")
        .select("*")
        .eq("case_id", caseId)
        .order("performed_at", { ascending: false });
      if (error) throw error;

      // Fetch performer names
      const performerIds = [...new Set((data || []).map(a => a.performed_by))];
      let profilesMap = new Map<string, string>();
      if (performerIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id, first_name, last_name")
          .in("user_id", performerIds);
        profilesMap = new Map(
          (profiles || []).map(p => [p.user_id, `${p.first_name} ${p.last_name}`])
        );
      }

      setActivities(
        (data || []).map((a) => ({
          id: a.id,
          activityType: a.activity_type,
          performedAt: a.performed_at,
          performedBy: a.performed_by,
          performerName: profilesMap.get(a.performed_by) || undefined,
          formSubmissionId: a.form_submission_id,
          changes: a.changes as Record<string, any>,
          notes: a.notes,
        }))
      );
    } catch (error) {
      console.error("Error fetching case activities:", error);
    }
  };

  // Compute timeline chart data
  const timelineData = useMemo(() => {
    if (activities.length === 0) return [];

    const sortedActivities = [...activities].sort(
      (a, b) => new Date(a.performedAt).getTime() - new Date(b.performedAt).getTime()
    );

    const firstDate = new Date(sortedActivities[0].performedAt);
    const lastDate = new Date(sortedActivities[sortedActivities.length - 1].performedAt);
    const daySpan = differenceInDays(lastDate, firstDate);

    // Use weeks if span > 30 days, otherwise use individual dates
    if (daySpan > 60) {
      // Monthly buckets
      const months = eachMonthOfInterval({ start: firstDate, end: lastDate });
      return months.map(month => {
        const monthStart = startOfMonth(month);
        const monthEnd = endOfMonth(month);
        const followUps = sortedActivities.filter(
          a => a.activityType === "follow_up" && isWithinInterval(new Date(a.performedAt), { start: monthStart, end: monthEnd })
        ).length;
        const registrations = sortedActivities.filter(
          a => a.activityType === "registration" && isWithinInterval(new Date(a.performedAt), { start: monthStart, end: monthEnd })
        ).length;
        const other = sortedActivities.filter(
          a => a.activityType !== "follow_up" && a.activityType !== "registration" && isWithinInterval(new Date(a.performedAt), { start: monthStart, end: monthEnd })
        ).length;
        return {
          label: format(month, "MMM yyyy"),
          "Follow-ups": followUps,
          "Registrations": registrations,
          "Other": other,
        };
      });
    } else if (daySpan > 14) {
      // Weekly buckets
      const weeks = eachWeekOfInterval({ start: firstDate, end: lastDate }, { weekStartsOn: 1 });
      return weeks.map(week => {
        const weekStart = startOfWeek(week, { weekStartsOn: 1 });
        const weekEnd = endOfWeek(week, { weekStartsOn: 1 });
        const followUps = sortedActivities.filter(
          a => a.activityType === "follow_up" && isWithinInterval(new Date(a.performedAt), { start: weekStart, end: weekEnd })
        ).length;
        const registrations = sortedActivities.filter(
          a => a.activityType === "registration" && isWithinInterval(new Date(a.performedAt), { start: weekStart, end: weekEnd })
        ).length;
        const other = sortedActivities.filter(
          a => a.activityType !== "follow_up" && a.activityType !== "registration" && isWithinInterval(new Date(a.performedAt), { start: weekStart, end: weekEnd })
        ).length;
        return {
          label: `${format(weekStart, "MMM d")}`,
          "Follow-ups": followUps,
          "Registrations": registrations,
          "Other": other,
        };
      });
    } else {
      // Daily: group by date
      const dateMap = new Map<string, { followUps: number; registrations: number; other: number }>();
      sortedActivities.forEach(a => {
        const dateKey = format(new Date(a.performedAt), "MMM d");
        const entry = dateMap.get(dateKey) || { followUps: 0, registrations: 0, other: 0 };
        if (a.activityType === "follow_up") entry.followUps++;
        else if (a.activityType === "registration") entry.registrations++;
        else entry.other++;
        dateMap.set(dateKey, entry);
      });
      return Array.from(dateMap.entries()).map(([label, counts]) => ({
        label,
        "Follow-ups": counts.followUps,
        "Registrations": counts.registrations,
        "Other": counts.other,
      }));
    }
  }, [activities]);

  // Compute cumulative follow-up chart
  const cumulativeData = useMemo(() => {
    if (activities.length === 0) return [];
    const sorted = [...activities]
      .sort((a, b) => new Date(a.performedAt).getTime() - new Date(b.performedAt).getTime());
    let cumulative = 0;
    return sorted.map(a => {
      cumulative++;
      return {
        label: format(new Date(a.performedAt), "MMM d"),
        date: a.performedAt,
        total: cumulative,
      };
    });
  }, [activities]);

  // Summary stats
  const stats = useMemo(() => {
    const followUps = activities.filter(a => a.activityType === "follow_up").length;
    const totalActivities = activities.length;
    const uniquePerformers = new Set(activities.map(a => a.performedBy)).size;
    const daysSinceOpened = caseData
      ? differenceInDays(new Date(), new Date(caseData.opened_at))
      : 0;
    return { followUps, totalActivities, uniquePerformers, daysSinceOpened };
  }, [activities, caseData]);

  const getActivityIcon = (type: string) => {
    switch (type) {
      case "registration": return <UserPlus className="h-4 w-4 text-green-500" />;
      case "follow_up": return <RefreshCw className="h-4 w-4 text-blue-500" />;
      case "update": return <FileText className="h-4 w-4 text-yellow-500" />;
      case "close": case "closure": return <XCircle className="h-4 w-4 text-red-500" />;
      case "reopen": return <RefreshCw className="h-4 w-4 text-green-500" />;
      default: return <History className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getActivityLabel = (type: string) => {
    switch (type) {
      case "registration": return "Case Registered";
      case "follow_up": return "Follow-up Visit";
      case "update": return "Case Updated";
      case "close": case "closure": return "Case Closed";
      case "reopen": return "Case Reopened";
      default: return type;
    }
  };

  const PropertyChangeDiff = ({ changes }: { changes: Record<string, any> }) => {
    const [expanded, setExpanded] = useState(false);

    if (!changes || Object.keys(changes).length === 0) return null;

    // Support two formats:
    // 1. { key: { old: x, new: y } }  (structured diff)
    // 2. { key: value }               (flat — show as "new" values only)
    const entries = Object.entries(changes);
    const hasStructuredDiff = entries.some(
      ([, v]) => v && typeof v === "object" && ("old" in v || "new" in v)
    );

    if (!hasStructuredDiff && entries.length === 0) return null;

    return (
      <div className="mt-2">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 text-xs text-primary hover:underline"
        >
          {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          {entries.length} property {entries.length === 1 ? "change" : "changes"}
        </button>
        {expanded && (
          <div className="mt-2 space-y-1.5 rounded-md border border-border bg-muted/30 p-2">
            {entries.map(([key, value]) => {
              const label = key.replace(/_/g, " ");
              if (hasStructuredDiff && value && typeof value === "object" && ("old" in value || "new" in value)) {
                const oldVal = value.old != null ? String(value.old) : "—";
                const newVal = value.new != null ? String(value.new) : "—";
                const changed = oldVal !== newVal;
                return (
                  <div key={key} className="flex items-start gap-2 text-xs">
                    <span className="text-muted-foreground capitalize min-w-[80px] shrink-0">{label}</span>
                    <span className={`line-through ${changed ? "text-destructive/70" : "text-muted-foreground"}`}>
                      {oldVal}
                    </span>
                    <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0 mt-0.5" />
                    <span className={changed ? "text-primary font-medium" : "text-muted-foreground"}>
                      {newVal}
                    </span>
                  </div>
                );
              }
              // Flat format — just show the value
              return (
                <div key={key} className="flex items-start gap-2 text-xs">
                  <span className="text-muted-foreground capitalize min-w-[80px] shrink-0">{label}</span>
                  <span className="text-primary font-medium">{String(value)}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  if (!caseData) return null;

  const properties = caseData.properties || {};
  const caseType = caseData.case_types;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="h-5 w-5 text-primary" />
            {caseData.name}
          </DialogTitle>
          <DialogDescription className="flex items-center gap-3">
            <Badge variant="outline">{caseType?.label}</Badge>
            <Badge variant={caseData.status === "open" ? "default" : "secondary"}>
              {caseData.status === "open" ? "Open" : "Closed"}
            </Badge>
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="timeline" className="w-full">
          <TabsList className="grid w-full grid-cols-7">
            <TabsTrigger value="timeline">
              <BarChart3 className="h-4 w-4 mr-1.5" />
              <span className="hidden sm:inline">Timeline</span>
            </TabsTrigger>
            <TabsTrigger value="properties">
              <Tag className="h-4 w-4 mr-1.5" />
              <span className="hidden sm:inline">Properties</span>
            </TabsTrigger>
            <TabsTrigger value="referrals">
              <Share2 className="h-4 w-4 mr-1.5" />
              <span className="hidden sm:inline">Referrals</span>
              {referrals.length > 0 && (
                <Badge variant="secondary" className="ml-1.5 h-4 px-1 text-[10px]">{referrals.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="notes">
              <StickyNote className="h-4 w-4 mr-1.5" />
              <span className="hidden sm:inline">Notes</span>
              {notes.length > 0 && (
                <Badge variant="secondary" className="ml-1.5 h-4 px-1 text-[10px]">{notes.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="tasks">
              <CheckSquare className="h-4 w-4 mr-1.5" />
              <span className="hidden sm:inline">Tasks</span>
              {tasks.length > 0 && (
                <Badge variant="secondary" className="ml-1.5 h-4 px-1 text-[10px]">{tasks.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="sharing">
              <Users className="h-4 w-4 mr-1.5" />
              <span className="hidden sm:inline">Sharing</span>
              {permissions.length > 0 && (
                <Badge variant="secondary" className="ml-1.5 h-4 px-1 text-[10px]">{permissions.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="history">
              <History className="h-4 w-4 mr-1.5" />
              <span className="hidden sm:inline">History</span>
            </TabsTrigger>

          </TabsList>


          {/* Timeline Tab */}
          <TabsContent value="timeline">
            <ScrollArea className="h-[420px] pr-4">
              <div className="space-y-4">
                {/* Summary KPIs */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div className="rounded-lg bg-primary/10 p-3 text-center">
                    <p className="font-display text-2xl font-bold text-foreground">{stats.totalActivities}</p>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Activities</p>
                  </div>
                  <div className="rounded-lg bg-blue-500/10 p-3 text-center">
                    <p className="font-display text-2xl font-bold text-foreground">{stats.followUps}</p>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Follow-ups</p>
                  </div>
                  <div className="rounded-lg bg-amber-500/10 p-3 text-center">
                    <p className="font-display text-2xl font-bold text-foreground">{stats.uniquePerformers}</p>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Contributors</p>
                  </div>
                  <div className="rounded-lg bg-muted p-3 text-center">
                    <p className="font-display text-2xl font-bold text-foreground">{stats.daysSinceOpened}</p>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Days Open</p>
                  </div>
                </div>

                {activities.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-40 text-center">
                    <BarChart3 className="h-12 w-12 text-muted-foreground/30 mb-3" />
                    <p className="text-muted-foreground text-sm">No activity data to chart yet</p>
                    <p className="text-xs text-muted-foreground/70 mt-1">Follow-up visits will appear here over time</p>
                  </div>
                ) : (
                  <>
                    {/* Activity Bar Chart */}
                    <Card className="border-0 shadow-card">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <BarChart3 className="h-4 w-4 text-primary" />
                          Activity Over Time
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="pb-4">
                        <ResponsiveContainer width="100%" height={180}>
                          <BarChart data={timelineData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                            <XAxis dataKey="label" tick={{ fontSize: 10 }} className="fill-muted-foreground" />
                            <YAxis allowDecimals={false} tick={{ fontSize: 10 }} className="fill-muted-foreground" />
                            <Tooltip
                              contentStyle={{
                                backgroundColor: "hsl(var(--card))",
                                border: "1px solid hsl(var(--border))",
                                borderRadius: "8px",
                                fontSize: "12px",
                              }}
                            />
                            <Bar dataKey="Follow-ups" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
                            <Bar dataKey="Registrations" fill="hsl(142, 76%, 36%)" radius={[3, 3, 0, 0]} />
                            <Bar dataKey="Other" fill="hsl(var(--muted-foreground))" radius={[3, 3, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </CardContent>
                    </Card>

                    {/* Cumulative Activity Trend */}
                    <Card className="border-0 shadow-card">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <TrendingUp className="h-4 w-4 text-primary" />
                          Cumulative Activity
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="pb-4">
                        <ResponsiveContainer width="100%" height={150}>
                          <AreaChart data={cumulativeData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                            <defs>
                              <linearGradient id="cumulativeGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                                <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                            <XAxis dataKey="label" tick={{ fontSize: 10 }} className="fill-muted-foreground" />
                            <YAxis allowDecimals={false} tick={{ fontSize: 10 }} className="fill-muted-foreground" />
                            <Tooltip
                              contentStyle={{
                                backgroundColor: "hsl(var(--card))",
                                border: "1px solid hsl(var(--border))",
                                borderRadius: "8px",
                                fontSize: "12px",
                              }}
                            />
                            <Area
                              type="monotone"
                              dataKey="total"
                              stroke="hsl(var(--primary))"
                              fill="url(#cumulativeGradient)"
                              strokeWidth={2}
                            />
                          </AreaChart>
                        </ResponsiveContainer>
                      </CardContent>
                    </Card>
                  </>
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          {/* Properties Tab */}
          <TabsContent value="properties">
            <ScrollArea className="h-[420px] pr-4">
              <div className="space-y-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Case Information</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground flex items-center gap-2">
                        <Calendar className="h-4 w-4" /> Opened
                      </span>
                      <span className="text-sm font-medium">
                        {format(new Date(caseData.opened_at), "MMM d, yyyy 'at' h:mm a")}
                      </span>
                    </div>
                    {caseData.closed_at && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground flex items-center gap-2">
                          <XCircle className="h-4 w-4" /> Closed
                        </span>
                        <span className="text-sm font-medium">
                          {format(new Date(caseData.closed_at), "MMM d, yyyy 'at' h:mm a")}
                        </span>
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground flex items-center gap-2">
                        <Clock className="h-4 w-4" /> Last Modified
                      </span>
                      <span className="text-sm font-medium">
                        {format(new Date(caseData.last_modified_at), "MMM d, yyyy 'at' h:mm a")}
                      </span>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Case Properties</CardTitle>
                    <CardDescription>Saved data from form submissions</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {Object.keys(properties).length === 0 ? (
                      <p className="text-sm text-muted-foreground">No properties saved yet</p>
                    ) : (
                      <div className="space-y-2">
                        {Object.entries(properties).map(([key, value]) => (
                          <div key={key} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                            <span className="text-sm text-muted-foreground capitalize">{key.replace(/_/g, " ")}</span>
                            <span className="text-sm font-medium">{String(value)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </ScrollArea>
          </TabsContent>

          {/* Referrals Tab */}
          <TabsContent value="referrals">
            <ScrollArea className="h-[420px] pr-4">
              {referrals.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-40 text-center">
                  <Share2 className="h-12 w-12 text-muted-foreground/30 mb-3" />
                  <p className="text-muted-foreground text-sm">No referrals yet</p>
                  <p className="text-xs text-muted-foreground/70 mt-1">Referrals raised on this case will appear here</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {referrals.map((r) => (
                    <Card key={r.id}>
                      <CardContent className="p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <Share2 className="h-4 w-4 text-primary shrink-0" />
                              <span className="font-medium text-sm truncate">
                                {r.destination || "Referral"}
                              </span>
                            </div>
                            {r.referral_type && (
                              <p className="text-xs text-muted-foreground mt-0.5 capitalize">{r.referral_type}</p>
                            )}
                            {r.reason && <p className="text-sm mt-1.5">{r.reason}</p>}
                            <p className="text-[11px] text-muted-foreground mt-1.5">
                              {format(new Date(r.created_at), "MMM d, yyyy 'at' h:mm a")}
                            </p>
                          </div>
                          <div className="flex flex-col items-end gap-2 shrink-0">
                            <Badge
                              variant={
                                r.status === "completed"
                                  ? "default"
                                  : r.status === "rejected"
                                  ? "destructive"
                                  : "secondary"
                              }
                              className="capitalize"
                            >
                              {r.status}
                            </Badge>
                            {r.priority && r.priority !== "normal" && (
                              <Badge variant="outline" className="capitalize text-[10px]">
                                <AlertCircle className="h-3 w-3 mr-1" />
                                {r.priority}
                              </Badge>
                            )}
                            {r.status !== "completed" && r.status !== "rejected" && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs"
                                onClick={() => advanceReferralStatus(r)}
                              >
                                {r.status === "pending" ? "Accept" : "Complete"}
                              </Button>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>

          {/* Notes Tab */}
          <TabsContent value="notes">
            <ScrollArea className="h-[420px] pr-4">
              {notes.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-40 text-center">
                  <StickyNote className="h-12 w-12 text-muted-foreground/30 mb-3" />
                  <p className="text-muted-foreground text-sm">No notes yet</p>
                  <p className="text-xs text-muted-foreground/70 mt-1">Case notes captured via forms will appear here</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {notes.map((n) => (
                    <Card key={n.id}>
                      <CardContent className="p-3">
                        <p className="text-sm whitespace-pre-wrap">{n.note}</p>
                        <div className="flex items-center justify-between mt-2 text-[11px] text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <User className="h-3 w-3" />
                            {n.authorName || "Unknown"}
                          </span>
                          <span>{format(new Date(n.created_at), "MMM d, yyyy 'at' h:mm a")}</span>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>

          {/* Tasks Tab */}
          <TabsContent value="tasks">
            <ScrollArea className="h-[420px] pr-4">
              {tasks.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-40 text-center">
                  <CheckSquare className="h-12 w-12 text-muted-foreground/30 mb-3" />
                  <p className="text-muted-foreground text-sm">No follow-up tasks yet</p>
                  <p className="text-xs text-muted-foreground/70 mt-1">Scheduled follow-ups will appear here</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {tasks.map((t) => {
                    const overdue =
                      t.status !== "completed" && t.due_date && new Date(t.due_date) < new Date();
                    return (
                      <Card key={t.id}>
                        <CardContent className="p-3 flex items-start gap-3">
                          <button
                            onClick={() => toggleTaskStatus(t)}
                            className="mt-0.5 shrink-0"
                            aria-label="Toggle task"
                          >
                            {t.status === "completed" ? (
                              <CheckCircle2 className="h-5 w-5 text-green-500" />
                            ) : (
                              <CheckSquare className="h-5 w-5 text-muted-foreground" />
                            )}
                          </button>
                          <div className="min-w-0 flex-1">
                            <p
                              className={`text-sm font-medium ${
                                t.status === "completed" ? "line-through text-muted-foreground" : ""
                              }`}
                            >
                              {t.title}
                            </p>
                            {t.description && (
                              <p className="text-xs text-muted-foreground mt-0.5">{t.description}</p>
                            )}
                            {t.due_date && (
                              <p
                                className={`text-[11px] mt-1 flex items-center gap-1 ${
                                  overdue ? "text-destructive" : "text-muted-foreground"
                                }`}
                              >
                                <Calendar className="h-3 w-3" />
                                Due {format(new Date(t.due_date), "MMM d, yyyy")}
                                {overdue && " · Overdue"}
                              </p>
                            )}
                          </div>
                          <Badge
                            variant={t.status === "completed" ? "default" : "secondary"}
                            className="capitalize shrink-0"
                          >
                            {t.status}
                          </Badge>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </TabsContent>



          {/* History Tab */}
          <TabsContent value="history">
            <ScrollArea className="h-[420px] pr-4">
              <div className="space-y-4">
                {activities.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-40 text-center">
                    <History className="h-12 w-12 text-muted-foreground/50 mb-3" />
                    <p className="text-muted-foreground">No activity history</p>
                  </div>
                ) : (
                  <div className="relative">
                    <div className="absolute left-4 top-0 bottom-0 w-px bg-border" />
                    {activities.map((activity) => (
                      <div key={activity.id} className="relative pl-10 pb-6 last:pb-0">
                        <div className="absolute left-2 top-1 w-5 h-5 rounded-full bg-background border-2 border-border flex items-center justify-center">
                          {getActivityIcon(activity.activityType)}
                        </div>
                        <Card>
                          <CardContent className="p-3">
                            <div className="flex items-center justify-between mb-1">
                              <span className="font-medium text-sm">
                                {getActivityLabel(activity.activityType)}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {format(new Date(activity.performedAt), "MMM d, yyyy 'at' h:mm a")}
                              </span>
                            </div>
                            {activity.performerName && (
                              <p className="text-xs text-muted-foreground flex items-center gap-1">
                                <User className="h-3 w-3" />
                                {activity.performerName}
                              </p>
                            )}
                            {activity.notes && (
                              <p className="text-sm text-muted-foreground mt-1">{activity.notes}</p>
                            )}
                            {activity.formSubmissionId && (
                              <Badge variant="outline" className="mt-2 text-xs">
                                <FileText className="h-3 w-3 mr-1" />
                                Form Submission
                              </Badge>
                            )}
                            <PropertyChangeDiff changes={activity.changes} />
                          </CardContent>
                        </Card>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};

export default CaseDetails;

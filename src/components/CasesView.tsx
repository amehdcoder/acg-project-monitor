import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Search,
  MoreVertical,
  Eye,
  Edit,
  XCircle,
  RefreshCw,
  User,
  Calendar,
  Briefcase,
  Clock,
  ChevronRight,
  FileText,
  ClipboardList,
  DatabaseBackup,
  Loader2,
  Plus,
  CalendarClock,
  AlertTriangle,
  UserCheck,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { format, differenceInDays } from "date-fns";
import CaseDetails from "@/components/CaseManagement/CaseDetails";
import FormFiller from "@/components/FormFiller/FormFiller";
import { Question, GeofenceArea } from "@/components/FormBuilder/types";
import { toast } from "@/hooks/use-toast";
import { Json } from "@/integrations/supabase/types";
import FollowUpScheduleEditor, {
  FollowUpSchedule,
  getFrequencyLabel,
  getIntervalDays,
} from "@/components/CaseManagement/FollowUpScheduleEditor";

interface Case {
  id: string;
  name: string;
  caseTypeName: string;
  caseTypeLabel: string;
  caseTypeId: string;
  properties: Record<string, any>;
  status: "open" | "closed";
  openedAt: string;
  lastModifiedAt: string;
  ownerId: string;
  ownerName?: string;
  projectName?: string;
  projectId: string;
  activitiesCount?: number;
  nextFollowUpDate?: string | null;
  followUpSchedule?: FollowUpSchedule | null;
}

interface FormSettings {
  requireLocation?: boolean;
  allowAnonymous?: boolean;
  offlineEnabled?: boolean;
  autoSave?: boolean;
  enforceGeofence?: boolean;
  autoSaveInterval?: number;
  caseManagement?: {
    enabled: boolean;
    action: "none" | "register" | "update" | "close";
    caseType?: string;
    caseTypeId?: string;
    caseNameQuestion?: string;
    saveToProperties: { questionId: string; propertyName: string }[];
    closeCondition?: string;
    loadFromProperties: { propertyName: string; questionId: string }[];
  };
}

interface FollowUpForm {
  id: string;
  name: string;
  description: string | null;
  questions: Question[];
  geofence: GeofenceArea | null;
  settings: FormSettings;
  project_id: string;
}

const CasesView = () => {
  const { user, profile, isAdmin } = useAuth();
  const [cases, setCases] = useState<Case[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "open" | "closed">("open");
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [projectFilter, setProjectFilter] = useState<string>("all");
  const [generatingCases, setGeneratingCases] = useState(false);

  // Follow-up form state
  const [followUpCase, setFollowUpCase] = useState<Case | null>(null);
  const [followUpForms, setFollowUpForms] = useState<FollowUpForm[]>([]);
  const [showFormPicker, setShowFormPicker] = useState(false);
  const [fillingForm, setFillingForm] = useState<FollowUpForm | null>(null);
  const [loadingForms, setLoadingForms] = useState(false);

  // Registration form state
  const [registrationForms, setRegistrationForms] = useState<FollowUpForm[]>([]);
  const [showRegFormPicker, setShowRegFormPicker] = useState(false);

  // Schedule editor state
  const [caseTypes, setCaseTypes] = useState<{ id: string; label: string; name: string; follow_up_schedule: FollowUpSchedule | null }[]>([]);
  const [editingScheduleCaseType, setEditingScheduleCaseType] = useState<{ id: string; label: string; schedule: FollowUpSchedule | null } | null>(null);

  // Reassignment state
  const [reassigningCase, setReassigningCase] = useState<Case | null>(null);
  const [reassignUserId, setReassignUserId] = useState<string>("");
  const [projectUsers, setProjectUsers] = useState<{ user_id: string; name: string }[]>([]);
  const [reassigning, setReassigning] = useState(false);

  useEffect(() => {
    if (user?.id) {
      fetchProjects();
      fetchCaseTypes();
    }
  }, [user?.id]);

  useEffect(() => {
    if (user?.id) {
      fetchCases();
    }
  }, [user?.id, statusFilter, projectFilter]);

  const fetchCaseTypes = async () => {
    try {
      const { data } = await supabase
        .from("case_types")
        .select("id, label, name, follow_up_schedule");
      setCaseTypes((data || []).map((ct: any) => ({
        id: ct.id,
        label: ct.label,
        name: ct.name,
        follow_up_schedule: ct.follow_up_schedule as FollowUpSchedule | null,
      })));
    } catch (e) {
      console.error("Error fetching case types:", e);
    }
  };

  const fetchProjects = async () => {
    if (!user?.id) return;
    try {
      if (isAdmin) {
        const { data } = await supabase.from("projects").select("id, name").order("name");
        setProjects(data || []);
      } else {
        const { data: assignments } = await supabase
          .from("user_project_assignments")
          .select("project_id")
          .eq("user_id", user.id);
        if (assignments && assignments.length > 0) {
          const projectIds = assignments.map(a => a.project_id);
          const { data } = await supabase
            .from("projects")
            .select("id, name")
            .in("id", projectIds)
            .order("name");
          setProjects(data || []);
        }
      }
    } catch (error) {
      console.error("Error fetching projects:", error);
    }
  };

  const fetchCases = async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      let projectIds: string[] = [];
      if (isAdmin) {
        const { data } = await supabase.from("projects").select("id");
        projectIds = (data || []).map(p => p.id);
      } else {
        const { data: assignments } = await supabase
          .from("user_project_assignments")
          .select("project_id")
          .eq("user_id", user.id);
        projectIds = (assignments || []).map(a => a.project_id);
      }

      if (projectIds.length === 0) {
        setCases([]);
        setLoading(false);
        return;
      }

      let query = supabase
        .from("cases")
        .select(`
          *,
          case_types!inner(id, name, label),
          projects!inner(name),
          case_activities(id)
        `)
        .in("project_id", projectFilter !== "all" ? [projectFilter] : projectIds)
        .order("last_modified_at", { ascending: false });

      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }

      const { data, error } = await query;
      if (error) throw error;

      const formattedCases: Case[] = (data || []).map((c: any) => {
        const ctSchedule = (c.case_types as any)?.follow_up_schedule as FollowUpSchedule | null;
        return {
          id: c.id,
          name: c.name,
          caseTypeName: c.case_types?.name || "",
          caseTypeLabel: c.case_types?.label || "",
          caseTypeId: c.case_types?.id || c.case_type_id,
          properties: c.properties || {},
          status: c.status,
          openedAt: c.opened_at,
          lastModifiedAt: c.last_modified_at,
          projectName: c.projects?.name || "",
          projectId: c.project_id,
          activitiesCount: Array.isArray(c.case_activities) ? c.case_activities.length : 0,
          nextFollowUpDate: c.next_follow_up_date,
          followUpSchedule: ctSchedule,
        };
      });

      setCases(formattedCases);
    } catch (error) {
      console.error("Error fetching cases:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleCloseCase = async (caseId: string) => {
    try {
      const { error } = await supabase
        .from("cases")
        .update({
          status: "closed",
          closed_at: new Date().toISOString(),
          closed_by: user?.id,
          last_modified_by: user?.id,
        })
        .eq("id", caseId);
      if (error) throw error;
      toast({ title: "Case Closed" });
      fetchCases();
    } catch (error) {
      console.error("Error closing case:", error);
    }
  };

  const handleReopenCase = async (caseId: string) => {
    try {
      const { error } = await supabase
        .from("cases")
        .update({
          status: "open",
          closed_at: null,
          closed_by: null,
          last_modified_by: user?.id,
        })
        .eq("id", caseId);
      if (error) throw error;
      toast({ title: "Case Reopened" });
      fetchCases();
    } catch (error) {
      console.error("Error reopening case:", error);
    }
  };

  // Generate cases retroactively from existing form submissions
  const handleGenerateCases = async () => {
    if (!user?.id) return;
    setGeneratingCases(true);

    try {
      // Fetch all forms with case management enabled
      const { data: forms, error: formsError } = await supabase
        .from("forms")
        .select("id, name, settings, project_id")
        .neq("settings", null);

      if (formsError) throw formsError;

      // Filter forms with case management enabled
      const caseForms = (forms || []).filter((f: any) => {
        const cm = f.settings?.caseManagement;
        return cm?.enabled && cm?.caseTypeId && (cm?.action === "register" || cm?.action === "update");
      });

      if (caseForms.length === 0) {
        toast({
          title: "No Case Forms",
          description: "No forms have case management configured. Configure case management in your form settings first.",
          variant: "destructive",
        });
        setGeneratingCases(false);
        return;
      }

      let created = 0;

      for (const form of caseForms) {
        const cm = (form as any).settings.caseManagement;

        // Fetch all submissions for this form
        const { data: submissions, error: subError } = await supabase
          .from("form_submissions")
          .select("id, data, user_id, submitted_at")
          .eq("form_id", form.id)
          .eq("status", "sent")
          .order("submitted_at", { ascending: true });

        if (subError) {
          console.error("Error fetching submissions for form:", form.id, subError);
          continue;
        }

        for (const sub of submissions || []) {
          const responses = (sub.data || {}) as Record<string, any>;

          // Determine case name
          let caseName = "Case";
          if (cm.caseNameQuestion) {
            const nameVal = responses[cm.caseNameQuestion];
            if (nameVal) caseName = String(nameVal);
          }

          // Check if a case with this name already exists for this case type
          const { data: existing } = await supabase
            .from("cases")
            .select("id")
            .eq("case_type_id", cm.caseTypeId)
            .eq("name", caseName)
            .eq("project_id", form.project_id)
            .maybeSingle();

          if (existing) {
            // Update existing case properties
            const properties: Record<string, any> = {};
            for (const mapping of cm.saveToProperties || []) {
              if (mapping.questionId && mapping.propertyName) {
                properties[mapping.propertyName] = responses[mapping.questionId];
              }
            }

            const { data: existingCase } = await supabase
              .from("cases")
              .select("properties")
              .eq("id", existing.id)
              .single();

            const mergedProps = { ...(existingCase?.properties as Record<string, any> || {}), ...properties };

            await supabase
              .from("cases")
              .update({
                properties: mergedProps as unknown as Json,
                last_modified_by: sub.user_id,
                last_modified_at: sub.submitted_at || new Date().toISOString(),
              })
              .eq("id", existing.id);

            continue;
          }

          // Build properties
          const properties: Record<string, any> = {};
          for (const mapping of cm.saveToProperties || []) {
            if (mapping.questionId && mapping.propertyName) {
              properties[mapping.propertyName] = responses[mapping.questionId];
            }
          }

          // Create the case
          const { data: newCase, error: caseError } = await supabase
            .from("cases")
            .insert({
              project_id: form.project_id,
              case_type_id: cm.caseTypeId,
              name: caseName,
              owner_id: sub.user_id,
              opened_by: sub.user_id,
              last_modified_by: sub.user_id,
              properties: properties as unknown as Json,
              status: "open",
            })
            .select()
            .single();

          if (caseError) {
            console.error("Error creating case from submission:", caseError);
            continue;
          }

          // Record activity
          await supabase.from("case_activities").insert({
            case_id: newCase.id,
            activity_type: "registration",
            performed_by: sub.user_id,
            form_submission_id: sub.id,
            notes: `Case retroactively registered from form submission`,
            changes: { action: "created", properties } as unknown as Json,
          });

          created++;
        }
      }

      if (created > 0) {
        toast({
          title: "Cases Generated",
          description: `Successfully created ${created} case${created > 1 ? "s" : ""} from existing submissions.`,
        });
        fetchCases();
      } else {
        toast({
          title: "No New Cases",
          description: "All submissions already have corresponding cases, or no matching submissions were found.",
        });
      }
    } catch (error) {
      console.error("Error generating cases:", error);
      toast({
        title: "Error",
        description: "Failed to generate cases from submissions.",
        variant: "destructive",
      });
    } finally {
      setGeneratingCases(false);
    }
  };

  // Find and launch registration form for new case
  const handleRegisterNewCase = async () => {
    if (!user?.id) return;

    try {
      // Get user's project IDs
      let projectIds: string[] = [];
      if (isAdmin) {
        const { data } = await supabase.from("projects").select("id");
        projectIds = (data || []).map(p => p.id);
      } else {
        const { data: assignments } = await supabase
          .from("user_project_assignments")
          .select("project_id")
          .eq("user_id", user.id);
        projectIds = (assignments || []).map(a => a.project_id);
      }

      if (projectIds.length === 0) {
        toast({ title: "No Projects", description: "You are not assigned to any projects.", variant: "destructive" });
        return;
      }

      // Find registration forms
      const { data: forms, error } = await supabase
        .from("forms")
        .select("id, name, description, questions, geofence, settings, project_id")
        .in("project_id", projectIds)
        .eq("status", "published");

      if (error) throw error;

      const regForms: FollowUpForm[] = (forms || [])
        .map((f: any) => ({
          id: f.id,
          name: f.name,
          description: f.description,
          questions: (f.questions || []) as Question[],
          geofence: f.geofence as GeofenceArea | null,
          settings: (f.settings || {}) as FormSettings,
          project_id: f.project_id,
        }))
        .filter((f) => {
          const cm = f.settings.caseManagement;
          return cm?.enabled && (cm.action === "register" || cm.action === "update");
        });

      if (regForms.length === 0) {
        toast({
          title: "No Registration Forms",
          description: "No published forms have case registration enabled. Configure a form with case management 'Register' action in Form Settings.",
          variant: "destructive",
        });
        return;
      }

      if (regForms.length === 1) {
        setFillingForm(regForms[0]);
        setFollowUpCase(null);
      } else {
        setRegistrationForms(regForms);
        setShowRegFormPicker(true);
      }
    } catch (error) {
      console.error("Error finding registration forms:", error);
      toast({ title: "Error", description: "Failed to find registration forms.", variant: "destructive" });
    }
  };

  // Find follow-up forms for a given case
  const handleFollowUp = async (caseItem: Case) => {
    setFollowUpCase(caseItem);
    setLoadingForms(true);
    setShowFormPicker(true);

    try {
      const { data: forms, error } = await supabase
        .from("forms")
        .select("id, name, description, questions, geofence, settings, project_id")
        .eq("project_id", caseItem.projectId)
        .eq("status", "published");

      if (error) throw error;

      const matchingForms: FollowUpForm[] = (forms || [])
        .map((f: any) => ({
          id: f.id,
          name: f.name,
          description: f.description,
          questions: (f.questions || []) as Question[],
          geofence: f.geofence as GeofenceArea | null,
          settings: (f.settings || {}) as FormSettings,
          project_id: f.project_id,
        }))
        .filter((f) => {
          const cm = f.settings.caseManagement;
          if (!cm?.enabled) return false;
          if (cm.action !== "update" && cm.action !== "close") return false;
          if (cm.caseTypeId && cm.caseTypeId !== caseItem.caseTypeId) return false;
          return true;
        });

      setFollowUpForms(matchingForms);

      if (matchingForms.length === 1) {
        setShowFormPicker(false);
        launchFormFiller(matchingForms[0], caseItem);
      } else if (matchingForms.length === 0) {
        toast({
          title: "No Follow-up Forms",
          description: "No published forms are configured for follow-up on this case type.",
          variant: "destructive",
        });
        setShowFormPicker(false);
        setFollowUpCase(null);
      }
    } catch (error) {
      console.error("Error fetching follow-up forms:", error);
      toast({ title: "Error", description: "Failed to load follow-up forms.", variant: "destructive" });
      setShowFormPicker(false);
    } finally {
      setLoadingForms(false);
    }
  };

  const launchFormFiller = (form: FollowUpForm, caseItem: Case) => {
    const formWithCase: FollowUpForm = {
      ...form,
      settings: {
        ...form.settings,
        caseManagement: {
          ...form.settings.caseManagement!,
          caseTypeId: caseItem.caseTypeId,
        },
      },
    };
    setFillingForm(formWithCase);
  };

  const getFollowUpStatus = (caseItem: Case): { label: string; variant: "destructive" | "default" | "secondary" | "outline" } | null => {
    if (caseItem.status !== "open" || !caseItem.nextFollowUpDate) return null;
    const daysUntil = differenceInDays(new Date(caseItem.nextFollowUpDate), new Date());
    const grace = caseItem.followUpSchedule?.gracePeriodDays ?? 0;
    if (daysUntil < -grace) return { label: `Overdue ${Math.abs(daysUntil)}d`, variant: "destructive" };
    if (daysUntil < 0) return { label: `Due ${Math.abs(daysUntil)}d ago`, variant: "default" };
    if (daysUntil === 0) return { label: "Due today", variant: "default" };
    if (daysUntil <= 3) return { label: `Due in ${daysUntil}d`, variant: "secondary" };
    return { label: format(new Date(caseItem.nextFollowUpDate), "MMM d"), variant: "outline" };
  };

  const handleSaveSchedule = async (caseTypeId: string, schedule: FollowUpSchedule) => {
    try {
      const { error } = await supabase
        .from("case_types")
        .update({ follow_up_schedule: schedule as unknown as Json })
        .eq("id", caseTypeId);
      if (error) throw error;

      // If schedule enabled, compute next_follow_up_date for all open cases of this type
      if (schedule.enabled) {
        const intervalDays = getIntervalDays(schedule);
        const { data: openCasesData } = await supabase
          .from("cases")
          .select("id, last_modified_at")
          .eq("case_type_id", caseTypeId)
          .eq("status", "open");

        for (const c of openCasesData || []) {
          const nextDate = new Date(c.last_modified_at);
          nextDate.setDate(nextDate.getDate() + intervalDays);
          await supabase
            .from("cases")
            .update({ next_follow_up_date: nextDate.toISOString() })
            .eq("id", c.id);
        }
      } else {
        // Clear next_follow_up_date for this case type
        await supabase
          .from("cases")
          .update({ next_follow_up_date: null })
          .eq("case_type_id", caseTypeId)
          .eq("status", "open");
      }

      toast({ title: "Schedule Saved", description: `Follow-up schedule updated for ${editingScheduleCaseType?.label}.` });
      fetchCaseTypes();
      fetchCases();
    } catch (error) {
      console.error("Error saving schedule:", error);
      toast({ title: "Error", description: "Failed to save schedule.", variant: "destructive" });
    }
  };

  const filteredCases = cases.filter((c) =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.caseTypeLabel.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getTimeSince = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    if (days === 0) return "Today";
    if (days === 1) return "Yesterday";
    if (days < 7) return `${days}d ago`;
    if (days < 30) return `${Math.floor(days / 7)}w ago`;
    return `${Math.floor(days / 30)}mo ago`;
  };

  const getPropertyPreview = (props: Record<string, any>) => {
    return Object.entries(props).slice(0, 3);
  };

  // If filling a form (registration or follow-up), show the FormFiller
  if (fillingForm && user?.id) {
    return (
      <FormFiller
        formId={fillingForm.id}
        formName={fillingForm.name}
        formDescription={fillingForm.description || ""}
        questions={fillingForm.questions}
        geofence={fillingForm.geofence || undefined}
        userId={user.id}
        projectId={fillingForm.project_id}
        settings={fillingForm.settings}
        initialCase={
          followUpCase
            ? {
                id: followUpCase.id,
                name: followUpCase.name,
                properties: followUpCase.properties,
              }
            : undefined
        }
        onClose={() => {
          setFillingForm(null);
          setFollowUpCase(null);
          fetchCases();
        }}
        onSubmitSuccess={() => {
          fetchCases();
        }}
      />
    );
  }

  // Compute case summary stats
  const openCases = filteredCases.filter(c => c.status === "open").length;
  const closedCases = filteredCases.filter(c => c.status === "closed").length;
  const totalFollowUps = filteredCases.reduce((sum, c) => sum + (c.activitiesCount || 0), 0);
  const overdueCases = filteredCases.filter(c => {
    const status = getFollowUpStatus(c);
    return status?.variant === "destructive";
  }).length;

  return (
    <div className="space-y-4 p-4 lg:p-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-xl font-bold text-foreground sm:text-2xl">
            Case Management
          </h1>
          <p className="text-sm text-muted-foreground">
            Track and manage longitudinal follow-up cases
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {isAdmin && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleGenerateCases}
              disabled={generatingCases}
            >
              {generatingCases ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : (
                <DatabaseBackup className="h-4 w-4 mr-1" />
              )}
              <span className="hidden sm:inline">
                {generatingCases ? "Generating..." : "Generate from Submissions"}
              </span>
              <span className="sm:hidden">
                {generatingCases ? "..." : "Generate"}
              </span>
            </Button>
          )}
          <Button
            variant="default"
            size="sm"
            onClick={handleRegisterNewCase}
          >
            <Plus className="h-4 w-4 mr-1" />
            <span className="hidden sm:inline">Register Case</span>
            <span className="sm:hidden">New</span>
          </Button>
          <Button variant="outline" size="sm" onClick={fetchCases}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Case Summary Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <Card className="border-0 shadow-card">
          <CardContent className="p-3 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10">
              <Briefcase className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="font-display text-xl font-bold text-foreground">{filteredCases.length}</p>
              <p className="text-xs text-muted-foreground">Total</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-card">
          <CardContent className="p-3 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-green-500/10">
              <Eye className="h-4 w-4 text-green-600" />
            </div>
            <div>
              <p className="font-display text-xl font-bold text-foreground">{openCases}</p>
              <p className="text-xs text-muted-foreground">Open</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-card">
          <CardContent className="p-3 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted">
              <XCircle className="h-4 w-4 text-muted-foreground" />
            </div>
            <div>
              <p className="font-display text-xl font-bold text-foreground">{closedCases}</p>
              <p className="text-xs text-muted-foreground">Closed</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-card">
          <CardContent className="p-3 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-500/10">
              <ClipboardList className="h-4 w-4 text-amber-600" />
            </div>
            <div>
              <p className="font-display text-xl font-bold text-foreground">{totalFollowUps}</p>
              <p className="text-xs text-muted-foreground">Follow-ups</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-card">
          <CardContent className="p-3 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-destructive/10">
              <AlertTriangle className="h-4 w-4 text-destructive" />
            </div>
            <div>
              <p className="font-display text-xl font-bold text-foreground">{overdueCases}</p>
              <p className="text-xs text-muted-foreground">Overdue</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Schedule Management (Admin only) */}
      {isAdmin && caseTypes.length > 0 && (
        <Card className="border-0 shadow-card">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-foreground flex items-center gap-1.5">
                <CalendarClock className="h-4 w-4 text-primary" />
                Follow-Up Schedules
              </h3>
            </div>
            <div className="flex flex-wrap gap-2">
              {caseTypes.map((ct) => (
                <Button
                  key={ct.id}
                  variant="outline"
                  size="sm"
                  className="text-xs gap-1.5"
                  onClick={() => setEditingScheduleCaseType({ id: ct.id, label: ct.label, schedule: ct.follow_up_schedule })}
                >
                  <CalendarClock className="h-3.5 w-3.5" />
                  {ct.label}
                  {ct.follow_up_schedule?.enabled ? (
                    <Badge variant="secondary" className="text-[10px] px-1 py-0 ml-1">
                      {getFrequencyLabel(ct.follow_up_schedule)}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px] px-1 py-0 ml-1 opacity-50">
                      No schedule
                    </Badge>
                  )}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <Card className="border-0 shadow-card">
        <CardContent className="p-3 sm:p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search cases by name or type..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex gap-2">
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
                <SelectTrigger className="w-[120px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="closed">Closed</SelectItem>
                </SelectContent>
              </Select>
              {projects.length > 1 && (
                <Select value={projectFilter} onValueChange={setProjectFilter}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue placeholder="Project" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Projects</SelectItem>
                    {projects.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Case Cards */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filteredCases.length === 0 ? (
        <Card className="border-0 shadow-card">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Briefcase className="h-16 w-16 text-muted-foreground/30 mb-4" />
            <h3 className="font-display text-lg font-semibold text-foreground">No Cases Found</h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-sm">
              Cases are created when you submit registration forms, or you can generate them from existing submissions.
            </p>
            <div className="flex gap-2 mt-4">
              <Button variant="default" size="sm" onClick={handleRegisterNewCase}>
                <Plus className="h-4 w-4 mr-1" />
                Register New Case
              </Button>
              {isAdmin && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleGenerateCases}
                  disabled={generatingCases}
                >
                  {generatingCases ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-1" />
                  ) : (
                    <DatabaseBackup className="h-4 w-4 mr-1" />
                  )}
                  Generate from Submissions
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filteredCases.map((caseItem) => (
            <Card
              key={caseItem.id}
              className="border-0 shadow-card transition-all duration-200 hover:shadow-glow/10 cursor-pointer active:scale-[0.99]"
              onClick={() => setSelectedCaseId(caseItem.id)}
            >
              <CardContent className="p-3 sm:p-4">
                <div className="flex items-start gap-3">
                  {/* Avatar / Icon */}
                  <div className={`flex h-10 w-10 sm:h-12 sm:w-12 shrink-0 items-center justify-center rounded-full ${
                    caseItem.status === "open" ? "bg-primary/10" : "bg-muted"
                  }`}>
                    <User className={`h-5 w-5 sm:h-6 sm:w-6 ${
                      caseItem.status === "open" ? "text-primary" : "text-muted-foreground"
                    }`} />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="font-medium text-sm sm:text-base text-foreground truncate">
                          {caseItem.name}
                        </h3>
                        <div className="flex flex-wrap items-center gap-1.5 mt-1">
                          <Badge variant="outline" className="text-[10px] sm:text-xs px-1.5 py-0">
                            {caseItem.caseTypeLabel}
                          </Badge>
                          <Badge
                            variant={caseItem.status === "open" ? "default" : "secondary"}
                            className="text-[10px] sm:text-xs px-1.5 py-0"
                          >
                            {caseItem.status === "open" ? "Open" : "Closed"}
                          </Badge>
                          {(caseItem.activitiesCount || 0) > 0 && (
                            <Badge variant="outline" className="text-[10px] sm:text-xs px-1.5 py-0 border-amber-300 text-amber-700 bg-amber-50 dark:border-amber-600 dark:text-amber-400 dark:bg-amber-950">
                              {caseItem.activitiesCount} follow-up{(caseItem.activitiesCount || 0) !== 1 ? "s" : ""}
                            </Badge>
                          )}
                          {(() => {
                            const fuStatus = getFollowUpStatus(caseItem);
                            if (!fuStatus) return null;
                            return (
                              <Badge
                                variant={fuStatus.variant}
                                className="text-[10px] sm:text-xs px-1.5 py-0 gap-0.5"
                              >
                                <CalendarClock className="h-3 w-3" />
                                {fuStatus.label}
                              </Badge>
                            );
                          })()}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1 shrink-0">
                        {caseItem.status === "open" && (
                          <Button
                            variant="default"
                            size="sm"
                            className="h-8 text-xs gap-1"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleFollowUp(caseItem);
                            }}
                          >
                            <ClipboardList className="h-3.5 w-3.5" />
                            <span className="hidden sm:inline">Follow Up</span>
                          </Button>
                        )}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={(e) => {
                              e.stopPropagation();
                              setSelectedCaseId(caseItem.id);
                            }}>
                              <Eye className="h-4 w-4 mr-2" />
                              View Details
                            </DropdownMenuItem>
                            {caseItem.status === "open" && (
                              <>
                                <DropdownMenuItem onClick={(e) => {
                                  e.stopPropagation();
                                  handleFollowUp(caseItem);
                                }}>
                                  <Edit className="h-4 w-4 mr-2" />
                                  Follow Up
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={(e) => {
                                  e.stopPropagation();
                                  handleCloseCase(caseItem.id);
                                }}>
                                  <XCircle className="h-4 w-4 mr-2" />
                                  Close Case
                                </DropdownMenuItem>
                              </>
                            )}
                            {caseItem.status === "closed" && (
                              <DropdownMenuItem onClick={(e) => {
                                e.stopPropagation();
                                handleReopenCase(caseItem.id);
                              }}>
                                <RefreshCw className="h-4 w-4 mr-2" />
                                Reopen Case
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>

                    {/* Case Properties Preview */}
                    {Object.keys(caseItem.properties).length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                        {getPropertyPreview(caseItem.properties).map(([key, value]) => (
                          <span key={key} className="text-xs text-muted-foreground">
                            <span className="capitalize">{key.replace(/_/g, " ")}</span>:{" "}
                            <span className="font-medium text-foreground">{String(value)}</span>
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Footer metadata */}
                    <div className="flex items-center gap-3 mt-2 text-[10px] sm:text-xs text-muted-foreground">
                      {caseItem.projectName && (
                        <span className="flex items-center gap-1">
                          <FileText className="h-3 w-3" />
                          {caseItem.projectName}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {format(new Date(caseItem.openedAt), "MMM d, yyyy")}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {getTimeSince(caseItem.lastModifiedAt)}
                      </span>
                    </div>
                  </div>

                  <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0 hidden sm:block mt-2" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Case Details Dialog */}
      <CaseDetails
        open={!!selectedCaseId}
        onOpenChange={(open) => !open && setSelectedCaseId(null)}
        caseId={selectedCaseId || undefined}
      />

      {/* Follow-up Form Picker Dialog */}
      <Dialog open={showFormPicker} onOpenChange={(open) => {
        if (!open) {
          setShowFormPicker(false);
          if (!fillingForm) setFollowUpCase(null);
        }
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-primary" />
              Select Follow-up Form
            </DialogTitle>
            <DialogDescription>
              Choose a form to fill for case: <span className="font-medium">{followUpCase?.name}</span>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {loadingForms ? (
              <div className="flex items-center justify-center py-8">
                <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : followUpForms.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                No follow-up forms available for this case type.
              </div>
            ) : (
              followUpForms.map((form) => (
                <Card
                  key={form.id}
                  className="cursor-pointer transition-all hover:shadow-md hover:border-primary/50"
                  onClick={() => {
                    setShowFormPicker(false);
                    launchFormFiller(form, followUpCase!);
                  }}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-medium text-sm">{form.name}</h4>
                        {form.description && (
                          <p className="text-xs text-muted-foreground mt-0.5">{form.description}</p>
                        )}
                        <Badge variant="outline" className="mt-1 text-[10px]">
                          {form.settings.caseManagement?.action === "close" ? "Close Case" : "Update Case"}
                        </Badge>
                      </div>
                      <ChevronRight className="h-5 w-5 text-muted-foreground" />
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Registration Form Picker Dialog */}
      <Dialog open={showRegFormPicker} onOpenChange={(open) => {
        if (!open) setShowRegFormPicker(false);
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5 text-primary" />
              Select Registration Form
            </DialogTitle>
            <DialogDescription>
              Choose a form to register a new case
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {registrationForms.map((form) => (
              <Card
                key={form.id}
                className="cursor-pointer transition-all hover:shadow-md hover:border-primary/50"
                onClick={() => {
                  setShowRegFormPicker(false);
                  setFollowUpCase(null);
                  setFillingForm(form);
                }}
              >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-medium text-sm">{form.name}</h4>
                      {form.description && (
                        <p className="text-xs text-muted-foreground mt-0.5">{form.description}</p>
                      )}
                      <Badge variant="outline" className="mt-1 text-[10px]">
                        {form.settings.caseManagement?.action === "register" ? "Register Case" : "Register/Update"}
                      </Badge>
                    </div>
                    <ChevronRight className="h-5 w-5 text-muted-foreground" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Follow-Up Schedule Editor */}
      {editingScheduleCaseType && (
        <FollowUpScheduleEditor
          open={!!editingScheduleCaseType}
          onOpenChange={(open) => !open && setEditingScheduleCaseType(null)}
          schedule={editingScheduleCaseType.schedule}
          onSave={(schedule) => handleSaveSchedule(editingScheduleCaseType.id, schedule)}
          caseTypeLabel={editingScheduleCaseType.label}
        />
      )}
    </div>
  );
};

export default CasesView;

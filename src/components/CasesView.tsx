import { useState, useEffect, lazy, Suspense } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
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
   Download,
   Map as MapIcon,
   FilePlus2,
    BarChart3,
    Settings,
    Activity,
    Filter,
    MapPin,
    Users,
    Flag,
    ChevronLeft,
    Info,
    Maximize2,


} from "lucide-react";
import FollowUpFormCreator from "@/components/CaseManagement/FollowUpFormCreator";
import CaseInsightsPanel, { InsightsData } from "@/components/CaseManagement/CaseInsightsPanel";
import CaseFollowUpFormStrip from "@/components/CaseManagement/CaseFollowUpFormStrip";
import CaseLongitudinalAnalysis from "@/components/CaseManagement/CaseLongitudinalAnalysis";
import CaseLocationMap from "@/components/CaseManagement/CaseLocationMap";
import CaseAgingAnalytics from "@/components/CaseManagement/CaseAgingAnalytics";
import CaseTypesManager from "@/components/CaseManagement/CaseTypesManager";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { format, differenceInDays } from "date-fns";
import CaseDetails from "@/components/CaseManagement/CaseDetails";
import FormFiller from "@/components/FormFiller/FormFiller";
import { Question, GeofenceArea, FormGroup } from "@/components/FormBuilder/types";
import * as XLSX from "xlsx";
import { toast } from "@/hooks/use-toast";
import { Json } from "@/integrations/supabase/types";
import FollowUpScheduleEditor, {
  FollowUpSchedule,
  getFrequencyLabel,
  getIntervalDays,
} from "@/components/CaseManagement/FollowUpScheduleEditor";
import { CommCarePageHeader } from "@/components/ui/commcare-page-header";
import { generateSimulatedCaseData } from "@/lib/caseSimulation";

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
  closedAt?: string | null;
  ownerId: string;
  ownerName?: string;
  projectName?: string;
  projectId: string;
  activitiesCount?: number;
  followUpCount?: number;
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
  /** Real forms.id used when submitting; virtual modules use id=form::group. */
  sourceFormId?: string;
  /** Human-readable name of the originating form (for grouping in the UI). */
  sourceFormName?: string;
  launchSessionId?: string;
  sourceFormStatus?: string;
  caseTypeId?: string;
  caseTypeLabel?: string;
  name: string;
  description: string | null;
  questions: Question[];
  groups: FormGroup[];
  geofence: GeofenceArea | null;
  settings: FormSettings;
  project_id: string;
}

const CasesView = () => {
  const { user, profile, isAdmin, isOwner } = useAuth();
  const [simulate, setSimulate] = useState(false);
  const [cases, setCases] = useState<Case[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "open" | "closed">("open");
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [projectFilter, setProjectFilter] = useState<string>("all");
  const [generatingCases, setGeneratingCases] = useState(false);
  const [caseTypeFilter, setCaseTypeFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [casePage, setCasePage] = useState(1);

  // Follow-up form state
  const [followUpCase, setFollowUpCase] = useState<Case | null>(null);
  const [followUpForms, setFollowUpForms] = useState<FollowUpForm[]>([]);
  const [showFormPicker, setShowFormPicker] = useState(false);
  const [fillingForm, setFillingForm] = useState<FollowUpForm | null>(null);
  const [loadingForms, setLoadingForms] = useState(false);

  // Inline follow-up module catalogue (per case type) shown on the Cases page
  const [followUpCatalog, setFollowUpCatalog] = useState<Record<string, FollowUpForm[]>>({});

  // Map of caseTypeId -> registration metadata used to resolve a human-readable
  // case name (the configured "Case Name Question" response) for display.
  const [registrationMeta, setRegistrationMeta] = useState<
    Record<string, { nameProperty?: string }>
  >({});

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

  // Bulk selection state
  const [selectedCaseIds, setSelectedCaseIds] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState<"reassign" | "close" | "reopen" | null>(null);
  const [bulkReassignUserId, setBulkReassignUserId] = useState<string>("");
  const [bulkProcessing, setBulkProcessing] = useState(false);
  const [bulkProjectUsers, setBulkProjectUsers] = useState<{ user_id: string; name: string }[]>([]);

  // Owner profiles cache
  const [ownerProfiles, setOwnerProfiles] = useState<Map<string, string>>(new Map());
  const [activeTab, setActiveTab] = useState<"cases" | "map" | "analytics" | "configure">("cases");
  const [showFollowUpCreator, setShowFollowUpCreator] = useState(false);
  const [showLongitudinal, setShowLongitudinal] = useState(false);

  const [selectedCreatorCaseType, setSelectedCreatorCaseType] = useState<any>(null);

  useEffect(() => {
    if (user?.id) {
      fetchProjects();
      fetchCaseTypes();
    }
  }, [user?.id]);

  useEffect(() => {
    if (user?.id) {
      fetchCases();
      fetchFollowUpCatalog();
    }
  }, [user?.id, isAdmin, statusFilter, projectFilter]);

  const getSingleCaseTypeByProject = async (projectIds: string[]) => {
    const { data } = await supabase
      .from("case_types")
      .select("id, name, label, project_id")
      .in("project_id", projectIds);

    const grouped = new Map<string, { id: string; name: string; label?: string }[]>();
    (data || []).forEach((ct: any) => {
      const list = grouped.get(ct.project_id) || [];
      list.push({ id: ct.id, name: ct.name, label: ct.label });
      grouped.set(ct.project_id, list);
    });

    const fallback: Record<string, { id: string; name: string; label?: string }> = {};
    grouped.forEach((list, projectId) => {
      if (list.length === 1) fallback[projectId] = list[0];
    });
    return fallback;
  };

  const buildAutoPropertyMappings = (items: any[]) =>
    items
      .flatMap((item) => (Array.isArray(item.questions) ? item.questions : [item]))
      .filter((q: any) => q?.id && q.type !== "note" && q.type !== "calculate")
      .map((q: any) => ({ questionId: q.id, propertyName: q.name || q.id }));

  const toFillableFollowUpQuestions = (questions: Question[]) =>
    questions.filter((q) => q.type !== "calculate" && q.type !== "note");

  const makeModuleFormId = (formId: string, groupId?: string) =>
    groupId ? `${formId}__module__${groupId}` : formId;

  const resolveCaseType = (
    cm: FormSettings["caseManagement"],
    projectId: string,
    fallbackByProject: Record<string, { id: string; name: string; label?: string }>
  ) => ({
    id: cm?.caseTypeId || fallbackByProject[projectId]?.id,
    name: cm?.caseType || fallbackByProject[projectId]?.name,
    label: fallbackByProject[projectId]?.label || cm?.caseType,
  });

  // Build a catalogue of fillable follow-up forms grouped by case type so each
  // case on the Cases page can surface its follow-up modules inline.
  const fetchFollowUpCatalog = async () => {
    if (!user?.id) return;
    try {
      let projectIds: string[] = [];
      if (isAdmin) {
        const { data } = await supabase.from("projects").select("id");
        projectIds = (data || []).map((p) => p.id);
      } else {
        const { data: assignments } = await supabase
          .from("user_project_assignments")
          .select("project_id")
          .eq("user_id", user.id);
        projectIds = (assignments || []).map((a) => a.project_id);
      }
      if (projectIds.length === 0) {
        setFollowUpCatalog({});
        return;
      }

      const fallbackCaseTypes = await getSingleCaseTypeByProject(projectIds);

      const { data: forms } = await supabase
        .from("forms")
        .select("id, name, description, questions, geofence, settings, project_id, status")
        .in("project_id", projectFilter !== "all" ? [projectFilter] : projectIds)
        .in("status", ["active", "draft"]);

      const catalog: Record<string, FollowUpForm[]> = {};
      const regMeta: Record<string, { nameProperty?: string }> = {};
      (forms || []).forEach((f: any) => {
        const cm = (f.settings || {})?.caseManagement;
        if (!cm?.enabled) return;
        const caseType = resolveCaseType(cm, f.project_id, fallbackCaseTypes);
        if (!caseType.id) return;
        const allItems = (f.questions || []) as any[];
        const groupItems = allItems.filter((q: any) => Array.isArray(q.questions)) as FormGroup[];
        const ungroupedQuestions = allItems.filter((q: any) => !Array.isArray(q.questions)) as Question[];

        // Capture the registration form's name resolver: which saved property
        // corresponds to the configured "Case Name Question". This lets the
        // Cases page show the real respondent name instead of "New Case".
        if (cm.action === "register" && cm.caseNameQuestion) {
          const nameProp = (cm.saveToProperties || []).find(
            (m: any) => m.questionId === cm.caseNameQuestion,
          )?.propertyName;
          if (nameProp && !regMeta[caseType.id]) {
            regMeta[caseType.id] = { nameProperty: nameProp };
          }
        }

        const baseSettings: FormSettings = {
          ...((f.settings || {}) as FormSettings),
          caseManagement: {
            enabled: true,
            action: cm.action === "close" ? "close" : "update",
            caseType: caseType.name,
            caseTypeId: caseType.id,
            caseNameQuestion: cm.caseNameQuestion,
            closeCondition: cm.closeCondition,
            saveToProperties: cm.saveToProperties?.length ? cm.saveToProperties : buildAutoPropertyMappings(allItems),
            loadFromProperties: cm.loadFromProperties?.length ? cm.loadFromProperties : buildAutoPropertyMappings(allItems),
          },
        };
        if (!catalog[caseType.id]) catalog[caseType.id] = [];

        if (cm.action === "update" || cm.action === "close") {
          const fillableQuestions = toFillableFollowUpQuestions(ungroupedQuestions);
          catalog[caseType.id].push({
            id: makeModuleFormId(f.id),
            sourceFormId: f.id,
            sourceFormStatus: f.status,
            caseTypeId: caseType.id,
            caseTypeLabel: caseType.label || caseType.name,
            name: f.name,
            sourceFormName: f.name,
            description: f.description,
            questions: fillableQuestions,
            groups: groupItems,
            geofence: f.geofence as GeofenceArea | null,
            settings: baseSettings,
            project_id: f.project_id,
          });
          return;
        }

        // Backwards-compatible upgrade path: older case-management forms stored
        // follow-up modules as groups inside the registration form instead of
        // as separate update forms. Surface every group as its own fillable
        // module on the Cases page while keeping the registration screen clean.
        if (cm.action === "register") {
          groupItems.forEach((group) => {
            const moduleQuestions = toFillableFollowUpQuestions((group.questions || []) as Question[]);
            if (moduleQuestions.length === 0) return;
            catalog[caseType.id].push({
              id: makeModuleFormId(f.id, group.id),
              sourceFormId: f.id,
              sourceFormStatus: f.status,
              caseTypeId: caseType.id,
              caseTypeLabel: caseType.label || caseType.name,
              name: group.label || group.name || f.name,
              sourceFormName: f.name,
              description: f.description,
              questions: moduleQuestions,
              groups: [],
              geofence: f.geofence as GeofenceArea | null,
              settings: {
                ...baseSettings,
                caseManagement: {
                  ...baseSettings.caseManagement!,
                  action: "update",
                  saveToProperties: buildAutoPropertyMappings(moduleQuestions),
                  loadFromProperties: buildAutoPropertyMappings(moduleQuestions),
                },
              },
              project_id: f.project_id,
            });
          });
        }
      });
      setFollowUpCatalog(catalog);
      setRegistrationMeta(regMeta);
    } catch (e) {
      console.error("Error fetching follow-up catalog:", e);
    }
  };

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
          case_types!inner(id, name, label, follow_up_schedule),
          projects!inner(name),
          case_activities(id),
          follow_up_activities:case_activities!case_activities_case_id_fkey(id)
        `)
        .in("project_id", projectFilter !== "all" ? [projectFilter] : projectIds)
        .eq("follow_up_activities.activity_type", "follow_up")
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
          closedAt: c.closed_at,
          ownerId: c.owner_id,
          projectName: c.projects?.name || "",
          projectId: c.project_id,
          activitiesCount: Array.isArray(c.case_activities) ? c.case_activities.length : 0,
          followUpCount: Array.isArray(c.follow_up_activities) ? c.follow_up_activities.length : 0,
          nextFollowUpDate: c.next_follow_up_date,
          followUpSchedule: ctSchedule,
        };
      });

      setCases(formattedCases);

      // Fetch owner profiles
      const ownerIds = [...new Set(formattedCases.map(c => c.ownerId))];
      if (ownerIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id, first_name, last_name")
          .in("user_id", ownerIds);
        const map = new Map<string, string>();
        (profiles || []).forEach(p => map.set(p.user_id, `${p.first_name} ${p.last_name}`));
        setOwnerProfiles(map);
      }
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

      const fallbackCaseTypes = await getSingleCaseTypeByProject([
        ...new Set((forms || []).map((f: any) => f.project_id).filter(Boolean)),
      ]);

      // Filter forms with case management enabled. Older forms may have saved
      // case management without caseTypeId; if the project has one case type,
      // safely recover that link instead of hiding/generating nothing.
      const caseForms = (forms || []).map((f: any) => {
        const cm = f.settings?.caseManagement;
        const caseType = resolveCaseType(cm, f.project_id, fallbackCaseTypes);
        return { ...f, resolvedCaseManagement: cm?.enabled ? { ...cm, caseTypeId: caseType.id, caseType: caseType.name } : null };
      }).filter((f: any) => {
        const cm = f.resolvedCaseManagement;
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
        const cm = (form as any).resolvedCaseManagement;

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
        .eq("status", "active");

      if (error) throw error;

      const regForms: FollowUpForm[] = (forms || [])
        .map((f: any) => {
          const allItems = (f.questions || []) as any[];
          const groupItems = allItems.filter((q: any) => Array.isArray(q.questions)) as FormGroup[];
          const ungroupedQuestions = allItems.filter((q: any) => !Array.isArray(q.questions)) as Question[];
          return {
            id: f.id,
            name: f.name,
            description: f.description,
            questions: ungroupedQuestions,
            groups: groupItems,
            geofence: f.geofence as GeofenceArea | null,
            settings: (f.settings || {}) as FormSettings,
            project_id: f.project_id,
          };
        })
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
    // Block opening before the stipulated follow-up date (module still shows).
    const availability = getFollowUpAvailability(caseItem);
    if (!availability.openable && availability.availableOn) {
      toast({
        title: "Follow-up not yet due",
        description: `This follow-up can be filled from ${format(availability.availableOn, "MMM d, yyyy")}.`,
        variant: "destructive",
      });
      return;
    }
    // Ensure we have the case's full properties so the follow-up form links to
    // and pre-populates from the registration record.
    let resolvedCase = caseItem;
    if (!caseItem.properties || Object.keys(caseItem.properties).length === 0) {
      try {
        const { data: full } = await supabase
          .from("cases")
          .select("properties, name, project_id, case_type_id")
          .eq("id", caseItem.id)
          .maybeSingle();
        if (full) {
          resolvedCase = {
            ...caseItem,
            name: caseItem.name || full.name,
            projectId: caseItem.projectId || full.project_id,
            caseTypeId: caseItem.caseTypeId || full.case_type_id,
            properties: (full.properties as Record<string, any>) || {},
          };
        }
      } catch (e) {
        console.error("Error loading case properties for follow-up:", e);
      }
    }
    setFollowUpCase(resolvedCase);
    caseItem = resolvedCase;

    const inlineModules = followUpCatalog[caseItem.caseTypeId] || [];
    if (inlineModules.length > 0) {
      setFollowUpForms(inlineModules);
      if (inlineModules.length === 1) {
        launchFormFiller(inlineModules[0], caseItem);
      } else {
        setShowFormPicker(true);
      }
      return;
    }

    setLoadingForms(true);
    setShowFormPicker(true);

    try {
      const { data: forms, error } = await supabase
        .from("forms")
        .select("id, name, description, questions, geofence, settings, project_id")
        .eq("project_id", caseItem.projectId)
        .eq("status", "active");

      if (error) throw error;

      const matchingForms: FollowUpForm[] = (forms || [])
        .map((f: any) => {
          const allItems = (f.questions || []) as any[];
          const groupItems = allItems.filter((q: any) => Array.isArray(q.questions)) as FormGroup[];
          const ungroupedQuestions = allItems.filter((q: any) => !Array.isArray(q.questions)) as Question[];
          return {
            id: f.id,
            name: f.name,
            description: f.description,
            questions: ungroupedQuestions,
            groups: groupItems,
            geofence: f.geofence as GeofenceArea | null,
            settings: (f.settings || {}) as FormSettings,
            project_id: f.project_id,
          };
        })
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

  // Date-gate: a follow-up form may only be OPENED for filling on or after its
  // stipulated next-follow-up date. Before that date the module still displays
  // on the page, but launching is blocked. Cases without a scheduled date (no
  // schedule configured) are never gated.
  const getFollowUpAvailability = (caseItem: Case): { openable: boolean; availableOn: Date | null } => {
    if (!caseItem.nextFollowUpDate) return { openable: true, availableOn: null };
    const due = new Date(caseItem.nextFollowUpDate);
    // Compare by calendar day so the form opens at the start of the due date.
    const daysUntil = differenceInDays(
      new Date(due.getFullYear(), due.getMonth(), due.getDate()),
      new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate())
    );
    return { openable: daysUntil <= 0, availableOn: due };
  };

  const launchFormFiller = (form: FollowUpForm, caseItem: Case) => {
    const { openable, availableOn } = getFollowUpAvailability(caseItem);
    if (!openable && availableOn) {
      toast({
        title: "Follow-up not yet due",
        description: `This follow-up can be filled from ${format(availableOn, "MMM d, yyyy")}.`,
        variant: "destructive",
      });
      setShowFormPicker(false);
      return;
    }
    const formWithCase: FollowUpForm = {
      ...form,
      id: form.sourceFormId || form.id,
      launchSessionId: form.id,
      settings: {
        ...form.settings,
        caseManagement: {
          ...form.settings.caseManagement!,
          action: form.settings.caseManagement?.action === "close" ? "close" : "update",
          caseTypeId: caseItem.caseTypeId,
        },
      },
    };
    setFollowUpCase(caseItem);
    setFillingForm(formWithCase);
  };

  // Launch a specific follow-up form (from the inline Cases-page modules) for a
  // case, ensuring the case record is linked and its properties pre-populate.
  const launchCaseFollowUpForm = async (caseItem: Case, formId: string) => {
    // Look up the module within this case's catalogue first, then fall back to
    // a global search so a caseType-id mismatch can never silently no-op.
    let form =
      (followUpCatalog[caseItem.caseTypeId] || []).find((f) => f.id === formId) ||
      Object.values(followUpCatalog)
        .flat()
        .find((f) => f.id === formId);
    if (!form) {
      toast({
        title: "Follow-up unavailable",
        description: "This follow-up module could not be linked to the case. Please refresh and try again.",
        variant: "destructive",
      });
      return;
    }

    let resolvedCase = caseItem;
    if (!caseItem.properties || Object.keys(caseItem.properties).length === 0) {
      try {
        const { data: full } = await supabase
          .from("cases")
          .select("properties")
          .eq("id", caseItem.id)
          .maybeSingle();
        if (full) {
          resolvedCase = { ...caseItem, properties: (full.properties as Record<string, any>) || {} };
        }
      } catch (e) {
        console.error("Error loading case properties:", e);
      }
    }
    setFollowUpCase(resolvedCase);
    launchFormFiller(form, resolvedCase);
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

  // Reassign case to a different user
  const handleOpenReassign = async (caseItem: Case) => {
    setReassigningCase(caseItem);
    setReassignUserId("");
    try {
      // Load users assigned to this project
      const { data: assignments } = await supabase
        .from("user_project_assignments")
        .select("user_id")
        .eq("project_id", caseItem.projectId);
      const userIds = (assignments || []).map(a => a.user_id);
      if (userIds.length === 0) {
        setProjectUsers([]);
        return;
      }
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, first_name, last_name")
        .in("user_id", userIds)
        .eq("is_active", true);
      setProjectUsers(
        (profiles || [])
          .filter(p => p.user_id !== caseItem.ownerId)
          .map(p => ({ user_id: p.user_id, name: `${p.first_name} ${p.last_name}` }))
      );
    } catch (e) {
      console.error("Error loading project users:", e);
    }
  };

  const handleReassignCase = async () => {
    if (!reassigningCase || !reassignUserId || !user?.id) return;
    setReassigning(true);
    try {
      const { error } = await supabase
        .from("cases")
        .update({
          owner_id: reassignUserId,
          last_modified_by: user.id,
        })
        .eq("id", reassigningCase.id);
      if (error) throw error;

      // Record activity
      const newOwner = projectUsers.find(u => u.user_id === reassignUserId);
      await supabase.from("case_activities").insert({
        case_id: reassigningCase.id,
        activity_type: "update",
        performed_by: user.id,
        notes: `Case reassigned to ${newOwner?.name || "another user"}`,
        changes: {
          owner_id: { old: reassigningCase.ownerId, new: reassignUserId },
        } as unknown as Json,
      });

      toast({ title: "Case Reassigned", description: `"${reassigningCase.name}" has been reassigned to ${newOwner?.name || "the selected user"}.` });
      setReassigningCase(null);
      fetchCases();
    } catch (error) {
      console.error("Error reassigning case:", error);
      toast({ title: "Error", description: "Failed to reassign case.", variant: "destructive" });
    } finally {
      setReassigning(false);
    }
  };

  // Bulk actions
  const handleBulkAction = async (action: "reassign" | "close" | "reopen") => {
    if (selectedCaseIds.size === 0) return;
    if (action === "reassign") {
      setBulkAction("reassign");
      setBulkReassignUserId("");
      // Get project IDs from selected cases to load users
      const selectedProjectIds = [...new Set(
        cases.filter(c => selectedCaseIds.has(c.id)).map(c => c.projectId)
      )];
      try {
        const { data: assignments } = await supabase
          .from("user_project_assignments")
          .select("user_id")
          .in("project_id", selectedProjectIds);
        const userIds = [...new Set((assignments || []).map(a => a.user_id))];
        if (userIds.length > 0) {
          const { data: profiles } = await supabase
            .from("profiles")
            .select("user_id, first_name, last_name")
            .in("user_id", userIds)
            .eq("is_active", true);
          setBulkProjectUsers(
            (profiles || []).map(p => ({ user_id: p.user_id, name: `${p.first_name} ${p.last_name}` }))
          );
        }
      } catch (e) {
        console.error("Error loading users for bulk reassign:", e);
      }
      return;
    }
    setBulkProcessing(true);
    try {
      const ids = [...selectedCaseIds];
      for (const id of ids) {
        if (action === "close") {
          await supabase.from("cases").update({
            status: "closed",
            closed_at: new Date().toISOString(),
            closed_by: user?.id,
            last_modified_by: user?.id,
          }).eq("id", id);
          await supabase.from("case_activities").insert({
            case_id: id,
            activity_type: "closure",
            performed_by: user!.id,
            notes: "Case closed via bulk action",
            changes: { action: "closed" } as unknown as Json,
          });
        } else if (action === "reopen") {
          await supabase.from("cases").update({
            status: "open",
            closed_at: null,
            closed_by: null,
            last_modified_by: user?.id,
          }).eq("id", id);
          await supabase.from("case_activities").insert({
            case_id: id,
            activity_type: "reopen",
            performed_by: user!.id,
            notes: "Case reopened via bulk action",
            changes: { action: "reopened" } as unknown as Json,
          });
        }
      }
      toast({ title: `Bulk ${action === "close" ? "Close" : "Reopen"}`, description: `${ids.length} case(s) ${action === "close" ? "closed" : "reopened"}.` });
      setSelectedCaseIds(new Set());
      fetchCases();
    } catch (error) {
      console.error("Bulk action error:", error);
      toast({ title: "Error", description: "Some bulk operations failed.", variant: "destructive" });
    } finally {
      setBulkProcessing(false);
    }
  };

  const handleBulkReassign = async () => {
    if (!bulkReassignUserId || selectedCaseIds.size === 0 || !user?.id) return;
    setBulkProcessing(true);
    try {
      const ids = [...selectedCaseIds];
      const newOwner = bulkProjectUsers.find(u => u.user_id === bulkReassignUserId);
      for (const id of ids) {
        const c = cases.find(cs => cs.id === id);
        await supabase.from("cases").update({
          owner_id: bulkReassignUserId,
          last_modified_by: user.id,
        }).eq("id", id);
        await supabase.from("case_activities").insert({
          case_id: id,
          activity_type: "update",
          performed_by: user.id,
          notes: `Case reassigned to ${newOwner?.name || "another user"} via bulk action`,
          changes: { owner_id: { old: c?.ownerId, new: bulkReassignUserId } } as unknown as Json,
        });
      }
      toast({ title: "Bulk Reassign", description: `${ids.length} case(s) reassigned to ${newOwner?.name || "selected user"}.` });
      setSelectedCaseIds(new Set());
      setBulkAction(null);
      fetchCases();
    } catch (error) {
      console.error("Bulk reassign error:", error);
      toast({ title: "Error", description: "Some reassignments failed.", variant: "destructive" });
    } finally {
      setBulkProcessing(false);
    }
  };

  // Resolve a friendly case name for display. Falls back to the configured
  // "Case Name Question" response (stored as a case property) when the case
  // record itself only has a placeholder name like "New Case".
  const PLACEHOLDER_NAMES = new Set(["", "new case", "case", "unnamed case"]);
  const getCaseDisplayName = (caseItem: Case): string => {
    const raw = (caseItem.name || "").trim();
    if (raw && !PLACEHOLDER_NAMES.has(raw.toLowerCase())) return raw;

    const props = caseItem.properties || {};
    // 1) Use the registration form's mapped name property when available.
    const nameProp = registrationMeta[caseItem.caseTypeId]?.nameProperty;
    if (nameProp && props[nameProp]) {
      const val = String(props[nameProp]).trim();
      if (val) return val;
    }
    // 2) Fall back to the first meaningful text property value.
    for (const [, value] of Object.entries(props)) {
      if (value == null) continue;
      const val = String(value).trim();
      if (val && isNaN(Number(val)) && val.length > 1) return val;
    }
    return raw || "New Case";
  };

  // Owner simulation: when enabled, populate the page with realistic synthetic
  // data so the full Case Management experience can be demoed end-to-end.
  const simulatedData = simulate ? generateSimulatedCaseData() : null;
  const baseCases = simulatedData ? (simulatedData.cases as unknown as Case[]) : cases;

  const filteredCases = baseCases.filter((c) => {
    const matchesSearch = getCaseDisplayName(c).toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.caseTypeLabel.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCaseType = caseTypeFilter === "all" || c.caseTypeId === caseTypeFilter;
    const matchesStatus = statusFilter === "all" || c.status === statusFilter;
    return matchesSearch && matchesCaseType && (simulate ? matchesStatus : true);
  });

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
        key={`${fillingForm.launchSessionId || fillingForm.id}:${followUpCase?.id || "new"}`}
        formId={fillingForm.id}
        formName={fillingForm.name}
        formDescription={fillingForm.description || ""}
        questions={fillingForm.questions}
        groups={fillingForm.groups}
        geofence={fillingForm.geofence || undefined}
        userId={user.id}
        projectId={fillingForm.project_id}
        settings={fillingForm.settings}
        initialCase={
          followUpCase
            ? {
                id: followUpCase.id,
                name: getCaseDisplayName(followUpCase),
                properties: {
                  ...(followUpCase.properties || {}),
                  _case_id: followUpCase.id,
                  _case_name: getCaseDisplayName(followUpCase),
                  _case_type_id: followUpCase.caseTypeId,
                  _project_id: followUpCase.projectId,
                },
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
  const availableFollowUpModules = Object.values(followUpCatalog).flat();

  const overdueCases = filteredCases.filter(c => {
    const status = getFollowUpStatus(c);
    return status?.variant === "destructive";
  }).length;

  // ---- KPI + Insights derivations for the Case Management dashboard ----
  const activeFieldTeams = new Set(
    filteredCases.map((c) => (c.properties?.assignee as string) || c.ownerName || c.ownerId),
  ).size;
  const highPriorityCases = filteredCases.filter(
    (c) => (c.properties?.priority as string) === "high",
  ).length;

  const insightsData: InsightsData = simulatedData
    ? simulatedData.insights
    : (() => {
        const stateCounts = new Map<string, number>();
        filteredCases.forEach((c) => {
          const s = (c.properties?.state as string) || c.projectName || "Unspecified";
          const label = s === "FCT" ? "FCT (Abuja)" : s;
          stateCounts.set(label, (stateCounts.get(label) || 0) + 1);
        });
        const casesByState = [...stateCounts.entries()]
          .map(([state, count]) => ({ state, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 5);
        return {
          casesByState,
          followUpTrends: [],
          recentActivity: filteredCases.slice(0, 3).map((c) => ({
            type: "registered" as const,
            title: getCaseDisplayName(c),
            meta: `${ownerProfiles.get(c.ownerId) || c.ownerName || ""} · ${getTimeSince(c.lastModifiedAt)}`,
          })),
        };
      })();

  // KPI card configuration mirroring the reference dashboard.
  const kpiCards = [
    { label: "Total Cases", value: filteredCases.length, trend: "12% vs last month", icon: Briefcase, tone: "primary" },
    { label: "Open Cases", value: openCases, trend: "8% vs last month", icon: Eye, tone: "green" },
    { label: "Closed Cases", value: closedCases, trend: "15% vs last month", icon: XCircle, tone: "slate" },
    { label: "Follow-up Modules", value: availableFollowUpModules.length, trend: "5% vs last month", icon: ClipboardList, tone: "amber" },
    { label: "Overdue Cases", value: overdueCases, trend: "18% vs last month", icon: AlertTriangle, tone: "red" },
    { label: "Active Field Teams", value: activeFieldTeams, trend: "10% vs last month", icon: Users, tone: "teal" },
    { label: "High Priority Cases", value: highPriorityCases, trend: "22% vs last month", icon: Flag, tone: "violet" },
  ] as const;

  const toneStyles: Record<string, { ring: string; bg: string; icon: string }> = {
    primary: { ring: "ring-primary/20", bg: "bg-primary/10", icon: "text-primary" },
    green: { ring: "ring-green-300 dark:ring-green-700", bg: "bg-green-100 dark:bg-green-900/30", icon: "text-green-600 dark:text-green-400" },
    slate: { ring: "ring-border", bg: "bg-muted", icon: "text-muted-foreground" },
    amber: { ring: "ring-amber-300 dark:ring-amber-700", bg: "bg-amber-100 dark:bg-amber-900/30", icon: "text-amber-600 dark:text-amber-400" },
    red: { ring: "ring-destructive/30", bg: "bg-destructive/10", icon: "text-destructive" },
    teal: { ring: "ring-teal-300 dark:ring-teal-700", bg: "bg-teal-100 dark:bg-teal-900/30", icon: "text-teal-600 dark:text-teal-400" },
    violet: { ring: "ring-violet-300 dark:ring-violet-700", bg: "bg-violet-100 dark:bg-violet-900/30", icon: "text-violet-600 dark:text-violet-400" },
  };

  // Pagination for the case table
  const PAGE_SIZE = 6;
  const totalPages = Math.max(1, Math.ceil(filteredCases.length / PAGE_SIZE));
  const safePage = Math.min(casePage, totalPages);
  const pagedCases = filteredCases.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  // Splits a simulated/real case name into a short code + descriptive title.
  const splitCaseName = (c: Case): { code: string; title: string } => {
    const display = getCaseDisplayName(c);
    if (display.includes(" · ")) {
      const [code, ...rest] = display.split(" · ");
      return { code, title: rest.join(" · ") };
    }
    return { code: c.caseTypeLabel || "CASE", title: display };
  };

  const getInitials = (name: string) =>
    name.split(/\s+/).map((n) => n[0]).join("").slice(0, 2).toUpperCase();

  // Display status used in the case table (richer than raw open/closed).
  const getDisplayStatus = (c: Case): { label: string; cls: string } => {
    if (c.status === "closed") return { label: "Closed", cls: "bg-muted text-muted-foreground border-border" };
    const fu = getFollowUpStatus(c);
    if (fu?.variant === "destructive") return { label: "Overdue", cls: "bg-destructive/10 text-destructive border-destructive/30" };
    if ((c.followUpCount || 0) > 0) return { label: "In Progress", cls: "bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-700" };
    return { label: "Open", cls: "bg-green-100 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-400 dark:border-green-700" };
  };

  const priorityChip = (p?: string): { label: string; cls: string } | null => {
    if (!p) return null;
    const map: Record<string, { label: string; cls: string }> = {
      high: { label: "High", cls: "text-destructive" },
      medium: { label: "Medium", cls: "text-amber-600 dark:text-amber-400" },
      low: { label: "Low", cls: "text-green-600 dark:text-green-400" },
    };
    return map[p] || null;
  };



  // Export filtered cases to Excel
  const handleExportCases = () => {
    if (filteredCases.length === 0) {
      toast({ title: "No Data", description: "No cases to export.", variant: "destructive" });
      return;
    }

    // Collect all unique property keys across cases
    const allPropKeys = new Set<string>();
    filteredCases.forEach(c => Object.keys(c.properties).forEach(k => allPropKeys.add(k)));
    const propKeys = [...allPropKeys].sort();

    const rows = filteredCases.map(c => {
      const row: Record<string, any> = {
        "Case Name": c.name,
        "Case Type": c.caseTypeLabel,
        "Status": c.status === "open" ? "Open" : "Closed",
        "Project": c.projectName || "",
        "Owner": ownerProfiles.get(c.ownerId) || c.ownerId,
        "Opened At": format(new Date(c.openedAt), "yyyy-MM-dd HH:mm"),
        "Last Modified": format(new Date(c.lastModifiedAt), "yyyy-MM-dd HH:mm"),
        "Total Activities": c.activitiesCount || 0,
        "Follow-ups": c.followUpCount || 0,
        "Next Follow-up": c.nextFollowUpDate ? format(new Date(c.nextFollowUpDate), "yyyy-MM-dd") : "",
      };

      // Add follow-up status
      const fuStatus = getFollowUpStatus(c);
      row["Follow-up Status"] = fuStatus?.label || "";

      // Flatten properties
      for (const key of propKeys) {
        const label = key.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase());
        row[label] = c.properties[key] != null ? String(c.properties[key]) : "";
      }

      return row;
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Cases");
    const fileName = `cases_export_${format(new Date(), "yyyy-MM-dd_HHmm")}.xlsx`;
    XLSX.writeFile(wb, fileName);

    toast({ title: "Export Complete", description: `${filteredCases.length} cases exported to ${fileName}.` });
  };

  return (
    <div className="space-y-5 p-4 lg:p-6 max-w-[1400px] mx-auto">
      {/* CommCare-style Header */}
      <CommCarePageHeader
        title="Case Management"
        icon={Briefcase}
        accent="teal"
        subtitle="Track and manage longitudinal follow-up cases across projects"
        actions={
          <div className="flex items-center gap-2 flex-wrap">
          {isOwner && (
            <Button
              variant={simulate ? "default" : "outline"}
              size="sm"
              onClick={() => setSimulate((s) => !s)}
              className="gap-1"
              title="Owner-only: populate the page with realistic demo data"
            >
              <Activity className="h-4 w-4" />
              <span className="hidden sm:inline">{simulate ? "Simulating…" : "Simulate Data"}</span>
            </Button>
          )}
          {isAdmin && caseTypes.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1">
                  <FilePlus2 className="h-4 w-4" />
                  <span className="hidden sm:inline">Create Follow-Up Form</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {caseTypes.map((ct) => (
                  <DropdownMenuItem
                    key={ct.id}
                    onClick={async () => {
                      // Fetch full case type with properties
                      const { data } = await supabase
                        .from("case_types")
                        .select("id, name, label, description, properties, project_id, projects!inner(name)")
                        .eq("id", ct.id)
                        .single();
                      if (data) {
                        const props = Array.isArray(data.properties) ? data.properties : [];
                        setSelectedCreatorCaseType({
                          id: data.id,
                          name: data.name,
                          label: data.label,
                          description: data.description,
                          properties: (props as any[]).filter(
                            (p: any) => p && typeof p === "object" && p.id && p.name
                          ),
                          projectId: data.project_id,
                          projectName: (data as any).projects?.name,
                        });
                        setShowFollowUpCreator(true);
                      }
                    }}
                  >
                    <ClipboardList className="h-4 w-4 mr-2" />
                    {ct.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
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
          <Button variant="outline" size="sm" onClick={handleExportCases} title="Export to Excel">
            <Download className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={fetchCases}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          </div>
        }
      />


      {/* KPI cards — 7 metric tiles matching the dashboard reference */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
        {kpiCards.map((kpi) => {
          const t = toneStyles[kpi.tone];
          const Icon = kpi.icon;
          return (
            <Card key={kpi.label} className="border border-border/60 shadow-card hover:shadow-lg transition-shadow">
              <CardContent className="p-3.5 space-y-2">
                <div className="flex items-center gap-2.5">
                  <div className={`flex h-9 w-9 items-center justify-center rounded-lg ring-1 ${t.bg} ${t.ring}`}>
                    <Icon className={`h-[18px] w-[18px] ${t.icon}`} />
                  </div>
                  <div className="min-w-0">
                    <p className="font-display text-xl font-bold text-foreground leading-none tabular-nums">
                      {kpi.value.toLocaleString()}
                    </p>
                  </div>
                </div>
                <p className="text-xs font-medium text-muted-foreground">{kpi.label}</p>
                <p className="flex items-center gap-1 text-[10px] font-medium text-green-600 dark:text-green-400">
                  <Activity className="h-3 w-3" /> {kpi.trend}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Tabs: Case List / Map View / Analytics */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
        <TabsList className="bg-transparent p-0 gap-6 border-b border-border/60 rounded-none w-full justify-start h-auto">
          <TabsTrigger value="cases" className="gap-1.5 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:text-primary px-1 pb-2.5">
            <ClipboardList className="h-4 w-4" />
            Case List
          </TabsTrigger>
          <TabsTrigger value="map" className="gap-1.5 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:text-primary px-1 pb-2.5">
            <MapIcon className="h-4 w-4" />
            Map View
          </TabsTrigger>
          <TabsTrigger value="analytics" className="gap-1.5 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:text-primary px-1 pb-2.5">
            <BarChart3 className="h-4 w-4" />
            Analytics
          </TabsTrigger>
          {isAdmin && (
            <TabsTrigger value="configure" className="gap-1.5 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:text-primary px-1 pb-2.5">
              <Settings className="h-4 w-4" />
              Case Types
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="cases" className="mt-4">
          <div className="grid grid-cols-1 xl:grid-cols-4 gap-4">
            {/* Left region: filters + table + map */}
            <div className="xl:col-span-3 space-y-4">
              {/* Filter bar */}
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search cases by name, ID, community..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9 bg-card"
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v as any); setCasePage(1); }}>
                    <SelectTrigger className="w-[110px] bg-card"><SelectValue placeholder="Status" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      <SelectItem value="open">Open</SelectItem>
                      <SelectItem value="closed">Closed</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={projectFilter} onValueChange={(v) => { setProjectFilter(v); setCasePage(1); }}>
                    <SelectTrigger className="w-[130px] bg-card"><SelectValue placeholder="Project" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Projects</SelectItem>
                      {projects.map((p) => (<SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>))}
                    </SelectContent>
                  </Select>
                  <Select value={priorityFilter} onValueChange={(v) => { setPriorityFilter(v); setCasePage(1); }}>
                    <SelectTrigger className="w-[110px] bg-card"><SelectValue placeholder="Priority" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="low">Low</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground">
                    <Filter className="h-4 w-4" /> Filters
                  </Button>
                  <Button
                    variant="link"
                    size="sm"
                    className="text-primary px-1"
                    onClick={() => { setSearchQuery(""); setStatusFilter("all"); setProjectFilter("all"); setPriorityFilter("all"); setCasePage(1); }}
                  >
                    Clear
                  </Button>
                </div>
              </div>

              {/* Bulk Action Bar */}
              {isAdmin && selectedCaseIds.size > 0 && (
                <Card className="border-0 shadow-card bg-primary/5">
                  <CardContent className="p-3 flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="default" className="text-xs">{selectedCaseIds.size} selected</Badge>
                      <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => setSelectedCaseIds(new Set())}>Clear</Button>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" className="text-xs h-7 gap-1" onClick={() => handleBulkAction("close")} disabled={bulkProcessing}><XCircle className="h-3.5 w-3.5" />Close</Button>
                      <Button variant="outline" size="sm" className="text-xs h-7 gap-1" onClick={() => handleBulkAction("reopen")} disabled={bulkProcessing}><RefreshCw className="h-3.5 w-3.5" />Reopen</Button>
                      <Button variant="default" size="sm" className="text-xs h-7 gap-1" onClick={() => handleBulkAction("reassign")} disabled={bulkProcessing}><UserCheck className="h-3.5 w-3.5" />Reassign</Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-7 gap-4">
                {/* Case table */}
                <Card className="lg:col-span-4 border border-border/60 shadow-card overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border/60 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                          <th className="font-medium px-3 py-2.5">Case</th>
                          <th className="font-medium px-3 py-2.5">Assignee</th>
                          <th className="font-medium px-3 py-2.5">Status</th>
                          <th className="font-medium px-3 py-2.5">Location</th>
                          <th className="font-medium px-3 py-2.5">Next Follow-up</th>
                          <th className="px-2 py-2.5" />
                        </tr>
                      </thead>
                      <tbody>
                        {loading ? (
                          <tr><td colSpan={6} className="py-12 text-center"><RefreshCw className="h-5 w-5 animate-spin text-muted-foreground mx-auto" /></td></tr>
                        ) : pagedCases.length === 0 ? (
                          <tr><td colSpan={6} className="py-12 text-center text-sm text-muted-foreground">No cases found.</td></tr>
                        ) : pagedCases.map((caseItem) => {
                          const { code, title } = splitCaseName(caseItem);
                          const assignee = (caseItem.properties?.assignee as string) || ownerProfiles.get(caseItem.ownerId) || caseItem.ownerName || "Unassigned";
                          const role = (caseItem.properties?.role as string) || "Field Officer";
                          const ds = getDisplayStatus(caseItem);
                          const location = (caseItem.properties?.state as string)
                            ? ((caseItem.properties.state as string) === "FCT" ? "Abuja (FCT)" : `${caseItem.properties.state} State`)
                            : (caseItem.projectName || "—");
                          const pchip = priorityChip(caseItem.properties?.priority as string);
                          return (
                            <tr
                              key={caseItem.id}
                              className="border-b border-border/40 last:border-0 hover:bg-muted/40 cursor-pointer align-top"
                              onClick={() => setSelectedCaseId(caseItem.id)}
                            >
                              <td className="px-3 py-3">
                                <p className="font-semibold text-primary text-xs">{code}</p>
                                <p className="text-[11px] text-muted-foreground leading-tight mt-0.5 max-w-[140px]">{title}</p>
                              </td>
                              <td className="px-3 py-3">
                                <div className="flex items-center gap-2">
                                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">
                                    {getInitials(assignee)}
                                  </div>
                                  <div className="min-w-0">
                                    <p className="text-xs font-medium text-foreground truncate">{assignee}</p>
                                    <p className="text-[10px] text-muted-foreground">{role}</p>
                                  </div>
                                </div>
                              </td>
                              <td className="px-3 py-3">
                                <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${ds.cls}`}>{ds.label}</span>
                              </td>
                              <td className="px-3 py-3 text-xs text-muted-foreground whitespace-nowrap">{location}</td>
                              <td className="px-3 py-3">
                                <p className="text-xs text-foreground whitespace-nowrap">
                                  {caseItem.nextFollowUpDate ? format(new Date(caseItem.nextFollowUpDate), "dd MMM yyyy") : "—"}
                                </p>
                                {pchip && <p className={`text-[10px] font-medium ${pchip.cls}`}>{pchip.label}</p>}
                              </td>
                              <td className="px-2 py-3" onClick={(e) => e.stopPropagation()}>
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-7 w-7"><MoreVertical className="h-4 w-4" /></Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    <DropdownMenuItem onClick={() => setSelectedCaseId(caseItem.id)}><Eye className="h-4 w-4 mr-2" />View Details</DropdownMenuItem>
                                    {caseItem.status === "open" && (followUpCatalog[caseItem.caseTypeId] || []).length > 0 && (
                                      <DropdownMenuItem onClick={() => handleFollowUp(caseItem)}><ClipboardList className="h-4 w-4 mr-2" />Follow-up</DropdownMenuItem>
                                    )}
                                    {caseItem.status === "open" ? (
                                      <DropdownMenuItem onClick={() => handleCloseCase(caseItem.id)}><XCircle className="h-4 w-4 mr-2" />Close Case</DropdownMenuItem>
                                    ) : (
                                      <DropdownMenuItem onClick={() => handleReopenCase(caseItem.id)}><RefreshCw className="h-4 w-4 mr-2" />Reopen Case</DropdownMenuItem>
                                    )}
                                    {isAdmin && (
                                      <DropdownMenuItem onClick={() => handleOpenReassign(caseItem)}><UserCheck className="h-4 w-4 mr-2" />Reassign</DropdownMenuItem>
                                    )}
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {/* Pagination footer */}
                  <div className="flex items-center justify-between gap-2 border-t border-border/60 px-3 py-2.5 flex-wrap">
                    <p className="text-[11px] text-muted-foreground">
                      {filteredCases.length === 0
                        ? "No cases"
                        : `Showing ${(safePage - 1) * PAGE_SIZE + 1} to ${Math.min(safePage * PAGE_SIZE, filteredCases.length)} of ${filteredCases.length.toLocaleString()} cases`}
                    </p>
                    <div className="flex items-center gap-1">
                      <Button variant="outline" size="icon" className="h-7 w-7" disabled={safePage <= 1} onClick={() => setCasePage((p) => Math.max(1, p - 1))}>
                        <ChevronLeft className="h-3.5 w-3.5" />
                      </Button>
                      <span className="px-2 text-xs font-medium text-foreground">{safePage} / {totalPages}</span>
                      <Button variant="outline" size="icon" className="h-7 w-7" disabled={safePage >= totalPages} onClick={() => setCasePage((p) => Math.min(totalPages, p + 1))}>
                        <ChevronRight className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </Card>

                {/* Map */}
                <Card className="lg:col-span-3 border border-border/60 shadow-card overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/60">
                    <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                      Case Distribution Across Nigeria
                      <Info className="h-3.5 w-3.5 text-muted-foreground" />
                    </p>
                  </div>
                  <div className="p-0">
                    <CaseLocationMap
                      projectFilter={projectFilter}
                      caseTypeFilter={caseTypeFilter}
                      statusFilter={statusFilter}
                      simulatedMarkers={simulatedData ? simulatedData.markers : undefined}
                    />
                  </div>
                </Card>
              </div>
            </div>

            {/* Right region: Insights */}
            <div className="xl:col-span-1">
              <CaseInsightsPanel data={insightsData} />
            </div>
          </div>
        </TabsContent>


        <TabsContent value="map" className="mt-4">
          <CaseLocationMap
            projectFilter={projectFilter}
            caseTypeFilter={caseTypeFilter}
            statusFilter={statusFilter}
            simulatedMarkers={simulatedData ? simulatedData.markers : undefined}
          />
        </TabsContent>

        <TabsContent value="analytics" className="mt-4 space-y-4">
          <Card className="overflow-hidden border border-primary/20 shadow-card bg-gradient-to-r from-primary/8 via-card to-destructive/8">
            <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <BarChart3 className="h-4 w-4 text-primary" />
                  Longitudinal Follow-up Analysis
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Flatten and explore every follow-up visit across cases in a full-screen view.
                </p>
              </div>
              <Button variant="acg" size="sm" className="gap-1.5" onClick={() => setShowLongitudinal(true)}>
                <Activity className="h-4 w-4" />
                Open Full-screen Analysis
              </Button>
            </CardContent>
          </Card>
          <CaseAgingAnalytics cases={filteredCases} />
        </TabsContent>


        {isAdmin && (
          <TabsContent value="configure" className="mt-4">
            <CaseTypesManager projects={projects} />
          </TabsContent>
        )}
      </Tabs>

      {showLongitudinal && (
        <CaseLongitudinalAnalysis
          cases={filteredCases.map((c) => ({
            id: c.id,
            name: c.name,
            status: c.status,
            openedAt: c.openedAt,
            caseTypeLabel: c.caseTypeLabel,
            caseTypeId: c.caseTypeId,
            properties: c.properties,
          }))}
          onClose={() => setShowLongitudinal(false)}
        />
      )}



      {/* Case Details Dialog */}
      <CaseDetails
        open={!!selectedCaseId}
        onOpenChange={(open) => !open && setSelectedCaseId(null)}
        caseId={selectedCaseId || undefined}
        onLaunchFollowUp={(c) => handleFollowUp(c as unknown as Case)}
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

      {/* Bulk Reassign Dialog */}
      <Dialog open={bulkAction === "reassign"} onOpenChange={(open) => !open && setBulkAction(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserCheck className="h-5 w-5 text-primary" />
              Bulk Reassign
            </DialogTitle>
            <DialogDescription>
              Reassign {selectedCaseIds.size} selected case(s) to a new owner.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Select value={bulkReassignUserId} onValueChange={setBulkReassignUserId}>
              <SelectTrigger>
                <SelectValue placeholder="Select new owner..." />
              </SelectTrigger>
              <SelectContent>
                {bulkProjectUsers.length === 0 ? (
                  <SelectItem value="__none" disabled>No users found</SelectItem>
                ) : (
                  bulkProjectUsers.map((u) => (
                    <SelectItem key={u.user_id} value={u.user_id}>
                      {u.name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setBulkAction(null)}>
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleBulkReassign}
                disabled={!bulkReassignUserId || bulkProcessing}
              >
                {bulkProcessing ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <UserCheck className="h-4 w-4 mr-1" />}
                Reassign {selectedCaseIds.size} Cases
              </Button>
            </div>
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

      {/* Reassign Case Dialog */}
      <Dialog open={!!reassigningCase} onOpenChange={(open) => !open && setReassigningCase(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserCheck className="h-5 w-5 text-primary" />
              Reassign Case
            </DialogTitle>
            <DialogDescription>
              Transfer ownership of <span className="font-medium">{reassigningCase?.name}</span> to another user in this project.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Select value={reassignUserId} onValueChange={setReassignUserId}>
              <SelectTrigger>
                <SelectValue placeholder="Select new owner..." />
              </SelectTrigger>
              <SelectContent>
                {projectUsers.length === 0 ? (
                  <SelectItem value="__none" disabled>No other users in project</SelectItem>
                ) : (
                  projectUsers.map((u) => (
                    <SelectItem key={u.user_id} value={u.user_id}>
                      {u.name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setReassigningCase(null)}>
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleReassignCase}
                disabled={!reassignUserId || reassigning}
              >
                {reassigning ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <UserCheck className="h-4 w-4 mr-1" />}
                Reassign
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Follow-Up Form Creator */}
      {selectedCreatorCaseType && (
        <FollowUpFormCreator
          open={showFollowUpCreator}
          onOpenChange={(open) => {
            setShowFollowUpCreator(open);
            if (!open) setSelectedCreatorCaseType(null);
          }}
          caseType={selectedCreatorCaseType}
          onFormCreated={() => {
            fetchCases();
          }}
        />
      )}
    </div>
  );
};

export default CasesView;

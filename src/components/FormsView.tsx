import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useSearchParams } from "react-router-dom";
import acgLogo from "@/assets/acg-logo.png";
import UserGeofenceManager from "@/components/FormBuilder/UserGeofenceManager";
import { MicroplanningView } from "@/components/Microplanning";
import { StandardAssessmentView } from "@/components/StandardAssessments";
import { DigitalAttendanceView } from "@/components/DigitalAttendance";
import { STANDARD_ASSESSMENTS, StandardFormCode } from "@/lib/standardAssessments/definitions";
import { HeartPulse, Brain as BrainIcon, Accessibility, Stethoscope, Sparkles, Wrench, ClipboardCheck } from "lucide-react";
import FormDailyTargetDialog from "@/components/FormDailyTargetDialog";
import {
  FileText,
  Edit,
  Send,
  Eye,
  Trash2,
  Plus,
  Search,
  Filter,
  MoreVertical,
  Loader2,
  ArrowLeft,
  FolderOpen,
  Folder,
  ClipboardList,
  History,
  CheckCircle,
  XCircle,
  FileEdit,
  LayoutDashboard,
  Download,
  CloudOff,
  Wifi,
  WifiOff,
  LayoutTemplate,
  MapPin,
  QrCode,
  Target,
  Menu,
  Clock,
  ChevronRight,
  Home,
  Users,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { FormBuilder } from "@/components/FormBuilder";
import { FormFiller } from "@/components/FormFiller";
import { FormGroup } from "@/components/FormBuilder/types";
import SubmissionHistory from "@/components/SubmissionHistory";
import { DashboardBuilder } from "@/components/DashboardBuilder";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useAdminSurveillance } from "@/hooks/useAdminSurveillance";
import { useOfflineForms } from "@/hooks/useOfflineForms";
import FormQRCode from "@/components/FormQRCode";
import QRCodeScanner from "@/components/QRCodeScanner";
import { Question, GeofenceArea } from "@/components/FormBuilder/types";
import { CommCarePageHeader } from "@/components/ui/commcare-page-header";

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

interface Form {
  id: string;
  name: string;
  description: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  project_id: string;
  questions: Question[];
  groups: FormGroup[];
  geofence: GeofenceArea | null;
  settings: FormSettings;
  submissions_count?: number;
}

interface Project {
  id: string;
  name: string;
}

// CommCare-style solid color tiles — matches Amehnities Forms mockup exactly
// NOTE: "Projects" is intentionally rendered as a Select dropdown (below) instead
// of a tile, so selecting a project never causes a navigation/blink.
const formActions = [
  { id: "fill",     label: "Fill Blank Form",  icon: FileText, description: "Start a new form",   tile: "bg-[#2F6FE6]" },
  { id: "edit",     label: "Edit Saved Forms", icon: FileEdit, description: "Continue drafts",    tile: "bg-[#22A55A]" },
  { id: "send",     label: "Send Finalized",   icon: Send,     description: "Sync to server",     tile: "bg-[#23B5AE]" },
  { id: "view",     label: "View Sent Forms",  icon: Eye,      description: "Review submissions", tile: "bg-[#7C5CFF]" },
  { id: "delete",   label: "Delete Saved",     icon: Trash2,   description: "Remove drafts",      tile: "bg-[#E25555]" },
];

// Rotating soft tints for the Available Forms list icon chips
const formIconTints = [
  { bg: "bg-[#E3ECFB]", fg: "text-[#1F6FEB]" },
  { bg: "bg-[#E2F5EC]", fg: "text-[#22A55A]" },
  { bg: "bg-[#FCE9DA]", fg: "text-[#F08A2A]" },
  { bg: "bg-[#EDE7FE]", fg: "text-[#7C5CFF]" },
  { bg: "bg-[#DCF3F0]", fg: "text-[#1FB5A8]" },
];

// Single source of truth for per-project accent color used across the Forms UI
// (project dropdown trigger/items + Available Forms left-border + form name).
export const PROJECT_ACCENT_COLORS = [
  "#16A34A", // green
  "#2563EB", // blue
  "#D4A017", // gold
  "#7C3AED", // purple
  "#DB2777", // pink
] as const;

export const getProjectAccent = (
  projectId: string | null | undefined,
  projects: { id: string }[],
  fallbackIdx = 0,
): string => {
  if (!projectId) return PROJECT_ACCENT_COLORS[fallbackIdx % PROJECT_ACCENT_COLORS.length];
  const i = projects.findIndex((p) => p.id === projectId);
  return PROJECT_ACCENT_COLORS[(i >= 0 ? i : fallbackIdx) % PROJECT_ACCENT_COLORS.length];
};

interface FormsViewProps {
  selectedProjectId?: string | null;
}

const FormsView = ({ selectedProjectId }: FormsViewProps) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [forms, setForms] = useState<Form[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(selectedProjectId || null);
  const [loading, setLoading] = useState(true);
  const [showFormBuilder, setShowFormBuilder] = useState(false);
  const [editingForm, setEditingForm] = useState<Form | null>(null);
  const [fillingForm, setFillingForm] = useState<Form | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [quickActionMode, setQuickActionMode] = useState<string | null>(null);
  const [selectingFormFor, setSelectingFormFor] = useState<string | null>(null);
  const [formToDelete, setFormToDelete] = useState<Form | null>(null);
  const [dashboardForm, setDashboardForm] = useState<Form | null>(null);
  const [templateForm, setTemplateForm] = useState<{ templateId: string; name: string; description: string; questions: Question[]; settings: any; geofence?: GeofenceArea } | null>(null);
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [templates, setTemplates] = useState<{ id: string; name: string; description: string | null; questions: any[]; settings: any; category: string }[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [geofenceManagerForm, setGeofenceManagerForm] = useState<Form | null>(null);
  const [qrCodeForm, setQrCodeForm] = useState<Form | null>(null);
  const [dailyTargetForm, setDailyTargetForm] = useState<Form | null>(null);
  const [showQRScanner, setShowQRScanner] = useState(false);
  const [hasMicroplanAccess, setHasMicroplanAccess] = useState(false);
  const [microplanFillingActive, setMicroplanFillingActive] = useState(false);
  const [activeStandardAssessment, setActiveStandardAssessment] = useState<StandardFormCode | null>(null);
  const [showDigitalAttendance, setShowDigitalAttendance] = useState(false);
  const [disabledStandardCodes, setDisabledStandardCodes] = useState<Set<StandardFormCode>>(new Set());
  const { user, isAdmin, isSuperAdmin, isOwner, role } = useAuth();
  const { isOnline, downloadForm, removeForm, isFormAvailableOffline, offlineForms } = useOfflineForms();
  const { logAction } = useAdminSurveillance();
  const [, setSearchParams] = useSearchParams();

  // Load soft-disabled standard forms
  useEffect(() => {
    let active = true;
    (async () => {
      const { data } = await supabase.from("standard_form_disabled" as any).select("form_code");
      if (active && data) {
        setDisabledStandardCodes(new Set((data as any[]).map((r) => r.form_code as StandardFormCode)));
      }
    })();
    return () => { active = false; };
  }, []);

  const toggleStandardForm = async (code: StandardFormCode, disable: boolean) => {
    if (!user) return;
    if (disable) {
      await supabase.from("standard_form_disabled" as any).insert({ form_code: code, disabled_by: user.id });
      setDisabledStandardCodes((s) => new Set(s).add(code));
    } else {
      await supabase.from("standard_form_disabled" as any).delete().eq("form_code", code);
      setDisabledStandardCodes((s) => { const n = new Set(s); n.delete(code); return n; });
    }
    toast({ title: disable ? "Standard form disabled" : "Standard form enabled" });
  };

  // Check if user has microplan form access
  useEffect(() => {
    const checkMicroplanAccess = async () => {
      if (!user?.id) return;
      const { data } = await supabase
        .from("microplan_form_access")
        .select("id")
        .eq("user_id", user.id)
        .limit(1);
      setHasMicroplanAccess(!!data && data.length > 0);
    };
    checkMicroplanAccess();
  }, [user?.id]);

  useEffect(() => {
    fetchProjects();
  }, []);

  useEffect(() => {
    if (selectedProjectId) {
      setCurrentProjectId(selectedProjectId);
    }
  }, [selectedProjectId]);

  useEffect(() => {
    if (currentProjectId) {
      fetchForms(currentProjectId);
    } else {
      fetchAllForms();
    }
  }, [currentProjectId]);

  const fetchProjects = async () => {
    try {
      let projectsData;
      
      // Super admins see all projects; Systems admins only see assigned projects
      if (isSuperAdmin) {
        const { data, error } = await supabase
          .from("projects")
          .select("id, name")
          .order("name");
        if (error) throw error;
        projectsData = data;
      } else if (role === "systems_admin" || !isAdmin) {
        // Systems admins and regular users see only assigned projects
        const { data: assignments, error: assignError } = await supabase
          .from("user_project_assignments")
          .select("project_id")
          .eq("user_id", user?.id);
        
        if (assignError) throw assignError;
        
        if (assignments && assignments.length > 0) {
          const projectIds = assignments.map(a => a.project_id);
          const { data, error } = await supabase
            .from("projects")
            .select("id, name")
            .in("id", projectIds)
            .order("name");
          if (error) throw error;
          projectsData = data;
        } else {
          projectsData = [];
        }
      } else {
        projectsData = [];
      }
      
      setProjects(projectsData || []);
    } catch (error: any) {
      console.error("Error fetching projects:", error);
    }
  };

  const fetchForms = async (projectId: string) => {
    try {
      setLoading(true);
      const { data: formsData, error } = await supabase
        .from("forms")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Get submission counts and cast types
      const formsWithCounts = await Promise.all(
        (formsData || []).map(async (form) => {
          const { count } = await supabase
            .from("form_submissions")
            .select("id", { count: "exact" })
            .eq("form_id", form.id);
          const allItems = (form.questions as unknown as any[]) || [];
          const groupItems = allItems.filter((q: any) => Array.isArray(q.questions)) as FormGroup[];
          const ungroupedQuestions = allItems.filter((q: any) => !Array.isArray(q.questions)) as Question[];
          return {
            ...form,
            questions: ungroupedQuestions,
            groups: groupItems,
            geofence: (form.geofence as unknown as GeofenceArea) || null,
            settings: (form.settings as unknown as FormSettings) || {},
            submissions_count: count || 0,
          };
        })
      );

      setForms(formsWithCounts);
    } catch (error: any) {
      console.error("Error fetching forms:", error);
      toast({
        title: "Error loading forms",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchAllForms = async () => {
    try {
      setLoading(true);
      
      // Super admins see all forms; Systems admins only see assigned forms
      let formsData;
      if (isSuperAdmin) {
        const { data, error } = await supabase
          .from("forms")
          .select("*")
          .order("created_at", { ascending: false });
        if (error) throw error;
        formsData = data;
      } else if (role === "systems_admin") {
        // Systems admins see only forms they are assigned to via project or form assignments
        const { data: formAssignments, error: formAssignError } = await supabase
          .from("user_form_assignments")
          .select("form_id")
          .eq("user_id", user?.id);
        
        if (formAssignError) throw formAssignError;
        
        // Also get forms from assigned projects
        const { data: projectAssignments, error: projectAssignError } = await supabase
          .from("user_project_assignments")
          .select("project_id")
          .eq("user_id", user?.id);
        
        if (projectAssignError) throw projectAssignError;
        
        const directFormIds = formAssignments?.map(a => a.form_id) || [];
        const projectIds = projectAssignments?.map(a => a.project_id) || [];
        
        let formsFromProjects: string[] = [];
        if (projectIds.length > 0) {
          const { data: projectForms } = await supabase
            .from("forms")
            .select("id")
            .in("project_id", projectIds);
          formsFromProjects = projectForms?.map(f => f.id) || [];
        }
        
        const allFormIds = [...new Set([...directFormIds, ...formsFromProjects])];
        
        if (allFormIds.length > 0) {
          const { data, error } = await supabase
            .from("forms")
            .select("*")
            .in("id", allFormIds)
            .order("created_at", { ascending: false });
          if (error) throw error;
          formsData = data;
        } else {
          formsData = [];
        }
      } else {
        // Regular users get only assigned forms
        const { data: assignments, error: assignError } = await supabase
          .from("user_form_assignments")
          .select("form_id")
          .eq("user_id", user?.id);
        
        if (assignError) throw assignError;
        
        if (assignments && assignments.length > 0) {
          const formIds = assignments.map(a => a.form_id);
          const { data, error } = await supabase
            .from("forms")
            .select("*")
            .in("id", formIds)
            .order("created_at", { ascending: false });
          if (error) throw error;
          formsData = data;
        } else {
          formsData = [];
        }
      }

      // Get submission counts and cast types
      const formsWithCounts = await Promise.all(
        (formsData || []).map(async (form) => {
          const { count } = await supabase
            .from("form_submissions")
            .select("id", { count: "exact" })
            .eq("form_id", form.id);
          const allItems = (form.questions as unknown as any[]) || [];
          const groupItems = allItems.filter((q: any) => Array.isArray(q.questions)) as FormGroup[];
          const ungroupedQuestions = allItems.filter((q: any) => !Array.isArray(q.questions)) as Question[];
          return {
            ...form,
            questions: ungroupedQuestions,
            groups: groupItems,
            geofence: (form.geofence as unknown as GeofenceArea) || null,
            settings: (form.settings as unknown as FormSettings) || {},
            submissions_count: count || 0,
          };
        })
      );

      setForms(formsWithCounts);
    } catch (error: any) {
      console.error("Error fetching forms:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteForm = async (formId: string) => {
    try {
      const { error } = await supabase.from("forms").delete().eq("id", formId);
      if (error) throw error;
      const form = forms.find(f => f.id === formId);
      await logAction("delete_form", `Deleted form "${form?.name || formId}"`, "form", formId);
      toast({ title: "Form deleted successfully" });
      if (currentProjectId) {
        fetchForms(currentProjectId);
      } else {
        fetchAllForms();
      }
    } catch (error: any) {
      toast({
        title: "Error deleting form",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleUpdateFormStatus = async (formId: string, newStatus: string) => {
    try {
      const { error } = await supabase
        .from("forms")
        .update({ status: newStatus })
        .eq("id", formId);
      if (error) throw error;
      toast({ 
        title: "Form status updated",
        description: `Form is now ${newStatus}.`
      });
      if (currentProjectId) {
        fetchForms(currentProjectId);
      } else {
        fetchAllForms();
      }
    } catch (error: any) {
      toast({
        title: "Error updating form status",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleQuickAction = (actionId: string) => {
    if (filteredForms.length === 0) {
      toast({
        title: "No forms available",
        description: "There are no forms to perform this action on.",
        variant: "destructive",
      });
      return;
    }
    setSelectingFormFor(actionId);
  };

  const handleFormActionSelect = async (form: Form, actionId: string) => {
    setSelectingFormFor(null);
    
    switch (actionId) {
      case "fill":
        if (form.status === "active") {
          setFillingForm(form);
        } else {
          toast({
            title: "Form Not Active",
            description: "This form is not currently accepting submissions.",
            variant: "destructive",
          });
        }
        break;
      case "edit":
        // View/edit saved submissions - same as View button
        setQuickActionMode("edit");
        setShowHistory(true);
        break;
      case "send":
        // Sync pending submissions
        await syncPendingSubmissions(form.id);
        break;
      case "view":
        // View sent/synced forms
        setQuickActionMode("view");
        setShowHistory(true);
        break;
      case "delete":
        await deleteSavedSubmissions(form.id);
        break;
      default:
        break;
    }
  };

  const syncPendingSubmissions = async (formId: string) => {
    try {
      const { data, error } = await supabase
        .from("form_submissions")
        .update({ 
          status: "sent", 
          submitted_at: new Date().toISOString(),
          synced_at: new Date().toISOString() 
        })
        .eq("form_id", formId)
        .eq("user_id", user?.id)
        .eq("status", "draft")
        .select();

      if (error) throw error;

      if (data && data.length > 0) {
        toast({
          title: "Submissions Synced",
          description: `${data.length} submission(s) have been synced to the server.`,
        });
      } else {
        toast({
          title: "No Pending Submissions",
          description: "There are no draft submissions to sync for this form.",
        });
      }
    } catch (error: any) {
      toast({
        title: "Sync Failed",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const deleteSavedSubmissions = async (formId: string) => {
    try {
      const { data, error } = await supabase
        .from("form_submissions")
        .delete()
        .eq("form_id", formId)
        .eq("user_id", user?.id)
        .eq("status", "draft")
        .select();

      if (error) throw error;

      if (data && data.length > 0) {
        toast({
          title: "Saved Forms Deleted",
          description: `${data.length} saved submission(s) have been deleted.`,
        });
      } else {
        toast({
          title: "No Saved Forms",
          description: "There are no draft submissions to delete for this form.",
        });
      }
    } catch (error: any) {
      toast({
        title: "Delete Failed",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  // When offline, merge offline forms with server forms
  const mergedForms = !isOnline ? [...forms, ...offlineForms.filter(of => !forms.some(f => f.id === of.id)).map(of => {
    const allItems = (of.questions as unknown as any[]) || [];
    const groupItems = allItems.filter((q: any) => Array.isArray(q.questions)) as FormGroup[];
    const ungroupedQuestions = allItems.filter((q: any) => !Array.isArray(q.questions)) as Question[];
    return {
      ...of,
      questions: ungroupedQuestions,
      groups: groupItems,
      submissions_count: 0,
      created_at: of.downloaded_at,
    } as Form;
  })] : forms;

  const filteredForms = mergedForms.filter((form) =>
    form.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const currentProject = projects.find(p => p.id === currentProjectId);

  if (activeStandardAssessment) {
    return (
      <StandardAssessmentView
        code={activeStandardAssessment}
        projectId={currentProjectId}
        onClose={() => setActiveStandardAssessment(null)}
      />
    );
  }

  if (showDigitalAttendance) {
    return (
      <DigitalAttendanceView
        projectId={currentProjectId}
        onClose={() => setShowDigitalAttendance(false)}
      />
    );
  }


  if (microplanFillingActive) {
    // From the Forms page we ALWAYS show the entry-only flow.
    // The full Geo Microplanning page is reserved for Super Admins and
    // Systems Admins (granted access by the owner) via the sidebar route.
    return (
      <div className="space-y-4">
        <Button variant="outline" size="sm" onClick={() => setMicroplanFillingActive(false)}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to Forms
        </Button>
        <MicroplanningView entryOnly={true} />
      </div>
    );
  }

  if (showHistory) {
    return <SubmissionHistory onClose={() => setShowHistory(false)} />;
  }

  if (dashboardForm) {
    return (
      <DashboardBuilder
        formId={dashboardForm.id}
        formName={dashboardForm.name}
        isAdmin={isAdmin}
        onBack={() => setDashboardForm(null)}
      />
    );
  }

  if (geofenceManagerForm) {
    return (
      <UserGeofenceManager
        formId={geofenceManagerForm.id}
        formName={geofenceManagerForm.name}
        onClose={() => setGeofenceManagerForm(null)}
      />
    );
  }

  if (fillingForm) {
    return (
      <FormFiller
        formId={fillingForm.id}
        formName={fillingForm.name}
        formDescription={fillingForm.description || ""}
        questions={fillingForm.questions}
        groups={fillingForm.groups}
        geofence={fillingForm.geofence || undefined}
        userId={user?.id || ""}
        projectId={fillingForm.project_id || currentProjectId || ""}
        requireLocation={fillingForm.settings?.requireLocation}
        settings={fillingForm.settings}
        onClose={() => setFillingForm(null)}
        onSubmitSuccess={(submissionId) => {
          toast({
            title: "Form Submitted",
            description: `Submission ID: ${submissionId.slice(0, 8)}...`,
          });
          if (currentProjectId) {
            fetchForms(currentProjectId);
          } else {
            fetchAllForms();
          }
        }}
      />
    );
  }

  if (showFormBuilder) {
    const prePopulate = editingForm
      ? {
          id: editingForm.id,
          name: editingForm.name,
          description: editingForm.description || "",
          // IMPORTANT: fetchForms() splits the stored `questions` JSON into two
          // arrays (`questions` = ungrouped, `groups` = group items). FormBuilder
          // expects them recombined in a single array (groups first, then loose
          // questions) so its internal split logic can re-derive both. Without
          // this recombine, Snap-to-Form / XLSForm-imported forms (which are
          // mostly groups) appear EMPTY in the Questions tab when edited.
          questions: [
            ...((editingForm.groups as unknown as Question[]) || []),
            ...(editingForm.questions || []),
          ],
          settings: editingForm.settings,
          geofence: editingForm.geofence || undefined,
        }
      : templateForm
      ? {
          id: "", // empty = new form
          name: templateForm.name,
          description: templateForm.description,
          questions: templateForm.questions,
          settings: templateForm.settings,
          geofence: templateForm.geofence,
        }
      : undefined;

    return (
      <FormBuilder 
        onClose={() => {
          setShowFormBuilder(false);
          setEditingForm(null);
          setTemplateForm(null);
          if (currentProjectId) {
            fetchForms(currentProjectId);
          } else {
            fetchAllForms();
          }
        }}
        projectId={editingForm?.project_id || currentProjectId || undefined}
        templateId={templateForm?.templateId}
        editForm={prePopulate}
      />
    );
  }

  const handleEditForm = (form: Form) => {
    setEditingForm(form);
    setShowFormBuilder(true);
  };

  return (
    <div className="relative min-h-full bg-[#F4F6F8] pb-24">
      {/* CommCare-style App Bar — Amehnities Forms */}
      <div className="bg-[#2F6FE6] text-white shadow-sm">
        <div className="flex items-center gap-3 px-4 py-3.5 sm:px-6">
          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10 -ml-1 text-white hover:bg-white/15 hover:text-white"
            aria-label="Menu"
            onClick={() => {
              // best-effort: open the global sidebar if present
              const evt = new CustomEvent("amehnities:open-sidebar");
              window.dispatchEvent(evt);
            }}
          >
            <Menu className="h-6 w-6" strokeWidth={2.25} />
          </Button>

          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white shadow-sm">
              <img src={acgLogo} alt="Amehnities" className="h-7 w-7 object-contain" />
            </div>
            <div className="min-w-0">
              <h1 className="font-display text-lg sm:text-xl font-bold leading-tight truncate">
                Amehnities
              </h1>
              <p className="text-xs sm:text-sm text-white/85 leading-tight truncate">
                {currentProject ? currentProject.name : "Forms"}
                {!isOnline && (
                  <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-white/20 px-1.5 py-0.5 text-[10px] font-medium">
                    <WifiOff className="h-3 w-3" /> Offline
                  </span>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-0.5">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowQRScanner(true)}
              className="h-10 w-10 rounded-full text-white hover:bg-white/15 hover:text-white"
              aria-label="Scan QR"
            >
              <QrCode className="h-5 w-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowHistory(true)}
              className="h-10 w-10 rounded-full border border-white/60 text-white hover:bg-white/15 hover:text-white"
              aria-label="History"
            >
              <Clock className="h-5 w-5" />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-10 w-10 text-white hover:bg-white/15 hover:text-white"
                  aria-label="More"
                >
                  <MoreVertical className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                {isAdmin && !currentProjectId && projects.length > 0 && (
                  <>
                    <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                      Filter by project
                    </div>
                    <div className="px-2 pb-2">
                      <Select
                        value={currentProjectId || "all"}
                        onValueChange={(val) => setCurrentProjectId(val === "all" ? null : val)}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <FolderOpen className="mr-2 h-3.5 w-3.5" />
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Projects</SelectItem>
                          {projects.map((project) => (
                            <SelectItem key={project.id} value={project.id}>
                              {project.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <DropdownMenuSeparator />
                  </>
                )}
                {isAdmin && (
                  <DropdownMenuItem
                    onClick={async () => {
                      if (!currentProjectId && projects.length > 0) {
                        toast({ title: "Select a Project", description: "Please select a project first.", variant: "destructive" });
                        return;
                      }
                      setLoadingTemplates(true);
                      setShowTemplatePicker(true);
                      try {
                        const { data } = await supabase
                          .from("form_templates")
                          .select("id, name, description, questions, settings, category")
                          .order("updated_at", { ascending: false });
                        setTemplates(
                          (data || []).map((t: any) => ({
                            ...t,
                            questions: Array.isArray(t.questions) ? t.questions : [],
                            settings: t.settings || {},
                          }))
                        );
                      } catch (e) {
                        console.error(e);
                      } finally {
                        setLoadingTemplates(false);
                      }
                    }}
                  >
                    <LayoutTemplate className="mr-2 h-4 w-4" />
                    From Template
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => setShowHistory(true)}>
                  <History className="mr-2 h-4 w-4" />
                  Submission History
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setShowQRScanner(true)}>
                  <QrCode className="mr-2 h-4 w-4" />
                  Scan QR
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      <div className="px-4 sm:px-6 pt-5 space-y-6">
        {/* Project selector — at the top of the page; trigger border + icon + text
            and each item label are tinted with the project's accent color, using
            the shared PROJECT_ACCENT_COLORS palette so Forms ↔ Projects stay in sync. */}
        <section>
          {(() => {
            const activeColor = currentProjectId
              ? getProjectAccent(currentProjectId, projects)
              : "#0F172A";
            return (
              <Select
                value={currentProjectId || "all"}
                onValueChange={(val) => setCurrentProjectId(val === "all" ? null : val)}
              >
                <SelectTrigger
                  className="h-11 w-full rounded-xl border-2 bg-white text-sm font-semibold shadow-sm"
                  style={{ borderColor: activeColor, color: activeColor }}
                >
                  <FolderOpen className="mr-2 h-4 w-4" style={{ color: activeColor }} />
                  <SelectValue placeholder="All Projects" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">
                    <span className="font-semibold text-foreground">All Projects</span>
                  </SelectItem>
                  {projects.map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      <span
                        className="font-semibold"
                        style={{ color: getProjectAccent(project.id, projects) }}
                      >
                        {project.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            );
          })()}
        </section>

        <section>
          <h2 className="mb-3 font-display text-xl sm:text-2xl font-bold tracking-tight text-gradient-gold">
            Quick Actions
          </h2>
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            {formActions.map((action, index) => (
              <motion.button
                key={action.id}
                initial={{ opacity: 0, y: 12, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.3, delay: 0.03 + index * 0.03, ease: [0.25, 0.46, 0.45, 0.94] }}
                whileTap={{ scale: 0.97 }}
                onClick={() => handleQuickAction(action.id)}
                className={`${action.tile} group relative flex min-h-[96px] sm:min-h-[112px] flex-col items-center justify-center gap-1.5 sm:gap-2 rounded-xl p-3 sm:p-4 text-white shadow-[0_1px_4px_rgba(0,0,0,0.08)] transition-shadow hover:shadow-[0_4px_12px_rgba(0,0,0,0.12)] focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#F4F6F8]`}
              >
                <action.icon
                  className="h-8 w-8 sm:h-9 sm:w-9 drop-shadow-sm"
                  strokeWidth={1.75}
                />
                <div className="text-center leading-tight">
                  <div className="text-[11px] sm:text-sm font-semibold">
                    {action.label}
                  </div>
                  <div className="text-[10px] sm:text-xs text-white/85 mt-0.5 hidden sm:block">
                    {action.description}
                  </div>
                </div>
              </motion.button>
            ))}
          </div>
        </section>

        {/* Available Forms */}
        <section>
          <div className="mb-3 flex items-end justify-between">
            <h2 className="font-display text-2xl font-bold tracking-tight text-foreground">
              Available Forms
            </h2>
            <button
              onClick={() => setShowHistory(true)}
              className="inline-flex items-center gap-1 text-sm font-semibold text-[#2F6FE6] hover:underline"
            >
              View all <ChevronRight className="h-4 w-4" />
            </button>
          </div>




          {/* Loading skeleton */}
          {loading && (
            <div className="space-y-2 rounded-xl border border-border/60 bg-white p-2 shadow-sm">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-3 rounded-lg p-3">
                  <div className="h-11 w-11 rounded-lg bg-muted animate-pulse shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-44 rounded bg-muted animate-pulse" />
                    <div className="h-3 w-56 rounded bg-muted animate-pulse" />
                  </div>
                  <div className="h-6 w-16 rounded-full bg-muted animate-pulse shrink-0" />
                </div>
              ))}
            </div>
          )}

          {/* Forms List */}
          {!loading && (
            <div className="overflow-hidden rounded-xl border border-border/60 bg-white shadow-sm divide-y divide-border/60">
              {filteredForms.length === 0 ? (
                <div className="flex h-44 flex-col items-center justify-center text-center px-4">
                  <FileText className="h-10 w-10 text-muted-foreground/50" />
                  <h3 className="mt-3 font-display text-base font-semibold text-foreground">
                    No forms found
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {isAdmin
                      ? currentProjectId
                        ? "Create your first form for this project"
                        : "Select a project to create forms"
                      : "No forms have been assigned to you yet"}
                  </p>
                </div>
              ) : (
                <>
                <div className="flex items-center gap-2 bg-gradient-to-r from-[#E3ECFB]/60 to-transparent px-3 sm:px-4 py-2">
                  <FileEdit className="h-4 w-4 text-[#2F6FE6]" />
                  <span className="text-xs font-bold uppercase tracking-wider text-[#1656BA]">
                    Custom forms
                  </span>
                  <span className="text-xs text-muted-foreground">· {filteredForms.length} built by your team</span>
                </div>
                {filteredForms.map((form, idx) => {
                  // Vary the row icon by index to feel like the mockup (home, group, clipboard...)
                  const rowIconSet = [
                    { Icon: Home,          bg: "bg-[#E3ECFB]", fg: "text-[#2F6FE6]" },
                    { Icon: Users,         bg: "bg-[#E2F5EC]", fg: "text-[#22A55A]" },
                    { Icon: ClipboardList, bg: "bg-[#E3ECFB]", fg: "text-[#2F6FE6]" },
                    { Icon: FileText,     bg: "bg-[#FCE9DA]", fg: "text-[#F08A2A]" },
                    { Icon: FileEdit,     bg: "bg-[#EDE7FE]", fg: "text-[#7C5CFF]" },
                  ];
                  const { Icon: RowIcon, bg: rowBg, fg: rowFg } = rowIconSet[idx % rowIconSet.length];
                  const isFinalized = form.status === "active";

                  // Shared accent color for this form's parent project — same
                  // palette used by the Project dropdown above, so the trigger
                  // border/text + form name + row left-border are all in sync.
                  const accent = getProjectAccent(form.project_id, projects, idx);

                  return (
                    <div
                      key={form.id}
                      className="group flex items-center gap-3 border-l-4 p-3 sm:p-4 hover:bg-[#F4F6F8]/70 transition-colors"
                      style={{ borderLeftColor: accent }}
                    >
                      <button
                        onClick={() => {
                          if (form.status === "active") {
                            setFillingForm(form);
                          } else {
                            toast({
                              title: "Form Not Active",
                              description: "This form is not currently accepting submissions.",
                              variant: "destructive",
                            });
                          }
                        }}
                        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${rowBg}`}
                        aria-label={`Open ${form.name}`}
                      >
                        <RowIcon className={`h-5 w-5 ${rowFg}`} strokeWidth={2} />
                      </button>

                      <button
                        onClick={() => {
                          if (form.status === "active") {
                            setFillingForm(form);
                          } else {
                            setQuickActionMode("view");
                            setShowHistory(true);
                          }
                        }}
                        className="min-w-0 flex-1 text-left"
                      >
                        <h4 className="truncate text-[15px] font-bold" style={{ color: accent }}>
                          {form.name}
                        </h4>
                        <p className="mt-0.5 truncate text-xs sm:text-sm text-muted-foreground">
                          {form.description || "No description"}
                        </p>
                      </button>


                      <span
                        className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${
                          isFinalized
                            ? "bg-[#E2F5EC] text-[#22A55A]"
                            : "bg-[#E3ECFB] text-[#2F6FE6]"
                        }`}
                      >
                        {isFinalized ? "Finalized" : "Draft"}
                      </span>



                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-[#2F6FE6]">
                            <ChevronRight className="h-5 w-5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => {
                              if (form.status === "active") setFillingForm(form);
                              else toast({ title: "Form Not Active", variant: "destructive" });
                            }}
                          >
                            <ClipboardList className="mr-2 h-4 w-4" />
                            Fill Form
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => { setQuickActionMode("view"); setShowHistory(true); }}
                          >
                            <Eye className="mr-2 h-4 w-4" />
                            View Submissions
                          </DropdownMenuItem>
                          {isAdmin && (
                            <DropdownMenuItem onClick={() => handleEditForm(form)}>
                              <Edit className="mr-2 h-4 w-4" />
                              Edit Form
                            </DropdownMenuItem>
                          )}
                          {isAdmin && form.status !== "active" && (
                            <DropdownMenuItem onClick={() => handleUpdateFormStatus(form.id, "active")}>
                              <CheckCircle className="mr-2 h-4 w-4 text-green-600" />
                              Set Active
                            </DropdownMenuItem>
                          )}
                          {isAdmin && form.status !== "draft" && (
                            <DropdownMenuItem onClick={() => handleUpdateFormStatus(form.id, "draft")}>
                              <FileEdit className="mr-2 h-4 w-4 text-yellow-600" />
                              Set Draft
                            </DropdownMenuItem>
                          )}
                          {isAdmin && form.status !== "inactive" && (
                            <DropdownMenuItem onClick={() => handleUpdateFormStatus(form.id, "inactive")}>
                              <XCircle className="mr-2 h-4 w-4 text-muted-foreground" />
                              Set Inactive
                            </DropdownMenuItem>
                          )}
                          {isAdmin && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => setGeofenceManagerForm(form)}>
                                <MapPin className="mr-2 h-4 w-4" />
                                User Geofences
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => setDashboardForm(form)}>
                                <LayoutDashboard className="mr-2 h-4 w-4" />
                                Custom Dashboards
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => setQrCodeForm(form)}>
                                <QrCode className="mr-2 h-4 w-4" />
                                Generate QR Code
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => setDailyTargetForm(form)}>
                                <Target className="mr-2 h-4 w-4" />
                                Set Daily Targets
                              </DropdownMenuItem>
                            </>
                          )}
                          <DropdownMenuSeparator />
                          {isFormAvailableOffline(form.id) ? (
                            <DropdownMenuItem onClick={() => removeForm(form.id)}>
                              <CloudOff className="mr-2 h-4 w-4 text-muted-foreground" />
                              Remove Offline Copy
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem
                              onClick={() => downloadForm({
                                id: form.id,
                                name: form.name,
                                description: form.description,
                                status: form.status,
                                project_id: form.project_id,
                                questions: form.questions,
                                geofence: form.geofence,
                                settings: form.settings,
                                updated_at: form.updated_at,
                              })}
                              disabled={!isOnline}
                            >
                              <Download className="mr-2 h-4 w-4" />
                              Download for Offline
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem onClick={() => syncPendingSubmissions(form.id)}>
                            <Send className="mr-2 h-4 w-4" />
                            Sync to Server
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => deleteSavedSubmissions(form.id)}>
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete Saved
                          </DropdownMenuItem>
                          {isAdmin && (
                            <DropdownMenuItem
                              onClick={() => setFormToDelete(form)}
                              className="text-destructive"
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete Form
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  );
                })}
                </>
              )}


              <div className="flex items-center gap-2 bg-gradient-to-r from-[#EDE7FE]/60 to-transparent px-3 sm:px-4 py-2 border-t border-border/60">
                <Sparkles className="h-4 w-4 text-[#7C5CFF]" />
                <span className="text-xs font-bold uppercase tracking-wider text-[#5B3FD0]">
                  Standard forms
                </span>
                <span className="text-xs text-muted-foreground">· system defaults</span>
              </div>

              {/* Default standard assessment forms — shown for every user, every project */}
              {([
                { code: "wg_ss" as const,  icon: Accessibility, bg: "bg-[#EDE7FE]", fg: "text-[#7C5CFF]", chipBg: "bg-[#EDE7FE]", chipFg: "text-[#5B3FD0]" },
                { code: "gad_7" as const,  icon: BrainIcon,     bg: "bg-[#FCE9DA]", fg: "text-[#F08A2A]", chipBg: "bg-[#FCE9DA]", chipFg: "text-[#B8651A]" },
                { code: "phq_9" as const,  icon: HeartPulse,    bg: "bg-[#E3ECFB]", fg: "text-[#1F6FEB]", chipBg: "bg-[#E3ECFB]", chipFg: "text-[#1656BA]" },
                { code: "hfat" as const,   icon: Stethoscope,   bg: "bg-[#DCF3F0]", fg: "text-[#1FB5A8]", chipBg: "bg-[#DCF3F0]", chipFg: "text-[#0F7E76]" },
              ]).map(({ code, icon: Icon, bg, fg, chipBg, chipFg }) => {
                const def = STANDARD_ASSESSMENTS[code];
                const isDisabled = disabledStandardCodes.has(code);
                return (
                  <div key={code} className={`flex w-full items-center gap-3 p-3 sm:p-4 ${isDisabled ? "opacity-60" : "hover:bg-[#F4F6F8]/70"} transition-colors`}>
                    <button
                      onClick={() => !isDisabled && setActiveStandardAssessment(code)}
                      disabled={isDisabled}
                      className="flex flex-1 items-center gap-3 text-left disabled:cursor-not-allowed"
                    >
                      <div className={`flex h-11 w-11 sm:h-12 sm:w-12 shrink-0 items-center justify-center rounded-lg ${bg}`}>
                        <Icon className={`h-5 w-5 sm:h-6 sm:w-6 ${fg}`} strokeWidth={2} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h4 className="truncate text-sm sm:text-base font-semibold text-foreground">
                          {def.shortName}
                        </h4>
                        <p className="mt-0.5 line-clamp-2 text-xs sm:text-sm text-muted-foreground">
                          {isDisabled ? "Disabled (factory reset)." : def.description}
                        </p>
                      </div>
                    </button>
                    {isDisabled ? (
                      isAdmin && (
                        <Button size="sm" variant="outline" onClick={() => toggleStandardForm(code, false)} className="shrink-0">
                          Enable
                        </Button>
                      )
                    ) : (
                      <>
                        <span className={`shrink-0 rounded-full ${chipBg} px-3 py-1 text-xs font-medium ${chipFg}`}>
                          Standard
                        </span>
                        {isOwner && (
                          <Button size="icon" variant="ghost" onClick={() => toggleStandardForm(code, true)} title="Disable">
                            <Wrench className="h-4 w-4 text-muted-foreground" />
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                );
              })}

              {/* Digital Attendance — standard form */}
              <button
                onClick={() => setShowDigitalAttendance(true)}
                className="flex w-full items-center gap-3 p-3 sm:p-4 text-left hover:bg-[#F4F6F8]/70 transition-colors"
              >
                <div className="flex h-11 w-11 sm:h-12 sm:w-12 shrink-0 items-center justify-center rounded-lg bg-[#E3ECFB]">
                  <ClipboardCheck className="h-5 w-5 sm:h-6 sm:w-6 text-[#1F6FEB]" strokeWidth={2} />
                </div>
                <div className="min-w-0 flex-1">
                  <h4 className="truncate text-sm sm:text-base font-semibold text-foreground">
                    Digital Attendance
                  </h4>
                  <p className="mt-0.5 line-clamp-2 text-xs sm:text-sm text-muted-foreground">
                    Mark staff attendance and capture participants of meetings, trainings and programme activities.
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-[#E3ECFB] px-3 py-1 text-xs font-medium text-[#1656BA]">
                  Standard
                </span>
              </button>


              {/* Microplanning entry — kept inside the list */}
              {hasMicroplanAccess && (
                <button
                  onClick={() => setMicroplanFillingActive(true)}
                  className="flex w-full items-center gap-3 p-3 sm:p-4 text-left hover:bg-[#F4F6F8]/70 transition-colors"
                >
                  <div className="flex h-11 w-11 sm:h-12 sm:w-12 shrink-0 items-center justify-center rounded-lg bg-[#E2F5EC]">
                    <MapPin className="h-5 w-5 sm:h-6 sm:w-6 text-[#22A55A]" strokeWidth={2} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h4 className="truncate text-sm sm:text-base font-semibold text-foreground">
                      Geo-enabled Microplanning Entry
                    </h4>
                    <p className="mt-0.5 truncate text-xs sm:text-sm text-muted-foreground">
                      Community-level campaign microplanning with georeferenced data collection.
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-[#E2F5EC] px-3 py-1 text-xs font-medium text-[#1F7A3A]">
                    Open
                  </span>
                </button>
              )}
            </div>
          )}
        </section>
      </div>

      {/* Floating "+ New Form" CTA */}
      {isAdmin && (
        <div className="pointer-events-none fixed inset-x-0 bottom-20 z-30 flex justify-center px-4 sm:bottom-6">
          <Button
            onClick={() => {
              if (!currentProjectId && projects.length > 0) {
                toast({
                  title: "Select a Project",
                  description: "Please select a project first to create a form.",
                  variant: "destructive",
                });
                return;
              }
              setShowFormBuilder(true);
            }}
            className="pointer-events-auto h-14 w-full max-w-md rounded-full bg-[#2F6FE6] text-base font-semibold text-white shadow-[0_10px_24px_rgba(47,111,230,0.35)] hover:bg-[#1A5FD0]"
          >
            <Plus className="h-6 w-6" strokeWidth={2.5} />
            New Form
          </Button>
        </div>
      )}


      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!formToDelete} onOpenChange={(open) => !open && setFormToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Form</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{formToDelete?.name}"? This action cannot be undone and will also delete all submissions associated with this form.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (formToDelete) {
                  handleDeleteForm(formToDelete.id);
                  setFormToDelete(null);
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Template Picker Dialog */}
      {showTemplatePicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowTemplatePicker(false)}>
          <div className="bg-background rounded-xl shadow-xl border w-full max-w-md max-h-[80vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="bg-gradient-to-br from-primary via-primary/90 to-primary/70 px-6 py-5 text-primary-foreground">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20 backdrop-blur-sm">
                  <LayoutTemplate className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold">Create from Template</h2>
                  <p className="text-sm text-primary-foreground/80">Choose a template to get started</p>
                </div>
              </div>
            </div>
            <div className="p-4 border-b">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search templates..."
                  className="pl-9"
                  autoFocus
                  onChange={(e) => {
                    const q = e.target.value.toLowerCase();
                    // filter is handled inline below
                    e.target.dataset.search = q;
                    // force re-render via state
                    setTemplates((prev) => [...prev]);
                  }}
                />
              </div>
            </div>
            <div className="overflow-auto max-h-[50vh] p-3 space-y-1.5">
              {loadingTemplates ? (
                <div className="flex justify-center py-10">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : templates.length === 0 ? (
                <div className="text-center py-10">
                  <LayoutTemplate className="h-10 w-10 mx-auto text-muted-foreground/40 mb-2" />
                  <p className="text-sm text-muted-foreground">No templates available</p>
                  <p className="text-xs text-muted-foreground/60 mt-1">Create templates in the Form Templates library</p>
                </div>
              ) : (
                templates.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => {
                      setTemplateForm({
                        templateId: t.id,
                        name: t.name.replace(/ \(Template\)$/, ""),
                        description: t.description || "",
                        questions: t.questions as Question[],
                        settings: t.settings,
                      });
                      setShowTemplatePicker(false);
                      setShowFormBuilder(true);
                      toast({
                        title: "Template Loaded",
                        description: `Form pre-populated with ${t.questions.length} questions from "${t.name}".`,
                      });
                    }}
                    className="w-full flex items-center gap-3 p-3 rounded-lg text-left hover:bg-primary/5 border border-transparent hover:border-primary/20 transition-all group"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary group-hover:bg-primary/20 transition-colors">
                      <FileText className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{t.name}</p>
                      {t.description && (
                        <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{t.description}</p>
                      )}
                      <span className="text-[10px] text-muted-foreground">
                        {t.questions.length} questions · {t.category}
                      </span>
                    </div>
                    <Plus className="h-4 w-4 text-muted-foreground/30 group-hover:text-primary transition-colors shrink-0" />
                  </button>
                ))
              )}
            </div>
            <div className="border-t px-4 py-3 flex justify-end">
              <Button variant="outline" size="sm" onClick={() => setShowTemplatePicker(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* QR Code Dialog */}
      {qrCodeForm && (
        <FormQRCode
          formId={qrCodeForm.id}
          formName={qrCodeForm.name}
          projectName={projects.find(p => p.id === qrCodeForm.project_id)?.name}
          open={!!qrCodeForm}
          onOpenChange={(open) => { if (!open) setQrCodeForm(null); }}
        />
      )}

      {/* QR Code Scanner */}
      <QRCodeScanner
        open={showQRScanner}
        onOpenChange={setShowQRScanner}
        onFormReady={(form) => {
          const allItems = (form.questions || []) as any[];
          const groupItems = allItems.filter((q: any) => Array.isArray(q.questions)) as FormGroup[];
          const ungroupedQuestions = allItems.filter((q: any) => !Array.isArray(q.questions)) as Question[];
          setFillingForm({
            ...form,
            questions: ungroupedQuestions,
            groups: groupItems,
            geofence: (form.geofence || null) as GeofenceArea | null,
            settings: (form.settings || {}) as FormSettings,
          });
        }}
      />

      {/* Daily Target Dialog */}
      {dailyTargetForm && (
        <FormDailyTargetDialog
          open={!!dailyTargetForm}
          onOpenChange={(open) => { if (!open) setDailyTargetForm(null); }}
          formId={dailyTargetForm.id}
          formName={dailyTargetForm.name}
        />
      )}

      {/* Quick Action Form Picker */}
      {selectingFormFor && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setSelectingFormFor(null)}
        >
          <div
            className="bg-background rounded-xl shadow-xl border w-full max-w-md max-h-[80vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b">
              <h2 className="text-lg font-bold">
                {formActions.find((a) => a.id === selectingFormFor)?.label || "Select Form"}
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Choose a form to continue
              </p>
            </div>
            <div className="overflow-auto p-2 space-y-1">
              {filteredForms.map((form) => (
                <button
                  key={form.id}
                  onClick={() => handleFormActionSelect(form, selectingFormFor)}
                  className="w-full flex items-center gap-3 p-3 rounded-lg text-left hover:bg-accent/50 transition-colors border border-transparent hover:border-border"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <FileText className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{form.name}</p>
                    {form.description && (
                      <p className="text-xs text-muted-foreground truncate">{form.description}</p>
                    )}
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                </button>
              ))}
            </div>
            <div className="border-t px-4 py-3 flex justify-end">
              <Button variant="outline" size="sm" onClick={() => setSelectingFormFor(null)}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FormsView;

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import UserGeofenceManager from "@/components/FormBuilder/UserGeofenceManager";
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
import { useOfflineForms } from "@/hooks/useOfflineForms";
import FormQRCode from "@/components/FormQRCode";
import QRCodeScanner from "@/components/QRCodeScanner";
import { Question, GeofenceArea } from "@/components/FormBuilder/types";

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

const formActions = [
  { id: "fill", label: "Fill Blank Form", icon: FileText, color: "text-primary", bgGradient: "from-primary/20 to-primary/5", description: "Start a new submission" },
  { id: "edit", label: "Edit Saved Form", icon: Edit, color: "text-acg-gold", bgGradient: "from-acg-gold/20 to-acg-gold/5", description: "Resume drafts" },
  { id: "send", label: "Send Finalized", icon: Send, color: "text-green-600", bgGradient: "from-green-500/20 to-green-500/5", description: "Sync to server" },
  { id: "view", label: "View Sent Form", icon: Eye, color: "text-blue-500", bgGradient: "from-blue-500/20 to-blue-500/5", description: "Review submissions" },
  { id: "delete", label: "Delete Saved", icon: Trash2, color: "text-destructive", bgGradient: "from-destructive/20 to-destructive/5", description: "Remove drafts" },
];

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
  const { user, isAdmin, isSuperAdmin, role } = useAuth();
  const { isOnline, downloadForm, removeForm, isFormAvailableOffline, offlineForms } = useOfflineForms();

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
          return {
            ...form,
            questions: (form.questions as unknown as Question[]) || [],
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
  const mergedForms = !isOnline ? [...forms, ...offlineForms.filter(of => !forms.some(f => f.id === of.id)).map(of => ({
    ...of,
    submissions_count: 0,
    created_at: of.downloaded_at,
  } as Form))] : forms;

  const filteredForms = mergedForms.filter((form) =>
    form.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const currentProject = projects.find(p => p.id === currentProjectId);

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
          questions: editingForm.questions,
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
    <div className="space-y-6 p-4 lg:p-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            {currentProjectId && (
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={() => setCurrentProjectId(null)}
                className="h-8 w-8"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
            )}
            <h1 className="font-display text-2xl font-bold text-foreground lg:text-3xl">
              Forms
            </h1>
          </div>
          <p className="text-muted-foreground flex items-center gap-2">
            {!isOnline && (
              <span className="flex items-center gap-1 text-destructive">
                <WifiOff className="h-4 w-4" />
                Offline Mode -
              </span>
            )}
            {currentProject 
              ? `Forms in ${currentProject.name}` 
              : isOnline ? "Manage and collect data with your forms" : "Showing downloaded forms"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowQRScanner(true)}
            className="sm:size-default"
          >
            <QrCode className="h-4 w-4 sm:h-5 sm:w-5" />
            <span className="hidden sm:inline">Scan QR</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowHistory(true)}
            className="sm:size-default"
          >
            <History className="h-4 w-4 sm:h-5 sm:w-5" />
            <span className="hidden sm:inline">History</span>
          </Button>
          {isAdmin && !currentProjectId && (
            <Select 
              value={currentProjectId || "all"} 
              onValueChange={(val) => setCurrentProjectId(val === "all" ? null : val)}
            >
              <SelectTrigger className="w-[140px] sm:w-[200px]">
                <FolderOpen className="mr-2 h-4 w-4" />
                <SelectValue placeholder="Filter by project" />
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
          )}
          {isAdmin && (
            <Button
              variant="outline"
              size="sm"
              className="sm:size-default"
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
              <LayoutTemplate className="h-4 w-4 sm:h-5 sm:w-5" />
              <span className="hidden sm:inline">From Template</span>
              <span className="sm:hidden">Template</span>
            </Button>
          )}
          {isAdmin && (
            <Button 
              variant="acg" 
              size="sm"
              className="sm:size-default"
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
            >
              <Plus className="h-4 w-4 sm:h-5 sm:w-5" />
              <span className="hidden sm:inline">Create Form</span>
              <span className="sm:hidden">New</span>
            </Button>
          )}
        </div>
      </div>

      {/* Quick Actions - Glassmorphism Cards */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
      >
        <div className="space-y-3">
          <div className="flex items-center gap-2 px-1">
            <div className="rounded-lg bg-primary/10 p-1.5">
              <ClipboardList className="h-4 w-4 text-primary" />
            </div>
            <h2 className="text-base font-semibold tracking-tight text-foreground">Quick Actions</h2>
            <span className="ml-auto text-xs text-muted-foreground">{filteredForms.length} forms available</span>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {formActions.map((action, index) => (
              <motion.button
                key={action.id}
                initial={{ opacity: 0, y: 20, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{
                  duration: 0.4,
                  delay: 0.08 + index * 0.06,
                  ease: [0.25, 0.46, 0.45, 0.94],
                }}
                whileHover={{ y: -4, scale: 1.02 }}
                whileTap={{ scale: 0.96 }}
                onClick={() => handleQuickAction(action.id)}
                className="group relative flex flex-col items-center gap-3 rounded-2xl border border-border/30 p-5 transition-all duration-300 hover:shadow-card overflow-hidden"
                style={{
                  background: 'rgba(var(--card-rgb, 255, 255, 255), 0.6)',
                  backdropFilter: 'blur(16px)',
                  WebkitBackdropFilter: 'blur(16px)',
                }}
              >
                {/* Gradient background overlay */}
                <div className={`absolute inset-0 bg-gradient-to-br ${action.bgGradient} opacity-40 group-hover:opacity-70 transition-opacity duration-300`} />
                
                {/* Shimmer effect on hover */}
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-gradient-to-r from-transparent via-white/10 to-transparent -skew-x-12 translate-x-[-200%] group-hover:translate-x-[200%] transition-transform duration-700" />
                
                <div className="relative z-10 flex flex-col items-center gap-2.5">
                  <div className={`rounded-2xl bg-gradient-to-br ${action.bgGradient} p-3.5 shadow-sm transition-all duration-300 group-hover:shadow-lg group-hover:scale-110`}>
                    <action.icon className={`h-5 w-5 sm:h-6 sm:w-6 ${action.color} transition-transform duration-300`} />
                  </div>
                  <div className="text-center">
                    <span className="block text-xs sm:text-sm font-semibold text-foreground/90 group-hover:text-foreground transition-colors">
                      {action.label}
                    </span>
                    <span className="block text-[10px] sm:text-xs text-muted-foreground mt-0.5">
                      {action.description}
                    </span>
                  </div>
                </div>
                
                {/* Glass border highlight */}
                <div className="absolute inset-0 rounded-2xl ring-1 ring-inset ring-white/10 group-hover:ring-white/20 transition-all duration-300" />
              </motion.button>
            ))}
          </div>
        </div>
      </motion.div>

      {/* Form Selection Dialog for Quick Actions */}
      {selectingFormFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <Card className="mx-4 w-full max-w-md">
            <CardHeader>
              <CardTitle className="font-display">
                Select a Form
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Choose a form for: {formActions.find(a => a.id === selectingFormFor)?.label}
              </p>
            </CardHeader>
            <CardContent className="max-h-[400px] space-y-2 overflow-y-auto">
              {filteredForms.map((form) => (
                <button
                  key={form.id}
                  onClick={() => handleFormActionSelect(form, selectingFormFor)}
                  className="flex w-full items-center gap-3 rounded-lg border border-border p-3 text-left transition-all hover:border-acg-gold/30 hover:bg-muted"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                    <FileText className="h-5 w-5 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-foreground">{form.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {form.description || "No description"}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                      form.status === "active"
                        ? "bg-green-100 text-green-700"
                        : form.status === "draft"
                        ? "bg-yellow-100 text-yellow-700"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {form.status}
                  </span>
                </button>
              ))}
              <Button
                variant="outline"
                className="mt-4 w-full"
                onClick={() => setSelectingFormFor(null)}
              >
                Cancel
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Search and Filter */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search forms..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <Button variant="outline">
          <Filter className="h-4 w-4" />
          Filter
        </Button>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="flex h-48 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      )}

      {/* Forms List */}
      {!loading && (
        <Card className="border-0 shadow-card">
          <CardHeader>
            <CardTitle className="font-display">Available Forms</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {filteredForms.length === 0 ? (
              <div className="flex h-48 flex-col items-center justify-center text-center">
                <FileText className="h-12 w-12 text-muted-foreground/50" />
                <h3 className="mt-4 font-display text-lg font-semibold text-foreground">
                  No forms found
                </h3>
                <p className="mt-1 text-muted-foreground">
                  {isAdmin 
                    ? currentProjectId 
                      ? "Create your first form for this project"
                      : "Select a project to create forms"
                    : "No forms have been assigned to you yet"}
                </p>
              </div>
            ) : (
              filteredForms.map((form) => (
                <div
                  key={form.id}
                  className="group flex flex-col gap-4 rounded-xl border border-border bg-card p-4 transition-all duration-200 hover:border-acg-gold/30 hover:shadow-soft sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex items-start gap-4">
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                      <FileText className="h-7 w-7 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h4 className="truncate font-medium text-foreground">
                          {form.name}
                        </h4>
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                            form.status === "active"
                              ? "bg-green-100 text-green-700"
                              : form.status === "draft"
                              ? "bg-yellow-100 text-yellow-700"
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {form.status}
                        </span>
                        {isFormAvailableOffline(form.id) && (
                          <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary flex items-center gap-1">
                            <Download className="h-3 w-3" />
                            Offline
                          </span>
                        )}
                      </div>
                      <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                        {form.description || "No description"}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                        <span>{form.submissions_count} submissions</span>
                        <span>Updated {new Date(form.updated_at).toLocaleDateString()}</span>
                        {!isOnline && (
                          <span className="flex items-center gap-1 text-destructive">
                            <WifiOff className="h-3 w-3" />
                            Offline Mode
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="acg"
                      size="sm"
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
                      disabled={form.status !== "active"}
                    >
                      <ClipboardList className="h-4 w-4" />
                      Fill
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setQuickActionMode("view");
                        setShowHistory(true);
                      }}
                    >
                      <Eye className="h-4 w-4" />
                      View
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
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
                </div>
              ))
            )}
          </CardContent>
        </Card>
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
          setFillingForm({
            ...form,
            questions: (form.questions || []) as Question[],
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
    </div>
  );
};

export default FormsView;

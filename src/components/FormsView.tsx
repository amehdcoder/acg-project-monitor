import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { motion } from "framer-motion";
import { useSearchParams } from "react-router-dom";
import acgLogo from "@/assets/acg-logo.png";
import UserGeofenceManager from "@/components/FormBuilder/UserGeofenceManager";
import FormAccessManager from "@/components/FormsView/FormAccessManager";
import { MicroplanningView } from "@/components/Microplanning";
import { StandardAssessmentView, MentalHealthAssessment } from "@/components/StandardAssessments";
import { DigitalAttendanceView } from "@/components/DigitalAttendance";
import UPRPForm from "@/components/UPRP/UPRPForm";
import UPRPSubmissionsView from "@/components/UPRP/UPRPSubmissionsView";
import { OfficeFormsView } from "@/components/OfficeForms";
import { ActionTrackerView } from "@/components/ActionTracker";
import { WorkplanView } from "@/components/Workplan";
import BloombergFormFiller from "@/components/Bloomberg/BloombergFormFiller";
import BloombergDashboard from "@/components/Bloomberg/BloombergDashboard";
import { BLOOMBERG_FORM_NAME, BLOOMBERG_FORM_DESC, BLOOMBERG_DASH_NAME, BLOOMBERG_DASH_DESC } from "@/lib/bloomberg/definition";
import SeeClearFormFiller from "@/components/SeeClear/SeeClearFormFiller";
import SeeClearDashboard from "@/components/SeeClear/SeeClearDashboard";
import { SEECLEAR_FORM_NAME, SEECLEAR_FORM_DESC, SEECLEAR_DASH_NAME, SEECLEAR_DASH_DESC } from "@/lib/seeclear/definition";
import { STANDARD_ASSESSMENTS, StandardFormCode } from "@/lib/standardAssessments/definitions";
import { ALL_STANDARD_FORMS } from "@/lib/standardAssessments/allStandardForms";
import ACSMFormFiller from "@/components/ACSM/ACSMFormFiller";
import ACSMDashboard from "@/components/ACSM/ACSMDashboard";
import { ACSM_FORM_NAME, ACSM_FORM_DESC, ACSM_DASH_NAME, ACSM_DASH_DESC } from "@/lib/acsm/definition";
import IRFCategoryLauncher from "@/components/IRF/IRFCategoryLauncher";
import IRFDashboard from "@/components/IRF/IRFDashboard";
import { IRF_FORM_NAME, IRF_FORM_DESC, IRF_DASH_NAME, IRF_DASH_DESC } from "@/lib/irf/definition";
import SBCFormFiller from "@/components/SBC/SBCFormFiller";
import SBCDashboard from "@/components/SBC/SBCDashboard";
import { SBC_FORM_NAME, SBC_FORM_DESC, SBC_DASH_NAME, SBC_DASH_DESC } from "@/lib/sbc/definition";
import { buildMdaSupervisoryChecklist, MDA_CHECKLIST_NAME } from "@/lib/mdaSupervisoryChecklist";
import {
  buildCommunitySummaryForm, COMMUNITY_SUMMARY_FORM_NAME,
  buildCommunityTreatmentRegister, COMMUNITY_TREATMENT_REGISTER_NAME,
} from "@/lib/treatmentDataForms";
import { generateTreatmentRollupWorkbook } from "@/lib/treatmentRollup";
import { ACTIVE_FORM_FILL_KEY, SILENT_UPDATE_RESTORE_KEY } from "@/lib/formProgressPersistence";
import { HeartPulse, Brain as BrainIcon, Accessibility, Stethoscope, Sparkles, Wrench, ClipboardCheck, ShieldCheck, BarChart3, ClipboardPenLine, ChartNoAxesCombined } from "lucide-react";
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
  Lock,
  AlertTriangle,
  LayoutGrid,
  Rows3,

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
import { ProjectChatFab } from "@/components/ProjectChat/ProjectChatFab";
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
import SpecialFormStudio from "@/components/SpecialFormStudio/SpecialFormStudio";
import SpecialFormDashboard from "@/components/SpecialFormStudio/SpecialFormDashboard";
import SarmaanLearningDashboard from "@/components/Sarmaan/SarmaanLearningDashboard";
import SarmaanChecklistLauncher from "@/components/Sarmaan/SarmaanChecklistLauncher";
import SarmaanChecklistAccessManager from "@/components/Sarmaan/SarmaanChecklistAccessManager";
import DashboardAccessManager from "@/components/dashboard/DashboardAccessManager";
import { useSarmaanFormAccess } from "@/hooks/useSarmaanFormAccess";
import { isSupervisoryLearningForm } from "@/components/Sarmaan/sarmaanBrand";
import SarmaanAcsmChecklist from "@/components/Sarmaan/SarmaanAcsmChecklist";
import SarmaanAcsmDashboard from "@/components/Sarmaan/SarmaanAcsmDashboard";
import { SARMAAN_ACSM_FORM_NAME, SARMAAN_ACSM_DESC, buildAcsmFormSchema, ACSM_SECTIONS } from "@/lib/sarmaan/acsmChecklist";
import { getPreset } from "@/lib/specialStudio/presets";
import { downloadXlsForm } from "@/lib/specialStudio/xlsformExport";
import { FormFiller } from "@/components/FormFiller";
import MdaChecklistLanding from "@/components/MdaChecklist/MdaChecklistLanding";
import MdaDashboardView from "@/components/MdaChecklist/MdaDashboardView";
import { useDashboardAccess } from "@/hooks/useDashboardAccess";
import SavedFormsManager, { type SavedFormsMode } from "@/components/FormFiller/SavedFormsManager";
import { FormGroup } from "@/components/FormBuilder/types";
import SubmissionHistory from "@/components/SubmissionHistory";
import { DashboardBuilder } from "@/components/DashboardBuilder";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useAdminSurveillance } from "@/hooks/useAdminSurveillance";
import { useOfflineForms } from "@/hooks/useOfflineForms";
import { warmCacheUserForms, warmCacheUserFormsDetailed } from "@/lib/offlineFormCache";
import { startTimer } from "@/lib/metrics";
import FormQRCode from "@/components/FormQRCode";
import QRCodeScanner from "@/components/QRCodeScanner";
import { Question, GeofenceArea } from "@/components/FormBuilder/types";
import { CommCarePageHeader } from "@/components/ui/commcare-page-header";
import BulkDataDialog from "@/components/FormBulk/BulkDataDialog";
import BulkUploadAccessManager from "@/components/OwnerTools/BulkUploadAccessManager";
import { useBulkDataAccess } from "@/hooks/useBulkDataAccess";
import { scrollToAppTop } from "@/lib/scrollToAppTop";
import { isMdaChecklistLike } from "@/lib/mdaFollowUp";
import { getOrCreateSingletonForm } from "@/lib/mda/singletonForm";
import { FileSpreadsheet, KeyRound, GanttChartSquare, NotebookPen, Copy, EyeOff } from "lucide-react";
import CopyMdaChecklistDialog from "@/components/MdaChecklist/CopyMdaChecklistDialog";
import ErrorBoundary from "@/components/ErrorBoundary";

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
  isMdaChecklist?: boolean;
  coverageEvaluation?: boolean;
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
  { id: "edit",     label: "Draft",            icon: FileEdit, description: "Continue drafts",    tile: "bg-[#22A55A]" },
  { id: "send",     label: "Ready to send",    icon: Send,     description: "Sync to server",     tile: "bg-[#23B5AE]" },
  { id: "view",     label: "Sent",             icon: Eye,      description: "Review submissions", tile: "bg-[#7C5CFF]" },
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

const SARMAAN_SUPERVISORY_FORM_NAME = "SARMAAN Supervisory Checklist";
const SARMAAN_SUPERVISORY_DASH_NAME = "SARMAAN Supervision Dashboard";
const SARMAAN_SUPERVISORY_DESC = "12-module supportive supervision checklist with GPS, evidence capture, scoring and learning actions.";
const SARMAAN_DASH_DESC = "Executive supervision dashboard with live KPIs, learning funnels, quality bands and corrective-action insights.";
const isSarmaanAcsmStoredForm = (form: { name?: string | null; settings?: any } | null | undefined) =>
  !!form && (form.name === SARMAAN_ACSM_FORM_NAME || form.settings?.sarmaan_acsm === true);

const withTimeout = <T,>(p: PromiseLike<T>, ms = 10000, label = "forms_request_timeout"): Promise<T> =>
  Promise.race([
    Promise.resolve(p),
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(label)), ms)),
  ]);

const toRenderableForm = (form: any): Form => {
  const allItems = (form.questions as unknown as any[]) || [];
  const groupItems = allItems.filter((q: any) => Array.isArray(q.questions)) as FormGroup[];
  const ungroupedQuestions = allItems.filter((q: any) => !Array.isArray(q.questions)) as Question[];
  return {
    ...form,
    questions: ungroupedQuestions,
    groups: groupItems,
    geofence: (form.geofence as unknown as GeofenceArea) || null,
    settings: (form.settings as unknown as FormSettings) || {},
    submissions_count: form.submissions_count || 0,
    created_at: form.created_at || form.downloaded_at || new Date().toISOString(),
    updated_at: form.updated_at || form.downloaded_at || new Date().toISOString(),
  } as Form;
};

interface FormsViewProps {
  selectedProjectId?: string | null;
}

const FormsView = ({ selectedProjectId }: FormsViewProps) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [forms, setForms] = useState<Form[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(selectedProjectId || null);
  const [rollupExporting, setRollupExporting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showFormBuilder, setShowFormBuilder] = useState(false);
  const [showStudio, setShowStudio] = useState(false);
  const [editingForm, setEditingForm] = useState<Form | null>(null);
  const [fillingForm, setFillingForm] = useState<Form | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [quickActionMode, setQuickActionMode] = useState<string | null>(null);
  const [savedFormsMode, setSavedFormsMode] = useState<SavedFormsMode | null>(null);
  const [selectingFormFor, setSelectingFormFor] = useState<string | null>(null);
  const [formToDelete, setFormToDelete] = useState<Form | null>(null);
  const [dashboardForm, setDashboardForm] = useState<Form | null>(null);
  const [mdaDashboardForm, setMdaDashboardForm] = useState<Form | null>(null);
  const [specialDashForm, setSpecialDashForm] = useState<Form | null>(null);
  const [sarmaanDashForm, setSarmaanDashForm] = useState<Form | null>(null);
  const [sarmaanLaunchForm, setSarmaanLaunchForm] = useState<Form | null>(null);
  const [sarmaanChecklistAccessOpen, setSarmaanChecklistAccessOpen] = useState(false);
  const [sarmaanDashAccessOpen, setSarmaanDashAccessOpen] = useState(false);
  const [acsmLaunchOpen, setAcsmLaunchOpen] = useState(false);
  const [acsmAccessOpen, setAcsmAccessOpen] = useState(false);
  const [acsmDashOpen, setAcsmDashOpen] = useState(false);
  const [acsmDashAccessOpen, setAcsmDashAccessOpen] = useState(false);
  const [templateForm, setTemplateForm] = useState<{ templateId: string; name: string; description: string; questions: Question[]; settings: any; geofence?: GeofenceArea } | null>(null);
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [templates, setTemplates] = useState<{ id: string; name: string; description: string | null; questions: any[]; settings: any; category: string }[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [showCopyMda, setShowCopyMda] = useState(false);
  const [geofenceManagerForm, setGeofenceManagerForm] = useState<Form | null>(null);
  const [accessManagerForm, setAccessManagerForm] = useState<Form | null>(null);
  // On-screen confirmation of exactly which forms were cached for offline use,
  // strictly scoped to the signed-in user's access grants.
  const [downloadConfirm, setDownloadConfirm] = useState<{
    forms: { id: string; name: string }[];
    scopedToGrants: boolean;
  } | null>(null);
  const [qrCodeForm, setQrCodeForm] = useState<Form | null>(null);
  const [dailyTargetForm, setDailyTargetForm] = useState<Form | null>(null);
  const [showQRScanner, setShowQRScanner] = useState(false);
  const [hasMicroplanAccess, setHasMicroplanAccess] = useState(false);
  const [microplanFillingActive, setMicroplanFillingActive] = useState(false);
  const [activeStandardAssessment, setActiveStandardAssessment] = useState<StandardFormCode | null>(null);
  const [showDigitalAttendance, setShowDigitalAttendance] = useState(false);
  const [showMentalHealth, setShowMentalHealth] = useState(false);
  const [showUprp, setShowUprp] = useState(false);
  const [showUprpRecords, setShowUprpRecords] = useState(false);
  const [officeFormsOpen, setOfficeFormsOpen] = useState<null | { codes?: ("srf" | "incident" | "leave" | "stationery")[]; title?: string }>(null);
  const [showActionTracker, setShowActionTracker] = useState(false);
  const [showWorkplan, setShowWorkplan] = useState(false);
  const [showBloombergForm, setShowBloombergForm] = useState(false);
  const [showBloombergDash, setShowBloombergDash] = useState(false);
  const [showSeeClearForm, setShowSeeClearForm] = useState(false);
  const [showSeeClearDash, setShowSeeClearDash] = useState(false);
  const [showAcsmForm, setShowAcsmForm] = useState(false);
  const [showAcsmDash, setShowAcsmDash] = useState(false);
  const [showSbcForm, setShowSbcForm] = useState(false);
  const [showSbcDash, setShowSbcDash] = useState(false);
  const [showIrfForm, setShowIrfForm] = useState(false);
  const [showIrfDash, setShowIrfDash] = useState(false);
  const [openFolder, setOpenFolder] = useState<string | null>(null);
  const [showFormsExplorer, setShowFormsExplorer] = useState(false);
  const [openTopFolder, setOpenTopFolder] = useState<"custom" | "standard" | null>("custom");
  // "Your Forms" controls: search, category filter and grid/folder view toggle.
  const [yourFormsSearch, setYourFormsSearch] = useState("");
  const [yourFormsGroup, setYourFormsGroup] = useState<string>("all");
  const [yourFormsView, setYourFormsView] = useState<"grid" | "folders">("grid");
  const [openYourGroup, setOpenYourGroup] = useState<string | null>(null);
  const [disabledStandardCodes, setDisabledStandardCodes] = useState<Set<StandardFormCode>>(new Set());
  const [bulkForm, setBulkForm] = useState<Form | null>(null);
  const [showBulkAccess, setShowBulkAccess] = useState(false);
  const { user, profile, isAdmin, isSuperAdmin, isOwner, isOwnerLevel, role, isAdhoc, loading: authLoading } = useAuth();
  const { hasDashboardAccess } = useDashboardAccess();
  const [assignedStandardCodes, setAssignedStandardCodes] = useState<Set<string>>(new Set());
  // Owner/Co-owner can hide the Standard forms folder from specific non-admins.
  const [standardRestricted, setStandardRestricted] = useState(false);
  useEffect(() => {
    if (!user?.id || isAdmin) { setStandardRestricted(false); return; }
    let cancelled = false;
    (async () => {
      const { data } = await (supabase as any)
        .from("standard_form_user_restrictions")
        .select("user_id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!cancelled) setStandardRestricted(!!data);
    })();
    return () => { cancelled = true; };
  }, [user?.id, isAdmin]);

  // Load the standard form(s) explicitly assigned to this user. This applies to
  // ANY user (adhoc or regular non-admin) so that anyone granted access to only
  // standard forms can see and open them from "Open your form".
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      const { data } = await (supabase as any)
        .from("user_standard_form_assignments")
        .select("form_code")
        .eq("user_id", user.id);
      if (!cancelled) setAssignedStandardCodes(new Set((data || []).map((r: any) => r.form_code)));
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  // Owner-controlled per-project hiding of the MDA checklist copy feature card.
  // Hidden by default; only the Owner can reveal it via the kebab menu.
  const [copyFeatureHidden, setCopyFeatureHidden] = useState(true);
  const [copyHideBusy, setCopyHideBusy] = useState(false);
  useEffect(() => {
    if (!currentProjectId) { setCopyFeatureHidden(true); return; }
    let cancelled = false;
    (async () => {
      const { data } = await (supabase as any)
        .from("mda_checklist_copy_hidden")
        .select("hidden")
        .eq("project_id", currentProjectId)
        .maybeSingle();
      if (!cancelled) setCopyFeatureHidden(data ? !!(data as any).hidden : true);
    })();
    return () => { cancelled = true; };
  }, [currentProjectId]);

  const toggleCopyFeatureHidden = useCallback(async (hide: boolean) => {
    if (!currentProjectId) return;
    setCopyHideBusy(true);
    try {
      const { error } = await (supabase as any)
        .from("mda_checklist_copy_hidden")
        .upsert({ project_id: currentProjectId, hidden: hide, updated_by: user?.id, updated_at: new Date().toISOString() }, { onConflict: "project_id" });
      if (error) throw error;
      setCopyFeatureHidden(hide);
      toast({ title: hide ? "Feature hidden" : "Feature visible", description: hide ? "The checklist copy card is now hidden for this project." : "The checklist copy card is now visible for admins in this project." });
    } catch (e: any) {
      toast({ title: "Could not update", description: e?.message || "Please try again.", variant: "destructive" });
    } finally {
      setCopyHideBusy(false);
    }
  }, [currentProjectId, user?.id]);



  // Launch the correct experience for an assigned standard-form code.
  const launchStandardForm = useCallback((code: string) => {
    // Hard guard: an adhoc user may only open forms explicitly assigned to them,
    // and never a form that has been restricted (disabled) at project level.
    if (isAdhoc && !assignedStandardCodes.has(code)) return;
    if (disabledStandardCodes.has(code as StandardFormCode)) {
      toast({ title: "Form restricted", description: "This form has been restricted by an administrator.", variant: "destructive" });
      return;
    }
    switch (code) {
      case "uprp": setShowUprp(true); break;
      case "attendance": setShowDigitalAttendance(true); break;
      case "action_tracker": setShowActionTracker(true); break;
      case "workplan": setShowWorkplan(true); break;
      case "mental_health": setShowMentalHealth(true); break;
      case "bloomberg_form": setShowBloombergForm(true); break;
      case "bloomberg_dash": setShowBloombergDash(true); break;
      case "seeclear_form": setShowSeeClearForm(true); break;
      case "seeclear_dash": setShowSeeClearDash(true); break;
      case "acsm_form": setShowAcsmForm(true); break;
      case "acsm_dash": setShowAcsmDash(true); break;
      case "sbc_form": setShowSbcForm(true); break;
      case "sbc_dash": setShowSbcDash(true); break;
      case "irf_form": setShowIrfForm(true); break;
      case "irf_dash": setShowIrfDash(true); break;
      case "microplan_entry": setMicroplanFillingActive(true); break;
      case "srf":
      case "incident":
      case "leave":
      case "stationery":
        setOfficeFormsOpen({ codes: [code as "srf" | "incident" | "leave" | "stationery"] });
        break;
      default:
        if ((STANDARD_ASSESSMENTS as any)[code]) {
          setActiveStandardAssessment(code as StandardFormCode);
        }
    }
  }, [isAdhoc, assignedStandardCodes, disabledStandardCodes]);

  // Flat, folder-free list of the standard forms assigned to this user, rendered
  // as a beautiful card grid instead of nested folders. Each card carries a
  // status ("assigned" | "restricted") and whether it has required fields.
  type YourFormCard = {
    code: string; name: string; desc: string; group: string; Icon: any;
    bg: string; fg: string; ring: string;
    status: "assigned" | "restricted"; hasRequired: boolean;
  };
  const assignedFormCards = useMemo<YourFormCard[]>(() => {
    if (assignedStandardCodes.size === 0) return [];
    const palette = [
      { bg: "bg-[#E3ECFB]", fg: "text-[#2F6FE6]", ring: "#2F6FE6" },
      { bg: "bg-[#E2F5EC]", fg: "text-[#22A55A]", ring: "#22A55A" },
      { bg: "bg-[#FCE9DA]", fg: "text-[#F08A2A]", ring: "#F08A2A" },
      { bg: "bg-[#EDE7FE]", fg: "text-[#7C5CFF]", ring: "#7C5CFF" },
      { bg: "bg-[#DCF3F0]", fg: "text-[#14b8a6]", ring: "#14b8a6" },
      { bg: "bg-[#FCE9E9]", fg: "text-[#E25555]", ring: "#E25555" },
    ];
    const iconFor = (code: string, group: string) => {
      if (code === "irf_form") return ClipboardPenLine;
      if (code === "irf_dash") return ChartNoAxesCombined;
      if (code === "srf" || code === "incident") return ShieldCheck;
      if (code === "uprp" || code === "attendance") return ClipboardCheck;
      if (code === "action_tracker") return ClipboardList;
      if (code === "workplan") return GanttChartSquare;
      if (code === "microplan_entry") return MapPin;
      if (code === "mental_health") return BrainIcon;
      if (code.endsWith("_dash")) return BarChart3;
      if (code.endsWith("_form")) return ClipboardCheck;
      if (group === "Assessment Forms") return Stethoscope;
      if (group === "Mental Health Forms") return BrainIcon;
      return FileText;
    };
    const hasRequiredFor = (code: string, group: string): boolean => {
      const def = (STANDARD_ASSESSMENTS as any)[code];
      if (def) {
        const all = [
          ...(def.identification || []), ...(def.demographics || []),
          ...(def.psychographics || []), ...(def.items || []), ...(def.closing || []),
        ];
        return all.some((q: any) => q?.required);
      }
      // Safeguarding, assessment and mental-health forms always carry required fields.
      return ["Safeguarding Forms", "Assessment Forms", "Mental Health Forms"].includes(group);
    };
    return ALL_STANDARD_FORMS
      .filter((f) => assignedStandardCodes.has(f.code))
      .map((f, i) => {
        const def = (STANDARD_ASSESSMENTS as any)[f.code];
        // A form disabled at project level is "restricted" — assigned but locked.
        const restricted = disabledStandardCodes.has(f.code as StandardFormCode);
        const irfStyle = f.code === "irf_form"
          ? { bg: "bg-gradient-to-br from-rose-100 via-amber-50 to-emerald-100", fg: "text-rose-600", ring: "#e11d48" }
          : f.code === "irf_dash"
            ? { bg: "bg-gradient-to-br from-cyan-100 via-sky-100 to-indigo-100", fg: "text-sky-700", ring: "#0284c7" }
            : null;
        return {
          code: f.code,
          name: def?.shortName || f.name,
          desc: def?.description || f.group,
          group: f.group,
          Icon: iconFor(f.code, f.group),
          status: (restricted ? "restricted" : "assigned") as "assigned" | "restricted",
          hasRequired: hasRequiredFor(f.code, f.group),
          ...(irfStyle || palette[i % palette.length]),
        };
      });
  }, [assignedStandardCodes, disabledStandardCodes]);

  // Distinct categories present in the user's assigned forms (for filter chips).
  const yourFormsGroups = useMemo(() => {
    const s = new Set<string>();
    assignedFormCards.forEach((c) => s.add(c.group));
    return Array.from(s);
  }, [assignedFormCards]);

  // Apply search + category filter. Restricted forms stay visible (locked) so the
  // user can see why a form can't be opened, but they can never be launched.
  const filteredYourForms = useMemo(() => {
    const q = yourFormsSearch.trim().toLowerCase();
    return assignedFormCards.filter((c) => {
      const matchGroup = yourFormsGroup === "all" || c.group === yourFormsGroup;
      const matchSearch = !q || c.name.toLowerCase().includes(q) ||
        c.code.toLowerCase().includes(q) || c.group.toLowerCase().includes(q);
      return matchGroup && matchSearch;
    });
  }, [assignedFormCards, yourFormsSearch, yourFormsGroup]);

  // Group the filtered cards by category for the folder-explorer view.
  const filteredYourFormsByGroup = useMemo(() => {
    const map = new Map<string, YourFormCard[]>();
    filteredYourForms.forEach((c) => {
      const arr = map.get(c.group) || [];
      arr.push(c);
      map.set(c.group, arr);
    });
    return Array.from(map.entries());
  }, [filteredYourForms]);

  // Single, consistent card renderer used by both the flat grid and folder views.
  const renderYourFormCard = useCallback((c: YourFormCard) => {
    const restricted = c.status === "restricted";
    return (
      <button
        key={c.code}
        onClick={() => launchStandardForm(c.code)}
        disabled={restricted}
        aria-disabled={restricted}
        className={`group relative flex items-center gap-3.5 overflow-hidden rounded-2xl border bg-white p-4 text-left shadow-sm transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${
          restricted
            ? "border-red-200 opacity-70 cursor-not-allowed"
            : "border-border/60 hover:-translate-y-0.5 hover:shadow-md"
        }`}
        style={{ ['--tw-ring-color' as any]: c.ring }}
      >
        <span aria-hidden className="absolute inset-y-0 left-0 w-1.5" style={{ backgroundColor: restricted ? "#DC2626" : c.ring }} />
        <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${c.bg} transition-transform ${restricted ? "" : "group-hover:scale-105"}`}>
          <c.Icon className={`h-6 w-6 ${c.fg}`} strokeWidth={2} />
        </div>
        <div className="min-w-0 flex-1">
          <h4 className="whitespace-normal break-words text-[15px] font-bold leading-snug text-foreground">{c.name}</h4>
          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{c.desc}</p>
          {/* Status indicators — consistent, intuitive colouring across all cards. */}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {restricted ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-600 ring-1 ring-inset ring-red-200">
                <Lock className="h-3 w-3" /> Restricted
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 ring-1 ring-inset ring-emerald-200">
                <CheckCircle className="h-3 w-3" /> Assigned
              </span>
            )}
            {c.hasRequired && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-600 ring-1 ring-inset ring-amber-200">
                <AlertTriangle className="h-3 w-3" /> Required fields
              </span>
            )}
          </div>
        </div>
        {!restricted && (
          <ChevronRight className="h-5 w-5 shrink-0 self-center text-muted-foreground/40 transition-all group-hover:translate-x-0.5 group-hover:text-foreground" />
        )}
      </button>
    );
  }, [launchStandardForm]);


  const { canBulk } = useBulkDataAccess();
  const { isOnline, downloadForm, cacheFormsForOffline, removeForm, isFormAvailableOffline, offlineForms } = useOfflineForms();
  const { logAction } = useAdminSurveillance();
  const [, setSearchParams] = useSearchParams();

  // Scroll to top whenever any form view / dialog / sub-screen is opened
  const wasFormViewOpenRef = useRef(false);
  useEffect(() => {
    const isFormViewOpen = !!(
      fillingForm ||
      showFormBuilder ||
      showHistory ||
      savedFormsMode ||
      activeStandardAssessment ||
      showDigitalAttendance ||
      showUprp ||
      showUprpRecords ||
      showMentalHealth ||
      officeFormsOpen ||
      showActionTracker ||
      showWorkplan ||
      showBloombergForm ||
      showBloombergDash ||
      showSeeClearForm ||
      showSeeClearDash ||
      microplanFillingActive ||
      dashboardForm ||
      mdaDashboardForm ||
      specialDashForm ||
      sarmaanDashForm ||
      sarmaanLaunchForm ||
      geofenceManagerForm ||
      templateForm ||
      qrCodeForm ||
      dailyTargetForm ||
      bulkForm ||
      showQRScanner ||
      showTemplatePicker ||
      showBulkAccess ||
      selectingFormFor
    );
    if (isFormViewOpen && !wasFormViewOpenRef.current) {
      scrollToAppTop("auto");
    }
    wasFormViewOpenRef.current = isFormViewOpen;
  }, [
    fillingForm,
    showFormBuilder,
    showHistory,
    savedFormsMode,
    activeStandardAssessment,
    showDigitalAttendance,
    showUprp,
    showUprpRecords,
    showMentalHealth,
    officeFormsOpen,
    showActionTracker,
    showWorkplan,
    showBloombergForm,
    showBloombergDash,
    showSeeClearForm,
    showSeeClearDash,
    microplanFillingActive,
    dashboardForm,
    mdaDashboardForm,
    specialDashForm,
    sarmaanDashForm,
    sarmaanLaunchForm,
    geofenceManagerForm,
    templateForm,
    qrCodeForm,
    dailyTargetForm,
    bulkForm,
    showQRScanner,
    showTemplatePicker,
    showBulkAccess,
    selectingFormFor,
  ]);

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

  // Wait for auth (role/user) to resolve before fetching, otherwise super admins
  // and assigned users get empty/incorrect lists that never refresh because the
  // queries ran while `role` was still null.
  useEffect(() => {
    if (authLoading) return;
    fetchProjects();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user?.id, role, isSuperAdmin, isOwnerLevel, isAdmin]);

  useEffect(() => {
    if (selectedProjectId) {
      setCurrentProjectId(selectedProjectId);
    }
  }, [selectedProjectId]);

  useEffect(() => {
    if (authLoading) return;
    if (currentProjectId) {
      fetchForms(currentProjectId);
    } else {
      fetchAllForms();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentProjectId, authLoading, user?.id, role, isSuperAdmin, isOwnerLevel]);

  // Silent form restore: ONLY re-open a form after a genuine silent app update
  // (the sessionStorage SILENT_UPDATE_RESTORE_KEY is written immediately before
  // the auto-update reload). We intentionally do NOT restore from the persistent
  // ACTIVE_FORM_FILL_KEY on ordinary mounts/logins, and we guard with a ref so
  // this never re-fires when `fillingForm` is cleared (e.g. the Back button).
  const silentRestoreHandledRef = useRef(false);
  useEffect(() => {
    if (authLoading || fillingForm) return;
    if (silentRestoreHandledRef.current) return;
    let restore: any = null;
    try {
      restore = JSON.parse(sessionStorage.getItem(SILENT_UPDATE_RESTORE_KEY) || "null");
    } catch {}
    const formId = restore?.formId;
    if (!formId) {
      // Nothing to silently restore — mark handled so a later Back/login never
      // accidentally re-opens a stale form.
      silentRestoreHandledRef.current = true;
      return;
    }
    try {
      const active = JSON.parse(localStorage.getItem(ACTIVE_FORM_FILL_KEY) || "null");
      if (forms.length === 0 && offlineForms.length === 0 && active?.projectId && active.projectId !== currentProjectId) {
        setCurrentProjectId(active.projectId);
        return; // wait for the correct project's forms to load, then retry
      }
      const offlineMatches = offlineForms.map((of) => {
        const allItems = (of.questions as unknown as any[]) || [];
        const groupItems = allItems.filter((q: any) => Array.isArray(q.questions)) as FormGroup[];
        const ungroupedQuestions = allItems.filter((q: any) => !Array.isArray(q.questions)) as Question[];
        return { ...of, questions: ungroupedQuestions, groups: groupItems, submissions_count: 0, created_at: of.downloaded_at } as Form;
      });
      const form = forms.find((f) => f.id === formId) || offlineMatches.find((f) => f.id === formId);
      if (form) {
        silentRestoreHandledRef.current = true;
        sessionStorage.removeItem(SILENT_UPDATE_RESTORE_KEY);
        // The Integrated MDA Supervisory Checklist opens to a navigation hub
        // (the 5-item landing), not a single form. Silently re-opening it after
        // an update/refresh would dump the user on that landing page even when
        // they had navigated away — and their actual sub-module progress is
        // already preserved as a draft. So never auto-restore into it; leave the
        // user on the Forms home and let them resume from Drafts.
        if (isMdaChecklistLike({ settings: form.settings, formName: form.name, groups: form.groups })) {
          return;
        }
        setFillingForm(form);
        if (form.project_id && form.project_id !== currentProjectId) setCurrentProjectId(form.project_id);
      } else if (active?.projectId && active.projectId !== currentProjectId) {
        setCurrentProjectId(active.projectId);
      }

    } catch {}
  }, [authLoading, currentProjectId, fillingForm, forms, offlineForms]);


  const fetchProjects = async () => {
    try {
      let projectsData;
      
      // Super admins and owner-level users (Owner + Co-owner) see all projects;
      // Systems admins only see assigned projects
      if (isSuperAdmin || isOwnerLevel) {
        const { data, error } = await withTimeout(supabase
          .from("projects")
          .select("id, name")
          .order("name"), 9000, "projects_timeout");
        if (error) throw error;
        projectsData = data;
      } else if (role === "systems_admin" || !isAdmin) {
        // Systems admins and regular users see only assigned projects
        const { data: assignments, error: assignError } = await withTimeout(supabase
          .from("user_project_assignments")
          .select("project_id")
          .eq("user_id", user?.id), 9000, "project_assignments_timeout");
        
        if (assignError) throw assignError;
        
        if (assignments && assignments.length > 0) {
          const projectIds = assignments.map(a => a.project_id);
          const { data, error } = await withTimeout(supabase
            .from("projects")
            .select("id, name")
            .in("id", projectIds)
            .order("name"), 9000, "assigned_projects_timeout");
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
      // Do not block the Forms page just because project names failed to load.
      // Cached/offline forms below remain usable under All Projects.
      setProjects((prev) => prev);
    }
  };

  const fetchForms = async (projectId: string) => {
    // When offline, skip the network call and rely on the offline cache merge.
    if (!isOnline) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const { data: formsData, error } = await withTimeout(supabase
        .from("forms")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false }), 10000, "project_forms_timeout");

      if (error) throw error;

      // Do not run one count query per form; that N+1 pattern was making the
      // page unusable on slow field connections. Render immediately; dashboards
      // and history screens fetch their own exact submission data when opened.
      const formsWithCounts = (formsData || []).map(toRenderableForm);

      setForms(formsWithCounts);
      // Auto-cache every fetched form so it can be opened offline later.
      cacheFormsForOffline(formsWithCounts);
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
    // When offline, skip the network call and rely on the offline cache merge.
    if (!isOnline) {
      setLoading(false);
      return;
    }
    const stopTimer = startTimer("forms_api_fetch_all");
    let fetchOk = true;
    try {
      setLoading(true);

      
      // Super admins and owner-level users (Owner + Co-owner) see all forms;
      // Systems admins only see assigned forms
      let formsData;
      if (isSuperAdmin || isOwnerLevel) {
        const { data, error } = await withTimeout(supabase
          .from("forms")
          .select("*")
          .order("created_at", { ascending: false }), 10000, "all_forms_timeout");
        if (error) throw error;
        formsData = data;
      } else if (role === "systems_admin") {
        // Systems admins see only forms they are assigned to via project or form assignments
        const [formAssignRes, projectAssignRes, sarmaanAccessRes] = await withTimeout(Promise.all([
          supabase.from("user_form_assignments").select("form_id").eq("user_id", user?.id),
          supabase.from("user_project_assignments").select("project_id").eq("user_id", user?.id),
          supabase.from("sarmaan_form_access" as any).select("form_id").eq("user_id", user?.id),
        ]), 10000, "systems_admin_access_timeout");
        const { data: formAssignments, error: formAssignError } = formAssignRes;
        const { data: projectAssignments, error: projectAssignError } = projectAssignRes;
        const { data: sarmaanAccessRows, error: sarmaanAccessError } = sarmaanAccessRes;

        if (sarmaanAccessError) throw sarmaanAccessError;

        const directFormIds = formAssignments?.map(a => a.form_id) || [];
        const sarmaanAccessFormIds = (sarmaanAccessRows as any[] | null || []).map(a => a.form_id);
        const projectIds = projectAssignments?.map(a => a.project_id) || [];
        
        let formsFromProjects: string[] = [];
        if (projectIds.length > 0) {
          const { data: projectForms } = await withTimeout(supabase
            .from("forms")
            .select("id")
            .in("project_id", projectIds), 10000, "systems_project_forms_timeout");
          formsFromProjects = projectForms?.map(f => f.id) || [];
        }
        
        const allFormIds = [...new Set([...directFormIds, ...formsFromProjects, ...sarmaanAccessFormIds])];
        
        if (allFormIds.length > 0) {
          const { data, error } = await withTimeout(supabase
            .from("forms")
            .select("*")
            .in("id", allFormIds)
            .order("created_at", { ascending: false }), 10000, "systems_forms_timeout");
          if (error) throw error;
          formsData = data;
        } else {
          formsData = [];
        }
      } else {
        // Regular users get their explicitly-assigned forms PLUS automatic access
        // to the Integrated MDA Supervisory Checklist for every project they are a
        // member of (the checklist is auto-granted to all project members; the
        // dashboard is gated separately and not opened here).
        const [assignRes, sarmaanAccessRes, projectAssignRes] = await withTimeout(Promise.all([
          supabase.from("user_form_assignments").select("form_id").eq("user_id", user?.id),
          supabase.from("sarmaan_form_access" as any).select("form_id").eq("user_id", user?.id),
          supabase.from("user_project_assignments").select("project_id").eq("user_id", user?.id),
        ]), 10000, "user_access_timeout");
        const { data: assignments, error: assignError } = assignRes;
        const { data: sarmaanAccessRows, error: sarmaanAccessError } = sarmaanAccessRes;
        const { data: projectAssignments } = projectAssignRes;

        if (assignError) throw assignError;
        if (sarmaanAccessError) throw sarmaanAccessError;

        const assignedFormIds = (assignments || []).map(a => a.form_id);

        // SARMAAN checklist grants live in their own access table. Include those
        // form ids here so users see the dedicated SARMAAN ACSM checklist even
        // when they are not otherwise assigned through the generic form system.
        const sarmaanAccessFormIds = (sarmaanAccessRows as any[] | null || []).map(a => a.form_id);

        // Pull all forms from the user's assigned projects so we can surface the
        // MDA checklist automatically even when it was never explicitly assigned.
        const memberProjectIds = (projectAssignments || []).map(a => a.project_id);

        let autoMdaFormIds: string[] = [];
        let autoSarmaanAcsmFormIds: string[] = [];
        if (memberProjectIds.length > 0) {
          const { data: projectForms } = await withTimeout(supabase
            .from("forms")
            .select("id, name, settings, questions")
            .in("project_id", memberProjectIds), 10000, "user_project_forms_timeout");
          autoMdaFormIds = (projectForms || [])
            .filter((f: any) => {
              const allItems = (f.questions as unknown as any[]) || [];
              const groups = allItems.filter((q: any) => Array.isArray(q.questions));
              return isMdaChecklistLike({
                settings: (f.settings as unknown as FormSettings) || {},
                formName: f.name,
                groups: groups as FormGroup[],
              });
            })
            .map((f: any) => f.id);
          autoSarmaanAcsmFormIds = (projectForms || [])
            .filter((f: any) => isSarmaanAcsmStoredForm(f))
            .map((f: any) => f.id);
        }

        const formIds = [...new Set([...assignedFormIds, ...autoMdaFormIds, ...autoSarmaanAcsmFormIds, ...sarmaanAccessFormIds])];

        if (formIds.length > 0) {
          const { data, error } = await withTimeout(supabase
            .from("forms")
            .select("*")
            .in("id", formIds)
            .order("created_at", { ascending: false }), 10000, "user_forms_timeout");
          if (error) throw error;
          formsData = data;
        } else {
          formsData = [];
        }
      }

      const formsWithCounts = (formsData || []).map(toRenderableForm);

      setForms(formsWithCounts);
      // Auto-cache every fetched form so it can be opened offline later.
      cacheFormsForOffline(formsWithCounts);
    } catch (error: any) {
      console.error("Error fetching forms:", error);
      fetchOk = false;
    } finally {
      setLoading(false);
      stopTimer(fetchOk, { role: role || "user" });
    }
  };

  const handleDeleteForm = async (formId: string) => {
    try {
      const form = forms.find(f => f.id === formId);
      const bbgKind = (form?.settings as any)?.bloomberg_kind as ("form" | "dashboard" | undefined);
      const scKind = (form?.settings as any)?.seeclear_kind as ("form" | "dashboard" | undefined);
      // The form and its Dashboard are permanently linked —
      // removing the form also removes the dashboard from the same project.
      const idsToDelete = [formId];
      if (bbgKind === "form" && form?.project_id) {
        const linkedDash = forms.find(
          f => f.project_id === form.project_id && (f.settings as any)?.bloomberg_kind === "dashboard",
        );
        if (linkedDash) idsToDelete.push(linkedDash.id);
      }
      if (scKind === "form" && form?.project_id) {
        const linkedDash = forms.find(
          f => f.project_id === form.project_id && (f.settings as any)?.seeclear_kind === "dashboard",
        );
        if (linkedDash) idsToDelete.push(linkedDash.id);
      }
      const acsmKind = (form?.settings as any)?.acsm_kind as ("form" | "dashboard" | undefined);
      if (acsmKind === "form" && form?.project_id) {
        const linkedDash = forms.find(
          f => f.project_id === form.project_id && (f.settings as any)?.acsm_kind === "dashboard",
        );
        if (linkedDash) idsToDelete.push(linkedDash.id);
      }
      const sbcKind = (form?.settings as any)?.sbc_kind as ("form" | "dashboard" | undefined);
      if (sbcKind === "form" && form?.project_id) {
        const linkedDash = forms.find(
          f => f.project_id === form.project_id && (f.settings as any)?.sbc_kind === "dashboard",
        );
        if (linkedDash) idsToDelete.push(linkedDash.id);
      }
      const irfKind = (form?.settings as any)?.irf_kind as ("form" | "dashboard" | undefined);
      if (irfKind === "form" && form?.project_id) {
        const linkedDash = forms.find(
          f => f.project_id === form.project_id && (f.settings as any)?.irf_kind === "dashboard",
        );
        if (linkedDash) idsToDelete.push(linkedDash.id);
      }
      const { error } = await supabase.from("forms").delete().in("id", idsToDelete);
      if (error) throw error;
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

  const handleDownloadXlsForm = (form: any) => {
    try {
      const raw = form?.questions;
      let sections: any[];
      if (Array.isArray(raw) && raw.length && raw[0]?.questions) {
        sections = raw;
      } else {
        sections = [{ id: "s1", name: "survey", label: "Survey", questions: Array.isArray(raw) ? raw : [] }];
      }
      downloadXlsForm(form?.title || form?.name || "form", sections);
      toast({ title: "XLSForm downloaded" });
    } catch (e: any) {
      toast({ title: "Could not export XLSForm", description: e?.message, variant: "destructive" });
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
    // Local-first saved-forms actions open dedicated manager panels and do not
    // require picking a form first.
    if (actionId === "edit" || actionId === "send" || actionId === "view" || actionId === "delete") {
      setSavedFormsMode(actionId as SavedFormsMode);
      return;
    }
    // "fill" still needs the user to choose which blank form to start.
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

  const handleDownloadAccessibleForms = async () => {
    if (!user?.id) return;
    const visibleCache = filteredForms.length > 0 ? filteredForms : mergedForms;
    if (!isOnline) {
      toast({
        title: "Offline forms ready",
        description: visibleCache.length > 0
          ? `${visibleCache.length} cached form${visibleCache.length === 1 ? " is" : "s are"} available on this device.`
          : "No cached forms are available yet. Connect once to download your assigned forms.",
      });
      return;
    }
    try {
      const isAdminRole = isSuperAdmin || isOwnerLevel || role === "systems_admin" || user.email === "amehjoey1@gmail.com";
      const stop = startTimer("forms_download_accessible");
      const result = await withTimeout(
        warmCacheUserFormsDetailed({ userId: user.id, isAdmin: isAdminRole, role }),
        18000,
        "download_accessible_forms_timeout",
      );
      stop(true, { count: result.count, scopedToGrants: result.scopedToGrants });
      if (visibleCache.length > 0) await cacheFormsForOffline(visibleCache);
      // Confirm on-screen exactly what was downloaded, scoped to access grants.
      setDownloadConfirm({
        forms: result.forms.map((f) => ({ id: f.id, name: f.name })),
        scopedToGrants: result.scopedToGrants,
      });
      toast({
        title: "Forms downloaded",
        description: `${Math.max(result.count, visibleCache.length)} accessible form${Math.max(result.count, visibleCache.length) === 1 ? " is" : "s are"} ready for complete offline use.`,
      });
    } catch (error: any) {
      if (visibleCache.length > 0) {
        await cacheFormsForOffline(visibleCache);
        toast({
          title: "Visible forms saved offline",
          description: "The backend was slow, so the forms currently visible on this device were cached for offline use.",
        });
      } else {
        toast({
          title: "Download delayed",
          description: error?.message || "The connection is too slow. Try again once the backend responds.",
          variant: "destructive",
        });
      }
    }
  };

  // Always merge cached forms, even when navigator.onLine is true. Field devices
  // can be technically online while the backend is timing out; cached forms must
  // still remain visible and usable.
  const mergedForms = [
    ...forms,
    ...offlineForms
      .filter((of) => (!currentProjectId || of.project_id === currentProjectId) && !forms.some((f) => f.id === of.id))
      .map(toRenderableForm),
  ];

  const filteredForms = mergedForms.filter((form) =>
    form.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const mdaChecklistForms = mergedForms.filter((form) =>
    isMdaChecklistLike({ settings: form.settings, formName: form.name, groups: form.groups })
  );
  // The MDA Supervisory Dashboard is NOT auto-granted with the checklist.
  // Systems Admins, Super Admins, Owner, Co-owner — or members the Owner/Admin
  // has explicitly granted dashboard access — may open it.
  const canSeeMdaDashboard = isAdmin || isOwnerLevel || hasDashboardAccess("mda_supervisory", currentProjectId);
  const canSeeIrfDashboard = isAdmin || isOwnerLevel || hasDashboardAccess("sairf", currentProjectId);
  const primaryMdaDashboardForm = currentProjectId
    ? mdaChecklistForms.find((form) => form.project_id === currentProjectId) || null
    : mdaChecklistForms[0] || null;

  const currentProject = projects.find(p => p.id === currentProjectId);
  const sarmaanSupervisoryForms = useMemo(
    () => mergedForms.filter((form) => isSupervisoryLearningForm({ settings: form.settings, name: form.name })),
    [mergedForms],
  );
  const primarySarmaanSupervisoryForm = currentProjectId
    ? sarmaanSupervisoryForms.find((form) => form.project_id === currentProjectId) || null
    : sarmaanSupervisoryForms[0] || null;
  const currentProjectIsSarmaan = /sarmaan/i.test(currentProject?.name || "");

  // SARMAAN checklist/dashboard access control
  const sarmaanIsManager = isAdmin || isOwnerLevel;
  const canSeeSarmaanDashboard = sarmaanIsManager || hasDashboardAccess("sarmaan_supervisory", currentProjectId);
  const { grants: sarmaanGrants, hasAnyGrant: hasAnySarmaanGrant } = useSarmaanFormAccess(
    primarySarmaanSupervisoryForm?.id,
    sarmaanIsManager,
  );
  const sarmaanAllowedSectionIds = sarmaanIsManager
    ? null
    : sarmaanGrants.filter((g) => g.user_id === user?.id).map((g) => g.section_id);
  const canSeeSarmaanChecklist = sarmaanIsManager || hasAnySarmaanGrant;

  // SARMAAN ACSM & MDA Supervision Checklist (image-parity form)
  const acsmForm = useMemo(
    () => mergedForms.find((f) => isSarmaanAcsmStoredForm(f) && (!currentProjectId || f.project_id === currentProjectId)) || null,
    [mergedForms, currentProjectId],
  );
  const acsmProjectIsSarmaan = !!acsmForm && projects.some((p) => p.id === acsmForm.project_id && /sarmaan/i.test(p.name || ""));
  const sarmaanAcsmContext = currentProjectIsSarmaan || acsmProjectIsSarmaan;
  const { grants: acsmGrants, hasAnyGrant: hasAnyAcsmGrant } = useSarmaanFormAccess(acsmForm?.id, sarmaanIsManager);
  const canSeeAcsmChecklist = sarmaanIsManager || hasAnyAcsmGrant || (sarmaanAcsmContext && !!acsmForm);
  // Dashboard access is INDEPENDENT of checklist access: managers, anyone with
  // a checklist grant, or anyone granted the dashboard directly can view it.
  const canSeeAcsmDashboard = sarmaanIsManager || canSeeAcsmChecklist || hasDashboardAccess("sarmaan_acsm", currentProjectId);

  // One-click: grant the ENTIRE SARMAAN ACSM & MDA Supervision Checklist to
  // every active member assigned to the current project.
  const [grantingAllAcsm, setGrantingAllAcsm] = useState(false);
  const grantAcsmToAllMembers = async () => {
    if (!acsmForm) return;
    const projId = acsmForm.project_id || currentProjectId;
    if (!projId) {
      toast({ title: "Select a project", description: "Choose the SARMAAN project first.", variant: "destructive" });
      return;
    }
    setGrantingAllAcsm(true);
    try {
      const WHOLE_ID = "__acsm_whole__";
      // Members assigned to this project
      const { data: assigns } = await supabase
        .from("user_project_assignments").select("user_id").eq("project_id", projId);
      let userIds = Array.from(new Set((assigns || []).map((r: any) => r.user_id)));
      // Keep only active profiles
      if (userIds.length) {
        const { data: profs } = await supabase
          .from("profiles").select("user_id").eq("is_active", true).in("user_id", userIds);
        userIds = (profs || []).map((r: any) => r.user_id);
      }
      if (!userIds.length) {
        toast({ title: "No members found", description: "No active members are assigned to this project yet." });
        return;
      }
      // Existing whole-checklist grants
      const { data: existing } = await supabase
        .from("sarmaan_form_access" as any)
        .select("user_id").eq("form_id", acsmForm.id).eq("section_id", WHOLE_ID);
      const have = new Set((existing as any[] | null || []).map((r) => r.user_id));
      const toGrant = userIds.filter((uid) => !have.has(uid));
      if (!toGrant.length) {
        toast({ title: "Already granted", description: "All project members already have access to this checklist." });
        return;
      }
      const { error } = await supabase.from("sarmaan_form_access" as any).insert(
        toGrant.map((uid) => ({ form_id: acsmForm.id, section_id: WHOLE_ID, user_id: uid, project_id: projId, granted_by: user?.id ?? null })),
      );
      if (error) throw error;
      toast({ title: "Access granted", description: `${toGrant.length} member(s) can now view and use the checklist.` });
    } catch (e: any) {
      toast({ title: "Could not grant access", description: e?.message || "Please try again.", variant: "destructive" });
    } finally {
      setGrantingAllAcsm(false);
    }
  };

  const createAcsmChecklist = async (): Promise<Form | null> => {
    if (!currentProjectId) {
      toast({ title: "Select a project", description: "Choose the SARMAAN project first.", variant: "destructive" });
      return null;
    }
    if (acsmForm) return acsmForm;
    try {
      const data = await getOrCreateSingletonForm({
        projectId: currentProjectId,
        name: SARMAAN_ACSM_FORM_NAME,
        settingsFlag: "sarmaan_acsm",
        buildInsert: () => ({
          name: SARMAAN_ACSM_FORM_NAME,
          description: SARMAAN_ACSM_DESC,
          questions: buildAcsmFormSchema() as any,
          settings: { requireLocation: true, offlineEnabled: true, sarmaan_acsm: true } as any,
          project_id: currentProjectId,
          created_by: user?.id,
          status: "active",
        }),
      });
      const created = { ...(data as any), submissions_count: 0 } as Form;
      setForms((prev) => (prev.some((f) => f.id === created.id) ? prev : [created, ...prev]));
      toast({ title: "Checklist added", description: "SARMAAN ACSM & MDA Supervision Checklist is ready." });
      fetchForms(currentProjectId);
      return created;
    } catch (e: any) {
      toast({ title: "Could not add", description: e?.message || "Please try again.", variant: "destructive" });
      return null;
    }
  };

  const filteredNonSarmaanForms = filteredForms.filter(
    (form) => !(currentProjectIsSarmaan && (
      isSupervisoryLearningForm({ settings: form.settings, name: form.name }) || isSarmaanAcsmStoredForm(form)
    )),
  );
  const sarmaanSearchMatches = !searchQuery.trim() || /sarmaan|supervisory|supervision|checklist|dashboard|learning|acsm|mda|azithromycin/i.test(searchQuery);
  const acsmSearchMatches = !searchQuery.trim() || /sarmaan|acsm|mda|supervision|checklist|dashboard|azithromycin/i.test(searchQuery);
  const shouldShowSarmaanSupervisoryBlock = currentProjectIsSarmaan && sarmaanSearchMatches && (!!primarySarmaanSupervisoryForm || isAdmin);
  const shouldShowSarmaanAcsmBlock = sarmaanAcsmContext && acsmSearchMatches && (sarmaanIsManager || !!acsmForm || canSeeAcsmChecklist || canSeeAcsmDashboard);
  const sarmaanVisibleRowCount = (shouldShowSarmaanSupervisoryBlock ? 2 : 0) + (shouldShowSarmaanAcsmBlock ? 1 : 0);
  const visibleMyFormsCount = filteredNonSarmaanForms.length + sarmaanVisibleRowCount;

  const createSarmaanSupervisoryTool = async (): Promise<Form | null> => {
    if (!currentProjectId) {
      toast({ title: "Select a project", description: "Choose the SARMAAN project before adding the checklist.", variant: "destructive" });
      return null;
    }
    const existing = sarmaanSupervisoryForms.find((form) => form.project_id === currentProjectId);
    if (existing) {
      toast({ title: "Already visible", description: "The SARMAAN Supervisory Checklist and Supervision Dashboard are already shown under this project." });
      return existing;
    }
    try {
      const preset = getPreset("supervisory_learning");
      if (!preset) throw new Error("SARMAAN supervisory template is unavailable.");
      const sections = preset.sections();
      const dashboardConfig = preset.dashboard();
      const data = await getOrCreateSingletonForm({
        projectId: currentProjectId,
        name: SARMAAN_SUPERVISORY_FORM_NAME,
        settingsFlag: "sarmaan_supervisory",
        buildInsert: () => ({
          name: SARMAAN_SUPERVISORY_FORM_NAME,
          description: SARMAAN_SUPERVISORY_DESC,
          questions: sections as any,
          settings: {
            theme: preset.theme,
            studio: true,
            presetKey: "supervisory_learning",
            dashboardEnabled: true,
            dashboardConfig,
            requireLocation: true,
            sarmaan_supervisory: true,
            // Render sections under the beautiful ODK-style MDA interface and
            // drive geography from the microplan location cascade.
            supervisoryChecklistStyle: true,
            microplanLocationCascade: true,
          } as any,
          project_id: currentProjectId,
          created_by: user?.id,
          status: "active",
        }),
      });
      const allItems = ((data as any)?.questions as unknown as any[]) || [];
      const groupItems = allItems.filter((q: any) => Array.isArray(q.questions)) as FormGroup[];
      const ungroupedQuestions = allItems.filter((q: any) => !Array.isArray(q.questions)) as Question[];
      const createdForm = {
        ...(data as any),
        questions: ungroupedQuestions,
        groups: groupItems,
        geofence: ((data as any)?.geofence as unknown as GeofenceArea) || null,
        settings: ((data as any)?.settings as unknown as FormSettings) || {},
        submissions_count: 0,
      } as Form;
      setForms((prev) => (prev.some((f) => f.id === createdForm.id) ? prev : [createdForm, ...prev]));
      cacheFormsForOffline([createdForm]);
      toast({ title: "Added to SARMAAN forms", description: "The checklist and dashboard are now visible as separate entries." });
      fetchForms(currentProjectId);
      return createdForm;
    } catch (e: any) {
      console.error("SARMAAN supervisory add error", e);
      toast({ title: "Could not add", description: e?.message || "Please try again.", variant: "destructive" });
      return null;
    }
  };

  if (showMentalHealth) {
    return (
      <MentalHealthAssessment
        projectId={currentProjectId}
        onClose={() => setShowMentalHealth(false)}
      />
    );
  }

  if (activeStandardAssessment) {
    return (
      <StandardAssessmentView
        code={activeStandardAssessment}
        projectId={currentProjectId}
        onClose={() => setActiveStandardAssessment(null)}
      />
    );
  }

  if (showUprpRecords) {
    return (
      <UPRPSubmissionsView
        projectId={currentProjectId}
        onClose={() => setShowUprpRecords(false)}
      />
    );
  }

  if (showUprp) {
    return (
      <UPRPForm
        projectId={currentProjectId}
        onClose={() => setShowUprp(false)}
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

  if (officeFormsOpen) {
    return (
      <OfficeFormsView
        projectId={currentProjectId}
        filterCodes={officeFormsOpen.codes as any}
        title={officeFormsOpen.title}
        onClose={() => setOfficeFormsOpen(null)}
      />
    );
  }

  if (showActionTracker) {
    return (
      <ActionTrackerView
        projectId={currentProjectId}
        onClose={() => setShowActionTracker(false)}
      />
    );
  }

  if (showWorkplan) {
    return (
      <WorkplanView
        projectId={currentProjectId}
        onClose={() => setShowWorkplan(false)}
      />
    );
  }

  if (showBloombergForm) {
    return <BloombergFormFiller projectId={currentProjectId} onClose={() => setShowBloombergForm(false)} />;
  }

  if (showBloombergDash) {
    return <BloombergDashboard onClose={() => setShowBloombergDash(false)} />;
  }

  if (showSeeClearForm) {
    return <SeeClearFormFiller onClose={() => setShowSeeClearForm(false)} />;
  }

  if (showSeeClearDash) {
    return <SeeClearDashboard onClose={() => setShowSeeClearDash(false)} />;
  }

  if (showAcsmForm) {
    return <ACSMFormFiller projectId={currentProjectId} onClose={() => setShowAcsmForm(false)} />;
  }

  if (showAcsmDash) {
    return (
      <ErrorBoundary name="Advocacy Dashboard">
        <ACSMDashboard projectId={currentProjectId} onClose={() => setShowAcsmDash(false)} />
      </ErrorBoundary>
    );
  }

  if (showSbcForm) {
    return <SBCFormFiller projectId={currentProjectId} onClose={() => setShowSbcForm(false)} />;
  }

  if (showSbcDash) {
    return <SBCDashboard projectId={currentProjectId} onClose={() => setShowSbcDash(false)} />;
  }

  if (showIrfForm) {
    return <IRFCategoryLauncher projectId={currentProjectId} onClose={() => setShowIrfForm(false)} />;
  }

  if (showIrfDash) {
    if (!canSeeIrfDashboard) {
      return (
        <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 p-6 text-center">
          <ShieldCheck className="h-10 w-10 text-muted-foreground opacity-50" />
          <h2 className="text-lg font-semibold">Dashboard access required</h2>
          <p className="max-w-md text-sm text-muted-foreground">
            You don't yet have access to the SARMAAN ACSM Indicator Tracking Dashboard. Please ask the project Owner or an Admin to grant you access.
          </p>
          <Button variant="outline" onClick={() => setShowIrfDash(false)}>
            <ArrowLeft className="mr-1 h-4 w-4" /> Back to Forms
          </Button>
        </div>
      );
    }
    return <IRFDashboard projectId={currentProjectId} onClose={() => setShowIrfDash(false)} />;
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

  if (specialDashForm) {
    return (
      <SpecialFormDashboard
        form={{
          id: specialDashForm.id,
          name: specialDashForm.name,
          questions: (specialDashForm.questions as unknown) ?? specialDashForm.groups,
          settings: specialDashForm.settings,
        }}
        onClose={() => setSpecialDashForm(null)}
      />
    );
  }

  if (sarmaanDashForm) {
    return (
      <SarmaanLearningDashboard
        form={{
          id: sarmaanDashForm.id,
          name: sarmaanDashForm.name,
          questions: (sarmaanDashForm.questions as unknown) ?? sarmaanDashForm.groups,
          settings: sarmaanDashForm.settings,
        }}
        onClose={() => setSarmaanDashForm(null)}
      />
    );
  }

  if (sarmaanLaunchForm) {
    const launch = sarmaanLaunchForm;
    return (
      <SarmaanChecklistLauncher
        formName={launch.name}
        formId={launch.id}
        userId={user?.id || ""}
        projectId={launch.project_id || currentProjectId || ""}
        questions={launch.questions}
        groups={launch.groups}
        requiresGps={launch.settings?.requireLocation !== false}
        allowedSectionIds={sarmaanAllowedSectionIds}
        onOpenDashboard={() => {
          setSarmaanLaunchForm(null);
          setSarmaanDashForm(launch);
        }}
        onSubmitted={() => currentProjectId && fetchForms(currentProjectId)}
        onClose={() => setSarmaanLaunchForm(null)}
      />

    );
  }

  if (acsmLaunchOpen && acsmForm) {
    return (
      <SarmaanAcsmChecklist
        formId={acsmForm.id}
        userId={user?.id || ""}
        projectId={acsmForm.project_id || currentProjectId || ""}
        onSubmitted={() => currentProjectId && fetchForms(currentProjectId)}
        onClose={() => setAcsmLaunchOpen(false)}
      />
    );
  }

  if (acsmDashOpen && acsmForm) {
    return (
      <SarmaanAcsmDashboard
        form={{ id: acsmForm.id, name: acsmForm.name, questions: acsmForm.questions, settings: acsmForm.settings }}
        onClose={() => setAcsmDashOpen(false)}
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

  if (savedFormsMode) {
    return (
      <SavedFormsManager
        mode={savedFormsMode}
        userId={user?.id || ""}
        projectId={currentProjectId}
        onClose={() => setSavedFormsMode(null)}
      />
    );
  }

  if (fillingForm) {
    const fillerCommon = {
      formId: fillingForm.id,
      formName: fillingForm.name,
      formDescription: fillingForm.description || "",
      questions: fillingForm.questions,
      groups: fillingForm.groups,
      geofence: fillingForm.geofence || undefined,
      userId: user?.id || "",
      projectId: fillingForm.project_id || currentProjectId || "",
      requireLocation: fillingForm.settings?.requireLocation,
      settings: fillingForm.settings,
      onClose: () => setFillingForm(null),
    };
    // The Integrated MDA Supervisory Checklist opens to its 5-item landing page
    // (Community Checklist + 4 follow-up modules) instead of the form directly.
    if (isMdaChecklistLike({ settings: fillingForm.settings, formName: fillingForm.name, groups: fillingForm.groups })) {
      return <MdaChecklistLanding {...fillerCommon} />;
    }
    return (
      <FormFiller
        {...fillerCommon}
        localWorkflow
        onSavedLocally={() => setFillingForm(null)}
      />
    );
  }


  const canBuildStudio = isOwnerLevel || role === "super_admin" || role === "systems_admin";

  if (showStudio && canBuildStudio) {
    return (
      <SpecialFormStudio
        projectId={currentProjectId || undefined}
        onClose={() => {
          setShowStudio(false);
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
                {isOwner && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      disabled={copyHideBusy || !currentProjectId}
                      onSelect={(e) => {
                        e.preventDefault();
                        toggleCopyFeatureHidden(!copyFeatureHidden);
                      }}
                    >
                      {copyFeatureHidden ? (
                        <Eye className="mr-2 h-4 w-4 text-blue-600" />
                      ) : (
                        <EyeOff className="mr-2 h-4 w-4 text-blue-600" />
                      )}
                      {copyFeatureHidden ? "Show MDA Checklist Setup" : "Hide MDA Checklist Setup"}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setShowBulkAccess(true)}>
                      <KeyRound className="mr-2 h-4 w-4 text-emerald-600" />
                      Bulk Upload Access
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      <div className="px-4 sm:px-6 pt-5 space-y-6">
        {/* Project selector — at the top of the page; trigger border + icon + text
            and each item label are tinted with the project's accent color, using
            the shared PROJECT_ACCENT_COLORS palette so Forms ↔ Projects stay in sync.
            Hidden while the forms explorer is open so the user sees only the folders. */}
        {!showFormsExplorer && (
        <section className="mx-auto w-full max-w-md">
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
        )}

        {/* Inline MDA Supervisory Dashboard — expands in place within the forms list */}
        {mdaDashboardForm && canSeeMdaDashboard && (
          <section className="mx-auto w-full max-w-[1800px]">
            <MdaDashboardView
              form={mdaDashboardForm}
              projects={projects}
              onClose={() => setMdaDashboardForm(null)}
              embedded
            />
          </section>
        )}


        {/* KoboCollect-style action menu — hidden while the inline MDA dashboard is open */}
        {!(mdaDashboardForm && canSeeMdaDashboard) && (
        <section className="mx-auto w-full max-w-md space-y-3">


          {/* "Open your form" — primary entry */}
          <div className="flex items-stretch gap-3">
            <button
              onClick={() => setShowFormsExplorer((v) => !v)}
              className="flex flex-1 items-center justify-center gap-2 rounded-full bg-[#2F6FE6] px-5 py-4 text-base font-semibold text-white shadow-[0_4px_14px_rgba(47,111,230,0.3)] transition-colors hover:bg-[#1A5FD0] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2F6FE6]/50 focus-visible:ring-offset-2"
            >
              {showFormsExplorer ? <FolderOpen className="h-6 w-6" /> : <Plus className="h-6 w-6" strokeWidth={2.5} />}
              {showFormsExplorer ? "Close" : "Open your form"}
            </button>
          </div>

          {/* Prominent, always-visible admin card for the MDA Supervisory
              Checklist copy feature. Previously this lived two collapsed levels
              deep (Open your form → Standard Forms), so admins couldn't find it.
              Now it's surfaced at the top of the Forms view for any admin. */}
          {isAdmin && !isAdhoc && !copyFeatureHidden && (
            <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 via-emerald-50/70 to-transparent p-4 shadow-sm">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-100">
                  <Copy className="h-5 w-5 text-emerald-700" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-display text-base font-bold text-foreground">
                      Integrated MDA Supervisory Checklist
                    </h3>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Add a fresh checklist or copy the complete checklist{" "}
                    <span className="font-medium">and its linked dashboard</span> from another
                    project into{" "}
                    <span className="font-medium text-foreground">
                      {currentProjectId ? (projects.find((p) => p.id === currentProjectId)?.name ?? "this project") : "your project"}
                    </span>
                    . Name clashes are resolved automatically and everything stays editable.
                  </p>
                </div>
              </div>

              {(
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <div className="flex-1 min-w-0">
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full justify-center whitespace-nowrap border-emerald-300 text-emerald-800 hover:bg-emerald-100"
                  onClick={async () => {
                    if (!currentProjectId) {
                      toast({ title: "Select a project", description: "Choose a project before creating the checklist.", variant: "destructive" });
                      return;
                    }
                    const existing = forms.find((f) => f.name === MDA_CHECKLIST_NAME);
                    if (existing) {
                      toast({ title: "Already added", description: "This checklist already exists in this project. Open it from the list to edit." });
                      return;
                    }
                    try {
                      const built = buildMdaSupervisoryChecklist();
                      const { error } = await supabase.from("forms").insert({
                        name: built.name,
                        description: built.description,
                        questions: built.questions as any,
                        settings: built.settings as any,
                        project_id: currentProjectId,
                        created_by: user?.id,
                        status: "draft",
                      } as any);
                      if (error) throw error;
                      toast({ title: "Checklist created", description: "Open it from your forms list to fill, share, or edit." });
                      fetchForms(currentProjectId);
                    } catch (e: any) {
                      console.error("MDA checklist create error", e);
                      toast({ title: "Could not create", description: e?.message || "Please try again.", variant: "destructive" });
                    }
                  }}
                >
                  <Sparkles className="h-4 w-4 mr-1.5" /> Add fresh checklist
                </Button>
                </div>
                <div className="flex-1 min-w-0">
                <Button
                  size="sm"
                  className="w-full justify-center gap-1.5 whitespace-nowrap rounded-md border-none bg-blue-600 px-3 text-white shadow-sm hover:bg-blue-700"
                  onClick={() => {
                    if (!currentProjectId) {
                      toast({ title: "Select a project", description: "Choose a destination project first.", variant: "destructive" });
                      return;
                    }
                    setShowCopyMda(true);
                  }}
                >
                  <Copy className="h-4 w-4 shrink-0" />
                  <span className="truncate">Copy from another project</span>
                </Button>
                </div>
              </div>
              )}
            </div>
          )}


          {showFormsExplorer && (
          <div className="space-y-3">
            {/* Folder 1 — My Forms (custom forms) */}
            <div className="overflow-hidden rounded-2xl border border-border/60 bg-white shadow-sm">
              <button
                onClick={() => setOpenTopFolder((f) => (f === "custom" ? null : "custom"))}
                className="flex w-full items-center gap-3 p-4 text-left hover:bg-[#F4F6F8]/70 transition-colors"
              >
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#E3ECFB]">
                  {openTopFolder === "custom" ? <FolderOpen className="h-6 w-6 text-[#2F6FE6]" /> : <Folder className="h-6 w-6 text-[#2F6FE6]" />}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-display text-base font-bold text-foreground">My Forms</h3>
                  <p className="truncate text-xs text-muted-foreground">Custom forms your team built</p>
                </div>
                <span className="shrink-0 rounded-full bg-[#E3ECFB] px-2.5 py-1 text-xs font-semibold text-[#1656BA]">{visibleMyFormsCount}</span>
                <ChevronRight className={`h-5 w-5 shrink-0 text-muted-foreground transition-transform ${openTopFolder === "custom" ? "rotate-90" : ""}`} />
              </button>
              {openTopFolder === "custom" && (
                <div className="border-t border-border/60 divide-y divide-border/60">
                  {loading ? (
                    <div className="space-y-2 p-2">
                      {[1, 2, 3].map((i) => (
                        <div key={i} className="flex items-center gap-3 rounded-lg p-3">
                          <div className="h-11 w-11 rounded-lg bg-muted animate-pulse shrink-0" />
                          <div className="flex-1 space-y-2">
                            <div className="h-4 w-44 rounded bg-muted animate-pulse" />
                            <div className="h-3 w-56 rounded bg-muted animate-pulse" />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : visibleMyFormsCount === 0 && !(currentProjectIsSarmaan && isAdmin) ? (
                    <div className="flex h-40 flex-col items-center justify-center text-center px-4">
                      <FileText className="h-10 w-10 text-muted-foreground/50" />
                      <h3 className="mt-3 font-display text-base font-semibold text-foreground">No forms found</h3>
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
                {shouldShowSarmaanSupervisoryBlock && (
                  <div className="border-b border-border/60 bg-[#F8FAFD] p-3 sm:p-4">
                    {primarySarmaanSupervisoryForm ? (
                      <div className="grid gap-3 sm:mx-auto sm:max-w-4xl sm:grid-cols-2 lg:max-w-5xl">

                        {canSeeSarmaanChecklist && (
                        <button
                          type="button"
                          onClick={() => setSarmaanLaunchForm(primarySarmaanSupervisoryForm)}
                          className="group relative overflow-hidden rounded-2xl border p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                          style={{ borderColor: "#0A254033", background: "linear-gradient(135deg, #0A2540 0%, #123E68 58%, #12B5A5 140%)" }}
                        >
                          <div className="relative flex items-start gap-3">
                            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl" style={{ background: "#12B5A5" }}>
                              <ClipboardCheck className="h-6 w-6 text-white" strokeWidth={2.2} />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider" style={{ background: "rgba(18,181,165,0.18)", color: "#BFFAF2" }}>
                                SARMAAN Forms
                              </span>
                              <span className="mt-2 block whitespace-normal break-words text-[15px] font-extrabold leading-snug text-white">
                                {SARMAAN_SUPERVISORY_FORM_NAME}
                              </span>
                              <span className="mt-1 line-clamp-2 block text-xs text-white/80">
                                {primarySarmaanSupervisoryForm.description || SARMAAN_SUPERVISORY_DESC}
                              </span>
                            </span>
                            <ChevronRight className="mt-1 h-5 w-5 shrink-0 text-white/70 transition group-hover:translate-x-0.5" />
                          </div>
                        </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            if (canSeeSarmaanDashboard) setSarmaanDashForm(primarySarmaanSupervisoryForm);
                            else toast({ title: "Dashboard locked", description: "You don't have access to this dashboard. Ask an Owner to grant access.", variant: "destructive" });
                          }}
                          className="group relative overflow-hidden rounded-2xl border bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                          style={{ borderColor: "#12B5A54D" }}
                        >
                          <div className="flex items-start gap-3">
                            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl" style={{ background: "#E8F7F5" }}>
                              <BarChart3 className="h-6 w-6" style={{ color: "#0E8D80" }} strokeWidth={2.2} />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider" style={{ background: "#E8F7F5", color: "#0E8D80" }}>
                                Live Dashboard
                              </span>
                              <span className="mt-2 block whitespace-normal break-words text-[15px] font-extrabold leading-snug" style={{ color: "#0A2540" }}>
                                {SARMAAN_SUPERVISORY_DASH_NAME}
                              </span>
                              <span className="mt-1 line-clamp-2 block text-xs text-muted-foreground">
                                {SARMAAN_DASH_DESC}
                              </span>
                            </span>
                            <ChevronRight className="mt-1 h-5 w-5 shrink-0 text-muted-foreground/60 transition group-hover:translate-x-0.5" />
                          </div>
                        </button>
                        {sarmaanIsManager && (
                          <div className="sm:col-span-2 flex flex-wrap gap-2 pt-1">
                            <button
                              type="button"
                              onClick={() => setSarmaanChecklistAccessOpen(true)}
                              className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition hover:bg-muted"
                              style={{ borderColor: "#12B5A54D", color: "#0A2540" }}
                            >
                              <ShieldCheck className="h-3.5 w-3.5" style={{ color: "#0E8D80" }} /> Manage checklist access
                            </button>
                            <button
                              type="button"
                              onClick={() => setSarmaanDashAccessOpen(true)}
                              className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition hover:bg-muted"
                              style={{ borderColor: "#12B5A54D", color: "#0A2540" }}
                            >
                              <ShieldCheck className="h-3.5 w-3.5" style={{ color: "#0E8D80" }} /> Manage dashboard access
                            </button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="grid gap-3 sm:mx-auto sm:max-w-4xl sm:grid-cols-2 lg:max-w-5xl">
                        <button
                          type="button"
                          onClick={async () => {
                            const created = await createSarmaanSupervisoryTool();
                            if (created) setSarmaanLaunchForm(created);
                          }}
                          className="group relative overflow-hidden rounded-2xl border border-dashed p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                          style={{ borderColor: "#0A254066", background: "linear-gradient(135deg, #0A2540 0%, #123E68 58%, #12B5A5 140%)" }}
                        >
                          <div className="relative flex items-start gap-3">
                            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl" style={{ background: "#12B5A5" }}>
                              <ClipboardCheck className="h-6 w-6 text-white" strokeWidth={2.2} />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider" style={{ background: "rgba(18,181,165,0.18)", color: "#BFFAF2" }}>
                                Template not created · Tap to create
                              </span>

                              <span className="mt-2 block whitespace-normal break-words text-[15px] font-extrabold leading-snug text-white">
                                {SARMAAN_SUPERVISORY_FORM_NAME}
                              </span>
                              <span className="mt-1 line-clamp-2 block text-xs text-white/80">{SARMAAN_SUPERVISORY_DESC}</span>
                            </span>
                            <Sparkles className="mt-1 h-5 w-5 shrink-0 text-white/75" />
                          </div>
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            const created = await createSarmaanSupervisoryTool();
                            if (created) setSarmaanDashForm(created);
                          }}
                          className="group relative overflow-hidden rounded-2xl border border-dashed bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                          style={{ borderColor: "#12B5A566" }}
                        >
                          <div className="flex items-start gap-3">
                            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl" style={{ background: "#E8F7F5" }}>
                              <BarChart3 className="h-6 w-6" style={{ color: "#0E8D80" }} strokeWidth={2.2} />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider" style={{ background: "#E8F7F5", color: "#0E8D80" }}>
                                Template not created · Tap to create
                              </span>

                              <span className="mt-2 block whitespace-normal break-words text-[15px] font-extrabold leading-snug" style={{ color: "#0A2540" }}>
                                {SARMAAN_SUPERVISORY_DASH_NAME}
                              </span>
                              <span className="mt-1 line-clamp-2 block text-xs text-muted-foreground">{SARMAAN_DASH_DESC}</span>
                            </span>
                            <Sparkles className="mt-1 h-5 w-5 shrink-0" style={{ color: "#0E8D80" }} />
                          </div>
                        </button>
                      </div>
                    )}
                    {sarmaanIsManager && primarySarmaanSupervisoryForm && (
                      <>
                        <SarmaanChecklistAccessManager
                          open={sarmaanChecklistAccessOpen}
                          onOpenChange={setSarmaanChecklistAccessOpen}
                          formId={primarySarmaanSupervisoryForm.id}
                          formName={primarySarmaanSupervisoryForm.name}
                          projectId={primarySarmaanSupervisoryForm.project_id || currentProjectId}
                          sections={((primarySarmaanSupervisoryForm.groups as any[] | undefined) || []).map((g: any) => ({ id: g.id, label: g.label || g.name }))}
                        />
                        <DashboardAccessManager
                          open={sarmaanDashAccessOpen}
                          onOpenChange={setSarmaanDashAccessOpen}
                          dashboardId="sarmaan_supervisory"
                          projectId={primarySarmaanSupervisoryForm.project_id || currentProjectId}
                        />
                      </>
                    )}
                  </div>
                )}

                {shouldShowSarmaanAcsmBlock && (
                  <div className="border-b border-border/60 bg-[#F4FBF7] p-3 sm:p-4">
                    <div className="grid gap-3 sm:mx-auto sm:max-w-4xl sm:grid-cols-2 lg:max-w-5xl">
                      <div className="sm:col-span-2">
                        <button
                          type="button"
                          onClick={async () => {
                            if (!acsmForm) {
                              if (!sarmaanIsManager) { toast({ title: "Not available yet", description: "Ask an Owner to set up this checklist." }); return; }
                              const created = await createAcsmChecklist();
                              if (created) setAcsmLaunchOpen(true);
                            } else if (canSeeAcsmChecklist) {
                              setAcsmLaunchOpen(true);
                            } else {
                              toast({ title: "Checklist locked", description: "Ask an Owner to grant you access.", variant: "destructive" });
                            }
                          }}
                          className="group relative w-full overflow-hidden rounded-2xl border p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                          style={{ borderColor: "#22A55A33", background: "linear-gradient(135deg,#0A2540 0%,#1B7A46 60%,#22A55A 140%)" }}
                        >
                          <div className="relative flex items-start gap-3">
                            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl" style={{ background: "#22A55A" }}>
                              <ClipboardCheck className="h-6 w-6 text-white" strokeWidth={2.2} />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider" style={{ background: "rgba(34,165,90,0.22)", color: "#C9F7DC" }}>
                                {acsmForm ? "ACSM & MDA · Azithromycin 1–59m" : "Not created · Tap to create"}
                              </span>
                              <span className="mt-2 block whitespace-normal break-words text-[15px] font-extrabold leading-snug text-white">
                                {SARMAAN_ACSM_FORM_NAME}
                              </span>
                              <span className="mt-1 line-clamp-2 block text-xs text-white/80">{SARMAAN_ACSM_DESC}</span>
                            </span>
                            <ChevronRight className="mt-1 h-5 w-5 shrink-0 text-white/70 transition group-hover:translate-x-0.5" />
                          </div>
                        </button>
                        {acsmForm && canSeeAcsmDashboard && (
                          <div className="mt-2">
                            <button
                              type="button"
                              onClick={() => setAcsmDashOpen(true)}
                              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold text-white shadow-sm transition hover:brightness-105"
                              style={{ background: "linear-gradient(135deg,#0B5E30,#1E9E52)" }}
                            >
                              <LayoutGrid className="h-3.5 w-3.5" /> View ACSM & MDA Supervision Dashboard
                            </button>
                          </div>
                        )}

                        {sarmaanIsManager && acsmForm && (
                          <div className="mt-2 flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => setAcsmAccessOpen(true)}
                              className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition hover:bg-muted"
                              style={{ borderColor: "#22A55A4D", color: "#0A2540" }}
                            >
                              <ShieldCheck className="h-3.5 w-3.5" style={{ color: "#1B7A46" }} /> Manage checklist access
                            </button>
                            <button
                              type="button"
                              onClick={grantAcsmToAllMembers}
                              disabled={grantingAllAcsm}
                              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold text-white shadow-sm transition hover:brightness-105 disabled:opacity-60"
                              style={{ background: "linear-gradient(135deg,#1B7A46,#22A55A)" }}
                            >
                              <ShieldCheck className="h-3.5 w-3.5" /> {grantingAllAcsm ? "Granting…" : "Grant access to all members"}
                            </button>
                            <button
                              type="button"
                              onClick={() => setAcsmDashAccessOpen(true)}
                              className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition hover:bg-muted"
                              style={{ borderColor: "#0B5E304D", color: "#0A2540" }}
                            >
                              <LayoutGrid className="h-3.5 w-3.5" style={{ color: "#0B5E30" }} /> Manage dashboard access
                            </button>
                            <SarmaanChecklistAccessManager
                              open={acsmAccessOpen}
                              onOpenChange={setAcsmAccessOpen}
                              formId={acsmForm.id}
                              formName={acsmForm.name}
                              projectId={acsmForm.project_id || currentProjectId}
                              sections={ACSM_SECTIONS}
                              wholeChecklist
                            />
                            <DashboardAccessManager
                              open={acsmDashAccessOpen}
                              onOpenChange={setAcsmDashAccessOpen}
                              dashboardId="sarmaan_acsm"
                              projectId={acsmForm.project_id || currentProjectId}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {filteredNonSarmaanForms.map((form, idx) => {
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

                  // Bloomberg markers launch their dedicated custom UI instead of the generic FormFiller.
                  const bbgKind = (form.settings as any)?.bloomberg_kind as ("form" | "dashboard" | undefined);
                  if (bbgKind === "form" || bbgKind === "dashboard") {
                    const isDash = bbgKind === "dashboard";
                    const BbgIcon = isDash ? BarChart3 : ClipboardCheck;
                    return (
                      <div
                        key={form.id}
                        className="group flex items-center gap-3 border-l-4 p-3 sm:p-4 hover:bg-[#F4F6F8]/70 transition-colors"
                        style={{ borderLeftColor: "#2563eb" }}
                      >
                        <button
                          onClick={() => (isDash ? setShowBloombergDash(true) : setShowBloombergForm(true))}
                          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#E3ECFB]"
                          aria-label={`Open ${form.name}`}
                        >
                          <BbgIcon className="h-5 w-5 text-[#2563eb]" strokeWidth={2} />
                        </button>
                        <button
                          onClick={() => (isDash ? setShowBloombergDash(true) : setShowBloombergForm(true))}
                          className="min-w-0 flex-1 text-left"
                        >
                          <h4 className="truncate text-[15px] font-bold text-[#2563eb]">{form.name}</h4>
                          <p className="mt-0.5 truncate text-xs sm:text-sm text-muted-foreground">{form.description || "Bloomberg School Eye Health tool"}</p>
                        </button>
                        {!isDash && (
                          <span
                            className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${
                              form.status === "active"
                                ? "bg-[#E2F5EC] text-[#22A55A]"
                                : "bg-[#E3ECFB] text-[#2F6FE6]"
                            }`}
                          >
                            {form.status === "active" ? "Finalized" : "Draft"}
                          </span>
                        )}
                        {isAdmin && !isDash && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-[#2F6FE6]">
                                <ChevronRight className="h-5 w-5" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {form.status !== "active" && (
                                <DropdownMenuItem onClick={() => handleUpdateFormStatus(form.id, "active")}>
                                  <CheckCircle className="mr-2 h-4 w-4 text-green-600" />
                                  Set Active (Finalize)
                                </DropdownMenuItem>
                              )}
                              {form.status !== "draft" && (
                                <DropdownMenuItem onClick={() => handleUpdateFormStatus(form.id, "draft")}>
                                  <FileEdit className="mr-2 h-4 w-4 text-yellow-600" />
                                  Set Draft
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem onClick={() => handleDownloadXlsForm(form)}>
                                <Download className="mr-2 h-4 w-4 text-[#2F6FE6]" />
                                Download XLSForm
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => setFormToDelete(form)} className="text-destructive">
                                <Trash2 className="mr-2 h-4 w-4" />
                                Remove from project
                              </DropdownMenuItem>

                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </div>
                    );
                  }

                  // See Clear markers launch their dedicated custom UI.
                  const scKind = (form.settings as any)?.seeclear_kind as ("form" | "dashboard" | undefined);
                  if (scKind === "form" || scKind === "dashboard") {
                    const isDash = scKind === "dashboard";
                    const ScIcon = isDash ? BarChart3 : ClipboardCheck;
                    return (
                      <div
                        key={form.id}
                        className="group flex items-center gap-3 border-l-4 p-3 sm:p-4 hover:bg-[#F4F6F8]/70 transition-colors"
                        style={{ borderLeftColor: "#14b8a6" }}
                      >
                        <button
                          onClick={() => (isDash ? setShowSeeClearDash(true) : setShowSeeClearForm(true))}
                          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#DCF3F0]"
                          aria-label={`Open ${form.name}`}
                        >
                          <ScIcon className="h-5 w-5 text-[#14b8a6]" strokeWidth={2} />
                        </button>
                        <button
                          onClick={() => (isDash ? setShowSeeClearDash(true) : setShowSeeClearForm(true))}
                          className="min-w-0 flex-1 text-left"
                        >
                          <h4 className="truncate text-[15px] font-bold text-[#0f766e]">{form.name}</h4>
                          <p className="mt-0.5 truncate text-xs sm:text-sm text-muted-foreground">{form.description || "See Clear eye health monitoring tool"}</p>
                        </button>
                        {!isDash && (
                          <span
                            className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${
                              form.status === "active"
                                ? "bg-[#E2F5EC] text-[#22A55A]"
                                : "bg-[#E3ECFB] text-[#2F6FE6]"
                            }`}
                          >
                            {form.status === "active" ? "Finalized" : "Draft"}
                          </span>
                        )}
                        {isAdmin && !isDash && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-[#0f766e]">
                                <ChevronRight className="h-5 w-5" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {form.status !== "active" && (
                                <DropdownMenuItem onClick={() => handleUpdateFormStatus(form.id, "active")}>
                                  <CheckCircle className="mr-2 h-4 w-4 text-green-600" />
                                  Set Active (Finalize)
                                </DropdownMenuItem>
                              )}
                              {form.status !== "draft" && (
                                <DropdownMenuItem onClick={() => handleUpdateFormStatus(form.id, "draft")}>
                                  <FileEdit className="mr-2 h-4 w-4 text-yellow-600" />
                                  Set Draft
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => setFormToDelete(form)} className="text-destructive">
                                <Trash2 className="mr-2 h-4 w-4" />
                                Remove from project
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </div>
                    );
                  }

                  // ACSM markers launch their dedicated custom UI.
                  const acsmKind = (form.settings as any)?.acsm_kind as ("form" | "dashboard" | undefined);
                  if (acsmKind === "form" || acsmKind === "dashboard") {
                    const isDash = acsmKind === "dashboard";
                    const AcsmIcon = isDash ? BarChart3 : ClipboardCheck;
                    return (
                      <div
                        key={form.id}
                        className="group flex items-center gap-3 border-l-4 p-3 sm:p-4 hover:bg-[#F4F6F8]/70 transition-colors"
                        style={{ borderLeftColor: "#0891b2" }}
                      >
                        <button
                          onClick={() => (isDash ? setShowAcsmDash(true) : setShowAcsmForm(true))}
                          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#DCF0F8]"
                          aria-label={`Open ${form.name}`}
                        >
                          <AcsmIcon className="h-5 w-5 text-[#0891b2]" strokeWidth={2} />
                        </button>
                        <button
                          onClick={() => (isDash ? setShowAcsmDash(true) : setShowAcsmForm(true))}
                          className="min-w-0 flex-1 text-left"
                        >
                          <h4 className="truncate text-[15px] font-bold text-[#0891b2]">{form.name}</h4>
                          <p className="mt-0.5 truncate text-xs sm:text-sm text-muted-foreground">{form.description || "ACSM indicator tracking tool"}</p>
                        </button>
                        {!isDash && (
                          <span className="shrink-0 rounded-full px-3 py-1 text-xs font-semibold bg-[#E2F5EC] text-[#22A55A]">
                            Finalized
                          </span>
                        )}
                        {isAdmin && !isDash && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-[#0891b2]">
                                <ChevronRight className="h-5 w-5" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => setFormToDelete(form)} className="text-destructive">
                                <Trash2 className="mr-2 h-4 w-4" />
                                Remove from project
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </div>
                    );
                  }

                  // SBC markers launch their dedicated custom UI.
                  const sbcKind = (form.settings as any)?.sbc_kind as ("form" | "dashboard" | undefined);
                  if (sbcKind === "form" || sbcKind === "dashboard") {
                    const isDash = sbcKind === "dashboard";
                    const SbcIcon = isDash ? BarChart3 : ClipboardCheck;
                    return (
                      <div
                        key={form.id}
                        className="group flex items-center gap-3 border-l-4 p-3 sm:p-4 hover:bg-[#F4F6F8]/70 transition-colors"
                        style={{ borderLeftColor: "#0891b2" }}
                      >
                        <button
                          onClick={() => (isDash ? setShowSbcDash(true) : setShowSbcForm(true))}
                          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#DCF0F8]"
                          aria-label={`Open ${form.name}`}
                        >
                          <SbcIcon className="h-5 w-5 text-[#0891b2]" strokeWidth={2} />
                        </button>
                        <button
                          onClick={() => (isDash ? setShowSbcDash(true) : setShowSbcForm(true))}
                          className="min-w-0 flex-1 text-left"
                        >
                          <h4 className="truncate text-[15px] font-bold text-[#0891b2]">{form.name}</h4>
                          <p className="mt-0.5 truncate text-xs sm:text-sm text-muted-foreground">{form.description || "SBC indicator tracking tool"}</p>
                        </button>
                        {!isDash && (
                          <span className="shrink-0 rounded-full px-3 py-1 text-xs font-semibold bg-[#E2F5EC] text-[#22A55A]">
                            Finalized
                          </span>
                        )}
                        {isAdmin && !isDash && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-[#0891b2]">
                                <ChevronRight className="h-5 w-5" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => setFormToDelete(form)} className="text-destructive">
                                <Trash2 className="mr-2 h-4 w-4" />
                                Remove from project
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </div>
                    );
                  }

                  // IRF (LGA ACSM Focal Person) markers launch their dedicated UI.
                  const irfKind = (form.settings as any)?.irf_kind as ("form" | "dashboard" | undefined);
                  if (irfKind === "form" || irfKind === "dashboard") {
                    const isDash = irfKind === "dashboard";
                    const IrfIcon = isDash ? ChartNoAxesCombined : ClipboardPenLine;
                    const displayName = isDash ? IRF_DASH_NAME : IRF_FORM_NAME;
                    const accent = isDash ? "#0284c7" : "#e11d48";
                    return (
                      <div
                        key={form.id}
                        className="group flex items-center gap-3 border-l-4 p-3 transition-colors hover:bg-[#F4F6F8]/70 sm:p-4"
                        style={{ borderLeftColor: accent }}
                      >
                        <button
                          onClick={() => (isDash ? setShowIrfDash(true) : setShowIrfForm(true))}
                          className={isDash
                            ? "flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-100 via-sky-100 to-indigo-100 shadow-sm ring-1 ring-sky-200/70"
                            : "flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-rose-100 via-amber-50 to-emerald-100 shadow-sm ring-1 ring-rose-200/70"}
                          aria-label={`Open ${displayName}`}
                        >
                          <IrfIcon className="h-6 w-6" style={{ color: accent }} strokeWidth={2.2} />
                        </button>
                        <button
                          onClick={() => (isDash ? setShowIrfDash(true) : setShowIrfForm(true))}
                          className="min-w-0 flex-1 text-left"
                        >
                          <h4 className="whitespace-normal break-words text-[15px] font-bold leading-snug" style={{ color: accent }}>{displayName}</h4>
                          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground sm:text-sm">{form.description || "SARMAAN ACSM indicator reporting and executive tracking tool"}</p>
                        </button>
                        {!isDash && (
                          <span className="shrink-0 rounded-full px-3 py-1 text-xs font-semibold bg-[#E2F5EC] text-[#22A55A]">
                            Finalized
                          </span>
                        )}
                        {isAdmin && !isDash && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" style={{ color: accent }}>
                                <ChevronRight className="h-5 w-5" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => setFormToDelete(form)} className="text-destructive">
                                <Trash2 className="mr-2 h-4 w-4" />
                                Remove from project
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </div>
                    );
                  }







                  // Special Form Studio forms with a linked dashboard get a dedicated
                  // "Monitor" row so submissions can be watched live immediately.
                  const studioSettings = form.settings as any;
                  const isStudioForm = studioSettings?.studio === true;
                  const studioDashOn = isStudioForm && studioSettings?.dashboardEnabled === true;
                  const studioAccent = studioSettings?.dashboardConfig?.accent || "#6366f1";

                  // Shared accent color for this form's parent project — same
                  // palette used by the Project dropdown above, so the trigger
                  // border/text + form name + row left-border are all in sync.
                  const accent = getProjectAccent(form.project_id, projects, idx);
                  const isMdaChecklistForm = isMdaChecklistLike({ settings: form.settings, formName: form.name, groups: form.groups });
                  const isSarmaanSupervisory = isSupervisoryLearningForm({ settings: form.settings, name: form.name });

                  return (
                    <div key={form.id} className="contents">
                      {isSarmaanSupervisory && (
                        <div
                          className="group relative overflow-hidden rounded-2xl border p-4 sm:p-5"
                          style={{
                            borderColor: "#0A254033",
                            background: "linear-gradient(120% 140% at 100% 0%, #0E2E52 0%, #0A2540 55%, #071A30 100%)",
                          }}
                        >
                          <div
                            aria-hidden
                            className="pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full opacity-30"
                            style={{ background: "radial-gradient(circle, #12B5A566 0%, transparent 65%)" }}
                          />
                          <div className="relative flex flex-wrap items-center gap-3">
                            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl" style={{ background: "#12B5A5" }}>
                              <ClipboardList className="h-6 w-6 text-white" strokeWidth={2.2} />
                            </div>
                            <div className="min-w-0 flex-1">
                              <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider" style={{ background: "#12B5A5", color: "#071A30" }}>
                                SARMAAN ACSM
                              </span>
                              <h4 className="mt-1 truncate text-[16px] font-extrabold text-white">Integrated Supervisory Checklist</h4>
                              <p className="truncate text-xs text-white/80">12 guided modules · auto-scored /80 · live learning dashboard</p>
                            </div>
                          </div>
                          <div className="relative mt-4 flex flex-wrap gap-2">
                            <button
                              onClick={() => setSarmaanLaunchForm(form)}
                              className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold text-white shadow-md transition active:scale-[0.98]"
                              style={{ background: "#12B5A5" }}
                            >
                              <ClipboardCheck className="h-4 w-4" /> Begin supervision
                            </button>
                            <button
                              onClick={() => setSarmaanDashForm(form)}
                              className="inline-flex items-center gap-2 rounded-xl border-2 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-white/10"
                              style={{ borderColor: "rgba(255,255,255,0.4)" }}
                            >
                              <BarChart3 className="h-4 w-4" /> Supervision dashboard
                            </button>
                          </div>
                        </div>
                      )}
                      {isMdaChecklistForm && canSeeMdaDashboard && (
                        <div
                          className="group flex items-center gap-3 border-l-4 p-3 sm:p-4 hover:bg-[#F4F6F8]/70 transition-colors"
                          style={{ borderLeftColor: "#0d9488" }}
                        >
                          <button
                            onClick={() => setMdaDashboardForm(form)}
                            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#DCF3F0]"
                            aria-label={`Open ${form.name} dashboard`}
                          >
                            <BarChart3 className="h-5 w-5 text-[#0d9488]" strokeWidth={2} />
                          </button>
                          <button
                            onClick={() => setMdaDashboardForm(form)}
                            className="min-w-0 flex-1 text-left"
                          >
                            <h4 className="truncate text-[15px] font-bold text-[#0f766e]">Integrated MDA Supervisory Dashboard</h4>
                            <p className="mt-0.5 truncate text-xs sm:text-sm text-muted-foreground">
                              Realtime checklist, follow-up, GPS map and field-worker insights
                            </p>
                          </button>
                          <span className="shrink-0 rounded-full bg-[#DCF3F0] px-3 py-1 text-xs font-semibold text-[#0f766e]">
                            Dashboard
                          </span>
                          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-[#0f766e]" onClick={() => setMdaDashboardForm(form)}>
                            <ChevronRight className="h-5 w-5" />
                          </Button>
                        </div>
                      )}
                    <div
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
                              <DropdownMenuItem onClick={() => setAccessManagerForm(form)}>
                                <ShieldCheck className="mr-2 h-4 w-4 text-primary" />
                                Manage Access
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => setDashboardForm(form)}>
                                <LayoutDashboard className="mr-2 h-4 w-4" />
                                Custom Dashboards
                              </DropdownMenuItem>
                              {isMdaChecklistForm && canSeeMdaDashboard && (
                                <DropdownMenuItem onClick={() => setMdaDashboardForm(form)}>
                                  <BarChart3 className="mr-2 h-4 w-4 text-emerald-600" />
                                  MDA Supervisory Dashboard
                                </DropdownMenuItem>
                              )}
                              {studioDashOn && (
                                <DropdownMenuItem onClick={() => setSpecialDashForm(form)}>
                                  <LayoutDashboard className="mr-2 h-4 w-4" style={{ color: studioAccent }} />
                                  Live Special Dashboard
                                </DropdownMenuItem>
                              )}
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
                          {canBulk && (
                            <DropdownMenuItem onClick={() => setBulkForm(form)}>
                              <FileSpreadsheet className="mr-2 h-4 w-4 text-emerald-600" />
                              Bulk Export / Import
                            </DropdownMenuItem>
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
                  );
                })}
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Assigned Standard Forms — flat, folder-free beautiful grid with
                search, category filters and a grid/folder view toggle.
                Shown to users who have specific standard forms assigned to them. */}
            {assignedFormCards.length > 0 && (
              <div className="overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-br from-[#F7F9FE] to-white shadow-sm">
                <div className="flex items-center gap-3 p-4 sm:p-5 border-b border-border/50">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#15803D] via-[#2F6FE6] to-[#7C5CFF] shadow-sm">
                    <Sparkles className="h-5 w-5 text-white" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-display text-base sm:text-lg font-bold text-foreground">Your Forms</h3>
                    <p className="truncate text-xs sm:text-sm text-muted-foreground">Forms assigned to you — tap any to begin</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-[#E3ECFB] px-3 py-1 text-xs font-semibold text-[#1656BA]">
                    {assignedFormCards.length}
                  </span>
                </div>

                {/* Controls: search + view toggle */}
                <div className="flex flex-col gap-3 p-3 sm:p-4 sm:flex-row sm:items-center">
                  <div className="relative flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={yourFormsSearch}
                      onChange={(e) => setYourFormsSearch(e.target.value)}
                      placeholder="Search Safeguarding, Programme Activity, Microplanning…"
                      className="pl-9 rounded-xl bg-white"
                    />
                  </div>
                  <div className="inline-flex shrink-0 items-center rounded-xl border border-border/60 bg-white p-0.5">
                    <button
                      type="button"
                      onClick={() => setYourFormsView("grid")}
                      aria-pressed={yourFormsView === "grid"}
                      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                        yourFormsView === "grid" ? "bg-[#2F6FE6] text-white shadow-sm" : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <LayoutGrid className="h-4 w-4" /> Grid
                    </button>
                    <button
                      type="button"
                      onClick={() => setYourFormsView("folders")}
                      aria-pressed={yourFormsView === "folders"}
                      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                        yourFormsView === "folders" ? "bg-[#2F6FE6] text-white shadow-sm" : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <Rows3 className="h-4 w-4" /> Folders
                    </button>
                  </div>
                </div>

                {/* Category filter chips */}
                {yourFormsGroups.length > 1 && (
                  <div className="flex flex-wrap gap-2 px-3 pb-1 sm:px-4">
                    <button
                      type="button"
                      onClick={() => setYourFormsGroup("all")}
                      className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                        yourFormsGroup === "all" ? "bg-[#2F6FE6] text-white" : "bg-[#EEF2F7] text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      All
                    </button>
                    {yourFormsGroups.map((g) => (
                      <button
                        key={g}
                        type="button"
                        onClick={() => setYourFormsGroup(g)}
                        className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                          yourFormsGroup === g ? "bg-[#2F6FE6] text-white" : "bg-[#EEF2F7] text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {g}
                      </button>
                    ))}
                  </div>
                )}

                {/* Body — grid or folder view */}
                {filteredYourForms.length === 0 ? (
                  <div className="flex h-32 flex-col items-center justify-center text-center px-4">
                    <Search className="h-8 w-8 text-muted-foreground/40" />
                    <p className="mt-2 text-sm text-muted-foreground">No forms match your search.</p>
                  </div>
                ) : yourFormsView === "grid" ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 p-3 sm:p-4">
                    {filteredYourForms.map((c) => renderYourFormCard(c))}
                  </div>
                ) : (
                  <div className="space-y-2 p-3 sm:p-4">
                    {filteredYourFormsByGroup.map(([group, cards]) => {
                      const open = openYourGroup === group || filteredYourFormsByGroup.length === 1;
                      return (
                        <div key={group} className="overflow-hidden rounded-2xl border border-border/60 bg-white">
                          <button
                            type="button"
                            onClick={() => setOpenYourGroup((g) => (g === group ? null : group))}
                            className="flex w-full items-center gap-3 p-3 text-left hover:bg-[#F4F6F8]/70 transition-colors"
                          >
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#E3ECFB]">
                              {open ? <FolderOpen className="h-5 w-5 text-[#2F6FE6]" /> : <Folder className="h-5 w-5 text-[#2F6FE6]" />}
                            </div>
                            <div className="min-w-0 flex-1">
                              <h4 className="truncate font-display text-sm font-bold text-foreground">{group}</h4>
                            </div>
                            <span className="shrink-0 rounded-full bg-[#E3ECFB] px-2.5 py-0.5 text-xs font-semibold text-[#1656BA]">{cards.length}</span>
                            <ChevronRight className={`h-5 w-5 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`} />
                          </button>
                          {open && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 border-t border-border/60 p-3">
                              {cards.map((c) => renderYourFormCard(c))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}


            {/* Folder 2 — Standard Forms (admins see the full folder explorer) */}
            {!isAdhoc && !standardRestricted && (
            <div className="overflow-hidden rounded-2xl border border-border/60 bg-white shadow-sm">
              <button
                onClick={() => setOpenTopFolder((f) => (f === "standard" ? null : "standard"))}
                className="flex w-full items-center gap-3 p-4 text-left hover:bg-[#F4F6F8]/70 transition-colors"
              >
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#EDE7FE]">
                  {openTopFolder === "standard" ? <FolderOpen className="h-6 w-6 text-[#7C5CFF]" /> : <Folder className="h-6 w-6 text-[#7C5CFF]" />}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-display text-base font-bold text-foreground">Standard Forms</h3>
                  <p className="truncate text-xs text-muted-foreground">Validated system default tools</p>
                </div>
                <ChevronRight className={`h-5 w-5 shrink-0 text-muted-foreground transition-transform ${openTopFolder === "standard" ? "rotate-90" : ""}`} />
              </button>
              {openTopFolder === "standard" && (
                <div className="border-t border-border/60">


              {/* Admin-only "Add to project" creation tools — never shown to adhoc users */}
              {!isAdhoc && (<>
              <div className="px-3 sm:px-4 py-3 border-t border-border/60">
                <div className="rounded-xl border border-emerald-200 bg-gradient-to-br from-emerald-50 via-emerald-50/60 to-transparent p-3 sm:p-4">
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-emerald-100 shrink-0">
                      <ClipboardCheck className="h-5 w-5 text-emerald-700" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-foreground">{MDA_CHECKLIST_NAME}</p>
                      <p className="text-xs text-muted-foreground">12-section NTD supervision tool · cascade selects · auto-scoring · linked Coverage Evaluation 3D. Fully editable in the Form Builder.</p>
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <Button
                      size="sm"
                      className="w-full justify-center"
                      onClick={async () => {
                        if (!currentProjectId) {
                          toast({ title: "Select a project", description: "Choose a project before creating the checklist.", variant: "destructive" });
                          return;
                        }
                        const existing = forms.find((f) => f.name === MDA_CHECKLIST_NAME);
                        if (existing) {
                          toast({ title: "Already added", description: "This checklist already exists in this project. Open it from the list above to edit." });
                          return;
                        }
                        try {
                          const built = buildMdaSupervisoryChecklist();
                          const { error } = await supabase.from("forms").insert({
                            name: built.name,
                            description: built.description,
                            questions: built.questions as any,
                            settings: built.settings as any,
                            project_id: currentProjectId,
                            created_by: user?.id,
                            status: "draft",
                          } as any);
                          if (error) throw error;
                          toast({ title: "Checklist created", description: "Open it from your forms list to fill, share, or edit in the Form Builder." });
                          fetchForms(currentProjectId);
                        } catch (e: any) {
                          console.error("MDA checklist create error", e);
                          toast({ title: "Could not create", description: e?.message || "Please try again.", variant: "destructive" });
                        }
                      }}
                    >
                      <Sparkles className="h-4 w-4 mr-1.5" /> Add fresh checklist
                    </Button>
                    <Button
                      size="sm"
                      className="w-full justify-center border-emerald-300 bg-emerald-600 text-white shadow-sm hover:bg-emerald-700"
                      onClick={() => {
                        if (!currentProjectId) {
                          toast({ title: "Select a project", description: "Choose a destination project first.", variant: "destructive" });
                          return;
                        }
                        setShowCopyMda(true);
                      }}
                    >
                      <Copy className="h-4 w-4 mr-1.5" /> Copy from another project
                    </Button>
                  </div>
                  <p className="mt-2 text-[11px] text-emerald-800/80">
                    Copy the complete checklist <span className="font-medium">and its linked dashboard</span> from another project — name clashes are resolved automatically.
                  </p>
                </div>
              </div>


              {/* Bloomberg School Enrolment Validation — addable to any project like the MDA checklist */}
              <div className="px-3 sm:px-4 py-3 border-t border-border/60">
                <div className="flex items-center justify-between gap-3 rounded-xl border border-[#bcd0f5] bg-gradient-to-r from-[#eaf1fd] to-transparent p-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="p-2 rounded-lg bg-[#dbe8fc] shrink-0">
                      <ClipboardCheck className="h-5 w-5 text-[#2563eb]" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">Bloomberg School Enrolment Validation</p>
                      <p className="text-xs text-muted-foreground">Independent 4-step school enrolment validation form + admin analytics dashboard (baseline vs validated, discrepancies & map).</p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    className="shrink-0"
                    onClick={async () => {
                      if (!currentProjectId) {
                        toast({ title: "Select a project", description: "Choose a project before adding the Bloomberg tools.", variant: "destructive" });
                        return;
                      }
                      if (forms.find((f) => (f.settings as any)?.bloomberg_kind)) {
                        toast({ title: "Already added", description: "The Bloomberg tools already exist in this project. Open them from the list above." });
                        return;
                      }
                      try {
                        const { error } = await supabase.from("forms").insert([
                          {
                            name: BLOOMBERG_FORM_NAME,
                            description: BLOOMBERG_FORM_DESC,
                            questions: [] as any,
                            settings: { bloomberg_kind: "form" } as any,
                            project_id: currentProjectId,
                            created_by: user?.id,
                            status: "active",
                          },
                          {
                            name: BLOOMBERG_DASH_NAME,
                            description: BLOOMBERG_DASH_DESC,
                            questions: [] as any,
                            settings: { bloomberg_kind: "dashboard" } as any,
                            project_id: currentProjectId,
                            created_by: user?.id,
                            status: "active",
                          },
                        ] as any);
                        if (error) throw error;
                        toast({ title: "Added to project", description: "Open the validation form and dashboard from your forms list above." });
                        fetchForms(currentProjectId);
                      } catch (e: any) {
                        console.error("Bloomberg add error", e);
                        toast({ title: "Could not add", description: e?.message || "Please try again.", variant: "destructive" });
                      }
                    }}
                  >
                    <Sparkles className="h-4 w-4 mr-1.5" /> Add to project
                  </Button>
                </div>
              </div>

              {/* See Clear — Eye Health Facility Monitoring — addable to any project */}
              <div className="px-3 sm:px-4 py-3 border-t border-border/60">
                <div className="flex items-center justify-between gap-3 rounded-xl border border-[#a7e0d8] bg-gradient-to-r from-[#e6f7f4] to-transparent p-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="p-2 rounded-lg bg-[#cdeee8] shrink-0">
                      <ClipboardCheck className="h-5 w-5 text-[#14b8a6]" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">See Clear — Eye Health Facility Monitoring</p>
                      <p className="text-xs text-muted-foreground">Monitoring & supervision checklist + facility readiness dashboard (equipment, referrals, data quality & map) with data simulation.</p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    className="shrink-0"
                    onClick={async () => {
                      if (!currentProjectId) {
                        toast({ title: "Select a project", description: "Choose a project before adding the See Clear tools.", variant: "destructive" });
                        return;
                      }
                      if (forms.find((f) => (f.settings as any)?.seeclear_kind)) {
                        toast({ title: "Already added", description: "The See Clear tools already exist in this project. Open them from the list above." });
                        return;
                      }
                      try {
                        const { error } = await supabase.from("forms").insert([
                          {
                            name: SEECLEAR_FORM_NAME,
                            description: SEECLEAR_FORM_DESC,
                            questions: [] as any,
                            settings: { seeclear_kind: "form" } as any,
                            project_id: currentProjectId,
                            created_by: user?.id,
                            status: "active",
                          },
                          {
                            name: SEECLEAR_DASH_NAME,
                            description: SEECLEAR_DASH_DESC,
                            questions: [] as any,
                            settings: { seeclear_kind: "dashboard" } as any,
                            project_id: currentProjectId,
                            created_by: user?.id,
                            status: "active",
                          },
                        ] as any);
                        if (error) throw error;
                        toast({ title: "Added to project", description: "Open the monitoring checklist and dashboard from your forms list above." });
                        fetchForms(currentProjectId);
                      } catch (e: any) {
                        console.error("See Clear add error", e);
                        toast({ title: "Could not add", description: e?.message || "Please try again.", variant: "destructive" });
                      }
                    }}
                  >
                    <Sparkles className="h-4 w-4 mr-1.5" /> Add to project
                  </Button>
                </div>
              </div>

              {/* ACSM — Advocacy, Communication & Social Mobilization — addable to any project */}
              <div className="px-3 sm:px-4 py-3 border-t border-border/60">
                <div className="flex items-center justify-between gap-3 rounded-xl border border-[#a5d8ee] bg-gradient-to-r from-[#e6f4fb] to-transparent p-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="p-2 rounded-lg bg-[#cdebf7] shrink-0">
                      <BarChart3 className="h-5 w-5 text-[#0891b2]" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">ACSM Indicator Tracking (Advocacy)</p>
                      <p className="text-xs text-muted-foreground">Indicator reporting form + color-graded analytics dashboard for Advocacy, Communication & Social Mobilization indicators.</p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    className="shrink-0"
                    onClick={async () => {
                      if (!currentProjectId) {
                        toast({ title: "Select a project", description: "Choose a project before adding the ACSM tools.", variant: "destructive" });
                        return;
                      }
                      if (forms.find((f) => (f.settings as any)?.acsm_kind)) {
                        toast({ title: "Already added", description: "The ACSM tools already exist in this project. Open them from the list above." });
                        return;
                      }
                      try {
                        const { error } = await supabase.from("forms").insert([
                          {
                            name: ACSM_FORM_NAME,
                            description: ACSM_FORM_DESC,
                            questions: [] as any,
                            settings: { acsm_kind: "form" } as any,
                            project_id: currentProjectId,
                            created_by: user?.id,
                            status: "active",
                          },
                          {
                            name: ACSM_DASH_NAME,
                            description: ACSM_DASH_DESC,
                            questions: [] as any,
                            settings: { acsm_kind: "dashboard" } as any,
                            project_id: currentProjectId,
                            created_by: user?.id,
                            status: "active",
                          },
                        ] as any);
                        if (error) throw error;
                        toast({ title: "Added to project", description: "Open the reporting form and dashboard from your forms list above." });
                        fetchForms(currentProjectId);
                      } catch (e: any) {
                        console.error("ACSM add error", e);
                        toast({ title: "Could not add", description: e?.message || "Please try again.", variant: "destructive" });
                      }
                    }}
                  >
                    <Sparkles className="h-4 w-4 mr-1.5" /> Add to project
                  </Button>
                </div>
              </div>

              {/* SBC — Social & Behaviour Change — addable to any project */}
              <div className="px-3 sm:px-4 py-3 border-t border-border/60">
                <div className="flex items-center justify-between gap-3 rounded-xl border border-[#a5d8ee] bg-gradient-to-r from-[#e6f4fb] to-transparent p-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="p-2 rounded-lg bg-[#cdebf7] shrink-0">
                      <BarChart3 className="h-5 w-5 text-[#0891b2]" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">Social &amp; Behaviour Change (SBC) Tracking</p>
                      <p className="text-xs text-muted-foreground">Indicator reporting form + color-graded analytics dashboard for exposure, knowledge, attitudes, norms, self-efficacy &amp; behaviour adoption indicators.</p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    className="shrink-0"
                    onClick={async () => {
                      if (!currentProjectId) {
                        toast({ title: "Select a project", description: "Choose a project before adding the SBC tools.", variant: "destructive" });
                        return;
                      }
                      if (forms.find((f) => (f.settings as any)?.sbc_kind)) {
                        toast({ title: "Already added", description: "The SBC tools already exist in this project. Open them from the list above." });
                        return;
                      }
                      try {
                        const { error } = await supabase.from("forms").insert([
                          {
                            name: SBC_FORM_NAME,
                            description: SBC_FORM_DESC,
                            questions: [] as any,
                            settings: { sbc_kind: "form" } as any,
                            project_id: currentProjectId,
                            created_by: user?.id,
                            status: "active",
                          },
                          {
                            name: SBC_DASH_NAME,
                            description: SBC_DASH_DESC,
                            questions: [] as any,
                            settings: { sbc_kind: "dashboard" } as any,
                            project_id: currentProjectId,
                            created_by: user?.id,
                            status: "active",
                          },
                        ] as any);
                        if (error) throw error;
                        toast({ title: "Added to project", description: "Open the reporting form and dashboard from your forms list above." });
                        fetchForms(currentProjectId);
                      } catch (e: any) {
                        console.error("SBC add error", e);
                        toast({ title: "Could not add", description: e?.message || "Please try again.", variant: "destructive" });
                      }
                    }}
                  >
                    <Sparkles className="h-4 w-4 mr-1.5" /> Add to project
                  </Button>
                </div>
              </div>

              {/* SARMAAN ACSM Indicator Reporting Form (SAIRF) — addable to any project */}
              <div className="px-3 sm:px-4 py-3 border-t border-border/60">
                <div className="flex items-center justify-between gap-3 rounded-xl border border-rose-200 bg-gradient-to-r from-rose-50 via-amber-50 to-sky-50 p-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="rounded-2xl bg-gradient-to-br from-rose-100 via-amber-50 to-emerald-100 p-2.5 shadow-sm ring-1 ring-rose-200/70 shrink-0">
                      <ClipboardPenLine className="h-5 w-5 text-rose-600" />
                    </div>
                    <div className="min-w-0">
                      <p className="whitespace-normal break-words text-sm font-semibold leading-snug text-foreground">{IRF_FORM_NAME}</p>
                      <p className="text-xs text-muted-foreground">Sectioned indicator reporting forms + executive dashboard for advocacy, social mobilization, awareness creation &amp; non-compliance resolution.</p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    className="shrink-0"
                    onClick={async () => {
                      if (!currentProjectId) {
                        toast({ title: "Select a project", description: "Choose a project before adding the IRF tools.", variant: "destructive" });
                        return;
                      }
                      if (forms.find((f) => (f.settings as any)?.irf_kind)) {
                        toast({ title: "Already added", description: "The SARMAAN ACSM (SAIRF) tools already exist in this project. Open them from the list above." });
                        return;
                      }
                      try {
                        const { error } = await supabase.from("forms").insert([
                          {
                            name: IRF_FORM_NAME,
                            description: IRF_FORM_DESC,
                            questions: [] as any,
                            settings: { irf_kind: "form" } as any,
                            project_id: currentProjectId,
                            created_by: user?.id,
                            status: "active",
                          },
                          {
                            name: IRF_DASH_NAME,
                            description: IRF_DASH_DESC,
                            questions: [] as any,
                            settings: { irf_kind: "dashboard" } as any,
                            project_id: currentProjectId,
                            created_by: user?.id,
                            status: "active",
                          },
                        ] as any);
                        if (error) throw error;
                        toast({ title: "Added to project", description: "Open the reporting form and dashboard from your forms list above." });
                        fetchForms(currentProjectId);
                      } catch (e: any) {
                        console.error("IRF add error", e);
                        toast({ title: "Could not add", description: e?.message || "Please try again.", variant: "destructive" });
                      }
                    }}
                  >
                    <Sparkles className="h-4 w-4 mr-1.5" /> Add to project
                  </Button>
                </div>
              </div>







              <div className="px-3 sm:px-4 py-3 border-t border-border/60 space-y-3">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-sky-100">
                    <NotebookPen className="h-4 w-4 text-sky-700" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-foreground">Treatment Data Reporting Tools</p>
                    <p className="text-xs text-muted-foreground">Microplan-driven location with off-microplan provision · fully editable in the Form Builder.</p>
                  </div>
                </div>

                {([
                  { name: COMMUNITY_TREATMENT_REGISTER_NAME, build: buildCommunityTreatmentRegister, icon: ClipboardCheck, desc: "Village/School person-level NTD register — roster, medicines given and coverage review.", tint: "bg-sky-100 text-sky-700 border-sky-200 from-sky-50" },
                  { name: COMMUNITY_SUMMARY_FORM_NAME, build: buildCommunitySummaryForm, icon: FileSpreadsheet, desc: "Level-1 community summary — population, treatments by age/sex, adverse events & drug management.", tint: "bg-indigo-100 text-indigo-700 border-indigo-200 from-indigo-50" },
                ] as const).map((tool) => {
                  const Icon = tool.icon;
                  return (
                    <div key={tool.name} className={`flex items-center justify-between gap-3 rounded-xl border bg-gradient-to-r to-transparent p-3 ${tool.tint}`}>
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`p-2 rounded-lg shrink-0 ${tool.tint.split(" ").slice(0, 2).join(" ")}`}>
                          <Icon className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-foreground truncate">{tool.name}</p>
                          <p className="text-xs text-muted-foreground">{tool.desc}</p>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        className="shrink-0"
                        onClick={async () => {
                          if (!currentProjectId) {
                            toast({ title: "Select a project", description: "Choose a project before adding this tool.", variant: "destructive" });
                            return;
                          }
                          if (forms.find((f) => f.name === tool.name)) {
                            toast({ title: "Already added", description: "This tool already exists in this project. Open it from the list above to edit." });
                            return;
                          }
                          try {
                            const built = tool.build();
                            const { error } = await supabase.from("forms").insert({
                              name: built.name,
                              description: built.description,
                              questions: built.questions as any,
                              settings: built.settings as any,
                              project_id: currentProjectId,
                              created_by: user?.id,
                              status: "draft",
                            } as any);
                            if (error) throw error;
                            toast({ title: "Added to project", description: "Open it from your forms list to fill, share, or edit in the Form Builder." });
                            fetchForms(currentProjectId);
                          } catch (e: any) {
                            console.error("Treatment tool create error", e);
                            toast({ title: "Could not add", description: e?.message || "Please try again.", variant: "destructive" });
                          }
                        }}
                      >
                        <Sparkles className="h-4 w-4 mr-1.5" /> Add to project
                      </Button>
                    </div>
                  );
                })}

                {/* Aggregated rollup export — Community → FLHF → LGA */}
                <div className="rounded-xl border border-emerald-200 bg-gradient-to-r from-emerald-50 to-transparent p-3">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 rounded-lg bg-emerald-100 text-emerald-700 shrink-0">
                      <FileSpreadsheet className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground">Aggregated Summary Export</p>
                      <p className="text-xs text-muted-foreground">
                        Roll up Community summaries by FLHF, then by LGA, into one beautifully-formatted Excel workbook (Level&nbsp;1 → Level&nbsp;2 → Level&nbsp;3).
                      </p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={rollupExporting}
                    className="w-full border-emerald-300 text-emerald-800 hover:bg-emerald-50"
                    onClick={async () => {
                      setRollupExporting(true);
                      try {
                        await generateTreatmentRollupWorkbook({
                          projectId: currentProjectId || undefined,
                          projectName: currentProject?.name,
                        });
                        toast({ title: "Workbook ready", description: "Your aggregated FLHF & LGA summaries have downloaded." });
                      } catch (e: any) {
                        console.error("Rollup export error", e);
                        toast({ title: "Could not export", description: e?.message || "Please try again.", variant: "destructive" });
                      } finally {
                        setRollupExporting(false);
                      }
                    }}
                  >
                    <Download className="h-4 w-4 mr-1.5" />
                    {rollupExporting ? "Building workbook…" : "Download aggregated Excel (FLHF + LGA + all fields)"}
                  </Button>
                </div>
              </div>
              </>)}






              {/* Folder-grouped standard forms */}
              {([
                ...(isOwner ? [{
                  id: "bloomberg_folder",
                  title: "Bloomberg School Eye Health Project",
                  subtitle: "School enrolment validation — form & admin dashboard",
                  bg: "bg-[#E3ECFB]", fg: "text-[#0c2340]", chipBg: "bg-[#E3ECFB]", chipFg: "text-[#0c2340]",
                  items: [
                    { kind: "bloomberg_form" as const, icon: ClipboardCheck, bg: "bg-[#E3ECFB]", fg: "text-[#2563eb]", label: "School Enrolment Validation", desc: "Independent 4-step validation of LEA school enrolment (Owner only)." },
                    { kind: "bloomberg_dash" as const, icon: BarChart3, bg: "bg-[#DCF3F0]", fg: "text-[#14b8a6]", label: "Validation Dashboard", desc: "Baseline vs validated analytics, discrepancies & map (Owner only)." },
                  ],
                }] : []),
                ...(canSeeMdaDashboard ? [{
                  id: "mda_supervisory_folder",
                  title: "Integrated MDA Supervisory Checklist",
                  subtitle: "Community supervision checklist, follow-ups & realtime decision dashboard",
                  bg: "bg-[#DCF3F0]", fg: "text-[#0f766e]", chipBg: "bg-[#DCF3F0]", chipFg: "text-[#0f766e]",
                  items: [
                    {
                      kind: "mda_dashboard" as const,
                      icon: BarChart3,
                      bg: "bg-[#DCF3F0]",
                      fg: "text-[#0f766e]",
                      label: "MDA Supervisory Dashboard",
                      desc: primaryMdaDashboardForm
                        ? "Open the standalone Bloomberg-style dashboard for checklist, follow-up, GPS and field-worker insights."
                        : "Create or copy an Integrated MDA Supervisory Checklist in this project to activate the dashboard.",
                    },
                  ],
                }] : []),
                ...(isOwner ? [{
                  id: "seeclear_folder",
                  title: "See Clear — Plateau Eye Health Project",
                  subtitle: "Facility monitoring & supervision — checklist & dashboard",
                  bg: "bg-[#DCF3F0]", fg: "text-[#0f766e]", chipBg: "bg-[#DCF3F0]", chipFg: "text-[#0f766e]",
                  items: [
                    { kind: "seeclear_form" as const, icon: ClipboardCheck, bg: "bg-[#DCF3F0]", fg: "text-[#14b8a6]", label: "Facility Monitoring Checklist", desc: "Profile, readiness, equipment, evidence & sign-off (Owner only)." },
                    { kind: "seeclear_dash" as const, icon: BarChart3, bg: "bg-[#DCF3F0]", fg: "text-[#0f766e]", label: "Monitoring Dashboard", desc: "Readiness, equipment, referrals, data quality & map (Owner only)." },
                  ],
                }] : []),
                {
                  id: "action_tracker_folder",
                  title: "Meeting Action Tracking",
                  subtitle: "Capture & track implementation of meeting action points",
                  bg: "bg-[#DCF3E8]", fg: "text-[#0F7E4F]", chipBg: "bg-[#DCF3E8]", chipFg: "text-[#0B6A41]",
                  items: [
                    { kind: "action_tracker" as const, icon: ClipboardList, bg: "bg-[#DCF3E8]", fg: "text-[#0F7E4F]", label: "Meeting Action Points Tracker", desc: "Log decisions, assign owners, set timelines and track implementation with due-date triggers." },
                  ],
                },
                {
                  id: "workplan_folder",
                  title: "Work Plan Tracking",
                  subtitle: "Build activity schedules (GANTT) and track implementation",
                  bg: "bg-[#DCF3E8]", fg: "text-[#0F7E4F]", chipBg: "bg-[#DCF3E8]", chipFg: "text-[#0B6A41]",
                  items: [
                    { kind: "workplan" as const, icon: GanttChartSquare, bg: "bg-[#DCF3E8]", fg: "text-[#0F7E4F]", label: "Work Plan Tracker", desc: "Plan programme activities by result, target and quarter, then track each to completion with due-date triggers and non-implementation reasons." },
                  ],
                },
                {
                  id: "safeguarding",
                  title: "Safeguarding Forms",
                  subtitle: "SRF & Safeguarding Incident reports",
                  bg: "bg-[#EDE7FE]", fg: "text-[#7C5CFF]", chipBg: "bg-[#EDE7FE]", chipFg: "text-[#5B3FD0]",
                  items: [
                    { kind: "office" as const, codes: ["srf", "incident"] as const, label: "Open Safeguarding Forms", desc: "Safeguarding Reporting (SRF) & Incident Form", icon: ShieldCheck },
                  ],
                },
                {
                  id: "mmdp",
                  title: "MMDP Readiness Assessment Forms",
                  subtitle: "Facility readiness for MMDP services",
                  bg: "bg-[#DCF3F0]", fg: "text-[#1FB5A8]", chipBg: "bg-[#DCF3F0]", chipFg: "text-[#0F7E76]",
                  items: [
                    { kind: "standard" as const, code: "hfat" as const, icon: Stethoscope, bg: "bg-[#DCF3F0]", fg: "text-[#1FB5A8]" },
                    { kind: "standard" as const, code: "lfat" as const, icon: Stethoscope, bg: "bg-[#E8F0FE]", fg: "text-[#1F6FEB]" },
                  ],
                },
                {
                  id: "mental_health",
                  title: "Mental Health Assessment Forms",
                  subtitle: "Validated mental health screening tools",
                  bg: "bg-[#FCE9DA]", fg: "text-[#F08A2A]", chipBg: "bg-[#FCE9DA]", chipFg: "text-[#B8651A]",
                  items: [
                    { kind: "mental_health" as const, icon: BrainIcon, bg: "bg-[#DCF3E8]", fg: "text-[#0F7E4F]", label: "GAD-7 & PHQ-9 Assessments", desc: "Anxiety (GAD-7) and depression (PHQ-9) screening in one guided flow." },
                    { kind: "standard" as const, code: "srq_20" as const, icon: BrainIcon, bg: "bg-[#FCE9DA]", fg: "text-[#F08A2A]" },
                    { kind: "standard" as const, code: "audit" as const, icon: BrainIcon, bg: "bg-[#EDE7FE]", fg: "text-[#7C5CFF]" },
                    { kind: "standard" as const, code: "epds" as const, icon: BrainIcon, bg: "bg-[#FCE9E9]", fg: "text-[#E25555]" },
                    { kind: "standard" as const, code: "pcptsd5" as const, icon: BrainIcon, bg: "bg-[#E3ECFB]", fg: "text-[#1F6FEB]" },
                    { kind: "standard" as const, code: "mdq" as const, icon: BrainIcon, bg: "bg-[#DCF3F0]", fg: "text-[#1FB5A8]" },
                  ],
                },
                {
                  id: "programme_activity",
                  title: "Programme Activity Forms",
                  subtitle: "Disability inclusion & attendance",
                  bg: "bg-[#E3ECFB]", fg: "text-[#1F6FEB]", chipBg: "bg-[#E3ECFB]", chipFg: "text-[#1656BA]",
                  items: [
                    { kind: "standard" as const, code: "wg_ss" as const, icon: Accessibility,   bg: "bg-[#EDE7FE]", fg: "text-[#7C5CFF]" },
                    { kind: "uprp" as const, icon: ClipboardCheck, bg: "bg-[#DCF3E8]", fg: "text-[#0F7E4F]", label: "Participants Bank Details Verification Form", desc: "Register training participants and capture attendance & bank payment details." },
                    { kind: "uprp_records" as const, icon: ClipboardCheck, bg: "bg-[#DCF3E8]", fg: "text-[#0F7E4F]", label: "Participants Bank Details Verification Records", desc: "View saved registrations, analytics and export a formatted Excel table." },
                    { kind: "attendance" as const, icon: ClipboardCheck, bg: "bg-[#E3ECFB]", fg: "text-[#1F6FEB]", label: "Digital Attendance", desc: "Mark staff attendance and capture participants of meetings, trainings and programme activities." },
                  ],
                },
              ])
                .map(folder => {
                  // Adhoc users only see standard items they were assigned.
                  if (!isAdhoc) return folder;
                  const items = (folder.items as any[]).filter(
                    (it) => it.kind === "standard" && assignedStandardCodes.has(it.code)
                  );
                  return { ...folder, items };
                })
                .filter(folder => !isAdhoc || folder.items.length > 0)
                .map(folder => {
                const open = openFolder === folder.id;
                return (
                  <div key={folder.id} className="border-t border-border/60">
                    <button
                      onClick={(e) => {
                        const willOpen = !open;
                        setOpenFolder(willOpen ? folder.id : null);
                        if (willOpen) {
                          const el = e.currentTarget as HTMLElement;
                          // Bring the opened folder to the top so its contents
                          // display from the beginning without manual scrolling.
                          requestAnimationFrame(() =>
                            el.scrollIntoView({ behavior: "smooth", block: "start" })
                          );
                        }
                      }}
                      className="flex w-full items-center gap-3 p-3 sm:p-4 text-left hover:bg-[#F4F6F8]/70 transition-colors scroll-mt-2"
                    >
                      <div className={`flex h-11 w-11 sm:h-12 sm:w-12 shrink-0 items-center justify-center rounded-lg ${folder.bg}`}>
                        {open ? <FolderOpen className={`h-5 w-5 sm:h-6 sm:w-6 ${folder.fg}`} /> : <Folder className={`h-5 w-5 sm:h-6 sm:w-6 ${folder.fg}`} />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h4 className="truncate text-sm sm:text-base font-semibold text-foreground">{folder.title}</h4>
                        <p className="mt-0.5 line-clamp-2 text-xs sm:text-sm text-muted-foreground">{folder.subtitle}</p>
                      </div>
                      {(() => {
                        const total = folder.items.reduce((n, it: any) => n + (it.kind === "office" ? (it.codes?.length || 0) : 1), 0);
                        return (
                          <span className={`shrink-0 rounded-full ${folder.chipBg} px-3 py-1 text-xs font-medium ${folder.chipFg}`}>
                            {total} form{total === 1 ? "" : "s"}
                          </span>
                        );
                      })()}
                      <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`} />
                    </button>
                    {open && (
                      <div className="bg-muted/20 border-t border-border/40">
                        {folder.items.map((it, idx) => {
                          if (it.kind === "bloomberg_form" || it.kind === "bloomberg_dash") {
                            const Icon = it.icon;
                            const isDash = it.kind === "bloomberg_dash";
                            return (
                              <button
                                key={idx}
                                onClick={() => (isDash ? setShowBloombergDash(true) : setShowBloombergForm(true))}
                                className="flex w-full items-center gap-3 pl-12 pr-3 sm:pl-16 sm:pr-4 py-3 text-left hover:bg-white/60 transition-colors border-t border-border/30 first:border-t-0"
                              >
                                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${it.bg}`}>
                                  <Icon className={`h-4 w-4 ${it.fg}`} />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <h5 className="truncate text-sm font-semibold">{it.label}</h5>
                                  <p className="text-xs text-muted-foreground">{it.desc}</p>
                                </div>
                                <ChevronRight className="h-4 w-4 text-muted-foreground" />
                              </button>
                            );
                          }
                          if (it.kind === "seeclear_form" || it.kind === "seeclear_dash") {
                            const Icon = it.icon;
                            const isDash = it.kind === "seeclear_dash";
                            return (
                              <button
                                key={idx}
                                onClick={() => (isDash ? setShowSeeClearDash(true) : setShowSeeClearForm(true))}
                                className="flex w-full items-center gap-3 pl-12 pr-3 sm:pl-16 sm:pr-4 py-3 text-left hover:bg-white/60 transition-colors border-t border-border/30 first:border-t-0"
                              >
                                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${it.bg}`}>
                                  <Icon className={`h-4 w-4 ${it.fg}`} />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <h5 className="truncate text-sm font-semibold">{it.label}</h5>
                                  <p className="text-xs text-muted-foreground">{it.desc}</p>
                                </div>
                                <ChevronRight className="h-4 w-4 text-muted-foreground" />
                              </button>
                            );
                          }
                          if (it.kind === "mda_dashboard") {
                            const Icon = it.icon;
                            return (
                              <button
                                key={idx}
                                onClick={() => {
                                  if (primaryMdaDashboardForm) {
                                    setMdaDashboardForm(primaryMdaDashboardForm);
                                    return;
                                  }
                                  toast({
                                    title: "Dashboard not ready",
                                    description: currentProjectId
                                      ? "Add or copy the Integrated MDA Supervisory Checklist to this project first."
                                      : "Select a project that has an Integrated MDA Supervisory Checklist first.",
                                    variant: "destructive",
                                  });
                                }}
                                className="flex w-full items-center gap-3 pl-12 pr-3 sm:pl-16 sm:pr-4 py-3 text-left hover:bg-white/60 transition-colors border-t border-border/30 first:border-t-0"
                              >
                                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${it.bg}`}>
                                  <Icon className={`h-4 w-4 ${it.fg}`} />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <h5 className="truncate text-sm font-semibold">{it.label}</h5>
                                  <p className="text-xs text-muted-foreground">{it.desc}</p>
                                </div>
                                {primaryMdaDashboardForm ? (
                                  <span className="hidden shrink-0 rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 sm:inline-flex">
                                    Live
                                  </span>
                                ) : (
                                  <span className="hidden shrink-0 rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-700 sm:inline-flex">
                                    Setup needed
                                  </span>
                                )}
                                <ChevronRight className="h-4 w-4 text-muted-foreground" />
                              </button>
                            );
                          }
                          if (it.kind === "action_tracker") {
                            const Icon = it.icon;
                            return (
                              <button
                                key={idx}
                                onClick={() => setShowActionTracker(true)}
                                className="flex w-full items-center gap-3 pl-12 pr-3 sm:pl-16 sm:pr-4 py-3 text-left hover:bg-white/60 transition-colors border-t border-border/30 first:border-t-0"
                              >
                                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${it.bg}`}>
                                  <Icon className={`h-4 w-4 ${it.fg}`} />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <h5 className="truncate text-sm font-semibold">{it.label}</h5>
                                  <p className="text-xs text-muted-foreground">{it.desc}</p>
                                </div>
                                <ChevronRight className="h-4 w-4 text-muted-foreground" />
                              </button>
                            );
                          }
                          if (it.kind === "workplan") {
                            const Icon = it.icon;
                            return (
                              <button
                                key={idx}
                                onClick={() => setShowWorkplan(true)}
                                className="flex w-full items-center gap-3 pl-12 pr-3 sm:pl-16 sm:pr-4 py-3 text-left hover:bg-white/60 transition-colors border-t border-border/30 first:border-t-0"
                              >
                                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${it.bg}`}>
                                  <Icon className={`h-4 w-4 ${it.fg}`} />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <h5 className="truncate text-sm font-semibold">{it.label}</h5>
                                  <p className="text-xs text-muted-foreground">{it.desc}</p>
                                </div>
                                <ChevronRight className="h-4 w-4 text-muted-foreground" />
                              </button>
                            );
                          }
                          if (it.kind === "office") {
                            const Icon = it.icon;
                            return (
                              <button
                                key={idx}
                                onClick={() => setOfficeFormsOpen({ codes: [...it.codes], title: folder.title })}
                                className="flex w-full items-center gap-3 pl-12 pr-3 sm:pl-16 sm:pr-4 py-3 text-left hover:bg-white/60 transition-colors border-t border-border/30 first:border-t-0"
                              >
                                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${folder.bg}`}>
                                  <Icon className={`h-4 w-4 ${folder.fg}`} />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <h5 className="truncate text-sm font-semibold">{it.label}</h5>
                                  <p className="text-xs text-muted-foreground">{it.desc}</p>
                                </div>
                                <ChevronRight className="h-4 w-4 text-muted-foreground" />
                              </button>
                            );
                          }
                          if (it.kind === "uprp") {
                            const Icon = it.icon;
                            return (
                              <button
                                key={idx}
                                onClick={() => setShowUprp(true)}
                                className="flex w-full items-center gap-3 pl-12 pr-3 sm:pl-16 sm:pr-4 py-3 text-left hover:bg-white/60 transition-colors border-t border-border/30 first:border-t-0"
                              >
                                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${it.bg}`}>
                                  <Icon className={`h-4 w-4 ${it.fg}`} />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <h5 className="truncate text-sm font-semibold">{it.label}</h5>
                                  <p className="text-xs text-muted-foreground">{it.desc}</p>
                                </div>
                                <ChevronRight className="h-4 w-4 text-muted-foreground" />
                              </button>
                            );
                          }
                          if (it.kind === "uprp_records") {
                            const Icon = it.icon;
                            return (
                              <button
                                key={idx}
                                onClick={() => setShowUprpRecords(true)}
                                className="flex w-full items-center gap-3 pl-12 pr-3 sm:pl-16 sm:pr-4 py-3 text-left hover:bg-white/60 transition-colors border-t border-border/30 first:border-t-0"
                              >
                                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${it.bg}`}>
                                  <Icon className={`h-4 w-4 ${it.fg}`} />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <h5 className="truncate text-sm font-semibold">{it.label}</h5>
                                  <p className="text-xs text-muted-foreground">{it.desc}</p>
                                </div>
                                <ChevronRight className="h-4 w-4 text-muted-foreground" />
                              </button>
                            );
                          }
                          if (it.kind === "attendance") {
                            const Icon = it.icon;
                            return (
                              <button
                                key={idx}
                                onClick={() => setShowDigitalAttendance(true)}
                                className="flex w-full items-center gap-3 pl-12 pr-3 sm:pl-16 sm:pr-4 py-3 text-left hover:bg-white/60 transition-colors border-t border-border/30 first:border-t-0"
                              >
                                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${it.bg}`}>
                                  <Icon className={`h-4 w-4 ${it.fg}`} />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <h5 className="truncate text-sm font-semibold">{it.label}</h5>
                                  <p className="text-xs text-muted-foreground">{it.desc}</p>
                                </div>
                                <ChevronRight className="h-4 w-4 text-muted-foreground" />
                              </button>
                            );
                          }
                          if (it.kind === "mental_health") {
                            const Icon = it.icon;
                            return (
                              <button
                                key={idx}
                                onClick={() => setShowMentalHealth(true)}
                                className="flex w-full items-center gap-3 pl-12 pr-3 sm:pl-16 sm:pr-4 py-3 text-left hover:bg-white/60 transition-colors border-t border-border/30 first:border-t-0"
                              >
                                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${it.bg}`}>
                                  <Icon className={`h-4 w-4 ${it.fg}`} />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <h5 className="truncate text-sm font-semibold">{it.label}</h5>
                                  <p className="text-xs text-muted-foreground">{it.desc}</p>
                                </div>
                                <ChevronRight className="h-4 w-4 text-muted-foreground" />
                              </button>
                            );
                          }
                          const code = it.code;
                          const def = STANDARD_ASSESSMENTS[code];
                          const isDisabled = disabledStandardCodes.has(code);
                          const Icon = it.icon;
                          return (
                            <div key={code} className={`flex w-full items-center gap-3 pl-12 pr-3 sm:pl-16 sm:pr-4 py-3 border-t border-border/30 first:border-t-0 ${isDisabled ? "opacity-60" : "hover:bg-white/60"} transition-colors`}>
                              <button
                                onClick={() => !isDisabled && setActiveStandardAssessment(code)}
                                disabled={isDisabled}
                                className="flex flex-1 items-center gap-3 text-left disabled:cursor-not-allowed min-w-0"
                              >
                                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${it.bg}`}>
                                  <Icon className={`h-4 w-4 ${it.fg}`} />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <h5 className="truncate text-sm font-semibold">{def.shortName}</h5>
                                  <p className="text-xs text-muted-foreground line-clamp-1">
                                    {isDisabled ? "Disabled (factory reset)." : def.description}
                                  </p>
                                </div>
                              </button>
                              {isDisabled ? (
                                isAdmin && (
                                  <Button size="sm" variant="outline" onClick={() => toggleStandardForm(code, false)} className="shrink-0">Enable</Button>
                                )
                              ) : (
                                <>
                                  <span className={`shrink-0 rounded-full ${folder.chipBg} px-2.5 py-0.5 text-[10px] font-medium ${folder.chipFg}`}>Standard</span>
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
                      </div>
                    )}
                  </div>
                );
              })}




              {/* Microplanning entry — kept inside the list */}
              {(hasMicroplanAccess || (!isAdhoc && projects.length > 0)) && (

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
            </div>
            )}
          </div>
          )}

          {/* KoboCollect-style status menu — hidden while exploring forms */}
          {!showFormsExplorer && (
          <>
          <button
            onClick={() => handleQuickAction("edit")}
            className="flex w-full items-center gap-4 rounded-full bg-white px-5 py-4 text-left shadow-sm ring-1 ring-border/60 transition-colors hover:bg-[#F4F6F8]"
          >
            <FileEdit className="h-6 w-6 shrink-0 text-[#0F172A]" strokeWidth={2} />
            <span className="flex-1 text-base font-semibold text-foreground">Drafts</span>
            <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
          </button>
          <button
            onClick={() => handleQuickAction("send")}
            className="flex w-full items-center gap-4 rounded-full bg-white px-5 py-4 text-left shadow-sm ring-1 ring-border/60 transition-colors hover:bg-[#F4F6F8]"
          >
            <Send className="h-6 w-6 shrink-0 text-[#0F172A]" strokeWidth={2} />
            <span className="flex-1 text-base font-semibold text-foreground">Ready to send</span>
            <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
          </button>
          <button
            onClick={() => handleQuickAction("view")}
            className="flex w-full items-center gap-4 rounded-full bg-white px-5 py-4 text-left shadow-sm ring-1 ring-border/60 transition-colors hover:bg-[#F4F6F8]"
          >
            <CheckCircle className="h-6 w-6 shrink-0 text-[#0F172A]" strokeWidth={2} />
            <span className="flex-1 text-base font-semibold text-foreground">Sent</span>
            <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
          </button>
          <button
            onClick={() => {
              void handleDownloadAccessibleForms();
            }}
            className="flex w-full items-center gap-4 rounded-full bg-white px-5 py-4 text-left shadow-sm ring-1 ring-border/60 transition-colors hover:bg-[#F4F6F8]"
          >
            <Download className="h-6 w-6 shrink-0 text-[#0F172A]" strokeWidth={2} />
            <span className="flex-1 text-base font-semibold text-foreground">Download form</span>
            <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
          </button>
          <button
            onClick={() => handleQuickAction("delete")}
            className="flex w-full items-center gap-4 rounded-full bg-white px-5 py-4 text-left shadow-sm ring-1 ring-border/60 transition-colors hover:bg-[#F4F6F8]"
          >
            <Trash2 className="h-6 w-6 shrink-0 text-[#0F172A]" strokeWidth={2} />
            <span className="flex-1 text-base font-semibold text-foreground">Delete form</span>
            <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
          </button>

          <p className="pt-2 pb-1 text-center text-sm font-medium text-muted-foreground">
            Amehnities Forms
          </p>

          {isAdmin && (
            <button
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
              className="mt-1 flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#2F6FE6] to-[#1A5FD0] px-5 py-4 text-base font-semibold text-white shadow-[0_4px_14px_rgba(47,111,230,0.35)] transition-all hover:shadow-[0_6px_20px_rgba(47,111,230,0.45)] hover:brightness-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2F6FE6]/50 focus-visible:ring-offset-2"
            >
              <Plus className="h-6 w-6" strokeWidth={2.5} />
              New Form
            </button>
          )}
          {canBuildStudio && (
            <button
              onClick={() => {
                if (!currentProjectId && projects.length > 0) {
                  toast({
                    title: "Select a Project",
                    description: "Please select a project first to build a special form.",
                    variant: "destructive",
                  });
                  return;
                }
                setShowStudio(true);
              }}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-indigo-600 to-purple-700 px-5 py-4 text-base font-semibold text-white shadow-[0_4px_14px_rgba(99,102,241,0.35)] transition-all hover:shadow-[0_6px_20px_rgba(99,102,241,0.45)] hover:brightness-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50 focus-visible:ring-offset-2"
            >
              <Plus className="h-6 w-6" strokeWidth={2.5} />
              Special Form Studio
            </button>
          )}
          </>
          )}
        </section>
        )}
      </div>




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

      {/* Confirmation of exactly which forms were downloaded for offline use */}
      <AlertDialog open={!!downloadConfirm} onOpenChange={(open) => !open && setDownloadConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {downloadConfirm?.forms.length
                ? `${downloadConfirm.forms.length} form${downloadConfirm.forms.length === 1 ? "" : "s"} downloaded`
                : "No forms to download"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {downloadConfirm?.forms.length
                ? `These forms are now available for complete offline use${downloadConfirm.scopedToGrants ? " and match your access grants" : ""}:`
                : "You have no forms granted for offline use yet. Connect once after being assigned a form."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {downloadConfirm?.forms.length ? (
            <div className="max-h-64 overflow-y-auto rounded-md border border-border divide-y divide-border">
              {downloadConfirm.forms.map((f) => (
                <div key={f.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                  <Download className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="truncate">{f.name}</span>
                </div>
              ))}
            </div>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setDownloadConfirm(null)}>Done</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>



      {/* Copy MDA Supervisory Checklist from another project */}
      <CopyMdaChecklistDialog
        open={showCopyMda}
        onOpenChange={setShowCopyMda}
        currentProjectId={currentProjectId}
        projects={projects}
        destinationHasChecklist={forms.some((f) => f.name === MDA_CHECKLIST_NAME)}
        existingFormNames={forms.map((f) => f.name)}
        userId={user?.id}
        onCopied={() => currentProjectId && fetchForms(currentProjectId)}
      />

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

      {/* Per-form bulk export/import dialog */}
      <BulkDataDialog
        form={bulkForm as any}
        open={!!bulkForm}
        onOpenChange={(v) => { if (!v) setBulkForm(null); }}
        onImported={() => fetchForms(currentProjectId)}
      />

      {/* Owner-only: manage who can bulk export/import */}
      <BulkUploadAccessManager
        open={showBulkAccess}
        onOpenChange={setShowBulkAccess}
        hideTrigger
      />

      {/* Per-form access: Owner/Co-owner grant + remove; all admins remove */}
      <FormAccessManager
        form={accessManagerForm}
        open={!!accessManagerForm}
        onOpenChange={(o) => { if (!o) setAccessManagerForm(null); }}
        canGrant={isOwnerLevel}
        canRemove={isAdmin}
        currentUserId={user?.id}
      />

      {/* WhatsApp-style floating project chat launcher */}
      <ProjectChatFab projects={projects} currentProjectId={currentProjectId} />
    </div>
  );
};

export default FormsView;

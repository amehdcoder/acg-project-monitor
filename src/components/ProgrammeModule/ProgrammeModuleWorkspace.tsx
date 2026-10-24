import WorkflowTour, { openWorkflowTour } from "./WorkflowTour";
import { Compass, Eye } from "lucide-react";
import BeneficiaryBrainPanel from "./BeneficiaryBrainPanel";
import { Brain, BookOpenCheck } from "lucide-react";
import FieldGuidePanel from "./FieldGuidePanel";
import { useEffect, useMemo, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Plus, Settings2, CloudOff, RefreshCw, Layers, Users, Building2, Globe, ShieldAlert,
  LayoutGrid, CalendarClock, Hospital, Route, ShieldCheck, Home, Network, Activity,
  Search, Briefcase, Share2, ChevronDown, SlidersHorizontal, BarChart3,
  Trash2, MessageSquareHeart,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { MODULE_TEMPLATES, normalizeConfig } from "@/lib/programmeModule/defaults";
import { bindQueueAutoFlush, flushQueue, queueCount } from "@/lib/programmeModule/offlineQueue";
import type { BeneficiaryRow, ProgrammeModuleRow } from "@/lib/programmeModule/types";
import { useBeneficiaries, useProgrammeModules } from "./useProgrammeModule";
import BeneficiaryList from "./BeneficiaryList";
import BeneficiaryRecord from "./BeneficiaryRecord";
import RecordQualityBar from "./RecordQualityBar";
import BeneficiaryFormDialog from "./BeneficiaryFormDialog";
import ProjectTeamPanel from "./ProjectTeamPanel";
import DonorAccessPanel from "./DonorAccessPanel";
import { useMyTeamPermissions, isHealthWorkerComponent, componentInAreas, memberComponentFilter, memberDashboardAllowed } from "@/lib/programmeModule/projectTeam";
import ModuleConfigurator from "./ModuleConfigurator";
import ModuleProjectsDialog from "./ModuleProjectsDialog";
import FacilityFocalPersons from "./FacilityFocalPersons";
import MhgapDrugsManager from "./MhgapDrugsManager";
import FacilityRegistry from "./FacilityRegistry";
import FacilityDashboard from "./FacilityDashboard";
import FollowUpsPanel from "./FollowUpsPanel";
import DeleteRequestsPanel from "./DeleteRequestsPanel";
import JourneyDashboard from "./JourneyDashboard";
import SafeguardingPanel from "./SafeguardingPanel";
import SafeguardingDashboard from "./SafeguardingDashboard";
import SafeguardingOfficers from "./SafeguardingOfficers";
import HouseholdsPanel from "./HouseholdsPanel";
import KinshipGraphPanel from "./KinshipGraphPanel";
import LtfuRiskPanel from "./LtfuRiskPanel";
import ClusterDashboard from "./ClusterDashboard";
import GraduationDashboard from "./GraduationDashboard";
import CddCaseSearchPanel from "./CddCaseSearchPanel";
import LivelihoodPanel from "./LivelihoodPanel";
import HealthExchangePanel from "./HealthExchangePanel";
import GeneralDashboard from "./GeneralDashboard";
import FeedbackReportsPanel from "./FeedbackReportsPanel";
import ProgrammeReportForm from "./ProgrammeReportForm";
import QuizBuilder from "@/components/QuizBuilder/QuizBuilder";
import WhatsAppRemindersDialog from "./WhatsAppRemindersDialog";
import SmsRemindersDialog from "./SmsRemindersDialog";
import { MessageCircle } from "lucide-react";
import WorkspaceMajorTabs, { type MajorTab } from "./WorkspaceMajorTabs";
import PeopleCareHub from "./PeopleCareHub";
import OverviewHub from "./OverviewHub";
import IntelligenceHub from "./IntelligenceHub";
import ProtectionHub from "./ProtectionHub";
import WorkspaceNavigation, { type WorkspaceNavGroup, type WorkspaceView } from "./WorkspaceNavigation";
import { useIsSafeguardingOfficer } from "@/lib/programmeModule/safeguarding";
import { useMyFacilityAccess, useFacilities, type FacilityAccessLevel } from "@/lib/programmeModule/facilities";
import { FACILITY_WORKSPACE_VIEWS, facilityCanWrite, isFacilityClinicalComponent } from "@/lib/programmeModule/facilityScope";
import DevicePreviewDialog from "./DevicePreviewDialog";
import ViewAsDialog, { ViewAsBanner } from "./ViewAsDialog";
import { viewAsPermissions, viewAsRecordVisible, type ViewAsConfig } from "@/lib/programmeModule/viewAs";
import { applyDeviceFit } from "@/lib/deviceFit";


interface Props {
  projectId?: string;
  /** Only administrators may add or configure modules. */
  canConfigure?: boolean;
  isOwner?: boolean;
  /** Super Admin: may add the records to, or remove them from, any project. */
  isSuperAdmin?: boolean;
}

/**
 * Longitudinal Beneficiary Record workspace.
 *
 * One reusable, fully configurable case/beneficiary management system that can
 * be added to any project with the "+" button. Everything on screen — the
 * programme components, sections, questions, workflow, layout, branding and
 * Case ID format — comes from `programme_modules.config`, never from this code.
 */
const ProgrammeModuleWorkspace = ({
  projectId, canConfigure: realCanConfigure = false, isOwner: realIsOwner = false, isSuperAdmin: realIsSuperAdmin = false,
}: Props) => {
  // Super Admins can preview the workspace as another kind of user.
  const canViewAs = realIsSuperAdmin || realIsOwner;
  const [viewAs, setViewAs] = useState<ViewAsConfig | null>(null);
  const [viewAsOpen, setViewAsOpen] = useState(false);
  const canConfigure = viewAs ? false : realCanConfigure;
  const isOwner = viewAs ? false : realIsOwner;
  const isSuperAdmin = viewAs ? false : realIsSuperAdmin;
  const { toast } = useToast();
  const { modules, loading, reload } = useProgrammeModules(projectId);
  const [activeId, setActiveId] = useState<string>("");
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [focalOpen, setFocalOpen] = useState(false);
  const [registryOpen, setRegistryOpen] = useState(false);
  const [devicePreviewOpen, setDevicePreviewOpen] = useState(false);
  useEffect(() => { applyDeviceFit(); }, []);
  const [drugsOpen, setDrugsOpen] = useState(false);
  const [whatsappOpen, setWhatsappOpen] = useState(false);
  const [smsOpen, setSmsOpen] = useState(false);
  const { levels: realFacilityLevels, loading: facilityAccessLoading } = useMyFacilityAccess();
  const facilityLevels = useMemo<Record<string, FacilityAccessLevel>>(() => {
    if (!viewAs) return realFacilityLevels;
    return viewAs.role === "facility_focal" && viewAs.facilityId ? { [viewAs.facilityId]: "record" } : {};
  }, [viewAs, realFacilityLevels]);
  const isFocalPerson = !canConfigure && Object.keys(facilityLevels).length > 0;
  const focalCanWrite = facilityCanWrite(facilityLevels);
  const [focalFacilityId, setFocalFacilityId] = useState<string | undefined>(undefined);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [selected, setSelected] = useState<BeneficiaryRow | null>(null);
  /** Record created from a confirmed case-search case, awaiting full details. */
  const [completing, setCompleting] = useState<BeneficiaryRow | null>(null);
  const [pending, setPending] = useState(queueCount());
  const [creating, setCreating] = useState(false);
  const [deleteRequestsOpen, setDeleteRequestsOpen] = useState(false);
  const [officersOpen, setOfficersOpen] = useState(false);
  const [projectsOpen, setProjectsOpen] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [removeConfirm, setRemoveConfirm] = useState("");
  const [removing, setRemoving] = useState(false);
  const { isOfficer: realIsOfficer, reload: reloadOfficerAccess } = useIsSafeguardingOfficer(projectId);

  // What this person is allowed to see and do, from the project team register.
  // People who are not listed keep the access they already had.
  const realTeam = useMyTeamPermissions(projectId, realCanConfigure);
  const isOfficer = viewAs ? false : realIsOfficer;
  const simPerms = useMemo(() => (viewAs ? viewAsPermissions(viewAs) : null), [viewAs]);
  const teamCan = useMemo(() => (simPerms ? (k: keyof typeof simPerms) => Boolean(simPerms[k]) : realTeam.can), [simPerms, realTeam.can]);
  const onTeamRegister = simPerms ? true : realTeam.listed;
  const permissionsLoading = realTeam.loading;
  const healthWorkerCadre = simPerms ? simPerms.health_worker || null : realTeam.healthWorkerCadre;
  const programmeStaffCadre = simPerms ? simPerms.programme_staff || null : realTeam.programmeStaffCadre;
  const programmeAreas = simPerms ? [] : realTeam.programmeAreas;
  const teamMember = simPerms ? ({ permissions: simPerms } as typeof realTeam.member) : realTeam.member;
  // Designated health workers only work on MMDP/NTD and mental health: case
  // search, records, households/MDA/WASH, services, follow-ups and referrals.
  const isHealthWorker = Boolean(healthWorkerCadre);
  // Programme staff only see the programme areas (components) they work on.
  const isProgrammeStaff = !isHealthWorker && Boolean(programmeStaffCadre);
  const areaKey = programmeAreas.join(",");
  const staffAreas = isProgrammeStaff && programmeAreas.length ? programmeAreas : null;
  const hasArea = (a: string) => !staffAreas || staffAreas.includes(a as never);
  // Safeguarding Officers (who are not administrators) only see safeguarding.
  const safeguardingOnly = isOfficer && !canConfigure;
  const can = useMemo(() => (key: Parameters<typeof teamCan>[0]) => {
    if (isFocalPerson) {
      if (key === "view_records" || key === "view_dashboards") return true;
      if (["record_services", "manage_cdds", "confirm_cases", "manage_households", "home_visits", "dispatch_visits", "accept_referrals"].includes(key)) return focalCanWrite;
      if (key === "edit_records") return Object.values(facilityLevels).includes("manage");
      return false;
    }
    if (safeguardingOnly) return key === "view_safeguarding";
    if (isProgrammeStaff && ["view_safeguarding", "manage_team", "configure_module", "manage_facilities"].includes(key)) return false;
    if (isHealthWorker && ["view_safeguarding", "assess_livelihood", "verify_livelihood", "manage_livelihood", "export_data", "manage_team", "configure_module", "manage_facilities"].includes(key)) return false;
    return teamCan(key);
  }, [teamCan, isHealthWorker, isProgrammeStaff, safeguardingOnly, isFocalPerson, focalCanWrite, facilityLevels]);
  // Per-member setup from the Project team register: component access and
  // Overview dashboard grants only narrow listed, non-administrator members.
  const memberPerms = !canConfigure && onTeamRegister ? teamMember?.permissions : undefined;
  const memberComponentsKey = (memberPerms?.components || []).join(",");
  const componentFilter = useMemo(() => {
    const base = isFocalPerson ? isFacilityClinicalComponent
      : isHealthWorker ? isHealthWorkerComponent
      : staffAreas ? componentInAreas(staffAreas)
      : undefined;
    const mine = memberComponentFilter(memberPerms);
    if (base && mine) return (c: { key: string; label?: string }) => base(c) && mine(c);
    return base || mine;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHealthWorker, areaKey, isProgrammeStaff, isFocalPerson, memberComponentsKey]);
  const dashAllowed = (key: string) => memberDashboardAllowed(memberPerms, key);
  // Listed members granted feedback sharing see the QR code and public link —
  // never the confidential reports.
  const canShareFeedback = canConfigure || Boolean(memberPerms?.feedback_share);
  const feedbackShareOnly = !canConfigure && !isOwner && !isSuperAdmin && Boolean(memberPerms?.feedback_share);
  // Health workers and programme staff always see the General dashboard and the
  // dashboards of their own components (scoped via componentFilter below).
  const canDash = can("view_dashboards") || ((isHealthWorker || isProgrammeStaff) && can("view_records"));
  const [view, setView] = useState<WorkspaceView>(() => canDash ? "overview" : "records");

  // Designated Programme Officers (plus Super Admins) see and fill the
  // Programme Report Form built on the project logframe.
  const [isProgrammeOfficer, setIsProgrammeOfficer] = useState(false);
  useEffect(() => {
    if (!projectId) return;
    void (supabase as unknown as { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown }> })
      .rpc("is_programme_officer", { _project_id: projectId })
      .then(({ data }) => setIsProgrammeOfficer(Boolean(data)))
      .catch(() => setIsProgrammeOfficer(false));
  }, [projectId]);
  const canReport = !isFocalPerson && (canConfigure || (viewAs ? viewAs.role === "programme_officer" : isProgrammeOfficer));

  // A scanned Hand Card link (?case=...) must land on the records list so the
  // record can open straight away, even for people who default to the dashboard.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("case")) setView("records");
  }, []);


  const active: ProgrammeModuleRow | undefined = useMemo(
    () => modules.find((m) => m.id === activeId) || modules[0],
    [modules, activeId],
  );
  const dashConfig = useMemo(() => {
    if (!active) return undefined;
    const c = normalizeConfig(active.config);
    return componentFilter ? { ...c, components: c.components.filter(componentFilter) } : c;
  }, [active, componentFilter]);

  const {
    beneficiaries, loading: loadingBeneficiaries, reload: reloadBeneficiaries,
    upsert: upsertBeneficiary,
  } = useBeneficiaries(active?.id);

  /**
   * A facility focal person is a non-administrator who has been granted access
   * to one or more registered health facilities. They only work with the
   * records — and programme components — of those facilities. Everyone else
   * keeps the full view.
   */
  const scopedBeneficiaries = useMemo(() => {
    let rows = beneficiaries;
    if (viewAs) rows = rows.filter((b) => viewAsRecordVisible(viewAs, b as unknown as { state?: string; facility_id?: string }));
    if (!isFocalPerson) return rows;
    return rows.filter((b) =>
      Boolean(facilityLevels[(b as unknown as { facility_id?: string }).facility_id || ""]));
  }, [beneficiaries, facilityLevels, isFocalPerson, viewAs]);
  const { facilities: viewAsFacilities } = useFacilities(canViewAs ? projectId : undefined);
  const viewAsStates = useMemo(() => Array.from(new Set([
    ...viewAsFacilities.map((f) => f.state || ""),
    ...beneficiaries.map((b) => (b as unknown as { state?: string }).state || ""),
  ].map((x) => x.trim()).filter(Boolean))).sort(), [viewAsFacilities, beneficiaries]);
  useEffect(() => { setSelected(null); setView(viewAs ? (viewAs.role === "facility_focal" ? "records" : "overview") : "overview"); }, [viewAs]);

  const allNavGroups: WorkspaceNavGroup[] = [
    {
      label: "Overview",
      hub: { key: "overview", label: "Overview", description: "Executive view of people, services and outcomes", icon: BarChart3 },
      items: [
        { key: "dashboard", label: "General dashboard", description: "Project-wide outcomes, alerts and service performance", icon: BarChart3, show: canDash && dashAllowed("dashboard") },
        { key: "journey", label: "Beneficiary journey", description: "Change, feedback and service reach", icon: Route, show: canDash && dashAllowed("journey") },
        { key: "facility", label: "Facility dashboard", description: "Facility caseloads and referral performance", icon: Hospital, show: canDash && dashAllowed("facility") },
        { key: "clusters", label: "Community clusters", description: "Geographic concentrations and community patterns", icon: Layers, show: canDash && dashAllowed("clusters") },
        { key: "graduation", label: "Graduation pathway", description: "Livelihood mapping, selection, delivery stages and graduation", icon: Briefcase, show: canDash && hasArea("livelihood") && dashAllowed("graduation") },
      ],
    },
    {
      label: "People & care",
      hub: { key: "people", label: "People & care", description: "Manage beneficiaries, households, follow-ups and support services for integrated NTD care and inclusion", icon: Users },
      items: [
        { key: "records", label: "Beneficiary records", description: "Find, register and open individual records", icon: LayoutGrid, show: can("view_records") },
        { key: "followups", label: "Follow-ups & referrals", description: "Upcoming visits and referral traffic", icon: CalendarClock, show: can("view_records") },
        { key: "households", label: "Households & MDA", description: "Household members, treatment rounds and water points", icon: Home, show: (isFocalPerson || hasArea("ntd") || hasArea("wash")) && (can("manage_households") || canDash) },
        { key: "casesearch", label: "CDD case search", description: "MMDP case finding, review and registration", icon: Search, show: (isFocalPerson || hasArea("ntd") || hasArea("eye")) && (can("manage_cdds") || can("confirm_cases") || can("view_records")) },
        { key: "livelihood", label: "Livelihood & empowerment", description: "Assessments, shortlists and verification", icon: Briefcase, show: !isHealthWorker && hasArea("livelihood") && (can("view_records") || can("view_dashboards")) },
      ],
    },
    {
      label: "Intelligence",
      hub: { key: "intelligence", label: "Intelligence", description: "Predictive analytics for targeted action and greater impact", icon: Activity },
      items: [
        { key: "network", label: "Transmission network", description: "Household, kinship and WASH relationships", icon: Network, show: (hasArea("ntd") || hasArea("wash")) && canDash },
        { key: "risk", label: "Follow-up risk & CHEW visits", description: "Prioritised risk and dispatched visits", icon: Activity, show: canDash },
        { key: "exchange", label: "Data exchange", description: "DHIS2, LMIS, FHIR, ADX and SDMX", icon: Share2, show: canConfigure || (can("view_dashboards") && !isHealthWorker && !isProgrammeStaff) },
      ],
    },
    {
      label: "Protection",
      hub: { key: "protection", label: "Protection", description: "Safeguarding, secure feedback and confidential case management", icon: ShieldCheck },
      items: [
        { key: "safeguarding_dashboard", label: "Safeguarding dashboard", description: "Restricted caseload oversight and outcomes", icon: ShieldAlert, show: isOfficer && can("view_safeguarding") },
        { key: "safeguarding", label: "Safeguarding cases", description: "Restricted concerns, actions and secure notes", icon: ShieldCheck, show: isOfficer && can("view_safeguarding") },
        { key: "feedback", label: "Community feedback", description: "Public complaints & feedback form, QR code and reports", icon: MessageSquareHeart, show: canConfigure || can("view_records") || canDash || canShareFeedback },
      ],
    },
  ];

  const navGroups = allNavGroups.map((group) => ({ ...group,
    items: group.items.map((item) => ({ ...item, show: item.show && (!isFocalPerson || FACILITY_WORKSPACE_VIEWS.has(item.key)) })),
  }));
  const accessLoading = permissionsLoading || facilityAccessLoading;
  const canRecords = can("view_records") || can("view_dashboards");
  const canGuide = canRecords;
  const canAssessments = !isFocalPerson && Boolean(projectId) && !safeguardingOnly && (canConfigure || can("view_records") || canDash);
  const canBrain = !isFocalPerson && canRecords;
  const [brainMounted, setBrainMounted] = useState(false);
  const [lastRecordsView, setLastRecordsView] = useState<WorkspaceView>("records");
  const isSide = (v: WorkspaceView) => v === "brain" || v === "guide" || v === "report" || v === "assessments";
  const openTab = (t: MajorTab) => {
    if (t === "records") { if (isSide(view)) setView(lastRecordsView); return; }
    if (!isSide(view)) setLastRecordsView(view);
    if (t === "brain") setBrainMounted(true);
    setView(t);
  };

  // The Overview card page is the workspace homepage: whoever can see it opens
  // there. A scanned Case ID link still goes straight to the record.
  const landedRef = useRef(false);
  useEffect(() => {
    if (accessLoading) return;
    const hubViews = navGroups.flatMap((group) => group.hub && group.items.some((item) => item.show) ? [group.hub.key] : []);
    const visibleViews: WorkspaceView[] = [...hubViews, ...navGroups.flatMap((group) => group.items).filter((item) => item.show).map((item) => item.key), ...(canReport ? ["report" as const] : []), ...(canAssessments ? ["assessments" as const] : [])];
    if (!landedRef.current) {
      landedRef.current = true;
      if (new URLSearchParams(window.location.search).has("case")) return;
      const landing: WorkspaceView = visibleViews.includes("overview") ? "overview"
        : visibleViews.includes("dashboard") ? "dashboard"
        : visibleViews.includes("records") ? "records"
        : visibleViews[0] || "records";
      setView(landing);
      return;
    }
    if ((view === "brain" && canBrain) || (view === "guide" && canGuide)) return;
    // Manage-menu pages are not navigation items; keep them open for people allowed to manage.
    const canManageTeam = canConfigure || can("manage_team");
    if ((view === "team" && (canManageTeam || onTeamRegister)) || (view === "donors" && canManageTeam)) return;
    if (!visibleViews.includes(view)) setView(visibleViews.includes("records") ? "records" : visibleViews[0] || "records");
  }, [accessLoading, view, canConfigure, canReport, canAssessments, canBrain, canGuide, isFocalPerson, isOfficer, onTeamRegister, isProgrammeStaff, areaKey]);


  useEffect(() => {
    bindQueueAutoFlush();
    const onQueue = () => setPending(queueCount());
    window.addEventListener("programme-module-queue", onQueue);
    return () => window.removeEventListener("programme-module-queue", onQueue);
  }, []);

  const createModule = async (templateKey: string) => {
    if (!projectId) return;
    const template = MODULE_TEMPLATES.find((t) => t.key === templateKey);
    if (!template) return;
    setCreating(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("programme_modules")
        .insert({
          project_id: projectId,
          name: template.name,
          description: template.description,
          config: template.config as unknown as Record<string, unknown>,
          created_by: auth.user?.id,
        } as never)
        .select("id")
        .single();
      if (error) throw error;
      toast({ title: "Programme module added", description: template.name });
      setGalleryOpen(false);
      await reload();
      setActiveId((data as { id: string }).id);
    } catch (e) {
      toast({ title: "Could not add module", description: (e as Error).message, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const removeActiveModule = async () => {
    if (!active || !isSuperAdmin || removeConfirm.trim() !== active.name) return;
    setRemoving(true);
    try {
      const { error } = await supabase.from("programme_modules").delete().eq("id", active.id);
      if (error) throw error;
      toast({
        title: "Programme module deleted",
        description: `${active.name} was removed from this project.`,
      });
      setRemoveOpen(false);
      setRemoveConfirm("");
      setSelected(null);
      setActiveId("");
      await reload();
    } catch (e) {
      toast({ title: "Could not delete module", description: (e as Error).message, variant: "destructive" });
    } finally {
      setRemoving(false);
    }
  };

  const sync = async () => {
    const { sent, failed } = await flushQueue();
    setPending(queueCount());
    void reloadBeneficiaries();
    toast({
      title: failed ? "Some records could not be sent" : "Sync complete",
      description: `${sent} sent${failed ? `, ${failed} still queued` : ""}`,
      variant: failed ? "destructive" : undefined,
    });
  };

  if (!projectId) {
    return (
      <Card className="p-8 text-center text-muted-foreground">
        Select a project to open its longitudinal beneficiary records.
      </Card>
    );
  }

  if (accessLoading) return <div role="status" className="p-8 text-center text-muted-foreground">Checking facility access…</div>;

  if (isFocalPerson && !FACILITY_WORKSPACE_VIEWS.has(view)) return <div role="status" className="p-8 text-center text-muted-foreground">Opening your facility workspace…</div>;

  if (!accessLoading && selected && active && (!isFocalPerson || facilityLevels[selected.facility_id || ""])) {
    const selectedFacility = (selected as unknown as { facility_id?: string }).facility_id || "";
    return (
      <div className="lbr-type"><BeneficiaryRecord
        beneficiary={selected}
        config={dashConfig || normalizeConfig(active.config)}
        moduleId={active.id}
        projectId={projectId}
        onBack={() => setSelected(null)}
        canManage={canConfigure || facilityLevels[selectedFacility] === "manage"}
        canRecord={!isFocalPerson || ["record", "manage"].includes(facilityLevels[selectedFacility])}
        componentsVisible={!isFocalPerson || Boolean(facilityLevels[selectedFacility])}
        componentFilter={componentFilter}
        onChanged={() => void reloadBeneficiaries()}
      /></div>
    );
  }

  return (
    <div className="lbr-type space-y-3 font-report">
      {canConfigure && <DevicePreviewDialog open={devicePreviewOpen} onOpenChange={setDevicePreviewOpen} projectId={projectId} />}
      <div className="flex flex-col gap-3 rounded-lg border border-health-blue/15 bg-card p-3 shadow-soft lg:flex-row lg:items-center">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-health-blue text-primary-foreground"><Layers className="h-5 w-5" /></span>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase text-health-blue">Integrated case and beneficiary management</p>
            <h2 className="truncate font-report-display text-lg font-bold text-health-ink">Longitudinal Beneficiary Records</h2>
          </div>
        </div>
        {modules.length > 0 && (
          <Select value={active?.id || ""} onValueChange={setActiveId}>
            <SelectTrigger className="w-full bg-health-surface lg:w-[260px]"><SelectValue placeholder="Select module" /></SelectTrigger>
            <SelectContent className="z-[1200] bg-popover">
              {modules.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        <div className="flex-1" />
        <div className="flex flex-wrap gap-2">
        {pending > 0 && (
          <Button variant="outline" size="sm" className="gap-1" onClick={sync}>
            <CloudOff className="h-4 w-4" /> {pending} queued — sync now
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={() => void reload()} aria-label="Reload modules">
          <RefreshCw className="h-4 w-4" />
        </Button>
        {canConfigure && (
          <Button size="sm" className="gap-1" onClick={() => setGalleryOpen(true)} aria-label="Add programme module">
            <Plus className="h-4 w-4" /> Add module
          </Button>
        )}
        {isSuperAdmin && active && (
          <Button
            variant="destructive"
            size="sm"
            className="gap-1"
            onClick={() => { setRemoveConfirm(""); setRemoveOpen(true); }}
            aria-label={`Delete ${active.name}`}
          >
            <Trash2 className="h-4 w-4" /> Delete module
          </Button>
        )}
        </div>
      </div>

      {canViewAs && <ViewAsDialog key={viewAsOpen ? "o" : "c"} open={viewAsOpen} onOpenChange={setViewAsOpen} initial={viewAs}
        components={normalizeConfig(active?.config || {}).components.filter((c) => !c.hidden).map((c) => ({ key: c.key, label: c.label }))}
        facilities={viewAsFacilities} states={viewAsStates} onApply={setViewAs} />}
      {viewAs && <ViewAsBanner config={viewAs} facilityName={viewAsFacilities.find((f) => f.id === viewAs.facilityId)?.name} onChange={() => setViewAsOpen(true)} onExit={() => setViewAs(null)} />}
      {!viewAs && <WorkflowTour can={(k) => (k === "view_dashboards" ? canDash : can(k as Parameters<typeof teamCan>[0]))} canConfigure={canConfigure} isOfficer={isOfficer} ready={!accessLoading && Boolean(active)} visibleViews={[...navGroups.flatMap((g) => g.items).filter((i) => i.show).map((i) => i.key), ...(canBrain ? ["brain"] : []), ...(canGuide ? ["guide"] : [])]} components={(dashConfig?.components || []).filter((c) => !c.hidden)} onNavigate={(v) => { if (v === "brain" || v === "guide") openTab(v); else setView(v as WorkspaceView); }} />}

      {!accessLoading && (canRecords || canReport) && active && (
        <WorkspaceMajorTabs selected={isSide(view) ? view as MajorTab : "records"} canReport={canReport} canBrain={canBrain} canRecords={canRecords} canGuide={canGuide} canAssessments={canAssessments} onSelect={openTab} />
      )}

      {!accessLoading && !isSide(view) && <WorkspaceNavigation groups={navGroups} view={view} onViewChange={setView} administration={isFocalPerson ? <Button variant="outline" size="sm" onClick={() => openWorkflowTour()}><Compass className="mr-2 h-4 w-4" /> Guided tour</Button> :
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button variant="outline" size="sm" className="gap-2"><SlidersHorizontal className="h-4 w-4" /> Manage<ChevronDown className="h-3.5 w-3.5" /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuLabel>Administration</DropdownMenuLabel><DropdownMenuSeparator />
            {canViewAs && <DropdownMenuItem onSelect={() => setViewAsOpen(true)}><Eye className="mr-2 h-4 w-4" /> View as another user</DropdownMenuItem>}
            <DropdownMenuItem onSelect={() => openWorkflowTour()}><Compass className="mr-2 h-4 w-4" /> Guided tour</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setRegistryOpen(true)}><Building2 className="mr-2 h-4 w-4" /> Health facilities</DropdownMenuItem>
            {canConfigure && <DropdownMenuItem onSelect={() => setDevicePreviewOpen(true)}><Layers className="mr-2 h-4 w-4" /> Device preview</DropdownMenuItem>}
            {canConfigure && <DropdownMenuItem onSelect={() => { setFocalFacilityId(undefined); setFocalOpen(true); }}><Users className="mr-2 h-4 w-4" /> Facility teams</DropdownMenuItem>}
            {(canConfigure || can("manage_team") || onTeamRegister) && <DropdownMenuItem onSelect={() => setView("team")}><Users className="mr-2 h-4 w-4" /> Project team</DropdownMenuItem>}
            {(canConfigure || can("manage_team")) && <DropdownMenuItem onSelect={() => setView("donors")}><Globe className="mr-2 h-4 w-4" /> Donor portal</DropdownMenuItem>}
            {canConfigure && <DropdownMenuItem onSelect={() => setDrugsOpen(true)}><Settings2 className="mr-2 h-4 w-4" /> mhGAP medicines</DropdownMenuItem>}
            {canConfigure && <DropdownMenuItem onSelect={() => setWhatsappOpen(true)}><MessageCircle className="mr-2 h-4 w-4" /> WhatsApp reminders</DropdownMenuItem>}
            {canConfigure && <DropdownMenuItem onSelect={() => setSmsOpen(true)}><MessageCircle className="mr-2 h-4 w-4" /> SMS reminders</DropdownMenuItem>}
            {canConfigure && <DropdownMenuItem onSelect={() => setOfficersOpen(true)}><ShieldCheck className="mr-2 h-4 w-4" /> Safeguarding officers</DropdownMenuItem>}
            {canConfigure && active && <DropdownMenuItem onSelect={() => setConfigOpen(true)}><Settings2 className="mr-2 h-4 w-4" /> Configure module</DropdownMenuItem>}
            {isSuperAdmin && <DropdownMenuItem onSelect={() => setProjectsOpen(true)}><Layers className="mr-2 h-4 w-4" /> Records on projects</DropdownMenuItem>}
            {canConfigure && <DropdownMenuItem onSelect={() => setDeleteRequestsOpen(true)} className="text-destructive"><ShieldAlert className="mr-2 h-4 w-4" /> Deletion requests</DropdownMenuItem>}
          </DropdownMenuContent>
        </DropdownMenu>
      } />}



      {!loading && modules.length === 0 && (
        <Card className="space-y-3 p-10 text-center">
          <p className="text-muted-foreground">
            No longitudinal record module on this project yet.
          </p>
          {canConfigure ? (
            <Button className="gap-1" onClick={() => setGalleryOpen(true)}>
              <Plus className="h-4 w-4" /> Add programme module
            </Button>
          ) : (
            <p className="text-sm text-muted-foreground">Ask an administrator to add one.</p>
          )}
        </Card>
      )}

      {!accessLoading && active && view === "records" && (
        <RecordQualityBar
          beneficiaries={scopedBeneficiaries}
          canMerge={canConfigure}
          onOpen={setSelected}
          onMerged={() => void reloadBeneficiaries()}
        />
      )}
      {!accessLoading && active && view === "records" && (
        <BeneficiaryList
          beneficiaries={scopedBeneficiaries}
          config={normalizeConfig(active.config)}
          loading={loadingBeneficiaries}
          projectId={projectId}
          moduleId={active.id}
          onOpen={setSelected}
          onRegister={() => setRegisterOpen(true)}
          canRegister={can("edit_records")}
          onRefresh={() => void reloadBeneficiaries()}
        />
      )}

      {!accessLoading && active && view === "people" && projectId && (
        <PeopleCareHub projectId={projectId} beneficiaries={scopedBeneficiaries}
          items={navGroups.find((g) => g.hub?.key === "people")?.items.filter((i) => i.show) || []}
          onOpen={setView} />
      )}

      {!accessLoading && active && view === "overview" && (
        <OverviewHub beneficiaries={scopedBeneficiaries} pending={pending}
          items={navGroups.find((g) => g.hub?.key === "overview")?.items.filter((i) => i.show) || []}
          onOpen={setView} />
      )}

      {!accessLoading && active && view === "intelligence" && (
        <IntelligenceHub beneficiaries={scopedBeneficiaries} pending={pending}
          components={dashConfig?.components.length || 0}
          items={navGroups.find((g) => g.hub?.key === "intelligence")?.items.filter((i) => i.show) || []}
          onOpen={setView} />
      )}

      {!accessLoading && active && view === "protection" && projectId && (
        <ProtectionHub projectId={projectId}
          items={navGroups.find((g) => g.hub?.key === "protection")?.items.filter((i) => i.show) || []}
          onOpen={setView} />
      )}

      {!accessLoading && active && view === "assessments" && projectId && canAssessments && <QuizBuilder key={projectId} projectId={projectId} />}

      {!accessLoading && active && view === "report" && projectId && canReport && (
        <ProgrammeReportForm projectId={projectId} canManage={canConfigure || isSuperAdmin} />
      )}
      {!accessLoading && active && view === "dashboard" && (
        <GeneralDashboard
          projectId={projectId}
          moduleId={active.id}
          config={dashConfig || normalizeConfig(active.config)}
          beneficiaries={scopedBeneficiaries}
          allowedFacilityIds={isFocalPerson ? Object.keys(facilityLevels) : []}
          isSafeguardingOfficer={isOfficer}
          canRegister={can("edit_records")}
          canExchange={canConfigure}
          onNavigate={setView}
          onRegister={() => setRegisterOpen(true)}
          onOpenBeneficiary={(beneficiary) => { setSelected(beneficiary); setView("records"); }}
        />
      )}

      {view === "team" && (
        <div className="space-y-4">
          <ProjectTeamPanel
            projectId={projectId}
            moduleId={active?.id}
            canManage={canConfigure || can("manage_team")}
            components={(normalizeConfig(active?.config).components || []).filter((c) => !c.hidden).map((c) => ({ key: c.key, label: c.label }))}
          />
        </div>
      )}
      {view === "donors" && projectId && (canConfigure || can("manage_team")) && (
        <DonorAccessPanel projectId={projectId} canManage />
      )}

      {view === "journey" && (
        <JourneyDashboard
          projectId={projectId}
          moduleId={active?.id}
          config={dashConfig}
          allowedFacilityIds={isFocalPerson ? Object.keys(facilityLevels) : []}
          onOpenBeneficiary={(b) => { setSelected(b); setView("records"); }}
        />
      )}

      {view === "facility" && (
        <FacilityDashboard
          projectId={projectId}
          canSeeAllFacilities={canConfigure}
          onOpenBeneficiary={(b) => { setSelected(b); setView("records"); }}
        />
      )}

      {view === "followups" && (
        <FollowUpsPanel
          projectId={projectId}
          allowedFacilityIds={isFocalPerson ? Object.keys(facilityLevels) : null}
          onOpenBeneficiary={(b) => { setSelected(b); setView("records"); }}
        />
      )}

      {view === "households" && (
        <HouseholdsPanel
          projectId={projectId}
          moduleId={active?.id}
          beneficiaries={scopedBeneficiaries}
          facilityScoped={isFocalPerson}
          canManage={canConfigure || Object.values(facilityLevels).includes("manage") || Object.values(facilityLevels).includes("record")}
          onOpenBeneficiary={(b) => { setSelected(b); setView("records"); }}
          onChanged={() => void reloadBeneficiaries()}
        />
      )}

      {view === "clusters" && (
        <ClusterDashboard
          projectId={projectId}
          moduleId={active?.id}
          beneficiaries={scopedBeneficiaries}
          allowedFacilityIds={isFocalPerson ? Object.keys(facilityLevels) : null}
        />
      )}

      {view === "graduation" && projectId && (
        <GraduationDashboard projectId={projectId} beneficiaries={scopedBeneficiaries} onOpenBeneficiary={(b) => { setSelected(b); setView("records"); }} />
      )}

      {view === "guide" && canGuide && <FieldGuidePanel moduleId={active?.id} />}
      {brainMounted && canBrain && (
        <div className={view === "brain" ? "" : "hidden"}>
          <BeneficiaryBrainPanel moduleId={active?.id} projectId={projectId} visible={view === "brain"}
            onOpenBeneficiary={(b) => { setSelected(b); setView("records"); }} />
        </div>
      )}
      {view === "network" && (
        <KinshipGraphPanel
          projectId={projectId}
          moduleId={active?.id}
          beneficiaries={scopedBeneficiaries}
          onOpenBeneficiary={(b) => { setSelected(b); setView("records"); }}
        />
      )}

      {view === "risk" && (
        <LtfuRiskPanel
          projectId={projectId}
          moduleId={active?.id}
          beneficiaries={scopedBeneficiaries}
          canDispatch={canConfigure || can("dispatch_visits")
            || (!onTeamRegister && Object.values(facilityLevels).some((l) => l !== "view"))}
          canReportVisits={canConfigure || can("home_visits")
            || (!onTeamRegister && Object.values(facilityLevels).some((l) => l !== "view"))}
          onOpenBeneficiary={(b) => { setSelected(b); setView("records"); }}
        />
      )}

      {view === "casesearch" && (
        <CddCaseSearchPanel
          projectId={projectId}
          moduleId={active?.id}
          canRecord={canConfigure || can("manage_cdds")
            || (!onTeamRegister && Object.values(facilityLevels).some((l) => l !== "view"))}
          canConfirm={canConfigure || can("confirm_cases")}
          allowedFacilityIds={isFocalPerson ? Object.keys(facilityLevels) : null}
          onBeneficiaryRegistered={() => void reloadBeneficiaries()}
          onCompleteRecord={(row) => setCompleting(row)}
        />
      )}

      {view === "livelihood" && projectId && (
        <LivelihoodPanel
          projectId={projectId}
          moduleId={active?.id}
          beneficiaries={scopedBeneficiaries}
          canManage={canConfigure || can("manage_livelihood")}
          canAssess={canConfigure || can("assess_livelihood") || can("manage_livelihood")}
          canVerify={canConfigure || can("verify_livelihood") || can("manage_livelihood")}
          onChanged={() => void reloadBeneficiaries()}
          onOverview={() => setView("graduation")}
          onOpenBeneficiary={(b) => { setSelected(b); setView("records"); }}
        />
      )}

      {view === "exchange" && projectId && (
        <HealthExchangePanel projectId={projectId} canManage={canConfigure} />
      )}

      {view === "feedback" && projectId && (
        <FeedbackReportsPanel
          projectId={projectId}
          projectName={active?.name || "this project"}
          canManage={isOwner || isSuperAdmin}
          shareOnly={feedbackShareOnly}
        />
      )}

      {view === "safeguarding" && (
        <SafeguardingPanel
          projectId={projectId}
          moduleId={active?.id}
          beneficiaries={scopedBeneficiaries}
          isOfficer={isOfficer}
        />
      )}

      {view === "safeguarding_dashboard" && (
        <SafeguardingDashboard
          projectId={projectId}
          isOfficer={isOfficer}
          allowedFacilityIds={isFocalPerson ? Object.keys(facilityLevels) : []}
        />
      )}

      <DeleteRequestsPanel
        open={deleteRequestsOpen}
        onOpenChange={setDeleteRequestsOpen}
        projectId={projectId}
        onDecided={() => void reloadBeneficiaries()}
      />

      <ModuleProjectsDialog
        open={projectsOpen}
        onOpenChange={setProjectsOpen}
        allowed={isSuperAdmin}
        onChanged={() => void reload()}
      />

      <SafeguardingOfficers
        open={officersOpen}
        onOpenChange={setOfficersOpen}
        projectId={projectId}
        isOwner={isOwner}
        onChanged={reloadOfficerAccess}
      />




      <MhgapDrugsManager open={drugsOpen} onOpenChange={setDrugsOpen} projectId={projectId} />
      <FacilityFocalPersons
        open={focalOpen}
        onOpenChange={setFocalOpen}
        projectId={projectId}
        initialFacilityId={focalFacilityId}
      />
      <FacilityRegistry
        open={registryOpen}
        onOpenChange={setRegistryOpen}
        projectId={projectId}
        canManage={canConfigure}
        onManageTeam={(id) => { setFocalFacilityId(id); setFocalOpen(true); }}
      />

      {/* Template gallery */}
      <Dialog open={galleryOpen} onOpenChange={setGalleryOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Add a programme module</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {MODULE_TEMPLATES.map((t) => (
              <Card key={t.key} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <h3 className="font-semibold text-foreground">{t.name}</h3>
                  <p className="text-sm text-muted-foreground">{t.description}</p>
                  <Badge variant="outline" className="mt-2">
                    {t.config.components.length} component{t.config.components.length === 1 ? "" : "s"}
                  </Badge>
                </div>
                <Button disabled={creating} onClick={() => createModule(t.key)}>Use template</Button>
              </Card>
            ))}
            <p className="text-xs text-muted-foreground">
              Every template is fully editable afterwards — components, sections, questions, validation,
              skip logic, workflow, Case ID format and branding.
            </p>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={removeOpen}
        onOpenChange={(open) => {
          if (!removing) {
            setRemoveOpen(open);
            if (!open) setRemoveConfirm("");
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Delete programme module?</DialogTitle></DialogHeader>
          {active && (
            <div className="space-y-4">
              <div className="rounded-md border border-destructive/25 bg-destructive/5 p-3">
                <p className="font-semibold text-foreground">{active.name}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  This permanently deletes the module and all {beneficiaries.length} currently loaded beneficiary
                  records under it, including linked services, referrals, follow-ups and history. This cannot be undone.
                </p>
              </div>
              <div>
                <Label htmlFor="confirm-module-removal" className="text-xs">
                  Type the module name to confirm
                </Label>
                <Input
                  id="confirm-module-removal"
                  className="mt-1"
                  value={removeConfirm}
                  onChange={(event) => setRemoveConfirm(event.target.value)}
                  placeholder={active.name}
                  autoComplete="off"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" disabled={removing} onClick={() => setRemoveOpen(false)}>Cancel</Button>
                <Button
                  variant="destructive"
                  disabled={removing || removeConfirm.trim() !== active.name}
                  onClick={() => void removeActiveModule()}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  {removing ? "Deleting…" : "Delete permanently"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {active && (
        <>
          <BeneficiaryFormDialog
            open={registerOpen} onOpenChange={setRegisterOpen}
            moduleId={active.id} projectId={projectId}
            config={normalizeConfig(active.config)}
            onSaved={(row) => {
              if (row) upsertBeneficiary(row);
              else void reloadBeneficiaries();
            }}
          />
          {completing && (
            <BeneficiaryFormDialog
              key={completing.id}
              open onOpenChange={(v) => { if (!v) setCompleting(null); }}
              moduleId={active.id} projectId={projectId}
              config={normalizeConfig(active.config)}
              existing={completing}
              title="Complete this beneficiary's record"
              notice={`${completing.full_name} now has a Case ID. What the CDD and clinician recorded has been carried over — finish the rest of the registration so this person's data matches every other beneficiary.`}
              onSaved={(row) => {
                setCompleting(null);
                if (row) upsertBeneficiary(row);
                else void reloadBeneficiaries();
              }}
            />
          )}
          <ModuleConfigurator
            open={configOpen} onOpenChange={setConfigOpen}
            moduleId={active.id} moduleName={active.name}
            config={normalizeConfig(active.config)}
            onSaved={() => void reload()}
          />
        </>
      )}
      <WhatsAppRemindersDialog open={whatsappOpen} onOpenChange={setWhatsappOpen} projectId={projectId} />
      <SmsRemindersDialog open={smsOpen} onOpenChange={setSmsOpen} projectId={projectId} />
    </div>
  );
};

export default ProgrammeModuleWorkspace;

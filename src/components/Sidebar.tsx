import { useState } from "react";
import {
  LayoutDashboard, FileText, FolderOpen, BarChart3, Upload,
  Settings, HelpCircle, X, ChevronRight, ChevronLeft, Users, Shield,
  Briefcase, LayoutTemplate, Eye, Brain, Calculator, MessageSquareText,
  Repeat, Globe, Navigation, ShieldCheck, MapPin, BookOpen,
  ArrowRightLeft, Stethoscope, Accessibility, HandMetal, Sparkles, Satellite,
  PanelLeftClose, PanelLeftOpen, History, Fingerprint, ScanLine, Nfc,
  Share2, FlaskConical, Watch, Radio,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useLanguage } from "@/hooks/useLanguage";
import { RESTRICTED_PAGE_IDS } from "@/hooks/usePageAccess";
import acgLogo from "@/assets/acg-logo.png";

type AppRole = "super_admin" | "systems_admin" | "user";

interface Profile {
  first_name: string;
  last_name: string;
  designation: string;
  other_designation?: string | null;
}

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  activeTab: string;
  onTabChange: (tab: string) => void;
  profile?: Profile | null;
  role?: AppRole | null;
  isAdmin?: boolean;
  isOwner?: boolean;
  canAccessPage?: (pageId: string) => boolean;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

const getDesignationLabel = (designation: string, other?: string | null) => {
  const labels: Record<string, string> = {
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
    other: other || "Other",
  };
  return labels[designation] || designation;
};

const getRoleBadge = (role?: AppRole | null) => {
  if (role === "super_admin") return { label: "Super Admin", color: "bg-destructive" };
  if (role === "systems_admin") return { label: "Systems Admin", color: "bg-accent" };
  return null;
};

const Sidebar = ({ isOpen, onClose, activeTab, onTabChange, profile, role, isAdmin, isOwner, canAccessPage, collapsed, onToggleCollapse }: SidebarProps) => {
  const roleBadge = getRoleBadge(role);
  const { t } = useLanguage();

  const menuItems = [
    { id: "dashboard", label: t("nav.dashboard"), icon: LayoutDashboard, adminOnly: false },
    { id: "supervisor", label: t("nav.supervisor"), icon: Eye, adminOnly: true },
    { id: "forms", label: t("nav.forms"), icon: FileText, adminOnly: false },
    { id: "cases", label: t("nav.cases"), icon: Briefcase, adminOnly: false },
    { id: "templates", label: t("nav.templates"), icon: LayoutTemplate, adminOnly: true },
    { id: "projects", label: t("nav.projects"), icon: FolderOpen, adminOnly: true },
    { id: "data", label: t("nav.analytics"), icon: BarChart3, adminOnly: true },
    { id: "ml", label: "Machine Learning", icon: Brain, adminOnly: true },
    { id: "math-modeling", label: "Math Modeling", icon: Calculator, adminOnly: true },
    { id: "integrations", label: t("nav.integrations"), icon: Upload, adminOnly: true },
    { id: "users", label: t("nav.users"), icon: Users, adminOnly: true },
    { id: "feedback", label: "Feedback", icon: MessageSquareText, adminOnly: true },
    { id: "iteration-analysis", label: "Iteration Analysis", icon: Repeat, adminOnly: true },
    { id: "statistics", label: "Statistical Analysis", icon: Calculator, adminOnly: true },
    { id: "spatial-analysis", label: "Spatial Analysis", icon: Globe, adminOnly: true },
    { id: "field-intelligence", label: "Field Intelligence", icon: Navigation, adminOnly: true },
    { id: "surveillance", label: "Surveillance Log", icon: Eye, adminOnly: true },
    { id: "data-quality", label: "Data Quality", icon: ShieldCheck, adminOnly: true },
    { id: "media-analysis", label: "Media Analysis", icon: Sparkles, adminOnly: true },
    { id: "satellite-imagery", label: "Satellite Imagery", icon: Satellite, adminOnly: true },
    { id: "microplanning", label: "Geo Microplanning", icon: MapPin, adminOnly: true },
    { id: "environment", label: "Change Environment", icon: ArrowRightLeft, adminOnly: true },
    { id: "quizzes", label: "Quizzes", icon: BookOpen, adminOnly: false, showForUsers: true },
    { id: "ntd-assessment", label: "NTD Assessment", icon: Stethoscope, adminOnly: false, showForUsers: true },
    { id: "sign-language", label: "Sign Language", icon: HandMetal, adminOnly: false, showForUsers: true },
    { id: "accessibility", label: "Accessibility", icon: Accessibility, adminOnly: false, showForUsers: true },
    { id: "version-history", label: "Version History", icon: History, adminOnly: true },
    { id: "security-audit", label: "Security Audit", icon: Shield, adminOnly: true },
    { id: "image-recognition", label: "Image Recognition", icon: ScanLine, adminOnly: true },
    { id: "nfc-rfid", label: "NFC & RFID", icon: Nfc, adminOnly: false, showForUsers: true },
    { id: "social-share", label: "Share Progress", icon: Share2, adminOnly: false, showForUsers: true },
    { id: "what-if", label: "What-If Analysis", icon: FlaskConical, adminOnly: true },
    { id: "wearable-iot", label: "Wearable & IoT", icon: Watch, adminOnly: true },
  ];

  const bottomItems = [
    { id: "settings", label: t("nav.settings"), icon: Settings },
    { id: "help", label: t("nav.help"), icon: HelpCircle },
  ];

  const visibleMenuItems = menuItems.filter(item => {
    if ((item as any).ownerOnly && !isOwner) return false;
    if (item.adminOnly && !isAdmin) return false;
    if ((item as any).showForUsers && !isAdmin) return true;
    if (RESTRICTED_PAGE_IDS.includes(item.id as any)) {
      if (!canAccessPage) return false;
      return canAccessPage(item.id);
    }
    return true;
  });

  const sidebarWidth = collapsed ? "w-[52px]" : "w-[240px]";

  const NavButton = ({ id, label, icon: Icon, isBottom }: { id: string; label: string; icon: any; isBottom?: boolean }) => {
    const isActive = activeTab === id;
    const btn = (
      <button
        onClick={() => { onTabChange(id); onClose(); }}
        className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-[7px] text-[13px] font-medium transition-all duration-100 ${
          isActive
            ? "bg-sidebar-primary text-sidebar-primary-foreground"
            : "text-sidebar-foreground/65 hover:bg-sidebar-accent hover:text-sidebar-foreground"
        } ${collapsed ? "justify-center px-0" : ""}`}
      >
        <Icon className={`h-[17px] w-[17px] flex-shrink-0 ${collapsed ? "" : ""}`} />
        {!collapsed && <span className="flex-1 text-left truncate">{label}</span>}
        {!collapsed && isActive && <ChevronRight className="h-3.5 w-3.5 flex-shrink-0 opacity-50" />}
      </button>
    );

    if (collapsed) {
      return (
        <Tooltip>
          <TooltipTrigger asChild>{btn}</TooltipTrigger>
          <TooltipContent side="right" sideOffset={8} className="text-xs">{label}</TooltipContent>
        </Tooltip>
      );
    }
    return btn;
  };

  return (
    <TooltipProvider delayDuration={100}>
      <>
        {/* Mobile overlay */}
        {isOpen && (
          <div className="fixed inset-0 z-40 bg-foreground/30 backdrop-blur-sm lg:hidden" onClick={onClose} />
        )}

        {/* Sidebar */}
        <aside
          className={`fixed inset-y-0 left-0 z-50 ${sidebarWidth} transform bg-sidebar border-r border-sidebar-border transition-all duration-200 ease-in-out lg:static lg:translate-x-0 ${
            isOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="flex h-full flex-col">
            {/* Logo */}
            <div className={`flex items-center border-b border-sidebar-border ${collapsed ? "justify-center px-1 py-3" : "justify-between px-3 py-2.5"}`}>
              {collapsed ? (
                <img src={acgLogo} alt="ACG" className="h-7 w-7 rounded-md" />
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <img src={acgLogo} alt="ACG Logo" className="h-8 w-8 rounded-md border border-sidebar-border/50" />
                    <div>
                      <h2 className="text-[14px] font-semibold text-sidebar-foreground leading-tight">Amehnities</h2>
                      <p className="text-[10px] text-sidebar-foreground/50">Data Collection Platform</p>
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" onClick={onClose} className="text-sidebar-foreground/70 hover:bg-sidebar-accent lg:hidden h-7 w-7">
                    <X className="h-4 w-4" />
                  </Button>
                </>
              )}
            </div>

            {/* Collapse toggle - desktop only */}
            <div className="hidden lg:flex items-center justify-center border-b border-sidebar-border py-1">
              <Button variant="ghost" size="sm" onClick={onToggleCollapse} className="h-7 w-7 p-0 text-sidebar-foreground/50 hover:text-sidebar-foreground">
                {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
              </Button>
            </div>

            {/* Navigation */}
            <nav className="flex-1 min-h-0 overflow-y-auto px-1.5 py-1.5 scrollbar-thin">
              {!collapsed && (
                <p className="mb-1 px-2.5 pt-0.5 text-[9px] font-semibold uppercase tracking-widest text-sidebar-foreground/40">
                  {t("nav.main_menu")}
                </p>
              )}
              <div className="space-y-0.5">
                {visibleMenuItems.map((item) => (
                  <NavButton key={item.id} id={item.id} label={item.label} icon={item.icon} />
                ))}
              </div>
            </nav>

            {/* Bottom nav */}
            <div className="border-t border-sidebar-border px-1.5 py-1.5">
              {bottomItems.map((item) => (
                <NavButton key={item.id} id={item.id} label={item.label} icon={item.icon} isBottom />
              ))}
            </div>

            {/* User section */}
            {!collapsed && (
              <div className="border-t border-sidebar-border p-2">
                <div className="flex items-center gap-2 rounded-md bg-sidebar-accent/40 px-2.5 py-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground text-[10px] font-semibold flex-shrink-0">
                    {profile?.first_name?.[0]}{profile?.last_name?.[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-[12px] font-medium text-sidebar-foreground leading-tight">
                      {profile?.first_name} {profile?.last_name}
                    </p>
                    {roleBadge && (
                      <span className={`inline-flex items-center gap-0.5 rounded px-1 py-0 text-[8px] font-semibold text-white ${roleBadge.color}`}>
                        <Shield className="h-2 w-2" />
                        {roleBadge.label}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}
            {collapsed && (
              <div className="border-t border-sidebar-border p-1.5 flex justify-center">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground text-[10px] font-semibold cursor-default">
                      {profile?.first_name?.[0]}{profile?.last_name?.[0]}
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="right">{profile?.first_name} {profile?.last_name}</TooltipContent>
                </Tooltip>
              </div>
            )}
          </div>
        </aside>
      </>
    </TooltipProvider>
  );
};

export default Sidebar;

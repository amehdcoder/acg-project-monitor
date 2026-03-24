import {
  LayoutDashboard,
  FileText,
  FolderOpen,
  BarChart3,
  Upload,
  Settings,
  HelpCircle,
  X,
  ChevronRight,
  Users,
  Shield,
  Briefcase,
  LayoutTemplate,
  Eye,
  Brain,
  Calculator,
  MessageSquareText,
  Repeat,
  Globe,
  Navigation,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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
  if (role === "super_admin") return { label: "Super Admin", color: "bg-red-500" };
  if (role === "systems_admin") return { label: "Systems Admin", color: "bg-acg-gold" };
  return null;
};

const Sidebar = ({ isOpen, onClose, activeTab, onTabChange, profile, role, isAdmin, isOwner, canAccessPage }: SidebarProps) => {
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
  ];

  const bottomItems = [
    { id: "settings", label: t("nav.settings"), icon: Settings },
    { id: "help", label: t("nav.help"), icon: HelpCircle },
  ];

  const visibleMenuItems = menuItems.filter(item => {
    if ((item as any).ownerOnly && !isOwner) return false;
    if (item.adminOnly && !isAdmin) return false;
    // For restricted pages, ALWAYS check granular access — block if no checker provided
    if (RESTRICTED_PAGE_IDS.includes(item.id as any)) {
      if (!canAccessPage) return false;
      return canAccessPage(item.id);
    }
    return true;
  });

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-foreground/20 backdrop-blur-sm lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-72 transform bg-sidebar transition-transform duration-300 lg:static lg:translate-x-0 ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-full flex-col">
          {/* Logo section */}
          <div className="flex items-center justify-between border-b border-sidebar-border p-4">
            <div className="flex items-center gap-3">
              <div className="relative">
                <img
                  src={acgLogo}
                  alt="ACG Logo"
                  className="h-12 w-12 rounded-full border-2 border-acg-gold/30"
                />
                <div className="absolute -bottom-1 -right-1 h-3 w-3 rounded-full border-2 border-sidebar bg-green-400" />
              </div>
              <div>
                <h2 className="font-display text-lg font-semibold text-sidebar-foreground">
                  ACG Monitor
                </h2>
                <p className="text-xs text-sidebar-foreground/60">v1.0.0</p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="text-sidebar-foreground hover:bg-sidebar-accent lg:hidden"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>

          {/* Navigation - scrollable */}
          <nav className="flex-1 min-h-0 overflow-y-auto p-3 scrollbar-thin scrollbar-thumb-sidebar-foreground/20 scrollbar-track-transparent">
            <p className="mb-3 px-3 text-xs font-medium uppercase tracking-wider text-sidebar-foreground/50">
              {t("nav.main_menu")}
            </p>
            {visibleMenuItems.map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  onTabChange(item.id);
                  onClose();
                }}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
                  activeTab === item.id
                    ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-soft"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                }`}
              >
                <item.icon className="h-5 w-5" />
                <span className="flex-1 text-left">{item.label}</span>
                {activeTab === item.id && (
                  <ChevronRight className="h-4 w-4" />
                )}
              </button>
            ))}
          </nav>

          {/* Bottom navigation */}
          <div className="border-t border-sidebar-border p-3">
            {bottomItems.map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  onTabChange(item.id);
                  onClose();
                }}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
                  activeTab === item.id
                    ? "bg-sidebar-primary text-sidebar-primary-foreground"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                }`}
              >
                <item.icon className="h-5 w-5" />
                <span>{item.label}</span>
              </button>
            ))}
          </div>

          {/* User section */}
          <div className="border-t border-sidebar-border p-4">
            <div className="flex items-center gap-3 rounded-lg bg-sidebar-accent/50 p-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-sidebar-primary text-sidebar-primary-foreground">
                <span className="text-sm font-semibold">
                  {profile?.first_name?.[0]}{profile?.last_name?.[0]}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="truncate text-sm font-medium text-sidebar-foreground">
                  {profile?.first_name} {profile?.last_name}
                </p>
                <p className="truncate text-xs text-sidebar-foreground/60">
                  {profile?.designation && getDesignationLabel(profile.designation, profile.other_designation)}
                </p>
                {roleBadge && (
                  <span className={`mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium text-white ${roleBadge.color}`}>
                    <Shield className="h-2.5 w-2.5" />
                    {roleBadge.label}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;

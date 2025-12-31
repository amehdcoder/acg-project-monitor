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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import acgLogo from "@/assets/acg-logo.png";

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  activeTab: string;
  onTabChange: (tab: string) => void;
}

const menuItems = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "forms", label: "Forms", icon: FileText },
  { id: "projects", label: "Projects", icon: FolderOpen },
  { id: "data", label: "Data & Analytics", icon: BarChart3 },
  { id: "integrations", label: "Integrations", icon: Upload },
];

const bottomItems = [
  { id: "settings", label: "Settings", icon: Settings },
  { id: "help", label: "Help & Support", icon: HelpCircle },
];

const Sidebar = ({ isOpen, onClose, activeTab, onTabChange }: SidebarProps) => {
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

          {/* Navigation */}
          <nav className="flex-1 space-y-1 p-3">
            <p className="mb-3 px-3 text-xs font-medium uppercase tracking-wider text-sidebar-foreground/50">
              Main Menu
            </p>
            {menuItems.map((item) => (
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
                <span className="text-sm font-semibold">JD</span>
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-sidebar-foreground">
                  John Doe
                </p>
                <p className="text-xs text-sidebar-foreground/60">
                  Field Supervisor
                </p>
              </div>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;

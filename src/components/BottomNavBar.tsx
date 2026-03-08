import { LayoutDashboard, FileText, Briefcase, BarChart3, Menu } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";

interface BottomNavBarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  onMenuClick: () => void;
  isAdmin?: boolean;
}

const BottomNavBar = ({ activeTab, onTabChange, onMenuClick, isAdmin }: BottomNavBarProps) => {
  const { t } = useLanguage();

  const items = [
    { id: "dashboard", label: t("nav.dashboard"), icon: LayoutDashboard },
    { id: "forms", label: t("nav.forms"), icon: FileText },
    { id: "cases", label: t("nav.cases"), icon: Briefcase },
    ...(isAdmin ? [{ id: "data", label: t("nav.analytics"), icon: BarChart3 }] : []),
    { id: "more", label: "More", icon: Menu },
  ];

  return (
    <nav className="fixed bottom-0 inset-x-0 z-50 border-t border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80 lg:hidden safe-area-bottom">
      <div className="flex items-center justify-around h-14">
        {items.map((item) => {
          const isActive = item.id === "more" ? false : activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => {
                if (item.id === "more") {
                  onMenuClick();
                } else {
                  onTabChange(item.id);
                }
              }}
              className={`flex flex-col items-center justify-center gap-0.5 flex-1 h-full min-w-[44px] transition-colors ${
                isActive
                  ? "text-primary"
                  : "text-muted-foreground"
              }`}
            >
              <item.icon className="h-5 w-5" />
              <span className="text-[10px] font-medium leading-none">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};

export default BottomNavBar;

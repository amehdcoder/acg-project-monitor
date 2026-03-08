import { useState } from "react";
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
  const [tappedId, setTappedId] = useState<string | null>(null);

  const items = [
    { id: "dashboard", label: t("nav.dashboard"), icon: LayoutDashboard },
    { id: "forms", label: t("nav.forms"), icon: FileText },
    { id: "cases", label: t("nav.cases"), icon: Briefcase },
    ...(isAdmin ? [{ id: "data", label: t("nav.analytics"), icon: BarChart3 }] : []),
    { id: "more", label: "More", icon: Menu },
  ];

  const handleTap = (id: string) => {
    setTappedId(id);
    setTimeout(() => setTappedId(null), 200);

    if (id === "more") {
      onMenuClick();
    } else {
      onTabChange(id);
    }
  };

  return (
    <nav className="fixed bottom-0 inset-x-0 z-50 border-t border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80 lg:hidden">
      <div className="flex items-center justify-around h-16 pb-[env(safe-area-inset-bottom)]">
        {items.map((item) => {
          const isActive = item.id === "more" ? false : activeTab === item.id;
          const isTapped = tappedId === item.id;

          return (
            <button
              key={item.id}
              onClick={() => handleTap(item.id)}
              className="relative flex flex-col items-center justify-center gap-1 flex-1 h-full min-w-[44px] min-h-[44px] group"
            >
              {/* Active pill indicator */}
              <div
                className={`absolute top-1.5 rounded-full transition-all duration-300 ease-out ${
                  isActive
                    ? "w-12 h-8 bg-primary/10"
                    : "w-0 h-0 bg-transparent"
                }`}
              />

              {/* Tap ripple */}
              <div
                className={`absolute inset-0 rounded-lg transition-all duration-200 ${
                  isTapped
                    ? "bg-primary/10 scale-90"
                    : "bg-transparent scale-100"
                }`}
              />

              {/* Icon */}
              <div
                className={`relative z-10 transition-all duration-200 ${
                  isActive ? "text-primary" : "text-muted-foreground"
                } ${isTapped ? "scale-75" : "scale-100"}`}
              >
                <item.icon
                  className={`h-5 w-5 transition-all duration-300 ${
                    isActive ? "stroke-[2.5px]" : "stroke-[1.5px]"
                  }`}
                />
              </div>

              {/* Label */}
              <span
                className={`relative z-10 text-[10px] font-medium leading-none transition-all duration-200 ${
                  isActive
                    ? "text-primary font-semibold"
                    : "text-muted-foreground"
                } ${isTapped ? "scale-90" : "scale-100"}`}
              >
                {item.label}
              </span>

              {/* Active dot */}
              <div
                className={`absolute bottom-1 h-1 rounded-full bg-primary transition-all duration-300 ease-out ${
                  isActive ? "w-1 opacity-100" : "w-0 opacity-0"
                }`}
              />
            </button>
          );
        })}
      </div>
    </nav>
  );
};

export default BottomNavBar;

import { useState, useEffect, useCallback, useRef } from "react";
import { LayoutDashboard, FileText, Briefcase, BarChart3, Menu } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

interface BottomNavBarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  onMenuClick: () => void;
  isAdmin?: boolean;
}

const BottomNavBar = ({ activeTab, onTabChange, onMenuClick, isAdmin }: BottomNavBarProps) => {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [tappedId, setTappedId] = useState<string | null>(null);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [pendingForms, setPendingForms] = useState(0);
  const [openCases, setOpenCases] = useState(0);
  const [bouncingIds, setBouncingIds] = useState<Set<string>>(new Set());
  const prevCounts = useRef<Record<string, number>>({});

  const fetchBadgeCounts = useCallback(async () => {
    if (!user?.id) return;

    const [notifRes, formsRes, casesRes] = await Promise.all([
      supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("read", false),
      supabase
        .from("form_submissions")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("status", "draft"),
      supabase
        .from("cases")
        .select("id", { count: "exact", head: true })
        .eq("owner_id", user.id)
        .eq("status", "open"),
    ]);

    const newCounts: Record<string, number> = {
      dashboard: notifRes.count ?? 0,
      forms: formsRes.count ?? 0,
      cases: casesRes.count ?? 0,
    };

    const newBouncing = new Set<string>();
    for (const key of Object.keys(newCounts)) {
      if ((prevCounts.current[key] ?? 0) < newCounts[key]) {
        newBouncing.add(key);
      }
    }
    if (newBouncing.size > 0) {
      setBouncingIds(newBouncing);
      setTimeout(() => setBouncingIds(new Set()), 500);
    }
    prevCounts.current = newCounts;

    setUnreadNotifications(newCounts.dashboard);
    setPendingForms(newCounts.forms);
    setOpenCases(newCounts.cases);
  }, [user?.id]);

  useEffect(() => {
    fetchBadgeCounts();
  }, [fetchBadgeCounts]);

  useEffect(() => {
    fetchBadgeCounts();
  }, [activeTab, fetchBadgeCounts]);

  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel('bottom-nav-badges')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` }, () => fetchBadgeCounts())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'form_submissions', filter: `user_id=eq.${user.id}` }, () => fetchBadgeCounts())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cases', filter: `owner_id=eq.${user.id}` }, () => fetchBadgeCounts())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user?.id, fetchBadgeCounts]);

  const getBadgeCount = (id: string): number => {
    switch (id) {
      case "dashboard": return unreadNotifications;
      case "forms": return pendingForms;
      case "cases": return openCases;
      default: return 0;
    }
  };

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

  const formatCount = (count: number) => (count > 99 ? "99+" : String(count));

  return (
    <nav className="fixed bottom-0 inset-x-0 z-50 border-t border-border bg-card/98 backdrop-blur-lg supports-[backdrop-filter]:bg-card/92 lg:hidden safe-area-bottom">
      <div className="flex items-center justify-around h-14">
        {items.map((item) => {
          const isActive = item.id === "more" ? false : activeTab === item.id;
          const isTapped = tappedId === item.id;
          const badgeCount = getBadgeCount(item.id);

          return (
            <button
              key={item.id}
              onClick={() => handleTap(item.id)}
              className="relative flex flex-col items-center justify-center gap-0.5 flex-1 h-full min-w-[44px] min-h-[44px]"
            >
              {/* Icon + Badge */}
              <div className="relative">
                <div
                  className={`transition-all duration-150 ${
                    isActive ? "text-primary" : "text-muted-foreground"
                  } ${isTapped ? "scale-90" : "scale-100"}`}
                >
                  <item.icon
                    className={`h-5 w-5 ${isActive ? "stroke-[2.5px]" : "stroke-[1.5px]"}`}
                  />
                </div>

                {badgeCount > 0 && (
                  <span
                    key={bouncingIds.has(item.id) ? `bounce-${Date.now()}` : 'static'}
                    className={`absolute -top-1.5 -right-2 flex items-center justify-center min-w-[14px] h-3.5 px-1 rounded-full bg-destructive text-destructive-foreground text-[8px] font-bold leading-none ${
                      bouncingIds.has(item.id) ? "animate-badge-bounce" : ""
                    }`}
                  >
                    {formatCount(badgeCount)}
                  </span>
                )}
              </div>

              {/* Label */}
              <span
                className={`text-[10px] font-medium leading-none ${
                  isActive ? "text-primary" : "text-muted-foreground"
                }`}
              >
                {item.label}
              </span>

              {/* Active indicator */}
              {isActive && (
                <div className="absolute top-0 inset-x-4 h-0.5 rounded-b-full bg-primary" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
};

export default BottomNavBar;

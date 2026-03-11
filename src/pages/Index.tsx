import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useIsMobile } from "@/hooks/use-mobile";
import { useSwipeGesture } from "@/hooks/useSwipeGesture";
import { useHeartbeat } from "@/hooks/useHeartbeat";
import SplashScreen from "@/components/SplashScreen";
import Header from "@/components/Header";
import Sidebar from "@/components/Sidebar";
import Dashboard from "@/components/Dashboard";
import FormsView from "@/components/FormsView";
import ProjectsView from "@/components/ProjectsView";
import DataView from "@/components/DataView";
import IntegrationsView from "@/components/IntegrationsView";
import UsersView from "@/components/UsersView";
import AdminDashboardBuilder from "@/components/AdminDashboardBuilder";
import CasesView from "@/components/CasesView";
import FormTemplatesView from "@/components/FormTemplatesView";
import { SupervisorDashboard } from "@/components/SupervisorDashboard";
import BottomNavBar from "@/components/BottomNavBar";
import { Loader2 } from "lucide-react";

const Index = () => {
  const [showSplash, setShowSplash] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("dashboard");
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const { user, loading, profile, role, isAdmin } = useAuth();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  useHeartbeat();

  // Auto-close sidebar on mobile when navigating
  const handleTabChange = useCallback((tab: string) => {
    setActiveTab(tab);
    if (isMobile) {
      setSidebarOpen(false);
    }
  }, [isMobile]);

  // Swipe gestures for mobile sidebar
  useSwipeGesture({
    onSwipeRight: useCallback(() => {
      if (isMobile && !sidebarOpen) setSidebarOpen(true);
    }, [isMobile, sidebarOpen]),
    onSwipeLeft: useCallback(() => {
      if (isMobile && sidebarOpen) setSidebarOpen(false);
    }, [isMobile, sidebarOpen]),
  });

  useEffect(() => {
    if (!loading && !user) {
      navigate("/auth");
    }
  }, [user, loading, navigate]);

  useEffect(() => {
    if (showSplash) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "auto";
    }
    return () => {
      document.body.style.overflow = "auto";
    };
  }, [showSplash]);

  const renderContent = () => {
    switch (activeTab) {
      case "dashboard":
        return <Dashboard onOpenDashboardBuilder={isAdmin ? () => setActiveTab("dashboard-builder") : undefined} />;
      case "supervisor":
        return isAdmin ? <SupervisorDashboard /> : <Dashboard />;
      case "dashboard-builder":
        return isAdmin ? <AdminDashboardBuilder onBack={() => setActiveTab("dashboard")} /> : <Dashboard />;
      case "forms":
        return <FormsView />;
      case "cases":
        return <CasesView />;
      case "templates":
        return <FormTemplatesView />;
      case "projects":
        return <ProjectsView onSelectProject={(projectId) => {
          setSelectedProjectId(projectId);
          handleTabChange("forms");
        }} />;
      case "data":
        return <DataView />;
      case "integrations":
        return <IntegrationsView />;
      case "users":
        return <UsersView />;
      default:
        return (
          <div className="flex h-96 items-center justify-center">
            <div className="text-center">
              <h2 className="font-display text-2xl font-bold text-foreground">
                {activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}
              </h2>
              <p className="mt-2 text-muted-foreground">
                This section is coming soon
              </p>
            </div>
          </div>
        );
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

    return (
    <>
      {showSplash && <SplashScreen onComplete={() => setShowSplash(false)} />}
      
      <div className="flex h-screen h-[100dvh] overflow-hidden bg-background">
        <Sidebar
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          activeTab={activeTab}
          onTabChange={handleTabChange}
          profile={profile}
          role={role}
          isAdmin={isAdmin}
        />
        
        <div className="flex flex-1 flex-col min-h-0 w-full overflow-x-hidden">
          <Header 
            onMenuClick={() => setSidebarOpen(true)} 
            profile={profile}
          />
          
          <main
            className="flex-1 pb-20 lg:pb-4 px-1 sm:px-0 max-w-full"
            style={{
              overflowY: 'auto',
              overflowX: 'hidden',
              WebkitOverflowScrolling: 'touch',
              overscrollBehavior: 'contain',
            }}
          >
            {renderContent()}
          </main>
        </div>
      </div>

      {/* Mobile bottom navigation */}
      <BottomNavBar
        activeTab={activeTab}
        onTabChange={handleTabChange}
        onMenuClick={() => setSidebarOpen(true)}
        isAdmin={isAdmin}
      />
    </>
  );
};

export default Index;

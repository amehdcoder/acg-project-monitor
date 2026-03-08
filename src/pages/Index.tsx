import { useState, useEffect, lazy, Suspense } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
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
import { Loader2 } from "lucide-react";

const Index = () => {
  const [showSplash, setShowSplash] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("dashboard");
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const { user, loading, profile, role, isAdmin } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) {
      navigate("/auth");
    }
  }, [user, loading, navigate]);

  useEffect(() => {
    if (showSplash) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
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
          setActiveTab("forms");
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
      
      <div className="flex min-h-screen bg-background">
        <Sidebar
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          profile={profile}
          role={role}
          isAdmin={isAdmin}
        />
        
        <div className="flex flex-1 flex-col">
          <Header 
            onMenuClick={() => setSidebarOpen(true)} 
            profile={profile}
          />
          
          <main className="flex-1 overflow-auto">
            {renderContent()}
          </main>
        </div>
      </div>
    </>
  );
};

export default Index;

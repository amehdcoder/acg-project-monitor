import { useState, useEffect } from "react";
import SplashScreen from "@/components/SplashScreen";
import Header from "@/components/Header";
import Sidebar from "@/components/Sidebar";
import Dashboard from "@/components/Dashboard";
import FormsView from "@/components/FormsView";
import ProjectsView from "@/components/ProjectsView";
import DataView from "@/components/DataView";
import IntegrationsView from "@/components/IntegrationsView";

const Index = () => {
  const [showSplash, setShowSplash] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("dashboard");

  useEffect(() => {
    // Prevent body scroll when splash is shown
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
        return <Dashboard />;
      case "forms":
        return <FormsView />;
      case "projects":
        return <ProjectsView />;
      case "data":
        return <DataView />;
      case "integrations":
        return <IntegrationsView />;
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

  return (
    <>
      {showSplash && <SplashScreen onComplete={() => setShowSplash(false)} />}
      
      <div className="flex min-h-screen bg-background">
        <Sidebar
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          activeTab={activeTab}
          onTabChange={setActiveTab}
        />
        
        <div className="flex flex-1 flex-col">
          <Header onMenuClick={() => setSidebarOpen(true)} />
          
          <main className="flex-1 overflow-auto">
            {renderContent()}
          </main>
        </div>
      </div>
    </>
  );
};

export default Index;

// Index page - main app shell
import React, { useState, useEffect, useCallback, Suspense } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { useAuth } from "@/hooks/useAuth";
import { usePageAccess } from "@/hooks/usePageAccess";
import { supabase } from "@/integrations/supabase/client";
import { useIsMobile } from "@/hooks/use-mobile";
import { useSwipeGesture } from "@/hooks/useSwipeGesture";
import { useHeartbeat } from "@/hooks/useHeartbeat";
import { useCallNotifications } from "@/hooks/useCallNotifications";
import { useAppUpdateNotifications } from "@/hooks/useAppUpdateNotifications";
import { useSurveillanceTracking } from "@/hooks/useSurveillanceTracking";

import Header from "@/components/Header";
import Sidebar from "@/components/Sidebar";
import Dashboard from "@/components/Dashboard";
import FormsView from "@/components/FormsView";
import ProjectsView from "@/components/ProjectsView";
import DataView from "@/components/DataView";
import IntegrationsView from "@/components/IntegrationsView";
import UsersView from "@/components/UsersView";
import AdminDashboardBuilder from "@/components/AdminDashboardBuilder";
import SubmissionHistory from "@/components/SubmissionHistory";
import CasesView from "@/components/CasesView";
import FormTemplatesView from "@/components/FormTemplatesView";
import { SupervisorDashboard } from "@/components/SupervisorDashboard";
import MachineLearningView from "@/components/MachineLearningView";
import MathModelingView from "@/components/MathModelingView";
import SettingsView from "@/components/SettingsView";
import HelpSupportView from "@/components/HelpSupportView";
import AdminFeedbackView from "@/components/AdminFeedbackView";
import IterationAnalysisView from "@/components/IterationAnalysisView";
import StatisticalAnalysisView from "@/components/StatisticalAnalysisView";
import SpatialAnalysisView from "@/components/SpatialAnalysisView";
import { FieldIntelligenceView } from "@/components/FieldIntelligence";
import AdminSurveillanceView from "@/components/AdminSurveillanceView";
import DataQualityView from "@/components/DataQualityView";
import { MicroplanningView } from "@/components/Microplanning";
import { QuizBuilder } from "@/components/QuizBuilder";
import ChangeEnvironmentView from "@/components/ChangeEnvironmentView";
import PageAccessManager from "@/components/PageAccessManager";
import NTDAssessmentView from "@/components/NTDAssessmentView";
import AccessibilityStatementView from "@/components/AccessibilityStatementView";
import SignLanguageView from "@/components/SignLanguageView";
import MediaAnalysisView from "@/components/MediaAnalysis/MediaAnalysisView";
import SatelliteImageryView from "@/components/SatelliteImageryView";
import OffGridSatelliteMessenger from "@/components/SatelliteMessenger/OffGridSatelliteMessenger";
import OfflineFormShare from "@/components/MeshSync/OfflineFormShare";
import VersionHistoryViewer from "@/components/VersionHistoryViewer";
import SecurityAuditView from "@/components/SecurityAuditView";
import ImageRecognitionCapture from "@/components/ImageRecognition/ImageRecognitionCapture";
import NfcRfidCollector from "@/components/NfcRfidCollector";
import SocialShareView from "@/components/SocialShareView";
import WhatIfAnalysis from "@/components/WhatIfAnalysis";
import WearableIoTIntegration from "@/components/WearableIoTIntegration";
import CommunityForumView from "@/components/CommunityForum/CommunityForumView";
import SignLanguageAvatar from "@/components/SignLanguageAvatar";
import AccessibilityToolsView from "@/components/AccessibilityToolsView";
import MeshSyncManagerView from "@/components/MeshSyncManagerView";
// Lazy-loaded: CES bundles Three.js, Leaflet, Tesseract — keep them out of the
// initial bundle so every other tab loads quickly on mid-range Android.
const CoverageEvaluationView = React.lazy(() =>
  import("@/components/CoverageEvaluation").then((m) => ({ default: m.CoverageEvaluationView }))
);
import BottomNavBar from "@/components/BottomNavBar";
import AdhocProjectChatView from "@/components/AdhocProjectChatView";
import ErrorBoundary from "@/components/ErrorBoundary";
import { ProximityProvider } from "@/hooks/useProximity";
import ProximityHub from "@/components/Proximity/ProximityHub";
// framer-motion no longer needed at this level (tab-switch wrapper removed to kill blink)
import { Loader2 } from "lucide-react";


import { toast } from "@/hooks/use-toast";

const Index = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  
  // Initialize state from URL params — Forms is the default landing page.
  const [activeTab, setActiveTab] = useState(searchParams.get("tab") || "forms");
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(searchParams.get("project"));
  
  const [showSubmissionHistory, setShowSubmissionHistory] = useState(false);

  const { user, loading, profile, role, isAdmin, isApproved, isPendingApproval, isSuperAdmin, isOwner, isAdhoc } = useAuth();
  const { canAccessPage, loadingAccess } = usePageAccess();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  useHeartbeat();
  useAppUpdateNotifications();
  const { trackPageVisit } = useSurveillanceTracking(user?.id);

  useEffect(() => {
    const urlTab = searchParams.get("tab");
    const urlProject = searchParams.get("project");

    if (urlTab) setActiveTab((current) => (current === urlTab ? current : urlTab));
    setSelectedProjectId((current) => (current === urlProject ? current : urlProject));
  }, [searchParams]);

  useEffect(() => {
    if (user?.id && activeTab) {
      trackPageVisit(activeTab);
    }

    // Sync shell state to URL without letting stale URL params force the tab back to Dashboard.
    const currentParams = new URLSearchParams(window.location.search);
    const nextParams = new URLSearchParams(currentParams);
    nextParams.set("tab", activeTab);
    nextParams.delete("__app_update");
    if (selectedProjectId) nextParams.set("project", selectedProjectId);
    else nextParams.delete("project");
    if (activeTab !== "dashboard") nextParams.delete("subtab");

    if (nextParams.toString() !== currentParams.toString()) {
      setSearchParams(nextParams, { replace: true });
    }
  }, [activeTab, selectedProjectId, user?.id, trackPageVisit, setSearchParams]);


  const handleJoinCallFromNotification = useCallback((groupId: string, callType: "voice" | "video", groupName: string) => {
    setActiveTab("projects");
    toast({
      title: "Navigate to Chat",
      description: `Open the project chat for "${groupName}" to join the ${callType} call.`,
      duration: 5000,
    });
  }, []);

  useCallNotifications(handleJoinCallFromNotification);

  const handleTabChange = useCallback((tab: string) => {
    setActiveTab(tab);
    if (isMobile) setSidebarOpen(false);
  }, [isMobile]);

  useEffect(() => {
    const handler = (event: Event) => {
      const tab = (event as CustomEvent<{ tab?: string }>).detail?.tab;
      if (tab) handleTabChange(tab);
    };
    window.addEventListener("amehnities:navigate-tab", handler);
    return () => window.removeEventListener("amehnities:navigate-tab", handler);
  }, [handleTabChange]);

  useSwipeGesture({
    onSwipeRight: useCallback(() => {
      if (isMobile && !sidebarOpen) setSidebarOpen(true);
    }, [isMobile, sidebarOpen]),
    onSwipeLeft: useCallback(() => {
      if (isMobile && sidebarOpen) setSidebarOpen(false);
    }, [isMobile, sidebarOpen]),
  });

  useEffect(() => {
    if (!loading && !user) navigate("/auth");
  }, [user, loading, navigate]);

  // Regular users (not admins, not owner) only have access to the Forms page by
  // default — land them there instead of the Dashboard they can't view.
  useEffect(() => {
    if (loading || !user) return;
    if (isAdmin || isOwner) return;
    const urlTab = searchParams.get("tab");
    if (!urlTab && activeTab === "dashboard") {
      setActiveTab("forms");
    }
  }, [loading, user, isAdmin, isOwner, searchParams, activeTab]);

  // Adhoc users are confined to: their assigned form, the project chat, and
  // their own submissions. Any other tab redirects them back to Forms.
  const ADHOC_TABS = ["forms", "project-chat", "my-submissions"];
  useEffect(() => {
    if (loading || !user || !isAdhoc) return;
    if (!ADHOC_TABS.includes(activeTab)) {
      setActiveTab("forms");
    }
  }, [loading, user, isAdhoc, activeTab]);

  useEffect(() => {
    if (loading || !user) return;
    const params = new URLSearchParams(window.location.search);
    const action = params.get("action");
    const formId = params.get("formId");
    if (action === "fill" && formId) {
      setActiveTab("forms");
      setSelectedProjectId(null);
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [loading, user]);



  const renderContent = () => {
    const guardedPage = (pageId: string, component: JSX.Element) => {
      // While access grants are still loading, show a spinner — never flash the Dashboard,
      // which used to cause every guarded page to "blink" back to Dashboard on click.
      if (loadingAccess) {
        return (
          <div className="flex h-96 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        );
      }
      if (canAccessPage(pageId)) return component;
      return (
        <div className="flex h-96 items-center justify-center p-6">
          <div className="max-w-md text-center space-y-2">
            <h2 className="font-display text-xl font-bold text-foreground">Access Restricted</h2>
            <p className="text-sm text-muted-foreground">
              You don't have permission to view this page. Ask an administrator to grant access.
            </p>
          </div>
        </div>
      );
    };

    switch (activeTab) {
      case "dashboard":
        if (showSubmissionHistory) {
          return <SubmissionHistory onClose={() => setShowSubmissionHistory(false)} />;
        }
        return (
          <Dashboard
            onOpenDashboardBuilder={isAdmin ? () => handleTabChange("dashboard-builder") : undefined}
            onViewSubmissions={() => setShowSubmissionHistory(true)}
            initialProjectId={selectedProjectId}
            onProjectSelect={setSelectedProjectId}
          />
        );

      case "supervisor": return isAdmin ? <SupervisorDashboard /> : guardedPage("__admin_only__", <></>);
      case "dashboard-builder": return isAdmin ? <AdminDashboardBuilder onBack={() => setActiveTab("dashboard")} /> : guardedPage("__admin_only__", <></>);
      case "forms": return <FormsView />;
      case "project-chat": return <AdhocProjectChatView />;
      case "my-submissions": return <SubmissionHistory onClose={() => setActiveTab("forms")} />;
      case "cases": return <CasesView />;
      case "templates": return <FormTemplatesView />;
      case "projects": return <ProjectsView onSelectProject={(projectId) => { setSelectedProjectId(projectId); handleTabChange("forms"); }} />;
      case "data": return guardedPage("data", <DataView />);
      case "integrations": return guardedPage("integrations", <IntegrationsView />);
      case "users": return guardedPage("users", <UsersView />);
      case "ml": return guardedPage("ml", <MachineLearningView />);
      case "math-modeling": return guardedPage("math-modeling", <MathModelingView />);
      case "settings": return <SettingsView />;
      case "help": return <HelpSupportView />;
      case "feedback": return guardedPage("feedback", <AdminFeedbackView />);
      case "iteration-analysis": return guardedPage("iteration-analysis", <IterationAnalysisView />);
      case "statistics": return guardedPage("statistics", <StatisticalAnalysisView />);
      case "spatial-analysis": return guardedPage("spatial-analysis", <SpatialAnalysisView />);
      case "field-intelligence": return guardedPage("field-intelligence", <FieldIntelligenceView />);
      case "surveillance": return guardedPage("surveillance", <AdminSurveillanceView />);
      case "data-quality": return guardedPage("data-quality", <DataQualityView />);
      case "microplanning": return guardedPage("microplanning", <MicroplanningView />);
      case "environment": return guardedPage("environment", <ChangeEnvironmentView />);
      case "quizzes": return isAdmin ? guardedPage("quizzes", <QuizBuilder />) : <QuizBuilder />;
      case "ntd-assessment": return <NTDAssessmentView />;
      case "sign-language": return <SignLanguageView />;
      case "accessibility": return <AccessibilityStatementView />;
      case "media-analysis": return guardedPage("media-analysis", <MediaAnalysisView />);
      case "satellite-imagery": return guardedPage("satellite-imagery", <SatelliteImageryView />);
      case "satellite-messenger": return <OffGridSatelliteMessenger />;
      case "offline-form-share": return <OfflineFormShare />;
      case "version-history": return <VersionHistoryViewer />;
      case "security-audit": return <SecurityAuditView />;
      case "image-recognition": return guardedPage("image-recognition", <ImageRecognitionCapture />);
      case "nfc-rfid": return <NfcRfidCollector />;
      case "social-share": return <SocialShareView />;
      case "what-if": return guardedPage("what-if", <WhatIfAnalysis />);
      case "wearable-iot": return guardedPage("wearable-iot", <WearableIoTIntegration />);
      case "community-forum": return <CommunityForumView />;
      case "sign-avatar": return <SignLanguageAvatar />;
      case "a11y-tools": return <AccessibilityToolsView />;
      case "mesh-sync": return isAdmin ? <MeshSyncManagerView /> : guardedPage("__admin_only__", <></>);
      case "coverage-eval": return (
        <ErrorBoundary name="CoverageEvaluation">
          <Suspense fallback={<div className="flex h-96 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}>
            <CoverageEvaluationView />
          </Suspense>
        </ErrorBoundary>
      );
      default:
        return (
          <div className="flex h-96 items-center justify-center">
            <div className="text-center">
              <h2 className="font-display text-2xl font-bold text-foreground">{activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}</h2>
              <p className="mt-2 text-muted-foreground">This section is coming soon</p>
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

  if (!user) return null;

  if (isPendingApproval && !isAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <div className="max-w-md text-center space-y-4">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-amber-100">
            <Loader2 className="h-8 w-8 text-amber-600" />
          </div>
          <h1 className="font-display text-2xl font-bold text-foreground">Account Pending Approval</h1>
          <p className="text-muted-foreground">Your account has been created but is awaiting approval from an administrator.</p>
          <button onClick={async () => { await supabase.auth.signOut(); navigate("/auth"); }} className="mt-4 rounded-lg bg-primary px-6 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">Sign Out</button>
        </div>
      </div>
    );
  }

  if (profile?.approval_status === "rejected") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <div className="max-w-md text-center space-y-4">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10"><span className="text-3xl">❌</span></div>
          <h1 className="font-display text-2xl font-bold text-foreground">Account Rejected</h1>
          <p className="text-muted-foreground">Your registration has been reviewed and was not approved.</p>
          <button onClick={async () => { await supabase.auth.signOut(); navigate("/auth"); }} className="mt-4 rounded-lg bg-primary px-6 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">Sign Out</button>
        </div>
      </div>
    );
  }

  return (
    <ProximityProvider>

      <div className="flex h-[100dvh] overflow-hidden bg-background" style={{
        background: localStorage.getItem("app_bg_gradient") || undefined,
      }}>
        <Sidebar
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          activeTab={activeTab}
          onTabChange={handleTabChange}
          profile={profile}
          role={role}
          isAdmin={isAdmin}
          isOwner={isOwner}
          isAdhoc={isAdhoc}
          canAccessPage={canAccessPage}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed(prev => !prev)}
        />

        <div className="flex flex-1 flex-col min-h-0 w-full overflow-x-hidden">
          <Header onMenuClick={() => setSidebarOpen(true)} profile={profile} />

          <main data-app-scroll-root className={`flex-1 overflow-y-auto overflow-x-hidden pb-20 lg:pb-0 max-w-full overscroll-contain ${
            activeTab === "dashboard" ? "p-0" : "px-1 sm:px-2 md:px-4"
          }`} style={{ WebkitOverflowScrolling: 'touch' }}>
            <ErrorBoundary name="Main Content">
              {/*
               * Tab switch — no opacity/transform animation at all.
               * Any fade-in on tab change is perceived as a "blink" by the user.
               * Render the new view immediately with no wrapper animation.
               * (No-blink rule: enforced for the lifetime of the app.)
               */}
              <div className="min-h-full">
                {renderContent()}
              </div>
            </ErrorBoundary>
          </main>


        </div>
      </div>

      <BottomNavBar
        activeTab={activeTab}
        onTabChange={handleTabChange}
        onMenuClick={() => setSidebarOpen(true)}
        isAdmin={isAdmin}
        isAdhoc={isAdhoc}
      />

      <ProximityHub />
    </ProximityProvider>
  );
};

export default Index;

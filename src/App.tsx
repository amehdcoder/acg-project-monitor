import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider, QueryCache, keepPreviousData } from "@tanstack/react-query";
import { toast as sonnerToast } from "sonner";
import { isTransientBackendError, describeBackendError } from "@/lib/safeData";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { AuthProvider } from "@/hooks/useAuth";
import { LanguageProvider } from "@/hooks/useLanguage";
import { ImpersonationProvider } from "@/hooks/useImpersonation";
import { ThemeProvider } from "next-themes";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import ResetPassword from "./pages/ResetPassword";
import ConfirmEmail from "./pages/ConfirmEmail";
import NotFound from "./pages/NotFound";
import Install from "./pages/Install";
import DataCleaner from "./pages/DataCleaner";
import MdaAnalysesHarness from "./pages/MdaAnalysesHarness";
import MicroplanKpiHarness from "./pages/MicroplanKpiHarness";
import XlsFormCoverHarness from "./pages/XlsFormCoverHarness";
import LearningLog from "./pages/LearningLog";
import SharedDashboard from "./pages/SharedDashboard";
import InstallBanner from "./components/InstallBanner";
import PWAUpdatePrompt from "./components/PWAUpdatePrompt";
import StorageWarningBanner from "./components/StorageWarningBanner";
import CESWitnessForm from "./components/CoverageEvaluation/CESWitnessForm";
import OffGridSatelliteMessenger from "./components/SatelliteMessenger/OffGridSatelliteMessenger";
import { ProtectedRoute } from "./components/ProtectedRoute";
import RouteErrorBoundary from "./components/RouteErrorBoundary";
import AfterHoursGate from "./components/afterHours/AfterHoursGate";
import AfterHoursApprovalCenter from "./components/afterHours/AfterHoursApprovalCenter";
import MyAfterHoursRequests from "./components/afterHours/MyAfterHoursRequests";
import AfterHoursDecisionOverlay from "./components/afterHours/AfterHoursDecisionOverlay";
import { scrollToAppTop } from "@/lib/scrollToAppTop";
import { startGpsWarmer } from "@/lib/gps/gpsWarmer";

// Scroll to top on every route change so forms and pages always start at the beginning
const ScrollToTop = () => {
  const { pathname, search } = useLocation();
  useEffect(() => {
    scrollToAppTop("auto");
  }, [pathname, search]);
  return null;
};

// Keep a single shared GPS watch warm across the whole app so location-critical
// pages (e.g. Coverage Evaluation 3D) lock onto an accurate, recent fix
// instantly instead of cold-starting the GNSS chip on arrival.
const GpsWarmer = () => {
  useEffect(() => {
    const stop = startGpsWarmer();
    return stop;
  }, []);
  return null;
};

// Hardened QueryClient: exponential backoff, sane caching, offline-tolerant.
// Prevents tight retry loops, runaway refetches, and "stuck spinner" failures
// when the backend hiccups or the device flips between 3G and offline.
//
// Under heavy concurrent load the backend can respond with 429/504/empty
// bodies. `placeholderData: keepPreviousData` makes every query keep its last
// successful payload while the refetch is in flight, so downstream components
// never see `undefined` in the middle of a render and never crash on
// `.map`/`.length`. A dedup-aware toast surfaces the transient error without
// unmounting the widget.
const transientToastCache = new Map<string, number>();
function toastTransient(key: string, error: unknown) {
  const now = Date.now();
  const last = transientToastCache.get(key) ?? 0;
  if (now - last < 8000) return; // dedupe bursts
  transientToastCache.set(key, now);
  sonnerToast.error(describeBackendError(error));
}

const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => {
      if (isTransientBackendError(error)) {
        const key = Array.isArray(query.queryKey)
          ? String(query.queryKey[0] ?? "query")
          : "query";
        toastTransient(key, error);
      }
    },
  }),
  defaultOptions: {
    queries: {
      retry: (failureCount, error: any) => {
        // Don't retry auth / permission / not-found — they won't get better
        const status = error?.status ?? error?.statusCode;
        if (status && [400, 401, 403, 404, 422].includes(status)) return false;
        // Transient overloads (429/504/503/502) — retry more aggressively
        if (isTransientBackendError(error)) return failureCount < 4;
        return failureCount < 3;
      },
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 15000),
      staleTime: 60_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: "always",
      refetchOnMount: false,
      networkMode: "offlineFirst",
      // Keep last-good data on the screen during refetches / transient errors
      // so components rendering arrays never see `undefined` mid-refresh.
      placeholderData: keepPreviousData,
    },
    mutations: {
      retry: (failureCount, error: any) => {
        const status = error?.status ?? error?.statusCode;
        if (status && [400, 401, 403, 404, 409, 422].includes(status)) return false;
        return failureCount < 2;
      },
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10000),
      networkMode: "offlineFirst",
    },
  },
});

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider
      attribute="class"
      defaultTheme="light"
      enableSystem={false}
      storageKey="amehnities-theme"
      disableTransitionOnChange
    >
      <LanguageProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <StorageWarningBanner />
          <InstallBanner />
          <PWAUpdatePrompt />
          <BrowserRouter>
            <AuthProvider>
              <ImpersonationProvider>
                <ScrollToTop />
                <GpsWarmer />
                <AfterHoursGate />
                <AfterHoursApprovalCenter />
                <MyAfterHoursRequests />
                <AfterHoursDecisionOverlay />

                <RouteErrorBoundary>
                  <Routes>
                    <Route path="/auth" element={<Auth />} />
                    <Route path="/reset-password" element={<ResetPassword />} />
                    <Route path="/auth/confirm" element={<ConfirmEmail />} />
                    <Route path="/" element={<ProtectedRoute><Index /></ProtectedRoute>} />
                    <Route path="/install" element={<ProtectedRoute><Install /></ProtectedRoute>} />
                    <Route path="/witness/:surveyId/:hhId" element={<CESWitnessForm />} />
                    <Route path="/satellite-messenger" element={<ProtectedRoute><OffGridSatelliteMessenger /></ProtectedRoute>} />
                   <Route path="/data-cleaner" element={<ProtectedRoute><DataCleaner /></ProtectedRoute>} />
                   <Route path="/learning-log" element={<ProtectedRoute><LearningLog /></ProtectedRoute>} />
                    <Route path="/__test/mda-analyses" element={<MdaAnalysesHarness />} />
                    <Route path="/__test/microplan-kpi" element={<MicroplanKpiHarness />} />
                    <Route path="/__test/xlsform-cover" element={<XlsFormCoverHarness />} />
                    <Route path="/shared/dashboard/:token" element={<SharedDashboard />} />
                    <Route path="*" element={<NotFound />} />
                  </Routes>
                </RouteErrorBoundary>
              </ImpersonationProvider>
            </AuthProvider>
          </BrowserRouter>
        </TooltipProvider>
      </LanguageProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;

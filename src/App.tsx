import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { AuthProvider } from "@/hooks/useAuth";
import { LanguageProvider } from "@/hooks/useLanguage";
import { ImpersonationProvider } from "@/hooks/useImpersonation";
import { ThemeProvider } from "next-themes";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import ResetPassword from "./pages/ResetPassword";
import NotFound from "./pages/NotFound";
import Install from "./pages/Install";
import InstallBanner from "./components/InstallBanner";
import PWAUpdatePrompt from "./components/PWAUpdatePrompt";
import CESWitnessForm from "./components/CoverageEvaluation/CESWitnessForm";
import OffGridSatelliteMessenger from "./components/SatelliteMessenger/OffGridSatelliteMessenger";
import { ProtectedRoute } from "./components/ProtectedRoute";

// Scroll to top on every route change so forms and pages always start at the beginning
const ScrollToTop = () => {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [pathname]);
  return null;
};

// Hardened QueryClient: exponential backoff, sane caching, offline-tolerant.
// Prevents tight retry loops, runaway refetches, and "stuck spinner" failures
// when the backend hiccups or the device flips between 3G and offline.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error: any) => {
        // Don't retry auth / permission / not-found — they won't get better
        const status = error?.status ?? error?.statusCode;
        if (status && [400, 401, 403, 404, 422].includes(status)) return false;
        return failureCount < 3;
      },
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 15000),
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      networkMode: "offlineFirst",
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
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
      <LanguageProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <InstallBanner />
          <PWAUpdatePrompt />
          <BrowserRouter>
            <AuthProvider>
              <ImpersonationProvider>
                <ScrollToTop />
                <Routes>
                  <Route path="/auth" element={<Auth />} />
                  <Route path="/reset-password" element={<ResetPassword />} />
                  <Route path="/" element={<ProtectedRoute><Index /></ProtectedRoute>} />
                  <Route path="/install" element={<ProtectedRoute><Install /></ProtectedRoute>} />
                  <Route path="/witness/:surveyId/:hhId" element={<CESWitnessForm />} />
                  <Route path="/satellite-messenger" element={<ProtectedRoute><OffGridSatelliteMessenger /></ProtectedRoute>} />
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </ImpersonationProvider>
            </AuthProvider>
          </BrowserRouter>
        </TooltipProvider>
      </LanguageProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;

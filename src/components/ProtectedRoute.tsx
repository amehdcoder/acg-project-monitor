import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { ShieldAlert } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import BootSkeleton from "@/components/BootSkeleton";

// Detects a cached auth session persisted in localStorage by the Supabase
// client. Used so an OFFLINE cold boot never flashes the /auth screen before
// the encrypted device credential finishes hydrating — we keep showing the
// branded boot skeleton until auth resolves instead of bouncing to sign-in.
const hasCachedAuthSession = (): boolean => {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && /^sb-.*-auth-token/i.test(key)) {
        const raw = localStorage.getItem(key);
        if (raw && raw.includes("access_token")) return true;
      }
    }
  } catch {
    /* storage may be blocked */
  }
  return false;
};

export const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading, isApproved, isAdmin, profile, isOwner, signOut } = useAuth();
  const location = useLocation();

  // While the offline-first boot lifecycle resolves the cached session, show a
  // smooth branded shell (never a blank white page) — this is the transition
  // from the SW-cached index.html to the real route.
  if (loading) {
    return <BootSkeleton />;
  }

  if (!user) {
    // Offline cold boot: the live session is still hydrating from the encrypted
    // device credential. If a cached session exists, keep the skeleton up rather
    // than flashing the sign-in page. If the user explicitly logged out (no
    // cached token) OR we're online, send them straight to /auth.
    if (typeof navigator !== "undefined" && navigator.onLine === false && hasCachedAuthSession()) {
      return <BootSkeleton />;
    }
    return <Navigate to="/auth" replace />;
  }

  // Check if account is deactivated (and not the owner)
  if (profile && profile.is_active === false && !isOwner) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-hero p-4">
        <Card className="w-full max-w-md border-0 shadow-card bg-card/85 backdrop-blur-md relative overflow-hidden">
          {/* Accent red top border */}
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-destructive animate-pulse" />
          
          <CardHeader className="text-center pt-8">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
              <ShieldAlert className="h-9 w-9 text-destructive" />
            </div>
            <CardTitle className="font-display text-2xl text-destructive font-bold">
              Account Deactivated
            </CardTitle>
            <CardDescription className="mt-2 text-muted-foreground text-sm font-normal">
              Amehnities Consulting Group Platform
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center space-y-6 pb-8">
            <p className="text-sm text-foreground/80 leading-relaxed max-w-sm mx-auto">
              Your account has been deactivated by an administrator. You no longer have access to this monitoring & supervision workspace.
            </p>
            <div className="border border-border/50 rounded-lg p-3 bg-muted/30 text-xs text-muted-foreground">
              Please contact the administrator or support if you believe this is an error.
            </div>
            <Button
              variant="destructive"
              className="w-full mt-4"
              onClick={async () => {
                await signOut();
              }}
            >
              Sign Out
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Allow admins regardless of approval status (admins are the ones who approve).
  // IMPORTANT: the root route itself is wrapped by ProtectedRoute and Index.tsx
  // renders the pending/rejected/recovery UI. Redirecting "/" to "/" here causes
  // a self-navigation loop whenever profile approval is still resolving after a
  // slow auth refresh, which looks like the app is loading forever.
  if (profile && !isApproved && !isAdmin && location.pathname !== "/") {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

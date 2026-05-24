import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Loader2, ShieldAlert } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading, isApproved, isAdmin, profile, isOwner, signOut } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
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

  // Allow admins regardless of approval status (admins are the ones who approve)
  if (!isApproved && !isAdmin) {
    return <Navigate to="/" replace />; // Index.tsx handles the "Pending Approval" UI
  }

  return <>{children}</>;
};

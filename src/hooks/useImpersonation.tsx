import { createContext, useContext, useState, useCallback, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface ImpersonationContextType {
  isImpersonating: boolean;
  originalAdminEmail: string | null;
  impersonatedUserName: string | null;
  startImpersonation: (targetUserId: string, targetName: string) => Promise<boolean>;
  stopImpersonation: () => Promise<void>;
}

const ImpersonationContext = createContext<ImpersonationContextType | undefined>(undefined);

const STORAGE_KEY = "acg_impersonation_admin_session";

export const ImpersonationProvider = ({ children }: { children: ReactNode }) => {
  const [isImpersonating, setIsImpersonating] = useState<boolean>(
    () => !!sessionStorage.getItem(STORAGE_KEY)
  );
  const [originalAdminEmail, setOriginalAdminEmail] = useState<string | null>(
    () => {
      const stored = sessionStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored).email : null;
    }
  );
  const [impersonatedUserName, setImpersonatedUserName] = useState<string | null>(
    () => {
      const stored = sessionStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored).impersonatedName : null;
    }
  );

  const startImpersonation = useCallback(async (targetUserId: string, targetName: string): Promise<boolean> => {
    try {
      // Get current admin session to store it
      const { data: { session: adminSession } } = await supabase.auth.getSession();
      if (!adminSession) {
        toast({ title: "Error", description: "No active session", variant: "destructive" });
        return false;
      }

      // Call the edge function to get an impersonation session
      const { data, error } = await supabase.functions.invoke("impersonate-user", {
        body: { target_user_id: targetUserId },
      });

      if (error || data?.error) {
        toast({
          title: "Impersonation failed",
          description: data?.error || error?.message || "Unknown error",
          variant: "destructive",
        });
        return false;
      }

      // Store admin session data for later restoration
      sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          access_token: adminSession.access_token,
          refresh_token: adminSession.refresh_token,
          email: adminSession.user.email,
          impersonatedName: targetName,
        })
      );

      // Set the new session
      const { error: setError } = await supabase.auth.setSession({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      });

      if (setError) {
        sessionStorage.removeItem(STORAGE_KEY);
        toast({
          title: "Session error",
          description: "Failed to switch session",
          variant: "destructive",
        });
        return false;
      }

      setIsImpersonating(true);
      setOriginalAdminEmail(adminSession.user.email ?? null);
      setImpersonatedUserName(targetName);

      toast({
        title: "Signed in as user",
        description: `You are now viewing the app as ${targetName}`,
      });

      // Force reload to re-fetch all data under new session
      window.location.href = "/";
      return true;
    } catch (err) {
      console.error("Impersonation error:", err);
      toast({ title: "Error", description: "Impersonation failed", variant: "destructive" });
      return false;
    }
  }, []);

  const stopImpersonation = useCallback(async () => {
    try {
      const stored = sessionStorage.getItem(STORAGE_KEY);
      if (!stored) return;

      const { access_token, refresh_token } = JSON.parse(stored);

      // Restore the original admin session
      const { error } = await supabase.auth.setSession({
        access_token,
        refresh_token,
      });

      sessionStorage.removeItem(STORAGE_KEY);

      if (error) {
        // If token expired, force re-login
        toast({
          title: "Session expired",
          description: "Your admin session expired. Please sign in again.",
          variant: "destructive",
        });
        await supabase.auth.signOut();
        window.location.href = "/auth";
        return;
      }

      setIsImpersonating(false);
      setOriginalAdminEmail(null);
      setImpersonatedUserName(null);

      toast({
        title: "Switched back",
        description: "You are now back to your admin account",
      });

      window.location.href = "/";
    } catch (err) {
      console.error("Stop impersonation error:", err);
      sessionStorage.removeItem(STORAGE_KEY);
      await supabase.auth.signOut();
      window.location.href = "/auth";
    }
  }, []);

  return (
    <ImpersonationContext.Provider
      value={{
        isImpersonating,
        originalAdminEmail,
        impersonatedUserName,
        startImpersonation,
        stopImpersonation,
      }}
    >
      {children}
    </ImpersonationContext.Provider>
  );
};

export const useImpersonation = () => {
  const context = useContext(ImpersonationContext);
  if (context === undefined) {
    throw new Error("useImpersonation must be used within an ImpersonationProvider");
  }
  return context;
};

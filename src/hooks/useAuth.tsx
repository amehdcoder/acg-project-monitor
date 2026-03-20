import { useState, useEffect, createContext, useContext, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

type AppRole = "super_admin" | "systems_admin" | "user";

interface Profile {
  id: string;
  user_id: string;
  email: string;
  first_name: string;
  last_name: string;
  phone_number: string | null;
  alternate_phone: string | null;
  alternate_email: string | null;
  designation: string;
  other_designation: string | null;
  state: string | null;
  lga: string | null;
  ward: string | null;
  is_active: boolean;
  is_owner: boolean;
  approval_status: string;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  role: AppRole | null;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  isOwner: boolean;
  isApproved: boolean;
  isPendingApproval: boolean;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (data: SignUpData) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

interface SignUpData {
  email: string;
  password: string;
  first_name: string;
  last_name: string;
  phone_number?: string;
  alternate_phone?: string;
  alternate_email?: string;
  designation: string;
  other_designation?: string;
  state?: string;
  lga?: string;
  ward?: string;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(true);

  const fetchProfile = async (userId: string) => {
    try {
      setProfileLoading(true);
      const [profileRes, roleRes] = await Promise.all([
        supabase.from("profiles").select("*").eq("user_id", userId).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", userId).maybeSingle(),
      ]);

      if (profileRes.data) {
        setProfile(profileRes.data as Profile);
      }
      if (roleRes.data) {
        setRole(roleRes.data.role as AppRole);
      }
    } catch (error) {
      console.error("Error fetching profile:", error);
    } finally {
      setProfileLoading(false);
    }
  };

  useEffect(() => {
    let initialSessionHandled = false;

    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, currentSession) => {
        // Skip the initial INITIAL_SESSION if we already handled getSession
        if (event === "INITIAL_SESSION" && initialSessionHandled) return;

        setSession(currentSession);
        setUser(currentSession?.user ?? null);

        if (currentSession?.user) {
          // Defer to avoid deadlocks in auth callback
          setTimeout(() => {
            fetchProfile(currentSession.user.id);
          }, 0);
        } else {
          setProfile(null);
          setRole(null);
          setProfileLoading(false);
        }
        setLoading(false);
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(async ({ data: { session: existingSession } }) => {
      initialSessionHandled = true;
      setSession(existingSession);
      setUser(existingSession?.user ?? null);
      if (existingSession?.user) {
        await fetchProfile(existingSession.user.id);
      } else {
        setProfileLoading(false);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error as Error | null };
  };

  const signUp = async (data: SignUpData) => {
    const redirectUrl = `${window.location.origin}/`;

    const { error } = await supabase.auth.signUp({
      email: data.email,
      password: data.password,
      options: {
        emailRedirectTo: redirectUrl,
        data: {
          first_name: data.first_name,
          last_name: data.last_name,
        },
      },
    });

    if (!error) {
      // Update profile with additional data after signup
      // The trigger will create the profile, we just need to update it
      setTimeout(async () => {
        const { data: userData } = await supabase.auth.getUser();
        if (userData?.user) {
          await supabase
            .from("profiles")
            .update({
              phone_number: data.phone_number || null,
              alternate_phone: data.alternate_phone || null,
              alternate_email: data.alternate_email || null,
              designation: data.designation as "independent_monitor" | "enumerator" | "data_collector" | "electronic_data_manager" | "community_directed_distributor" | "flhf_supervisor" | "lga_supervisor" | "state_supervisor" | "hands_staff" | "cbmg_staff" | "cbmi_staff" | "sightsavers_staff" | "plan_intl_staff" | "sci_staff" | "other",
              other_designation: data.other_designation || null,
              state: data.state || null,
              lga: data.lga || null,
              ward: data.ward || null,
            })
            .eq("user_id", userData.user.id);
        }
      }, 1000);
    }

    return { error: error as Error | null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setProfile(null);
    setRole(null);
  };

  const refreshProfile = async () => {
    if (user) {
      await fetchProfile(user.id);
    }
  };

  const isAdmin = role === "super_admin" || role === "systems_admin";
  const isSuperAdmin = role === "super_admin";
  const isOwner = profile?.is_owner ?? false;
  const isApproved = profile?.approval_status === "approved" || isOwner;
  const isPendingApproval = profile?.approval_status === "pending";
  const isFullyLoaded = !loading && !profileLoading;

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        role,
        isAdmin,
        isSuperAdmin,
        isOwner,
        isApproved,
        isPendingApproval,
        loading: !isFullyLoaded,
        signIn,
        signUp,
        signOut,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};

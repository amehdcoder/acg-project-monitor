import { useState, useEffect, useRef, createContext, useContext, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";


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
  is_co_owner?: boolean;
  approval_status: string;
  avatar_url?: string | null;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  role: AppRole | null;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  isOwner: boolean;
  isCoOwner: boolean;
  /** Owner or Co-owner — near-full app rights. */
  isOwnerLevel: boolean;
  isAdhoc: boolean;
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
  // Once the FIRST auth + profile resolution completes, all subsequent profile
  // re-fetches (token refresh, SIGNED_IN on focus, realtime reconnects, online/
  // offline flaps) run SILENTLY and must NOT flip the global loader — otherwise
  // the whole app unmounts to a full-screen spinner and "blinks" on navigation.
  const initialLoadDoneRef = useRef(false);
  const [isOfflineMode, setIsOfflineMode] = useState(!navigator.onLine);

  // --- Offline Crypto Helpers ---
  const hashPassword = async (password: string): Promise<string> => {
    const msgUint8 = new TextEncoder().encode(password);
    const hashBuffer = await crypto.subtle.digest("SHA-256", msgUint8);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
  };

  const logOfflineEvent = (action: string, metadata: any = {}) => {
    try {
      const queue = JSON.parse(localStorage.getItem("ces_offline_audit_queue") || "[]");
      queue.push({
        action,
        metadata,
        timestamp: new Date().toISOString(),
        actor_id: profile?.id || user?.id || "anonymous"
      });
      localStorage.setItem("ces_offline_audit_queue", JSON.stringify(queue));
    } catch (e) {
      console.error("Audit logging failed:", e);
    }
  };

  const syncAuditQueue = async () => {
    if (!navigator.onLine) return;
    try {
      const queue = JSON.parse(localStorage.getItem("ces_offline_audit_queue") || "[]");
      if (queue.length === 0) return;

      const { error } = await supabase.from("ces_audit_log").insert(queue.map((item: any) => ({
        action: item.action,
        actor_id: item.actor_id,
        metadata: { ...item.metadata, offline_original_ts: item.timestamp },
        created_at: item.timestamp // Maintain chronological order
      })));

      if (!error) {
        localStorage.setItem("ces_offline_audit_queue", "[]");
        console.log("Offline audit log synchronized.");
      }
    } catch (e) {
      console.warn("Audit sync failed:", e);
    }
  };

  // Record a blocked sign-in attempt for deactivated/unapproved accounts.
  // Works for both online and offline modes; offline rows are flushed once
  // connectivity returns.
  const recordInactiveAttempt = async (
    email: string,
    reason: string,
    mode: "online" | "offline",
    attemptedUserId?: string | null,
    extra: Record<string, any> = {},
  ) => {
    const payload = {
      email: (email || "unknown").toLowerCase(),
      attempted_user_id: attemptedUserId ?? null,
      reason,
      mode,
      user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
      metadata: extra,
    };
    if (navigator.onLine) {
      try {
        await supabase.from("inactive_login_attempts").insert(payload);
      } catch (e) {
        console.warn("Failed to record inactive login attempt:", e);
      }
    } else {
      try {
        const queue = JSON.parse(localStorage.getItem("ces_inactive_attempt_queue") || "[]");
        queue.push({ ...payload, created_at: new Date().toISOString() });
        localStorage.setItem("ces_inactive_attempt_queue", JSON.stringify(queue));
      } catch {}
    }
  };

  const syncInactiveAttemptQueue = async () => {
    if (!navigator.onLine) return;
    try {
      const queue = JSON.parse(localStorage.getItem("ces_inactive_attempt_queue") || "[]");
      if (queue.length === 0) return;
      const { error } = await supabase.from("inactive_login_attempts").insert(queue);
      if (!error) localStorage.setItem("ces_inactive_attempt_queue", "[]");
    } catch (e) {
      console.warn("Inactive attempt queue sync failed:", e);
    }
  };


  const fetchProfile = async (userId: string, opts?: { silent?: boolean }) => {
    // Background refreshes keep the existing UI mounted — never gate the app.
    const silent = opts?.silent ?? false;
    try {
      if (!silent) setProfileLoading(true);
      const [profileRes, roleRes, userRes] = await Promise.all([
        supabase.from("profiles").select("*").eq("user_id", userId).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", userId).maybeSingle(),
        supabase.auth.getUser(),
      ]);

      const authUser = userRes.data?.user ?? null;
      const isOAuth =
        (authUser?.app_metadata as any)?.provider === "google" ||
        (Array.isArray((authUser as any)?.identities) &&
          (authUser as any).identities.some((i: any) => i?.provider === "google"));

      if (profileRes.data) {
        const p = profileRes.data as Profile;
        const isOwnerEmail = p.email === "amehjoey1@gmail.com";

        // Enforce deactivation on session restore.
        if (p.is_active === false && !isOwnerEmail) {
          await recordInactiveAttempt(p.email, "account_deactivated", "online", userId, {
            stage: "session_restore",
            approval_status: p.approval_status,
          });
          await supabase.auth.signOut();
          setUser(null);
          setSession(null);
          setProfile(null);
          setRole(null);
          toast({
            title: "Account deactivated",
            description:
              "Your account has been deactivated. Please contact your administrator to restore access.",
            variant: "destructive",
          });
          return;
        }

        // Google OAuth sign-in is ONLY allowed for users who have already
        // signed up via the Sign Up button AND been assigned a project/form
        // (or who are admin/owner). Sign-up via Google is not permitted.
        if (isOAuth && !isOwnerEmail) {
          const isAdminRole =
            roleRes.data?.role === "super_admin" || roleRes.data?.role === "systems_admin";
          if (!isAdminRole) {
            const [projAssign, formAssign] = await Promise.all([
              supabase
                .from("user_project_assignments")
                .select("id", { count: "exact", head: true })
                .eq("user_id", userId),
              supabase
                .from("user_form_assignments")
                .select("id", { count: "exact", head: true })
                .eq("user_id", userId),
            ]);
            const hasAssignment = (projAssign.count ?? 0) > 0 || (formAssign.count ?? 0) > 0;
            const isApprovedProfile = p.approval_status === "approved";
            if (!hasAssignment || !isApprovedProfile) {
              await supabase.auth.signOut();
              setUser(null);
              setSession(null);
              setProfile(null);
              setRole(null);
              toast({
                title: "Google sign-in not permitted yet",
                description: !isApprovedProfile
                  ? "Your account is still pending administrator approval. Please use email + password once approved."
                  : "Google sign-in is only enabled after an administrator assigns you to a project or form.",
                variant: "destructive",
              });
              return;
            }
          }
        }

        // Default the chat/profile avatar to the Google account photo when the
        // user has not uploaded their own picture yet.
        if (!p.avatar_url && authUser) {
          const meta: any = authUser.user_metadata ?? {};
          const googlePhoto: string | null =
            (typeof meta.avatar_url === "string" && meta.avatar_url) ||
            (typeof meta.picture === "string" && meta.picture) ||
            null;
          if (googlePhoto) {
            p.avatar_url = googlePhoto;
            supabase
              .from("profiles")
              .update({ avatar_url: googlePhoto } as any)
              .eq("user_id", userId)
              .then(() => {}, () => {});
          }
        }

        setProfile(p);
      } else if (isOAuth) {
        // Google OAuth user with no profile = attempted sign-up via Google.
        // Sign-up MUST happen through the Sign Up form. Reject and log out.
        await supabase.auth.signOut();
        setUser(null);
        setSession(null);
        setProfile(null);
        setRole(null);
        toast({
          title: "Sign up required",
          description:
            "Please create an account using the Sign Up button first. Google sign-in is only available after sign-up and project/form assignment.",
          variant: "destructive",
        });
        return;
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
          // Defer to avoid deadlocks in auth callback. After the initial load,
          // refresh the profile SILENTLY so token-refresh / re-auth events don't
          // re-trigger the full-screen loader (which causes the page to "blink").
          const silent = initialLoadDoneRef.current;
          setTimeout(() => {
            fetchProfile(currentSession.user.id, { silent });
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
      } else if (!navigator.onLine) {
        // ── ODK / KoboCollect-style offline auto-login ────────────────
        // No live Supabase session AND we're offline → hydrate from the
        // most recently cached account so the app boots logged-in.
        // Sync to the server will still require re-auth when online.
        try {
          const keys = Object.keys(localStorage).filter((k) => k.startsWith("ces_auth_cache_"));
          let latest: any = null;
          for (const k of keys) {
            const c = JSON.parse(localStorage.getItem(k) || "null");
            if (!c) continue;
            if (!latest || (c.lastUpdated && c.lastUpdated > latest.lastUpdated)) latest = c;
          }
          if (latest?.user) {
            const isOwnerEmail = latest.user.email === "amehjoey1@gmail.com";
            if (!latest.profile || latest.profile.is_active !== false || isOwnerEmail) {
              setUser(latest.user);
              setProfile(latest.profile);
              setRole(latest.role);
              setIsOfflineMode(true);
              logOfflineEvent("auto_login_offline_boot", { email: latest.user.email });
            }
          }
        } catch (e) {
          console.warn("Offline auto-login failed:", e);
        }
        setProfileLoading(false);
      } else {
        setProfileLoading(false);
      }
      setLoading(false);
      // Mark the first full auth resolution as complete so every later auth
      // event refreshes the profile in the background without blinking.
      initialLoadDoneRef.current = true;
    });

    return () => {
      subscription.unsubscribe();
      window.removeEventListener("online", syncAuditQueue);
    };
  }, []);

  useEffect(() => {
    const handleOnline = () => { setIsOfflineMode(false); syncAuditQueue(); syncInactiveAttemptQueue(); };
    const handleOffline = () => { setIsOfflineMode(true); };
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);


  const signIn = async (email: string, password: string) => {
    if (!navigator.onLine) {
      // ─── OFFLINE LOGIN ──────────────────────────────────────────
      try {
        const cacheRaw = localStorage.getItem(`ces_auth_cache_${email.toLowerCase()}`);
        if (!cacheRaw) throw new Error("No offline credentials found. Please login online first.");

        const cache = JSON.parse(cacheRaw);
        const inputHash = await hashPassword(password);

        if (inputHash === cache.passwordHash) {
          const isOwnerEmail = cache.user?.email === "amehjoey1@gmail.com";
          if (cache.profile && cache.profile.is_active === false && !isOwnerEmail) {
            logOfflineEvent("login_blocked", { mode: "offline", email, reason: "account_deactivated" });
            await recordInactiveAttempt(email, "account_deactivated", "offline", cache.user?.id, {
              stage: "sign_in",
              approval_status: cache.profile?.approval_status,
            });
            throw new Error(
              "Your account has been deactivated. Please contact your administrator to restore access."
            );
          }

          setUser(cache.user);
          setProfile(cache.profile);
          setRole(cache.role);
          setLoading(false);
          setProfileLoading(false);

          logOfflineEvent("login", { mode: "offline", email });
          toast({ title: "Offline Login Successful", description: "You are logged in using cached credentials." });
          return { error: null };
        } else {
          logOfflineEvent("login_failed", { mode: "offline", email, reason: "invalid_password" });
          throw new Error("Invalid password (Offline).");
        }
      } catch (err: any) {
        return { error: err };
      }
    }


    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (!error && data.user) {
      // Fetch profile to ensure we cache the latest data AND enforce deactivation
      const [profileRes, roleRes] = await Promise.all([
        supabase.from("profiles").select("*").eq("user_id", data.user.id).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", data.user.id).maybeSingle(),
      ]);

      // Hard block: deactivated accounts cannot proceed past sign-in.
      // We do NOT block the owner email, to avoid lockouts.
      const isOwnerEmail = data.user.email === "amehjoey1@gmail.com";
      if (
        profileRes.data &&
        profileRes.data.is_active === false &&
        !isOwnerEmail
      ) {
        await supabase.auth.signOut();
        // Wipe any cached offline credentials for this email so they can't
        // bypass the block via offline login.
        try {
          localStorage.removeItem(`ces_auth_cache_${email.toLowerCase()}`);
        } catch {}
        logOfflineEvent("login_blocked", {
          mode: "online",
          email,
          reason: "account_deactivated",
        });
        await recordInactiveAttempt(email, "account_deactivated", "online", data.user.id, {
          stage: "sign_in",
          approval_status: profileRes.data?.approval_status,
        });
        return {
          error: new Error(
            "Your account has been deactivated. Please contact your administrator to restore access."
          ),
        };
      }

      // Cache for future offline use (only for active accounts)
      const hash = await hashPassword(password);
      const authCache = {
        email: email.toLowerCase(),
        passwordHash: hash,
        user: data.user,
        profile: profileRes.data,
        role: roleRes.data?.role,
        lastUpdated: new Date().toISOString(),
      };

      localStorage.setItem(`ces_auth_cache_${email.toLowerCase()}`, JSON.stringify(authCache));
      logOfflineEvent("login", { mode: "online", email });
    }

    return { error: error as Error | null };
  };


  const signUp = async (data: SignUpData) => {
    const redirectUrl = `${window.location.origin}/`;

    const { error } = await supabase.auth.signUp({
      email: data.email,
      password: data.password,
      options: {
        emailRedirectTo: redirectUrl,
        // Pass ALL signup fields as user metadata so the database trigger
        // (handle_new_user) writes the correct designation + location onto the
        // profile at creation time. This is the permanent fix that guarantees
        // the chosen designation is never silently defaulted to data_collector.
        data: {
          first_name: data.first_name,
          last_name: data.last_name,
          phone_number: data.phone_number || "",
          alternate_phone: data.alternate_phone || "",
          alternate_email: data.alternate_email || "",
          designation: data.designation || "",
          other_designation: data.other_designation || "",
          state: data.state || "",
          lga: data.lga || "",
          ward: data.ward || "",
        },
      },
    });

    if (!error) {
      // Belt-and-braces: also update the profile post-signup in case the row
      // already existed. With email auto-confirm enabled the session exists, so
      // this update succeeds; if not, the trigger metadata above already wrote
      // the correct values.
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
    const userEmail = user?.email;
    
    // 1. Clear Supabase session
    await supabase.auth.signOut();
    
    // 2. Clear LocalStorage caches
    if (userEmail) {
      localStorage.removeItem(`ces_auth_cache_${userEmail.toLowerCase()}`);
    }
    Object.keys(localStorage).forEach(key => {
      if (
        key.startsWith("kpi_cache_") || 
        key.startsWith("detail_cache_") || 
        key.startsWith("ces_auth_cache_") ||
        key.startsWith("survey_progress_") ||
        // Wipe the WhatsApp-style chat unread badge cache so a different user
        // signing in on this device never sees the previous user's stale count.
        key.startsWith("amehnities:chat:unread")
      ) {
        localStorage.removeItem(key);
      }
    });

    // 3. Clear IndexedDB (Scorched earth for data residency compliance)
    // This removes pending submissions, drafts, and offline household queues.
    try {
      const dbs = ["acg_monitor_offline", "ces_offline"];
      dbs.forEach(dbName => {
        const req = indexedDB.deleteDatabase(dbName);
        req.onerror = () => console.warn(`Could not purge DB ${dbName}`);
        req.onsuccess = () => console.log(`Purged DB ${dbName} for security compliance.`);
      });
    } catch (e) {
      console.error("IndexedDB purge failed:", e);
    }

    setUser(null);
    setSession(null);
    setProfile(null);
    setRole(null);
  };



  const refreshProfile = async () => {
    if (user) {
      // Silent refresh — never gate the whole app behind the loader.
      await fetchProfile(user.id, { silent: true });
    }
  };

  const isOwner = profile?.is_owner || user?.email === "amehjoey1@gmail.com";
  const isCoOwner = !!profile?.is_co_owner && !isOwner;
  const isOwnerLevel = isOwner || isCoOwner;
  const isAdmin = role === "super_admin" || role === "systems_admin" || isOwnerLevel;
  const isSuperAdmin = role === "super_admin" || isOwner;
  // Adhoc users are limited to a single assigned form, their own submissions,
  // and the project chat for the project they are assigned to. Admins/owner are
  // never treated as adhoc even if their designation is mislabeled.
  const isAdhoc = !isAdmin && profile?.designation === "adhoc_user";



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
        isCoOwner,
        isOwnerLevel,
        isAdhoc,
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

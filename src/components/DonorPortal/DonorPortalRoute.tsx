import { Component, type ReactNode } from "react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { lovable } from "@/integrations/lovable/index";
import { Globe2, ShieldCheck } from "lucide-react";
import DonorPortal from "./DonorPortal";

class DonorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="donor-portal flex min-h-[100dvh] flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="donor-heading text-xl">The donor portal could not open</h1>
        <p className="max-w-sm text-sm opacity-70">Please refresh the page, or contact the programme team.</p>
        <Button onClick={() => this.setState({ failed: false })}>Try again</Button>
      </main>
    );
  }
}

/** Minimal email/password sign-in scoped to the donor portal. */
function DonorSignIn() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"signin" | "signup" | "forgot">("signin");
  const [notice, setNotice] = useState<string | null>(null);

  const signIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (mode === "forgot") {
        const result = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/reset-password` });
        if (result.error) throw result.error;
        setNotice("Check your email for a password reset link.");
      } else if (mode === "signup") {
        const result = await supabase.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: `${window.location.origin}/donor` } });
        if (result.error) throw result.error;
        if (!result.data.session) setNotice("Check your email to confirm your account, then sign in here.");
      } else {
        const result = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (result.error) throw result.error;
      }
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };

  const socialSignIn = async (provider: "google" | "lovable") => {
    setBusy(true); setError(null);
    try { const result = await lovable.auth.signInWithOAuth(provider, { redirect_uri: `${window.location.origin}/donor` }); if (result.error) throw result.error; }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <main className="donor-portal flex min-h-[100dvh] flex-col items-center justify-center gap-7 p-6">
      <div className="text-center"><Globe2 className="mx-auto mb-4 h-12 w-12 text-primary" /><p className="donor-eyebrow">Amehnities</p><h1 className="donor-heading mt-2 text-3xl">Donor Portal</h1></div>
      <form onSubmit={signIn} className="donor-card w-full max-w-md space-y-5 p-6 sm:p-8">
        <div className="space-y-1">
          <p className="donor-eyebrow">Amehnities · Donor Portal</p>
          <h2 className="donor-heading text-xl">{mode === "signup" ? "Create your donor account" : mode === "forgot" ? "Reset your password" : "Welcome back"}</h2>
        </div>
        {mode !== "forgot" && <div className="grid grid-cols-2 gap-2"><Button type="button" variant={mode === "signin" ? "default" : "outline"} onClick={() => { setMode("signin"); setError(null); setNotice(null); }}>Sign in</Button><Button type="button" variant={mode === "signup" ? "default" : "outline"} onClick={() => { setMode("signup"); setError(null); setNotice(null); }}>Create account</Button></div>}
        <div className="space-y-2"><Label htmlFor="donor-email">Email address</Label><Input id="donor-email" autoComplete="email" type="email" required placeholder="you@organisation.org" value={email} onChange={(e) => setEmail(e.target.value)} className="h-[52px]" /></div>
        {mode !== "forgot" && <div className="space-y-2"><Label htmlFor="donor-password">Password</Label><Input id="donor-password" autoComplete={mode === "signup" ? "new-password" : "current-password"} minLength={mode === "signup" ? 8 : undefined} type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="h-[52px]" /></div>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {notice && <p role="status" className="text-sm text-status-success">{notice}</p>}
        <Button type="submit" className="h-[52px] w-full" disabled={busy}>{busy ? "Please wait…" : mode === "signup" ? "Create account" : mode === "forgot" ? "Send reset link" : "Sign in"}</Button>
        <Button type="button" variant="link" className="w-full" onClick={() => { setMode(mode === "forgot" ? "signin" : "forgot"); setError(null); setNotice(null); }}>{mode === "forgot" ? "Back to sign in" : "Forgot password?"}</Button>
        {mode !== "forgot" && <div className="space-y-2 border-t border-border pt-4"><Button type="button" variant="outline" className="w-full" disabled={busy} onClick={() => void socialSignIn("google")}>Continue with Google</Button><Button type="button" variant="outline" className="w-full" disabled={busy} onClick={() => void socialSignIn("lovable")}>Sign in with Lovable</Button></div>}
      </form>
      <p className="flex items-center gap-2 text-sm opacity-70"><ShieldCheck className="h-4 w-4" />Secure accounts · Private project access</p>
    </main>
  );
}

/**
 * Standalone donor portal shell: its own auth check, no workspace providers,
 * no record navigation, no editing affordances.
 */
export default function DonorPortalRoute() {
  const [userId, setUserId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      if (!mounted) return;
      setUserId(session?.user?.id ?? null);
      setReady(true);
    });
    supabase.auth.getUser().then(({ data }) => {
      if (!mounted) return;
      setUserId(data.user?.id ?? null);
      setReady(true);
    });
    return () => { mounted = false; sub.subscription.unsubscribe(); };
  }, []);

  if (!ready) {
    return (
      <main className="donor-portal flex min-h-[100dvh] items-center justify-center">
        <p className="donor-heading animate-pulse text-lg">Preparing your portal…</p>
      </main>
    );
  }

  return <DonorBoundary>{userId ? <DonorPortal userId={userId} /> : <DonorSignIn />}</DonorBoundary>;
}

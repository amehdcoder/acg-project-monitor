import { Component, type ReactNode } from "react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

  const signIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) setError(error.message);
    setBusy(false);
  };

  return (
    <main className="donor-portal flex min-h-[100dvh] items-center justify-center p-6">
      <form onSubmit={signIn} className="donor-card w-full max-w-sm space-y-5 p-8">
        <div className="space-y-1 text-center">
          <p className="donor-eyebrow">Amehnities · Donor Portal</p>
          <h1 className="donor-heading text-2xl">Welcome</h1>
          <p className="text-sm opacity-70">Sign in with the account your programme team granted donor access to.</p>
        </div>
        <Input type="email" required placeholder="Email address" value={email} onChange={(e) => setEmail(e.target.value)} />
        <Input type="password" required placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" className="w-full" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</Button>
      </form>
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
    supabase.auth.getUser().then(({ data }) => {
      if (!mounted) return;
      setUserId(data.user?.id ?? null);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      setUserId(session?.user?.id ?? null);
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

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Circle, LogOut, ShieldCheck, Sprout, Send } from "lucide-react";
import { progressSubmissionError, type PortalPathway } from "@/lib/programmeModule/beneficiaryPortal";

export default function BeneficiaryPortalRoute() {
  const [signedIn, setSignedIn] = useState(false);
  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState<"signin" | "signup" | "forgot">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pathways, setPathways] = useState<PortalPathway[]>([]);
  const [chosen, setChosen] = useState<{ pathway: PortalPathway; stage: string } | null>(null);
  const [date, setDate] = useState("");
  const [notes, setNotes] = useState("");
  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc("my_beneficiary_pathways");
    if (error) { setError(error.message); return; }
    setPathways((data as unknown as PortalPathway[]) || []);
  }, []);
  useEffect(() => {
    let mounted = true;
    const check = async () => {
      const { data } = await supabase.auth.getUser();
      if (mounted) { setSignedIn(Boolean(data.user)); setReady(true); }
    };
    const { data } = supabase.auth.onAuthStateChange(() => { window.setTimeout(() => void check(), 0); });
    void check();
    return () => { mounted = false; data.subscription.unsubscribe(); };
  }, []);
  useEffect(() => { if (signedIn) void load(); else setPathways([]); }, [signedIn, load]);
  const authenticate = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setError(""); setNotice("");
    try {
      if (mode === "forgot") {
        const r = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/reset-password` });
        if (r.error) throw r.error;
        setNotice("Check your email for a password reset link.");
      } else if (mode === "signup") {
        const r = await supabase.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: `${window.location.origin}/beneficiary`, data: { first_name: name.trim() } } });
        if (r.error) throw r.error;
        setNotice("Confirm your email, then ask your programme team to verify and link your record.");
      } else {
        const r = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (r.error) throw r.error;
      }
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); if (!chosen) return;
    const validation = progressSubmissionError(chosen.pathway.gate.status, chosen.stage, notes, date, new Date().toISOString().slice(0, 10));
    if (validation) { setError(validation); return; }
    setBusy(true); setError("");
    const r = await supabase.rpc("submit_beneficiary_progress", { _account: chosen.pathway.account_id, _stage: chosen.stage, _date: date, _notes: notes });
    setBusy(false);
    if (r.error) { setError(r.error.message); return; }
    setChosen(null); setNotes(""); setNotice("Progress sent to your programme team for review."); await load();
  };
  return <main className="donor-portal h-[100dvh] overflow-y-auto overscroll-contain">
    <header className="border-b border-border bg-background"><div className="mx-auto flex max-w-5xl items-center justify-between gap-3 p-4 sm:px-8">
      <div className="flex items-center gap-3"><Sprout className="h-8 w-8 text-health-teal" /><div><p className="donor-eyebrow">Amehnities</p><h1 className="donor-heading text-xl">My Graduation pathway</h1></div></div>
      {signedIn && <Button variant="outline" size="icon" aria-label="Sign out" onClick={() => void supabase.auth.signOut()}><LogOut className="h-4 w-4" /></Button>}
    </div></header>
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-8">
      {!ready ? <p role="status">Opening your account…</p> : !signedIn ? <form onSubmit={authenticate} className="donor-card mx-auto max-w-md space-y-5 p-6">
        <h2 className="donor-heading text-2xl">{mode === "signup" ? "Create your account" : mode === "forgot" ? "Reset password" : "Welcome back"}</h2>
        <div className="flex gap-2"><Button type="button" variant={mode === "signin" ? "default" : "outline"} onClick={() => setMode("signin")}>Sign in</Button><Button type="button" variant={mode === "signup" ? "default" : "outline"} onClick={() => setMode("signup")}>Create account</Button></div>
        {mode === "signup" && <div className="space-y-2"><Label htmlFor="portal-name">Your name</Label><Input id="portal-name" required autoComplete="name" value={name} onChange={e => setName(e.target.value)} /></div>}
        <div className="space-y-2"><Label htmlFor="portal-email">Email address</Label><Input id="portal-email" required type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} /></div>
        {mode !== "forgot" && <div className="space-y-2"><Label htmlFor="portal-password">Password</Label><Input id="portal-password" required type="password" minLength={mode === "signup" ? 8 : undefined} autoComplete={mode === "signup" ? "new-password" : "current-password"} value={password} onChange={e => setPassword(e.target.value)} /></div>}
        <Button className="h-[52px] w-full" disabled={busy}>{busy ? "Please wait…" : mode === "signup" ? "Create account" : mode === "forgot" ? "Send reset link" : "Sign in"}</Button>
        <Button type="button" variant="link" onClick={() => setMode("forgot")}>Forgot password?</Button>
      </form> : pathways.length === 0 ? <section className="space-y-3 py-12 text-center"><ShieldCheck className="mx-auto h-12 w-12 text-health-teal" /><h2 className="donor-heading text-2xl">Awaiting record verification</h2><p className="mx-auto max-w-md text-muted-foreground">Your account is signed in. Your programme team must verify and link your beneficiary record before your pathway appears.</p></section> : pathways.map(pathway => {
        const completed = pathway.stages.filter(stage => pathway.services.some(s => s.service_name === stage)).length;
        return <section key={pathway.account_id} className="space-y-5">
          <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="donor-eyebrow">{pathway.project_name}</p><h2 className="donor-heading mt-2 text-2xl">{pathway.name}</h2></div><Badge variant="secondary">{pathway.gate.status}</Badge></div>
          <div className="space-y-2"><div className="flex justify-between text-sm"><span>Confirmed progress</span><strong>{completed} / {pathway.stages.length} stages</strong></div><Progress value={pathway.stages.length ? completed / pathway.stages.length * 100 : 0} /></div>
          <ol className="divide-y border-y border-border">{pathway.stages.map((stage, i) => {
            const done = pathway.services.some(s => s.service_name === stage);
            const pending = pathway.submissions.find(s => s.stage === stage && s.status === "pending");
            return <li key={stage} className="flex items-center gap-3 py-4">{done ? <CheckCircle2 className="h-6 w-6 shrink-0 text-status-success" /> : <Circle className="h-6 w-6 shrink-0 text-muted-foreground" />}<div className="min-w-0 flex-1"><p className="text-xs text-muted-foreground">Stage {i + 1}</p><p className="break-words font-medium">{stage}</p>{pending && <p className="text-sm text-health-amber">Awaiting review</p>}</div>{!done && !pending && pathway.gate.status === "selected" && <Button size="icon" variant="outline" aria-label={`Submit progress for ${stage}`} onClick={() => { setChosen({ pathway, stage }); setDate(new Date().toISOString().slice(0, 10)); setNotes(""); setError(""); }}><Send className="h-4 w-4" /></Button>}</li>;
          })}</ol>
          {pathway.submissions.length > 0 && <div><h3 className="donor-heading mb-3 text-lg">Your submissions</h3><ul className="space-y-3">{pathway.submissions.map(s => <li key={s.id} className="donor-card space-y-2 p-4"><div className="flex flex-wrap justify-between gap-2"><strong className="text-sm">{s.stage}</strong><Badge variant="outline">{s.status}</Badge></div><p className="text-xs text-muted-foreground">{s.activity_date}</p><p className="whitespace-pre-wrap break-words text-sm">{s.notes}</p>{s.review_notes && <p className="text-sm text-health-blue">Programme team: {s.review_notes}</p>}</li>)}</ul></div>}
        </section>;
      })}
      {chosen && <form onSubmit={submit} className="donor-card space-y-4 p-5"><h2 className="donor-heading text-xl">{chosen.stage}</h2><div className="space-y-2"><Label htmlFor="progress-date">Activity date</Label><Input id="progress-date" required type="date" max={new Date().toISOString().slice(0, 10)} value={date} onChange={e => setDate(e.target.value)} /></div><div className="space-y-2"><Label htmlFor="progress-notes">What did you complete?</Label><Textarea id="progress-notes" required minLength={5} maxLength={4000} value={notes} onChange={e => setNotes(e.target.value)} /></div><div className="flex gap-2"><Button disabled={busy}><Send className="mr-2 h-4 w-4" />Submit progress</Button><Button type="button" variant="outline" onClick={() => setChosen(null)}>Cancel</Button></div></form>}
      {error && <p role="alert" className="text-destructive">{error}</p>}{notice && <p role="status" className="text-status-success">{notice}</p>}
    </div>
  </main>;
}
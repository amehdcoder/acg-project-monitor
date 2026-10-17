import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, CheckCircle2, HeartHandshake, Loader2, Lock,
  MessageSquareHeart, ShieldCheck, Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";
import handsEmblem from "@/assets/hands-emblem.png";

const CATEGORIES = [
  { value: "service_quality", label: "Quality of services", hint: "How services were delivered or received" },
  { value: "staff_conduct", label: "Staff or volunteer conduct", hint: "Behaviour of anyone working on the programme" },
  { value: "medicine_supply", label: "Medicines or supplies", hint: "Availability, quality or distribution of commodities" },
  { value: "exclusion_inclusion", label: "Inclusion or exclusion", hint: "Someone wrongly left out or included" },
  { value: "safety_dignity", label: "Safety, dignity or exploitation", hint: "Anything that made someone feel unsafe or disrespected" },
  { value: "corruption_diversion", label: "Corruption or diversion", hint: "Misuse of programme resources or funds" },
  { value: "data_privacy", label: "Privacy of information", hint: "Concerns about how personal information is handled" },
  { value: "appreciation", label: "Appreciation", hint: "Something that went well" },
  { value: "suggestion", label: "Suggestion", hint: "An idea to improve the programme" },
  { value: "other", label: "Other", hint: "Anything else you want to tell us" },
] as const;

const SEVERITIES = [
  { value: "standard", label: "Standard", description: "A general complaint, question or feedback." },
  { value: "serious", label: "Serious", description: "Needs prompt attention — e.g. service failure or misconduct." },
  { value: "sensitive", label: "Sensitive", description: "Involves safety, exploitation or abuse. Handled with strict confidentiality." },
] as const;

const NIGERIAN_STATES = [
  "Abia","Adamawa","Akwa Ibom","Anambra","Bauchi","Bayelsa","Benue","Borno","Cross River",
  "Delta","Ebonyi","Edo","Ekiti","Enugu","FCT - Abuja","Gombe","Imo","Jigawa","Kaduna","Kano",
  "Katsina","Kebbi","Kogi","Kwara","Lagos","Nasarawa","Niger","Ogun","Ondo","Osun","Oyo",
  "Plateau","Rivers","Sokoto","Taraba","Yobe","Zamfara",
];

const FeedbackForm = ({ projectId }: { projectId?: string }) => {
  const [projectName, setProjectName] = useState<string | null>(null);
  const [projectState, setProjectState] = useState<"loading" | "ok" | "missing" | "unavailable">("loading");
  const [lookupAttempt, setLookupAttempt] = useState(0);

  const [category, setCategory] = useState("");
  const [severity, setSeverity] = useState("standard");
  const [message, setMessage] = useState("");
  const [state, setState] = useState("");
  const [lga, setLga] = useState("");
  const [ward, setWard] = useState("");
  const [community, setCommunity] = useState("");
  const [anonymous, setAnonymous] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [preferredContact, setPreferredContact] = useState("phone");
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [reference, setReference] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15000);
    setProjectState("loading");
    (async () => {
      if (!projectId) { setProjectState("missing"); return; }
      // The project name is served by the public function — anonymous visitors
      // cannot read the projects table directly.
      const base = import.meta.env.VITE_SUPABASE_URL as string;
      const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
      try {
        const res = await fetch(
          `${base}/functions/v1/submit-feedback?project_id=${encodeURIComponent(projectId)}`,
          { headers: { apikey: key }, signal: controller.signal, credentials: "omit", cache: "no-store" },
        );
        if (!alive) return;
        if (!res.ok) { setProjectState([400, 404].includes(res.status) ? "missing" : "unavailable"); return; }
        const data = (await res.json()) as { name?: string };
        if (!data.name) { setProjectState("missing"); return; }
        setProjectName(data.name);
        setProjectState("ok");
      } catch {
        if (alive) setProjectState("unavailable");
      }
    })();
    return () => { alive = false; controller.abort(); window.clearTimeout(timeout); };
  }, [projectId, lookupAttempt]);

  const canSubmit = useMemo(
    () => category && message.trim().length >= 10 && consent && !submitting,
    [category, message, consent, submitting],
  );

  const submit = async () => {
    if (!canSubmit || !projectId) return;
    setSubmitting(true);
    setError(null);
    try {
      // Always anonymous: never attach a workspace user's saved access token.
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/submit-feedback`, {
        method: "POST",
        credentials: "omit",
        headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: projectId,
          category,
          severity,
          message: message.trim(),
          state: state || null,
          lga: lga || null,
          ward: ward || null,
          community: community || null,
          is_anonymous: anonymous,
          reporter_name: name || null,
          reporter_phone: phone || null,
          reporter_email: email || null,
          preferred_contact: preferredContact,
          consent_given: consent,
        }),
      });
      const data = await response.json() as { error?: string; reference?: string };
      if (!response.ok || data.error || !data.reference) throw new Error(data.error || "Could not send your report. Please try again.");
      setReference(data.reference);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send your report. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (projectState === "loading") {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-slate-50">
        <Loader2 className="h-8 w-8 animate-spin text-teal-600" />
      </div>
    );
  }

  if (projectState === "missing" || projectState === "unavailable") {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-3 bg-slate-50 px-6 text-center">
        <AlertTriangle className="h-10 w-10 text-amber-500" />
        <h1 className="text-xl font-semibold text-foreground">{projectState === "missing" ? "This feedback link is not valid" : "The feedback form is temporarily unavailable"}</h1>
        <p className="max-w-sm text-sm text-slate-500">
          {projectState === "missing" ? "Please scan the QR code again or ask the programme team for a new feedback link." : "Check your internet connection and try again. You do not need to sign in."}
        </p>
        {projectState === "unavailable" && <Button onClick={() => setLookupAttempt((n) => n + 1)}>Try again</Button>}
      </div>
    );
  }

  if (reference) {
    return (
      <div className="min-h-[100dvh] bg-gradient-to-b from-teal-50 via-white to-slate-50 px-4 py-14">
        <div className="mx-auto max-w-lg rounded-2xl border border-teal-100 bg-white p-8 text-center shadow-[0_18px_50px_-24px_rgba(13,148,136,0.35)]">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-teal-50">
            <CheckCircle2 className="h-9 w-9 text-teal-600" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Thank you — we've received it</h1>
          <p className="mt-3 text-sm leading-relaxed text-slate-600">
            Your report has been safely delivered to the programme team. It will be reviewed and handled confidentially.
          </p>
          <div className="mt-6 rounded-xl bg-slate-50 px-4 py-3">
            <p className="text-[11px] font-medium uppercase tracking-wider text-slate-400">Your reference number</p>
            <p className="mt-1 font-mono text-lg font-semibold tracking-wide text-slate-900">{reference}</p>
          </div>
          <p className="mt-4 text-xs text-slate-400">
            Keep this number if you shared your contact details — it helps the team follow up with you.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-gradient-to-b from-teal-50/70 via-white to-slate-50 pb-20">
      {/* Header */}
      <header className="border-b border-teal-100/70 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-4">
          <img src={handsEmblem} alt="HANDS" className="h-11 w-11 rounded-xl object-contain" />
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-teal-700">Amehnities · HANDS Nigeria</p>
            <h1 className="text-lg font-bold leading-tight text-slate-900 sm:text-xl">
              Community Complaints &amp; Feedback
            </h1>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-6 px-4 pt-6">
        {/* Intro */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50">
              <MessageSquareHeart className="h-5 w-5 text-teal-600" />
            </div>
            <div>
              <h2 className="font-semibold text-slate-900">Your voice matters{projectName ? ` — ${projectName}` : ""}</h2>
              <p className="mt-1 text-sm leading-relaxed text-slate-600">
                Use this form to share a complaint, concern, suggestion or appreciation about this programme.
                You do not need an account. You may remain anonymous, and sensitive reports are treated with
                strict confidentiality in line with international accountability and safeguarding standards.
              </p>
            </div>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            {[
              { icon: Lock, text: "Confidential handling" },
              { icon: ShieldCheck, text: "Safe to report — no retaliation" },
              { icon: Sparkles, text: "Free of charge, always" },
            ].map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs font-medium text-slate-600">
                <Icon className="h-3.5 w-3.5 text-teal-600" /> {text}
              </div>
            ))}
          </div>
        </section>

        {/* Category */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <Label className="text-sm font-semibold text-slate-900">1. What is your report about? <span className="text-rose-500">*</span></Label>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {CATEGORIES.map((c) => (
              <button
                key={c.value}
                type="button"
                onClick={() => setCategory(c.value)}
                className={cn(
                  "rounded-xl border px-4 py-3 text-left transition-all",
                  category === c.value
                    ? "border-teal-500 bg-teal-50/70 ring-2 ring-teal-500/20"
                    : "border-slate-200 bg-white hover:border-teal-200 hover:bg-teal-50/40",
                )}
              >
                <p className="text-sm font-semibold text-slate-900">{c.label}</p>
                <p className="mt-0.5 text-xs text-slate-500">{c.hint}</p>
              </button>
            ))}
          </div>
        </section>

        {/* Severity */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <Label className="text-sm font-semibold text-slate-900">2. How serious is it?</Label>
          <RadioGroup value={severity} onValueChange={setSeverity} className="mt-3 space-y-2">
            {SEVERITIES.map((s) => (
              <label
                key={s.value}
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 transition-all",
                  severity === s.value
                    ? s.value === "sensitive"
                      ? "border-rose-400 bg-rose-50/60 ring-2 ring-rose-400/20"
                      : "border-teal-500 bg-teal-50/70 ring-2 ring-teal-500/20"
                    : "border-slate-200 hover:border-teal-200",
                )}
              >
                <RadioGroupItem value={s.value} className="mt-0.5" />
                <span>
                  <span className="block text-sm font-semibold text-slate-900">{s.label}</span>
                  <span className="block text-xs text-slate-500">{s.description}</span>
                </span>
              </label>
            ))}
          </RadioGroup>
          {severity === "sensitive" && (
            <p className="mt-3 flex items-start gap-2 rounded-lg bg-rose-50 px-3 py-2 text-xs leading-relaxed text-rose-700">
              <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Sensitive reports are seen only by authorised safeguarding personnel. If someone is in
              immediate danger, please also contact local emergency services.
            </p>
          )}
        </section>

        {/* Message */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <Label htmlFor="ff-message" className="text-sm font-semibold text-slate-900">
            3. Tell us what happened <span className="text-rose-500">*</span>
          </Label>
          <Textarea
            id="ff-message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={6}
            maxLength={4000}
            placeholder="Describe what happened, when it happened, and who was involved. Please do not include details you are not comfortable sharing."
            className="mt-3 resize-y rounded-xl"
          />
          <p className="mt-1 text-right text-[11px] text-slate-400">{message.length}/4000</p>
        </section>

        {/* Location */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <Label className="text-sm font-semibold text-slate-900">4. Where did this happen? <span className="font-normal text-slate-400">(optional)</span></Label>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="ff-state" className="text-xs text-slate-500">State</Label>
              <select
                id="ff-state"
                value={state}
                onChange={(e) => setState(e.target.value)}
                className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">Select state…</option>
                {NIGERIAN_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <Label htmlFor="ff-lga" className="text-xs text-slate-500">LGA</Label>
              <Input id="ff-lga" value={lga} onChange={(e) => setLga(e.target.value)} className="mt-1" placeholder="Local Government Area" />
            </div>
            <div>
              <Label htmlFor="ff-ward" className="text-xs text-slate-500">Ward</Label>
              <Input id="ff-ward" value={ward} onChange={(e) => setWard(e.target.value)} className="mt-1" placeholder="Ward" />
            </div>
            <div>
              <Label htmlFor="ff-community" className="text-xs text-slate-500">Community / village</Label>
              <Input id="ff-community" value={community} onChange={(e) => setCommunity(e.target.value)} className="mt-1" placeholder="Community name" />
            </div>
          </div>
        </section>

        {/* Identity */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <Label className="text-sm font-semibold text-slate-900">5. Who are you? <span className="font-normal text-slate-400">(optional)</span></Label>
          <label className="mt-3 flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3">
            <Checkbox checked={anonymous} onCheckedChange={(v) => setAnonymous(v === true)} className="mt-0.5" />
            <span>
              <span className="block text-sm font-semibold text-slate-900">I want to remain anonymous</span>
              <span className="block text-xs text-slate-500">
                We will not record your name or contact details. Note: we won't be able to follow up with you.
              </span>
            </span>
          </label>
          {!anonymous && (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="ff-name" className="text-xs text-slate-500">Your name</Label>
                <Input id="ff-name" value={name} onChange={(e) => setName(e.target.value)} className="mt-1" placeholder="Full name" />
              </div>
              <div>
                <Label htmlFor="ff-phone" className="text-xs text-slate-500">Phone number</Label>
                <Input id="ff-phone" value={phone} onChange={(e) => setPhone(e.target.value)} className="mt-1" placeholder="080…" inputMode="tel" />
              </div>
              <div>
                <Label htmlFor="ff-email" className="text-xs text-slate-500">Email</Label>
                <Input id="ff-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1" placeholder="you@example.com" />
              </div>
              <div>
                <Label className="text-xs text-slate-500">Preferred way to reach you</Label>
                <RadioGroup value={preferredContact} onValueChange={setPreferredContact} className="mt-2 flex gap-4">
                  {["phone", "email", "none"].map((m) => (
                    <label key={m} className="flex cursor-pointer items-center gap-1.5 text-sm text-slate-700">
                      <RadioGroupItem value={m} /> {m === "none" ? "No follow-up" : m[0].toUpperCase() + m.slice(1)}
                    </label>
                  ))}
                </RadioGroup>
              </div>
            </div>
          )}
        </section>

        {/* Consent + submit */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <label className="flex cursor-pointer items-start gap-3">
            <Checkbox checked={consent} onCheckedChange={(v) => setConsent(v === true)} className="mt-0.5" />
            <span className="text-sm leading-relaxed text-slate-700">
              <span className="font-semibold">I understand and agree</span> that the information I provide will be
              used by the programme team to look into and respond to my report, handled confidentially and in line
              with the Nigeria Data Protection Act. <span className="text-rose-500">*</span>
            </span>
          </label>
          {error && (
            <p className="mt-3 flex items-center gap-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
              <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
            </p>
          )}
          <Button
            onClick={submit}
            disabled={!canSubmit}
            className="mt-4 h-12 w-full rounded-xl bg-teal-600 text-base font-semibold hover:bg-teal-700"
          >
            {submitting ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <HeartHandshake className="mr-2 h-5 w-5" />}
            Send my report
          </Button>
          <p className="mt-3 text-center text-[11px] leading-relaxed text-slate-400">
            This channel is managed by the programme's accountability team. Submitting feedback is free and
            will never affect the services you receive.
          </p>
        </section>
      </main>
    </div>
  );
};

export default FeedbackForm;

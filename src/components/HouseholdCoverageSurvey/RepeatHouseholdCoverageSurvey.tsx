import { useEffect, useMemo, useRef, useState } from "react";
import {
  Home,
  MapPin,
  Crosshair,
  Users,
  Plus,
  Minus,
  Trash2,
  ShieldPlus,
  Lightbulb,
  ClipboardCheck,
  CheckCircle2,
  Loader2,
  Send,
  ArrowLeft,
  ArrowRight,
  Cloud,
  Wifi,
  X,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import { useAuth } from "@/hooks/useAuth";
import { useInstantLocation } from "@/hooks/useInstantLocation";
import LocationStatusBadge from "@/components/LocationStatusBadge";
import { toast } from "@/hooks/use-toast";
import { queueOrInsert } from "@/lib/offlineSubmissions";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export interface HcsLocation {
  state?: string;
  lga?: string;
  ward?: string;
  flhf_name?: string;
  community_name?: string;
  settlement_name?: string;
}

interface PersonRow {
  name: string;
  age: string;
  sex: "M" | "F" | "";
  offered: "Y" | "N" | "";
  swallowed: "Y" | "N" | "";
  reason: string;
}

interface HouseholdRecord {
  household_no: number;
  gps: { lat: number; lng: number; accuracy: number } | null;
  cdd_came: "yes" | "no" | "dont_know" | "";
  anyone_treated: "yes" | "no" | "";
  offered_count: number;
  swallowed_count: number;
  people: PersonRow[];
  side_effects: "yes" | "no" | "dont_know" | "";
  side_effects_detail: string;
  ae_reported: boolean;
  f1_asked_height: "yes" | "no" | "na" | "";
  f3_satisfied: "very" | "satisfied" | "not" | "no_opinion" | "";
  f4_why: string;
  suggestions: string;
}

interface Props {
  projectId?: string | null;
  formId?: string | null;
  checklistSubmissionId?: string | null;
  targetHouseholds: number;
  location?: HcsLocation;
  initialGps?: { lat: number; lng: number; accuracy?: number } | null;
  onClose: () => void;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const emptyPerson = (): PersonRow => ({ name: "", age: "", sex: "", offered: "", swallowed: "", reason: "" });

const emptyHousehold = (n: number): HouseholdRecord => ({
  household_no: n,
  gps: null,
  cdd_came: "",
  anyone_treated: "",
  offered_count: 0,
  swallowed_count: 0,
  people: [emptyPerson(), emptyPerson()],
  side_effects: "",
  side_effects_detail: "",
  ae_reported: false,
  f1_asked_height: "",
  
  f3_satisfied: "",
  f4_why: "",
  suggestions: "",
});

const TEAL = "#0d9488";

/* ------------------------------------------------------------------ */
/* Draft persistence                                                   */
/* Keeps in-progress households on the device so a reload / crash /     */
/* accidental close never loses previously captured households. The     */
/* draft is cleared only once the survey is successfully submitted.     */
/* ------------------------------------------------------------------ */

const HCS_DRAFT_PREFIX = "hcs_repeat_draft_";

const normDraftKey = (v: any) => String(v ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

function buildHcsDraftKey(
  checklistSubmissionId: string | null | undefined,
  location: HcsLocation | undefined,
): string {
  if (checklistSubmissionId) return `${HCS_DRAFT_PREFIX}${checklistSubmissionId}`;
  const loc = location || {};
  return (
    HCS_DRAFT_PREFIX +
    [loc.state, loc.lga, loc.ward, loc.flhf_name, loc.community_name, loc.settlement_name]
      .map(normDraftKey)
      .join("|")
  );
}

interface HcsDraft {
  completed: HouseholdRecord[];
  current: HouseholdRecord;
  savedAt: string;
}

/** Small pill radio used throughout the form. */
function PillOptions<T extends string>({
  value,
  onChange,
  options,
  color = TEAL,
}: {
  value: T | "";
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  color?: string;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const active = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={`flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-all ${
              active
                ? "text-white shadow-sm"
                : "bg-background text-muted-foreground hover:bg-muted border-border"
            }`}
            style={active ? { background: color, borderColor: color } : undefined}
          >
            <span
              className={`h-3.5 w-3.5 rounded-full border-2 ${active ? "border-white bg-white/30" : "border-muted-foreground/40"}`}
            />
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function Stepper({ value, onChange, color = TEAL }: { value: number; onChange: (v: number) => void; color?: string }) {
  return (
    <div className="inline-flex items-center rounded-lg border border-border overflow-hidden">
      <button
        type="button"
        onClick={() => onChange(Math.max(0, value - 1))}
        className="px-3 py-2 hover:bg-muted transition-colors"
      >
        <Minus className="h-4 w-4" />
      </button>
      <span className="w-12 text-center font-bold" style={{ color }}>
        {value}
      </span>
      <button
        type="button"
        onClick={() => onChange(value + 1)}
        className="px-3 py-2 text-white transition-colors"
        style={{ background: color }}
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
}

function StepBadge({ n, color = TEAL }: { n: number | string; color?: string }) {
  return (
    <span
      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
      style={{ background: color }}
    >
      {n}
    </span>
  );
}

function ProgressRing({ done, total }: { done: number; total: number }) {
  const pct = total > 0 ? Math.min(1, done / total) : 0;
  const r = 34;
  const c = 2 * Math.PI * r;
  return (
    <svg width="92" height="92" viewBox="0 0 92 92" className="shrink-0">
      <circle cx="46" cy="46" r={r} fill="none" stroke="hsl(var(--muted))" strokeWidth="8" />
      <circle
        cx="46"
        cy="46"
        r={r}
        fill="none"
        stroke={TEAL}
        strokeWidth="8"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - pct)}
        transform="rotate(-90 46 46)"
        style={{ transition: "stroke-dashoffset 0.5s ease" }}
      />
      <text x="46" y="42" textAnchor="middle" className="fill-foreground" style={{ fontSize: 22, fontWeight: 700 }}>
        {done}
      </text>
      <text x="46" y="60" textAnchor="middle" className="fill-muted-foreground" style={{ fontSize: 11 }}>
        of {total}
      </text>
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Main component                                                      */
/* ------------------------------------------------------------------ */

export default function RepeatHouseholdCoverageSurvey({
  projectId,
  formId,
  checklistSubmissionId,
  targetHouseholds,
  location,
  initialGps,
  onClose,
}: Props) {
  const { user } = useAuth();
  const geo = useInstantLocation({
    geoCenter:
      initialGps && Number.isFinite(initialGps.lat) && Number.isFinite(initialGps.lng)
        ? { lat: initialGps.lat, lng: initialGps.lng }
        : null,
  });

  const target = Math.max(1, targetHouseholds || 1);
  const draftKey = useMemo(
    () => buildHcsDraftKey(checklistSubmissionId, location),
    [checklistSubmissionId, location],
  );

  // Restore any previously captured (but unsubmitted) households for this
  // community so a reload / crash / accidental close never loses work.
  const restoredDraft = useRef<HcsDraft | null>(null);
  if (restoredDraft.current === null) {
    try {
      const raw = localStorage.getItem(draftKey);
      restoredDraft.current = raw ? (JSON.parse(raw) as HcsDraft) : ({} as HcsDraft);
    } catch {
      restoredDraft.current = {} as HcsDraft;
    }
  }

  const [completed, setCompleted] = useState<HouseholdRecord[]>(
    () => restoredDraft.current?.completed ?? [],
  );
  const [current, setCurrent] = useState<HouseholdRecord>(
    () => restoredDraft.current?.current ?? emptyHousehold(1),
  );
  const [submitting, setSubmitting] = useState(false);
  const [showFinishConfirm, setShowFinishConfirm] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [shortfallReason, setShortfallReason] = useState("");
  const [done, setDone] = useState(false);

  // Persist in-progress households whenever they change (until submitted).
  useEffect(() => {
    if (done) return;
    try {
      const draft: HcsDraft = { completed, current, savedAt: new Date().toISOString() };
      localStorage.setItem(draftKey, JSON.stringify(draft));
    } catch {
      /* ignore quota / serialization errors */
    }
  }, [completed, current, done, draftKey]);

  // Whether the survey holds unsubmitted work worth guarding on exit.
  const hasUnsavedProgress = useMemo(() => {
    if (done) return false;
    if (completed.length > 0) return true;
    const c = current;
    return Boolean(
      c.gps ||
        c.cdd_came ||
        c.anyone_treated ||
        c.offered_count ||
        c.swallowed_count ||
        c.side_effects ||
        c.side_effects_detail ||
        c.ae_reported ||
        c.f1_asked_height ||
        c.f3_satisfied ||
        c.f4_why?.trim() ||
        c.suggestions?.trim() ||
        c.people.some((p) => p.name || p.age || p.sex || p.offered || p.swallowed || p.reason),
    );
  }, [completed, current, done]);

  // Native guard: warn before the browser/tab is closed or reloaded mid-survey.
  useEffect(() => {
    if (!hasUnsavedProgress) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
      return "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasUnsavedProgress]);

  // In-app guard: confirm before leaving the form when there is unsaved work.
  const requestClose = () => {
    if (hasUnsavedProgress) {
      setShowExitConfirm(true);
    } else {
      onClose();
    }
  };


  const reachedTarget = completed.length >= target;


  const update = (patch: Partial<HouseholdRecord>) => setCurrent((c) => ({ ...c, ...patch }));

  const updatePerson = (idx: number, patch: Partial<PersonRow>) =>
    setCurrent((c) => ({
      ...c,
      people: c.people.map((p, i) => (i === idx ? { ...p, ...patch } : p)),
    }));

  const captureGps = () => {
    void geo.refresh();
  };

  // Commit incoming geo fix onto the current household when captured.
  const gpsLabel = useMemo(() => {
    const g = current.gps;
    if (g) return `${g.lat.toFixed(6)}, ${g.lng.toFixed(6)} · ±${Math.round(g.accuracy)}m`;
    return null;
  }, [current.gps]);

  // Each household MUST capture its own unique geopoint. We track the last
  // consumed GPS timestamp so a fresh fix (from tapping "Capture Geopoint" on
  // the new household) is always adopted, while a stale fix carried over from a
  // previous household is never silently re-used.
  const lastGpsTsRef = useRef<number | null>(null);
  useEffect(() => {
    const pos = geo.coord;
    if (!pos) return;
    if (pos.timestamp === lastGpsTsRef.current) return;
    lastGpsTsRef.current = pos.timestamp;
    setCurrent((c) => ({ ...c, gps: { lat: pos.lat, lng: pos.lng, accuracy: pos.accuracy } }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geo.coord]);

  const householdValid = current.cdd_came !== "";
  const hasGps = !!current.gps;

  const saveCurrentHousehold = (): HouseholdRecord[] => {
    const snapshot = [...completed, current];
    setCompleted(snapshot);
    return snapshot;
  };

  const handleSaveAndNext = () => {
    if (!householdValid) {
      toast({ title: "Answer the first question", description: "Please record whether a drug distributor visited this household.", variant: "destructive" });
      return;
    }
    if (!hasGps) {
      toast({ title: "Capture the household GPS", description: "Each household must have its own geopoint. Tap “Capture Geopoint” before saving.", variant: "destructive" });
      return;
    }
    const snapshot = saveCurrentHousehold();
    if (snapshot.length >= target) {
      // Target reached — go straight to submit.
      void finalize(snapshot, "");
      return;
    }
    setCurrent(emptyHousehold(snapshot.length + 1));
    toast({ title: `Household ${snapshot.length} saved`, description: `${snapshot.length} of ${target} completed. Capture a new geopoint for household ${snapshot.length + 1}.` });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleFinishEarly = () => {
    // Include the current household if it has an answer.
    setShowFinishConfirm(true);
  };

  const finalize = async (records: HouseholdRecord[], reason: string) => {
    if (!user) {
      toast({ title: "Sign in required", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const gps = records.find((r) => r.gps)?.gps ?? initialGps ?? null;
      const submissionId =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      // Offline-first: insert immediately when online, otherwise persist in the
      // IndexedDB queue and auto-sync to the server (and dashboard) on reconnect.
      // The client-generated id + upsert-on-id keeps replays idempotent so a
      // lost network ack never creates a duplicate survey.
      const { queued } = await queueOrInsert(
        "household_coverage_surveys",
        {
          id: submissionId,
          checklist_submission_id: checklistSubmissionId ?? null,
          form_id: formId ?? null,
          project_id: projectId ?? null,
          user_id: user.id,
          state: location?.state ?? null,
          lga: location?.lga ?? null,
          ward: location?.ward ?? null,
          flhf_name: location?.flhf_name ?? null,
          community_name: location?.community_name ?? null,
          settlement_name: location?.settlement_name ?? null,
          target_households: target,
          completed_households: records.length,
          shortfall_reason: reason.trim() || null,
          households: records,
          gps,
          metadata: { source: "mda_checklist", submitted_at: new Date().toISOString() },
        },
        true,
      );
      setDone(true);
      // Survey submitted (online or offline) — clear the on-device draft so it
      // never prompts to resume previously captured households again.
      try { localStorage.removeItem(draftKey); } catch { /* ignore */ }

      toast({
        title: queued ? "Saved offline" : "Coverage survey submitted",
        description: queued
          ? `${records.length} household${records.length === 1 ? "" : "s"} saved on this device. It will sync automatically when you're back online.`
          : `${records.length} household${records.length === 1 ? "" : "s"} recorded.`,
      });
    } catch (e: any) {
      toast({ title: "Submission failed", description: e.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
      setShowFinishConfirm(false);
    }
  };

  /* ---- Success screen ---- */
  if (done) {
    return (
      <div className="min-h-full bg-gradient-to-b from-teal-50 to-background flex items-center justify-center p-6">
        <div className="max-w-md w-full text-center space-y-4 rounded-2xl border bg-card p-8 shadow-lg">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-teal-100">
            <CheckCircle2 className="h-9 w-9 text-teal-600" />
          </div>
          <h2 className="font-display text-2xl font-bold">Coverage Survey Complete</h2>
          <p className="text-muted-foreground">
            {completed.length} of {target} households recorded for{" "}
            <strong>{location?.community_name || location?.ward || "this community"}</strong>.
          </p>
          <Button onClick={onClose} className="w-full" style={{ background: TEAL }}>
            Done
          </Button>
        </div>
      </div>
    );
  }

  const hhNo = completed.length + 1;

  return (
    <div className="min-h-full bg-muted/20">
      {/* Header */}
      <div className="sticky top-0 z-20 text-white shadow-md" style={{ background: `linear-gradient(100deg, #0f766e, #0d9488)` }}>
        <div className="mx-auto max-w-4xl px-4 py-3.5 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/15">
            <Home className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-lg sm:text-xl font-bold leading-tight truncate">Repeat Household Coverage Survey</h1>
            <p className="text-xs text-white/80 truncate">MDA Coverage &amp; Quality Assessment</p>
          </div>
          <div className="hidden sm:flex items-center gap-1.5 text-xs bg-white/15 rounded-full px-3 py-1.5">
            {navigator.onLine ? <Wifi className="h-3.5 w-3.5" /> : <Cloud className="h-3.5 w-3.5" />}
            {navigator.onLine ? "Online" : "Offline"}
          </div>
          <button
            type="button"
            onClick={requestClose}
            aria-label="Close survey"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/15 transition-colors hover:bg-white/25"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div className="mx-auto max-w-4xl p-4 space-y-4 pb-44 sm:pb-32">
        {/* Location + progress banner */}
        <div className="rounded-xl border bg-card p-4 flex flex-col sm:flex-row sm:items-center gap-4">
          <ProgressRing done={completed.length} total={target} />
          <div className="flex-1 space-y-1">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <MapPin className="h-4 w-4 text-teal-600" />
              {[location?.community_name, location?.ward, location?.lga, location?.state].filter(Boolean).join(" • ") || "Location from checklist"}
            </div>
            <p className="text-xs text-muted-foreground">
              Interview <strong>{target}</strong> households in this community. Locked from the supervisory checklist.
            </p>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {completed.map((h) => (
                <span key={h.household_no} className="flex h-6 w-6 items-center justify-center rounded-full bg-teal-100 text-teal-700 text-xs font-bold">
                  {h.household_no}
                </span>
              ))}
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-teal-600 text-white text-xs font-bold ring-2 ring-teal-200">
                {hhNo}
              </span>
              {Array.from({ length: Math.max(0, target - hhNo) }).map((_, i) => (
                <span key={i} className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-muted-foreground text-xs">
                  {hhNo + i + 1}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Household number + GPS */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="rounded-xl border bg-card p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
              <Home className="h-4 w-4 text-teal-600" /> Household No.
            </div>
            <div className="mt-1 flex items-center gap-2">
              <span className="text-3xl font-extrabold text-teal-600">{hhNo}</span>
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">Auto-generated</span>
            </div>
          </div>
          <div className={`rounded-xl border bg-card p-4 transition-colors ${hasGps ? "border-teal-300" : "border-amber-300"}`}>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                <MapPin className="h-4 w-4 text-teal-600" /> GPS of Household <span className="text-destructive">*</span>
              </div>
              <LocationStatusBadge
                source={geo.source}
                label={geo.statusLabel}
                accuracy={geo.accuracy}
                isRefreshing={geo.isRefreshing}
                onRefresh={() => void geo.refresh()}
              />
            </div>
            <div className="mt-2 flex items-center gap-3">
              <Button type="button" size="sm" onClick={captureGps} disabled={geo.isRefreshing} style={{ background: TEAL }} className="text-white">
                {geo.isRefreshing ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Crosshair className="h-4 w-4 mr-1.5" />}
                {hasGps ? "Re-capture" : "Capture Geopoint"}
              </Button>
              {hasGps ? (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-teal-700">
                  <CheckCircle2 className="h-4 w-4" /> {gpsLabel}
                </span>
              ) : (
                <span className="text-xs text-amber-600">{geo.isRefreshing ? "Acquiring fix…" : "Required — capture a unique point at this house"}</span>
              )}
            </div>
          </div>
        </div>


        {/* Q1 */}
        <Section>
          <QRow n={1} text="During the last MDA in this community, did any drug distributor/CDD come to this house?">
            <PillOptions
              value={current.cdd_came}
              onChange={(v) => update({ cdd_came: v })}
              options={[
                { value: "yes", label: "Yes" },
                { value: "no", label: "No" },
                { value: "dont_know", label: "Don't know" },
              ]}
            />
          </QRow>

          <QRow n={2} text="Was anyone in your household treated?">
            <PillOptions
              value={current.anyone_treated}
              onChange={(v) => update({ anyone_treated: v })}
              options={[
                { value: "yes", label: "Yes" },
                { value: "no", label: "No" },
              ]}
            />
          </QRow>

          <QRow n={3} text="How many people were offered vs actually swallowed the drugs?">
            <div className="flex flex-wrap gap-6">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Offered drugs</p>
                <Stepper value={current.offered_count} onChange={(v) => update({ offered_count: v })} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Actually swallowed</p>
                <Stepper value={current.swallowed_count} onChange={(v) => update({ swallowed_count: v })} />
              </div>
            </div>
          </QRow>

          {/* Q4 roster */}
          <QRow n={4} text="For each person in the household, please tell me:">
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm min-w-[620px]">
                <thead>
                  <tr className="text-white text-xs" style={{ background: TEAL }}>
                    <th className="px-2 py-2 w-8">#</th>
                    <th className="px-2 py-2 text-left">Name</th>
                    <th className="px-2 py-2">Age</th>
                    <th className="px-2 py-2">Sex</th>
                    <th className="px-2 py-2">Offered?</th>
                    <th className="px-2 py-2">Swallowed?</th>
                    <th className="px-2 py-2 text-left">Reason if not</th>
                    <th className="px-2 py-2 w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {current.people.map((p, i) => (
                    <tr key={i} className="border-t">
                      <td className="px-2 py-1.5 text-center text-muted-foreground">{i + 1}</td>
                      <td className="px-2 py-1.5">
                        <Input value={p.name} onChange={(e) => updatePerson(i, { name: e.target.value })} placeholder="Enter name" className="h-8" />
                      </td>
                      <td className="px-2 py-1.5 w-16">
                        <Input value={p.age} onChange={(e) => updatePerson(i, { age: e.target.value })} placeholder="Age" className="h-8" inputMode="numeric" />
                      </td>
                      <td className="px-2 py-1.5">
                        <div className="flex gap-1 justify-center">
                          {(["M", "F"] as const).map((s) => (
                            <button
                              key={s}
                              type="button"
                              onClick={() => updatePerson(i, { sex: s })}
                              className={`h-8 w-8 rounded-md border text-xs font-bold ${p.sex === s ? "text-white" : "text-teal-600 border-teal-200"}`}
                              style={p.sex === s ? { background: TEAL, borderColor: TEAL } : undefined}
                            >
                              {s}
                            </button>
                          ))}
                        </div>
                      </td>
                      <td className="px-2 py-1.5 w-24">
                        <YesNoSelect value={p.offered} onChange={(v) => updatePerson(i, { offered: v })} />
                      </td>
                      <td className="px-2 py-1.5 w-24">
                        <YesNoSelect value={p.swallowed} onChange={(v) => updatePerson(i, { swallowed: v })} />
                      </td>
                      <td className="px-2 py-1.5">
                        <Input value={p.reason} onChange={(e) => updatePerson(i, { reason: e.target.value })} placeholder="Optional" className="h-8" />
                      </td>
                      <td className="px-2 py-1.5">
                        {current.people.length > 1 && (
                          <button type="button" onClick={() => update({ people: current.people.filter((_, idx) => idx !== i) })} className="text-muted-foreground hover:text-destructive">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Button type="button" variant="outline" size="sm" className="mt-2 text-teal-600 border-teal-200" onClick={() => update({ people: [...current.people, emptyPerson()] })}>
              <Plus className="h-4 w-4 mr-1.5" /> Add another person
            </Button>
          </QRow>

          {/* Q5 adverse events */}
          <QRow n={5} text="Did anyone in the household experience side effects after taking the drugs?">
            <PillOptions
              value={current.side_effects}
              onChange={(v) => update({ side_effects: v })}
              options={[
                { value: "yes", label: "Yes" },
                { value: "no", label: "No" },
                { value: "dont_know", label: "Don't know" },
              ]}
            />
            {current.side_effects === "yes" && (
              <div className="mt-3 space-y-2">
                <Label className="text-xs">If Yes, what happened and what was done?</Label>
                <Textarea
                  value={current.side_effects_detail}
                  onChange={(e) => update({ side_effects_detail: e.target.value })}
                  placeholder="Describe what happened and what was done…"
                  rows={2}
                />
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={current.ae_reported} onCheckedChange={(v) => update({ ae_reported: !!v })} />
                  Check if AE was reported to health facility
                </label>
              </div>
            )}
          </QRow>
        </Section>

        {/* Section F — Adherence & Quality (purple) */}
        <div className="rounded-xl border overflow-hidden">
          <div className="px-4 py-2.5 text-white text-sm font-bold" style={{ background: "#7c3aed" }}>
            SECTION F: ADHERENCE &amp; QUALITY
          </div>
          <div className="p-4 space-y-4 bg-purple-50/40">
            <FRow code="F1" text="Were you asked your height before receiving the medicine?">
              <PillOptions
                color="#7c3aed"
                value={current.f1_asked_height}
                onChange={(v) => update({ f1_asked_height: v })}
                options={[
                  { value: "yes", label: "Yes" },
                  { value: "no", label: "No" },
                  { value: "na", label: "Not applicable" },
                ]}
              />
            </FRow>
            <FRow code="F2" text="Are you satisfied with how the drug distribution was done in your community?">
              <PillOptions
                color="#7c3aed"
                value={current.f3_satisfied}
                onChange={(v) => update({ f3_satisfied: v })}
                options={[
                  { value: "very", label: "Very satisfied" },
                  { value: "satisfied", label: "Satisfied" },
                  { value: "not", label: "Not satisfied" },
                  { value: "no_opinion", label: "No opinion" },
                ]}
              />
            </FRow>
            <FRow code="F3" text="Why?">
              <Input value={current.f4_why} onChange={(e) => update({ f4_why: e.target.value })} placeholder="Enter your response…" />
            </FRow>

          </div>
        </div>

        {/* Section G — Suggestions (orange) */}
        <div className="rounded-xl border overflow-hidden">
          <div className="px-4 py-2.5 text-white text-sm font-bold flex items-center gap-2" style={{ background: "#ea580c" }}>
            <Lightbulb className="h-4 w-4" /> SECTION G: SUGGESTIONS
          </div>
          <div className="p-4 bg-orange-50/40">
            <FRow code="G1" color="#ea580c" text="What can be done to improve drug distribution in the next MDA?">
              <Textarea value={current.suggestions} onChange={(e) => update({ suggestions: e.target.value })} placeholder="Enter your suggestions…" rows={2} />
            </FRow>
          </div>
        </div>
      </div>

      {/* Sticky footer — always fully visible, including on small iPhones.
          Buttons share the row and shrink to fit; the counter moves above them
          on narrow screens, and iOS safe-area inset keeps them above the home bar. */}
      <div
        className="fixed bottom-0 inset-x-0 z-30 border-t bg-background/95 backdrop-blur"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="mx-auto max-w-4xl px-3 py-2.5 sm:px-4 sm:py-3">
          {/* Counter shown above the buttons on small screens to free horizontal room */}
          <div className="mb-2 text-center text-[11px] font-medium text-muted-foreground sm:hidden">
            Household {hhNo} of {target}
          </div>
          <div className="flex items-stretch gap-2 sm:gap-3">
            <Button
              variant="outline"
              onClick={handleFinishEarly}
              disabled={submitting}
              className="flex-1 min-w-0 gap-1.5 px-2 text-xs sm:flex-none sm:px-4 sm:text-sm"
            >
              <ArrowLeft className="h-4 w-4 shrink-0" />
              <span className="truncate">Finish &amp; submit</span>
            </Button>
            <div className="hidden flex-1 text-center text-xs text-muted-foreground sm:block sm:self-center">
              Household {hhNo} of {target}
            </div>
            <Button
              onClick={handleSaveAndNext}
              disabled={submitting}
              style={{ background: TEAL }}
              className="flex-1 min-w-0 gap-1.5 px-2 text-xs text-white sm:flex-none sm:px-4 sm:text-sm"
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
              ) : completed.length + 1 >= target ? (
                <>
                  <Send className="h-4 w-4 shrink-0" />
                  <span className="truncate">Save &amp; submit</span>
                </>
              ) : (
                <>
                  <span className="truncate">Save &amp; next household</span>
                  <ArrowRight className="h-4 w-4 shrink-0" />
                </>
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Finish-early confirmation (requires shortfall reason if under target) */}
      <AlertDialog open={showFinishConfirm} onOpenChange={setShowFinishConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <ClipboardCheck className="h-5 w-5 text-teal-600" />
              Finish coverage survey?
            </AlertDialogTitle>
            <AlertDialogDescription>
              You have completed <strong>{completed.length}</strong> of the target <strong>{target}</strong> households.
              {completed.length < target
                ? " Since you did not reach the target, please provide a reason before submitting."
                : " You have met the sampling target."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {completed.length < target && (
            <div className="space-y-2">
              <Label htmlFor="shortfall" className="text-sm">
                Reason for not reaching {target} households <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="shortfall"
                value={shortfallReason}
                onChange={(e) => setShortfallReason(e.target.value)}
                placeholder="e.g. Households were locked / occupants unavailable / insecurity / rain…"
                rows={3}
                autoFocus
              />
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>Keep going</AlertDialogCancel>
            <AlertDialogAction
              disabled={submitting || (completed.length < target && !shortfallReason.trim())}
              onClick={() => finalize(completed, shortfallReason)}
              style={{ background: TEAL }}
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Submit survey"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Leave-guard: confirm before exiting with unsaved households */}
      <AlertDialog open={showExitConfirm} onOpenChange={setShowExitConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Leave without submitting?
            </AlertDialogTitle>
            <AlertDialogDescription>
              You have unsubmitted survey data{completed.length > 0 ? ` (${completed.length} household${completed.length === 1 ? "" : "s"} captured)` : ""}. Your progress is
              saved on this device as a draft and will be restored when you return, but it has not been
              submitted yet.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Stay on form</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setShowExitConfirm(false);
                onClose();
              }}
            >
              Leave &amp; keep draft
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Small presentational helpers                                        */
/* ------------------------------------------------------------------ */

function Section({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border bg-card p-4 sm:p-5 space-y-5">{children}</div>;
}

function QRow({ n, text, children }: { n: number; text: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <StepBadge n={n} />
      <div className="flex-1 space-y-2.5">
        <p className="text-sm font-medium leading-snug">{text}</p>
        {children}
      </div>
    </div>
  );
}

function FRow({ code, text, children, color = "#7c3aed" }: { code: string; text: string; children: React.ReactNode; color?: string }) {
  return (
    <div className="flex gap-3">
      <span className="flex h-6 min-w-[1.75rem] px-1 items-center justify-center rounded-md text-xs font-bold text-white" style={{ background: color }}>
        {code}
      </span>
      <div className="flex-1 space-y-2">
        <p className="text-sm font-medium leading-snug">{text}</p>
        {children}
      </div>
    </div>
  );
}

function YesNoSelect({ value, onChange }: { value: "Y" | "N" | ""; onChange: (v: "Y" | "N") => void }) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as "Y" | "N")}>
      <SelectTrigger className="h-8">
        <SelectValue placeholder="Select" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="Y">Yes</SelectItem>
        <SelectItem value="N">No</SelectItem>
      </SelectContent>
    </Select>
  );
}

/**
 * AfterHoursDecisionOverlay — centered, celebratory decision experience.
 *
 * Mounted globally for every signed-in user. The moment one of the user's own
 * after-hours submission requests is approved (or rejected) by a reviewer, a
 * polished modal card appears at the center of their screen so the outcome is
 * never missed — mirroring the OwnerMessageOverlay treatment.
 *
 * It listens to realtime UPDATEs on after_hours_submission_requests scoped to
 * the current user, and also reconciles any decisions that landed while the
 * user was offline by checking for recently-reviewed rows on mount.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, XCircle, PartyPopper, FileText, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { openAfterHoursStatus } from "@/lib/afterHours/events";

interface Decision {
  id: string;
  status: "approved" | "rejected";
  formLabel: string;
  reviewNote: string | null;
  reviewedAt: string | null;
}

const SEEN_KEY = "afterhours:seen-decisions";

function loadSeen(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || "[]"));
  } catch {
    return new Set();
  }
}

function markSeen(id: string) {
  try {
    const seen = loadSeen();
    seen.add(id);
    localStorage.setItem(SEEN_KEY, JSON.stringify(Array.from(seen).slice(-200)));
  } catch {
    /* no-op */
  }
}

export default function AfterHoursDecisionOverlay() {
  const { user } = useAuth();
  const [decision, setDecision] = useState<Decision | null>(null);
  const seenRef = useRef<Set<string>>(loadSeen());

  const present = useCallback((row: any) => {
    if (!row || (row.status !== "approved" && row.status !== "rejected")) return;
    if (seenRef.current.has(row.id)) return;
    seenRef.current.add(row.id);
    markSeen(row.id);
    setDecision({
      id: row.id,
      status: row.status,
      formLabel: row.form_label || row.target_table || "your submission",
      reviewNote: row.review_note ?? null,
      reviewedAt: row.reviewed_at ?? null,
    });
  }, []);

  // Reconcile decisions that happened while offline (last 24h, unseen).
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
      const { data } = await (supabase as any)
        .from("after_hours_submission_requests")
        .select("id, status, form_label, target_table, review_note, reviewed_at")
        .eq("requested_by", user.id)
        .in("status", ["approved", "rejected"])
        .gte("reviewed_at", since)
        .order("reviewed_at", { ascending: false })
        .limit(5);
      if (cancelled) return;
      const next = (data ?? []).find((r: any) => !seenRef.current.has(r.id));
      if (next) present(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [user, present]);

  // Live updates.
  useEffect(() => {
    if (!user) return;
    const ch = supabase.channel(
      `ah-decision-${user.id}-${Math.random().toString(36).slice(2, 8)}`,
    );
    ch.on(
      "postgres_changes" as any,
      {
        event: "UPDATE",
        schema: "public",
        table: "after_hours_submission_requests",
        filter: `requested_by=eq.${user.id}`,
      },
      (payload: any) => present(payload.new),
    ).subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [user, present]);

  if (!decision) return null;

  const approved = decision.status === "approved";

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in">
      <div className="w-full max-w-md overflow-hidden rounded-2xl border-0 bg-card shadow-2xl animate-in zoom-in-95">
        <div
          className={
            approved
              ? "relative bg-gradient-to-br from-emerald-600 via-emerald-700 to-teal-800 px-6 py-7 text-white"
              : "relative bg-gradient-to-br from-rose-700 via-red-800 to-slate-900 px-6 py-7 text-white"
          }
        >
          <button
            onClick={() => setDecision(null)}
            className="absolute right-4 top-4 rounded-full p-1 text-white/70 transition hover:bg-white/10 hover:text-white"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="flex flex-col items-center text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/15 ring-2 ring-white/25">
              {approved ? (
                <PartyPopper className="h-8 w-8" />
              ) : (
                <XCircle className="h-8 w-8" />
              )}
            </div>
            <h2 className="mt-3 text-xl font-bold">
              {approved ? "Request approved! 🎉" : "Request not approved"}
            </h2>
            <p className="mt-1 text-sm text-white/85">
              {approved
                ? "Your after-hours submission has been approved and saved."
                : "Your after-hours submission was reviewed and could not be approved."}
            </p>
          </div>
        </div>

        <div className="space-y-3 p-5">
          <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2 text-sm font-medium text-foreground">
            <FileText className="h-4 w-4 text-indigo-500" />
            {decision.formLabel}
          </div>

          {!approved && decision.reviewNote && (
            <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950/30 dark:text-red-300">
              <span className="text-xs font-medium uppercase tracking-wide">Reviewer note</span>
              <p className="mt-0.5 leading-relaxed">{decision.reviewNote}</p>
            </div>
          )}

          {approved && (
            <div className="flex items-start gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              <span>Your data is now recorded and reflected on the dashboard. A confirmation email has also been sent to you.</span>
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => {
                setDecision(null);
                openAfterHoursStatus();
              }}
            >
              View my requests
            </Button>
            <Button className="flex-1" onClick={() => setDecision(null)}>
              Done
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

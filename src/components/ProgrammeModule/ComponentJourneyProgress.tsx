import { useEffect, useMemo, useState } from "react";
import {
  Award, CheckCircle2, HeartHandshake, IdCard, Route, Search, Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { cachedRead } from "@/lib/programmeModule/offlineReadCache";
import { componentJourneys, type ComponentJourneyStep } from "@/lib/programmeModule/componentJourney";
import type {
  BeneficiaryReferralRow,
  BeneficiaryRow,
  BeneficiaryServiceRow,
  ProgrammeComponent,
} from "@/lib/programmeModule/types";
import type { PotentialCaseRow } from "@/lib/programmeModule/cddCaseSearch";
import { resolveIcon } from "./icons";

const db = supabase as unknown as { from: (table: string) => any };

type LinkedCase = Pick<PotentialCaseRow, "search_date" | "created_at" | "status" | "confirmed_at" | "accepted_at">;

interface Props {
  beneficiary: BeneficiaryRow;
  components: ProgrammeComponent[];
  services: BeneficiaryServiceRow[];
  referrals: BeneficiaryReferralRow[];
}

const STEP_ICON = {
  case_search: Search,
  registration: IdCard,
  care: HeartHandshake,
  completion: CheckCircle2,
  outcome: Award,
} as const;

const fmtDate = (value?: string | null) =>
  value ? new Date(value).toLocaleDateString(undefined, { day: "2-digit", month: "short" }) : "";

const StepNode = ({ step, color }: { step: ComponentJourneyStep; color: string }) => {
  const Icon = STEP_ICON[step.key];
  return (
    <li className="relative z-10 flex min-w-0 flex-col items-center gap-1 text-center">
      <span
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-full border-2 bg-card shadow-sm transition-all duration-500 motion-reduce:transition-none",
          step.state === "done" && "text-primary-foreground",
          step.state === "current" && "scale-110 border-health-amber bg-health-amber/15 text-health-amber shadow-glow",
          step.state === "waiting" && "border-border text-muted-foreground/60",
        )}
        style={step.state === "done" ? { background: `hsl(${color})`, borderColor: `hsl(${color})` } : undefined}
      >
        <Icon className="h-3.5 w-3.5" />
      </span>
      <span className={cn(
        "max-w-16 text-[9px] font-semibold leading-tight",
        step.state === "waiting" ? "text-muted-foreground/70" : "text-foreground",
      )}>
        {step.label}
      </span>
      <span className="text-[9px] tabular-nums text-muted-foreground">{fmtDate(step.at) || "—"}</span>
    </li>
  );
};

/** Animated journey from identification to outcome for active components only. */
export default function ComponentJourneyProgress({ beneficiary, components, services, referrals }: Props) {
  const [linkedCase, setLinkedCase] = useState<LinkedCase | null | undefined>(undefined);

  useEffect(() => {
    let live = true;
    setLinkedCase(undefined);
    void cachedRead<LinkedCase | null>(`case-search-linked:${beneficiary.id}`, async () => {
      const { data, error } = await db.from("mmdp_potential_cases")
        .select("search_date,created_at,status,confirmed_at,accepted_at")
        .eq("beneficiary_id", beneficiary.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) return { data: null, error: null };
      return { data, error: null };
    }).then(({ data }) => {
      if (live) setLinkedCase(data ?? null);
    }).catch(() => {
      if (live) setLinkedCase(null);
    });
    return () => { live = false; };
  }, [beneficiary.id]);

  const journeys = useMemo(
    () => componentJourneys(beneficiary, components, services, referrals, linkedCase || null),
    [beneficiary, components, services, referrals, linkedCase],
  );

  if (linkedCase === undefined) {
    return <div className="border-t border-border p-4 text-xs text-muted-foreground">Reading care journey…</div>;
  }

  return (
    <section className="min-w-0 border-t border-border py-4" aria-labelledby="component-journey-title">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Route className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 id="component-journey-title" className="text-sm font-semibold text-foreground">Care journey by component</h3>
        </div>
        {journeys.length > 0 && <Badge variant="outline">{journeys.length}</Badge>}
      </div>

      {journeys.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-muted/30 p-4 text-center">
          <Sparkles className="mx-auto mb-2 h-5 w-5 text-primary" />
          <p className="text-sm font-medium text-foreground">No active component yet</p>
          <p className="mt-1 text-xs text-muted-foreground">
            A component appears here as soon as this beneficiary has a linked case, referral, service or Graduation pathway.
          </p>
        </div>
      ) : (
        <div className="max-h-[430px] space-y-3 overflow-y-auto pr-1">
          {journeys.map((journey, index) => {
            const Icon = resolveIcon(journey.component.icon);
            return (
              <article
                key={journey.component.key}
                className="animate-fade-in overflow-hidden rounded-lg border border-border bg-background/70 shadow-sm motion-reduce:animate-none"
                style={{ animationDelay: `${index * 90}ms`, animationFillMode: "both" }}
              >
                <div
                  className="h-1 transition-all duration-700 motion-reduce:transition-none"
                  style={{ background: `linear-gradient(90deg, hsl(${journey.component.color}), hsl(${journey.component.color} / 0.35))`, width: `${journey.percent}%` }}
                />
                <div className="p-3">
                  <div className="mb-3 flex items-start gap-2.5">
                    <span
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-primary-foreground shadow-sm"
                      style={{ background: `hsl(${journey.component.color})` }}
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="text-sm font-semibold text-foreground">{journey.component.label}</h4>
                        <Badge variant="outline" className="tabular-nums">{journey.percent}%</Badge>
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {journey.completedSteps}/5 steps · <span className="font-medium text-foreground">{journey.currentStep}</span>
                      </p>
                    </div>
                  </div>

                  <div className="relative">
                    <div className="absolute left-5 right-5 top-4 h-0.5 rounded-full bg-muted" />
                    <div
                      className="absolute left-5 top-4 h-0.5 rounded-full transition-all duration-700 motion-reduce:transition-none"
                      style={{ width: `calc((100% - 2.5rem) * ${journey.percent / 100})`, background: `hsl(${journey.component.color})` }}
                    />
                    <ol className="relative grid grid-cols-5 gap-1">
                      {journey.steps.map((step) => <StepNode key={step.key} step={step} color={journey.component.color} />)}
                    </ol>
                  </div>

                  <div className="mt-3 rounded-lg bg-muted/40 px-2.5 py-2">
                    <p className="line-clamp-2 text-xs text-muted-foreground">
                      <span className="font-semibold text-foreground">
                        {journey.latestOutcome ? "Latest outcome: " : "Current focus: "}
                      </span>
                      {journey.latestOutcome || journey.steps.find((s) => s.state === "current")?.detail}
                    </p>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

// The five-disease treatment passport grid, shared by the household roster and
// the person's own Longitudinal record so both tell exactly the same story.

import { Badge } from "@/components/ui/badge";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { diseaseLabel, type MdaRoundRow, type MdaTreatmentRow } from "@/lib/programmeModule/households";
import {
  PASSPORT_MARK, PASSPORT_STATE_LABEL, PASSPORT_TONE, buildPassport, diseaseEligibility,
} from "@/lib/programmeModule/householdMembers";

interface Props {
  treatments: MdaTreatmentRow[];
  rounds: MdaRoundRow[];
  person?: {
    age: number | null;
    heightCm: number | null;
    isPregnant: boolean;
    isBreastfeeding: boolean;
  };
  /** Hides the eligibility column when the person's details are unknown. */
  showEligibility?: boolean;
}

const PassportMatrix = ({ treatments, rounds, person, showEligibility = true }: Props) => {
  const passport = buildPassport(treatments, rounds);

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] border-separate border-spacing-1 text-sm">
          <thead>
            <tr>
              <th className="text-left text-xs font-medium uppercase text-muted-foreground">Disease</th>
              {passport.years.map((y) => (
                <th key={y} className="w-12 text-xs font-medium text-muted-foreground">{y}</th>
              ))}
              {showEligibility && (
                <th className="text-left text-xs font-medium uppercase text-muted-foreground">
                  Eligibility today
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {passport.diseases.map((d) => {
              const verdict = person ? diseaseEligibility(d.value, person) : null;
              const miss = passport.persistentMisses.find((m) => m.disease === d.value);
              return (
                <tr key={d.value}>
                  <td className="pr-2">
                    <span className="font-medium text-foreground">{d.label}</span>
                    {miss && (
                      <span className="ml-2 inline-flex items-center gap-1 text-xs text-destructive">
                        <AlertTriangle className="h-3 w-3" /> missed {miss.streak} in a row
                      </span>
                    )}
                  </td>
                  {passport.years.map((y) => {
                    const c = passport.cell(d.value, y);
                    return (
                      <td key={y} className="text-center">
                        <span
                          title={`${d.label} ${y}: ${PASSPORT_STATE_LABEL[c.state]}`}
                          className={cn(
                            "inline-flex h-8 w-10 items-center justify-center rounded-md border text-xs font-semibold",
                            PASSPORT_TONE[c.state],
                          )}
                        >
                          {PASSPORT_MARK[c.state]}
                        </span>
                      </td>
                    );
                  })}
                  {showEligibility && (
                    <td className="pl-2 text-xs">
                      {verdict
                        ? verdict.eligible
                          ? <span className="text-emerald-700 dark:text-emerald-300">
                              Eligible{verdict.reason ? ` — ${verdict.reason}` : ""}
                            </span>
                          : <span className="text-muted-foreground">{verdict.reason}</span>
                        : <span className="text-muted-foreground">—</span>}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        ✓ treated · A absent · R refused · — not eligible · · no round recorded.
        Eligibility is guidance for the distributor, not a clinical decision.
      </p>
      {passport.neverTreated.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-2 text-sm">
          <AlertTriangle className="h-4 w-4 text-destructive" />
          Never treated for {passport.neverTreated.map(diseaseLabel).join(", ")} despite rounds in this household.
        </div>
      )}
      <Badge variant="outline">{passport.doses} doses swallowed</Badge>
    </div>
  );
};

export default PassportMatrix;

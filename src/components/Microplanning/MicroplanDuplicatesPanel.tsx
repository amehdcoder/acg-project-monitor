import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CopyCheck, Copy, AlertTriangle, ChevronDown, ChevronRight, Trash2, ShieldCheck } from "lucide-react";
import type { DuplicateAnalysis, DuplicateCandidate } from "@/lib/microplanning/duplicates";

interface Props {
  analysis: DuplicateAnalysis<DuplicateCandidate & Record<string, unknown>>;
  readOnly?: boolean;
  onRemoveAll: (ids: string[]) => void;
  showOnlyDuplicates: boolean;
  onToggleFilter: (v: boolean) => void;
}

const fmt = (n: number) => n.toLocaleString();

/**
 * Duplicate intelligence banner for the Planning tab.
 * Auto-removable duplicates (identical estimated population) get a one-click
 * cleanup button; population conflicts are held back for a manual decision.
 */
const MicroplanDuplicatesPanel = ({ analysis, readOnly, onRemoveAll, showOnlyDuplicates, onToggleFilter }: Props) => {
  const [open, setOpen] = useState(false);
  const { groups, safeGroups, conflictGroups, removableIds, duplicateRecordCount } = analysis;

  const conflictRecords = useMemo(
    () => conflictGroups.reduce((s, g) => s + g.records.length, 0),
    [conflictGroups],
  );

  if (groups.length === 0) return null;

  return (
    <Card className="border-amber-300/70 bg-gradient-to-r from-amber-50/80 to-orange-50/60 dark:from-amber-950/30 dark:to-orange-950/20">
      <CardContent className="p-3 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-400">
            <Copy className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-foreground">
              {groups.length} duplicate group{groups.length === 1 ? "" : "s"} detected · {duplicateRecordCount} records
            </p>
            <p className="text-[11px] text-muted-foreground">
              Matched on State → LGA → Ward → FLHF → Community / Settlement.
              {conflictGroups.length > 0 && ` ${conflictRecords} record(s) have different estimated populations and are kept for your decision.`}
            </p>
          </div>

          <Button
            variant={showOnlyDuplicates ? "secondary" : "outline"}
            size="sm"
            className="h-7 text-[11px] gap-1"
            onClick={() => onToggleFilter(!showOnlyDuplicates)}
          >
            <CopyCheck className="h-3 w-3" />
            {showOnlyDuplicates ? "Showing duplicates" : "Show duplicates only"}
          </Button>

          {!readOnly && (
            <Button
              size="sm"
              disabled={removableIds.length === 0}
              onClick={() => onRemoveAll(removableIds)}
              className="h-7 text-[11px] gap-1 bg-gradient-to-r from-amber-600 to-orange-600 text-white hover:from-amber-700 hover:to-orange-700 disabled:opacity-50"
            >
              <Trash2 className="h-3 w-3" />
              Remove {removableIds.length} duplicate{removableIds.length === 1 ? "" : "s"}
            </Button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="border-emerald-300 text-emerald-700 text-[10px] gap-1">
            <ShieldCheck className="h-3 w-3" /> {safeGroups.length} safe to clean
          </Badge>
          <Badge variant="outline" className="border-red-300 text-red-700 text-[10px] gap-1">
            <AlertTriangle className="h-3 w-3" /> {conflictGroups.length} need a decision
          </Badge>
          <Button variant="link" size="sm" className="h-6 px-1 text-[11px]" onClick={() => setOpen((o) => !o)}>
            {open ? <ChevronDown className="h-3 w-3 mr-1" /> : <ChevronRight className="h-3 w-3 mr-1" />}
            {open ? "Hide details" : "Review groups"}
          </Button>
        </div>

        {open && (
          <div className="max-h-[260px] overflow-auto rounded-md border border-border/60 divide-y divide-border/40 bg-background/70">
            {groups.map((g) => (
              <div key={g.key} className="px-3 py-2 text-[11px]">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-foreground truncate">{g.label}</span>
                  {g.conflicting ? (
                    <Badge variant="outline" className="border-red-300 text-red-700 text-[9px]">Population conflict</Badge>
                  ) : (
                    <Badge variant="outline" className="border-emerald-300 text-emerald-700 text-[9px]">
                      {g.records.length - 1} removable
                    </Badge>
                  )}
                </div>
                <p className="text-muted-foreground">
                  {[g.records[0].state, g.records[0].lga, g.records[0].ward, g.records[0].flhf_name]
                    .filter(Boolean)
                    .join(" → ") || "No geography recorded"}
                </p>
                <p className="text-muted-foreground">
                  {g.records.length} records · population: {g.populations.map(fmt).join(" / ")}
                </p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default MicroplanDuplicatesPanel;

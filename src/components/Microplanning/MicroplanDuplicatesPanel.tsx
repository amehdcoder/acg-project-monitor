import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CopyCheck, Copy, AlertTriangle, ChevronDown, ChevronRight, CheckSquare, ShieldCheck } from "lucide-react";
import type { DuplicateAnalysis, DuplicateCandidate } from "@/lib/microplanning/duplicates";

interface Props {
  analysis: DuplicateAnalysis<DuplicateCandidate & Record<string, unknown>>;
  readOnly?: boolean;
  onSelectAll: (ids: string[]) => void;
  showOnlyDuplicates: boolean;
  onToggleFilter: (v: boolean) => void;
}

const fmt = (n: number) => n.toLocaleString();

/**
 * Duplicate intelligence banner for the Planning tab.
 * Duplicates are only those records matching on ALL of State, LGA, Ward, FLHF,
 * Community and Settlement name. Every matching record is listed in the table
 * so the user can verify each one and remove them manually — nothing is ever
 * deleted automatically.
 */
const MicroplanDuplicatesPanel = ({ analysis, readOnly, onSelectAll, showOnlyDuplicates, onToggleFilter }: Props) => {
  const [open, setOpen] = useState(false);
  const { groups, safeGroups, conflictGroups, duplicateIds, duplicateRecordCount } = analysis;

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
              Matched only when State, LGA, Ward, FLHF, Community <em>and</em> Settlement name are all identical. All matching records are listed in the table below for your manual verification.
              {conflictGroups.length > 0 && ` ${conflictRecords} record(s) also differ on estimated population.`}
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
              onClick={() => { onToggleFilter(true); onSelectAll([...duplicateIds]); }}
              className="h-7 text-[11px] gap-1 bg-gradient-to-r from-amber-600 to-orange-600 text-white hover:from-amber-700 hover:to-orange-700"
            >
              <CheckSquare className="h-3 w-3" />
              Select all {duplicateIds.size} in table
            </Button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="border-emerald-300 text-emerald-700 text-[10px] gap-1">
            <ShieldCheck className="h-3 w-3" /> {safeGroups.length} identical-population groups
          </Badge>
          <Badge variant="outline" className="border-red-300 text-red-700 text-[10px] gap-1">
            <AlertTriangle className="h-3 w-3" /> {conflictGroups.length} population-conflict groups
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
                      {g.records.length} identical records
                    </Badge>
                  )}
                </div>
                <p className="text-muted-foreground">
                  {[g.records[0].state, g.records[0].lga, g.records[0].ward, g.records[0].flhf_name, g.records[0].community_name, g.records[0].settlement_name]
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

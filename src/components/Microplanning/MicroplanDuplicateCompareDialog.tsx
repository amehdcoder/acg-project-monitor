import { useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertTriangle, Check, Trash2 } from "lucide-react";
import { IDENTITY_FIELDS, type DuplicateAnalysis, type DuplicateCandidate } from "@/lib/microplanning/duplicates";

type Row = DuplicateCandidate & Record<string, unknown>;

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  analysis: DuplicateAnalysis<Row>;
  exactOnly: boolean;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onSelectGroupExtras: (ids: string[]) => void;
  onRemoveSelected: () => void;
  readOnly?: boolean;
}

const FIELD_LABELS: Record<string, string> = {
  state: "State",
  lga: "LGA",
  ward: "Ward",
  flhf_name: "FLHF",
  community_name: "Community",
  settlement_name: "Settlement",
};

/**
 * Side-by-side comparison of the six exact-match identity fields for every
 * duplicate group, so the user can visually confirm true matches before
 * selecting rows for deletion. Nothing is removed from here directly — the
 * selection flows through the standard confirmation dialog.
 */
const MicroplanDuplicateCompareDialog = ({
  open,
  onOpenChange,
  analysis,
  exactOnly,
  selectedIds,
  onToggleSelect,
  onSelectGroupExtras,
  onRemoveSelected,
  readOnly,
}: Props) => {
  const groups = useMemo(
    () => (exactOnly ? analysis.safeGroups : analysis.groups),
    [analysis, exactOnly],
  );
  const selectedCount = useMemo(
    () => groups.reduce((n, g) => n + g.records.filter((r) => selectedIds.has(r.id)).length, 0),
    [groups, selectedIds],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="text-base">Compare duplicate records</DialogTitle>
          <DialogDescription className="text-xs">
            Records are grouped only when State, LGA, Ward, FLHF, Community and Settlement all match exactly. Verify each
            row below, then select the copies you want to remove.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[55vh] overflow-auto space-y-4 pr-1">
          {groups.length === 0 && (
            <p className="text-xs text-muted-foreground py-6 text-center">No duplicate groups to compare.</p>
          )}
          {groups.map((g) => (
            <div key={g.key} className="rounded-lg border border-border/60 overflow-hidden">
              <div className="flex flex-wrap items-center gap-2 bg-muted/40 px-3 py-2">
                <span className="text-xs font-semibold truncate">{g.label}</span>
                {g.conflicting ? (
                  <Badge variant="outline" className="border-red-300 text-red-700 text-[9px] gap-1">
                    <AlertTriangle className="h-2.5 w-2.5" /> Population conflict
                  </Badge>
                ) : (
                  <Badge variant="outline" className="border-emerald-300 text-emerald-700 text-[9px] gap-1">
                    <Check className="h-2.5 w-2.5" /> Exact match · {g.records.length} records
                  </Badge>
                )}
                {!readOnly && g.removableIds.length > 0 && (
                  <Button
                    variant="link"
                    size="sm"
                    className="h-6 px-1 ml-auto text-[11px]"
                    onClick={() => onSelectGroupExtras(g.removableIds)}
                  >
                    Select {g.removableIds.length} extra cop{g.removableIds.length === 1 ? "y" : "ies"}
                  </Button>
                )}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="border-b border-border/50 text-muted-foreground">
                      <th className="px-2 py-1.5 text-left font-medium w-[110px]">Field</th>
                      {g.records.map((r, i) => (
                        <th key={r.id} className="px-2 py-1.5 text-left font-medium">
                          <div className="flex items-center gap-1.5">
                            {!readOnly && (
                              <Checkbox
                                checked={selectedIds.has(r.id)}
                                onCheckedChange={() => onToggleSelect(r.id)}
                                aria-label={`Select copy ${i + 1}`}
                              />
                            )}
                            Copy {i + 1}
                            {i === 0 && (
                              <Badge variant="outline" className="text-[8px] border-emerald-300 text-emerald-700">
                                oldest
                              </Badge>
                            )}
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {IDENTITY_FIELDS.map((f) => {
                      const differs = g.varyingFields?.includes(f);
                      return (
                        <tr key={f} className={`border-b border-border/30 ${differs ? "bg-amber-50/70 dark:bg-amber-950/20" : ""}`}>
                          <td className="px-2 py-1.5 text-muted-foreground">
                            <span className="flex items-center gap-1">
                              {FIELD_LABELS[f] ?? f}
                              {differs && <AlertTriangle className="h-2.5 w-2.5 text-amber-600" aria-label="values differ" />}
                            </span>
                          </td>
                          {g.records.map((r) => (
                            <td
                              key={r.id}
                              className={`px-2 py-1.5 ${differs ? "font-semibold text-amber-700 dark:text-amber-400" : "text-emerald-700 dark:text-emerald-400"}`}
                            >
                              {String(r[f] ?? "—")}
                            </td>
                          ))}
                        </tr>
                      );
                    })}

                    <tr>
                      <td className="px-2 py-1.5 text-muted-foreground">Est. population</td>
                      {g.records.map((r) => (
                        <td
                          key={r.id}
                          className={`px-2 py-1.5 font-medium ${g.conflicting ? "text-red-600 dark:text-red-400" : ""}`}
                        >
                          {Number(r.estimated_total_population ?? 0).toLocaleString()}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          {!readOnly && (
            <Button
              variant="destructive"
              size="sm"
              className="gap-1.5"
              disabled={selectedCount === 0}
              onClick={onRemoveSelected}
            >
              <Trash2 className="h-3.5 w-3.5" /> Remove selected duplicates ({selectedCount})
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default MicroplanDuplicateCompareDialog;

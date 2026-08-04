/**
 * Saved filter presets for the Checklist Dashboard.
 *
 * Captures the full cascaded filter state (date range, State / LGA / Ward,
 * Designation, Monitor and MDA Campaign Type) so supervisors can jump straight
 * back to recurring supervision views. Stored per Kobo integration.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Bookmark, BookmarkPlus, Check, Star, Trash2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { EMPTY_FILTERS, type ChecklistFilterState } from "./ChecklistFilters";

export interface ChecklistPreset {
  id: string;
  name: string;
  createdAt: string;
  filters: ChecklistFilterState;
}

const storageKey = (connectionId: string | null) =>
  `isc.checklistPresets${connectionId && connectionId !== "legacy" ? `:${connectionId}` : ""}`;

export function loadChecklistPresets(connectionId: string | null): ChecklistPreset[] {
  try {
    const raw = JSON.parse(localStorage.getItem(storageKey(connectionId)) || "[]");
    return Array.isArray(raw) ? (raw as ChecklistPreset[]) : [];
  } catch { return []; }
}

function persist(connectionId: string | null, presets: ChecklistPreset[]) {
  try { localStorage.setItem(storageKey(connectionId), JSON.stringify(presets)); } catch { /* quota */ }
}

/** Human-readable summary of what a preset scopes to. */
export function describePreset(f: ChecklistFilterState): string {
  const bits = [
    [f.state, ""], [f.lga, ""], [f.ward, ""],
    [f.campaign, ""], [f.designation, ""], [f.monitor, ""],
  ].map(([v]) => v).filter(Boolean) as string[];
  const range = f.from || f.to ? `${f.from || "…"} → ${f.to || "…"}` : "";
  if (range) bits.push(range);
  return bits.length ? bits.join(" · ") : "All data (no filters)";
}

export default function ChecklistPresetBar({
  connectionId, value, onApply,
}: {
  connectionId: string | null;
  value: ChecklistFilterState;
  onApply: (f: ChecklistFilterState) => void;
}) {
  const [presets, setPresets] = useState<ChecklistPreset[]>([]);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");

  useEffect(() => { setPresets(loadChecklistPresets(connectionId)); }, [connectionId]);

  const activeCount = useMemo(() => Object.values(value).filter(Boolean).length, [value]);

  const activeId = useMemo(
    () => presets.find((p) => JSON.stringify(p.filters) === JSON.stringify(value))?.id ?? null,
    [presets, value],
  );

  const suggestedName = useMemo(
    () => [value.state, value.lga, value.ward, value.campaign].filter(Boolean).join(" · "),
    [value],
  );

  const save = useCallback(() => {
    const trimmed = name.trim() || suggestedName;
    if (!trimmed) return;
    const preset: ChecklistPreset = {
      id: `cp-${Date.now().toString(36)}`,
      name: trimmed,
      createdAt: new Date().toISOString(),
      filters: { ...EMPTY_FILTERS, ...value },
    };
    const next = [...presets.filter((p) => p.name !== trimmed), preset];
    setPresets(next);
    persist(connectionId, next);
    setOpen(false);
    setName("");
    toast({ title: "Preset saved", description: `"${trimmed}" is one click away from now on.` });
  }, [name, suggestedName, value, presets, connectionId]);

  const remove = (id: string) => {
    const next = presets.filter((p) => p.id !== id);
    setPresets(next);
    persist(connectionId, next);
  };

  return (
    <>
      <div className="flex items-center gap-1.5">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-7 text-xs">
              <Bookmark className="h-3.5 w-3.5 mr-1 text-primary" />
              Saved views
              {presets.length > 0 && (
                <Badge variant="secondary" className="ml-1.5 h-4 px-1 text-[10px]">{presets.length}</Badge>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80">
            <DropdownMenuLabel className="text-xs">
              Saved State / LGA / Ward &amp; campaign views
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {presets.length === 0 && (
              <div className="px-2 py-3 text-xs text-muted-foreground">
                No saved views yet. Set the filters you use often, then save this view.
              </div>
            )}
            <div className="max-h-64 overflow-auto">
              {presets.map((p) => (
                <DropdownMenuItem
                  key={p.id}
                  className="flex items-start gap-2"
                  onSelect={(e) => { e.preventDefault(); onApply({ ...EMPTY_FILTERS, ...p.filters }); }}
                >
                  {activeId === p.id
                    ? <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                    : <Star className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-medium">{p.name}</div>
                    <div className="text-[10px] leading-snug text-muted-foreground break-words">
                      {describePreset(p.filters)}
                    </div>
                  </div>
                  <button
                    aria-label={`Delete saved view ${p.name}`}
                    className="p-1 text-destructive"
                    onClick={(e) => { e.stopPropagation(); remove(p.id); }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </DropdownMenuItem>
              ))}
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setName(suggestedName); setOpen(true); }}>
              <BookmarkPlus className="mr-2 h-3.5 w-3.5" />
              <span className="text-xs">Save current view ({activeCount} filter{activeCount === 1 ? "" : "s"})</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Save this supervision view</DialogTitle>
            <DialogDescription className="break-words">
              Captures: {describePreset(value)}
            </DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") save(); }}
            placeholder="e.g. Jigawa · Dutse · Onchocerciasis"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={!name.trim() && !suggestedName}>Save view</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

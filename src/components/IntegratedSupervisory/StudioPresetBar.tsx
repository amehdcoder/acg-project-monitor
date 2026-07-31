/**
 * Saved filter presets for the Dashboard Studio.
 *
 * A preset captures the whole filter state (dimension filters, date range and
 * global search) and is persisted per Kobo integration, so each dashboard keeps
 * its own set of saved views.
 */
import { useCallback, useEffect, useState } from "react";
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
import { BookmarkPlus, Bookmark, Check, Trash2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";

export interface FilterState {
  f: Record<string, string>;
  dateFrom: string;
  dateTo: string;
  globalSearch: string;
}

export interface FilterPreset extends FilterState {
  id: string;
  name: string;
  createdAt: string;
}

const key = (connectionId: string | null) =>
  `amehnities.integratedSupervisory.presets${connectionId && connectionId !== "legacy" ? `:${connectionId}` : ""}`;

export function loadPresets(connectionId: string | null): FilterPreset[] {
  try { return JSON.parse(localStorage.getItem(key(connectionId)) || "[]") as FilterPreset[]; }
  catch { return []; }
}
function persist(connectionId: string | null, presets: FilterPreset[]) {
  try { localStorage.setItem(key(connectionId), JSON.stringify(presets)); } catch { /* quota */ }
}

interface Props {
  connectionId: string | null;
  current: FilterState;
  onApply: (state: FilterState) => void;
}

export default function StudioPresetBar({ connectionId, current, onApply }: Props) {
  const [presets, setPresets] = useState<FilterPreset[]>([]);
  const [saveOpen, setSaveOpen] = useState(false);
  const [name, setName] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => { setPresets(loadPresets(connectionId)); setActiveId(null); }, [connectionId]);

  const activeFilterCount =
    Object.values(current.f).filter(Boolean).length +
    (current.dateFrom ? 1 : 0) + (current.dateTo ? 1 : 0) + (current.globalSearch ? 1 : 0);

  const save = useCallback(() => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const preset: FilterPreset = {
      id: `p-${Date.now().toString(36)}`,
      name: trimmed,
      createdAt: new Date().toISOString(),
      f: { ...current.f },
      dateFrom: current.dateFrom,
      dateTo: current.dateTo,
      globalSearch: current.globalSearch,
    };
    const next = [...presets, preset];
    setPresets(next);
    persist(connectionId, next);
    setActiveId(preset.id);
    setSaveOpen(false);
    setName("");
    toast({ title: "Filter preset saved", description: `"${trimmed}" can now be applied in one click.` });
  }, [name, current, presets, connectionId]);

  const remove = (id: string) => {
    const next = presets.filter((p) => p.id !== id);
    setPresets(next);
    persist(connectionId, next);
    if (activeId === id) setActiveId(null);
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="h-8">
            <Bookmark className="h-4 w-4 mr-1" />
            Presets
            {presets.length > 0 && (
              <Badge variant="secondary" className="ml-1.5 h-4 px-1 text-[10px]">{presets.length}</Badge>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72">
          <DropdownMenuLabel className="text-xs">Saved filter presets</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {presets.length === 0 && (
            <div className="px-2 py-3 text-xs text-muted-foreground">
              No presets yet. Set your filters, then save the current view.
            </div>
          )}
          {presets.map((p) => (
            <DropdownMenuItem
              key={p.id}
              className="flex items-start gap-2"
              onSelect={(e) => {
                e.preventDefault();
                onApply({ f: { ...p.f }, dateFrom: p.dateFrom, dateTo: p.dateTo, globalSearch: p.globalSearch });
                setActiveId(p.id);
              }}
            >
              {activeId === p.id ? <Check className="h-3.5 w-3.5 mt-0.5 text-primary" /> : <Bookmark className="h-3.5 w-3.5 mt-0.5 text-muted-foreground" />}
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-medium">{p.name}</div>
                <div className="text-[10px] text-muted-foreground">
                  {Object.values(p.f).filter(Boolean).length} filter(s)
                  {p.dateFrom || p.dateTo ? " · date range" : ""}
                  {p.globalSearch ? " · search" : ""}
                </div>
              </div>
              <button
                aria-label={`Delete preset ${p.name}`}
                className="p-1 text-destructive"
                onClick={(e) => { e.stopPropagation(); remove(p.id); }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setSaveOpen(true); }}>
            <BookmarkPlus className="h-3.5 w-3.5 mr-2" />
            <span className="text-xs">Save current view ({activeFilterCount} filter{activeFilterCount === 1 ? "" : "s"})</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Save filter preset</DialogTitle>
            <DialogDescription>
              Stores the current dimension filters, date range and search so you can reapply this view instantly.
            </DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") save(); }}
            placeholder="e.g. Jigawa · Week 2 · Halted only"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={!name.trim()}>Save preset</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

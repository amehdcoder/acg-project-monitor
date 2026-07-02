/**
 * LocationCombobox
 * ────────────────────────────────────────────────────────────────────────
 * A high-performance, type-and-add combobox used by the MDA Location Cascade
 * for FLHF and Settlement (Community) levels. It:
 *   • lets the supervisor PICK an option that exists in the microplan, OR
 *   • TYPE a new FLHF / Settlement that is not in the microplan and ADD it
 *     inline (flagged downstream for reconciliation),
 *   • stays responsive with very large option lists by **virtualizing** the
 *     rendered rows — only the visible window is mounted, no matter how many
 *     thousands (or more) of options exist.
 */
import { useMemo, useRef, useState, useCallback } from "react";
import { Check, ChevronsUpDown, PlusCircle, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface Props {
  value: string;
  options: string[];
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  /** Allow typing & adding values that are not in the option list. */
  allowAdd?: boolean;
  emptyLabel?: string;
  /** Extra classes for the trigger button (e.g. larger Kobo-style sizing). */
  triggerClassName?: string;
}

const ROW_HEIGHT = 34;       // px per option row
const OVERSCAN = 6;          // rows rendered above/below the viewport
const VIEWPORT_HEIGHT = 264; // px scroll area

export default function LocationCombobox({
  value,
  options,
  onChange,
  placeholder = "Select…",
  disabled,
  allowAdd = true,
  emptyLabel = "No matches",
  triggerClassName,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [scrollTop, setScrollTop] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  // Memoised, case-insensitive filter — only recomputed when options/query change.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.toLowerCase().includes(q));
  }, [options, query]);

  // Virtualization window.
  const total = filtered.length;
  const startIdx = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const endIdx = Math.min(total, Math.ceil((scrollTop + VIEWPORT_HEIGHT) / ROW_HEIGHT) + OVERSCAN);
  const visible = filtered.slice(startIdx, endIdx);

  const exactMatch = useMemo(
    () => filtered.some((o) => o.toLowerCase() === query.trim().toLowerCase()),
    [filtered, query],
  );
  const canAdd = allowAdd && query.trim().length > 0 && !exactMatch;

  const pick = useCallback((v: string) => {
    onChange(v);
    setOpen(false);
    setQuery("");
    setScrollTop(0);
  }, [onChange]);

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setQuery(""); setScrollTop(0); } }}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn("w-full justify-between bg-background font-normal", !value && "text-muted-foreground")}
        >
          <span className="truncate">{value || placeholder}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <div className="flex items-center gap-2 border-b px-3 py-2">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <Input
            autoFocus
            value={query}
            onChange={(e) => { setQuery(e.target.value); setScrollTop(0); }}
            placeholder="Search or type to add…"
            className="h-8 border-0 px-0 shadow-none focus-visible:ring-0"
          />
        </div>

        {canAdd && (
          <button
            type="button"
            onClick={() => pick(query.trim())}
            className="flex w-full items-center gap-2 border-b bg-primary/5 px-3 py-2.5 text-left text-sm font-medium text-primary hover:bg-primary/10"
          >
            <PlusCircle className="h-4 w-4 shrink-0" />
            Add “{query.trim()}”
            <span className="ml-auto text-[10px] font-normal text-muted-foreground">not in list</span>
          </button>
        )}

        <div
          ref={listRef}
          onScroll={(e) => setScrollTop((e.target as HTMLDivElement).scrollTop)}
          style={{ height: Math.min(VIEWPORT_HEIGHT, Math.max(ROW_HEIGHT, total * ROW_HEIGHT)) }}
          className="overflow-y-auto"
        >
          {total === 0 && !canAdd ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">{emptyLabel}</p>
          ) : (
            <div style={{ height: total * ROW_HEIGHT, position: "relative" }}>
              <div style={{ transform: `translateY(${startIdx * ROW_HEIGHT}px)` }}>
                {visible.map((o) => (
                  <button
                    type="button"
                    key={o}
                    onClick={() => pick(o)}
                    style={{ height: ROW_HEIGHT }}
                    className="flex w-full items-center gap-2 px-3 text-left text-sm hover:bg-muted/60"
                  >
                    <Check className={cn("h-4 w-4 shrink-0", value === o ? "opacity-100 text-primary" : "opacity-0")} />
                    <span className="truncate">{o}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, X, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

export interface CommunityOption {
  /** Stable value used for selection (community identity). */
  value: string;
  /** Human-readable community name. */
  label: string;
  /** Secondary line — "Ward · LGA · State". */
  sub?: string;
}

interface Props {
  options: CommunityOption[];
  /** Selected values. An EMPTY array means "all communities". */
  selected: string[];
  onChange: (values: string[]) => void;
  className?: string;
  placeholder?: string;
}

/**
 * Compact, searchable multi-select for real community names on the MDA
 * Supervisory Dashboard filter bar. An empty selection = "All communities".
 * Supports select-all / clear and shows Ward · LGA · State context per option.
 */
export default function CommunityMultiSelect({
  options, selected, onChange, className, placeholder = "All communities",
}: Props) {
  const [open, setOpen] = useState(false);
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const allValues = useMemo(() => options.map((o) => o.value), [options]);
  const allSelected = selected.length === 0; // empty = all

  const toggle = (value: string) => {
    const next = new Set(selectedSet);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    // If every option becomes selected, collapse back to "all" (empty array).
    if (next.size === 0 || next.size === allValues.length) onChange([]);
    else onChange([...next]);
  };

  const label = allSelected
    ? placeholder
    : selected.length === 1
      ? (options.find((o) => o.value === selected[0])?.label ?? "1 community")
      : `${selected.length} communities`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("h-9 justify-between gap-1 px-2 text-xs font-normal", className)}
        >
          <span className="flex min-w-0 items-center gap-1.5">
            <Building2 className="h-3.5 w-3.5 shrink-0 text-primary" />
            <span className="truncate">{label}</span>
          </span>
          <span className="flex items-center gap-1">
            {!allSelected && (
              <Badge variant="secondary" className="h-4 px-1 text-[9px] tabular-nums">
                {selected.length}
              </Badge>
            )}
            <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <Command>
          <CommandInput placeholder={`Search ${options.length} communities…`} className="text-xs" />
          <div className="flex items-center justify-between gap-2 border-b px-2 py-1.5">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
              {allSelected ? "All selected" : `${selected.length} of ${options.length}`}
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost" size="sm" className="h-6 px-2 text-[10px]"
                onClick={() => onChange([])}
              >
                Select all
              </Button>
              <Button
                variant="ghost" size="sm" className="h-6 px-2 text-[10px]"
                disabled={allSelected}
                onClick={() => onChange(allValues)}
                title="Select only the first, then refine"
              >
                <X className="mr-0.5 h-3 w-3" /> Clear
              </Button>
            </div>
          </div>
          <CommandList>
            <CommandEmpty className="py-4 text-center text-xs text-muted-foreground">
              No communities found.
            </CommandEmpty>
            <ScrollArea className="max-h-64">
              <CommandGroup>
                {options.map((o) => {
                  const checked = allSelected || selectedSet.has(o.value);
                  return (
                    <CommandItem
                      key={o.value}
                      value={`${o.label} ${o.sub ?? ""}`}
                      onSelect={() => toggle(o.value)}
                      className="flex items-start gap-2 text-xs"
                    >
                      <span
                        className={cn(
                          "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                          checked && !allSelected
                            ? "border-primary bg-primary text-primary-foreground"
                            : allSelected
                              ? "border-primary/40 bg-primary/10 text-primary"
                              : "border-input",
                        )}
                      >
                        {(checked) && <Check className="h-3 w-3" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-foreground">{o.label}</span>
                        {o.sub && <span className="block truncate text-[10px] text-muted-foreground">{o.sub}</span>}
                      </span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </ScrollArea>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

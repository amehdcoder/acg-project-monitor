import { useEffect, useMemo, useState } from "react";
import { Check, ChevronsUpDown, MapPinPlus, Plus, WifiOff } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useBypassStrictFiltering } from "@/hooks/useBypassStrictFiltering";
import {
  ReferenceEntityType,
  ReferenceLocation,
  createLocalEntity,
  getMergedEntities,
  refreshServerEntities,
} from "@/lib/offlineReferenceData";

const TYPE_LABEL: Record<ReferenceEntityType, string> = {
  community: "Community",
  village: "Village",
  location_hub: "Location Hub",
};

export interface ReferenceLocationSelectProps {
  entityType: ReferenceEntityType;
  value?: string | null;
  onChange: (id: string, entity: ReferenceLocation) => void;
  /** hierarchy defaults applied to a newly-created entity */
  scope?: { state?: string | null; lga?: string | null; ward?: string | null };
  /** optional project to stamp on new entities */
  projectId?: string | null;
  /**
   * Filter predicate applied to the list when strict filtering is ON. Return
   * true for entities inside the supervisor's microplan scope. When the bypass
   * toggle is enabled this filter is skipped and the full master index shows.
   */
  inScope?: (e: ReferenceLocation) => boolean;
  placeholder?: string;
  disabled?: boolean;
  /** show the "Bypass Strict Microplan Filtering" switch inline */
  showBypassToggle?: boolean;
  className?: string;
}

export function ReferenceLocationSelect({
  entityType,
  value,
  onChange,
  scope,
  projectId,
  inScope,
  placeholder,
  disabled,
  showBypassToggle = true,
  className,
}: ReferenceLocationSelectProps) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [entities, setEntities] = useState<ReferenceLocation[]>([]);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [bypass, setBypass] = useBypassStrictFiltering();
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator === "undefined" ? true : navigator.onLine
  );

  const label = TYPE_LABEL[entityType];

  const reload = async () => {
    const list = await getMergedEntities(entityType);
    setEntities(list);
  };

  useEffect(() => {
    void reload();
    // pull the shared registry into the local cache when online
    void refreshServerEntities().then(reload);
    const on = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityType]);

  const visible = useMemo(() => {
    let list = entities;
    // Strict filtering only applies when a scope filter is provided AND bypass
    // is off. Locally-created drafts always stay visible so the supervisor can
    // keep working with what they just added.
    if (inScope && !bypass) {
      list = list.filter((e) => e.is_local_draft || inScope(e));
    }
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter((e) =>
        [e.name, e.state, e.lga, e.ward].some((v) => v?.toLowerCase().includes(q))
      );
    }
    return list;
  }, [entities, inScope, bypass, query]);

  const selected = entities.find((e) => e.id === value);

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    const entity = await createLocalEntity({
      entity_type: entityType,
      name,
      state: scope?.state ?? null,
      lga: scope?.lga ?? null,
      ward: scope?.ward ?? null,
      project_id: projectId ?? null,
    });
    setNewName("");
    setCreating(false);
    await reload();
    onChange(entity.id, entity);
    setOpen(false);
    toast({
      title: `${label} added offline`,
      description: isOnline
        ? `"${name}" is available now and will sync to the server automatically.`
        : `"${name}" is saved on this device and will sync when you're back online.`,
    });
  };

  return (
    <div className={cn("space-y-2", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className="w-full justify-between font-normal"
          >
            <span className="flex items-center gap-2 truncate">
              {selected ? (
                <>
                  <span className="truncate">{selected.name}</span>
                  {selected.is_local_draft && (
                    <Badge variant="secondary" className="shrink-0 gap-1 text-[10px]">
                      <WifiOff className="h-3 w-3" /> Draft
                    </Badge>
                  )}
                </>
              ) : (
                <span className="text-muted-foreground">
                  {placeholder ?? `Select ${label.toLowerCase()}…`}
                </span>
              )}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput
              placeholder={`Search ${label.toLowerCase()}…`}
              value={query}
              onValueChange={setQuery}
            />
            <CommandList>
              <CommandEmpty>No {label.toLowerCase()} found.</CommandEmpty>
              <CommandGroup>
                {visible.map((e) => (
                  <CommandItem
                    key={e.id}
                    value={e.id}
                    onSelect={() => {
                      onChange(e.id, e);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        value === e.id ? "opacity-100" : "opacity-0"
                      )}
                    />
                    <span className="flex-1 truncate">
                      {e.name}
                      {(e.ward || e.lga) && (
                        <span className="ml-1 text-xs text-muted-foreground">
                          · {[e.ward, e.lga].filter(Boolean).join(", ")}
                        </span>
                      )}
                    </span>
                    {e.is_local_draft && (
                      <Badge variant="secondary" className="ml-2 gap-1 text-[10px]">
                        <WifiOff className="h-3 w-3" /> Draft
                      </Badge>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>

              <CommandSeparator />
              <div className="p-2">
                {creating ? (
                  <div className="space-y-2">
                    <Input
                      autoFocus
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder={`New ${label.toLowerCase()} name`}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          void handleCreate();
                        }
                      }}
                    />
                    <div className="flex gap-2">
                      <Button type="button" size="sm" className="flex-1" onClick={handleCreate}>
                        <MapPinPlus className="mr-1 h-4 w-4" /> Add {label}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setCreating(false);
                          setNewName("");
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="w-full justify-start"
                    onClick={() => {
                      setCreating(true);
                      setNewName(query);
                    }}
                  >
                    <Plus className="mr-1 h-4 w-4" /> Register new {label.toLowerCase()}
                    {!isOnline && (
                      <span className="ml-auto text-xs text-muted-foreground">offline</span>
                    )}
                  </Button>
                )}
              </div>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {showBypassToggle && inScope && (
        <div className="flex items-center justify-between rounded-md border border-dashed px-3 py-2">
          <div className="space-y-0.5 pr-3">
            <Label htmlFor="bypass-strict" className="text-xs font-medium">
              Bypass Strict Microplan Filtering
            </Label>
            <p className="text-[11px] leading-tight text-muted-foreground">
              Show the full master index of adjacent LGAs / communities to
              capture data for unassigned regions.
            </p>
          </div>
          <Switch id="bypass-strict" checked={bypass} onCheckedChange={setBypass} />
        </div>
      )}
    </div>
  );
}

export default ReferenceLocationSelect;

/**
 * Binding card for the Human patterns & networks tab.
 *
 * Binds a Geo-enabled Microplanning project (the planned eligible population)
 * to the Supervisory Checklist and the Medicine Accountability ledger. Both
 * the bound project and the target-population definition are saved, so the
 * analyst sets them once rather than at every visit.
 */
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CloudOff, Loader2, RefreshCw, Route, Save, SlidersHorizontal } from "lucide-react";
import type { MicroplanProjectOption } from "@/hooks/useMicroplanProjectData";

interface Props {
  projects: MicroplanProjectOption[];
  projectsLoading: boolean;
  projectId: string;
  onProjectId: (id: string) => void;
  entryCount: number;
  plannedCommunities: number;
  loading: boolean;
  fromCache: boolean;
  syncedAt: number | null;
  onRefresh: () => void;
  /** Target-population disaggregation (single or a sum of several). */
  fields: string[];
  onFields: (next: string[]) => void;
  options: { key: string; label: string; field: string }[];
  targetLabel: string;
}

export default function MicroplanBindingCard({
  projects, projectsLoading, projectId, onProjectId, entryCount, plannedCommunities,
  loading, fromCache, syncedAt, onRefresh, fields, onFields, options, targetLabel,
}: Props) {
  const toggle = (key: string) =>
    onFields(fields.includes(key) ? fields.filter((f) => f !== key) : [...fields, key]);

  return (
    <Card className="overflow-hidden border-primary/30">
      <div className="h-1 w-full bg-gradient-to-r from-primary via-emerald-500 to-sky-500" />
      <CardHeader className="pb-3">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          <Route className="h-4 w-4 text-primary" />
          Bind a Geo-enabled Microplanning project
          <Badge variant="outline" className="text-[10px] font-normal">Microplan × Checklist × Ledger</Badge>
          {!!projectId && (
            <Badge variant="outline" className="gap-1 border-emerald-300 bg-emerald-50 text-[10px] font-normal text-emerald-700">
              <Save className="h-3 w-3" /> Saved on this device
            </Badge>
          )}
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          The microplan supplies the planned eligible population (denominator), the Supervisory Checklist supplies
          household coverage and process evidence, and the Medicine Accountability ledger supplies what was actually
          allocated and issued. Your project and target-population choice are remembered.
        </p>
      </CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1">
          <p className="text-[11px] font-medium text-muted-foreground">Microplanning project</p>
          <Select value={projectId} onValueChange={onProjectId}>
            <SelectTrigger className="h-9">
              <SelectValue placeholder={projectsLoading ? "Loading projects…" : "Select a project to link"} />
            </SelectTrigger>
            <SelectContent>
              {projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              {!projects.length && !projectsLoading && (
                <div className="px-2 py-3 text-xs text-muted-foreground">No microplanning project available to you.</div>
              )}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <p className="text-[11px] font-medium text-muted-foreground">Target population (single or sum of several)</p>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="h-9 w-full justify-between font-normal">
                <span className="truncate text-xs">{targetLabel}</span>
                <SlidersHorizontal className="ml-2 h-3.5 w-3.5 shrink-0 opacity-60" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-3" align="start">
              <p className="mb-2 text-[11px] text-muted-foreground">
                Selected disaggregations are summed into the eligible denominator and saved for every future visit.
              </p>
              <div className="space-y-2">
                {options.map((o) => (
                  <label key={o.key} className="flex cursor-pointer items-center gap-2 text-xs">
                    <Checkbox checked={fields.includes(o.key)} onCheckedChange={() => toggle(o.key)} />
                    <span>{o.label}</span>
                  </label>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        </div>

        <div className="flex flex-wrap items-center gap-2 md:col-span-2">
          {loading && (
            <Badge variant="outline" className="gap-1 text-[10px] font-normal">
              <Loader2 className="h-3 w-3 animate-spin" /> Loading microplan…
            </Badge>
          )}
          {!!projectId && !loading && (
            <Badge variant="outline" className="text-[10px] font-normal">
              {entryCount.toLocaleString()} microplan entries · {plannedCommunities.toLocaleString()} planned communities
            </Badge>
          )}
          {fromCache && (
            <Badge variant="outline" className="gap-1 border-amber-300 bg-amber-50 text-[10px] font-normal text-amber-700">
              <CloudOff className="h-3 w-3" /> Offline copy
            </Badge>
          )}
          {syncedAt && <span className="text-[10px] text-muted-foreground">Live-synced {new Date(syncedAt).toLocaleTimeString()}</span>}
          {!!projectId && (
            <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" onClick={onRefresh}>
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

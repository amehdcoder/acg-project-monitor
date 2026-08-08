import { useState } from "react";
import { MapPin, Crosshair, Loader2, Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  resolveMissingCoordinates,
  resolutionToUpdate,
  rowNeedsGeocoding,
  type MicroplanGeoRow,
  type ResolveMethod,
} from "@/lib/microplanning/settlementResolver";

const METHOD_LABEL: Record<ResolveMethod, string> = {
  grid3_settlement_ward: "GRID3 settlement (in ward)",
  grid3_settlement_lga: "GRID3 settlement (in LGA)",
  grid3_facility_ward: "GRID3 health facility (in ward)",
  grid3_facility_lga: "GRID3 health facility (in LGA)",
  ward_centroid: "Ward centroid (no confident name match)",
  lga_centroid: "LGA centroid (no ward coverage)",
  unresolved: "Unresolved",
};

interface Props {
  entry: any;
  readOnly?: boolean;
  /** Called with the patch applied so the parent can update its local rows. */
  onResolved?: (id: string, patch: Record<string, unknown>) => void;
  compact?: boolean;
}

/**
 * GPS cell for the Planning table.
 * Shows the community coordinates, and — when any of the Health Facility /
 * Community / Settlement coordinates are missing — offers a one-click GRID3
 * fuzzy-match resolution scoped to the reported ward, falling back to the ward
 * centroid when no name match clears the confidence bar.
 */
const GpsResolveCell = ({ entry, readOnly = false, onResolved, compact = false }: Props) => {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const hasCoords = entry.community_latitude != null && entry.community_longitude != null;
  const needs = rowNeedsGeocoding(entry as MicroplanGeoRow);

  const run = async () => {
    setBusy(true);
    try {
      const [res] = await resolveMissingCoordinates([entry as MicroplanGeoRow]);
      if (!res) {
        toast({ title: "No GRID3 match", description: "No settlement or facility could be matched inside this ward.", variant: "destructive" });
        return;
      }
      const patch = resolutionToUpdate(res);
      if (!Object.keys(patch).length) {
        toast({ title: "Nothing to fill", description: "All coordinates already present." });
        return;
      }
      if (!readOnly && entry.id && !String(entry.id).startsWith("demo")) {
        const { error } = await supabase.from("microplan_entries").update(patch as any).eq("id", entry.id);
        if (error) throw error;
      }
      const method = (res.community || res.settlement || res.flhf)?.method ?? "unresolved";
      const conf = (res.community || res.settlement || res.flhf)?.confidence ?? 0;
      setDone(`${METHOD_LABEL[method]}${conf ? ` · ${(conf * 100).toFixed(0)}% match` : ""}`);
      onResolved?.(entry.id, patch);
      toast({
        title: "📍 Coordinates resolved from GRID3",
        description: `${entry.community_name || "Record"} — ${METHOD_LABEL[method]}`,
      });
    } catch (err: any) {
      toast({ title: "Resolution failed", description: err?.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={compact ? "inline-flex items-center gap-1" : "flex items-center gap-1"}>
      {hasCoords ? (
        <Badge variant="outline" className="text-[10px] border-blue-300 text-blue-700">
          <MapPin className="h-2.5 w-2.5 mr-0.5" />
          {Number(entry.community_latitude).toFixed(2)}, {Number(entry.community_longitude).toFixed(2)}
        </Badge>
      ) : (
        <span className="text-muted-foreground text-[10px]">—</span>
      )}
      {needs && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={run}
                className="h-6 px-1.5 text-[10px] gap-1 text-primary hover:text-primary"
              >
                {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Crosshair className="h-3 w-3" />}
                {busy ? "Matching…" : "Resolve"}
              </Button>
            </TooltipTrigger>
            <TooltipContent className="max-w-[240px] text-[11px]">
              Fuzzy-match this record's Health Facility / Community / Settlement against GRID3
              inside {entry.ward || "the reported ward"} — falls back to the ward centroid when no
              name match is confident enough.
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
      {done && (
        <span className="inline-flex items-center gap-0.5 text-[9px] text-emerald-600">
          <Check className="h-3 w-3" /> {done}
        </span>
      )}
    </div>
  );
};

export default GpsResolveCell;

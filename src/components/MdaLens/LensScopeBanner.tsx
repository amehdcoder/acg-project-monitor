/**
 * MDA Lens — "Scoped to State and LGA(s)" indicator.
 *
 * Rendered on the Geo Microplanning and Integrated Supervisory Checklist pages
 * so a lens user always sees exactly which geography (and project / campaign)
 * their real-time data, filters and exports are restricted to.
 */
import { Badge } from "@/components/ui/badge";
import { Lock, MapPin } from "lucide-react";
import type { MdaLensGrant } from "@/lib/mdaLens/config";

const chip = (v: string) => v.split("|").pop()!.trim();

export function lensScopeSummary(lens: MdaLensGrant | null): string {
  if (!lens) return "Scope: full dataset";
  const parts = [
    `State${lens.states.length === 1 ? "" : "s"}: ${lens.states.length ? lens.states.map(chip).join(", ") : "All"}`,
    `LGA${lens.lgas.length === 1 ? "" : "s"}: ${lens.lgas.length ? lens.lgas.map(chip).join(", ") : "All"}`,
  ];
  if (lens.wards.length) parts.push(`Ward${lens.wards.length === 1 ? "" : "s"}: ${lens.wards.map(chip).join(", ")}`);
  if (lens.campaign_types.length) parts.push(`Campaign: ${lens.campaign_types.join(", ")}`);
  return `Scoped to ${parts.join(" · ")}`;
}

export default function LensScopeBanner({
  lens,
  className = "",
}: {
  lens: MdaLensGrant | null;
  className?: string;
}) {
  if (!lens) return null;
  const states = lens.states.map(chip);
  const lgas = lens.lgas.map(chip);
  const wards = lens.wards.map(chip);

  const group = (title: string, values: string[]) => (
    <div className="flex flex-wrap items-center gap-1">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</span>
      {values.length ? (
        values.map((v) => (
          <Badge key={`${title}-${v}`} variant="secondary" className="h-5 text-[11px] font-medium">{v}</Badge>
        ))
      ) : (
        <Badge variant="outline" className="h-5 text-[11px] font-medium">All</Badge>
      )}
    </div>
  );

  return (
    <div
      className={`rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 flex flex-wrap items-center gap-x-4 gap-y-2 ${className}`}
    >
      <span className="flex items-center gap-1.5 text-xs font-semibold text-primary">
        <MapPin className="h-3.5 w-3.5" /> Scoped to State &amp; LGA(s)
      </span>
      {group("State", states)}
      {group("LGA", lgas)}
      {wards.length > 0 && group("Ward", wards)}
      {lens.campaign_types.length > 0 && group("Campaign", lens.campaign_types)}
      <span className="ml-auto flex items-center gap-1 text-[11px] text-muted-foreground">
        <Lock className="h-3 w-3" /> Filters, dashboards and exports are locked to this scope
      </span>
    </div>
  );
}

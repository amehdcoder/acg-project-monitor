/**
 * Universal Kobo Hub — global dynamic filter bar.
 * Date range, cascaded State → LGA → Ward and the active cross-filter slices.
 */
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Filter, X } from "lucide-react";
import { applyFilters, distinctValues, type HubFilters, type Row } from "@/lib/koboHub/analytics";
import type { HubSchema } from "@/lib/koboHub/schema";

const ALL = "__all__";

interface Props {
  rows: Row[];
  schema: HubSchema;
  filters: HubFilters;
  onChange: (f: HubFilters) => void;
}

export default function HubFilters({ rows, schema, filters, onChange }: Props) {
  const states = useMemo(() => distinctValues(rows, schema, schema.geo.state), [rows, schema]);
  const lgas = useMemo(
    () => distinctValues(applyFilters(rows, schema, { ...filters, lga: undefined, ward: undefined, slices: {} }), schema, schema.geo.lga),
    [rows, schema, filters],
  );
  const wards = useMemo(
    () => distinctValues(applyFilters(rows, schema, { ...filters, ward: undefined, slices: {} }), schema, schema.geo.ward),
    [rows, schema, filters],
  );

  const set = (patch: Partial<HubFilters>) => onChange({ ...filters, ...patch });
  const sliceEntries = Object.entries(filters.slices);
  const active = !!(filters.from || filters.to || filters.state || filters.lga || filters.ward || sliceEntries.length);

  const geoSelect = (
    label: string, value: string | undefined, options: string[], key: "state" | "lga" | "ward",
  ) => (
    <div className="min-w-[150px] flex-1">
      <label className="text-[11px] uppercase tracking-wide text-slate-400">{label}</label>
      <Select
        value={value ?? ALL}
        onValueChange={(v) => set(
          key === "state" ? { state: v === ALL ? undefined : v, lga: undefined, ward: undefined }
            : key === "lga" ? { lga: v === ALL ? undefined : v, ward: undefined }
              : { ward: v === ALL ? undefined : v },
        )}
      >
        <SelectTrigger className="h-9 bg-slate-900 border-slate-700 text-slate-100">
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="max-h-72">
          <SelectItem value={ALL}>All {label.toLowerCase()}s</SelectItem>
          {options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3 space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex items-center gap-2 text-slate-300 text-sm font-medium pb-2">
          <Filter className="h-4 w-4 text-cyan-400" /> Filters
        </div>
        <div className="min-w-[140px]">
          <label className="text-[11px] uppercase tracking-wide text-slate-400">From</label>
          <Input type="date" value={filters.from ?? ""} onChange={(e) => set({ from: e.target.value || undefined })}
            className="h-9 bg-slate-900 border-slate-700 text-slate-100" />
        </div>
        <div className="min-w-[140px]">
          <label className="text-[11px] uppercase tracking-wide text-slate-400">To</label>
          <Input type="date" value={filters.to ?? ""} onChange={(e) => set({ to: e.target.value || undefined })}
            className="h-9 bg-slate-900 border-slate-700 text-slate-100" />
        </div>
        {schema.geo.state && geoSelect("State", filters.state, states, "state")}
        {schema.geo.lga && geoSelect("LGA", filters.lga, lgas, "lga")}
        {schema.geo.ward && geoSelect("Ward", filters.ward, wards, "ward")}
        {active && (
          <Button variant="ghost" size="sm" className="text-slate-300 hover:text-white"
            onClick={() => onChange({ slices: {} })}>
            <X className="h-4 w-4 mr-1" /> Reset
          </Button>
        )}
      </div>

      {sliceEntries.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] uppercase tracking-wide text-slate-400">Cross-filters</span>
          {sliceEntries.map(([name, val]) => {
            const f = schema.fields.find((x) => x.name === name);
            return (
              <Badge key={name} className="bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 gap-1">
                {(f?.label ?? name)}: {val}
                <button
                  onClick={() => {
                    const next = { ...filters.slices };
                    delete next[name];
                    onChange({ ...filters, slices: next });
                  }}
                  aria-label="Remove filter"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            );
          })}
        </div>
      )}
    </div>
  );
}

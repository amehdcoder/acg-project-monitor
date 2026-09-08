import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Filter, X } from "lucide-react";

export interface ScopeFilterValues {
  lga: string;
  facility: string;
  supervisor: string;
}

interface Props {
  values: ScopeFilterValues;
  onChange: (v: ScopeFilterValues) => void;
  lgas: string[];
  facilitySuggestions: string[];
  supervisorSuggestions: string[];
  facilityLabel?: string;
  matchCount?: number;
  totalCount?: number;
  accent?: string;
}

const DashboardScopeFilters = ({
  values,
  onChange,
  lgas,
  facilitySuggestions,
  supervisorSuggestions,
  facilityLabel = "Facility type",
  matchCount,
  totalCount,
  accent = "#2563eb",
}: Props) => {
  const active = [values.lga, values.facility, values.supervisor].filter(Boolean).length;

  return (
    <div className="rounded-2xl bg-white p-3 shadow-sm">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: accent }}>
          <Filter className="h-4 w-4" />
          Filters
          {active > 0 && (
            <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold text-white" style={{ background: accent }}>
              {active}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {typeof matchCount === "number" && typeof totalCount === "number" && (
            <span className="text-[11px] text-muted-foreground">
              {matchCount} of {totalCount} records
            </span>
          )}
          {active > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-muted-foreground"
              onClick={() => onChange({ lga: "", facility: "", supervisor: "" })}
            >
              <X className="mr-1 h-3.5 w-3.5" />
              Clear
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">LGA</Label>
          <Select
            value={values.lga || "__all__"}
            onValueChange={(v) => onChange({ ...values, lga: v === "__all__" ? "" : v })}
          >
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder="All LGAs" />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              <SelectItem value="__all__">All LGAs</SelectItem>
              {lgas.map((l) => (
                <SelectItem key={l} value={l}>
                  {l}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">{facilityLabel}</Label>
          <Input
            className="h-9 text-sm"
            list="scope-facility-options"
            placeholder="Type any part of the name…"
            value={values.facility}
            onChange={(e) => onChange({ ...values, facility: e.target.value })}
          />
          <datalist id="scope-facility-options">
            {facilitySuggestions.map((f) => (
              <option key={f} value={f} />
            ))}
          </datalist>
        </div>

        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">Supervisor name</Label>
          <Input
            className="h-9 text-sm"
            list="scope-supervisor-options"
            placeholder="Type any part of the name…"
            value={values.supervisor}
            onChange={(e) => onChange({ ...values, supervisor: e.target.value })}
          />
          <datalist id="scope-supervisor-options">
            {supervisorSuggestions.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </div>
      </div>
    </div>
  );
};

export default DashboardScopeFilters;

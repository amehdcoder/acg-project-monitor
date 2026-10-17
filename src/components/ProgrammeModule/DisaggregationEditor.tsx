// Response-based disaggregation entry for the Programme Report.
// Each dimension starts as a compact chip; tapping it opens a focused panel
// with the standard options for that dimension (Sex, NTD / standard age
// bands, disease conditions, disability types, stakeholder types) or a
// State → LGA → Ward cascade for location. Values are stored as JSON maps
// inside the report entry's disaggregation object.

import { useMemo, useState } from "react";
import { ChevronDown, MapPin, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { GeoCombobox } from "./GeoCascadeFields";
import { getAllStates, getLGAsForState, getWardsForLGA } from "@/lib/nigeriaAdminData";
import {
  dimensionFor, parseDisaggCell, serializeDisaggCell, summarizeDisaggCell,
  type DisaggDimension,
} from "@/lib/programmeModule/disaggregationCatalog";

interface Props {
  labels: string[];
  values: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
  idPrefix: string;
}

const LocationPanel = ({ dim, raw, onChange, idPrefix }: { dim: DisaggDimension; raw: string; onChange: (v: string) => void; idPrefix: string }) => {
  const level = dim.level || "ward";
  const parsed = useMemo(() => {
    const m = parseDisaggCell(raw);
    const first = Object.entries(m)[0];
    return first ? { key: first[0], value: String(first[1]) } : { key: "", value: "" };
  }, [raw]);
  const parts = parsed.key.split("|");
  const state = parts[0] || "";
  const lga = parts[1] || "";
  const ward = parts[2] || "";

  const emit = (s: string, l: string, w: string, val: string) => {
    const key = [s, level !== "state" && l, level === "ward" && w].filter(Boolean).join("|") as string;
    onChange(serializeDisaggCell(key ? { [key]: Number(val) || 0 } : {}));
  };

  const states = useMemo(() => getAllStates(), []);
  const lgas = useMemo(() => (state ? getLGAsForState(state) : []), [state]);
  const wards = useMemo(() => (state && lga ? getWardsForLGA(state, lga) : []), [state, lga]);

  return (
    <div className="space-y-3">
      {dim.hint && <p className="text-xs text-muted-foreground">{dim.hint}</p>}
      <div className={cn("grid gap-3", level === "ward" ? "sm:grid-cols-3" : level === "lga" ? "sm:grid-cols-2" : "sm:grid-cols-1")}>
        <GeoCombobox label="State" value={state} options={states} onSelect={(v) => emit(v, "", "", parsed.value)} />
        {level !== "state" && (
          <GeoCombobox label="LGA" value={lga} options={lgas} disabled={!state}
            placeholder={state ? "Select LGA" : "Pick a state first"}
            onSelect={(v) => emit(state, v, "", parsed.value)} />
        )}
        {level === "ward" && (
          <GeoCombobox label="Ward" value={ward} options={wards} disabled={!lga}
            placeholder={lga ? "Select ward" : "Pick an LGA first"}
            onSelect={(v) => emit(state, lga, v, parsed.value)} />
        )}
      </div>
      {parsed.key && (
        <div>
          <Label htmlFor={`${idPrefix}-loc-value`} className="text-xs text-muted-foreground">
            Value for {parsed.key.split("|").filter(Boolean).join(" → ")}
          </Label>
          <Input
            id={`${idPrefix}-loc-value`} type="number" value={parsed.value}
            onChange={(e) => emit(state, lga, ward, e.target.value)}
            className="mt-1 h-11 w-40 tabular-nums"
          />
        </div>
      )}
    </div>
  );
};

const OptionsPanel = ({ dim, raw, onChange, idPrefix }: { dim: DisaggDimension; raw: string; onChange: (v: string) => void; idPrefix: string }) => {
  const map = parseDisaggCell(raw);
  const [other, setOther] = useState("");
  const setOpt = (opt: string, val: string) => {
    const next = { ...map };
    const n = Number(val);
    if (!val || !Number.isFinite(n) || n === 0) delete next[opt]; else next[opt] = n;
    onChange(serializeDisaggCell(next));
  };

  return (
    <div className="space-y-3">
      {dim.hint && <p className="text-xs text-muted-foreground">{dim.hint}</p>}
      {(dim.groups || []).map((g) => (
        <div key={g.title}>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{g.title}</p>
          <div className="mt-1.5 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {g.options.map((opt) => (
              <div key={opt} className="flex items-center gap-2 rounded-lg border border-border bg-background px-2.5 py-1.5">
                <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground" title={opt}>{opt}</span>
                <Input
                  id={`${idPrefix}-${dim.key}-${opt}`} type="number" inputMode="numeric"
                  aria-label={`${dim.label} — ${opt}`}
                  value={map[opt] ?? ""} onChange={(e) => setOpt(opt, e.target.value)}
                  className="h-9 w-20 shrink-0 text-right tabular-nums"
                />
              </div>
            ))}
          </div>
        </div>
      ))}
      {dim.allowOther && (
        <div className="flex items-center gap-2">
          <Input
            id={`${idPrefix}-${dim.key}-other`} value={other} onChange={(e) => setOther(e.target.value)}
            placeholder="Other (type a label)…" className="h-10 flex-1 text-sm"
          />
          <Button
            type="button" variant="outline" size="sm" className="h-10"
            disabled={other.trim().length < 2}
            onClick={() => { setOpt(other.trim(), String(map[other.trim()] ?? 1)); setOther(""); }}
          >
            <Plus className="mr-1 h-3.5 w-3.5" /> Add
          </Button>
        </div>
      )}
      {Object.keys(map).length > 0 && (
        <p className="text-xs text-muted-foreground">
          Entered: {Object.entries(map).map(([k, v]) => `${k} ${v}`).join(" · ")}
        </p>
      )}
    </div>
  );
};

const DisaggregationEditor = ({ labels, values, onChange, idPrefix }: Props) => {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const dims = useMemo(() => labels.map((l) => dimensionFor(l)), [labels]);

  return (
    <div>
      <Label className="text-[11px] uppercase text-muted-foreground">Disaggregation</Label>
      <div className="mt-2 flex flex-wrap gap-2">
        {dims.map((dim) => {
          const raw = values[dim.label] ?? "";
          const summary = summarizeDisaggCell(raw);
          const open = openKey === dim.key;
          return (
            <button
              key={dim.key} type="button"
              onClick={() => setOpenKey(open ? null : dim.key)}
              className={cn(
                "inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors",
                open ? "border-health-teal bg-health-teal/10 text-health-teal"
                  : summary ? "border-health-blue/40 bg-health-blue/5 text-health-blue"
                  : "border-border bg-background text-muted-foreground hover:border-health-teal/50",
              )}
            >
              {dim.kind === "location" && <MapPin className="h-3 w-3" />}
              {dim.label}
              {summary && <span className="text-[10px] opacity-80">· {summary}</span>}
              <ChevronDown className={cn("h-3 w-3 transition-transform", open && "rotate-180")} />
            </button>
          );
        })}
      </div>
      {dims.map((dim) => openKey === dim.key && (
        <div key={dim.key} className="mt-3 rounded-xl border border-health-teal/25 bg-health-teal/5 p-4">
          {dim.kind === "location" ? (
            <LocationPanel
              dim={dim} raw={values[dim.label] ?? ""} idPrefix={`${idPrefix}-${dim.key}`}
              onChange={(v) => onChange({ ...values, [dim.label]: v })}
            />
          ) : (
            <OptionsPanel
              dim={dim} raw={values[dim.label] ?? ""} idPrefix={`${idPrefix}-${dim.key}`}
              onChange={(v) => onChange({ ...values, [dim.label]: v })}
            />
          )}
        </div>
      ))}
    </div>
  );
};

export default DisaggregationEditor;

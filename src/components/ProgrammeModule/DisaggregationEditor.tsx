// Response-based disaggregation entry for the Programme Report.
// Each dimension starts as a compact chip; tapping it opens a focused panel
// with the standard options for that dimension (Sex, NTD / standard age
// bands, disease conditions, disability types, stakeholder types) or a
// State → LGA → Ward cascade for location. Values are stored as JSON maps
// inside the report entry's disaggregation object.

import { useMemo, useState } from "react";
import { ChevronDown, MapPin, Plus, X } from "lucide-react";
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
  config?: import("@/lib/programmeModule/logframe").LogframeDisaggregation[];
}

const LocationPanel = ({ dim, raw, onChange, idPrefix }: { dim: DisaggDimension; raw: string; onChange: (v: string) => void; idPrefix: string }) => {
  const level = dim.level || "ward";
  const map = parseDisaggCell(raw);
  const [pickState, setPickState] = useState("");
  const [pickLga, setPickLga] = useState("");
  const [pickWard, setPickWard] = useState("");

  const states = useMemo(() => getAllStates(), []);
  const lgas = useMemo(() => (pickState ? getLGAsForState(pickState) : []), [pickState]);
  const wards = useMemo(() => (pickState && pickLga ? getWardsForLGA(pickState, pickLga) : []), [pickState, pickLga]);

  const emit = (next: Record<string, number>) => onChange(serializeDisaggCell(next));

  const pendingKey = [pickState, level !== "state" && pickLga, level === "ward" && pickWard].filter(Boolean).join("|");
  const ready = level === "state" ? !!pickState : level === "lga" ? !!(pickState && pickLga) : !!(pickState && pickLga && pickWard);

  const addLocation = () => {
    if (!ready || pendingKey in map) return;
    emit({ ...map, [pendingKey]: 0 });
    setPickState(""); setPickLga(""); setPickWard("");
  };

  const setValue = (key: string, val: string) => {
    const n = Number(val);
    const next = { ...map };
    if (!val || !Number.isFinite(n)) next[key] = 0; else next[key] = n;
    emit(next);
  };

  const removeLocation = (key: string) => {
    const next = { ...map };
    delete next[key];
    emit(next);
  };

  const entries = Object.entries(map);

  return (
    <div className="space-y-4">
      {dim.hint && <p className="text-xs text-muted-foreground">{dim.hint}</p>}

      {entries.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2">
          {entries.map(([key, val]) => (
            <div key={key} className="flex items-center gap-2 rounded-xl border border-health-blue/25 bg-card px-3 py-2 shadow-soft">
              <MapPin className="h-4 w-4 shrink-0 text-health-blue" />
              <span className="min-w-0 flex-1 truncate text-xs font-semibold text-health-ink" title={key.split("|").join(" → ")}>
                {key.split("|").join(" → ")}
              </span>
              <Input
                id={`${idPrefix}-loc-${key}`} type="number" inputMode="numeric"
                aria-label={`Value for ${key.split("|").join(", ")}`}
                value={val === 0 ? "" : String(val)} placeholder="0"
                onChange={(e) => setValue(key, e.target.value)}
                className="h-9 w-24 shrink-0 text-right tabular-nums"
              />
              <button type="button" onClick={() => removeLocation(key)} aria-label={`Remove ${key.split("|").join(", ")}`}
                className="shrink-0 rounded-full p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-xl border border-dashed border-health-teal/40 bg-health-teal/5 p-3">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-health-teal">
          {entries.length === 0 ? "Add a location" : "Add another location"}
        </p>
        <div className={cn("grid gap-2", level === "ward" ? "sm:grid-cols-3" : level === "lga" ? "sm:grid-cols-2" : "sm:grid-cols-1")}>
          <GeoCombobox label="State" value={pickState} options={states}
            onSelect={(v) => { setPickState(v); setPickLga(""); setPickWard(""); }} />
          {level !== "state" && (
            <GeoCombobox label="LGA" value={pickLga} options={lgas} disabled={!pickState}
              placeholder={pickState ? "Select LGA" : "Pick a state first"}
              onSelect={(v) => { setPickLga(v); setPickWard(""); }} />
          )}
          {level === "ward" && (
            <GeoCombobox label="Ward" value={pickWard} options={wards} disabled={!pickLga}
              placeholder={pickLga ? "Select ward" : "Pick an LGA first"}
              onSelect={setPickWard} />
          )}
        </div>
        <Button type="button" size="sm" className="mt-3 gap-1.5" disabled={!ready || pendingKey in map} onClick={addLocation}>
          <Plus className="h-3.5 w-3.5" />
          {pendingKey in map ? "Already added" : ready ? `Add ${pendingKey.split("|").join(" → ")}` : "Select a location"}
        </Button>
      </div>
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

const DisaggregationEditor = ({ labels, values, onChange, idPrefix, config }: Props) => {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const dims = useMemo(() => labels.map((l) => dimensionFor(l, config)), [labels, config]);

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

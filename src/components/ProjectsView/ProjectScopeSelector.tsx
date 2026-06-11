import { useMemo, useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MapPin, Search, Globe } from "lucide-react";
import { getAllStates, getLGAsForState, getWardsForLGA } from "@/lib/nigeriaAdminData";
import {
  lgaScopeKey,
  wardScopeKey,
  type ProjectScope,
} from "@/lib/projectScope";

interface Props {
  value: ProjectScope;
  onChange: (next: ProjectScope) => void;
}

const colClass = "rounded-md border border-border bg-card p-2 space-y-1.5";

/**
 * Cascading multi-select for a project's geographic scope.
 * Pick all / some / one State → LGA → Ward. Empty at any level = no restriction.
 */
const ProjectScopeSelector = ({ value, onChange }: Props) => {
  const [stateSearch, setStateSearch] = useState("");
  const [lgaSearch, setLgaSearch] = useState("");
  const [wardSearch, setWardSearch] = useState("");

  const allStates = useMemo(() => getAllStates(), []);

  const selectedStates = value.states;
  const selectedStatesSet = useMemo(() => new Set(selectedStates), [selectedStates]);
  const selectedLgasSet = useMemo(() => new Set(value.lgas), [value.lgas]);
  const selectedWardsSet = useMemo(() => new Set(value.wards), [value.wards]);

  // Which states drive the LGA column: explicitly chosen states (or none → empty,
  // meaning "all states", so we don't flood the LGA list with the whole country).
  const lgaSourceStates = selectedStates;
  const wardSourceLgas = value.lgas; // composite keys

  const filteredStates = allStates.filter((s) =>
    s.toLowerCase().includes(stateSearch.toLowerCase()),
  );

  const lgaRows = useMemo(() => {
    const rows: { state: string; lga: string; key: string }[] = [];
    lgaSourceStates.forEach((st) => {
      getLGAsForState(st).forEach((lga) => {
        rows.push({ state: st, lga, key: lgaScopeKey(st, lga) });
      });
    });
    return rows.filter((r) =>
      `${r.state} ${r.lga}`.toLowerCase().includes(lgaSearch.toLowerCase()),
    );
  }, [lgaSourceStates, lgaSearch]);

  const wardRows = useMemo(() => {
    const rows: { state: string; lga: string; ward: string; key: string }[] = [];
    wardSourceLgas.forEach((composite) => {
      const [st, lga] = composite.split("|");
      if (!st || !lga) return;
      getWardsForLGA(st, lga).forEach((ward) => {
        rows.push({ state: st, lga, ward, key: wardScopeKey(st, lga, ward) });
      });
    });
    return rows.filter((r) =>
      `${r.lga} ${r.ward}`.toLowerCase().includes(wardSearch.toLowerCase()),
    );
  }, [wardSourceLgas, wardSearch]);

  const toggleState = (st: string) => {
    if (selectedStatesSet.has(st)) {
      onChange({
        states: selectedStates.filter((s) => s !== st),
        lgas: value.lgas.filter((k) => !k.startsWith(`${st}|`)),
        wards: value.wards.filter((k) => !k.startsWith(`${st}|`)),
      });
    } else {
      onChange({ ...value, states: [...selectedStates, st] });
    }
  };

  const toggleLga = (st: string, lga: string) => {
    const key = lgaScopeKey(st, lga);
    if (selectedLgasSet.has(key)) {
      onChange({
        ...value,
        lgas: value.lgas.filter((k) => k !== key),
        wards: value.wards.filter((k) => !k.startsWith(`${key}|`)),
      });
    } else {
      onChange({ ...value, lgas: [...value.lgas, key] });
    }
  };

  const toggleWard = (st: string, lga: string, ward: string) => {
    const key = wardScopeKey(st, lga, ward);
    if (selectedWardsSet.has(key)) {
      onChange({ ...value, wards: value.wards.filter((k) => k !== key) });
    } else {
      onChange({ ...value, wards: [...value.wards, key] });
    }
  };

  const clearAll = () => onChange({ states: [], lgas: [], wards: [] });

  const summary = (() => {
    if (selectedStates.length === 0) return "Whole country (all states)";
    const parts = [`${selectedStates.length} state${selectedStates.length > 1 ? "s" : ""}`];
    if (value.lgas.length) parts.push(`${value.lgas.length} LGA${value.lgas.length > 1 ? "s" : ""}`);
    else parts.push("all LGAs");
    if (value.wards.length) parts.push(`${value.wards.length} ward${value.wards.length > 1 ? "s" : ""}`);
    else parts.push("all wards");
    return parts.join(" · ");
  })();

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <Badge variant="secondary" className="gap-1 font-normal">
          {selectedStates.length === 0 ? <Globe className="h-3 w-3" /> : <MapPin className="h-3 w-3" />}
          {summary}
        </Badge>
        {(selectedStates.length > 0 || value.lgas.length > 0 || value.wards.length > 0) && (
          <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={clearAll}>
            Reset (all)
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        {/* States */}
        <div className={colClass}>
          <p className="text-xs font-semibold text-muted-foreground px-1">States</p>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
            <Input value={stateSearch} onChange={(e) => setStateSearch(e.target.value)} placeholder="Search states" className="h-7 pl-7 text-xs" />
          </div>
          <ScrollArea className="h-44 pr-2">
            <div className="space-y-0.5">
              {filteredStates.map((st) => (
                <label key={st} className="flex items-center gap-2 px-1 py-1 rounded hover:bg-muted/50 cursor-pointer text-xs">
                  <Checkbox checked={selectedStatesSet.has(st)} onCheckedChange={() => toggleState(st)} />
                  <span>{st}</span>
                </label>
              ))}
            </div>
          </ScrollArea>
        </div>

        {/* LGAs */}
        <div className={colClass}>
          <p className="text-xs font-semibold text-muted-foreground px-1">LGAs {selectedStates.length === 0 && <span className="font-normal">(pick states first)</span>}</p>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
            <Input value={lgaSearch} onChange={(e) => setLgaSearch(e.target.value)} placeholder="Search LGAs" className="h-7 pl-7 text-xs" disabled={selectedStates.length === 0} />
          </div>
          <ScrollArea className="h-44 pr-2">
            <div className="space-y-0.5">
              {lgaRows.length === 0 && (
                <p className="text-[11px] text-muted-foreground px-1 py-2">{selectedStates.length === 0 ? "All LGAs included." : "No LGAs match."}</p>
              )}
              {lgaRows.map((r) => (
                <label key={r.key} className="flex items-center gap-2 px-1 py-1 rounded hover:bg-muted/50 cursor-pointer text-xs">
                  <Checkbox checked={selectedLgasSet.has(r.key)} onCheckedChange={() => toggleLga(r.state, r.lga)} />
                  <span>{r.lga} <span className="text-muted-foreground">· {r.state}</span></span>
                </label>
              ))}
            </div>
          </ScrollArea>
        </div>

        {/* Wards */}
        <div className={colClass}>
          <p className="text-xs font-semibold text-muted-foreground px-1">Wards {value.lgas.length === 0 && <span className="font-normal">(pick LGAs first)</span>}</p>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
            <Input value={wardSearch} onChange={(e) => setWardSearch(e.target.value)} placeholder="Search wards" className="h-7 pl-7 text-xs" disabled={value.lgas.length === 0} />
          </div>
          <ScrollArea className="h-44 pr-2">
            <div className="space-y-0.5">
              {wardRows.length === 0 && (
                <p className="text-[11px] text-muted-foreground px-1 py-2">{value.lgas.length === 0 ? "All wards included." : "No wards match."}</p>
              )}
              {wardRows.map((r) => (
                <label key={r.key} className="flex items-center gap-2 px-1 py-1 rounded hover:bg-muted/50 cursor-pointer text-xs">
                  <Checkbox checked={selectedWardsSet.has(r.key)} onCheckedChange={() => toggleWard(r.state, r.lga, r.ward)} />
                  <span>{r.ward} <span className="text-muted-foreground">· {r.lga}</span></span>
                </label>
              ))}
            </div>
          </ScrollArea>
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Leave a level empty to include everything below it. This scope controls what assigned users see in the
        Geo Microplanning cascade and filters MDA checklists, treatment summaries/registers and dashboards built from microplanning data.
      </p>
    </div>
  );
};

export default ProjectScopeSelector;

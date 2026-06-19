/**
 * MDA Location Cascade
 * ────────────────────────────────────────────────────────────────────────
 * Drives the *location* fields of the Integrated MDA Supervisory Checklist
 * directly from the populated **microplanning data** (microplan_entries).
 *
 * Rules (per product spec):
 *   • Cascade is State → LGA → Ward → FLHF → Community → Settlement.
 *   • Only geography that actually exists in the microplan for the user's
 *     scope appears in each dropdown. e.g. if 10,000 communities were
 *     captured under State A / LGA A / Ward A / FLHF A, only those show.
 *   • The fields are NOT free-text editable — the supervisor must pick from
 *     the microplan, which guarantees clean joins to coverage data.
 *   • Provision: a community/settlement that received MDA medicine but was
 *     NOT captured in the microplan can still be added via an explicit
 *     "Not in microplan" switch. Those entries are flagged so the gap
 *     analysis can reconcile them later.
 *
 * The component is a controlled bridge: it reads/writes the FormFiller
 * `responses` object. For each geography level it writes BOTH the matching
 * question id (so ODK validation/submission works) AND the canonical
 * microplan field name (so the Supervisory Gap dashboard can read it by
 * name). FLHF/Settlement, which may not have a dedicated question, are still
 * persisted under their canonical names.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/fetchAllRows";
import { fetchProjectScope, EMPTY_SCOPE } from "@/lib/projectScope";
import { useMicroplanScope } from "@/hooks/useMicroplanScope";
import { useAuth } from "@/hooks/useAuth";
import { getAllStates, getLGAsForState, getWardsForLGA } from "@/lib/nigeriaAdminData";
import LocationCombobox from "@/components/MdaChecklist/LocationCombobox";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  MapPinned, Lock, PlusCircle, Loader2, Info, CheckCircle2,
} from "lucide-react";

interface GeoRow {
  state: string | null;
  lga: string | null;
  ward: string | null;
  flhf_name: string | null;
  community_name: string | null;
  settlement_name: string | null;
}

interface Props {
  projectId: string;
  responses: Record<string, any>;
  /** name → question id map (mdaNameToId from FormFiller) */
  nameToId: Record<string, string>;
  /** merge updates into FormFiller responses */
  onSet: (updates: Record<string, any>) => void;
  /**
   * Optional list of states the admin who created this form restricted the
   * checklist to. When set, ONLY microplan geography in these states is
   * selectable, and the off-microplan State picker is limited to them too.
   */
  stateScope?: string[];
}

// Maps a cascade level to the FormFiller question `name` it should populate.
const QUESTION_NAME: Record<keyof GeoRow, string> = {
  state: "state",
  lga: "lga",
  ward: "ward",
  flhf_name: "flhf_name",
  community_name: "community", // MDA checklist question is named "community"
  settlement_name: "settlement_name",
};

const LEVELS: { key: keyof GeoRow; label: string; optional?: boolean }[] = [
  { key: "state", label: "State" },
  { key: "lga", label: "LGA" },
  { key: "ward", label: "Ward" },
  { key: "flhf_name", label: "Front-Line Health Facility (FLHF)" },
  { key: "community_name", label: "Community" },
  { key: "settlement_name", label: "Settlement", optional: true },
];

const normGeo = (value: string | null | undefined) =>
  String(value || "").trim().replace(/\s+/g, " ").toLowerCase();

const sameGeo = (a: string | null | undefined, b: string | null | undefined) =>
  normGeo(a) === normGeo(b);

const canonicalStateName = (value: string | null | undefined) => {
  const raw = String(value || "").trim().replace(/\s+/g, " ");
  if (!raw) return "";
  return getAllStates().find((s) => sameGeo(s, raw)) || raw;
};

const canonicalLgaName = (state: string, value: string | null | undefined) => {
  const raw = String(value || "").trim().replace(/\s+/g, " ");
  if (!raw) return "";
  return getLGAsForState(canonicalStateName(state)).find((l) => sameGeo(l, raw)) || raw;
};

const canonicalWardName = (state: string, lga: string, value: string | null | undefined) => {
  const raw = String(value || "").trim().replace(/\s+/g, " ");
  if (!raw) return "";
  const st = canonicalStateName(state);
  const lg = canonicalLgaName(st, lga);
  return getWardsForLGA(st, lg).find((w) => sameGeo(w, raw)) || raw;
};

const uniqueSorted = (values: string[]) =>
  Array.from(new Map(values.map((v) => [normGeo(v), v.trim().replace(/\s+/g, " ")])).values())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));




export default function MdaLocationCascade({ projectId, responses, nameToId, onSet, stateScope }: Props) {
  const { isOwner, isAdmin } = useAuth();
  const scope = useMicroplanScope(isOwner || isAdmin);

  const [rows, setRows] = useState<GeoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [notInMicroplan, setNotInMicroplan] = useState(false);
  // States the project was designed for (from project scope) — used as the
  // cascade fallback when no microplan is linked to the project.
  const [projectStates, setProjectStates] = useState<string[]>([]);
  // Guarantees the single-state auto-select runs at most once and can never
  // clobber a selection the supervisor has already made.
  const didAutoselectRef = useRef(false);

  // Stable key for the (optional) admin-defined state scope so the loader effect
  // only re-runs when its contents actually change (not on every render).
  const stateScopeKey = useMemo(() => (stateScope ?? []).join("|"), [stateScope]);

  // ── Resolve scope + load microplan geography in ONE pass ──────────────
  // The MDA checklist often lives in a *different* project than the one used
  // for Geo Microplanning, so we never tie the cascade to the form's project_id.
  // Instead we:
  //   1) resolve the project's designed state scope,
  //   2) load ONLY the microplan rows for the in-scope state(s) — so the query
  //      stays fast no matter how large microplan_entries gets, and the
  //      "microplan empty?" decision is correct on the very first settle (no
  //      microplan→admin-hierarchy flicker that previously dropped selections).
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    (async () => {
      setLoading(true);
      try {
        const pScope = projectId ? await fetchProjectScope(projectId) : { ...EMPTY_SCOPE };
        const pStates = pScope.states || [];
        if (!cancelled) setProjectStates(pStates);

        // Admin form scope wins, otherwise the project's designed states.
        const rawScopeStates = (stateScope && stateScope.length > 0) ? stateScope : pStates;
        const scopeStates = uniqueSorted(rawScopeStates.flatMap((s) => {
          const raw = String(s || "").trim();
          const canonical = canonicalStateName(raw);
          return [raw, canonical, raw.toLowerCase(), raw.toUpperCase()].filter(Boolean);
        }));

        const buildQuery = (from: number, to: number) => {
          let q = supabase
            .from("microplan_entries")
            .select("state, lga, ward, flhf_name, community_name, settlement_name");
          if (scopeStates.length > 0) q = q.in("state", scopeStates);
          return q.range(from, to).abortSignal(controller.signal);
        };

        const data = await fetchAllRows<GeoRow>(buildQuery);
        if (!cancelled) setRows(data || []);
      } catch {
        if (!cancelled) setRows([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; controller.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, stateScopeKey]);

  // The state restriction used for BOTH the microplan filter and the off-microplan
  // / no-microplan cascade: the admin-defined form state scope takes priority,
  // otherwise the state(s) the project itself was designed for. Empty → all states.
  const effectiveScopeList = useMemo(
    () => ((stateScope && stateScope.length > 0) ? stateScope : projectStates).map(canonicalStateName).filter(Boolean),
    [stateScope, projectStates],
  );
  const allowedStates = useMemo(
    () => new Set(effectiveScopeList.map((s) => s.trim()).filter(Boolean)),
    [effectiveScopeList],
  );
  const hasStateScope = allowedStates.size > 0;

  // Scope-filtered rows (FLHF supervisors / enumerators only see their areas),
  // further narrowed to the admin-defined state scope for this form.
  const scopedRows = useMemo(() => {
    if (scope.loading) return [];
    const base = scope.hasNoRestriction
      ? rows
      : rows.filter((r) =>
          scope.isInScope({
            state: r.state, lga: r.lga, ward: r.ward,
            flhf_name: r.flhf_name, community_name: r.community_name,
            settlement_name: r.settlement_name,
          }),
        );
    if (!hasStateScope) return base;
    return base.filter((r) => r.state && allowedStates.has(canonicalStateName(r.state)));
  }, [rows, scope, hasStateScope, allowedStates]);

  // ── Current selection (read from responses by question id) ────────────
  const getVal = (key: keyof GeoRow): string => {
    const qName = QUESTION_NAME[key];
    const id = nameToId[qName];
    const idValue = id ? responses[id] : undefined;
    const v = idValue !== undefined && idValue !== null && idValue !== "" ? idValue : (responses[key] ?? responses[qName]);
    return typeof v === "string" ? v : "";
  };
  const sel = {
    state: getVal("state"),
    lga: getVal("lga"),
    ward: getVal("ward"),
    flhf_name: getVal("flhf_name"),
    community_name: getVal("community_name"),
    settlement_name: getVal("settlement_name"),
  };

  // ── Memoised microplan option index ───────────────────────────────────
  // Instead of re-filtering the (potentially huge) scopedRows array once per
  // level on every render, we build ALL six levels' option sets in a SINGLE
  // pass, memoised on the data + the upstream selections. This keeps the
  // cascade responsive no matter how many microplan rows exist.
  const microplanOptionMap = useMemo(() => {
    const sets: Record<keyof GeoRow, Set<string>> = {
      state: new Set(), lga: new Set(), ward: new Set(),
      flhf_name: new Set(), community_name: new Set(), settlement_name: new Set(),
    };
    for (let i = 0; i < scopedRows.length; i++) {
      const r = scopedRows[i];
      const rowState = canonicalStateName(r.state);
      const rowLga = canonicalLgaName(rowState, r.lga);
      const rowWard = canonicalWardName(rowState, rowLga, r.ward);
      if (rowState) sets.state.add(rowState);
      if (sel.state && !sameGeo(rowState, sel.state)) continue;
      if (rowLga) sets.lga.add(rowLga);
      if (sel.lga && !sameGeo(rowLga, sel.lga)) continue;
      if (rowWard) sets.ward.add(rowWard);
      if (sel.ward && !sameGeo(rowWard, sel.ward)) continue;
      if (r.flhf_name) sets.flhf_name.add(r.flhf_name);
      if (sel.flhf_name && r.flhf_name !== sel.flhf_name) continue;
      if (r.community_name) sets.community_name.add(r.community_name);
      if (sel.community_name && r.community_name !== sel.community_name) continue;
      if (r.settlement_name) sets.settlement_name.add(r.settlement_name);
    }
    const out = {} as Record<keyof GeoRow, string[]>;
    (Object.keys(sets) as (keyof GeoRow)[]).forEach((k) => {
      out[k] = Array.from(sets[k]).filter((v) => v && v.trim() !== "").sort((a, b) => a.localeCompare(b));
    });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopedRows, sel.state, sel.lga, sel.ward, sel.flhf_name, sel.community_name]);

  // State → LGA → Ward options derived from the full Nigerian administrative
  // hierarchy, bounded by the project's designed state scope.
  const adminOptions = (level: keyof GeoRow): string[] => {
    if (level === "state") {
      const all = getAllStates();
      return hasStateScope ? all.filter((s) => allowedStates.has(s)) : all;
    }
    if (level === "lga") return sel.state ? getLGAsForState(canonicalStateName(sel.state)) : [];
    if (level === "ward") return sel.state && sel.lga ? getWardsForLGA(canonicalStateName(sel.state), canonicalLgaName(sel.state, sel.lga)) : [];
    return [];
  };

  // True when a geo level resolves to the admin hierarchy (State/LGA/Ward only).
  const isGeoLevel = (level: keyof GeoRow) =>
    level === "state" || level === "lga" || level === "ward";

  // Microplan-only options for a level given current upstream selections.
  const microplanOptions = (level: keyof GeoRow): string[] => microplanOptionMap[level] ?? [];

  const options = (level: keyof GeoRow): string[] => {
    // Off-microplan / no-microplan path: State → LGA → Ward come from the full
    // Nigerian administrative hierarchy.
    if (useAdminHierarchy) {
      if (isGeoLevel(level)) return adminOptions(level);
      // FLHF / community / settlement are entered as free text below.
      return [];
    }
    // Microplan-driven path. If the microplan captured values for this level,
    // use them. Otherwise — to guarantee the cascade NEVER dead-ends (e.g. the
    // microplan covers some LGAs but not the one chosen, or wards were never
    // captured) — fall back to the full admin hierarchy for State/LGA/Ward.
    const mp = microplanOptions(level);
    if (mp.length > 0) return mp;
    if (isGeoLevel(level)) return adminOptions(level);
    return [];
  };

  // ── Write a level + clear downstream selections ───────────────────────
  const setLevel = (level: keyof GeoRow, value: string) => {
    const order: (keyof GeoRow)[] = ["state", "lga", "ward", "flhf_name", "community_name", "settlement_name"];
    const startIdx = order.indexOf(level);
    const updates: Record<string, any> = {};
    const canonicalValue =
      level === "state" ? canonicalStateName(value)
      : level === "lga" ? canonicalLgaName(sel.state, value)
      : level === "ward" ? canonicalWardName(sel.state, sel.lga, value)
      : value;
    order.slice(startIdx).forEach((k, i) => {
      const v = i === 0 ? canonicalValue : "";
      const qName = QUESTION_NAME[k];
      const id = nameToId[qName];
      if (id) updates[id] = v;
      updates[qName] = v;     // canonical question name
      updates[k] = v;         // canonical microplan field name
    });
    onSet(updates);
  };

  // Free-text writer for the "not in microplan" path (FLHF / community / settlement).
  const setFreeText = (level: "flhf_name" | "community_name" | "settlement_name", value: string) => {
    const qName = QUESTION_NAME[level];
    const id = nameToId[qName];
    const updates: Record<string, any> = { [qName]: value, [level]: value };
    if (id) updates[id] = value;
    onSet(updates);
  };

  const toggleNotInMicroplan = (on: boolean) => {
    setNotInMicroplan(on);
    onSet({
      community_not_in_microplan: on,
      received_medicine_not_microplanned: on,
    });
    if (on) {
      // clear any microplan-picked FLHF/community/settlement so the user types fresh
      setFreeText("flhf_name", "");
      setFreeText("community_name", "");
      setFreeText("settlement_name", "");
    } else {
      // clear free-text so the user re-picks from microplan
      setFreeText("flhf_name", "");
      setFreeText("community_name", "");
      setFreeText("settlement_name", "");
    }
  };

  const microplanIsEmpty = !loading && !scope.loading && scopedRows.length === 0;

  // Use the full Nigerian administrative hierarchy cascade when the supervisor
  // explicitly flags an off-microplan community OR when the project simply has
  // no microplan linked yet. This guarantees the cascade always works.
  const useAdminHierarchy = notInMicroplan || microplanIsEmpty;

  // When falling back to the admin hierarchy and the project was designed for a
  // single state, preselect it so the supervisor goes straight to LGA.
  // Runs at most once (didAutoselectRef) and only when nothing is selected yet,
  // so it can NEVER reset an LGA/Ward the supervisor has already chosen.
  useEffect(() => {
    if (loading || scope.loading) return;
    if (!useAdminHierarchy) return;
    if (didAutoselectRef.current) return;
    if (sel.state) { didAutoselectRef.current = true; return; }
    const list = Array.from(allowedStates);
    if (list.length === 1) {
      didAutoselectRef.current = true;
      setLevel("state", list[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, scope.loading, useAdminHierarchy, sel.state, allowedStates.size]);

  // Gap-tolerant readiness check.
  // The microplan is frequently captured to varying depths — e.g. State→LGA→Ward
  // with no FLHF, or down to Community with no Settlement. A naive "immediate
  // parent must be selected" rule dead-ends the whole cascade the moment ONE
  // intermediate level has no microplan values, which is exactly why Ward / FLHF
  // / Community / Settlement stopped appearing after State & LGA were chosen.
  // Here a level is enabled when EVERY preceding level that actually HAS options
  // is already selected; levels with no captured values are transparently
  // skipped so they never block the levels beneath them.
  const LEVEL_ORDER: (keyof GeoRow)[] = [
    "state", "lga", "ward", "flhf_name", "community_name", "settlement_name",
  ];
  const levelReady = (key: keyof GeoRow): boolean => {
    const idx = LEVEL_ORDER.indexOf(key);
    if (idx <= 0) return true;
    if (useAdminHierarchy) {
      // Admin-hierarchy: State→LGA→Ward is a strict chain;
      // FLHF/Community/Settlement are free text gated only by Ward.
      const parent = LEVEL_ORDER[idx - 1];
      return !!sel[parent];
    }
    for (let i = 0; i < idx; i++) {
      const anc = LEVEL_ORDER[i];
      if (options(anc).length > 0 && !sel[anc]) return false;
    }
    return true;
  };

  return (
    <div className="space-y-4 rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/[0.06] to-transparent p-4 sm:p-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <MapPinned className="h-5 w-5" />
          </span>
          <div>
            <h4 className="text-sm font-bold text-foreground sm:text-base">Supervision Location</h4>
            <p className="text-xs text-muted-foreground">
              {microplanIsEmpty
                ? "No microplan linked — pick the area from the State cascade"
                : "Driven by the microplan — pick the area you are supervising"}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {hasStateScope && (
            <Badge variant="outline" className="gap-1 border-emerald-400 text-emerald-700 dark:text-emerald-300">
              <MapPinned className="h-3 w-3" />
              {Array.from(allowedStates).join(", ")}
            </Badge>
          )}
          <Badge variant="outline" className="gap-1 border-primary/40 text-primary">
            <Lock className="h-3 w-3" /> {microplanIsEmpty ? "State cascade" : "Microplan-locked"}
          </Badge>
        </div>
      </div>

      {loading || scope.loading ? (
        <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading geography…
        </div>
      ) : (
        <>
          {microplanIsEmpty && (
            <div className="flex items-start gap-3 rounded-xl border border-sky-300 bg-sky-50 p-3 text-sm text-sky-800 dark:border-sky-800 dark:bg-sky-950/30 dark:text-sky-200">
              <Info className="mt-0.5 h-4 w-4 shrink-0" />
              <p className="text-xs">
                {hasStateScope
                  ? `No microplan is linked to this project. Using the cascade for ${Array.from(allowedStates).join(", ")}.`
                  : "No microplan is linked to this project and no state was assigned. Select any Nigerian state below — the LGA and Ward will cascade from your choice."}
              </p>
            </div>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {LEVELS.map(({ key, label, optional }) => {
            const isLeafGeo =
              key === "flhf_name" || key === "community_name" || key === "settlement_name";
            // FLHF / Community / Settlement become free-text when there is no
            // microplan to pick from — either globally (admin-hierarchy mode) or
            // because the chosen upstream area has no captured microplan rows.
            // FLHF / Community / Settlement use a type-and-add combobox below.

            const opts = options(key);
            // Gap-tolerant: ready when all preceding *captured* levels are chosen,
            // skipping levels the microplan never captured so they can't dead-end.
            const parentOk = levelReady(key);

            return (
              <div key={key} className={cn("space-y-1.5", key === "settlement_name" && "sm:col-span-2")}>
                <Label className="text-xs font-semibold text-foreground">
                  {label}{!optional && <span className="ml-0.5 text-destructive">*</span>}
                </Label>

                {isLeafGeo ? (
                  // FLHF / Community / Settlement: virtualized, type-and-add
                  // combobox. Pick from the microplan OR type a value that is
                  // not in the list and add it (flagged for reconciliation).
                  <LocationCombobox
                    value={sel[key]}
                    options={opts}
                    disabled={!parentOk}
                    allowAdd
                    placeholder={
                      !parentOk
                        ? "Select the level above first"
                        : opts.length === 0
                          ? `Type to add ${label.toLowerCase()}`
                          : `Select or add ${label.toLowerCase()}`
                    }
                    emptyLabel="No microplan match — type to add"
                    onChange={(v) => {
                      const isNew = !!v && !microplanOptions(key).includes(v);
                      if (isNew) {
                        onSet({ community_not_in_microplan: true, received_medicine_not_microplanned: true });
                      }
                      setLevel(key, v);
                    }}
                  />
                ) : (
                  // State / LGA / Ward: virtualized searchable picker (no add).
                  <LocationCombobox
                    value={sel[key]}
                    options={opts}
                    disabled={!parentOk || opts.length === 0}
                    allowAdd={false}
                    placeholder={
                      !parentOk
                        ? "Select the level above first"
                        : opts.length === 0
                          ? "Not captured — skip"
                          : `Select ${label.toLowerCase()}`
                    }
                    onChange={(v) => setLevel(key, v)}
                  />
                )}
              </div>
            );
          })}
          </div>
        </>
      )}

      {/* Not-in-microplan provision (only relevant when a microplan exists) */}
      {!microplanIsEmpty && (
      <div className="flex flex-col gap-2 rounded-xl border border-dashed border-primary/40 bg-background/60 p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-2">
          <PlusCircle className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <div>
            <p className="text-sm font-semibold text-foreground">
              Community received medicine but is not in the microplan?
            </p>
            <p className="text-xs text-muted-foreground">
              Select State / LGA / Ward from the microplan, then type the FLHF,
              community &amp; settlement. It will be flagged for reconciliation.
            </p>
          </div>
        </div>
        <Switch checked={notInMicroplan} onCheckedChange={toggleNotInMicroplan} />
      </div>
      )}

      {notInMicroplan && (
        <div className="flex items-center gap-2 rounded-lg bg-primary/10 px-3 py-2 text-xs text-primary">
          <Info className="h-3.5 w-3.5" />
          This supervision will be tagged <strong>“received medicine — not microplanned”</strong>.
        </div>
      )}

      {/* Selection confirmation */}
      {sel.community_name && (
        <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">
          <CheckCircle2 className="h-3.5 w-3.5" />
          {[sel.state, sel.lga, sel.ward, sel.flhf_name, sel.community_name, sel.settlement_name]
            .filter(Boolean)
            .join(" › ")}
        </div>
      )}
    </div>
  );
}

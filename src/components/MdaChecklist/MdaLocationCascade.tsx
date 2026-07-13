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
// fetchAllRows replaced by server-side DISTINCT aggregation (microplan_distinct_geography RPC)
import { fetchProjectScope, EMPTY_SCOPE } from "@/lib/projectScope";
import { useMicroplanScope } from "@/hooks/useMicroplanScope";
import { useAuth } from "@/hooks/useAuth";
import { getAllStates, getLGAsForState, getWardsForLGA } from "@/lib/nigeriaAdminData";
import {
  getCachedStates,
  getCachedLGAsForState,
  getCachedWardsForLGA,
  refreshGeographyHierarchy,
} from "@/lib/geographyCache";
import {
  getGrid3FacilitiesWithCoords,
  getGrid3SettlementsWithCoords,
  prefetchGrid3State,
  type FacilityWithCoords,
} from "@/lib/grid3NigeriaData";
import LocationCombobox from "@/components/MdaChecklist/LocationCombobox";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  MapPinned, Lock, PlusCircle, Loader2, Info, CheckCircle2, DownloadCloud, WifiOff, RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useInstantLocation } from "@/hooks/useInstantLocation";
import LocationStatusBadge from "@/components/LocationStatusBadge";
import { toast } from "@/hooks/use-toast";

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
  /**
   * When true, the component runs as a plain State → LGA → Ward → FLHF →
   * Community → Settlement geography cascade with NO microplan sourcing,
   * toggle, or copy. Used by forms (e.g. the SARMAAN Supervisory Checklist)
   * that must not be tied to microplanning data at all.
   */
  disableMicroplan?: boolean;
  /**
   * Restrict which cascade levels are shown. When set, only these levels are
   * rendered (e.g. ["state","lga","ward"] for the SARMAAN checklist which drops
   * FLHF / Community / Settlement). Defaults to all six levels.
   */
  visibleLevels?: Array<keyof GeoRow>;
  /**
   * Levels that should NOT be marked required (no red asterisk, not enforced).
   * Merged with the built-in optional set (Settlement).
   */
  optionalLevels?: Array<keyof GeoRow>;
  /** Bigger, Kobo/CommCare-style labels & inputs for Android field use. */
  big?: boolean;
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
  String(value || "")
    .trim()
    .replace(/__/g, " ")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\s+(state|lga|local government area)$/i, "")
    .toLowerCase();

const humanizeGeoToken = (value: string | null | undefined) => {
  const raw = String(value || "").trim();
  const tail = raw.includes("__") ? raw.split("__").pop() || raw : raw;
  return tail.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
};

const sameGeo = (a: string | null | undefined, b: string | null | undefined) =>
  normGeo(a) === normGeo(b);

const STATE_ALIASES: Record<string, string> = {
  abuja: "FCT",
  fct: "FCT",
  "fct abuja": "FCT",
  "federal capital territory": "FCT",
};

const canonicalStateName = (value: string | null | undefined) => {
  const raw = humanizeGeoToken(value).replace(/\s+state$/i, "");
  if (!raw) return "";
  const alias = STATE_ALIASES[normGeo(raw)];
  if (alias) return alias;
  return getAllStates().find((s) => sameGeo(s, raw)) || raw;
};

const canonicalLgaName = (state: string, value: string | null | undefined) => {
  const raw = humanizeGeoToken(value).replace(/\s+(lga|local government area)$/i, "");
  if (!raw) return "";
  return getLGAsForState(canonicalStateName(state)).find((l) => sameGeo(l, raw)) || raw;
};

const canonicalWardName = (state: string, lga: string, value: string | null | undefined) => {
  const raw = humanizeGeoToken(value);
  if (!raw) return "";
  const st = canonicalStateName(state);
  const lg = canonicalLgaName(st, lga);
  return getWardsForLGA(st, lg).find((w) => sameGeo(w, raw)) || raw;
};

const uniqueSorted = (values: string[]) =>
  Array.from(new Map(values.map((v) => [normGeo(v), v.trim().replace(/\s+/g, " ")])).values())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));




export default function MdaLocationCascade({ projectId, responses, nameToId, onSet, stateScope, disableMicroplan, visibleLevels, optionalLevels, big }: Props) {
  const { user, isOwner, isAdmin } = useAuth();
  const scope = useMicroplanScope(isOwner || isAdmin);

  const [rows, setRows] = useState<GeoRow[]>([]);
  const [loading, setLoading] = useState(true);
  // ENABLED BY DEFAULT for every project: the checklist starts on the GRID3
  // national cascade (State→LGA→Ward→FLHF→Settlement, with settlements feeding
  // the Community field). Supervisors can turn this OFF to drive the cascade
  // from the project's own locked-in microplan data instead.
  const [notInMicroplan, setNotInMicroplan] = useState(true);
  // GRID3 cascade data (same source as the Geo Microplanning page) loaded for
  // the current State/LGA/Ward — FLHF facilities and settlements with GPS.
  const [grid3Facilities, setGrid3Facilities] = useState<FacilityWithCoords[]>([]);
  const [grid3Settlements, setGrid3Settlements] = useState<FacilityWithCoords[]>([]);
  // State → LGA → Ward come from the local, offline-first geography cache
  // (see geographyCache.ts) — pure in-memory filtering, NO network on change.
  // FLHF / Community / Settlement still use the richer GRID3 shards (GPS).
  // States the project was designed for (from project scope) — used as the
  // cascade fallback when no microplan is linked to the project.
  const [projectStates, setProjectStates] = useState<string[]>([]);
  // Guarantees the single-state auto-select runs at most once and can never
  // clobber a selection the supervisor has already made.
  const didAutoselectRef = useRef(false);

  // Offline prefetch: pull and persist the GRID3 shards for the relevant
  // states so the whole supervision cascade works instantly with no network.
  const [prefetchState, setPrefetchState] = useState<"idle" | "running" | "done">("idle");
  const [prefetchProgress, setPrefetchProgress] = useState({ done: 0, total: 0 });
  const [savedStates, setSavedStates] = useState<Set<string>>(new Set());
  const [isOffline, setIsOffline] = useState(typeof navigator !== "undefined" && !navigator.onLine);

  useEffect(() => {
    const on = () => setIsOffline(false);
    const off = () => setIsOffline(true);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

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
      // Microplan disabled: run as a pure GRID3/admin-hierarchy cascade with no
      // microplan rows loaded at all.
      if (disableMicroplan) {
        try {
          const pScope = projectId ? await fetchProjectScope(projectId) : { ...EMPTY_SCOPE };
          if (!cancelled) setProjectStates(pScope.states || []);
        } catch { /* ignore */ }
        if (!cancelled) { setRows([]); setLoading(false); }
        return;
      }
      try {
        const pScope = projectId ? await fetchProjectScope(projectId) : { ...EMPTY_SCOPE };
        const pStates = pScope.states || [];
        if (!cancelled) setProjectStates(pStates);

        // Lock the microplan geography to the project this checklist belongs to.
        // This prevents states from other projects' microplans leaking into the
        // Supervision Location picker for admins/owners.
        let accessibleProjectIds: string[] | null = projectId ? [projectId] : null;
        if (!(isOwner || isAdmin) && user?.id) {
          const { data: assignments } = await supabase
            .from("user_project_assignments")
            .select("project_id")
            .eq("user_id", user.id);
          const assignedProjectIds = Array.from(
            new Set((assignments || []).map((a) => a.project_id).filter(Boolean)),
          );
          // No assigned projects → no microplan geography to show.
          if (assignedProjectIds.length === 0 || (projectId && !assignedProjectIds.includes(projectId))) {
            if (!cancelled) { setRows([]); setLoading(false); }
            return;
          }
          accessibleProjectIds = projectId ? [projectId] : assignedProjectIds;
        }

        // Admin form scope wins, otherwise the project's designed states.
        const rawScopeStates = (stateScope && stateScope.length > 0) ? stateScope : pStates;
        const scopeStates = uniqueSorted(rawScopeStates.flatMap((s) => {
          const raw = String(s || "").trim();
          const canonical = canonicalStateName(raw);
          const slug = canonical.toLowerCase().replace(/\s+/g, "_");
          const fctAliases = canonical === "FCT"
            ? ["FCT", "Fct", "fct", "Abuja", "FCT Abuja", "Federal Capital Territory"]
            : [];
          return [raw, canonical, `${canonical} State`, raw.toLowerCase(), raw.toUpperCase(), slug, ...fctAliases].filter(Boolean);
        }));

        // Server-side DISTINCT aggregation: returns only the unique geography
        // tuples needed to build the cascade dropdowns (a tiny fraction of the
        // full microplan_entries volume). RLS still scopes per-user because the
        // function runs SECURITY INVOKER.
        const { data, error } = await (supabase.rpc as any)("microplan_distinct_geography", {
          _states: scopeStates.length > 0 ? scopeStates : null,
          _project_ids: accessibleProjectIds && accessibleProjectIds.length > 0 ? accessibleProjectIds : null,
        }).abortSignal(controller.signal);
        if (error) throw error;
        if (!cancelled) setRows((data as GeoRow[]) || []);
      } catch {
        if (!cancelled) setRows([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; controller.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, stateScopeKey, disableMicroplan]);

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
    if (typeof v !== "string") return "";
    if (key === "state") return canonicalStateName(v);
    if (key === "lga") return canonicalLgaName(getVal("state"), v);
    if (key === "ward") return canonicalWardName(getVal("state"), getVal("lga"), v);
    return v;
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

  // Distinct states that actually have microplan data captured (independent of
  // any downstream selection). Used to (a) decide whether the project has a
  // locked-in microplan and (b) restrict the State picker so ONLY states the
  // microplan was entered for can be supervised — even on the off-microplan path.
  const microplanStates = useMemo(
    () => Array.from(new Set((microplanOptionMap.state ?? []).map(canonicalStateName).filter(Boolean))),
    [microplanOptionMap.state],
  );
  const hasMicroplanData = microplanStates.length > 0;

  const microplanIsEmpty = !loading && !scope.loading && scopedRows.length === 0;

  // Use the consolidated GRID3 cascade when the supervisor explicitly flags an
  // off-microplan community OR when the project has no linked microplan yet.
  const useAdminHierarchy = disableMicroplan || notInMicroplan || microplanIsEmpty;

  // ── Local, offline-first State → LGA → Ward option lists ──────────────
  // Resolved SYNCHRONOUSLY from the geography cache (bundled INEC registry,
  // persisted in IndexedDB). Changing a parent selector filters the child list
  // entirely in-memory — no GRID3 / Supabase fetch fires on change.
  const localStates = useMemo(
    () => getCachedStates().map(canonicalStateName).filter(Boolean),
    [],
  );
  const localLgas = useMemo(
    () => (sel.state ? getCachedLGAsForState(canonicalStateName(sel.state)) : []),
    [sel.state],
  );
  const localWards = useMemo(
    () =>
      sel.state && sel.lga
        ? getCachedWardsForLGA(canonicalStateName(sel.state), canonicalLgaName(sel.state, sel.lga))
        : [],
    [sel.state, sel.lga],
  );

  // State → LGA → Ward options derived from the local geography cache,
  // bounded by the project's designed state scope and by locked microplan data.
  const grid3GeoOptions = (level: keyof GeoRow): string[] => {
    if (level === "state") {
      const all = localStates.length > 0 ? localStates : getAllStates().map(canonicalStateName);
      let list = hasStateScope ? all.filter((s) => allowedStates.has(s)) : all;
      // When the project has a locked-in microplan, ONLY states the microplan
      // was entered for may be supervised — applies to the off-microplan path too.
      if (hasMicroplanData) {
        const mpSet = new Set(microplanStates);
        list = list.filter((s) => mpSet.has(s));
      }
      return uniqueSorted(list);
    }
    if (level === "lga") return sel.state ? localLgas : [];
    if (level === "ward") return sel.state && sel.lga ? localWards : [];
    return [];
  };


  // True when a geo level resolves to the admin hierarchy (State/LGA/Ward only).
  const isGeoLevel = (level: keyof GeoRow) =>
    level === "state" || level === "lga" || level === "ward";

  // Microplan-only options for a level given current upstream selections.
  const microplanOptions = (level: keyof GeoRow): string[] => microplanOptionMap[level] ?? [];

  // GRID3 option name lists for the current selection (FLHF & settlements).
  const grid3FacilityNames = useMemo(
    () => uniqueSorted(grid3Facilities.map((f) => f.name)),
    [grid3Facilities],
  );
  const grid3SettlementNames = useMemo(
    () => uniqueSorted(grid3Settlements.map((s) => s.name)),
    [grid3Settlements],
  );
  // name → coordinates lookup so a chosen settlement (= Community) can carry its GPS.
  const grid3SettlementCoords = useMemo(() => {
    const m = new Map<string, { lat: number; lng: number }>();
    for (const s of grid3Settlements) {
      if (s.latitude != null && s.longitude != null) {
        m.set(normGeo(s.name), { lat: s.latitude, lng: s.longitude });
      }
    }
    return m;
  }, [grid3Settlements]);

  // ── Instant, environment-agnostic GPS for the supervision point ────────
  // Tier-3 fallback = geographic center of the selected Community/Settlement.
  const geoCenter = useMemo(() => {
    const g = responses.community_gps;
    if (g && Number.isFinite(g.lat) && Number.isFinite(g.lng)) {
      return { lat: g.lat as number, lng: g.lng as number };
    }
    const coords = sel.community_name ? grid3SettlementCoords.get(normGeo(sel.community_name)) : null;
    return coords ?? null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [responses.community_gps, sel.community_name, grid3SettlementCoords]);

  const instantGps = useInstantLocation({ geoCenter });

  // Persist the live supervision coordinate onto the form responses.
  const lastGpsTsRef = useRef<number | null>(null);
  useEffect(() => {
    const c = instantGps.coord;
    if (!c) return;
    if (c.source === "fallback") return; // don't overwrite with area center
    if (c.timestamp === lastGpsTsRef.current) return;
    lastGpsTsRef.current = c.timestamp;
    try {
      onSet({
        supervisor_latitude: c.lat,
        supervisor_longitude: c.lng,
        supervisor_gps: { lat: c.lat, lng: c.lng, accuracy: c.accuracy },
      });
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instantGps.coord]);

  const options = (level: keyof GeoRow): string[] => {
    // GRID3 national cascade (default). State → LGA → Ward come from the full
    // consolidated GRID3 shards; FLHF and Community (settlements) come from
    // the same GRID3 state shard. Type-and-add stays available for values not
    // in the GRID3 list.
    if (useAdminHierarchy) {
      if (isGeoLevel(level)) return grid3GeoOptions(level);
      if (level === "flhf_name") return grid3FacilityNames;
      // The MDA "Community" field is populated from GRID3 settlements.
      if (level === "community_name") return grid3SettlementNames;
      // Settlement detail level remains free-text (type-and-add).
      return [];
    }
    // Microplan-driven path. If the microplan captured values for this level,
    // use them. Otherwise — to guarantee the cascade NEVER dead-ends (e.g. the
    // microplan covers some LGAs but not the one chosen, or wards were never
    // captured) — fall back to the full admin hierarchy for State/LGA/Ward.
    const mp = microplanOptions(level);
    if (mp.length > 0) return mp;
    if (isGeoLevel(level)) return grid3GeoOptions(level);
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

  // Load GRID3 FLHF facilities + settlements (same source as Geo Microplanning)
  // for the chosen State/LGA(/Ward) whenever the GRID3 cascade is active. The
  // lists power the FLHF and Community (settlement) pickers while keeping the
  // type-and-add escape hatch for anything not in the GRID3 dataset.
  useEffect(() => {
    if (!useAdminHierarchy || !sel.state || !sel.lga) {
      setGrid3Facilities([]);
      setGrid3Settlements([]);
      return;
    }
    let cancelled = false;
    const st = canonicalStateName(sel.state);
    const lg = canonicalLgaName(sel.state, sel.lga);
    const wd = sel.ward ? canonicalWardName(sel.state, sel.lga, sel.ward) : undefined;
    (async () => {
      try {
        const [fac, set] = await Promise.all([
          getGrid3FacilitiesWithCoords(st, lg, wd),
          getGrid3SettlementsWithCoords(st, lg, wd),
        ]);
        if (!cancelled) {
          setGrid3Facilities(fac);
          setGrid3Settlements(set);
        }
      } catch {
        if (!cancelled) { setGrid3Facilities([]); setGrid3Settlements([]); }
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useAdminHierarchy, sel.state, sel.lga, sel.ward]);


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
      // Admin / GRID3 cascade: State→LGA→Ward is a strict chain. FLHF, Community
      // and Settlement are pick-or-type fields gated only by Ward, so an empty
      // FLHF list can never dead-end Community/Settlement beneath it.
      if (key === "lga") return !!sel.state;
      if (key === "ward") return !!sel.lga;
      return !!sel.ward;
    }
    for (let i = 0; i < idx; i++) {
      const anc = LEVEL_ORDER[i];
      if (options(anc).length > 0 && !sel[anc]) return false;
    }
    return true;
  };

  // States that can be saved for offline use: the project's scoped states if
  // any, otherwise whatever state the supervisor has currently selected.
  const prefetchableStates = useMemo(() => {
    const scoped = Array.from(allowedStates);
    if (scoped.length > 0) return scoped;
    return sel.state ? [canonicalStateName(sel.state)] : [];
  }, [allowedStates, sel.state]);

  const allSaved =
    prefetchableStates.length > 0 && prefetchableStates.every((s) => savedStates.has(s));

  const handlePrefetch = async () => {
    if (prefetchableStates.length === 0 || prefetchState === "running") return;
    setPrefetchState("running");
    setPrefetchProgress({ done: 0, total: prefetchableStates.length });
    const saved = new Set(savedStates);
    for (let i = 0; i < prefetchableStates.length; i++) {
      try {
        await prefetchGrid3State(prefetchableStates[i]);
        saved.add(prefetchableStates[i]);
        setSavedStates(new Set(saved));
      } catch { /* keep going; offline shards stay whatever is cached */ }
      setPrefetchProgress({ done: i + 1, total: prefetchableStates.length });
    }
    setPrefetchState("done");
  };

  // Hidden admin-only action: rebuild the local State→LGA→Ward lookup table.
  // Only needed when administrative boundaries are structurally modified — the
  // dataset is otherwise loaded once and served entirely from local storage.
  const [refreshingGeo, setRefreshingGeo] = useState(false);
  const handleRefreshHierarchy = async () => {
    if (refreshingGeo) return;
    setRefreshingGeo(true);
    try {
      const res = await refreshGeographyHierarchy();
      toast({
        title: "Geography data refreshed",
        description: `Local hierarchy rebuilt — ${res.states} states cached offline.`,
      });
    } catch {
      toast({ title: "Refresh failed", description: "Could not rebuild the local geography cache.", variant: "destructive" });
    } finally {
      setRefreshingGeo(false);
    }
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
              {disableMicroplan
                ? "Pick the area you are supervising from the State cascade"
                : microplanIsEmpty
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
            <Lock className="h-3 w-3" /> {(disableMicroplan || microplanIsEmpty) ? "State cascade" : "Microplan-locked"}
          </Badge>
          {(isAdmin || isOwner) && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleRefreshHierarchy}
              disabled={refreshingGeo}
              className="h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
              title="Rebuild the offline State → LGA → Ward hierarchy (admin only)"
            >
              <RefreshCw className={cn("h-3 w-3", refreshingGeo && "animate-spin")} />
              {refreshingGeo ? "Refreshing…" : "Refresh Hierarchy Data"}
            </Button>
          )}
        </div>
      </div>

      {loading || scope.loading ? (
        // Skeleton that mirrors the real field grid so the cascade container
        // keeps its footprint while geography loads — no layout shift / jump.
        <div className="space-y-3" aria-busy="true" aria-live="polite">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading geography…
          </div>
          <div className={cn("grid grid-cols-1 gap-3 sm:grid-cols-2", big && "gap-4")}>
            {LEVELS
              .filter(({ key }) => !visibleLevels || visibleLevels.includes(key))
              .map(({ key, label }) => (
                <div
                  key={key}
                  className={cn("space-y-1.5", key === "settlement_name" && "sm:col-span-2")}
                >
                  <Label className={cn("font-semibold text-foreground/70", big ? "text-sm sm:text-base" : "text-xs")}>
                    {label}
                  </Label>
                  <div className={cn("w-full animate-pulse rounded-md border border-border bg-muted/60", big ? "h-12" : "h-10")} />
                </div>
              ))}
          </div>
        </div>
      ) : (
        <>

          {/* GRID3 vs microplan switch — ENABLED BY DEFAULT (GRID3 national
              cascade). Placed BEFORE the location fields so the supervisor first
              decides the data source, then picks the area. Turn OFF to drive the
              cascade from this project's locked-in microplan data. Hidden
              entirely when microplan sourcing is disabled for this form. */}
          {!disableMicroplan && (
          <div
            className={cn(
              "overflow-hidden rounded-2xl border transition-colors",
              notInMicroplan
                ? "border-amber-400/70 bg-gradient-to-br from-amber-50 via-orange-50 to-rose-50 dark:border-amber-500/40 dark:from-amber-950/40 dark:via-orange-950/30 dark:to-rose-950/20"
                : "border-violet-300/70 bg-gradient-to-br from-violet-50 via-fuchsia-50 to-sky-50 dark:border-violet-500/40 dark:from-violet-950/40 dark:via-fuchsia-950/30 dark:to-sky-950/20",
            )}
          >
            <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-start gap-3">
                <span
                  className={cn(
                    "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white shadow-sm",
                    notInMicroplan
                      ? "bg-gradient-to-br from-amber-500 to-rose-500"
                      : "bg-gradient-to-br from-violet-500 to-fuchsia-500",
                  )}
                >
                  <PlusCircle className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-foreground sm:text-base">
                    Community received medicine but is not in the microplan?
                  </p>
                  {!hasMicroplanData && !notInMicroplan && (
                    <p className="mt-1 text-xs font-medium text-amber-700 dark:text-amber-300">
                      This project has no microplan data — keep this on to use the GRID3 cascade.
                    </p>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-3 self-start rounded-full border border-border/70 bg-background/80 px-3 py-2 shadow-sm sm:self-center">
                <span className={cn("min-w-8 whitespace-nowrap text-center text-xs font-bold", notInMicroplan ? "text-primary" : "text-muted-foreground")}>
                  {notInMicroplan ? "Yes" : "No"}
                </span>
                <Switch
                  checked={notInMicroplan}
                  onCheckedChange={toggleNotInMicroplan}
                  aria-label="Community received medicine but is not in the microplan"
                  className="h-7 w-12 data-[state=checked]:bg-primary data-[state=unchecked]:bg-muted"
                />
              </div>
            </div>
          </div>
          )}

          {/* Offline prefetch — save the GRID3 location data for the relevant
              states so the cascade works instantly with no network. */}
          {useAdminHierarchy && prefetchableStates.length > 0 && (
            <div className="overflow-hidden rounded-2xl border border-sky-300/70 bg-gradient-to-br from-sky-50 via-cyan-50 to-emerald-50 dark:border-sky-500/40 dark:from-sky-950/40 dark:via-cyan-950/30 dark:to-emerald-950/20">
              <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-emerald-500 text-white shadow-sm">
                    {isOffline ? <WifiOff className="h-5 w-5" /> : <DownloadCloud className="h-5 w-5" />}
                  </span>
                  <div>
                    <p className="text-sm font-bold text-foreground sm:text-base">
                      Save location data for offline use
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {allSaved
                        ? `Saved for offline: ${prefetchableStates.join(", ")}. The cascade will load instantly with no network.`
                        : `Download the full FLHF & community lists for ${prefetchableStates.join(", ")} so supervision works completely offline in the field.`}
                    </p>
                    {isOffline && !allSaved && (
                      <p className="mt-1 text-xs font-medium text-amber-700 dark:text-amber-300">
                        You are offline — only states already saved will load.
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 self-start sm:self-center">
                  {allSaved ? (
                    <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                      <CheckCircle2 className="h-4 w-4" /> Ready offline
                    </span>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      onClick={handlePrefetch}
                      disabled={prefetchState === "running" || isOffline}
                      className="gap-1.5 bg-gradient-to-br from-sky-600 to-emerald-600 text-white hover:from-sky-700 hover:to-emerald-700"
                    >
                      {prefetchState === "running" ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          {prefetchProgress.done}/{prefetchProgress.total}
                        </>
                      ) : (
                        <>
                          <DownloadCloud className="h-4 w-4" />
                          Save for offline
                        </>
                      )}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}




          {microplanIsEmpty && !disableMicroplan && (
            <div className="flex items-start gap-3 rounded-xl border border-sky-300 bg-sky-50 p-3 text-sm text-sky-800 dark:border-sky-800 dark:bg-sky-950/30 dark:text-sky-200">
              <Info className="mt-0.5 h-4 w-4 shrink-0" />
              <p className="text-xs">
                {hasStateScope
                  ? `No microplan is linked to this project. Using the cascade for ${Array.from(allowedStates).join(", ")}.`
                  : "No microplan is linked to this project and no state was assigned. Select any Nigerian state below — the LGA and Ward will cascade from your choice."}
              </p>
            </div>
          )}

          <div className={cn("grid grid-cols-1 gap-3 sm:grid-cols-2", big && "gap-4")}>
          {LEVELS
            .filter(({ key }) => !visibleLevels || visibleLevels.includes(key))
            .map(({ key, label, optional }) => {
            const isOptional = optional || (optionalLevels?.includes(key) ?? false);
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
                <Label className={cn("font-semibold text-foreground", big ? "text-sm sm:text-base" : "text-xs")}>
                  {label}{!isOptional && <span className="ml-0.5 text-destructive">*</span>}
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
                    triggerClassName={big ? "h-12 text-base" : undefined}
                    onChange={(v) => {
                      const inMicroplan = microplanOptions(key).includes(v);
                      const inGrid3 =
                        (key === "flhf_name" && grid3FacilityNames.includes(v)) ||
                        (key === "community_name" && grid3SettlementNames.includes(v));
                      // A value that is neither in the microplan nor the GRID3
                      // dataset is a genuinely new (typed) entry → flag it.
                      if (!!v && !inMicroplan && !inGrid3) {
                        onSet({ community_not_in_microplan: true, received_medicine_not_microplanned: true });
                      }
                      setLevel(key, v);
                      // GRID3 settlements feed the Community field — carry their
                      // GPS so the community location is recorded automatically.
                      if (key === "community_name" && v) {
                        const coords = grid3SettlementCoords.get(normGeo(v));
                        if (coords) {
                          onSet({
                            community_latitude: coords.lat,
                            community_longitude: coords.lng,
                            community_gps: { lat: coords.lat, lng: coords.lng },
                          });
                        }
                      }
                    }}
                  />
                ) : (
                  // State / LGA / Ward: virtualized searchable picker (no add).
                  <LocationCombobox
                    value={sel[key]}
                    options={opts}
                    disabled={!parentOk || opts.length === 0}
                    allowAdd={false}
                    triggerClassName={big ? "h-12 text-base" : undefined}
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



      {/* Instant supervision GPS status */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2">
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <MapPinned className="h-3.5 w-3.5 text-primary" />
          {instantGps.coord && instantGps.source !== "fallback"
            ? `${instantGps.coord.lat.toFixed(6)}, ${instantGps.coord.lng.toFixed(6)}`
            : "Acquiring supervision GPS…"}
        </div>
        <LocationStatusBadge
          source={instantGps.source}
          label={instantGps.statusLabel}
          accuracy={instantGps.accuracy}
          isRefreshing={instantGps.isRefreshing}
          onRefresh={() => void instantGps.refresh()}
        />
      </div>

      {/* Selection confirmation */}
      {(sel.community_name || sel.ward || sel.lga) && (
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

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
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/fetchAllRows";
import { useMicroplanScope } from "@/hooks/useMicroplanScope";
import { useAuth } from "@/hooks/useAuth";
import { getAllStates, getLGAsForState, getWardsForLGA } from "@/lib/nigeriaAdminData";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  MapPinned, Lock, PlusCircle, Loader2, Info, AlertTriangle, CheckCircle2,
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

const uniqSorted = (vals: (string | null | undefined)[]) =>
  Array.from(new Set(vals.filter((v): v is string => !!v && v.trim() !== "")))
    .sort((a, b) => a.localeCompare(b));

export default function MdaLocationCascade({ projectId, responses, nameToId, onSet, stateScope }: Props) {
  const { isOwner, isAdmin } = useAuth();
  const scope = useMicroplanScope(isOwner || isAdmin);

  const [rows, setRows] = useState<GeoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [notInMicroplan, setNotInMicroplan] = useState(false);

  // ── Load microplan geography ──────────────────────────────────────────
  // The MDA checklist often lives in a *different* project than the one used
  // for Geo Microplanning. Tying the cascade to the form's project_id would
  // therefore show "No microplan data" even though the user has captured
  // communities. Instead we load ALL microplan geography the user can see
  // (RLS + the designation-scope filter below restrict it to their areas).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const data = await fetchAllRows<GeoRow>((from, to) =>
          supabase
            .from("microplan_entries")
            .select("state, lga, ward, flhf_name, community_name, settlement_name")
            .range(from, to),
        );
        if (!cancelled) setRows(data || []);
      } catch {
        if (!cancelled) setRows([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [projectId]);

  // Admin-defined state restriction for this form (empty/undefined → all states).
  const allowedStates = useMemo(
    () => new Set((stateScope || []).map((s) => s.trim()).filter(Boolean)),
    [stateScope],
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
    return base.filter((r) => r.state && allowedStates.has(r.state));
  }, [rows, scope, hasStateScope, allowedStates]);

  // ── Current selection (read from responses by question id) ────────────
  const getVal = (key: keyof GeoRow): string => {
    const qName = QUESTION_NAME[key];
    const id = nameToId[qName];
    const v = (id && responses[id]) ?? responses[key] ?? responses[qName];
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

  // Cascading filtered rows for option building.
  const filteredFor = (level: keyof GeoRow): GeoRow[] => {
    return scopedRows.filter((r) => {
      if (level !== "state" && sel.state && r.state !== sel.state) return false;
      if (["ward", "flhf_name", "community_name", "settlement_name"].includes(level) && sel.lga && r.lga !== sel.lga) return false;
      if (["flhf_name", "community_name", "settlement_name"].includes(level) && sel.ward && r.ward !== sel.ward) return false;
      if (["community_name", "settlement_name"].includes(level) && sel.flhf_name && r.flhf_name !== sel.flhf_name) return false;
      if (level === "settlement_name" && sel.community_name && r.community_name !== sel.community_name) return false;
      return true;
    });
  };

  const options = (level: keyof GeoRow): string[] => {
    // Off-microplan path: State → LGA → Ward come from the full Nigerian
    // administrative hierarchy (the community is, by definition, not in the
    // microplan), still bounded by any admin-defined state scope.
    if (notInMicroplan) {
      if (level === "state") {
        const all = getAllStates();
        return hasStateScope ? all.filter((s) => allowedStates.has(s)) : all;
      }
      if (level === "lga") return sel.state ? getLGAsForState(sel.state) : [];
      if (level === "ward") return sel.state && sel.lga ? getWardsForLGA(sel.state, sel.lga) : [];
      // FLHF / community / settlement are entered as free text below.
      return [];
    }
    return uniqSorted(filteredFor(level).map((r) => r[level]));
  };

  // ── Write a level + clear downstream selections ───────────────────────
  const setLevel = (level: keyof GeoRow, value: string) => {
    const order: (keyof GeoRow)[] = ["state", "lga", "ward", "flhf_name", "community_name", "settlement_name"];
    const startIdx = order.indexOf(level);
    const updates: Record<string, any> = {};
    order.slice(startIdx).forEach((k, i) => {
      const v = i === 0 ? value : "";
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
              Driven by the microplan — pick the area you are supervising
            </p>
          </div>
        </div>
        <Badge variant="outline" className="gap-1 border-primary/40 text-primary">
          <Lock className="h-3 w-3" /> Microplan-locked
        </Badge>
      </div>

      {loading || scope.loading ? (
        <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading microplan geography…
        </div>
      ) : microplanIsEmpty && !notInMicroplan ? (
        <div className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-semibold">No microplan data in your scope yet.</p>
            <p className="text-xs">
              Capture communities in the Geo Microplanning module first, or enable
              the “Not in microplan” option below if this community received
              medicine without being microplanned.
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {LEVELS.map(({ key, label, optional }) => {
            const isFreeText =
              notInMicroplan &&
              (key === "flhf_name" || key === "community_name" || key === "settlement_name");
            const opts = options(key);
            // Determine if parent is selected to enable this level
            const parentOk =
              key === "state" ||
              (key === "lga" && sel.state) ||
              (key === "ward" && sel.lga) ||
              (key === "flhf_name" && sel.ward) ||
              (key === "community_name" && sel.flhf_name) ||
              (key === "settlement_name" && sel.community_name);

            return (
              <div key={key} className={cn("space-y-1.5", key === "settlement_name" && "sm:col-span-2")}>
                <Label className="text-xs font-semibold text-foreground">
                  {label}{!optional && <span className="ml-0.5 text-destructive">*</span>}
                </Label>

                {isFreeText ? (
                  <Input
                    value={sel[key]}
                    onChange={(e) => setFreeText(key as any, e.target.value)}
                    placeholder={`Enter ${label.toLowerCase()} (not in microplan)`}
                    className="bg-background"
                  />
                ) : (
                  <Select
                    value={sel[key] || undefined}
                    onValueChange={(v) => setLevel(key, v)}
                    disabled={!parentOk || opts.length === 0}
                  >
                    <SelectTrigger className="bg-background">
                      <SelectValue
                        placeholder={
                          !parentOk
                            ? `Select ${LEVELS[LEVELS.findIndex(l => l.key === key) - 1]?.label ?? "parent"} first`
                            : opts.length === 0
                              ? "None in microplan"
                              : `Select ${label.toLowerCase()}`
                        }
                      />
                    </SelectTrigger>
                    <SelectContent className="max-h-72">
                      {opts.map((o) => (
                        <SelectItem key={o} value={o}>{o}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Not-in-microplan provision */}
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

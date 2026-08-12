/**
 * Geography exclusion / archive store.
 *
 * Lets a programme manager drop specific LGAs or Wards from a computation.
 * Excluded geographies are *archived* (kept, never deleted) and every KPI,
 * chart, table and export recomputes without them until the exclusion is
 * undone. Persisted per project + surface in localStorage so the choice
 * survives reloads and works fully offline.
 */
import { useCallback, useEffect, useState } from "react";

export const exKeyLga = (state: unknown, lga: unknown) =>
  `L:${String(state ?? "").trim().toLowerCase()}|${String(lga ?? "").trim().toLowerCase()}`;

export const exKeyWard = (state: unknown, lga: unknown, ward: unknown) =>
  `W:${String(state ?? "").trim().toLowerCase()}|${String(lga ?? "").trim().toLowerCase()}|${String(ward ?? "").trim().toLowerCase()}`;

export interface ExcludedRef {
  key: string;
  level: "LGA" | "Ward";
  state: string;
  lga: string;
  ward?: string;
  records: number;
  population: number;
  archivedAt: string;
}

const store = (scopeId: string) => `amehnities.geoExclusions.${scopeId}`;

export function readExclusions(scopeId: string): ExcludedRef[] {
  try {
    const raw = localStorage.getItem(store(scopeId));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

export function writeExclusions(scopeId: string, refs: ExcludedRef[]) {
  try { localStorage.setItem(store(scopeId), JSON.stringify(refs)); } catch { /* quota */ }
}

/** True when the row falls inside an excluded LGA or Ward. */
export const rowExcluded = (keys: Set<string>, row: { state?: unknown; lga?: unknown; ward?: unknown }) =>
  keys.size > 0 &&
  (keys.has(exKeyLga(row.state, row.lga)) || keys.has(exKeyWard(row.state, row.lga, row.ward)));

export function useGeoExclusions(scopeId: string) {
  const [archived, setArchived] = useState<ExcludedRef[]>(() => readExclusions(scopeId));
  /** undo/redo stacks of full snapshots */
  const past = useRef<ExcludedRef[][]>([]);
  const future = useRef<ExcludedRef[][]>([]);
  const [stamp, setStamp] = useState(0);

  useEffect(() => {
    past.current = [];
    future.current = [];
    setStamp((s) => s + 1);
    setArchived(readExclusions(scopeId));
  }, [scopeId]);

  const write = useCallback((next: ExcludedRef[]) => {
    setArchived(next);
    writeExclusions(scopeId, next);
    setStamp((s) => s + 1);
  }, [scopeId]);

  /** commit a new state, pushing the current one onto the undo stack */
  const persist = useCallback((next: ExcludedRef[]) => {
    past.current = [...past.current, readExclusions(scopeId)].slice(-50);
    future.current = [];
    write(next);
  }, [write, scopeId]);

  const exclude = useCallback((refs: ExcludedRef[]) => {
    persist([...readExclusions(scopeId).filter((a) => !refs.some((r) => r.key === a.key)), ...refs]);
  }, [persist, scopeId]);

  const restore = useCallback((keys: string[]) => {
    const drop = new Set(keys);
    persist(readExclusions(scopeId).filter((a) => !drop.has(a.key)));
  }, [persist, scopeId]);

  const restoreAll = useCallback(() => persist([]), [persist]);

  /** step one change back */
  const undo = useCallback(() => {
    const prev = past.current[past.current.length - 1];
    if (!prev) return;
    past.current = past.current.slice(0, -1);
    future.current = [readExclusions(scopeId), ...future.current].slice(0, 50);
    write(prev);
  }, [write, scopeId]);

  /** step one change forward */
  const redo = useCallback(() => {
    const next = future.current[0];
    if (!next) return;
    future.current = future.current.slice(1);
    past.current = [...past.current, readExclusions(scopeId)].slice(-50);
    write(next);
  }, [write, scopeId]);

  /** clear every exclusion AND the history — back to the full scope */
  const reset = useCallback(() => {
    past.current = [];
    future.current = [];
    write([]);
  }, [write]);

  const keys = new Set(archived.map((a) => a.key));

  return {
    archived, keys, exclude, restore, restoreAll,
    undo, redo, reset,
    canUndo: past.current.length > 0,
    canRedo: future.current.length > 0,
    historyStamp: stamp,
  };
}


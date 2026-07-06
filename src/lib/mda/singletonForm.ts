/**
 * Race-safe creation of "singleton" template forms (e.g. the SARMAAN
 * Supervisory Checklist, SARMAAN ACSM Checklist, MDA Supervisory Checklist).
 *
 * These forms are created on-demand when a user taps a "Tap to create" card.
 * Because the cards are rendered side-by-side and taps can double-fire before
 * React state / a background refetch catches up, two (or three) identical rows
 * used to be inserted into `forms` for the same project. This helper eliminates
 * that class of bug with two layers of protection:
 *
 *   1. An in-flight promise cache keyed by `${projectId}::${matchKey}` so any
 *      concurrent calls (double-tap, both cards) share ONE insert.
 *   2. A fresh DB existence check immediately before inserting, so a row created
 *      on another tab/device (or milliseconds earlier) is reused instead of
 *      duplicated.
 */

import { supabase } from "@/integrations/supabase/client";

const inFlight = new Map<string, Promise<any>>();

export interface SingletonFormArgs {
  projectId: string;
  /** Exact form name used to detect an existing singleton in this project. */
  name: string;
  /** Optional extra filter to disambiguate (e.g. a settings flag column match). */
  settingsFlag?: string;
  /** Builds the INSERT payload. Called only when no existing row is found. */
  buildInsert: () => Record<string, any>;
}

/**
 * Return the existing singleton form row for a project or create it exactly
 * once. Safe to call concurrently.
 */
export async function getOrCreateSingletonForm(args: SingletonFormArgs): Promise<any> {
  const { projectId, name, settingsFlag, buildInsert } = args;
  const cacheKey = `${projectId}::${name}::${settingsFlag ?? ""}`;

  const existingPromise = inFlight.get(cacheKey);
  if (existingPromise) return existingPromise;

  const run = (async () => {
    // 1. Fresh DB existence check (catches rows made on other tabs/devices).
    let q = supabase
      .from("forms")
      .select("*")
      .eq("project_id", projectId)
      .eq("name", name)
      .order("created_at", { ascending: true })
      .limit(1);
    const { data: found } = await q;
    if (found && found.length > 0) return found[0];

    // 2. Nothing exists — insert the singleton.
    const payload = buildInsert();
    const { data, error } = await supabase
      .from("forms")
      .insert(payload as any)
      .select("*")
      .single();
    if (error) {
      // If a concurrent insert won the race, re-read and return that row.
      const { data: retry } = await supabase
        .from("forms")
        .select("*")
        .eq("project_id", projectId)
        .eq("name", name)
        .order("created_at", { ascending: true })
        .limit(1);
      if (retry && retry.length > 0) return retry[0];
      throw error;
    }
    return data;
  })();

  inFlight.set(cacheKey, run);
  try {
    return await run;
  } finally {
    // Keep the resolved value briefly so trailing double-taps reuse it, then
    // release so future explicit re-creates (after deletion) still work.
    setTimeout(() => inFlight.delete(cacheKey), 4000);
  }
}

const pairInFlight = new Map<string, Promise<any>>();

export interface PairedToolsArgs {
  projectId: string;
  /** settings flag that marks any row belonging to this toolset (e.g. "bloomberg_kind"). */
  kindFlag: string;
  /** Builds the INSERT array. Called only when no existing rows are found. */
  buildInserts: () => Record<string, any>[];
}

/**
 * Race-safe creation of a paired form+dashboard toolset (Bloomberg, See Clear,
 * ACSM, SBC, IRF …). Prevents the double-insert that produced replicated tools
 * when the "Add to project" button was double-tapped.
 */
export async function insertToolFormsOnce(args: PairedToolsArgs): Promise<void> {
  const { projectId, kindFlag, buildInserts } = args;
  const cacheKey = `${projectId}::${kindFlag}`;
  const existing = pairInFlight.get(cacheKey);
  if (existing) return existing;

  const run = (async () => {
    // Fresh DB existence check: any row already tagged with this kind flag?
    const { data: found } = await supabase
      .from("forms")
      .select("id")
      .eq("project_id", projectId)
      .not(`settings->>${kindFlag}`, "is", null)
      .limit(1);
    if (found && found.length > 0) return;
    const { error } = await supabase.from("forms").insert(buildInserts() as any);
    if (error) {
      // Re-check: a concurrent insert may have won.
      const { data: retry } = await supabase
        .from("forms")
        .select("id")
        .eq("project_id", projectId)
        .not(`settings->>${kindFlag}`, "is", null)
        .limit(1);
      if (retry && retry.length > 0) return;
      throw error;
    }
  })();

  pairInFlight.set(cacheKey, run);
  try {
    await run;
  } finally {
    setTimeout(() => pairInFlight.delete(cacheKey), 4000);
  }
}

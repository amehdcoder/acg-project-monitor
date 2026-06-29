// Global after-hours submission interceptor.
//
// Wraps supabase.from(<gated table>).insert(...) so that, during the locked
// evening window, the insert is intercepted instead of hitting the database.
// The attempted payload is broadcast so the AfterHoursGate can offer the user
// an approval-request flow. The insert resolves to an error shaped exactly like
// a normal PostgREST failure so existing form code keeps working.

import { supabase } from "@/integrations/supabase/client";
import { isAfterHours } from "./window";
import { isGatedTable, gatedTableLabel } from "./tables";

export const AFTER_HOURS_ERROR_CODE = "AFTER_HOURS_LOCKED";
export const AFTER_HOURS_BLOCK_EVENT = "afterhours:block";

export interface AfterHoursBlockDetail {
  table: string;
  label: string;
  payload: any;
}

let bypass = false;
/** Temporarily allow gated inserts (used by trusted server-driven replays). */
export function setAfterHoursBypass(value: boolean) {
  bypass = value;
}

function afterHoursError() {
  return {
    message: "Submissions are locked after 7 PM. Please send an approval request.",
    code: AFTER_HOURS_ERROR_CODE,
    details: "",
    hint: "",
    __afterHours: true,
  } as any;
}

// A thenable proxy that mimics a PostgREST builder: every chained call
// (.select(), .single(), .maybeSingle(), .eq(), ...) returns itself, and
// awaiting it resolves to { data: null, error }.
function makeBlockingBuilder() {
  const result = { data: null, error: afterHoursError(), count: null, status: 423, statusText: "Locked" };
  const handler: ProxyHandler<any> = {
    get(_t, prop) {
      if (prop === "then") return (res: any, rej: any) => Promise.resolve(result).then(res, rej);
      if (prop === "catch") return (rej: any) => Promise.resolve(result).catch(rej);
      if (prop === "finally") return (cb: any) => Promise.resolve(result).finally(cb);
      // Any chained builder method returns the same blocking proxy
      return () => proxy;
    },
  };
  const proxy: any = new Proxy(function () {}, handler);
  return proxy;
}

let installed = false;

export function installAfterHoursInterceptor() {
  if (installed) return;
  installed = true;

  const originalFrom = supabase.from.bind(supabase);

  (supabase as any).from = (table: string) => {
    const builder: any = originalFrom(table as any);
    if (!isGatedTable(table)) return builder;

    const originalInsert = builder.insert.bind(builder);
    builder.insert = (values: any, options?: any) => {
      if (!bypass && isAfterHours()) {
        try {
          window.dispatchEvent(
            new CustomEvent<AfterHoursBlockDetail>(AFTER_HOURS_BLOCK_EVENT, {
              detail: { table, label: gatedTableLabel(table), payload: values },
            }),
          );
        } catch {
          /* no-op */
        }
        return makeBlockingBuilder();
      }
      return originalInsert(values, options);
    };

    return builder;
  };
}

// Shared-dashboard read proxy.
//
// The public `/shared/dashboard/:token` route renders the real supervisory
// dashboard components. Those components read data through the singleton
// Supabase client, but an anonymous (or non-member) viewer is blocked by RLS.
//
// This module temporarily patches `supabase.from()` (and neutralises realtime
// `channel()` subscriptions) so that, while a shared dashboard is on screen,
// every SELECT is routed through the `dashboard-share` edge function's secure
// `query` action. That action validates the share token / OTP session with the
// service role and returns exactly the tables the dashboards are allowed to
// read — no client-side RLS bypass, no service key in the browser.
import { supabase } from "@/integrations/supabase/client";

type FilterCall = { method: string; args: unknown[] };
type OrderCall = { column: string; options?: unknown };

interface ProxyContext {
  token: string;
  sessionToken?: string;
}

let active: ProxyContext | null = null;
let originalFrom: typeof supabase.from | null = null;
let originalChannel: typeof supabase.channel | null = null;
let originalRemoveChannel: typeof supabase.removeChannel | null = null;

async function runQuery(table: string, payload: Record<string, unknown>) {
  if (!active) return { data: null, error: new Error("Shared proxy inactive"), count: null };
  const { data, error } = await supabase.functions.invoke("dashboard-share", {
    body: {
      action: "query",
      token: active.token,
      sessionToken: active.sessionToken,
      table,
      ...payload,
    },
  });
  if (error) {
    // Surface the edge error body when present.
    let message = error.message ?? "Query failed";
    try {
      const ctx = (error as any)?.context;
      if (ctx?.text) {
        const parsed = JSON.parse(await ctx.text());
        if (parsed?.error) message = parsed.error;
      }
    } catch {
      /* ignore */
    }
    return { data: null, error: new Error(message), count: null };
  }
  const res = data as { data: unknown; error: string | null; count: number | null };
  if (res?.error) return { data: null, error: new Error(res.error), count: res?.count ?? null };
  return { data: res?.data ?? null, error: null, count: res?.count ?? null };
}

// A thenable stand-in for PostgrestFilterBuilder covering the read surface the
// dashboards use. Chained filters are recorded and replayed server-side.
class SharedSelectBuilder implements PromiseLike<{ data: unknown; error: Error | null; count: number | null }> {
  private columns = "*";
  private selectOptions: unknown;
  private filters: FilterCall[] = [];
  private orderCalls: OrderCall[] = [];
  private _limit?: number;
  private _rangeFrom?: number;
  private _rangeTo?: number;
  private _single?: "single" | "maybe";

  constructor(private table: string) {}

  select(columns = "*", options?: unknown) {
    this.columns = columns;
    this.selectOptions = options;
    return this;
  }

  private addFilter(method: string, ...args: unknown[]) {
    this.filters.push({ method, args });
    return this;
  }

  eq(c: string, v: unknown) { return this.addFilter("eq", c, v); }
  neq(c: string, v: unknown) { return this.addFilter("neq", c, v); }
  gt(c: string, v: unknown) { return this.addFilter("gt", c, v); }
  gte(c: string, v: unknown) { return this.addFilter("gte", c, v); }
  lt(c: string, v: unknown) { return this.addFilter("lt", c, v); }
  lte(c: string, v: unknown) { return this.addFilter("lte", c, v); }
  like(c: string, v: unknown) { return this.addFilter("like", c, v); }
  ilike(c: string, v: unknown) { return this.addFilter("ilike", c, v); }
  is(c: string, v: unknown) { return this.addFilter("is", c, v); }
  in(c: string, v: unknown) { return this.addFilter("in", c, v); }
  contains(c: string, v: unknown) { return this.addFilter("contains", c, v); }
  containedBy(c: string, v: unknown) { return this.addFilter("containedBy", c, v); }
  overlaps(c: string, v: unknown) { return this.addFilter("overlaps", c, v); }
  not(c: string, op: string, v: unknown) { return this.addFilter("not", c, op, v); }
  filter(c: string, op: string, v: unknown) { return this.addFilter("filter", c, op, v); }
  or(filterStr: string) { return this.addFilter("or", filterStr); }
  match(query: Record<string, unknown>) { return this.addFilter("match", query); }

  order(column: string, options?: unknown) {
    this.orderCalls.push({ column, options });
    return this;
  }
  limit(n: number) { this._limit = n; return this; }
  range(from: number, to: number) { this._rangeFrom = from; this._rangeTo = to; return this; }
  maybeSingle() { this._single = "maybe"; return this; }
  single() { this._single = "single"; return this; }

  // Mutations are not permitted through a shared read proxy.
  insert() { return this.mutationBlocked(); }
  update() { return this.mutationBlocked(); }
  upsert() { return this.mutationBlocked(); }
  delete() { return this.mutationBlocked(); }
  private mutationBlocked() {
    const blocked = {
      then: (resolve: (v: { data: null; error: Error }) => unknown) =>
        Promise.resolve(resolve({ data: null, error: new Error("Read-only shared dashboard") })),
      select: () => blocked,
      eq: () => blocked,
      single: () => blocked,
      maybeSingle: () => blocked,
    };
    return blocked as any;
  }

  private exec() {
    return runQuery(this.table, {
      columns: this.columns,
      selectOptions: this.selectOptions,
      filters: this.filters,
      order: this.orderCalls,
      limit: this._limit,
      rangeFrom: this._rangeFrom,
      rangeTo: this._rangeTo,
      single: this._single,
    });
  }

  then<TResult1 = { data: unknown; error: Error | null; count: number | null }, TResult2 = never>(
    onfulfilled?: ((value: { data: unknown; error: Error | null; count: number | null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.exec().then(onfulfilled, onrejected);
  }
}

// A no-op realtime channel so components that subscribe don't crash offline.
function stubChannel() {
  const channel: any = {
    on: () => channel,
    subscribe: (cb?: (status: string) => void) => {
      if (cb) cb("SUBSCRIBED");
      return channel;
    },
    unsubscribe: () => Promise.resolve("ok"),
    send: () => Promise.resolve("ok"),
  };
  return channel;
}

export function installSharedDataProxy(ctx: ProxyContext) {
  if (active) return;
  active = ctx;
  originalFrom = supabase.from.bind(supabase);
  originalChannel = supabase.channel.bind(supabase);
  originalRemoveChannel = supabase.removeChannel.bind(supabase);

  (supabase as any).from = (table: string) => new SharedSelectBuilder(table);
  (supabase as any).channel = () => stubChannel();
  (supabase as any).removeChannel = () => Promise.resolve("ok");
}

export function uninstallSharedDataProxy() {
  if (!active) return;
  active = null;
  if (originalFrom) (supabase as any).from = originalFrom;
  if (originalChannel) (supabase as any).channel = originalChannel;
  if (originalRemoveChannel) (supabase as any).removeChannel = originalRemoveChannel;
  originalFrom = originalChannel = originalRemoveChannel = null;
}

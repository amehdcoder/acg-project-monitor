/**
 * mda-lens-export — server-side enforcement of MDA Lens scope for exports and
 * direct download URLs.
 *
 * The frontend already filters, but a user could call the data API (or a saved
 * download URL) directly. This function is the authoritative gate: it verifies
 * the caller's JWT, reads their grant with the service role, and returns ONLY
 * rows inside their granted project / campaign / State / LGA / Ward scope.
 * Users without `can_export` get 403 — never a partial or unscoped payload.
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SOURCES = {
  microplan_entries: {
    table: "microplan_entries",
    state: "state",
    lga: "lga",
    ward: "ward",
    project: "project_id",
    campaign: "campaign_type",
  },
  microplan_medicine_allocations: {
    table: "microplan_medicine_allocations",
    state: "state",
    lga: "lga",
    ward: "ward",
    project: null,
    campaign: null,
  },
  microplan_coverage: {
    table: "microplan_coverage",
    state: "state",
    lga: "lga",
    ward: "ward",
    project: null,
    campaign: null,
  },
} as const;

type SourceKey = keyof typeof SOURCES;

const norm = (v: unknown) =>
  String(v ?? "")
    .toLowerCase()
    .replace(/^(c__|state_|lga_|ward_)/, "")
    .replace(/\b(state|lga|ward|local government( area)?)\b/g, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();

const inScope = (allowed: string[], value: unknown) => {
  const list = (allowed || []).map(norm).filter(Boolean);
  if (!list.length) return true;
  const v = norm(value);
  if (!v) return true; // sparse field: parent level already enforced
  return list.includes(v);
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const cols = Array.from(new Set(rows.flatMap((r) => Object.keys(r))));
  const esc = (v: unknown) => {
    const s = v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const source = String(body.source ?? url.searchParams.get("source") ?? "") as SourceKey;
    const format = String(body.format ?? url.searchParams.get("format") ?? "json").toLowerCase();
    const limit = Math.min(Number(body.limit ?? url.searchParams.get("limit") ?? 5000) || 5000, 20000);

    if (!SOURCES[source]) return json({ error: "unknown_source" }, 400);
    if (!["json", "csv"].includes(format)) return json({ error: "unsupported_format" }, 400);

    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "unauthorized" }, 401);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    const { data: userData, error: userError } = await admin.auth.getUser(token);
    const user = userData?.user;
    if (userError || !user) return json({ error: "unauthorized" }, 401);

    // Admins / owners are unrestricted.
    const [{ data: ownerLevel }, { data: adminFlag }] = await Promise.all([
      admin.rpc("is_owner_level", { _user_id: user.id }),
      admin.rpc("is_admin", { _user_id: user.id }),
    ]);
    const unrestricted = ownerLevel === true || adminFlag === true;

    const { data: grant } = await admin
      .from("mda_lens_grants")
      .select("enabled, states, lgas, wards, project_ids, campaign_types, can_export")
      .eq("user_id", user.id)
      .maybeSingle();

    const lensActive = !unrestricted && !!grant?.enabled;

    if (!unrestricted && !lensActive) return json({ error: "forbidden" }, 403);
    if (lensActive && grant?.can_export === false) {
      await admin.from("mda_lens_access_events").insert({
        user_id: user.id,
        event_type: "export_blocked",
        page: "export",
        access_granted: false,
        grant_state: "verified",
        detail: { source, reason: "can_export_false" },
      });
      return json({ error: "export_not_permitted" }, 403);
    }

    const cfg = SOURCES[source];
    let query = admin.from(cfg.table).select("*").limit(limit);
    if (lensActive) {
      // Narrow server-side wherever the column exists; the row filter below is
      // the belt-and-braces check for value formatting differences.
      if (cfg.project && grant!.project_ids?.length) query = query.in(cfg.project, grant!.project_ids);
    }
    const { data, error } = await query;
    if (error) return json({ error: error.message }, 500);

    let rows = (data ?? []) as Record<string, unknown>[];
    if (lensActive) {
      rows = rows.filter((r) =>
        inScope(grant!.states ?? [], r[cfg.state]) &&
        inScope(grant!.lgas ?? [], r[cfg.lga]) &&
        inScope(grant!.wards ?? [], r[cfg.ward]) &&
        (!cfg.campaign || !(grant!.campaign_types ?? []).length || inScope(grant!.campaign_types ?? [], r[cfg.campaign])) &&
        (!cfg.project || !(grant!.project_ids ?? []).length || (grant!.project_ids ?? []).includes(String(r[cfg.project] ?? "")))
      );
    }

    await admin.from("mda_lens_access_events").insert({
      user_id: user.id,
      event_type: "lens_resolved",
      page: "export",
      access_granted: true,
      grant_state: "verified",
      detail: { source, format, returned: rows.length, scoped: lensActive },
    });

    if (format === "csv") {
      return new Response(toCsv(rows), {
        headers: {
          ...corsHeaders,
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${source}-scoped.csv"`,
          "Cache-Control": "no-store",
        },
      });
    }

    return json({ source, scoped: lensActive, count: rows.length, rows });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});

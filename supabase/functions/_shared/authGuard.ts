// Shared authorization guard for sensitive/admin/cron edge functions.
//
// Allows a request through when EITHER:
//   1. It carries a valid cron shared-secret header (x-worker-secret matching
//      the CRON_SECRET project secret) — used by scheduled invocations, OR
//   2. It carries a valid user JWT whose account is the Owner, Co-owner, or a
//      super_admin / systems_admin (for on-demand admin triggers).
//
// Returns null when authorized, or a ready-to-return Response (401/403) when not.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type GuardOptions = {
  // When true (default), require admin/owner role. When false, any
  // authenticated user is allowed (still rejects anonymous callers).
  requireAdmin?: boolean;
};

export async function guardRequest(
  req: Request,
  corsHeaders: Record<string, string>,
  options: GuardOptions = {},
): Promise<{ response: Response | null; userId: string | null }> {
  const { requireAdmin = true } = options;

  const deny = (status: number, msg: string) => ({
    response: new Response(JSON.stringify({ error: msg }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    }),
    userId: null as string | null,
  });

  // 1. Cron shared-secret path.
  const cronSecret = Deno.env.get("CRON_SECRET");
  const workerSecret = req.headers.get("x-worker-secret");
  if (cronSecret && workerSecret && workerSecret === cronSecret) {
    return { response: null, userId: null };
  }

  // 2. User JWT path.
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return deny(401, "Unauthorized");
  }
  const token = authHeader.replace("Bearer ", "");

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const authedClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });

  const { data: claims, error } = await authedClient.auth.getClaims(token);
  const userId = claims?.claims?.sub as string | undefined;
  if (error || !userId) {
    return deny(401, "Unauthorized");
  }

  if (!requireAdmin) {
    return { response: null, userId };
  }

  // Role/ownership check via the service role (bypasses RLS for the lookup).
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  const { data: profile } = await admin
    .from("profiles")
    .select("is_owner, is_co_owner")
    .eq("user_id", userId)
    .maybeSingle();

  if (profile?.is_owner || profile?.is_co_owner) {
    return { response: null, userId };
  }

  const { data: roles } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);

  const isAdmin = (roles ?? []).some(
    (r: { role: string }) => r.role === "super_admin" || r.role === "systems_admin",
  );
  if (isAdmin) {
    return { response: null, userId };
  }

  return deny(403, "Forbidden");
}

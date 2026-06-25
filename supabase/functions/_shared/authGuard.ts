// Shared authorization guard for sensitive/admin/cron edge functions.
//
// Allows a request through when ANY of the following is true:
//   1. It carries a valid cron shared-secret header (x-worker-secret matching
//      the CRON_SECRET project secret) — used by scheduled / trigger calls.
//   2. Its Authorization bearer is the service-role key (role = service_role) —
//      used by edge-function-to-edge-function invocations.
//   3. It carries a valid user JWT. When requireAdmin is true the account must
//      be Owner, Co-owner, super_admin or systems_admin.
//
// Returns { response: null } when authorized. `viaService` is true for the
// cron-secret and service-role paths (i.e. a trusted server caller).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type GuardOptions = {
  requireAdmin?: boolean;
};

export type GuardResult = {
  response: Response | null;
  userId: string | null;
  viaService: boolean;
};

export async function guardRequest(
  req: Request,
  corsHeaders: Record<string, string>,
  options: GuardOptions = {},
): Promise<GuardResult> {
  const { requireAdmin = true } = options;

  const deny = (status: number, msg: string): GuardResult => ({
    response: new Response(JSON.stringify({ error: msg }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    }),
    userId: null,
    viaService: false,
  });

  // 1. Cron / trigger shared-secret path.
  const cronSecret = Deno.env.get("CRON_SECRET");
  const workerSecret = req.headers.get("x-worker-secret");
  if (cronSecret && workerSecret && workerSecret === cronSecret) {
    return { response: null, userId: null, viaService: true };
  }

  // 2./3. JWT path.
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return deny(401, "Unauthorized");
  }
  const token = authHeader.replace("Bearer ", "");

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // Service-role key used directly (function-to-function calls).
  if (token === serviceKey) {
    return { response: null, userId: null, viaService: true };
  }

  const authedClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });

  const { data: claims, error } = await authedClient.auth.getClaims(token);
  if (error || !claims?.claims) {
    return deny(401, "Unauthorized");
  }
  if (claims.claims.role === "service_role") {
    return { response: null, userId: null, viaService: true };
  }

  const userId = claims.claims.sub as string | undefined;
  if (!userId) {
    return deny(401, "Unauthorized");
  }

  if (!requireAdmin) {
    return { response: null, userId, viaService: false };
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  const { data: profile } = await admin
    .from("profiles")
    .select("is_owner, is_co_owner")
    .eq("user_id", userId)
    .maybeSingle();

  if (profile?.is_owner || profile?.is_co_owner) {
    return { response: null, userId, viaService: false };
  }

  const { data: roles } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);

  const isAdmin = (roles ?? []).some(
    (r: { role: string }) => r.role === "super_admin" || r.role === "systems_admin",
  );
  if (isAdmin) {
    return { response: null, userId, viaService: false };
  }

  return deny(403, "Forbidden");
}

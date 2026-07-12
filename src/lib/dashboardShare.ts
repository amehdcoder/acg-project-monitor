// Dashboard Share & Permissions — client helpers.
//
// Talks to the `dashboard-share` edge function and manages the local
// verification session for external (OTP) viewers.
import { supabase } from "@/integrations/supabase/client";

export type ShareAccessType = "public" | "external_emails" | "internal_roles";

export interface DashboardShare {
  id: string;
  token: string;
  dashboard_id: string;
  project_id: string | null;
  access_type: ShareAccessType;
  allowed_emails: string[];
  allowed_roles: string[];
  label: string | null;
  is_active: boolean;
  expires_at: string | null;
  form_id: string | null;
  form_name: string | null;
  form_snapshot: unknown | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface PublicShare {
  dashboard_id: string;
  project_id: string | null;
  access_type: ShareAccessType;
  label: string | null;
  expires_at: string | null;
}

export type ResolveStatus =
  | "granted"
  | "needs_login"
  | "needs_otp"
  | "forbidden"
  | "revoked"
  | "not_found";

export interface ResolveResult {
  status: ResolveStatus;
  share?: PublicShare;
  sessionToken?: string;
}

const sessionKey = (token: string) => `dash-share-session-${token}`;

export function getStoredSession(token: string): string | null {
  try {
    return localStorage.getItem(sessionKey(token));
  } catch {
    return null;
  }
}
export function storeSession(token: string, sessionToken: string) {
  try {
    localStorage.setItem(sessionKey(token), sessionToken);
  } catch {
    /* ignore */
  }
}
export function clearStoredSession(token: string) {
  try {
    localStorage.removeItem(sessionKey(token));
  } catch {
    /* ignore */
  }
}

async function callShareFn(body: Record<string, unknown>): Promise<any> {
  const { data, error } = await supabase.functions.invoke("dashboard-share", { body });
  if (error) {
    // Surface the real edge error body when available.
    try {
      const ctx = (error as any)?.context;
      if (ctx?.text) return JSON.parse(await ctx.text());
    } catch {
      /* ignore */
    }
    throw error;
  }
  return data;
}

export async function resolveShare(token: string): Promise<ResolveResult> {
  const sessionToken = getStoredSession(token) ?? undefined;
  return (await callShareFn({ action: "resolve", token, sessionToken })) as ResolveResult;
}

export async function requestShareOtp(token: string, email: string): Promise<{ status: string }> {
  return (await callShareFn({ action: "request-otp", token, email })) as { status: string };
}

export async function verifyShareOtp(
  token: string,
  email: string,
  code: string,
): Promise<{ status: string; sessionToken?: string; share?: PublicShare }> {
  const res = await callShareFn({ action: "verify-otp", token, email, code });
  if (res?.status === "granted" && res?.sessionToken) storeSession(token, res.sessionToken);
  return res;
}

// ---- admin CRUD (super admins only, enforced by RLS) ---------------------
function randomToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function shareUrl(token: string): string {
  return `${window.location.origin}/shared/dashboard/${token}`;
}

export async function listShares(dashboardId: string, projectId?: string | null): Promise<DashboardShare[]> {
  let q = supabase
    .from("dashboard_shares" as any)
    .select("*")
    .eq("dashboard_id", dashboardId)
    .order("created_at", { ascending: false });
  if (projectId) q = q.eq("project_id", projectId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as unknown as DashboardShare[];
}

export interface CreateShareInput {
  dashboard_id: string;
  project_id?: string | null;
  access_type: ShareAccessType;
  allowed_emails?: string[];
  allowed_roles?: string[];
  label?: string | null;
  expires_at?: string | null;
  form_id?: string | null;
  form_name?: string | null;
  form_snapshot?: unknown | null;
}

export async function createShare(input: CreateShareInput): Promise<DashboardShare> {
  const { data: userData } = await supabase.auth.getUser();
  const created_by = userData?.user?.id;
  const { data, error } = await supabase
    .from("dashboard_shares" as any)
    .insert({
      token: randomToken(),
      dashboard_id: input.dashboard_id,
      project_id: input.project_id ?? null,
      access_type: input.access_type,
      allowed_emails: input.allowed_emails ?? [],
      allowed_roles: input.allowed_roles ?? [],
      label: input.label ?? null,
      expires_at: input.expires_at ?? null,
      form_id: input.form_id ?? null,
      form_name: input.form_name ?? null,
      form_snapshot: input.form_snapshot ?? null,
      created_by,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as unknown as DashboardShare;
}

export async function updateShare(id: string, patch: Partial<CreateShareInput> & { is_active?: boolean }): Promise<void> {
  const { error } = await supabase.from("dashboard_shares" as any).update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteShare(id: string): Promise<void> {
  const { error } = await supabase.from("dashboard_shares" as any).delete().eq("id", id);
  if (error) throw error;
}

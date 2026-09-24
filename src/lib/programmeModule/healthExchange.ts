// Client helpers for the national health data exchange (DHIS2 / FHIR / LMIS).
// Credentials never travel through the browser twice: they are sent once to the
// edge function, which stores them server-side.
import { supabase } from "@/integrations/supabase/client";

export type ExchangeKind = "dhis2" | "fhir" | "lmis";

export interface ExchangeConnection {
  id: string;
  project_id: string;
  name: string;
  kind: ExchangeKind;
  base_url: string;
  auth_type: "bearer" | "basic" | "none";
  username: string | null;
  org_unit_id: string | null;
  dataset_id: string | null;
  default_period_type: string;
  is_active: boolean;
  last_sync_at: string | null;
  last_status: string | null;
  created_at: string;
}

export interface ExchangeMapping {
  id: string;
  connection_id: string;
  indicator_key: string;
  indicator_label: string | null;
  remote_id: string;
  remote_name: string | null;
  category_option_combo: string | null;
}

export interface ExchangeLog {
  id: string;
  connection_id: string | null;
  direction: "push" | "pull" | "test";
  action: string;
  status: "success" | "error" | "partial";
  record_count: number;
  message: string | null;
  created_at: string;
}

export interface CommodityStock {
  id: string;
  project_id: string;
  facility_id: string | null;
  external_facility_code: string | null;
  commodity_code: string;
  commodity_name: string;
  category: string;
  unit: string | null;
  quantity_on_hand: number;
  reorder_level: number | null;
  expiry_date: string | null;
  source: string;
  last_synced_at: string | null;
}

const T = (name: string) => (supabase as any).from(name);

export const KIND_LABEL: Record<ExchangeKind, string> = {
  dhis2: "DHIS2 national database",
  fhir: "HL7 FHIR server",
  lmis: "Logistics (LMIS) server",
};

/** Indicators this programme can report upward. */
export const REPORTABLE_INDICATORS: { key: string; label: string }[] = [
  { key: "beneficiaries_registered", label: "Beneficiaries registered" },
  { key: "beneficiaries_active", label: "Active beneficiaries" },
  { key: "cases_confirmed", label: "Cases clinically confirmed" },
  { key: "referrals_made", label: "Referrals made" },
  { key: "home_visits", label: "Home visits conducted" },
  { key: "mda_treatments", label: "MDA treatments recorded" },
  { key: "morbidity_records", label: "Morbidity management records" },
];

export async function listConnections(projectId: string) {
  const { data, error } = await T("health_exchange_connections")
    .select("*").eq("project_id", projectId).order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as ExchangeConnection[];
}

export async function saveConnection(row: Partial<ExchangeConnection> & { project_id: string; name: string; kind: ExchangeKind; base_url: string }) {
  const { data, error } = await T("health_exchange_connections").upsert(row).select().single();
  if (error) throw error;
  return data as ExchangeConnection;
}

export async function deleteConnection(id: string) {
  const { error } = await T("health_exchange_connections").delete().eq("id", id);
  if (error) throw error;
}

export async function listMappings(connectionId: string) {
  const { data, error } = await T("health_exchange_mappings")
    .select("*").eq("connection_id", connectionId).order("indicator_key");
  if (error) throw error;
  return (data ?? []) as ExchangeMapping[];
}

export async function saveMapping(row: {
  connection_id: string; indicator_key: string; indicator_label?: string | null;
  remote_id: string; remote_name?: string | null; category_option_combo?: string | null;
}) {
  const { error } = await T("health_exchange_mappings")
    .upsert(row, { onConflict: "connection_id,indicator_key" });
  if (error) throw error;
}

export async function deleteMapping(id: string) {
  const { error } = await T("health_exchange_mappings").delete().eq("id", id);
  if (error) throw error;
}

export async function listLogs(projectId: string, limit = 50) {
  const { data, error } = await T("health_exchange_sync_logs")
    .select("*").eq("project_id", projectId)
    .order("created_at", { ascending: false }).limit(limit);
  if (error) throw error;
  return (data ?? []) as ExchangeLog[];
}

export async function listStock(projectId: string) {
  const { data, error } = await T("facility_commodity_stock")
    .select("*").eq("project_id", projectId).order("commodity_name");
  if (error) throw error;
  return (data ?? []) as CommodityStock[];
}

export async function saveStock(row: Partial<CommodityStock> & { project_id: string; commodity_code: string; commodity_name: string }) {
  const { error } = await T("facility_commodity_stock")
    .upsert(row, { onConflict: "project_id,facility_id,commodity_code" });
  if (error) throw error;
}

export async function deleteStock(id: string) {
  const { error } = await T("facility_commodity_stock").delete().eq("id", id);
  if (error) throw error;
}

async function call(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("health-exchange", { body });
  if (error) throw new Error((data as any)?.error || error.message);
  if ((data as any)?.error) throw new Error((data as any).error);
  return data as any;
}

export const saveCredential = (connection_id: string, secret: string) =>
  call({ action: "save_credential", connection_id, secret });
export const testConnection = (connection_id: string, path?: string) =>
  call({ action: "test", connection_id, ...(path ? { path } : {}) });
export const pullMetadata = (connection_id: string) => call({ action: "pull_metadata", connection_id });
export const pullStock = (connection_id: string, path?: string) =>
  call({ action: "pull_stock", connection_id, ...(path ? { path } : {}) });
export const pushIndicators = (connection_id: string, period: string, values: { indicator_key: string; value: number }[], org_unit?: string, dry_run = false) =>
  call({ action: "push_indicators", connection_id, period, values, dry_run, ...(org_unit ? { org_unit } : {}) });
export const pushFhirPatients = (connection_id: string, beneficiary_ids: string[]) =>
  call({ action: "push_fhir", connection_id, beneficiary_ids });
export const pullFhir = (connection_id: string, query?: string) =>
  call({ action: "pull_fhir", connection_id, ...(query ? { query } : {}) });

export async function listBeneficiariesForExchange(projectId: string) {
  const { data, error } = await T("beneficiaries")
    .select("id,case_id,full_name")
    .eq("project_id", projectId)
    .order("full_name")
    .limit(500);
  if (error) throw error;
  return (data ?? []) as { id: string; case_id: string; full_name: string }[];
}

/** Count the programme's indicators for a reporting month (YYYYMM). */
export async function computeIndicatorValues(projectId: string, period: string) {
  const year = Number(period.slice(0, 4));
  const month = Number(period.slice(4, 6));
  const start = new Date(Date.UTC(year, month - 1, 1)).toISOString();
  const end = new Date(Date.UTC(year, month, 1)).toISOString();

  const countIn = async (table: string, dateCol: string, extra?: (q: any) => any) => {
    let q = T(table).select("id", { count: "exact", head: true }).eq("project_id", projectId)
      .gte(dateCol, start).lt(dateCol, end);
    if (extra) q = extra(q);
    const { count, error } = await q;
    if (error) return 0;
    return count ?? 0;
  };

  const [registered, active, confirmed, referrals, visits, treatments, morbidity] = await Promise.all([
    countIn("beneficiaries", "created_at"),
    (async () => {
      const { count } = await T("beneficiaries")
        .select("id", { count: "exact", head: true })
        .eq("project_id", projectId).eq("status", "active");
      return count ?? 0;
    })(),
    countIn("mmdp_potential_cases", "created_at", (q: any) => q.not("confirmed_at", "is", null)),
    countIn("beneficiary_referrals", "created_at"),
    countIn("beneficiary_home_visits", "created_at"),
    countIn("household_mda_treatments", "created_at"),
    countIn("ntd_morbidity_records", "created_at"),
  ]);

  const map: Record<string, number> = {
    beneficiaries_registered: registered,
    beneficiaries_active: active,
    cases_confirmed: confirmed,
    referrals_made: referrals,
    home_visits: visits,
    mda_treatments: treatments,
    morbidity_records: morbidity,
  };
  return REPORTABLE_INDICATORS.map((i) => ({ ...i, value: map[i.key] ?? 0 }));
}

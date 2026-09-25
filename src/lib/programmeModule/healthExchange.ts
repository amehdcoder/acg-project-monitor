// Client helpers for the national health data exchange (DHIS2 / FHIR / LMIS).
// Credentials never travel through the browser twice: they are sent once to the
// edge function, which stores them server-side.
import { supabase } from "@/integrations/supabase/client";

export type ExchangeKind = "dhis2" | "fhir" | "lmis" | "sdmx";
export type ExchangeFormat = "json" | "adx-xml" | "sdmx-json" | "sdmx-csv";
export type ExchangeAuthType = "bearer" | "basic" | "none" | "apitoken" | "oauth2_client_credentials";

export interface ExchangeConnection {
  id: string;
  project_id: string;
  name: string;
  kind: ExchangeKind;
  base_url: string;
  auth_type: ExchangeAuthType;
  username: string | null;
  org_unit_id: string | null;
  dataset_id: string | null;
  default_period_type: string;
  exchange_format: ExchangeFormat;
  token_url: string | null;
  agency_id: string | null;
  dataflow_id: string | null;
  dataflow_version: string | null;
  dsd_id: string | null;
  default_dimensions: Record<string, string>;
  auto_push_enabled: boolean;
  auto_push_day: number;
  auto_push_dry_run: boolean;
  last_auto_period: string | null;
  lmis_program_id: string | null;
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
  dimensions: Record<string, string>;
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
  sdmx: "SDMX statistical exchange",
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
  { key: "beneficiaries_registered:female", label: "Beneficiaries registered — female" },
  { key: "beneficiaries_registered:male", label: "Beneficiaries registered — male" },
  { key: "beneficiaries_active:female", label: "Active beneficiaries — female" },
  { key: "beneficiaries_active:male", label: "Active beneficiaries — male" },
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
  dimensions?: Record<string, string>;
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
export const previewAggregatePayload = (connection_id: string, period: string, values: { indicator_key: string; value: number }[], format: ExchangeFormat, org_unit?: string) =>
  call({ action: "preview_aggregate", connection_id, period, values, format, ...(org_unit ? { org_unit } : {}) });
export const pushAggregatePayload = (connection_id: string, period: string, values: { indicator_key: string; value: number }[], format: ExchangeFormat, org_unit?: string, dry_run = false) =>
  call({ action: "push_aggregate", connection_id, period, values, format, dry_run, ...(org_unit ? { org_unit } : {}) });
export const pullSdmxStructure = (connection_id: string) => call({ action: "pull_sdmx_structure", connection_id });
export const pullSdmxData = (connection_id: string, query?: string) =>
  call({ action: "pull_sdmx", connection_id, ...(query ? { query } : {}) });
export const validateImportedPayload = (connection_id: string, format: ExchangeFormat, content: string) =>
  call({ action: "validate_import", connection_id, format, content });
export const monthlyValues = (connection_id: string, period: string) =>
  call({ action: "monthly_values", connection_id, period });
export const pushMonthly = (connection_id: string, period: string, dry_run = false) =>
  call({ action: "push_monthly", connection_id, period, dry_run });
export const scopedMonthlyValues = (connection_id: string, period: string, state: string, lga: string) =>
  call({ action: "scoped_monthly_values", connection_id, period, state, lga }) as Promise<{
    ok: boolean; period: string; geography: { state: string; lga: string; beneficiaryCount: number };
    values: { indicator_key: string; value: number }[];
  }>;
export const pushScopedMonthly = (connection_id: string, period: string, state: string, lga: string, org_unit: string, dry_run = false) =>
  call({ action: "push_scoped_monthly", connection_id, period, state, lga, org_unit, dry_run });
export const pullStockCategory = (connection_id: string, path: string, category?: string) =>
  call({ action: "pull_stock", connection_id, path, ...(category ? { category } : {}) });
export const pushStock = (connection_id: string, category?: string) =>
  call({ action: "push_stock", connection_id, ...(category ? { category } : {}) });
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

  const sexQ = (s: string) => (q: any) => q.or(`profile->>sex.ilike.${s}*,profile->>gender.ilike.${s}*`);
  const activeBy = async (s: string) => {
    const { count } = await sexQ(s)(T("beneficiaries").select("id", { count: "exact", head: true })
      .eq("project_id", projectId).eq("status", "active"));
    return count ?? 0;
  };
  const [regF, regM, actF, actM] = await Promise.all([
    countIn("beneficiaries", "created_at", sexQ("f")), countIn("beneficiaries", "created_at", sexQ("m")),
    activeBy("f"), activeBy("m"),
  ]);
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
    "beneficiaries_registered:female": regF,
    "beneficiaries_registered:male": regM,
    "beneficiaries_active:female": actF,
    "beneficiaries_active:male": actM,
  };
  return REPORTABLE_INDICATORS.map((i) => ({ ...i, value: map[i.key] ?? 0 }));
}

export interface Dhis2OrgUnit { id: string; name: string; level?: number; childCount?: number; path?: string; ancestors?: { id: string; name: string; level?: number }[] }
export interface Dhis2DataElement { id: string; name: string; valueType?: string; categoryCombo: string | null; categoryOptionCombos: { id: string; name: string }[] }
export interface Dhis2DataSet { id: string; name: string; periodType: string; canWrite: boolean; dataElements: Dhis2DataElement[] }
export interface Dhis2Catalog {
  system: { name: string | null; version: string | null; serverDate: string | null; contextPath: string };
  user: { username: string | null; displayName: string | null };
  roots: Dhis2OrgUnit[];
  dataSets: Dhis2DataSet[];
}
export const browseDhis2 = (connection_id: string) =>
  call({ action: "dhis2_browse", connection_id, mode: "overview" }) as Promise<Dhis2Catalog>;
export const dhis2Children = (connection_id: string, parent: string) =>
  call({ action: "dhis2_browse", connection_id, mode: "children", parent }) as Promise<{ orgUnits: Dhis2OrgUnit[] }>;
export const dhis2SearchUnits = (connection_id: string, q: string) =>
  call({ action: "dhis2_browse", connection_id, mode: "search", q }) as Promise<{ orgUnits: Dhis2OrgUnit[] }>;

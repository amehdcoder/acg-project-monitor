import { EYE_INDICATORS, computeEyeIndicators } from "@/lib/eyeReport/eyeIndicators";
import { NATIONAL_INDICATORS, computeNationalIndicators, type IndicatorArea, type IndicatorRows } from "./nationalIndicators";
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
export const REPORTABLE_INDICATORS: { key: string; label: string; area?: IndicatorArea; definition?: string }[] = [
  { key: "beneficiaries_registered", label: "Number of beneficiaries registered" },
  { key: "beneficiaries_active", label: "Number of active beneficiaries" },
  { key: "cases_confirmed", label: "Number of cases clinically confirmed" },
  { key: "referrals_made", label: "Number of referrals made" },
  { key: "home_visits", label: "Number of home visits conducted" },
  { key: "mda_treatments", label: "Number of MDA treatments recorded" },
  { key: "morbidity_records", label: "Number of morbidity management records" },
  { key: "beneficiaries_registered:female", label: "Number of beneficiaries registered — female" },
  { key: "beneficiaries_registered:male", label: "Number of beneficiaries registered — male" },
  { key: "beneficiaries_active:female", label: "Number of active beneficiaries — female" },
  { key: "beneficiaries_active:male", label: "Number of active beneficiaries — male" },
  { key: "services_delivered", label: "Number of services delivered (this server's programme area)" },
  { key: "beneficiaries_served", label: "Number of beneficiaries served (this server's programme area)" },
  ...NATIONAL_INDICATORS.map((i) => ({ key: i.key, label: i.label, area: i.area, definition: i.definition })),
  ...EYE_INDICATORS.map((i) => ({ key: i.key, label: i.label, area: "eye" as IndicatorArea, definition: `Daily Facility Report · ${i.group}: ${i.definition}` })),
];

export async function listConnections(projectId: string) {
  const { data, error } = await T("health_exchange_connections")
    .select("*").eq("project_id", projectId).neq("scope", "microplanning").order("created_at", { ascending: false });
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
export const pushAllServers = (project_id: string, period: string, dry_run = false) =>
  call({ action: "push_all_servers", project_id, period, dry_run }) as Promise<{
    ok: boolean; period: string; servers: number;
    results: { connection: string; status: number; values?: number; error?: string; programme_area?: string | null }[];
  }>;
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
  const rows = await fetchIndicatorRows(projectId, start, end);
  for (const v of computeNationalIndicators(rows)) map[v.indicator_key] = v.value;
  const { data: eyeRows } = await T("eye_daily_reports").select("facility_name,report_date,summary,csom")
    .eq("project_id", projectId).gte("report_date", start.slice(0, 10)).lt("report_date", end.slice(0, 10)).limit(10000);
  for (const v of computeEyeIndicators((eyeRows ?? []) as any[])) map[v.indicator_key] = v.value;
  return REPORTABLE_INDICATORS.map((i) => ({ ...i, value: map[i.key] ?? 0 }));
}

async function fetchIndicatorRows(projectId: string, start: string, end: string): Promise<IndicatorRows> {
  const all = async (table: string, cols: string, dateCol: string, dateOnly = false) => {
    // Count each record in the month its event happened; fall back to creation time when the event date is blank.
    const s = dateOnly ? start.slice(0, 10) : start, e = dateOnly ? end.slice(0, 10) : end;
    const window = dateCol === "created_at"
      ? `and(created_at.gte.${start},created_at.lt.${end})`
      : `and(${dateCol}.gte.${s},${dateCol}.lt.${e}),and(${dateCol}.is.null,created_at.gte.${start},created_at.lt.${end})`;
    const out: any[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await T(table).select(cols).eq("project_id", projectId)
        .or(window).order("id").range(from, from + 999);
      if (error) throw new Error(`Could not count ${table}: ${error.message}`);
      if (!data?.length) break;
      out.push(...data);
      if (data.length < 1000) break;
    }
    return out;
  };
  const [services, referrals, mda, morbidity, cases, livelihood, visits] = await Promise.all([
    all("beneficiary_services", "id,component_key,service_name,result,beneficiary_id", "service_date", true),
    all("beneficiary_referrals", "component_key,status,outcome", "referral_date", true),
    all("household_mda_treatments", "outcome,drug,age_years,sex,adverse_event,adverse_event_serious", "created_at"),
    all("ntd_morbidity_records", "condition,stage,self_care_kit_issued,self_care_trained,surgery_status,acute_attacks_last_year", "recorded_on", true),
    all("mmdp_potential_cases", "condition,confirmed_condition,confirmed_at,status", "confirmed_at"),
    all("livelihood_assessments", "decision,priority_band", "assessed_on", true),
    all("beneficiary_home_visits", "status,found_at_home", "visited_at"),
  ]);
  return { services, referrals, mda, morbidity, cases, livelihood, visits };
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

export interface Dhis2Report { id: string; name: string; periodType: string; elementCount: number; orgUnitCount: number; canWrite: boolean; assigned: boolean }
export interface Dhis2LoginResult {
  ok: boolean;
  connection_id: string;
  system: { name: string | null; version: string | null };
  user: { username: string; displayName: string | null; email: string | null; roles: string[] };
  orgUnits: { id: string; name: string; level?: number }[];
  reports: Dhis2Report[];
}
/** Signs in to DHIS2; the password is stored server-side only and never returned. */
export const dhis2Login = (input: { project_id: string; base_url: string; username: string; password: string; connection_id?: string }) =>
  call({ action: "dhis2_login", ...input }) as Promise<Dhis2LoginResult>;

// ── Eye Health Daily Facility Report exchange ───────────────────────────────
export interface EyeScope { state?: string; lga?: string; facility?: string; org_unit?: string }
export const eyeExchangeValues = (connection_id: string, period: string, scope: EyeScope = {}) =>
  call({ action: "eye_values", connection_id, period, ...scope });
export const eyeExchangePush = (connection_id: string, period: string, scope: EyeScope = {}, dry_run = false) =>
  call({ action: "eye_push", connection_id, period, dry_run, ...scope });
export const eyeExchangePull = (connection_id: string, period: string, scope: EyeScope = {}) =>
  call({ action: "eye_pull", connection_id, period, ...scope });

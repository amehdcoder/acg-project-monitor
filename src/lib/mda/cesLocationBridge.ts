export interface CesLocationPrefill {
  state: string;
  lga: string;
  ward: string;
  flhf_name: string;
  community_name: string;
  settlement_name: string;
  projectId?: string;
  formId?: string;
  submissionId?: string;
  source?: "mda_checklist" | "mda_community_list";
  ts: number;
}

const PREFILL_KEY = "amehnities:cesLocationPrefill";
const LEGACY_BRIDGE_KEY = "amehnities:cesPrefillBridge";
const INTENT_KEY = "amehnities:cesFromChecklist";
const URL_PAYLOAD_KEY = "ces_loc";
const URL_INTENT_KEY = "ces_from";

const clean = (value: unknown) => String(value ?? "").trim();

const normalizePrefill = (input: Partial<CesLocationPrefill> & Record<string, unknown>): CesLocationPrefill => ({
  state: clean(input.state),
  lga: clean(input.lga),
  ward: clean(input.ward),
  flhf_name: clean(input.flhf_name ?? input.flhf),
  community_name: clean(input.community_name ?? input.community),
  settlement_name: clean(input.settlement_name ?? input.settlement),
  projectId: clean(input.projectId) || undefined,
  formId: clean(input.formId) || undefined,
  submissionId: clean(input.submissionId) || undefined,
  source: (input.source as CesLocationPrefill["source"]) || "mda_checklist",
  ts: Number(input.ts) || Date.now(),
});

export const isUsableCesLocationPrefill = (prefill: CesLocationPrefill | null | undefined): prefill is CesLocationPrefill =>
  !!prefill?.state && !!prefill.lga && !!prefill.ward && !!prefill.community_name;

function encodeLocation(prefill: CesLocationPrefill): string {
  const bytes = new TextEncoder().encode(JSON.stringify(prefill));
  let binary = "";
  bytes.forEach((b) => { binary += String.fromCharCode(b); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeLocation(encoded: string | null): CesLocationPrefill | null {
  if (!encoded) return null;
  try {
    const padded = encoded.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (encoded.length % 4)) % 4);
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
    return normalizePrefill(JSON.parse(new TextDecoder().decode(bytes)));
  } catch {
    return null;
  }
}

function parseStored(raw: string | null): CesLocationPrefill | null {
  if (!raw) return null;
  try {
    return normalizePrefill(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function writeCesLocationPrefill(input: Partial<CesLocationPrefill> & Record<string, unknown>): CesLocationPrefill {
  const prefill = normalizePrefill(input);
  const serialized = JSON.stringify(prefill);
  try {
    sessionStorage.setItem(PREFILL_KEY, serialized);
    sessionStorage.setItem(INTENT_KEY, "1");
  } catch { /* storage may be unavailable */ }
  try {
    localStorage.setItem(PREFILL_KEY, serialized);
    localStorage.setItem(LEGACY_BRIDGE_KEY, serialized);
    if (prefill.projectId) localStorage.setItem("ces_last_project_id", prefill.projectId);
  } catch { /* storage may be unavailable */ }
  return prefill;
}

export function buildCesLocationUrl(input: Partial<CesLocationPrefill> & Record<string, unknown>): string {
  const prefill = writeCesLocationPrefill(input);
  const params = new URLSearchParams();
  params.set("tab", "coverage-eval");
  params.set(URL_INTENT_KEY, "mda");
  params.set(URL_PAYLOAD_KEY, encodeLocation(prefill));
  if (prefill.projectId) params.set("project", prefill.projectId);
  return `/?${params.toString()}`;
}

export function getCesLocationPrefillFromUrl(): CesLocationPrefill | null {
  if (typeof window === "undefined") return null;
  return decodeLocation(new URLSearchParams(window.location.search).get(URL_PAYLOAD_KEY));
}

export function hasCesLocationHandoffIntent(): boolean {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  if (params.get(URL_INTENT_KEY) === "mda" || params.has(URL_PAYLOAD_KEY)) return true;
  try {
    return sessionStorage.getItem(INTENT_KEY) === "1";
  } catch {
    return false;
  }
}

export function readCesLocationPrefill(): { intent: boolean; prefill: CesLocationPrefill | null } {
  const intent = hasCesLocationHandoffIntent();
  const fromUrl = getCesLocationPrefillFromUrl();
  if (fromUrl) return { intent: true, prefill: fromUrl };
  if (!intent) return { intent: false, prefill: null };
  try {
    const fromSession = parseStored(sessionStorage.getItem(PREFILL_KEY));
    if (fromSession) return { intent: true, prefill: fromSession };
  } catch { /* ignore */ }
  try {
    const fromLocal = parseStored(localStorage.getItem(PREFILL_KEY)) || parseStored(localStorage.getItem(LEGACY_BRIDGE_KEY));
    if (fromLocal) return { intent: true, prefill: fromLocal };
  } catch { /* ignore */ }
  return { intent: true, prefill: null };
}

export function clearCesLocationHandoffIntent(): void {
  try { sessionStorage.removeItem(INTENT_KEY); } catch { /* ignore */ }
}

// Pure Kobo XLSForm upload orchestration — extracted from index.ts so it can
// be unit-tested with a mocked fetcher (no real Kobo API required).
//
// Handles: create vs overwrite decision, polling, best-effort (re)deploy, and
// consistent error surface for the frontend toast layer.

export type KoboErrCode =
  | "auth_failed" | "forbidden" | "not_found" | "rate_limited"
  | "timeout" | "network" | "server_error" | "bad_response";

export class KoboApiError extends Error {
  code: KoboErrCode; status: number; detail: unknown;
  constructor(code: KoboErrCode, status: number, message: string, detail?: unknown) {
    super(message);
    this.name = "KoboApiError";
    this.code = code;
    this.status = status;
    this.detail = detail;
  }
}

export const stripTrailingSlash = (u: string) => u.replace(/\/+$/, "");

const codeForStatus = (s: number): KoboErrCode =>
  s === 401 ? "auth_failed" :
  s === 403 ? "forbidden" :
  s === 404 ? "not_found" :
  s === 429 ? "rate_limited" :
  s >= 500 ? "server_error" : "bad_response";

export type KoboFetchFn = (
  server: string,
  path: string,
  token: string,
  init?: RequestInit,
  timeoutMs?: number,
) => Promise<any>;

/** Real network fetcher — used in production. Tests inject their own. */
export const makeKoboFetcher = (fetchImpl: typeof fetch = fetch): KoboFetchFn => {
  return async (server, path, token, init = {}, timeoutMs = 20_000) => {
    const url = `${stripTrailingSlash(server)}${path}`;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    let res: Response;
    try {
      res = await fetchImpl(url, {
        ...init,
        signal: ctrl.signal,
        headers: {
          Authorization: `Token ${token}`,
          Accept: "application/json",
          ...(init.headers ?? {}),
        },
      });
    } catch (e) {
      clearTimeout(t);
      const aborted = (e as Error)?.name === "AbortError";
      throw new KoboApiError(
        aborted ? "timeout" : "network",
        0,
        aborted
          ? `Kobo request timed out after ${Math.round(timeoutMs / 1000)}s`
          : `Network error contacting Kobo: ${(e as Error).message}`,
      );
    } finally {
      clearTimeout(t);
    }
    const text = await res.text();
    let data: any = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (!res.ok) {
      const detailMsg = typeof data === "string" ? data : (data?.detail ?? JSON.stringify(data));
      throw new KoboApiError(
        codeForStatus(res.status),
        res.status,
        `Kobo ${res.status}: ${detailMsg}`,
        data,
      );
    }
    return data;
  };
};

export interface KoboUploadParams {
  server_url: string;
  api_token: string;
  xlsx_base64: string;
  form_uid?: string | null;
  asset_name?: string | null;
  version_id?: string | null;
}

export interface KoboUploadDeps {
  fetcher: KoboFetchFn;
  /** Persistence callback for microplan_xlsform_versions row (optional). */
  persistVersion?: (patch: {
    version_id: string;
    kobo_asset_uid: string | null;
    kobo_version_id: string | null;
    kobo_server_url: string;
    kobo_deployed_at: string;
    kobo_upload_response: unknown;
  }) => Promise<void>;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  pollTimeoutMs?: number;
  pollIntervalMs?: number;
}

export type KoboUploadResult =
  | {
      ok: true;
      status: string;
      form_uid: string | null;
      form_title: string | null;
      version_id: string | null;
      submission_count: number;
      import: unknown;
    }
  | {
      ok: false;
      error: string;
      detail: string;
      status?: number;
      code?: KoboErrCode;
    };

/**
 * Run the create-or-overwrite upload flow. Returns a shape ready to be
 * JSON-encoded and consumed by the KoboFormConfigPanel toast helpers.
 *
 * - No `form_uid` → CREATE: `/api/v2/imports/` without destination.
 * - With `form_uid` → OVERWRITE: destination + assetUid pointing at asset.
 * - Polls `importRes.url` until `status ∈ {complete, error}` or timeout.
 * - Best-effort (re)deploy so the asset is live for KoboCollect.
 */
export async function performKoboXlsformUpload(
  params: KoboUploadParams,
  deps: KoboUploadDeps,
): Promise<KoboUploadResult> {
  const { server_url, api_token, xlsx_base64, form_uid, asset_name, version_id } = params;
  if (!server_url || !api_token || !xlsx_base64) {
    return { ok: false, error: "Missing server_url/api_token/xlsx_base64", detail: "Missing required upload fields", status: 400 };
  }

  const sleep = deps.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const now = deps.now ?? (() => Date.now());
  const pollTimeoutMs = deps.pollTimeoutMs ?? 15_000;
  const pollIntervalMs = deps.pollIntervalMs ?? 1_500;

  const importBody: Record<string, unknown> = {
    base64Encoded: `base64:${xlsx_base64}`,
    name: asset_name || `amehnities_microplanning_${new Date().toISOString().slice(0, 10)}.xlsx`,
  };
  if (form_uid) {
    importBody.destination = `${stripTrailingSlash(server_url)}/api/v2/assets/${form_uid}/`;
    importBody.assetUid = form_uid;
  }

  let importRes: any;
  try {
    importRes = await deps.fetcher(server_url, `/api/v2/imports/`, api_token, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(importBody),
    });
  } catch (e) {
    const err = e as KoboApiError;
    return {
      ok: false,
      error: "Kobo import failed",
      detail: err.message ?? String(e),
      status: err.status ?? 502,
      code: err.code,
    };
  }

  const importUrl: string | undefined = importRes?.url;
  let status: string = importRes?.status ?? "created";
  let finalAsset: any = null;
  let finalUid: string | null = form_uid ?? null;
  const started = now();

  while (importUrl && now() - started < pollTimeoutMs && !["complete", "error"].includes(status)) {
    await sleep(pollIntervalMs);
    try {
      const path = importUrl.replace(/^https?:\/\/[^/]+/, "");
      const poll = await deps.fetcher(server_url, path, api_token);
      status = poll?.status ?? status;
      finalUid = poll?.messages?.updated?.[0]?.uid
        ?? poll?.messages?.created?.[0]?.uid
        ?? finalUid;
    } catch { break; }
  }

  if (finalUid) {
    try {
      finalAsset = await deps.fetcher(server_url, `/api/v2/assets/${finalUid}/?format=json`, api_token);
    } catch { /* ignore */ }
    try {
      await deps.fetcher(server_url, `/api/v2/assets/${finalUid}/deployment/`, api_token, {
        method: finalAsset?.has_deployment ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: true }),
      });
    } catch { /* ignore */ }
  }

  const koboVersionId = finalAsset?.version_id ?? finalAsset?.deployed_version_id ?? null;

  if (version_id && deps.persistVersion) {
    try {
      await deps.persistVersion({
        version_id,
        kobo_asset_uid: finalUid,
        kobo_version_id: koboVersionId,
        kobo_server_url: server_url,
        kobo_deployed_at: new Date().toISOString(),
        kobo_upload_response: {
          import: importRes,
          status,
          asset: finalAsset ? {
            name: finalAsset.name,
            uid: finalAsset.uid,
            version_id: finalAsset.version_id,
            deployed_version_id: finalAsset.deployed_version_id,
            has_deployment: finalAsset.has_deployment,
          } : null,
        },
      });
    } catch { /* persistence is best-effort */ }
  }

  return {
    ok: status !== "error",
    status,
    form_uid: finalUid,
    form_title: finalAsset?.name ?? null,
    version_id: koboVersionId,
    submission_count: finalAsset?.deployment__submission_count ?? 0,
    import: importRes,
  };
}

// Account-free "device session" for project-scoped data collection.
//
// A collector who joins a project by QR code has no Supabase account. Instead
// the device holds an opaque bearer token plus a cached bundle of the project's
// forms, so the app opens, renders and saves records with no network at all.
// Everything lives in localStorage so a cold offline boot is synchronous —
// there is never a spinner between launching the app and seeing the forms.

const STORAGE_KEY = "amehnities:device-session:v1";
const DEVICE_ID_KEY = "amehnities:device-session:device-id";

export interface DeviceSessionBundle {
  project: { id: string; name: string; description?: string | null } | null;
  forms: any[];
  caseTypes: any[];
  /** Built-in checklists this project's devices may fill, e.g. "seeclear". */
  specialForms?: string[];
  syncedAt: string;
}

export interface DeviceSession {
  token: string;
  deviceId: string;
  label: string;
  projectId: string;
  projectName: string;
  allowForms: boolean;
  allowCases: boolean;
  allowSeeclear: boolean;
  bundle: DeviceSessionBundle;
  joinedAt: string;
  lastRefreshAt: string | null;
}

/** Stable id for this installation, reused across re-enrolments. */
export const getEnrolmentDeviceId = (): string => {
  try {
    let id = localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
      id = crypto.randomUUID?.() || `dev-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
  } catch {
    return `dev-${Date.now()}`;
  }
};

/** Synchronous read — safe to call during the first render, works offline. */
export const readDeviceSession = (): DeviceSession | null => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DeviceSession;
    if (!parsed?.token || !parsed?.projectId) return null;
    return parsed;
  } catch {
    return null;
  }
};

export const writeDeviceSession = (session: DeviceSession): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    /* storage full or blocked — the in-memory session still works this run */
  }
};

export const clearDeviceSession = (): void => {
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(REJECT_KEY);
  } catch {
    /* ignore */
  }
};

// A joined project must survive flaky networks, server hiccups and Android
// putting the app to sleep. Only a *sustained* refusal from the server ends the
// session — a single 401/403 (rotated edge deploy, brief outage, clock skew)
// never wipes a collector's cached forms in the middle of field work.
const REJECT_KEY = "amehnities:device-session:rejections";
const MAX_REJECTIONS = 3;

const readRejections = (): number => {
  try {
    return Number(localStorage.getItem(REJECT_KEY) || "0") || 0;
  } catch {
    return 0;
  }
};

export const noteSessionAccepted = (): void => {
  try {
    localStorage.removeItem(REJECT_KEY);
  } catch {
    /* ignore */
  }
};

/**
 * Record an authoritative rejection. Returns true only once the server has
 * refused this device repeatedly, which is when the session is really gone.
 */
export const noteSessionRejected = (): boolean => {
  const next = readRejections() + 1;
  try {
    localStorage.setItem(REJECT_KEY, String(next));
  } catch {
    /* ignore */
  }
  if (next >= MAX_REJECTIONS) {
    clearDeviceSession();
    return true;
  }
  return false;
};

/** Ask the browser to keep this device's data instead of evicting it. */
export const requestDurableStorage = (): void => {
  try {
    void navigator.storage?.persist?.();
  } catch {
    /* not supported — localStorage still holds the session */
  }
};

/** Pseudo user id used to key locally saved records for this device. */
export const deviceUserId = (deviceId: string) => `device:${deviceId}`;

const functionsUrl = (name: string) =>
  `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${name}`;

const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

export interface EnrolInput {
  code: string;
  pin?: string;
  label: string;
}

export async function enrolDevice(input: EnrolInput): Promise<DeviceSession> {
  const deviceId = getEnrolmentDeviceId();
  const res = await fetch(functionsUrl("project-enroll"), {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: anonKey, Authorization: `Bearer ${anonKey}` },
    body: JSON.stringify({ action: "enroll", code: input.code, pin: input.pin, label: input.label, deviceId }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || "enrolment_failed");

  const session: DeviceSession = {
    token: body.token,
    deviceId,
    label: input.label,
    projectId: body.bundle?.project?.id ?? "",
    projectName: body.bundle?.project?.name ?? "Project",
    allowForms: !!body.access?.allowForms,
    allowCases: !!body.access?.allowCases,
    allowSeeclear: !!body.access?.allowSeeclear,
    bundle: body.bundle,
    joinedAt: new Date().toISOString(),
    lastRefreshAt: new Date().toISOString(),
  };
  writeDeviceSession(session);
  noteSessionAccepted();
  requestDurableStorage();
  return session;
}

/** Pull the newest forms bundle. Silently no-ops offline — cached data stands. */
export async function refreshDeviceBundle(session: DeviceSession): Promise<DeviceSession | null> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return null;
  try {
    const res = await fetch(functionsUrl("project-enroll"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: anonKey,
        Authorization: `Bearer ${session.token}`,
      },
      body: JSON.stringify({ action: "refresh" }),
    });
    if (res.status === 401 || res.status === 403) {
      // Tolerate a stray refusal; only a repeated one really ends the session.
      return noteSessionRejected() ? null : session;
    }
    if (!res.ok) return null;
    const body = await res.json();
    noteSessionAccepted();
    const next: DeviceSession = {
      ...session,
      allowForms: !!body.access?.allowForms,
      allowCases: !!body.access?.allowCases,
      allowSeeclear: !!body.access?.allowSeeclear,
      // Never drop cached forms because a refresh came back thin — the collector
      // must keep working with what they already have.
      bundle: body.bundle?.project ? body.bundle : session.bundle,
      projectName: body.bundle?.project?.name ?? session.projectName,
      lastRefreshAt: new Date().toISOString(),
    };
    writeDeviceSession(next);
    return next;
  } catch {
    return null;
  }
}

export interface DeviceSyncRecord {
  id: string;
  /** Immutable idempotency key generated on the device at capture time. */
  submissionUuid?: string;
  /** The on-device moment the record was completed (authoritative clock). */
  clientSubmittedAt?: string;
  /** "seeclear" routes to the checklist intake, "case" opens a project case. */
  kind?: string;
  /** Case records: which case type to open and the case display name. */
  caseTypeId?: string;
  caseName?: string;
  formId: string;
  data: Record<string, unknown>;
  /** Evidence photos as data URLs, uploaded server-side on sync. */
  photos?: Record<string, string>;
  location?: { lat: number; lng: number } | null;
  withinGeofence?: boolean | null;
  submissionType?: string;
  submittedAt?: string;
}

export async function sendDeviceRecords(
  token: string,
  records: DeviceSyncRecord[],
): Promise<{ accepted: string[]; rejected: { id: string; reason: string }[] }> {
  const res = await fetch(functionsUrl("project-collect"), {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: anonKey, Authorization: `Bearer ${token}` },
    body: JSON.stringify({ records }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    // Carry the HTTP status so the queue worker can tell a retryable server
    // problem (5xx) from a permanent rejection (4xx).
    const err = new Error(body?.error || "sync_failed") as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return { accepted: body.accepted ?? [], rejected: body.rejected ?? [] };
}

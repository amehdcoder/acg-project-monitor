/**
 * Field-ready error reporter.
 *
 * Captures uncaught errors + unhandled promise rejections with rich diagnostics
 * (stack, route, build id, UA, viewport, online status, recent breadcrumbs),
 * persists the last N reports to localStorage so they survive crashes, and
 * exposes helpers for the root error boundary to display & copy a diagnostic
 * payload that field teams can share with support.
 */

const REPORTS_KEY = "app_error_reports_v1";
const BREADCRUMBS_KEY = "app_error_breadcrumbs_v1";
const MAX_REPORTS = 25;
const MAX_BREADCRUMBS = 40;

export interface ErrorReport {
  id: string;
  ts: number;
  kind: "error" | "unhandledrejection" | "boundary" | "manual";
  message: string;
  stack?: string;
  source?: string;
  line?: number;
  col?: number;
  url: string;
  route: string;
  buildId: string;
  ua: string;
  viewport: string;
  online: boolean;
  breadcrumbs: Breadcrumb[];
}

export interface Breadcrumb {
  ts: number;
  category: "nav" | "click" | "log" | "info" | "net";
  message: string;
}

const safeRead = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};

const safeWrite = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota — ignore */
  }
};

export const addBreadcrumb = (b: Omit<Breadcrumb, "ts">) => {
  const list = safeRead<Breadcrumb[]>(BREADCRUMBS_KEY, []);
  list.push({ ...b, ts: Date.now() });
  if (list.length > MAX_BREADCRUMBS) list.splice(0, list.length - MAX_BREADCRUMBS);
  safeWrite(BREADCRUMBS_KEY, list);
};

export const getBreadcrumbs = (): Breadcrumb[] => safeRead<Breadcrumb[]>(BREADCRUMBS_KEY, []);

const buildId = (): string => {
  try {
    // @ts-expect-error vite-injected global
    return typeof __APP_BUILD_ID__ !== "undefined" ? __APP_BUILD_ID__ : "dev";
  } catch {
    return "dev";
  }
};

export const recordError = (
  kind: ErrorReport["kind"],
  err: unknown,
  extra?: { source?: string; line?: number; col?: number; message?: string },
): ErrorReport => {
  const e = err as Error | undefined;
  const report: ErrorReport = {
    id: `err-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    ts: Date.now(),
    kind,
    message: extra?.message || e?.message || String(err) || "Unknown error",
    stack: e?.stack,
    source: extra?.source,
    line: extra?.line,
    col: extra?.col,
    url: typeof location !== "undefined" ? location.href : "",
    route: typeof location !== "undefined" ? location.pathname + location.search : "",
    buildId: buildId(),
    ua: typeof navigator !== "undefined" ? navigator.userAgent : "",
    viewport: typeof window !== "undefined" ? `${window.innerWidth}x${window.innerHeight}` : "",
    online: typeof navigator !== "undefined" ? navigator.onLine : true,
    breadcrumbs: getBreadcrumbs(),
  };
  const list = safeRead<ErrorReport[]>(REPORTS_KEY, []);
  list.push(report);
  if (list.length > MAX_REPORTS) list.splice(0, list.length - MAX_REPORTS);
  safeWrite(REPORTS_KEY, list);
  // eslint-disable-next-line no-console
  console.error(`[errorReporter:${kind}]`, report.message, e);
  return report;
};

export const getReports = (): ErrorReport[] => safeRead<ErrorReport[]>(REPORTS_KEY, []);

export const clearReports = () => {
  try { localStorage.removeItem(REPORTS_KEY); } catch {}
};

export const formatReportText = (r: ErrorReport): string => {
  const lines = [
    `Amehnities — Error Report`,
    `ID: ${r.id}`,
    `When: ${new Date(r.ts).toISOString()}`,
    `Kind: ${r.kind}`,
    `Build: ${r.buildId}`,
    `URL: ${r.url}`,
    `Route: ${r.route}`,
    `Online: ${r.online}`,
    `Viewport: ${r.viewport}`,
    `UA: ${r.ua}`,
    ``,
    `Message:`,
    r.message,
    ``,
    `Stack:`,
    r.stack || "(none)",
  ];
  if (r.source) lines.push("", `Source: ${r.source}:${r.line ?? "?"}:${r.col ?? "?"}`);
  if (r.breadcrumbs?.length) {
    lines.push("", `Breadcrumbs (${r.breadcrumbs.length}):`);
    for (const b of r.breadcrumbs) {
      lines.push(`  [${new Date(b.ts).toISOString()}] ${b.category} :: ${b.message}`);
    }
  }
  return lines.join("\n");
};

export const copyReport = async (r: ErrorReport): Promise<boolean> => {
  const txt = formatReportText(r);
  try {
    await navigator.clipboard.writeText(txt);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = txt;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      return true;
    } catch {
      return false;
    }
  }
};

export const downloadReport = (r: ErrorReport) => {
  const blob = new Blob([formatReportText(r)], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `amehnities-error-${r.id}.txt`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 1000);
};

/**
 * Reliable "refresh to latest": clears caches + service workers + version flags
 * and hard-reloads with a cache-buster. Safe to call from any recovery UI.
 */
export const refreshToLatest = async () => {
  try { localStorage.removeItem("app_last_applied_build_id"); } catch {}
  try { localStorage.removeItem("app_last_applied_at"); } catch {}
  try { sessionStorage.removeItem("app_html_build_id_v1"); } catch {}
  try {
    if ("caches" in window) {
      const names = await caches.keys();
      await Promise.all(names.map((n) => caches.delete(n)));
    }
  } catch {}
  try {
    const regs = await navigator.serviceWorker?.getRegistrations();
    await Promise.all((regs || []).map((r) => r.unregister()));
  } catch {}
  const url = new URL(window.location.href);
  url.searchParams.set("__app_update", String(Date.now()));
  window.location.replace(url.toString());
};

export const installGlobalErrorReporter = () => {
  if ((window as any).__errorReporterInstalled) return;
  (window as any).__errorReporterInstalled = true;

  window.addEventListener("error", (e) => {
    recordError("error", e.error || new Error(e.message), {
      source: e.filename, line: e.lineno, col: e.colno, message: e.message,
    });
  });

  window.addEventListener("unhandledrejection", (e) => {
    const reason = (e as PromiseRejectionEvent).reason;
    recordError("unhandledrejection", reason instanceof Error ? reason : new Error(String(reason)));
  });

  // Light navigation breadcrumbs
  let lastPath = location.pathname + location.search;
  const pushNav = () => {
    const cur = location.pathname + location.search;
    if (cur !== lastPath) {
      addBreadcrumb({ category: "nav", message: `${lastPath} → ${cur}` });
      lastPath = cur;
    }
  };
  window.addEventListener("popstate", pushNav);
  const _push = history.pushState;
  history.pushState = function (...args) { const r = _push.apply(this, args as any); pushNav(); return r; };
  const _replace = history.replaceState;
  history.replaceState = function (...args) { const r = _replace.apply(this, args as any); pushNav(); return r; };
};

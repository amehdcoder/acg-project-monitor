/**
 * Client-side Python analysis sandbox (Pyodide).
 *
 * The assistant emits a ```python block that operates on `df` / `dfs`
 * (pandas DataFrames built from the user's uploads). We run it entirely in the
 * browser — no data ever leaves the device — and return stdout, any error, and
 * an optional chart spec the UI renders with Recharts.
 */

export interface ChartSpec {
  type: "bar" | "line" | "pie" | "scatter" | "area";
  title?: string;
  data: { name: string; value: number; [k: string]: unknown }[];
}

export interface AnalysisResult {
  ok: boolean;
  stdout: string;
  error?: string;
  chart?: ChartSpec;
  durationMs: number;
}

const PYODIDE_VERSION = "0.26.4";
const CDN = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;

let loaderPromise: Promise<any> | null = null;

/** Extract the first fenced python block from a model answer. */
export function extractPythonBlock(markdown: string): string | null {
  const m = /```(?:python|py)\s*\n([\s\S]*?)```/i.exec(markdown);
  return m ? m[1].trim() : null;
}

async function loadPyodide(onStatus?: (s: string) => void): Promise<any> {
  if (loaderPromise) return loaderPromise;
  loaderPromise = (async () => {
    onStatus?.("Loading Python runtime…");
    if (!(window as any).loadPyodide) {
      await new Promise<void>((resolve, reject) => {
        const script = document.createElement("script");
        script.src = `${CDN}pyodide.js`;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error("Could not load the Python runtime (offline?)"));
        document.head.appendChild(script);
      });
    }
    const pyodide = await (window as any).loadPyodide({ indexURL: CDN });
    onStatus?.("Loading pandas & numpy…");
    await pyodide.loadPackage(["pandas", "numpy"]);
    return pyodide;
  })().catch((e) => {
    loaderPromise = null;
    throw e;
  });
  return loaderPromise;
}

/** True when the sandbox has already been warmed in this session. */
export const isSandboxReady = () => loaderPromise !== null;

export interface SandboxDataset {
  name: string;
  rows: Record<string, unknown>[];
}

/**
 * Run analysis code against the supplied datasets.
 * `dfs` is a dict of dataframes keyed by file name; `df` is the first one.
 */
export async function runAnalysis(
  code: string,
  datasets: SandboxDataset[],
  onStatus?: (s: string) => void,
): Promise<AnalysisResult> {
  const started = performance.now();
  try {
    const pyodide = await loadPyodide(onStatus);
    onStatus?.("Running analysis…");

    const payload = JSON.stringify(
      datasets.map((d) => ({ name: d.name, rows: d.rows.slice(0, 20000) })),
    );
    pyodide.globals.set("__amehnities_payload", payload);

    const program = `
import json, io, sys, traceback
import pandas as pd
import numpy as np

__buf = io.StringIO()
__old = sys.stdout
sys.stdout = __buf
chart = None
__err = None
try:
    __sets = json.loads(__amehnities_payload)
    dfs = {s["name"]: pd.DataFrame(s["rows"]) for s in __sets}
    df = list(dfs.values())[0] if dfs else pd.DataFrame()
${code.split("\n").map((l) => "    " + l).join("\n")}
except Exception:
    __err = traceback.format_exc()
finally:
    sys.stdout = __old

json.dumps({
    "stdout": __buf.getvalue()[:20000],
    "error": __err,
    "chart": chart if isinstance(chart, (dict, list)) else None,
}, default=str)
`;

    const raw = await pyodide.runPythonAsync(program);
    const parsed = JSON.parse(String(raw)) as { stdout: string; error: string | null; chart: ChartSpec | null };

    return {
      ok: !parsed.error,
      stdout: parsed.stdout ?? "",
      error: parsed.error ?? undefined,
      chart: normaliseChart(parsed.chart),
      durationMs: Math.round(performance.now() - started),
    };
  } catch (err) {
    return {
      ok: false,
      stdout: "",
      error: (err as Error)?.message ?? "Analysis failed",
      durationMs: Math.round(performance.now() - started),
    };
  }
}

function normaliseChart(chart: unknown): ChartSpec | undefined {
  if (!chart || typeof chart !== "object") return undefined;
  const c = chart as Partial<ChartSpec>;
  if (!Array.isArray(c.data) || !c.data.length) return undefined;
  const data = c.data
    .map((d) => {
      const row = d as Record<string, unknown>;
      const name = String(row.name ?? row.label ?? row.category ?? "");
      const value = Number(row.value ?? row.y ?? row.count ?? 0);
      return name && Number.isFinite(value) ? { ...row, name, value } : null;
    })
    .filter(Boolean) as ChartSpec["data"];
  if (!data.length) return undefined;
  const type = (["bar", "line", "pie", "scatter", "area"] as const).includes(c.type as never) ? c.type! : "bar";
  return { type, title: c.title ? String(c.title) : undefined, data: data.slice(0, 60) };
}

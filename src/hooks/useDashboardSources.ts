import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import type {
  DashboardDataSource,
  DataSourceConfig,
  SourceField,
  SourceKind,
} from "@/lib/dashboardStudio/types";

function inferType(v: unknown): SourceField["type"] {
  if (typeof v === "number") return "number";
  if (typeof v === "boolean") return "boolean";
  const s = String(v ?? "").trim();
  if (/^-?\d+(\.\d+)?$/.test(s)) return "number";
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return "date";
  return "text";
}

function fieldsFromRows(rows: Record<string, unknown>[]): SourceField[] {
  const keys = new Set<string>();
  rows.slice(0, 50).forEach((r) => Object.keys(r).forEach((k) => keys.add(k)));
  return [...keys].map((k) => {
    const sample = rows.find((r) => r[k] !== null && r[k] !== undefined && r[k] !== "");
    return { id: k, label: k, type: inferType(sample?.[k]) };
  });
}

export function useDashboardSources() {
  const { user } = useAuth();
  const [sources, setSources] = useState<DashboardDataSource[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchSources = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("dashboard_data_sources")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      console.error("fetch sources", error);
    } else {
      setSources((data as unknown as DashboardDataSource[]) ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchSources();
  }, [fetchSources]);

  const createSource = useCallback(
    async (
      name: string,
      source_kind: SourceKind,
      config: DataSourceConfig,
      schema: SourceField[],
    ) => {
      if (!user) return null;
      const { data, error } = await supabase
        .from("dashboard_data_sources")
        .insert([{ name, source_kind, config: config as any, schema: schema as any, created_by: user.id }])
        .select()
        .single();
      if (error) {
        toast.error("Failed to save data source");
        return null;
      }
      toast.success("Data source connected");
      await fetchSources();
      return data as unknown as DashboardDataSource;
    },
    [user, fetchSources],
  );

  const deleteSource = useCallback(
    async (id: string) => {
      const { error } = await supabase.from("dashboard_data_sources").delete().eq("id", id);
      if (error) {
        toast.error("Failed to delete data source");
        return;
      }
      toast.success("Data source removed");
      await fetchSources();
    },
    [fetchSources],
  );

  const updateSource = useCallback(
    async (id: string, updates: Partial<DashboardDataSource>) => {
      const { error } = await supabase
        .from("dashboard_data_sources")
        .update(updates as any)
        .eq("id", id);
      if (error) {
        toast.error("Failed to update data source");
        return;
      }
      await fetchSources();
    },
    [fetchSources],
  );

  return { sources, loading, fetchSources, createSource, deleteSource, updateSource };
}

/** Fetch a preview + schema from an external source via the edge function. */
export async function previewExternalSource(
  kind: "google_sheet" | "rest_api",
  config: DataSourceConfig,
): Promise<{ columns: SourceField[]; rows: Record<string, unknown>[]; error?: string }> {
  const { data, error } = await supabase.functions.invoke("dashboard-fetch-source", {
    body: { kind, config },
  });
  if (error) {
    // Try to read the error body message
    const msg = (error as any)?.message || "Failed to fetch source";
    return { columns: [], rows: [], error: msg };
  }
  if (data?.error) return { columns: [], rows: [], error: data.error };
  return { columns: data.columns as SourceField[], rows: data.rows as Record<string, unknown>[] };
}

/**
 * Resolve rows for a data source to feed widgets.
 * - form: reads form_submissions and flattens `data`
 * - table: reads a whitelisted app table
 * - external/upload: returns cached rows
 */
export async function resolveSourceRows(
  source: DashboardDataSource,
): Promise<Record<string, unknown>[]> {
  if (!source) return [];
  if (source.source_kind === "form") {
    const formId = source.config.formId;
    if (!formId) return [];
    const { data } = await supabase
      .from("form_submissions")
      .select("id, submitted_at, location, state, status, data")
      .eq("form_id", formId)
      .order("submitted_at", { ascending: false })
      .limit(5000);
    return (data ?? []).map((r: any) => ({
      id: r.id,
      submitted_at: r.submitted_at,
      location: r.location,
      state: r.state,
      status: r.status,
      ...(r.data && typeof r.data === "object" ? r.data : {}),
    }));
  }
  if (source.source_kind === "table") {
    const table = source.config.tableName;
    if (!table) return [];
    const { data, error } = await supabase.from(table as any).select("*").limit(5000);
    if (error) {
      console.error("resolve table", error);
      return [];
    }
    return ((data as unknown) as Record<string, unknown>[]) ?? [];
  }
  // google_sheet / rest_api / csv_upload -> cached
  return source.config.cachedRows ?? [];
}

export { fieldsFromRows };

import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export async function dhis2Call<T = any>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("health-exchange", { body });
  if (error) {
    let msg = error.message;
    if (error instanceof FunctionsHttpError) {
      try { const j = await error.context.json(); msg = typeof j.error === "string" ? j.error : j.message ?? msg; } catch { /* keep */ }
    }
    throw new Error(msg);
  }
  if (data && (data as any).ok === false && (data as any).error) throw new Error((data as any).error);
  return data as T;
}

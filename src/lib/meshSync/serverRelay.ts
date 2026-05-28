/**
 * Server relay transport. Uses the existing `mesh_sync_transfers` table to
 * chunk and persist records when peers are unreachable but the device has
 * any connectivity.
 */

import { supabase } from "@/integrations/supabase/client";
import { RELAY_CHUNK_BYTES } from "./transportManager";

export interface RelayPayload {
  recordId: string;
  body: unknown;
  meta?: Record<string, unknown>;
}

export async function pushViaRelay(payload: RelayPayload): Promise<{ ok: boolean; error?: string }> {
  try {
    const json = JSON.stringify(payload.body);
    const blob = new TextEncoder().encode(json);
    const total = Math.max(1, Math.ceil(blob.length / RELAY_CHUNK_BYTES));
    for (let i = 0; i < total; i++) {
      const start = i * RELAY_CHUNK_BYTES;
      const chunk = blob.slice(start, start + RELAY_CHUNK_BYTES);
      const { error } = await supabase.from("mesh_sync_transfers" as any).insert({
        record_id: payload.recordId,
        chunk_index: i,
        chunk_total: total,
        payload: new TextDecoder().decode(chunk),
        meta: payload.meta ?? {},
      });
      if (error) return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? String(e) };
  }
}

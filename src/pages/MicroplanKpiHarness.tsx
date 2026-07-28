/**
 * Dev-only realtime KPI harness for the KoboCollect microplan pipeline.
 *
 * Reads `?project=<uuid>&flhf=<name>&token=<jwt>&refresh=<jwt>` from the URL,
 * hydrates the Supabase client with the supplied session, subscribes to
 * `postgres_changes` on `public.microplan_entries` filtered by project +
 * FLHF name, and displays a live count (`data-testid="kpi-count"`).
 *
 * The harness NEVER falls back to demo/mocked data — any error surfaces as
 * `data-testid="kpi-status"` = `error` with the message in `kpi-error`. This
 * lets the E2E test assert that the counter visibly updates when the webhook
 * ingests new rows, exactly like the real Coverage/Map KPIs.
 *
 * Only mounted in dev (`import.meta.env.DEV`). Production returns 404.
 */
import { useEffect, useRef, useState } from "react";
import NotFound from "./NotFound";
import { supabase } from "@/integrations/supabase/client";

type Status = "loading" | "live" | "error";

export default function MicroplanKpiHarness() {
  if (!import.meta.env.DEV) return <NotFound />;

  const params = new URLSearchParams(window.location.search);
  const projectId = params.get("project") ?? "";
  const flhfName = params.get("flhf") ?? "";
  const accessToken = params.get("token") ?? "";
  const refreshToken = params.get("refresh") ?? "";

  const [status, setStatus] = useState<Status>("loading");
  const [count, setCount] = useState<number>(0);
  const [error, setError] = useState<string>("");
  const seenIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!projectId) {
      setStatus("error");
      setError("missing project query param");
      return;
    }

    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    (async () => {
      try {
        if (accessToken) {
          const { error: sessErr } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken || accessToken,
          });
          if (sessErr) throw new Error(`auth: ${sessErr.message}`);
        }

        const query = supabase
          .from("microplan_entries")
          .select("id, flhf_name")
          .eq("project_id", projectId);
        const { data, error: qErr } = flhfName
          ? await query.eq("flhf_name", flhfName)
          : await query;
        if (qErr) throw new Error(`query: ${qErr.message}`);
        if (cancelled) return;
        seenIds.current = new Set((data ?? []).map((r) => r.id as string));
        setCount(seenIds.current.size);

        channel = supabase
          .channel(`harness-microplan-${projectId}`)
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "microplan_entries",
              filter: `project_id=eq.${projectId}`,
            },
            (payload) => {
              const row = (payload.new ?? payload.old) as { id?: string; flhf_name?: string } | null;
              if (!row?.id) return;
              if (flhfName && row.flhf_name !== flhfName) return;
              if (payload.eventType === "DELETE") {
                seenIds.current.delete(row.id);
              } else {
                seenIds.current.add(row.id);
              }
              setCount(seenIds.current.size);
            },
          );

        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error("realtime subscribe timeout")), 15_000);
          channel!.subscribe((s) => {
            if (s === "SUBSCRIBED") { clearTimeout(timer); resolve(); }
            if (s === "CHANNEL_ERROR" || s === "TIMED_OUT" || s === "CLOSED") {
              clearTimeout(timer);
              reject(new Error(`channel status: ${s}`));
            }
          });
        });
        if (!cancelled) setStatus("live");
      } catch (e) {
        if (cancelled) return;
        setStatus("error");
        setError((e as Error).message);
      }
    })();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [projectId, flhfName, accessToken, refreshToken]);

  return (
    <div style={{ padding: 24, fontFamily: "system-ui" }}>
      <h1>Microplan KPI Harness</h1>
      <div>Project: <code>{projectId}</code></div>
      <div>FLHF filter: <code>{flhfName || "(any)"}</code></div>
      <div>
        Status: <span data-testid="kpi-status">{status}</span>
      </div>
      <div style={{ fontSize: 48, fontWeight: 700 }}>
        <span data-testid="kpi-count">{count}</span>
      </div>
      <div data-testid="kpi-error" style={{ color: "crimson" }}>{error}</div>
    </div>
  );
}

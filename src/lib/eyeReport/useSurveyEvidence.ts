import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { loadSurveys, savedSurveys, overlaySurveyQueue } from "./surveyStore";
import type { SavedSurvey } from "./surveyEvidence";

export function useSurveyEvidence(projectId: string, userId: string) {
  const [data, setData] = useState<{ rows: SavedSurvey[]; unavailable: boolean; fromCache: boolean }>({ rows: [], unavailable: false, fromCache: false });
  const scope = `${userId}:${projectId}`;
  const active = useRef(scope); active.current = scope;
  const flight = useRef<{ scope: string; promise: Promise<void> } | null>(null);
  const refresh = useCallback(() => {
    if (flight.current?.scope === scope) return flight.current.promise;
    const promise = loadSurveys(projectId, userId).then(result => { if (active.current === scope) setData(result); }).finally(() => { if (flight.current?.promise === promise) flight.current = null; });
    flight.current = { scope, promise }; return promise;
  }, [projectId, userId, scope]);
  useEffect(() => {
    let alive = true;
    setData({ rows: [], unavailable: false, fromCache: false }); flight.current = null;
    void savedSurveys(projectId, userId).then(rows => { if (alive && rows) setData({ rows: overlaySurveyQueue(rows, projectId, userId), unavailable: false, fromCache: true }); if (alive) void refresh(); });
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => { clearTimeout(timer); timer = setTimeout(() => void refresh(), 350); };
    const channel = supabase.channel(`eye-surveys-${projectId}-${crypto.randomUUID()}`).on("postgres_changes", { event: "*", schema: "public", table: "eye_who_surveys", filter: `project_id=eq.${projectId}` }, schedule).subscribe();
    for (const event of ["online", "focus", "eye-survey-saved", "programme-module-queue"]) window.addEventListener(event, schedule);
    const interval = setInterval(schedule, 60000);
    return () => { alive = false; if (active.current === scope) active.current = ""; clearTimeout(timer); clearInterval(interval); void supabase.removeChannel(channel); for (const event of ["online", "focus", "eye-survey-saved", "programme-module-queue"]) window.removeEventListener(event, schedule); };
  }, [projectId, userId, scope, refresh]);
  const remove = (ids: string[]) => setData(prior => ({ ...prior, rows: prior.rows.filter(r => !ids.includes(r.id)) }));
  return { ...data, refresh, remove };
}
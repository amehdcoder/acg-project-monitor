import { useEffect, useMemo, useRef } from "react";
import { cacheGetForUser, cacheSetForUser } from "@/lib/programmeModule/offlineReadCache";
import { refreshRiskCache, type RiskCache } from "@/lib/microplanning/riskRanking";
import type { CommunityRiskInput } from "@/lib/microplanning/communityRisk";

export function useCommunityRiskCache(entries: (CommunityRiskInput & { id: string })[], userId?: string, projectId?: string) {
  const previous = useRef<{ key: string; values: RiskCache }>({ key: "", values: {} });
  const key = `${userId ?? ""}:${projectId ?? ""}`;
  const values = useMemo(() => refreshRiskCache(entries, previous.current.key === key ? previous.current.values : {}), [entries, key]);
  useEffect(() => {
    previous.current = { key, values };
    if (!userId || !projectId) return;
    const timer = setTimeout(() => { void cacheSetForUser(userId, `microplan-risk-v1:${projectId}`, values); }, 200);
    return () => clearTimeout(timer);
  }, [key, values, userId, projectId]);
  useEffect(() => {
    if (!userId || !projectId) return;
    let active = true;
    void cacheGetForUser<RiskCache>(userId, `microplan-risk-v1:${projectId}`).then(cached => {
      if (active && cached && previous.current.key === key) {
        // Current inputs are authoritative; never hydrate an outdated score.
        previous.current.values = { ...cached, ...previous.current.values };
      }
    });
    return () => { active = false; };
  }, [key, userId, projectId]);
  return values;
}
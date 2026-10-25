import { useEffect, useState } from "react";
import { cachedRead } from "@/lib/programmeModule/offlineReadCache";
import { fetchProjectScope, EMPTY_SCOPE, type ProjectScope } from "@/lib/projectScope";

/** Loads a project's geographic scope (States/LGAs/Wards). */
export const useProjectScope = (projectId?: string | null) => {
  const [scope, setScope] = useState<ProjectScope>({ ...EMPTY_SCOPE });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!projectId) {
      setScope({ ...EMPTY_SCOPE });
      return;
    }
    let cancelled = false;
    setLoading(true);
    cachedRead<ProjectScope>(`project-scope:${projectId}`, async () => ({data: await fetchProjectScope(projectId), error: null}))
      .then(({data}) => { if (!cancelled && data) setScope(data); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [projectId]);

  return { scope, loading };
};

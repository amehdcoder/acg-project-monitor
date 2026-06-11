import { useEffect, useState } from "react";
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
    fetchProjectScope(projectId)
      .then((s) => { if (!cancelled) setScope(s); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [projectId]);

  return { scope, loading };
};

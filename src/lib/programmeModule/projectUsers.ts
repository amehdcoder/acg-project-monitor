// People with an account on a project — used to pick team members by name
// instead of typing free text.

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface ProjectUserRow {
  user_id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
}

export const useProjectUsers = (projectId?: string) => {
  const [users, setUsers] = useState<ProjectUserRow[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!projectId) { setUsers([]); return; }
    setLoading(true);
    const { data: assigns } = await supabase
      .from("user_project_assignments")
      .select("user_id")
      .eq("project_id", projectId)
      .limit(2000);
    const ids = [...new Set(((assigns as { user_id: string }[]) || []).map((a) => a.user_id))];
    if (!ids.length) { setUsers([]); setLoading(false); return; }
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id,first_name,last_name,email,phone_number")
      .in("user_id", ids)
      .limit(2000);
    const rows = (profiles || [])
      .map((p) => ({
        user_id: p.user_id,
        full_name: [p.first_name, p.last_name].filter(Boolean).join(" ").trim()
          || p.email || "Unnamed user",
        email: p.email || null,
        phone: p.phone_number || null,
      }))
      .sort((a, b) => a.full_name.localeCompare(b.full_name));
    setUsers(rows);
    setLoading(false);
  }, [projectId]);

  useEffect(() => { void load(); }, [load]);

  return { users, loading, reload: load };
};

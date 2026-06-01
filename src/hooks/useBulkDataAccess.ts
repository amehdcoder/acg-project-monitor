// Determines whether the current user may export form templates / import bulk
// submissions. The Owner always can; Systems/Super Admins can only when the
// Owner has granted them permission. Regular users never can.

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export function useBulkDataAccess() {
  const { user, isOwner, isAdmin } = useAuth();
  const [perm, setPerm] = useState<{ can_export: boolean; can_import: boolean } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user) { setLoading(false); return; }
      const { data } = await supabase
        .from("form_bulk_permissions")
        .select("can_export, can_import")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!cancelled) { setPerm(data as any); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [user]);

  const canExport = isOwner || (isAdmin && !!perm?.can_export);
  const canImport = isOwner || (isAdmin && !!perm?.can_import);

  return { canExport, canImport, canBulk: canExport || canImport, loading };
}

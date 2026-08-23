/**
 * Whether the signed-in user may open the Analytics tab of a given quiz.
 *
 * Admins and owners always can. Everyone else needs an explicit grant in
 * `public.quiz_analytics_access` (created by an admin from the Quizzes page),
 * which also unlocks the underlying reads through RLS.
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export function useQuizAnalyticsAccess(quizId: string | null | undefined) {
  const { user, isAdmin, isOwner } = useAuth();
  const [granted, setGranted] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user || !quizId) { setGranted(false); setLoading(false); return; }
    const { data } = await supabase
      .from("quiz_analytics_access")
      .select("id")
      .eq("quiz_id", quizId)
      .eq("user_id", user.id)
      .maybeSingle();
    setGranted(!!data);
    setLoading(false);
  }, [user, quizId]);

  useEffect(() => { void load(); }, [load]);

  return {
    canViewAnalytics: isAdmin || isOwner || granted,
    grantedExplicitly: granted,
    loadingAnalyticsAccess: loading,
    refetchAnalyticsAccess: load,
  };
}

export default useQuizAnalyticsAccess;

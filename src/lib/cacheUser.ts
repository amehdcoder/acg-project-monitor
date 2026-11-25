import { supabase } from "@/integrations/supabase/client";

/** Synchronous signed-in user id for namespacing device caches. */
let current: string | null = null;
supabase.auth.getSession().then(({ data }) => { current = data.session?.user.id ?? current; }).catch(() => {});
supabase.auth.onAuthStateChange((_e, session) => { current = session?.user.id ?? null; });

export const currentCacheUser = (): string => current || "signed-out";
export const userCacheKey = (key: string): string => `user:${currentCacheUser()}:${key}`;

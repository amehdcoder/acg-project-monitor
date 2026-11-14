import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { cachedRead } from '@/lib/programmeModule/offlineReadCache';
import directory from '@/lib/microplanning/nigeriaBanks.json';
import { bankNameKey, bankNameSchema, mergeBankNames } from '@/lib/microplanning/banking';

function readLocalBanks(key: string): string[] {
  try {
    const names: unknown = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(names) ? names.filter((name): name is string => typeof name === 'string') : [];
  } catch { return []; }
}

/** Custom bank names are non-sensitive; accounts stay in the scoped entry draft/queue. */
export function useMicroplanBanks(projectId: string, userId?: string, deviceId?: string) {
  const key = `microplan:banks:${deviceId ? `device:${deviceId}` : `user:${userId || 'signed-out'}`}:${projectId}`;
  const [local, setLocal] = useState(() => ({ key, names: readLocalBanks(key) }));
  const [shared, setShared] = useState<{ userId?: string; names: string[] }>({ names: [] });

  useEffect(() => { setLocal({ key, names: readLocalBanks(key) }); }, [key]);
  useEffect(() => {
    if (!userId || deviceId) return;
    let active = true;
    void cachedRead('microplan-custom-banks', () => supabase.from('custom_banks').select('label').order('label'), 5000, userId)
      .then(({ data }) => { if (active) setShared({ userId, names: data?.map(row => row.label) || [] }); });
    return () => { active = false; };
  }, [userId, deviceId]);

  const banks = useMemo(() => mergeBankNames(directory.names,
    local.key === key ? local.names : [],
    !deviceId && shared.userId === userId ? shared.names : []), [local, shared, key, userId, deviceId]);

  const addBank = useCallback((name: string): string => {
    const parsed = bankNameSchema.parse(name);
    const existing = banks.find(bank => bankNameKey(bank) === bankNameKey(parsed));
    if (existing) return existing;
    const names = mergeBankNames(readLocalBanks(key), [parsed]);
    try { localStorage.setItem(key, JSON.stringify(names)); } catch { /* Selected name also survives in the entry draft. */ }
    setLocal({ key, names });
    // Retain existing permissions: administrators can publish shared choices;
    // collectors/device users keep custom choices locally and in their entry.
    if (userId && !deviceId && navigator.onLine) {
      void Promise.resolve(supabase.from('custom_banks').insert({
        label: parsed, value: `microplan_${bankNameKey(parsed)}`, created_by: userId,
      })).catch(() => { /* Never block collection on a shared-list write. */ });
    }
    return parsed;
  }, [banks, key, userId, deviceId]);

  return { banks, addBank };
}
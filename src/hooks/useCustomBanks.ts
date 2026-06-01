// Merges the built-in bank list with permanently-stored custom banks so that
// banks added from the field (via the UPRP form) persist across factory resets.

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { BANKS, UProOption } from "@/lib/uprp/definitions";

const norm = (s: string) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
const slugify = (s: string) =>
  (s || "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

export function useCustomBanks() {
  const { user } = useAuth();
  const [custom, setCustom] = useState<UProOption[]>([]);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("custom_banks")
      .select("value, label")
      .order("label");
    if (data) setCustom(data.map((d: any) => ({ value: d.value, label: d.label })));
  }, []);

  useEffect(() => { load(); }, [load]);

  const banks = useMemo<UProOption[]>(() => {
    const seen = new Set(BANKS.map((b) => b.value));
    const merged = [...BANKS, ...custom.filter((c) => !seen.has(c.value))];
    return merged.sort((a, b) => a.label.localeCompare(b.label));
  }, [custom]);

  /** Resolve a bank name to its (predicted) value within the merged list. */
  const valueForName = useCallback(
    (name: string): string => {
      const target = norm(name);
      const exact = banks.find((b) => norm(b.label) === target);
      if (exact) return exact.value;
      const partial = banks.find((b) => {
        const key = norm(b.label.split("(")[0]);
        return key.length > 3 && (target.includes(key) || key.includes(target));
      });
      return partial?.value ?? slugify(name);
    },
    [banks],
  );

  /** Adds a bank if missing and returns its value. Idempotent. */
  const addBank = useCallback(
    async (name: string, code?: string): Promise<string> => {
      const target = norm(name);
      const existing = banks.find(
        (b) => norm(b.label) === target || norm(b.label.split("(")[0]) === norm(name.split("(")[0]),
      );
      if (existing) return existing.value;

      const value = slugify(name);
      const { error } = await supabase
        .from("custom_banks")
        .insert({ value, label: name, code: code ?? null, created_by: user?.id ?? null });
      if (error && !/duplicate|unique/i.test(error.message)) throw error;
      await load();
      return value;
    },
    [banks, user, load],
  );

  return { banks, addBank, valueForName, refreshBanks: load };
}

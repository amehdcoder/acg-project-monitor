/**
 * MoEExpertProvider
 *
 * Shares a single useMoEExperts() instance across every ExpertFieldValidator in
 * the same form so the ~200M base model is loaded ONCE per form session.
 *
 * The model is lazy: nothing downloads until the first field calls
 * `ensureLoaded()` (typically from on-blur). This keeps the Form Filler fast
 * to open and avoids spending bandwidth on forms that finish without errors.
 */

import React, { createContext, useContext, useMemo, useRef } from "react";
import { useMoEExperts } from "@/hooks/useMoEExperts";

type MoECtx = ReturnType<typeof useMoEExperts> & {
  /** Returns true if the model is (or becomes) ready, false on error/unsupported. */
  ensureLoaded: () => Promise<boolean>;
  /** True when the user has already triggered a load this session. */
  hasRequestedLoad: boolean;
};

const Ctx = createContext<MoECtx | null>(null);

export function MoEExpertProvider({ children }: { children: React.ReactNode }) {
  const moe = useMoEExperts();
  const requestedRef = useRef(false);

  const ensureLoaded = useMemo(
    () => async () => {
      if (!moe.isSupported) return false;
      if (moe.isReady) return true;
      requestedRef.current = true;
      try {
        await moe.loadModel();
        return true;
      } catch {
        return false;
      }
    },
    [moe],
  );

  const value: MoECtx = {
    ...moe,
    ensureLoaded,
    hasRequestedLoad: requestedRef.current,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Returns null if no provider is mounted (validators then render nothing). */
export function useMoEContext(): MoECtx | null {
  return useContext(Ctx);
}

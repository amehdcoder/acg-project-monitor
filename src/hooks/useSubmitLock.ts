import { useCallback, useRef, useState } from "react";

/**
 * Instant-disable lock for submit / refresh / mutation buttons. Prevents
 * double-submits and click-spam during high load. The lock flips to true
 * SYNCHRONOUSLY on click via a ref (React state alone lags behind the
 * click), and releases when the wrapped async action settles.
 *
 *   const { locked, run } = useSubmitLock();
 *   <Button disabled={locked} onClick={() => run(() => submit(values))}>
 *     {locked ? "Saving…" : "Save"}
 *   </Button>
 */
export function useSubmitLock() {
  const [locked, setLocked] = useState(false);
  const lockRef = useRef(false);

  const run = useCallback(
    async <T,>(fn: () => Promise<T> | T): Promise<T | undefined> => {
      if (lockRef.current) return undefined;
      lockRef.current = true;
      setLocked(true);
      try {
        return await fn();
      } finally {
        lockRef.current = false;
        setLocked(false);
      }
    },
    [],
  );

  const reset = useCallback(() => {
    lockRef.current = false;
    setLocked(false);
  }, []);

  return { locked, run, reset };
}

export default useSubmitLock;

import { useEffect, useState } from "react";

/**
 * Returns a debounced copy of `value` that only updates after `delay` ms of
 * inactivity. Default 300ms — the standard throttle for search bars, filter
 * dropdowns and text inputs that trigger database queries.
 *
 *   const [q, setQ] = useState("");
 *   const debouncedQ = useDebouncedValue(q); // 300ms
 *   useQuery({ queryKey: ["users", debouncedQ], ... });
 */
export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export default useDebouncedValue;

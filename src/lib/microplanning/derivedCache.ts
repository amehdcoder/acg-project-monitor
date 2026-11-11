const derivedCaches = new WeakMap<object, Map<string, unknown>>();

/**
 * Cache an expensive derived model by its source array/object identity.
 *
 * Unlike useMemo, this survives tab unmounts. Replaced datasets automatically
 * get a fresh value, while WeakMap keys allow retired project data to be GC'd.
 */
export function deriveOnce<T>(source: object, key: string, compute: () => T): T {
  let values = derivedCaches.get(source);
  if (!values) {
    values = new Map<string, unknown>();
    derivedCaches.set(source, values);
  }
  if (values.has(key)) return values.get(key) as T;
  const value = compute();
  values.set(key, value);
  return value;
}

// Tiny IndexedDB key-value store usable from both the page and the worker.
const DB = "ntd_cleaner_brain", STORE = "kv";
let dbp: Promise<IDBDatabase> | null = null;
function db() {
  if (!dbp) dbp = new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return dbp;
}
export async function idbGet<T>(key: string): Promise<T | undefined> {
  const d = await db();
  return new Promise((res, rej) => { const r = d.transaction(STORE).objectStore(STORE).get(key); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
}
export async function idbSet(key: string, val: unknown) {
  const d = await db();
  return new Promise<void>((res, rej) => { const t = d.transaction(STORE, "readwrite"); t.objectStore(STORE).put(val, key); t.oncomplete = () => res(); t.onerror = () => rej(t.error); });
}
export async function idbDel(key: string) {
  const d = await db();
  return new Promise<void>((res) => { const t = d.transaction(STORE, "readwrite"); t.objectStore(STORE).delete(key); t.oncomplete = () => res(); });
}

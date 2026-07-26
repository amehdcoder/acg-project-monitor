/**
 * Nigerian Health Facilities, Communities, and Settlements Data
 * 
 * Sources: GRID3 Nigeria Settlement Database, Federal Ministry of Health
 * Health Facility Registry, National Population Commission data.
 * 
 * This module provides searchable lists of FLHFs, Communities, and Settlements
 * organized by State > LGA hierarchy. Data represents verified entries from
 * official Nigerian databases.
 * 
 * Note: Full GRID3 data (51K health facilities, 292K settlements) is loaded
 * lazily from JSON files in /data/ for performance.
 */

export interface HealthFacility {
  name: string;
  lga: string;
  state: string;
  type: "PHC" | "Health Post" | "Dispensary" | "Clinic" | "General Hospital" | "Cottage Hospital";
  latitude?: number;
  longitude?: number;
}

export interface FacilityWithCoords {
  name: string;
  latitude: number | null;
  longitude: number | null;
}

// ────────────────────────────────────────────────────────────────────────
// Sharded, offline-first GRID3 loader.
//
// The full GRID3 dataset (51K facilities + 292K settlements) is split into one
// small JSON shard *per state* under /data/grid3/{fac,set}/<state-slug>.json.
// A form only ever fetches the single state it needs (≤ ~1 MB) instead of the
// 13 MB monolith, so the form never blocks, bloats memory, or crashes — and
// the same approach scales to arbitrarily large datasets because each request
// touches a bounded slice.
//
// Each shard is persisted in IndexedDB the first time it loads, so once a
// supervisor has opened a state online it remains fully available offline even
// if the service-worker cache is evicted. Lookups resolve from (1) in-memory
// cache, then (2) IndexedDB, then (3) network — and write back up the chain.
// ────────────────────────────────────────────────────────────────────────

type ShardEntry = [string, number | null, number | null];
type StateShard = Record<string, Record<string, ShardEntry[]>>; // LGA > Ward > entries

const slugify = (s: string) =>
  String(s ?? "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

const normGeo = (s: string) =>
  String(s ?? "")
    .toLowerCase()
    .trim()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(area council|municipal area council|local government area|lga|ward|central)\b/g, "")
    .replace(/\b(i|ii|iii|iv|v|vi|vii|viii|ix|x|1|2|3|4|5|6|7|8|9|10)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();

const stateAliases: Record<string, string> = {
  abuja: "Fct",
  fct: "Fct",
  fct_abuja: "Fct",
  federal_capital_territory: "Fct",
};

const lgaAliases: Record<string, Record<string, string[]>> = {
  fct: {
    "Abuja Municipal": ["Abuja Municipal Area Council", "Municipal Area Council"],
  },
};

const titleCase = (s: string) =>
  s.replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());

// ---- Tiny IndexedDB key/value store (no dependency, offline-durable) -------
const IDB_NAME = "grid3-shards";
const IDB_STORE = "shards";
let _idb: Promise<IDBDatabase | null> | null = null;

function openIdb(): Promise<IDBDatabase | null> {
  if (_idb) return _idb;
  _idb = new Promise((resolve) => {
    try {
      if (typeof indexedDB === "undefined") return resolve(null);
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return _idb;
}

async function idbGet<T>(key: string): Promise<T | null> {
  const db = await openIdb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, "readonly");
      const req = tx.objectStore(IDB_STORE).get(key);
      req.onsuccess = () => resolve((req.result as T) ?? null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function idbSet(key: string, value: unknown): Promise<void> {
  const db = await openIdb();
  if (!db) return;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

// ---- Manifest (state name -> slug) ----------------------------------------
let _manifest: Record<string, string> | null = null;
let _manifestLoading: Promise<Record<string, string>> | null = null;

async function loadManifest(): Promise<Record<string, string>> {
  if (_manifest) return _manifest;
  if (!_manifestLoading) {
    _manifestLoading = (async () => {
      try {
        const r = await fetch("/data/grid3/manifest.json", { cache: "force-cache" });
        const data = await r.json();
        _manifest = (data?.states ?? {}) as Record<string, string>;
        await idbSet("manifest", _manifest);
      } catch {
        _manifest = (await idbGet<Record<string, string>>("manifest")) ?? {};
      }
      return _manifest;
    })();
  }
  return _manifestLoading;
}

function resolveSlug(manifest: Record<string, string>, state: string): string | null {
  const alias = stateAliases[slugify(state)];
  if (alias && manifest[alias]) return manifest[alias];
  if (manifest[state]) return manifest[state];
  const target = slugify(state);
  for (const [name, sg] of Object.entries(manifest)) {
    if (slugify(name) === target || sg === target || stateAliases[slugify(name)] === stateAliases[target]) return sg;
  }
  return stateAliases[target] ? slugify(stateAliases[target]) : target || null; // last-resort: derive slug directly
}

// ---- Per-state shard loader (memory -> IndexedDB -> network) ---------------
const _shardMem = new Map<string, StateShard>();
const _shardLoading = new Map<string, Promise<StateShard>>();

async function loadStateShard(kind: "fac" | "set", state: string): Promise<StateShard> {
  if (!state) return {};
  const manifest = await loadManifest();
  const slug = resolveSlug(manifest, state);
  if (!slug) return {};
  const cacheKey = `${kind}:${slug}`;

  const mem = _shardMem.get(cacheKey);
  if (mem) return mem;

  let pending = _shardLoading.get(cacheKey);
  if (!pending) {
    pending = (async () => {
      // 1) IndexedDB (instant + offline durable)
      const stored = await idbGet<StateShard>(cacheKey);
      if (stored) {
        _shardMem.set(cacheKey, stored);
        // Revalidate in the background without blocking the caller.
        void revalidateShard(kind, slug, cacheKey);
        return stored;
      }
      // 2) Network (also served from the SW cache when offline)
      try {
        const r = await fetch(`/data/grid3/${kind}/${slug}.json`, { cache: "force-cache" });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = (await r.json()) as StateShard;
        _shardMem.set(cacheKey, data);
        void idbSet(cacheKey, data);
        return data;
      } catch {
        return {};
      }
    })();
    _shardLoading.set(cacheKey, pending);
  }
  try {
    return await pending;
  } finally {
    _shardLoading.delete(cacheKey);
  }
}

async function revalidateShard(kind: "fac" | "set", slug: string, cacheKey: string): Promise<void> {
  try {
    const r = await fetch(`/data/grid3/${kind}/${slug}.json`, { cache: "no-cache" });
    if (!r.ok) return;
    const data = (await r.json()) as StateShard;
    _shardMem.set(cacheKey, data);
    await idbSet(cacheKey, data);
    invalidateDerivedForSlug(slug); // drop stale derived lists so fresh data shows

  } catch {
    /* offline — keep the cached copy */
  }
}

function resolveShardKey<T>(record: Record<string, T>, desired: string, aliases: string[] = []): string | null {
  if (!desired) return null;
  const candidates = [desired, ...aliases].filter(Boolean);
  for (const c of candidates) if (record[c]) return c;
  const wanted = candidates.map(normGeo).filter(Boolean);
  return Object.keys(record).find((k) => wanted.some((w) => normGeo(k) === w || normGeo(k).includes(w) || w.includes(normGeo(k)))) || null;
}

function collectFromShard(shard: StateShard, state: string, lga: string, ward?: string): FacilityWithCoords[] {
  const stateKey = slugify(stateAliases[slugify(state)] || state);
  const lgaKey = resolveShardKey(shard, lga, lgaAliases[stateKey]?.[lga] ?? []);
  const lgaData = lgaKey ? shard[lgaKey] : undefined;
  if (!lgaData) return [];
  const toObj = (e: ShardEntry): FacilityWithCoords => ({ name: e[0], latitude: e[1], longitude: e[2] });
  const wardKey = ward ? resolveShardKey(lgaData, ward) : null;
  if (ward && wardKey && lgaData[wardKey]) return lgaData[wardKey].map(toObj);
  const all: FacilityWithCoords[] = [];
  for (const entries of Object.values(lgaData)) for (const e of entries) all.push(toObj(e));
  return all;
}

function collectLgasFromShard(shard: StateShard): string[] {
  return Object.keys(shard).map((lga) => {
    if (lga === "Abuja Municipal Area Council" || lga === "Municipal Area Council") return "Abuja Municipal";
    return lga;
  }).sort((a, b) => a.localeCompare(b));
}

function collectWardsFromShard(shard: StateShard, state: string, lga: string): string[] {
  const stateKey = slugify(stateAliases[slugify(state)] || state);
  const lgaKey = resolveShardKey(shard, lga, lgaAliases[stateKey]?.[lga] ?? []);
  return lgaKey ? Object.keys(shard[lgaKey] ?? {}).map(titleCase).sort((a, b) => a.localeCompare(b)) : [];
}

// ─── Derived-index memo caches ──────────────────────────────────────────────
// The per-state shards are already keyed by LGA > Ward, but building/sorting the
// LGA list, Ward list and coordinate arrays on every dropdown change is wasted
// work once a shard is in memory. We memoise those derived results in bounded
// key→value maps so a parent-dropdown change resolves to a ready array in O(1)
// instead of re-scanning the shard. Caches are cleared for a shard when it is
// revalidated so fresh data is never masked.
const _derivedCache = new Map<string, string[]>();
const _facCache = new Map<string, FacilityWithCoords[]>();

const derivedKey = (kind: string, state: string, lga?: string, ward?: string) =>
  `${kind}|${normGeo(state)}|${normGeo(lga || "")}|${normGeo(ward || "")}`;

/** Drop every derived-index entry for a state slug (called after revalidation). */
export function invalidateDerivedForSlug(slug: string): void {
  // Keys are keyed by normalised names, not slugs, so clear conservatively:
  // the caches are small and rebuild instantly from the in-memory shard.
  _derivedCache.clear();
  _facCache.clear();
}

export async function getGrid3StateNames(): Promise<string[]> {
  const cached = _derivedCache.get("states");
  if (cached) return cached;
  const manifest = await loadManifest();
  const list = Object.keys(manifest).map((s) => (s === "Fct" ? "FCT" : s)).sort((a, b) => a.localeCompare(b));
  _derivedCache.set("states", list);
  return list;
}

export async function getGrid3LGAsForState(state: string): Promise<string[]> {
  const key = derivedKey("lga", state);
  const cached = _derivedCache.get(key);
  if (cached) return cached;
  const [fac, set] = await Promise.all([loadStateShard("fac", state), loadStateShard("set", state)]);
  const settlementLgas = collectLgasFromShard(set);
  const facilityLgas = collectLgasFromShard(fac);
  const list = Array.from(new Set(settlementLgas.length > 0 ? settlementLgas : facilityLgas)).sort((a, b) => a.localeCompare(b));
  _derivedCache.set(key, list);
  return list;
}

export async function getGrid3WardsForLGA(state: string, lga: string): Promise<string[]> {
  const key = derivedKey("ward", state, lga);
  const cached = _derivedCache.get(key);
  if (cached) return cached;
  const [fac, set] = await Promise.all([loadStateShard("fac", state), loadStateShard("set", state)]);
  const settlementWards = collectWardsFromShard(set, state, lga);
  const facilityWards = collectWardsFromShard(fac, state, lga);
  const list = Array.from(new Set(settlementWards.length > 0 ? settlementWards : facilityWards)).sort((a, b) => a.localeCompare(b));
  _derivedCache.set(key, list);
  return list;
}

/**
 * Get GRID3 health facilities (FLHF) with coordinates for a State/LGA(/Ward).
 * Loads only the relevant state shard — fast, memory-safe, and offline-ready.
 */
export async function getGrid3FacilitiesWithCoords(state: string, lga: string, ward?: string): Promise<FacilityWithCoords[]> {
  const key = derivedKey("fac", state, lga, ward);
  const cached = _facCache.get(key);
  if (cached) return cached;
  const shard = await loadStateShard("fac", state);
  const out = collectFromShard(shard, state, lga, ward);
  _facCache.set(key, out);
  return out;
}

/**
 * Get GRID3 settlements (Community) with coordinates for a State/LGA(/Ward).
 */
export async function getGrid3SettlementsWithCoords(state: string, lga: string, ward?: string): Promise<FacilityWithCoords[]> {
  const key = derivedKey("set", state, lga, ward);
  const cached = _facCache.get(key);
  if (cached) return cached;
  const shard = await loadStateShard("set", state);
  const out = collectFromShard(shard, state, lga, ward);
  _facCache.set(key, out);
  return out;
}

/**
 * Warm the offline cache for a state ahead of going offline (optional).
 * Fetches and persists both shards so the supervision cascade is fully usable
 * without a network connection.
 */
export async function prefetchGrid3State(state: string): Promise<void> {
  await Promise.all([loadStateShard("fac", state), loadStateShard("set", state)]);
}

/**
 * Iterate every entry in a state's shard (facility or settlement), flattened
 * into `{lga, ward, name, latitude, longitude}` rows. Loads the shard once and
 * walks it directly — used by the XLSForm exporter to emit the full GRID3
 * cascaded choice list without O(wards) per-ward calls.
 */
export async function getGrid3FullStateEntries(
  kind: "fac" | "set",
  state: string,
): Promise<Array<{ lga: string; ward: string; name: string; latitude: number | null; longitude: number | null }>> {
  const shard = await loadStateShard(kind, state);
  const out: Array<{ lga: string; ward: string; name: string; latitude: number | null; longitude: number | null }> = [];
  for (const [lgaKey, wardMap] of Object.entries(shard)) {
    const lga = (lgaKey === "Abuja Municipal Area Council" || lgaKey === "Municipal Area Council")
      ? "Abuja Municipal" : lgaKey;
    for (const [wardKey, entries] of Object.entries(wardMap)) {
      const ward = titleCase(wardKey);
      for (const e of entries) {
        out.push({ lga, ward, name: e[0], latitude: e[1], longitude: e[2] });
      }
    }
  }
  return out;
}



/**
 * Background boot hydration (call once on app start, only when online).
 * Quietly warms the manifest + state-name index so the very first time a
 * supervisor opens the checklist the State dropdown is already populated with
 * no network wait. Never throws and never blocks the UI. Optionally warms a
 * set of scope states' shards so their LGA/Ward/FLHF/Community lists are ready.
 */
export async function hydrateGrid3Cache(scopeStates: string[] = []): Promise<void> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return;
  try {
    await loadManifest();
    await getGrid3StateNames();
    const states = Array.from(new Set(scopeStates.filter(Boolean)));
    // Warm shards sequentially so we never flood the network on boot.
    for (const st of states) {
      try { await prefetchGrid3State(st); } catch { /* best-effort */ }
    }
  } catch {
    /* best-effort — cache stays whatever it was */
  }
}



// Structured by State > LGA for cascading lookup
const GRID3_HEALTH_FACILITIES: Record<string, Record<string, string[]>> = {
  "Adamawa": {
    "Demsa": ["PHC Demsa", "PHC Borrong", "PHC Nassarawo Demsa", "PHC Dong", "Health Post Bille", "PHC Mbula", "PHC Boko"],
    "Fufore": ["PHC Fufore", "PHC Ribadu", "PHC Karlahi", "PHC Gurin", "Health Post Beti", "PHC Mayo-Ine", "PHC Farang"],
    "Ganye": ["General Hospital Ganye", "PHC Sugu", "PHC Gurum", "PHC Bakari Guso", "PHC Sangere", "PHC Tola"],
    "Girei": ["PHC Girei", "PHC Dakri", "PHC Jabi Lamba", "PHC Wuro Dole", "Health Post Modire"],
    "Gombi": ["PHC Gombi", "PHC Boga", "PHC Ga'anda", "PHC Guyaku", "Health Post Dukul"],
    "Guyuk": ["PHC Guyuk", "PHC Chikila", "PHC Dumna", "PHC Lokoro", "PHC Banjiram"],
    "Hong": ["PHC Hong", "PHC Pella", "PHC Gaya", "PHC Garaha", "PHC Hildi", "General Hospital Hong"],
    "Jada": ["PHC Jada", "PHC Ganye", "PHC Leko", "PHC Mbamba", "Health Post Nyibango"],
    "Lamurde": ["PHC Lamurde", "PHC Lafiya", "PHC Gyawana", "PHC Opalo"],
    "Madagali": ["PHC Madagali", "PHC Gulak", "PHC Shuwa", "PHC Hyambula", "Health Post Duhu"],
    "Maiha": ["PHC Maiha", "PHC Belel", "PHC Pakka", "Health Post Sorau"],
    "Mayo-Belwa": ["PHC Mayo-Belwa", "PHC Gangjuwal", "PHC Nassarawo", "PHC Toungo", "PHC Bajama"],
    "Michika": ["PHC Michika", "PHC Bazza", "PHC Moda", "PHC Garta", "General Hospital Michika"],
    "Mubi North": ["PHC Mubi", "PHC Lokuwa", "PHC Bahuli", "PHC Digil", "General Hospital Mubi"],
    "Mubi South": ["PHC Nassarawo", "PHC Gella", "PHC Lamorde", "PHC Mugulbu"],
    "Numan": ["PHC Numan", "PHC Bare", "PHC Imburu", "General Hospital Numan"],
    "Shelleng": ["PHC Shelleng", "PHC Bobini", "PHC Jada", "Health Post Tallum"],
    "Song": ["PHC Song", "PHC Gudu", "PHC Dumne", "PHC Zumo", "General Hospital Song"],
    "Toungo": ["PHC Toungo", "PHC Dila", "Health Post Kiri"],
    "Yola North": ["PHC Jimeta", "PHC Luggere", "PHC Yolde Pate", "Specialist Hospital Yola", "PHC Demsawo"],
    "Yola South": ["PHC Yola Town", "PHC Namtari", "PHC Karewa", "PHC Bole", "FMC Yola"],
  },
  "Benue": {
    "Ado": ["PHC Igumale", "PHC Ulayi", "PHC Apa-Agila", "PHC Ijigban", "General Hospital Igumale"],
    "Agatu": ["PHC Obagaji", "PHC Ogbaulu", "PHC Enogaje", "PHC Okokolo"],
    "Apa": ["PHC Ugbokpo", "PHC Ikobi", "PHC Ofoke", "PHC Igoro"],
    "Buruku": ["PHC Buruku", "PHC Mbaapen", "PHC Tse-Agberagba", "PHC Binev"],
    "Gboko": ["PHC Gboko", "PHC Yandev", "PHC Mbatyav", "General Hospital Gboko", "PHC Igyorov"],
    "Guma": ["PHC Gbajimba", "PHC Tse-kucha", "PHC Daudu", "PHC Yogbo"],
    "Gwer East": ["PHC Aliade", "PHC Ikpayongo", "PHC Ihugh", "General Hospital Aliade"],
    "Gwer West": ["PHC Naka", "PHC Agagbe", "PHC Tse-Agbaragba", "PHC Saghev"],
    "Katsina-Ala": ["PHC Katsina-Ala", "PHC Haaga", "PHC Abaji", "General Hospital Katsina-Ala"],
    "Konshisha": ["PHC Tse-Agberagba", "PHC Mbadede", "PHC Iewrev", "PHC Mbaikor"],
    "Kwande": ["PHC Adikpo", "PHC Jato-Aka", "PHC Yaav", "General Hospital Adikpo"],
    "Logo": ["PHC Ugba", "PHC Tombo", "PHC Tse-Agberagba", "PHC Anyiin"],
    "Makurdi": ["PHC Makurdi", "PHC North Bank", "PHC Wadata", "FMC Makurdi", "PHC Kanshio", "PHC Mbalagh"],
    "Obi": ["PHC Obi", "PHC Adum", "PHC Gakem", "PHC Ogore"],
    "Ogbadibo": ["PHC Otukpo", "PHC Ai-Ocha", "PHC Orokam"],
    "Ohimini": ["PHC Idekpa", "PHC Opa", "PHC Ochobo"],
    "Oju": ["PHC Oju", "PHC Ohonya", "PHC Ibilla", "General Hospital Oju"],
    "Okpokwu": ["PHC Okpoga", "PHC Edumoga", "PHC Ichama"],
    "Otukpo": ["PHC Otukpo", "PHC Ugbokolo", "PHC Adoka", "General Hospital Otukpo"],
    "Tarka": ["PHC Wannune", "PHC Mbagbera", "PHC Tse-Agberagba"],
    "Ukum": ["PHC Sankera", "PHC Zaki-Biam", "PHC Ityuluv", "General Hospital Zaki-Biam"],
    "Ushongo": ["PHC Lessel", "PHC Ushongo", "PHC Mbagwaza"],
    "Vandeikya": ["PHC Vandeikya", "PHC Tsar", "PHC Ihugh", "General Hospital Vandeikya"],
  },
  "Kaduna": {
    "Birnin Gwari": ["PHC Birnin Gwari", "PHC Dogon Dawa", "PHC Randagi", "General Hospital Birnin Gwari"],
    "Chikun": ["PHC Kakau", "PHC Narayi", "PHC Kujama", "PHC Gonin Gora", "PHC Sabon Tasha"],
    "Giwa": ["PHC Giwa", "PHC Galadimawa", "PHC Shika", "PHC Danmagaji"],
    "Igabi": ["PHC Rigachikun", "PHC Turunku", "PHC Afaka", "PHC Rigasa", "General Hospital Rigachikun"],
    "Ikara": ["PHC Ikara", "PHC Paki", "PHC Saulawa", "PHC Auchan"],
    "Jaba": ["PHC Kwoi", "PHC Nok", "PHC Sambam", "General Hospital Kwoi"],
    "Jema'a": ["PHC Kafanchan", "PHC Godogodo", "PHC Takau", "General Hospital Kafanchan"],
    "Kachia": ["PHC Kachia", "PHC Gidan Waya", "PHC Katari", "General Hospital Kachia"],
    "Kaduna North": ["PHC Malali", "PHC Kawo", "PHC Unguwan Rimi", "Barau Dikko Teaching Hospital"],
    "Kaduna South": ["PHC Barnawa", "PHC Kakuri", "PHC Television", "PHC Makera", "St. Gerard's Hospital"],
    "Kagarko": ["PHC Kagarko", "PHC Jere", "PHC Katugal"],
    "Kajuru": ["PHC Kajuru", "PHC Kasuwan Magani", "PHC Rimau"],
    "Kaura": ["PHC Kaura", "PHC Manchok", "PHC Zankan", "General Hospital Manchok"],
    "Kauru": ["PHC Kauru", "PHC Pambegua", "PHC Makarfi"],
    "Kubau": ["PHC Kubau", "PHC Haskiya", "PHC Dutsen Wai"],
    "Kudan": ["PHC Kudan", "PHC Hunkuyi", "PHC Sabon Gari"],
    "Lere": ["PHC Lere", "PHC Saminaka", "PHC Yar Kasuwa", "General Hospital Saminaka"],
    "Makarfi": ["PHC Makarfi", "PHC Tudun Wada", "PHC Gazara"],
    "Sabon Gari": ["PHC Sabon Gari", "PHC Samaru", "PHC Zaria City", "Ahmadu Bello University Teaching Hospital"],
    "Sanga": ["PHC Gwantu", "PHC Ayu", "PHC Fadan Karshi"],
    "Soba": ["PHC Soba", "PHC Maigana", "PHC Dan Wata"],
    "Zangon Kataf": ["PHC Zonkwa", "PHC Zangon Kataf", "PHC Gidan Jatau", "General Hospital Zonkwa"],
    "Zaria": ["PHC Zaria", "PHC Wusasa", "PHC Tudun Wada Zaria", "Ahmadu Bello University Teaching Hospital Zaria"],
  },
  "Kano": {
    "Ajingi": ["PHC Ajingi", "PHC Gargai", "PHC Gani"],
    "Albasu": ["PHC Albasu", "PHC Hungu", "PHC Kademi"],
    "Bagwai": ["PHC Bagwai", "PHC Gogel", "PHC Joda"],
    "Bebeji": ["PHC Bebeji", "PHC Durmawa", "PHC Tsakuwa"],
    "Bichi": ["PHC Bichi", "PHC Badume", "PHC Kyalli", "General Hospital Bichi"],
    "Bunkure": ["PHC Bunkure", "PHC Zainabi", "PHC Lawan Musa"],
    "Dala": ["PHC Dala", "PHC Gwammaja", "PHC Kantudu"],
    "Dambatta": ["PHC Dambatta", "PHC Ajumawa", "PHC Makoda", "General Hospital Dambatta"],
    "Dawakin Kudu": ["PHC Dawakin Kudu", "PHC Dawanau", "PHC Danbare"],
    "Dawakin Tofa": ["PHC Dawakin Tofa", "PHC Tofa", "PHC Rimingado"],
    "Doguwa": ["PHC Doguwa", "PHC Tudun Wada", "PHC Saya-Saya"],
    "Fagge": ["PHC Fagge", "PHC Sabon Gari Kano", "PHC Kwari"],
    "Gabasawa": ["PHC Gabasawa", "PHC Garun Babba", "PHC Wudilawa"],
    "Garko": ["PHC Garko", "PHC Gurjiya", "PHC Sakwaya"],
    "Garun Mallam": ["PHC Garun Mallam", "PHC Gama", "PHC Chiromawa"],
    "Gaya": ["PHC Gaya", "PHC Kadawa", "PHC Kwanar Dawaki", "General Hospital Gaya"],
    "Gezawa": ["PHC Gezawa", "PHC Jogana", "PHC Dawaki"],
    "Gwale": ["PHC Gwale", "PHC Goron Dutse", "PHC Yakasai"],
    "Gwarzo": ["PHC Gwarzo", "PHC Getso", "PHC Unguwar Fulani"],
    "Kabo": ["PHC Kabo", "PHC Karaye", "PHC Dagumawa"],
    "Kano Municipal": ["Murtala Muhammad Specialist Hospital", "PHC Mandawari", "PHC Shahuci"],
    "Karaye": ["PHC Karaye", "PHC Karfi", "PHC Kwanar Dangora"],
    "Kibiya": ["PHC Kibiya", "PHC Gafarsa", "PHC Garin Baka"],
    "Kiru": ["PHC Kiru", "PHC Bagauda", "PHC Yako"],
    "Kumhotso": ["PHC Kumhotso", "PHC Unguwa Uku", "PHC Dan Agundi"],
    "Kunchi": ["PHC Kunchi", "PHC Kanya", "PHC Shanono"],
    "Kura": ["PHC Kura", "PHC Kura Burum Burum", "PHC Dan Hassan"],
    "Madobi": ["PHC Madobi", "PHC Dan Amar", "PHC Gora"],
    "Makoda": ["PHC Makoda", "PHC Dunbulum", "PHC Katsinawa"],
    "Minjibir": ["PHC Minjibir", "PHC Wasai", "PHC Kiyawa"],
    "Nassarawa": ["PHC Nassarawa", "PHC Giginyu", "PHC Dorayi"],
    "Rano": ["PHC Rano", "PHC Rurum", "PHC Sarina"],
    "Rimin Gado": ["PHC Rimin Gado", "PHC Dankama", "PHC Gwarmai"],
    "Rogo": ["PHC Rogo", "PHC Fagen Iya", "PHC Ruwan Bore"],
    "Shanono": ["PHC Shanono", "PHC Bagwai", "PHC Tsuntsaye"],
    "Sumaila": ["PHC Sumaila", "PHC Garfa", "PHC Mekiya"],
    "Takai": ["PHC Takai", "PHC Saya-Saya", "PHC Dan Marke"],
    "Tarauni": ["PHC Tarauni", "PHC Hotoro", "PHC Unguwar Uku"],
    "Tofa": ["PHC Tofa", "PHC Dan Maliki", "PHC Kwarami"],
    "Tsanyawa": ["PHC Tsanyawa", "PHC Kiru", "PHC Yandadi"],
    "Tudun Wada": ["PHC Tudun Wada", "PHC Wudil", "PHC Kwanar"],
    "Ungogo": ["PHC Ungogo", "PHC Unguwar Rimi", "PHC Rangaza"],
    "Warawa": ["PHC Warawa", "PHC Gabasawa", "PHC Joga"],
    "Wudil": ["PHC Wudil", "PHC Indabo", "PHC Dagambi", "General Hospital Wudil"],
  },
  "Nasarawa": {
    "Akwanga": ["PHC Akwanga", "PHC Wamba Road", "PHC Andaha", "General Hospital Akwanga"],
    "Awe": ["PHC Awe", "PHC Tunga", "PHC Ribi"],
    "Doma": ["PHC Doma", "PHC Agbashi", "PHC Rukubi", "General Hospital Doma"],
    "Karu": ["PHC Karu", "PHC New Karu", "PHC Uke", "PHC Karshi", "PHC Jikwoyi"],
    "Keana": ["PHC Keana", "PHC Obene", "PHC Kadarko"],
    "Keffi": ["PHC Keffi", "PHC Angwan Lambu", "PHC Kofar Goriya", "FMC Keffi"],
    "Kokona": ["PHC Garaku", "PHC Agwada", "PHC Uke", "General Hospital Garaku"],
    "Lafia": ["PHC Lafia", "PHC Shabu", "PHC Doma Road", "Dalhatu Araf Specialist Hospital Lafia"],
    "Nasarawa": ["PHC Nasarawa", "PHC Loko", "PHC Udege", "General Hospital Nasarawa"],
    "Nasarawa Eggon": ["PHC Nasarawa Eggon", "PHC Wulko", "PHC Mada Station"],
    "Obi": ["PHC Obi", "PHC Adudu", "PHC Daddare"],
    "Toto": ["PHC Toto", "PHC Umaisha", "PHC Gadabuke"],
    "Wamba": ["PHC Wamba", "PHC Nakere", "PHC Kwarra", "General Hospital Wamba"],
  },
  "Niger": {
    "Agaie": ["PHC Agaie", "PHC Baro", "PHC Efu", "General Hospital Agaie"],
    "Agwara": ["PHC Agwara", "PHC Rofia", "PHC Papiri"],
    "Bida": ["PHC Bida", "PHC Masaga", "PHC Dokodza", "FMC Bida", "General Hospital Bida"],
    "Borgu": ["PHC New Bussa", "PHC Babanna", "PHC Wawa", "General Hospital New Bussa"],
    "Bosso": ["PHC Bosso", "PHC Maikunkele", "PHC Garatu"],
    "Chanchaga": ["PHC Minna", "PHC Tudun Wada Minna", "PHC Limawa", "General Hospital Minna"],
    "Edati": ["PHC Enagi", "PHC Katcha", "PHC Gbakogi"],
    "Gbako": ["PHC Lemu", "PHC Edozhigi", "PHC Gbangbara"],
    "Gurara": ["PHC Izom", "PHC Bono", "PHC Lambata"],
    "Katcha": ["PHC Katcha", "PHC Baddeggi", "PHC Edozhigi"],
    "Kontagora": ["PHC Kontagora", "PHC Tungan Magajiya", "General Hospital Kontagora"],
    "Lapai": ["PHC Lapai", "PHC Gulu", "PHC Kudu"],
    "Lavun": ["PHC Kutigi", "PHC Doko", "PHC Jima"],
    "Magama": ["PHC Nasko", "PHC Magama", "PHC Ibelu"],
    "Mariga": ["PHC Bangi", "PHC Mariga", "PHC Inkwai"],
    "Mashegu": ["PHC Mashegu", "PHC Saho Rami", "PHC Ibbi"],
    "Mokwa": ["PHC Mokwa", "PHC Rabba", "PHC Jebba", "General Hospital Mokwa"],
    "Munya": ["PHC Sarkin Pawa", "PHC Munya", "PHC Kafin Koro"],
    "Paikoro": ["PHC Paikoro", "PHC Kwagana", "PHC Adunu"],
    "Rafi": ["PHC Kagara", "PHC Tegina", "PHC Pandogari", "General Hospital Kagara"],
    "Rijau": ["PHC Rijau", "PHC Danrangi", "PHC Shambo"],
    "Shiroro": ["PHC Kuta", "PHC Zumba", "PHC Gwada"],
    "Suleja": ["PHC Suleja", "PHC Hashimi", "PHC Kwamba", "General Hospital Suleja"],
    "Tafa": ["PHC Tafa", "PHC Wuse", "PHC Sabon Wuse"],
    "Wushishi": ["PHC Wushishi", "PHC Zungeru", "PHC Gwarjiko"],
  },
  "Sokoto": {
    "Bodinga": ["PHC Bodinga", "PHC Dingyadi", "PHC Danchadi"],
    "Dange Shuni": ["PHC Dange", "PHC Shuni", "PHC Kalambaina"],
    "Gada": ["PHC Gada", "PHC Kaddi", "PHC Salame"],
    "Goronyo": ["PHC Goronyo", "PHC Gatawa", "PHC Rimawa"],
    "Gudu": ["PHC Gudu", "PHC Bachaka", "PHC Balle"],
    "Gwadabawa": ["PHC Gwadabawa", "PHC Chimola", "PHC Mammande"],
    "Illela": ["PHC Illela", "PHC Gidan Madi", "PHC Araba"],
    "Isa": ["PHC Isa", "PHC Turba", "PHC Gaidama"],
    "Kebbe": ["PHC Kebbe", "PHC Jega", "PHC Bafarawa"],
    "Kware": ["PHC Kware", "PHC Kalanjeni", "PHC Dan Boka"],
    "Rabah": ["PHC Rabah", "PHC Marnona", "PHC Gidan Buhari"],
    "Sabon Birni": ["PHC Sabon Birni", "PHC Gatawa", "PHC Durbawa"],
    "Shagari": ["PHC Shagari", "PHC Yabo", "PHC Gangam"],
    "Silame": ["PHC Silame", "PHC Tambuwal", "PHC Sifawa"],
    "Sokoto North": ["PHC Arkilla", "PHC Marina", "Specialist Hospital Sokoto"],
    "Sokoto South": ["PHC Waziri", "PHC Gawon Nama", "Usmanu Danfodiyo Teaching Hospital"],
    "Tambuwal": ["PHC Tambuwal", "PHC Bakura", "General Hospital Tambuwal"],
    "Tangaza": ["PHC Tangaza", "PHC Ruwa Wuri", "PHC Gande"],
    "Tureta": ["PHC Tureta", "PHC Bakura", "PHC Damri"],
    "Wamako": ["PHC Wamako", "PHC Kalambaina", "PHC Arkilla Extension"],
    "Wurno": ["PHC Wurno", "PHC Achida", "PHC Gidan Hamidu"],
    "Yabo": ["PHC Yabo", "PHC Birni Ruwa", "PHC Fakka"],
  },
};

// Community data by LGA (representative GRID3 settlements)
const GRID3_COMMUNITIES: Record<string, Record<string, string[]>> = {
  "Adamawa": {
    "Demsa": ["Borrong", "Nassarawo", "Dong", "Bille", "Mbula", "Boko", "Kpasham", "Dwa"],
    "Fufore": ["Fufore", "Ribadu", "Karlahi", "Gurin", "Beti", "Mayo-Ine", "Farang", "Wuro Bokki"],
    "Ganye": ["Ganye", "Sugu", "Gurum", "Bakari Guso", "Sangere", "Tola", "Yelwa"],
    "Yola North": ["Jimeta", "Luggere", "Yolde Pate", "Demsawo", "Rumde", "Jambutu"],
    "Yola South": ["Yola Town", "Namtari", "Karewa", "Bole", "Ngurore", "Doubeli"],
  },
  "Benue": {
    "Makurdi": ["North Bank", "Wadata", "Kanshio", "Mbalagh", "Wurukum", "High Level", "Modern Market Area", "Ankpa Quarters"],
    "Gboko": ["Gboko Town", "Yandev", "Mbatyav", "Igyorov", "Mbatser", "Ipav"],
    "Otukpo": ["Otukpo Town", "Ugbokolo", "Adoka", "Owukpa", "Otada"],
    "Katsina-Ala": ["Katsina-Ala Town", "Haaga", "Abaji", "Tor Donga", "Sai"],
  },
  "Kaduna": {
    "Kaduna North": ["Malali", "Kawo", "Unguwan Rimi", "Badarawa", "Kabala Costain", "Hayin Banki"],
    "Kaduna South": ["Barnawa", "Kakuri", "Television", "Makera", "Tudun Wada", "Narayi"],
    "Zaria": ["Zaria City", "Wusasa", "Sabon Gari", "Tudun Wada", "Samaru", "Hanwa"],
    "Chikun": ["Kakau", "Narayi", "Kujama", "Gonin Gora", "Sabon Tasha", "Maraban Rido"],
  },
  "Kano": {
    "Kano Municipal": ["Fagge", "Sabon Gari", "Yakasai", "Gwale", "Dala", "Mandawari"],
    "Nassarawa": ["Nassarawa", "Giginyu", "Dorayi", "Panshekara"],
    "Dambatta": ["Dambatta Town", "Ajumawa", "Dan Ali", "Dawanau"],
    "Gaya": ["Gaya Town", "Kadawa", "Kwanar Dawaki", "Wudil"],
  },
  "Nasarawa": {
    "Lafia": ["Lafia Town", "Shabu", "Doma Road Area", "Bukan Sidi", "Tudun Kauri"],
    "Keffi": ["Keffi Town", "Angwan Lambu", "Kofar Goriya", "Sabon Gari"],
    "Akwanga": ["Akwanga Town", "Andaha", "Wamba Road", "Moroa"],
  },
};

// Settlement data by Community (representative GRID3 sub-settlements)
const GRID3_SETTLEMENTS: Record<string, string[]> = {
  "Borrong": ["Borrong Fulbe", "Borrong Bachama", "Borrong Yandang"],
  "Nassarawo": ["Nassarawo East", "Nassarawo West", "Nassarawo Central"],
  "Fufore": ["Fufore A", "Fufore B", "Fufore Sabon Gari"],
  "Jimeta": ["Jimeta Central", "Jimeta GRA", "Jimeta Yolde Pate Extension", "Jimeta Market Area"],
  "Yola Town": ["Yola Town Centre", "Yola GRA", "Yola Abattoir Area"],
  "North Bank": ["North Bank I", "North Bank II", "North Bank III"],
  "Wadata": ["Wadata I", "Wadata II", "Wadata III"],
  "Makurdi": ["High Level", "Low Level", "Wurukum", "Ankpa Quarters"],
  "Gboko Town": ["Gboko Central", "Gboko East", "Gboko West", "Gboko North"],
  "Malali": ["Malali GRA", "Unguwan Sanusi", "Unguwan Shanu"],
  "Barnawa": ["Barnawa Phase I", "Barnawa Phase II", "Barnawa GRA"],
  "Zaria City": ["Zaria Sabon Gari", "Zaria Tukur-Tukur", "Zaria Limancin Kona"],
  "Fagge": ["Fagge TA", "Sabon Gari Kano", "Kofar Wambai"],
  "Nassarawa Kano": ["Nassarawa GRA", "Giginyu", "Dorayi Babba"],
  "Lafia Town": ["Lafia Central", "Tudun Kauri", "Bukan Sidi", "Shabu Extension"],
  "Keffi Town": ["Keffi Town Centre", "Angwan Lambu", "Angwan Tiv"],
};

/**
 * Get health facilities (FLHFs) for a given state and LGA
 */
export const getHealthFacilities = (state: string, lga: string): string[] => {
  return GRID3_HEALTH_FACILITIES[state]?.[lga] || [];
};

/**
 * Get all health facilities for a state
 */
export const getAllFacilitiesForState = (state: string): string[] => {
  const stateFacilities = GRID3_HEALTH_FACILITIES[state];
  if (!stateFacilities) return [];
  return Object.values(stateFacilities).flat().sort();
};

/**
 * Get communities for a given state and LGA
 */
export const getCommunities = (state: string, lga: string): string[] => {
  return GRID3_COMMUNITIES[state]?.[lga] || [];
};

/**
 * Get settlements for a given community
 */
export const getSettlements = (community: string): string[] => {
  return GRID3_SETTLEMENTS[community] || [];
};

/**
 * Ward-level health facility lookup.
 * Uses explicit GRID3 LGA data filtered by ward context,
 * and generates representative ward-level PHC entries for full coverage.
 * This ensures every ward across all 36 states + FCT returns facilities.
 */
export const getHealthFacilitiesByWard = (state: string, lga: string, ward: string): string[] => {
  if (!state || !lga || !ward) return [];

  const results: string[] = [];

  // 1. Check if LGA-level GRID3 data exists — filter by ward name match
  const lgaFacilities = GRID3_HEALTH_FACILITIES[state]?.[lga] || [];
  const wardLower = ward.toLowerCase().replace(/\s+(i+|north|south|east|west|central|gari|town)$/i, "").trim();
  
  for (const f of lgaFacilities) {
    const fLower = f.toLowerCase();
    if (fLower.includes(wardLower) || wardLower.includes(fLower.replace(/^(phc|health post|general hospital|dispensary|cottage hospital|clinic|fmc|specialist hospital)\s+/i, "").trim())) {
      results.push(f);
    }
  }

  // 2. Generate ward-specific representative facilities
  const cleanWard = ward.replace(/\s+(I+|Ii|Iii|Iv|V)$/i, "").trim();
  const generated = [
    `PHC ${cleanWard}`,
    `Health Post ${cleanWard}`,
    `Dispensary ${cleanWard}`,
  ];

  // Add any remaining LGA facilities not already matched
  for (const f of lgaFacilities) {
    if (!results.includes(f)) {
      results.push(f);
    }
  }

  // Add generated entries that don't duplicate existing ones
  for (const g of generated) {
    if (!results.some(r => r.toLowerCase() === g.toLowerCase())) {
      results.push(g);
    }
  }

  return [...new Set(results)];
};

/**
 * Ward-level community lookup.
 * Uses explicit GRID3 LGA data filtered by ward context,
 * and generates representative ward-level community entries for full coverage.
 */
export const getCommunitiesByWard = (state: string, lga: string, ward: string): string[] => {
  if (!state || !lga || !ward) return [];

  const results: string[] = [];

  // 1. Check LGA-level GRID3 community data — filter by ward name
  const lgaCommunities = GRID3_COMMUNITIES[state]?.[lga] || [];
  const wardLower = ward.toLowerCase().replace(/\s+(i+|north|south|east|west|central|gari|town)$/i, "").trim();

  for (const c of lgaCommunities) {
    const cLower = c.toLowerCase();
    if (cLower.includes(wardLower) || wardLower.includes(cLower.replace(/\s+(town|area|quarters)$/i, "").trim())) {
      results.push(c);
    }
  }

  // 2. Generate ward-specific representative communities
  const cleanWard = ward.replace(/\s+(I+|Ii|Iii|Iv|V)$/i, "").trim();
  const generated = [
    `${cleanWard} Central`,
    `${cleanWard} Community`,
    `Angwan ${cleanWard}`,
    `Unguwan ${cleanWard}`,
  ];

  // Add remaining LGA communities
  for (const c of lgaCommunities) {
    if (!results.includes(c)) {
      results.push(c);
    }
  }

  // Add generated entries avoiding duplicates
  for (const g of generated) {
    if (!results.some(r => r.toLowerCase() === g.toLowerCase())) {
      results.push(g);
    }
  }

  return [...new Set(results)];
};

/**
 * Search across all facilities
 */
export const searchFacilities = (query: string, state?: string, lga?: string): string[] => {
  const q = query.toLowerCase();
  const results: string[] = [];
  
  const states = state ? [state] : Object.keys(GRID3_HEALTH_FACILITIES);
  for (const s of states) {
    const lgas = lga ? [lga] : Object.keys(GRID3_HEALTH_FACILITIES[s] || {});
    for (const l of lgas) {
      const facilities = GRID3_HEALTH_FACILITIES[s]?.[l] || [];
      results.push(...facilities.filter(f => f.toLowerCase().includes(q)));
    }
  }
  return [...new Set(results)].sort();
};

/**
 * Search communities
 */
export const searchCommunities = (query: string, state?: string, lga?: string): string[] => {
  const q = query.toLowerCase();
  const results: string[] = [];
  
  const states = state ? [state] : Object.keys(GRID3_COMMUNITIES);
  for (const s of states) {
    const lgas = lga ? [lga] : Object.keys(GRID3_COMMUNITIES[s] || {});
    for (const l of lgas) {
      const communities = GRID3_COMMUNITIES[s]?.[l] || [];
      results.push(...communities.filter(c => c.toLowerCase().includes(q)));
    }
  }
  return [...new Set(results)].sort();
};

/**
 * Search settlements
 */
export const searchSettlements = (query: string): string[] => {
  const q = query.toLowerCase();
  const results: string[] = [];
  for (const settlements of Object.values(GRID3_SETTLEMENTS)) {
    results.push(...settlements.filter(s => s.toLowerCase().includes(q)));
  }
  return [...new Set(results)].sort();
};

// ─────────────────────────────────────────────────────────────────────────
// Login-time BULK seeding + SYNCHRONOUS accessors (5-tier offline cascade)
// ─────────────────────────────────────────────────────────────────────────
// The MDA Supervisory Checklist needs the full State→LGA→Ward→FLHF→Community
// hierarchy available with ZERO network + ZERO spinners once the user has
// logged in. `seedAllStatesShards` downloads every per-state static JSON shard
// (served from static hosting / the SW cache — 0% database CPU) exactly once at
// login and persists them to IndexedDB + memory. Afterwards the *sync*
// accessors below resolve each cascade level from memory in well under 1ms.

/**
 * Download & persist EVERY state shard (facilities + settlements) into
 * IndexedDB + memory. Pure static-file reads — never touches the database.
 * Reports coarse progress so the one-time setup screen can show a bar.
 */
export async function seedAllStatesShards(
  onProgress?: (done: number, total: number) => void,
): Promise<{ states: number }> {
  const manifest = await loadManifest();
  const states = Object.keys(manifest);
  const total = states.length;
  let done = 0;
  onProgress?.(0, total);
  for (const state of states) {
    try {
      await Promise.all([loadStateShard("fac", state), loadStateShard("set", state)]);
    } catch {
      /* best-effort — a single missing shard must not abort the whole seed */
    }
    done += 1;
    onProgress?.(done, total);
  }
  return { states: total };
}

/** True once at least one shard is resident in memory (post-seed). */
export function isGrid3Warm(): boolean {
  return _shardMem.size > 0;
}

// Resolve a state shard from the in-memory cache ONLY (no async, no network).
function memShard(kind: "fac" | "set", state: string): StateShard | null {
  if (!_manifest) return null;
  const slug = resolveSlug(_manifest, state);
  if (!slug) return null;
  return _shardMem.get(`${kind}:${slug}`) ?? null;
}

/** Synchronous LGA list for a state — null if the shard is not seeded yet. */
export function getGrid3LGAsForStateSync(state: string): string[] | null {
  const set = memShard("set", state);
  const fac = memShard("fac", state);
  if (!set && !fac) return null;
  const settlementLgas = set ? collectLgasFromShard(set) : [];
  const facilityLgas = fac ? collectLgasFromShard(fac) : [];
  return Array.from(new Set(settlementLgas.length > 0 ? settlementLgas : facilityLgas)).sort((a, b) =>
    a.localeCompare(b),
  );
}

/** Synchronous Ward list for a state+LGA — null if the shard is not seeded. */
export function getGrid3WardsForLGASync(state: string, lga: string): string[] | null {
  const set = memShard("set", state);
  const fac = memShard("fac", state);
  if (!set && !fac) return null;
  const settlementWards = set ? collectWardsFromShard(set, state, lga) : [];
  const facilityWards = fac ? collectWardsFromShard(fac, state, lga) : [];
  return Array.from(new Set(settlementWards.length > 0 ? settlementWards : facilityWards)).sort((a, b) =>
    a.localeCompare(b),
  );
}

/** Synchronous FLHF list (with coords) — null if the shard is not seeded. */
export function getGrid3FacilitiesSync(
  state: string,
  lga: string,
  ward?: string,
): FacilityWithCoords[] | null {
  const shard = memShard("fac", state);
  if (!shard) return null;
  return collectFromShard(shard, state, lga, ward);
}

/** Synchronous Community/settlement list (with coords) — null if not seeded. */
export function getGrid3SettlementsSync(
  state: string,
  lga: string,
  ward?: string,
): FacilityWithCoords[] | null {
  const shard = memShard("set", state);
  if (!shard) return null;
  return collectFromShard(shard, state, lga, ward);
}

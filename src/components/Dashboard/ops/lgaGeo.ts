// Shared helpers for the Operations dashboard Nigeria LGA maps.
// Keeps a single cached copy of the boundary GeoJSON and a tolerant key matcher
// so every map (concordance, achievement, supervision gap) resolves LGAs the
// same way and never double-fetches the boundary file.

export const TOTAL_NIGERIA_LGAS = 774; // official count (FCT area councils included)

const clean = (s: unknown) =>
  String(s ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

const STATE_ALIAS: Record<string, string> = {
  federalcapitalterritory: "abuja",
  fct: "abuja",
  nassarawa: "nasarawa",
};

/** Normalised "state|lga" key tolerant of spacing/punctuation/state aliases. */
export function lgaKey(state: unknown, lga: unknown): string {
  const st = clean(state);
  return `${STATE_ALIAS[st] ?? st}|${clean(lga)}`;
}

/** Tolerant lookup that copes with GADM truncations (e.g. "Arochukw"). */
export function resolveFromMap<T>(
  store: Map<string, T>,
  featState: string,
  featLga: string,
): T | undefined {
  const key = lgaKey(featState, featLga);
  const direct = store.get(key);
  if (direct) return direct;
  const [st, lg] = key.split("|");
  if (!lg) return undefined;
  let best: T | undefined;
  store.forEach((val, k) => {
    if (best) return;
    const [s, l] = k.split("|");
    if (s !== st || !l) return;
    if (
      l === lg ||
      l.startsWith(lg) ||
      lg.startsWith(l) ||
      (l.length >= 5 && lg.length >= 5 && (l.includes(lg) || lg.includes(l)))
    ) {
      best = val;
    }
  });
  return best;
}

let geoCache: any | null = null;
let geoPromise: Promise<any> | null = null;

/** Load and cache the Nigeria LGA boundary GeoJSON (one network request total). */
export function loadNigeriaGeo(): Promise<any> {
  if (geoCache) return Promise.resolve(geoCache);
  if (geoPromise) return geoPromise;
  geoPromise = fetch("/nigeria-lga.geojson")
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
    .then((data) => {
      geoCache = data;
      return data;
    })
    .catch((e) => {
      console.warn("LGA boundaries failed to load", e);
      geoPromise = null;
      throw e;
    });
  return geoPromise;
}

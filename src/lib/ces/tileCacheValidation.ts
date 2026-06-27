export const CES_MAP_TILE_CACHE = "map-tiles-cache";

export type CesTileSource = {
  url: string;
  maxNativeZoom: number;
  subdomains: string;
  requestMode: RequestMode;
  label: string;
};

export type CesTileBounds = {
  west: number;
  east: number;
  north: number;
  south: number;
};

export type CesTileRequest = {
  url: string;
  mode: RequestMode;
  z: number;
  x: number;
  y: number;
  sourceIndex: number;
  sourceLabel: string;
};

export type CesTileValidationResult = {
  cacheName: string;
  deterministicPolicy: "zxy-url-request-mode-detectRetina-false";
  checked: number;
  expected: number;
  present: number;
  missing: number;
  coveragePct: number;
  complete: boolean;
  missingSamples: string[];
};

const clampLat = (lat: number) => Math.max(-85.05112878, Math.min(85.05112878, lat));

const latToTileY = (lat: number, z: number) => {
  const rad = (clampLat(lat) * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * 2 ** z);
};

const lngToTileX = (lng: number, z: number) => Math.floor(((lng + 180) / 360) * 2 ** z);

const waitForMainThread = () => new Promise<void>((resolve) => {
  if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => resolve());
  else setTimeout(resolve, 0);
});

export function buildCesTileRequests(
  bounds: CesTileBounds,
  sources: CesTileSource[],
  opts: { currentZoom: number; zoomAhead?: number; zoomBack?: number; maxTiles?: number } = { currentZoom: 17 },
): CesTileRequest[] {
  if (sources.length === 0) return [];
  const maxNativeZoom = Math.max(...sources.map((s) => s.maxNativeZoom));
  const currentZoom = Math.max(1, Math.round(opts.currentZoom));
  const startZoom = Math.max(Math.min(currentZoom - (opts.zoomBack ?? 1), maxNativeZoom), 12);
  const endZoom = Math.min(maxNativeZoom, currentZoom + (opts.zoomAhead ?? 4));
  const maxTiles = opts.maxTiles ?? 12000;
  const requests: CesTileRequest[] = [];

  for (let z = startZoom; z <= endZoom && requests.length < maxTiles; z++) {
    const xMin = lngToTileX(bounds.west, z);
    const xMax = lngToTileX(bounds.east, z);
    const yMin = latToTileY(bounds.north, z);
    const yMax = latToTileY(bounds.south, z);
    for (let x = xMin; x <= xMax && requests.length < maxTiles; x++) {
      for (let y = yMin; y <= yMax && requests.length < maxTiles; y++) {
        for (let sourceIndex = 0; sourceIndex < sources.length; sourceIndex++) {
          if (requests.length >= maxTiles) break;
          const source = sources[sourceIndex];
          const sub = source.subdomains[(x + y) % source.subdomains.length] ?? source.subdomains[0];
          requests.push({
            mode: source.requestMode,
            z,
            x,
            y,
            sourceIndex,
            sourceLabel: source.label,
            url: source.url
              .replace("{s}", sub)
              .replace("{z}", String(z))
              .replace("{x}", String(x))
              .replace("{y}", String(y)),
          });
        }
      }
    }
  }
  return requests;
}

export async function validateCesTileCache(
  expected: CesTileRequest[],
  opts: {
    cacheName?: string;
    sampleLimit?: number;
    signal?: AbortSignal;
    onProgress?: (checked: number, total: number) => void;
  } = {},
): Promise<CesTileValidationResult> {
  const cacheName = opts.cacheName ?? CES_MAP_TILE_CACHE;
  const total = expected.length;
  if (!("caches" in window) || total === 0) {
    return {
      cacheName,
      deterministicPolicy: "zxy-url-request-mode-detectRetina-false",
      checked: 0,
      expected: total,
      present: 0,
      missing: total,
      coveragePct: total === 0 ? 100 : 0,
      complete: total === 0,
      missingSamples: [],
    };
  }

  const cache = await caches.open(cacheName);
  const sampleLimit = opts.sampleLimit && opts.sampleLimit > 0 ? Math.min(opts.sampleLimit, total) : total;
  const stride = Math.max(1, Math.floor(total / sampleLimit));
  const sample = total === sampleLimit
    ? expected
    : expected.filter((_, idx) => idx % stride === 0).slice(0, sampleLimit);

  let present = 0;
  const missingSamples: string[] = [];
  for (let i = 0; i < sample.length; i++) {
    if (opts.signal?.aborted) break;
    const tile = sample[i];
    const res = await cache.match(new Request(tile.url, { mode: tile.mode }));
    if (res) present++;
    else if (missingSamples.length < 12) missingSamples.push(`${tile.sourceLabel} z${tile.z}/${tile.x}/${tile.y}`);
    if (i % 64 === 0) {
      opts.onProgress?.(i + 1, sample.length);
      await waitForMainThread();
    }
  }

  const checked = sample.length;
  const missing = checked - present;
  const coveragePct = checked === 0 ? 100 : (present / checked) * 100;
  return {
    cacheName,
    deterministicPolicy: "zxy-url-request-mode-detectRetina-false",
    checked,
    expected: total,
    present,
    missing,
    coveragePct,
    complete: missing === 0,
    missingSamples,
  };
}

export async function putCesTileInCache(cache: Cache | null, tile: CesTileRequest): Promise<boolean> {
  const request = new Request(tile.url, { mode: tile.mode });
  const cached = cache ? await cache.match(request) : null;
  if (cached) return true;
  const response = await fetch(request, { cache: "no-store" });
  if (cache && (response.ok || response.type === "opaque")) {
    await cache.put(request, response.clone()).catch(() => undefined);
    return true;
  }
  return false;
}

export { waitForMainThread as waitForCesTileFrame };
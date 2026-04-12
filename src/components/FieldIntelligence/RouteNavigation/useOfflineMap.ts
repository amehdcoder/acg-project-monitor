import { useState, useCallback } from "react";
import { toast } from "@/hooks/use-toast";
import type { CachedMapRegion } from "./types";

const TILE_DB_NAME = "offline-map-tiles";
const TILE_STORE = "tiles";

function openTileDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(TILE_DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(TILE_STORE)) {
        db.createObjectStore(TILE_STORE);
      }
      if (!db.objectStoreNames.contains("regions")) {
        db.createObjectStore("regions", { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function cacheTile(db: IDBDatabase, key: string, blob: Blob) {
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(TILE_STORE, "readwrite");
    tx.objectStore(TILE_STORE).put(blob, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function saveRegion(db: IDBDatabase, region: CachedMapRegion) {
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction("regions", "readwrite");
    tx.objectStore("regions").put(region);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getRegions(db: IDBDatabase): Promise<CachedMapRegion[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction("regions", "readonly");
    const req = tx.objectStore("regions").getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function deleteRegion(db: IDBDatabase, id: string) {
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction("regions", "readwrite");
    tx.objectStore("regions").delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function lon2tile(lon: number, zoom: number) { return Math.floor(((lon + 180) / 360) * Math.pow(2, zoom)); }
function lat2tile(lat: number, zoom: number) {
  return Math.floor((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2 * Math.pow(2, zoom));
}

export function useOfflineMap() {
  const [cachedRegions, setCachedRegions] = useState<CachedMapRegion[]>([]);
  const [caching, setCaching] = useState(false);
  const [cacheProgress, setCacheProgress] = useState(0);

  const loadCachedRegions = useCallback(async () => {
    try {
      const db = await openTileDB();
      const regions = await getRegions(db);
      setCachedRegions(regions);
    } catch {
      setCachedRegions([]);
    }
  }, []);

  const cacheRegion = useCallback(async (bounds: { north: number; south: number; east: number; west: number }, zoom: number = 14) => {
    setCaching(true);
    setCacheProgress(0);
    try {
      const db = await openTileDB();
      const minZoom = Math.max(zoom - 3, 6);
      const maxZoom = Math.min(zoom + 1, 16);
      let total = 0;
      let done = 0;

      // Count tiles
      for (let z = minZoom; z <= maxZoom; z++) {
        const xMin = lon2tile(bounds.west, z);
        const xMax = lon2tile(bounds.east, z);
        const yMin = lat2tile(bounds.north, z);
        const yMax = lat2tile(bounds.south, z);
        total += (xMax - xMin + 1) * (yMax - yMin + 1);
      }

      // Limit to prevent abuse
      if (total > 2000) {
        toast({ title: "Region too large", description: "Zoom in to cache a smaller area (max ~2000 tiles)", variant: "destructive" });
        setCaching(false);
        return;
      }

      for (let z = minZoom; z <= maxZoom; z++) {
        const xMin = lon2tile(bounds.west, z);
        const xMax = lon2tile(bounds.east, z);
        const yMin = lat2tile(bounds.north, z);
        const yMax = lat2tile(bounds.south, z);

        for (let x = xMin; x <= xMax; x++) {
          for (let y = yMin; y <= yMax; y++) {
            try {
              const url = `https://a.tile.openstreetmap.org/${z}/${x}/${y}.png`;
              const res = await fetch(url);
              if (res.ok) {
                const blob = await res.blob();
                await cacheTile(db, `${z}/${x}/${y}`, blob);
              }
            } catch {}
            done++;
            setCacheProgress(Math.round((done / total) * 100));
          }
        }
      }

      const region: CachedMapRegion = {
        id: `region-${Date.now()}`,
        bounds,
        zoom,
        cachedAt: new Date().toISOString(),
        tileCount: total,
      };
      await saveRegion(db, region);
      setCachedRegions(prev => [...prev, region]);
      toast({ title: "Map Cached!", description: `${total} tiles saved for offline use.` });
    } catch (e: any) {
      toast({ title: "Cache Error", description: e.message, variant: "destructive" });
    } finally {
      setCaching(false);
      setCacheProgress(0);
    }
  }, []);

  const removeCachedRegion = useCallback(async (id: string) => {
    try {
      const db = await openTileDB();
      await deleteRegion(db, id);
      setCachedRegions(prev => prev.filter(r => r.id !== id));
      toast({ title: "Cache Removed" });
    } catch {}
  }, []);

  return { cachedRegions, caching, cacheProgress, loadCachedRegions, cacheRegion, removeCachedRegion };
}

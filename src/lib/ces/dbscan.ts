export interface GeoPoint {
  id: string;
  lat: number;
  lng: number;
  [key: string]: any;
}

export interface Cluster {
  id: string;
  points: GeoPoint[];
  centroid: { lat: number; lng: number };
}

// Haversine distance in meters
function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3; // meters
  const p1 = (lat1 * Math.PI) / 180;
  const p2 = (lat2 * Math.PI) / 180;
  const dp = ((lat2 - lat1) * Math.PI) / 180;
  const dl = ((lon2 - lon1) * Math.PI) / 180;

  const a = Math.sin(dp / 2) * Math.sin(dp / 2) + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) * Math.sin(dl / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

/**
 * Runs DBSCAN clustering on an array of GeoPoints using Haversine distance.
 * @param points Array of objects containing lat, lng, and id
 * @param eps Maximum distance between two samples for one to be considered as in the neighborhood of the other (in meters)
 * @param minPts The number of samples in a neighborhood for a point to be considered as a core point
 * @returns Array of Clusters
 */
export function dbscanGeo(points: GeoPoint[], eps: number, minPts: number): Cluster[] {
  const UNCLASSIFIED = -1;
  const NOISE = -2;
  const labels: number[] = new Array(points.length).fill(UNCLASSIFIED);
  
  let clusterId = 0;

  const regionQuery = (pointIndex: number) => {
    const neighbors: number[] = [];
    for (let i = 0; i < points.length; i++) {
      if (i === pointIndex) {
        neighbors.push(i);
        continue;
      }
      const dist = haversineDistance(points[pointIndex].lat, points[pointIndex].lng, points[i].lat, points[i].lng);
      if (dist <= eps) {
        neighbors.push(i);
      }
    }
    return neighbors;
  };

  for (let i = 0; i < points.length; i++) {
    if (labels[i] !== UNCLASSIFIED) continue;

    const neighbors = regionQuery(i);
    if (neighbors.length < minPts) {
      labels[i] = NOISE;
    } else {
      labels[i] = clusterId;
      
      let j = 0;
      while (j < neighbors.length) {
        const neighborIdx = neighbors[j];
        if (labels[neighborIdx] === NOISE) {
          labels[neighborIdx] = clusterId;
        }
        if (labels[neighborIdx] === UNCLASSIFIED) {
          labels[neighborIdx] = clusterId;
          const neighborNeighbors = regionQuery(neighborIdx);
          if (neighborNeighbors.length >= minPts) {
            // merge neighborNeighbors into neighbors
            for (const n of neighborNeighbors) {
              if (!neighbors.includes(n)) {
                neighbors.push(n);
              }
            }
          }
        }
        j++;
      }
      clusterId++;
    }
  }

  // Build Cluster objects
  const clusters: Cluster[] = [];
  for (let c = 0; c < clusterId; c++) {
    const clusterPoints = points.filter((_, idx) => labels[idx] === c);
    if (clusterPoints.length > 0) {
      const sumLat = clusterPoints.reduce((acc, p) => acc + p.lat, 0);
      const sumLng = clusterPoints.reduce((acc, p) => acc + p.lng, 0);
      clusters.push({
        id: `cluster_${c}_${Date.now()}`,
        points: clusterPoints,
        centroid: {
          lat: sumLat / clusterPoints.length,
          lng: sumLng / clusterPoints.length,
        }
      });
    }
  }

  return clusters;
}

// Location utility functions for extracting and displaying location data from form submissions

// Nigerian state bounding boxes (minLat, maxLat, minLng, maxLng) + centroid for tie-break.
// Sourced from public administrative datasets (GRID3 / OSM admin boundaries level-1).
// Using bounding boxes prevents false-positive matches that occur with naive
// nearest-centroid lookup (e.g. a point in Yobe being misclassified as FCT-Abuja
// because FCT's centroid happens to be the closest of two distant centroids).
interface StateBBox {
  name: string;
  minLat: number; maxLat: number;
  minLng: number; maxLng: number;
  cLat: number; cLng: number;
}

const NIGERIAN_STATE_BBOXES: StateBBox[] = [
  { name: "Abia",        minLat: 4.85, maxLat: 6.10, minLng: 7.05, maxLng: 8.05, cLat: 5.45, cLng: 7.52 },
  { name: "Adamawa",     minLat: 7.85, maxLat: 11.10, minLng: 11.50, maxLng: 13.75, cLat: 9.33, cLng: 12.40 },
  { name: "Akwa Ibom",   minLat: 4.30, maxLat: 5.55, minLng: 7.40, maxLng: 8.40, cLat: 5.05, cLng: 7.93 },
  { name: "Anambra",     minLat: 5.70, maxLat: 6.85, minLng: 6.55, maxLng: 7.30, cLat: 6.22, cLng: 6.94 },
  { name: "Bauchi",      minLat: 9.45, maxLat: 12.85, minLng: 8.75, maxLng: 11.05, cLat: 10.32, cLng: 9.84 },
  { name: "Bayelsa",     minLat: 4.15, maxLat: 5.45, minLng: 5.25, maxLng: 6.85, cLat: 4.77, cLng: 6.07 },
  { name: "Benue",       minLat: 6.50, maxLat: 8.50, minLng: 7.45, maxLng: 10.05, cLat: 7.34, cLng: 8.74 },
  { name: "Borno",       minLat: 10.30, maxLat: 13.95, minLng: 11.55, maxLng: 14.70, cLat: 11.83, cLng: 13.15 },
  { name: "Cross River", minLat: 4.85, maxLat: 7.05, minLng: 7.85, maxLng: 9.50, cLat: 5.87, cLng: 8.60 },
  { name: "Delta",       minLat: 5.00, maxLat: 6.50, minLng: 5.00, maxLng: 6.85, cLat: 5.53, cLng: 5.77 },
  { name: "Ebonyi",      minLat: 5.65, maxLat: 6.90, minLng: 7.55, maxLng: 8.55, cLat: 6.27, cLng: 8.01 },
  { name: "Edo",         minLat: 5.70, maxLat: 7.55, minLng: 4.95, maxLng: 6.75, cLat: 6.34, cLng: 5.60 },
  { name: "Ekiti",       minLat: 7.30, maxLat: 8.05, minLng: 4.80, maxLng: 5.80, cLat: 7.72, cLng: 5.31 },
  { name: "Enugu",       minLat: 5.90, maxLat: 7.10, minLng: 7.05, maxLng: 7.95, cLat: 6.46, cLng: 7.55 },
  { name: "FCT Abuja",   minLat: 8.40, maxLat: 9.40, minLng: 6.75, maxLng: 7.65, cLat: 9.08, cLng: 7.40 },
  { name: "Gombe",       minLat: 9.55, maxLat: 11.10, minLng: 10.20, maxLng: 11.80, cLat: 10.29, cLng: 11.17 },
  { name: "Imo",         minLat: 5.10, maxLat: 5.95, minLng: 6.65, maxLng: 7.55, cLat: 5.49, cLng: 7.03 },
  { name: "Jigawa",      minLat: 11.35, maxLat: 13.10, minLng: 8.05, maxLng: 10.85, cLat: 12.23, cLng: 9.56 },
  { name: "Kaduna",      minLat: 9.05, maxLat: 11.50, minLng: 6.40, maxLng: 8.95, cLat: 10.52, cLng: 7.44 },
  { name: "Kano",        minLat: 10.55, maxLat: 12.65, minLng: 7.65, maxLng: 9.55, cLat: 12.00, cLng: 8.59 },
  { name: "Katsina",     minLat: 11.05, maxLat: 13.40, minLng: 6.65, maxLng: 9.05, cLat: 13.01, cLng: 7.60 },
  { name: "Kebbi",       minLat: 10.30, maxLat: 13.40, minLng: 3.45, maxLng: 6.05, cLat: 12.45, cLng: 4.20 },
  { name: "Kogi",        minLat: 6.50, maxLat: 8.85, minLng: 5.40, maxLng: 7.80, cLat: 7.73, cLng: 6.69 },
  { name: "Kwara",       minLat: 7.80, maxLat: 9.95, minLng: 2.65, maxLng: 6.45, cLat: 8.48, cLng: 4.54 },
  { name: "Lagos",       minLat: 6.35, maxLat: 6.75, minLng: 2.65, maxLng: 4.40, cLat: 6.52, cLng: 3.38 },
  { name: "Nasarawa",    minLat: 7.75, maxLat: 9.50, minLng: 7.05, maxLng: 9.55, cLat: 8.54, cLng: 8.32 },
  { name: "Niger",       minLat: 8.05, maxLat: 11.45, minLng: 3.55, maxLng: 7.85, cLat: 9.93, cLng: 5.60 },
  { name: "Ogun",        minLat: 6.30, maxLat: 7.95, minLng: 2.65, maxLng: 4.45, cLat: 7.00, cLng: 3.47 },
  { name: "Ondo",        minLat: 5.85, maxLat: 7.85, minLng: 4.30, maxLng: 6.05, cLat: 7.25, cLng: 5.19 },
  { name: "Osun",        minLat: 7.05, maxLat: 8.20, minLng: 4.05, maxLng: 5.10, cLat: 7.56, cLng: 4.52 },
  { name: "Oyo",         minLat: 6.95, maxLat: 9.25, minLng: 2.60, maxLng: 4.65, cLat: 7.85, cLng: 3.93 },
  { name: "Plateau",     minLat: 8.05, maxLat: 10.40, minLng: 8.30, maxLng: 10.60, cLat: 9.22, cLng: 9.52 },
  { name: "Rivers",      minLat: 4.30, maxLat: 5.65, minLng: 6.20, maxLng: 7.65, cLat: 4.86, cLng: 6.92 },
  { name: "Sokoto",      minLat: 11.65, maxLat: 13.95, minLng: 4.05, maxLng: 6.95, cLat: 13.05, cLng: 5.25 },
  { name: "Taraba",      minLat: 6.40, maxLat: 9.95, minLng: 9.30, maxLng: 12.05, cLat: 8.00, cLng: 10.77 },
  { name: "Yobe",        minLat: 10.55, maxLat: 13.35, minLng: 9.65, maxLng: 12.65, cLat: 12.29, cLng: 11.44 },
  { name: "Zamfara",     minLat: 11.05, maxLat: 13.55, minLng: 5.20, maxLng: 7.45, cLat: 12.17, cLng: 6.25 },
];

// Calculate distance between two coordinates (Haversine formula)
const getDistance = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

// Determine state from GPS coordinates using bounding-box containment.
// If the point falls in multiple bboxes (border zones), choose the state
// whose centroid is closest. Returns null if outside Nigeria entirely
// (rather than guessing the nearest state — false data is worse than no data).
export const getStateFromGPS = (lat: number, lng: number): string | null => {
  if (!isFinite(lat) || !isFinite(lng)) return null;

  // Reject coordinates clearly outside Nigeria (avoid the 200km-radius bug
  // that previously matched Yobe-captured points to FCT-Abuja).
  if (lat < 4.0 || lat > 14.0 || lng < 2.5 || lng > 14.7) return null;

  const matches = NIGERIAN_STATE_BBOXES.filter(
    (s) => lat >= s.minLat && lat <= s.maxLat && lng >= s.minLng && lng <= s.maxLng
  );

  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0].name;

  // Multiple bbox matches → pick state with closest centroid
  let best = matches[0];
  let bestDist = getDistance(lat, lng, best.cLat, best.cLng);
  for (let i = 1; i < matches.length; i++) {
    const d = getDistance(lat, lng, matches[i].cLat, matches[i].cLng);
    if (d < bestDist) { bestDist = d; best = matches[i]; }
  }
  return best.name;
};

// Administrative unit field patterns (case-insensitive matching)
const ADMIN_UNIT_PATTERNS = {
  // Top-level administrative units (priority order)
  region: ["region", "reg", "zone", "geo_zone", "geopolitical_zone"],
  state: ["state", "province", "stat"],
  lga: ["lga", "local_government", "local_government_area", "area_council", "district", "lg", "local_govt"],
  ward: ["ward", "wrd"],
  // Health-related units
  flhf: ["flhf", "frontline_health_facility", "health_facility", "facility", "health_center", "hf", "phc", "primary_health_center"],
  // Community-level units
  community: ["community", "village", "settlement", "town", "comm"],
  school: ["school", "institution", "sch"],
};

// Find a field value by checking multiple possible field names
const findAdminUnitValue = (data: Record<string, any>, patterns: string[]): string | null => {
  if (!data) return null;
  
  const dataKeys = Object.keys(data);
  for (const pattern of patterns) {
    // Check for exact match (case-insensitive)
    const exactMatch = dataKeys.find((key) => key.toLowerCase() === pattern.toLowerCase());
    if (exactMatch && data[exactMatch]) {
      return String(data[exactMatch]);
    }
    
    // Check for partial match (e.g., "state_name", "lga_code" should match "state", "lga")
    const partialMatch = dataKeys.find((key) => {
      const lowerKey = key.toLowerCase();
      return lowerKey.includes(pattern.toLowerCase()) || pattern.toLowerCase().includes(lowerKey);
    });
    if (partialMatch && data[partialMatch]) {
      return String(data[partialMatch]);
    }
  }
  return null;
};

// Canonicalise a free-text state name to its official Nigerian state name
// (matching NIGERIAN_STATE_BBOXES). Strips noise like "State", "Province",
// case differences, hyphens, and common typos. Returns null if unmatched.
// This MUST be used everywhere we group/aggregate by state so that two
// widgets reading the same submission always agree on the bucket name.
export const normalizeStateName = (raw: string | null | undefined): string | null => {
  if (!raw) return null;
  const cleaned = String(raw)
    .toLowerCase()
    .replace(/\b(state|province|region)\b/g, "")
    .replace(/[._\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return null;
  // Common aliases
  const aliases: Record<string, string> = {
    "fct": "FCT Abuja",
    "abuja": "FCT Abuja",
    "fct abuja": "FCT Abuja",
    "federal capital territory": "FCT Abuja",
    "akwa-ibom": "Akwa Ibom",
    "cross-river": "Cross River",
    "akwaibom": "Akwa Ibom",
    "crossriver": "Cross River",
  };
  if (aliases[cleaned]) return aliases[cleaned];
  // Exact-match against canonical names
  const canonical = NIGERIAN_STATE_BBOXES.find(s => s.name.toLowerCase() === cleaned);
  if (canonical) return canonical.name;
  // Substring/loose match (e.g. "lagos island" → Lagos)
  const loose = NIGERIAN_STATE_BBOXES.find(s => {
    const n = s.name.toLowerCase();
    return cleaned.includes(n) || n.includes(cleaned);
  });
  if (loose) return loose.name;
  // Fallback: title-case the cleaned input so at least casing is consistent
  return cleaned.replace(/\b\w/g, c => c.toUpperCase());
};

export interface LocationInfo {
  displayLocation: string;
  state: string | null;
  lga: string | null;
  ward: string | null;
  community: string | null;
  flhf: string | null;
  school: string | null;
  gpsCoords: { lat: number; lng: number; accuracy?: number; altitude?: number } | null;
  source: "admin_unit" | "gps_geocoded" | "gps_coords" | "unknown";
}

// Extract comprehensive location information from a submission
export const extractLocationInfo = (
  formData: Record<string, any> | null,
  gpsLocation: { lat?: number; lng?: number; latitude?: number; longitude?: number; accuracy?: number; altitude?: number } | null
): LocationInfo => {
  // Extract all available administrative units
  const adminUnits = {
    region: findAdminUnitValue(formData || {}, ADMIN_UNIT_PATTERNS.region),
    state: findAdminUnitValue(formData || {}, ADMIN_UNIT_PATTERNS.state),
    lga: findAdminUnitValue(formData || {}, ADMIN_UNIT_PATTERNS.lga),
    ward: findAdminUnitValue(formData || {}, ADMIN_UNIT_PATTERNS.ward),
    flhf: findAdminUnitValue(formData || {}, ADMIN_UNIT_PATTERNS.flhf),
    community: findAdminUnitValue(formData || {}, ADMIN_UNIT_PATTERNS.community),
    school: findAdminUnitValue(formData || {}, ADMIN_UNIT_PATTERNS.school),
  };

  // Build location string from available administrative units (in hierarchical order)
  const locationParts = [
    adminUnits.region,
    adminUnits.state,
    adminUnits.lga,
    adminUnits.ward,
    adminUnits.community,
    adminUnits.flhf,
    adminUnits.school,
  ].filter(Boolean);

  // Parse GPS coordinates
  let gpsCoords: { lat: number; lng: number; accuracy?: number; altitude?: number } | null = null;
  if (gpsLocation) {
    const lat = gpsLocation.lat ?? gpsLocation.latitude;
    const lng = gpsLocation.lng ?? gpsLocation.longitude;
    if (typeof lat === "number" && typeof lng === "number" && !isNaN(lat) && !isNaN(lng)) {
      gpsCoords = {
        lat,
        lng,
        accuracy: gpsLocation.accuracy,
        altitude: gpsLocation.altitude,
      };
    }
  }

  // Also check for geopoint data in form responses
  if (!gpsCoords && formData) {
    for (const key of Object.keys(formData)) {
      const value = formData[key];
      if (value && typeof value === "object" && (value.lat || value.latitude)) {
        const lat = parseFloat(value.lat || value.latitude);
        const lng = parseFloat(value.lng || value.longitude);
        if (!isNaN(lat) && !isNaN(lng)) {
          gpsCoords = {
            lat,
            lng,
            accuracy: value.accuracy,
            altitude: value.altitude,
          };
          break;
        }
      }
    }
  }

  // If we have administrative unit data, use it
  if (locationParts.length > 0) {
    return {
      displayLocation: locationParts.join(", "),
      state: adminUnits.state || adminUnits.region,
      lga: adminUnits.lga,
      ward: adminUnits.ward,
      community: adminUnits.community,
      flhf: adminUnits.flhf,
      school: adminUnits.school,
      gpsCoords,
      source: "admin_unit",
    };
  }

  // Fall back to GPS geocoding
  if (gpsCoords) {
    const detectedState = getStateFromGPS(gpsCoords.lat, gpsCoords.lng);
    if (detectedState) {
      return {
        displayLocation: detectedState,
        state: detectedState,
        lga: null,
        ward: null,
        community: null,
        flhf: null,
        school: null,
        gpsCoords,
        source: "gps_geocoded",
      };
    }

    // Format GPS with optional accuracy and altitude
    let gpsString = `${gpsCoords.lat.toFixed(4)}, ${gpsCoords.lng.toFixed(4)}`;
    if (gpsCoords.altitude && !isNaN(gpsCoords.altitude)) {
      gpsString += ` (Alt: ${gpsCoords.altitude.toFixed(1)}m)`;
    }
    if (gpsCoords.accuracy && !isNaN(gpsCoords.accuracy)) {
      gpsString += ` [±${gpsCoords.accuracy.toFixed(0)}m]`;
    }

    return {
      displayLocation: gpsString,
      state: null,
      lga: null,
      ward: null,
      community: null,
      flhf: null,
      school: null,
      gpsCoords,
      source: "gps_coords",
    };
  }

  return {
    displayLocation: "Unknown",
    state: null,
    lga: null,
    ward: null,
    community: null,
    flhf: null,
    school: null,
    gpsCoords: null,
    source: "unknown",
  };
};

// Format location for display (short version)
export const formatLocationShort = (locationInfo: LocationInfo): string => {
  if (locationInfo.source === "admin_unit") {
    // Show state, LGA for short format
    return [locationInfo.state, locationInfo.lga].filter(Boolean).join(", ") || locationInfo.displayLocation;
  }
  return locationInfo.displayLocation;
};

// Format location for display (long version with all details)
export const formatLocationLong = (locationInfo: LocationInfo): string => {
  return locationInfo.displayLocation;
};

// Patterns to detect geopoint/GPS fields in form data
const GEOPOINT_FIELD_PATTERNS = [
  "geopoint", "geo_point", "geolocation", "gps", "gps_location",
  "location", "coordinates", "coords", "position", "geo",
];

const LAT_FIELD_PATTERNS = [
  "latitude", "lat", "lattitude", "y_coord", "y_coordinate",
];

const LNG_FIELD_PATTERNS = [
  "longitude", "lng", "long", "lon", "x_coord", "x_coordinate",
];

const ACCURACY_FIELD_PATTERNS = [
  "accuracy", "precision", "gps_accuracy", "horizontal_accuracy",
];

const ALTITUDE_FIELD_PATTERNS = [
  "altitude", "alt", "elevation", "height", "vertical",
];

interface GeoPointData {
  lat: number;
  lng: number;
  accuracy?: number;
  altitude?: number;
  source: "geopoint_object" | "separate_fields" | "gps_question";
}

// Extract geopoint data from form responses by checking for geo-related questions
export const extractGeoPointFromFormData = (
  formData: Record<string, any> | null,
  questions?: { id: string; type: string; label?: string }[]
): GeoPointData | null => {
  if (!formData) return null;
  
  const dataKeys = Object.keys(formData);
  
  // 1. Check for geopoint-type questions from form definition
  if (questions) {
    for (const question of questions) {
      if (question.type === "geopoint" || question.type === "gps" || question.type === "geolocation") {
        const value = formData[question.id];
        if (value) {
          const parsed = parseGeoValue(value);
          if (parsed) {
            return { ...parsed, source: "gps_question" };
          }
        }
      }
    }
  }
  
  // 2. Check for geopoint object fields (e.g., { lat, lng } or { latitude, longitude })
  for (const key of dataKeys) {
    const lowerKey = key.toLowerCase();
    const isGeoField = GEOPOINT_FIELD_PATTERNS.some(p => lowerKey.includes(p));
    
    if (isGeoField) {
      const value = formData[key];
      const parsed = parseGeoValue(value);
      if (parsed) {
        return { ...parsed, source: "geopoint_object" };
      }
    }
  }
  
  // 3. Check for separate latitude/longitude fields
  let lat: number | null = null;
  let lng: number | null = null;
  let accuracy: number | undefined;
  let altitude: number | undefined;
  
  for (const key of dataKeys) {
    const lowerKey = key.toLowerCase();
    
    // Check latitude patterns
    if (lat === null && LAT_FIELD_PATTERNS.some(p => lowerKey.includes(p))) {
      const parsed = parseFloat(formData[key]);
      if (!isNaN(parsed) && parsed >= -90 && parsed <= 90) {
        lat = parsed;
      }
    }
    
    // Check longitude patterns
    if (lng === null && LNG_FIELD_PATTERNS.some(p => lowerKey.includes(p))) {
      const parsed = parseFloat(formData[key]);
      if (!isNaN(parsed) && parsed >= -180 && parsed <= 180) {
        lng = parsed;
      }
    }
    
    // Check accuracy patterns
    if (accuracy === undefined && ACCURACY_FIELD_PATTERNS.some(p => lowerKey.includes(p))) {
      const parsed = parseFloat(formData[key]);
      if (!isNaN(parsed) && parsed >= 0) {
        accuracy = parsed;
      }
    }
    
    // Check altitude patterns
    if (altitude === undefined && ALTITUDE_FIELD_PATTERNS.some(p => lowerKey.includes(p))) {
      const parsed = parseFloat(formData[key]);
      if (!isNaN(parsed)) {
        altitude = parsed;
      }
    }
  }
  
  if (lat !== null && lng !== null) {
    return { lat, lng, accuracy, altitude, source: "separate_fields" };
  }
  
  return null;
};

// Parse various geopoint value formats
const parseGeoValue = (value: any): { lat: number; lng: number; accuracy?: number; altitude?: number } | null => {
  if (!value) return null;
  
  // Handle object format: { lat, lng } or { latitude, longitude }
  if (typeof value === "object" && !Array.isArray(value)) {
    const lat = parseFloat(value.lat ?? value.latitude ?? value.y);
    const lng = parseFloat(value.lng ?? value.longitude ?? value.lon ?? value.long ?? value.x);
    const accuracy = value.accuracy !== undefined ? parseFloat(value.accuracy) : undefined;
    const altitude = value.altitude !== undefined ? parseFloat(value.altitude) : undefined;
    
    if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      return {
        lat,
        lng,
        accuracy: accuracy !== undefined && !isNaN(accuracy) ? accuracy : undefined,
        altitude: altitude !== undefined && !isNaN(altitude) ? altitude : undefined,
      };
    }
  }
  
  // Handle array format: [lat, lng] or [lng, lat]
  if (Array.isArray(value) && value.length >= 2) {
    const first = parseFloat(value[0]);
    const second = parseFloat(value[1]);
    
    if (!isNaN(first) && !isNaN(second)) {
      // Determine order based on typical value ranges
      // Latitude: -90 to 90, Longitude: -180 to 180
      if (first >= -90 && first <= 90 && second >= -180 && second <= 180) {
        return { lat: first, lng: second };
      }
      if (second >= -90 && second <= 90 && first >= -180 && first <= 180) {
        return { lat: second, lng: first };
      }
    }
  }
  
  // Handle string format: "lat,lng" or "lat lng" or "lat;lng"
  if (typeof value === "string") {
    const parts = value.split(/[,\s;]+/).map(p => parseFloat(p.trim()));
    if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      const [first, second, third, fourth] = parts;
      
      // Check if it's lat,lng format
      if (first >= -90 && first <= 90 && second >= -180 && second <= 180) {
        return {
          lat: first,
          lng: second,
          altitude: third !== undefined && !isNaN(third) ? third : undefined,
          accuracy: fourth !== undefined && !isNaN(fourth) ? fourth : undefined,
        };
      }
    }
  }
  
  return null;
};

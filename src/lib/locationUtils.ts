// Location utility functions for extracting and displaying location data from form submissions

// Nigerian states for GPS geocoding fallback
const NIGERIAN_STATES = [
  { name: "Abia", lat: 5.4527, lng: 7.5248 },
  { name: "Adamawa", lat: 9.3265, lng: 12.3984 },
  { name: "Akwa Ibom", lat: 5.0510, lng: 7.9335 },
  { name: "Anambra", lat: 6.2209, lng: 6.9370 },
  { name: "Bauchi", lat: 10.3158, lng: 9.8442 },
  { name: "Bayelsa", lat: 4.7719, lng: 6.0699 },
  { name: "Benue", lat: 7.3369, lng: 8.7404 },
  { name: "Borno", lat: 11.8333, lng: 13.1500 },
  { name: "Cross River", lat: 5.8702, lng: 8.5988 },
  { name: "Delta", lat: 5.5324, lng: 5.7662 },
  { name: "Ebonyi", lat: 6.2649, lng: 8.0137 },
  { name: "Edo", lat: 6.3350, lng: 5.6037 },
  { name: "Ekiti", lat: 7.7190, lng: 5.3110 },
  { name: "Enugu", lat: 6.4584, lng: 7.5464 },
  { name: "FCT Abuja", lat: 9.0765, lng: 7.3986 },
  { name: "Gombe", lat: 10.2897, lng: 11.1673 },
  { name: "Imo", lat: 5.4921, lng: 7.0260 },
  { name: "Jigawa", lat: 12.2280, lng: 9.5616 },
  { name: "Kaduna", lat: 10.5222, lng: 7.4383 },
  { name: "Kano", lat: 12.0022, lng: 8.5920 },
  { name: "Katsina", lat: 13.0059, lng: 7.6000 },
  { name: "Kebbi", lat: 12.4539, lng: 4.1975 },
  { name: "Kogi", lat: 7.7337, lng: 6.6906 },
  { name: "Kwara", lat: 8.4799, lng: 4.5418 },
  { name: "Lagos", lat: 6.5244, lng: 3.3792 },
  { name: "Nasarawa", lat: 8.5380, lng: 8.3220 },
  { name: "Niger", lat: 9.9309, lng: 5.5983 },
  { name: "Ogun", lat: 6.9980, lng: 3.4737 },
  { name: "Ondo", lat: 7.2500, lng: 5.1931 },
  { name: "Osun", lat: 7.5629, lng: 4.5200 },
  { name: "Oyo", lat: 7.8500, lng: 3.9333 },
  { name: "Plateau", lat: 9.2182, lng: 9.5175 },
  { name: "Rivers", lat: 4.8581, lng: 6.9209 },
  { name: "Sokoto", lat: 13.0533, lng: 5.2476 },
  { name: "Taraba", lat: 7.9994, lng: 10.7740 },
  { name: "Yobe", lat: 12.2939, lng: 11.4390 },
  { name: "Zamfara", lat: 12.1704, lng: 6.2534 },
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

// Determine state from GPS coordinates
export const getStateFromGPS = (lat: number, lng: number): string | null => {
  let closestState: string | null = null;
  let minDistance = Infinity;

  for (const state of NIGERIAN_STATES) {
    const distance = getDistance(lat, lng, state.lat, state.lng);
    if (distance < minDistance && distance < 200) {
      minDistance = distance;
      closestState = state.name;
    }
  }

  return closestState;
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

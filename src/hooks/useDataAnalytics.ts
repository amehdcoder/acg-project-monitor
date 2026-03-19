import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";

export interface AnalyticsFilters {
  projectId?: string;
  formId?: string;
  state?: string;
  startDate?: string;
  endDate?: string;
}

export interface SubmissionRecord {
  id: string;
  form_id: string;
  form_name: string;
  user_id: string;
  submitter_name: string;
  location: string;
  state: string | null;
  submitted_at: string;
  status: string;
  data: Record<string, any>;
  within_geofence: boolean | null;
}

export interface FormAnalytics {
  id: string;
  name: string;
  total_submissions: number;
  current_cycle_submissions: number;
  questions: any[];
}

export interface LocationAnalytics {
  state: string;
  total_submissions: number;
  current_cycle_submissions: number;
}

export interface KPIData {
  totalSubmissions: number;
  totalSubmissionsChange: number;
  thisWeek: number;
  thisWeekChange: number;
  uniqueLocations: number;
  uniqueLocationsChange: number;
  avgCompletion: number;
  avgCompletionChange: number;
}

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

// Get Monday of current week
const getMondayOfWeek = (): Date => {
  const today = new Date();
  const day = today.getDay();
  const diff = today.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(today.setDate(diff));
  monday.setHours(0, 0, 0, 0);
  return monday;
};

export const useDataAnalytics = (filters: AnalyticsFilters = {}) => {
  const { user, isAdmin } = useAuth();
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<any[]>([]);
  const [forms, setForms] = useState<FormAnalytics[]>([]);
  const [submissions, setSubmissions] = useState<SubmissionRecord[]>([]);
  const [kpis, setKpis] = useState<KPIData>({
    totalSubmissions: 0,
    totalSubmissionsChange: 0,
    thisWeek: 0,
    thisWeekChange: 0,
    uniqueLocations: 0,
    uniqueLocationsChange: 0,
    avgCompletion: 0,
    avgCompletionChange: 0,
  });
  const [formAnalytics, setFormAnalytics] = useState<FormAnalytics[]>([]);
  const [locationAnalytics, setLocationAnalytics] = useState<LocationAnalytics[]>([]);

  // Fetch projects for the current admin
  const fetchProjects = useCallback(async () => {
    if (!user || !isAdmin) return;

    try {
      const { data, error } = await supabase
        .from("projects")
        .select("id, name")
        .order("name");

      if (error) throw error;
      setProjects(data || []);
    } catch (error: any) {
      console.error("Error fetching projects:", error);
    }
  }, [user, isAdmin]);

  // Fetch forms based on project filter or specific form
  const fetchForms = useCallback(async () => {
    if (!user) return;
    
    // For non-admins, only allow fetching if a specific formId is provided
    if (!isAdmin && !filters.formId) return;

    try {
      let query = supabase.from("forms").select("id, name, questions, project_id");

      // If a specific formId is provided, only fetch that form
      if (filters.formId) {
        query = query.eq("id", filters.formId);
      } else if (filters.projectId) {
        query = query.eq("project_id", filters.projectId);
      }

      const { data, error } = await query.order("name");
      if (error) throw error;

      const formsData = (data || []).map((f) => ({
        id: f.id,
        name: f.name,
        total_submissions: 0,
        current_cycle_submissions: 0,
        questions: Array.isArray(f.questions) ? f.questions : [],
      }));

      setForms(formsData);
      return formsData;
    } catch (error: any) {
      console.error("Error fetching forms:", error);
      return [];
    }
  }, [user, isAdmin, filters.projectId, filters.formId]);

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

  // Determine location from submission data
  const extractLocation = useCallback((submission: any): { location: string; state: string | null } => {
    const formData = submission.data as Record<string, any>;
    
    // Extract all available administrative units
    const adminUnits = {
      region: findAdminUnitValue(formData, ADMIN_UNIT_PATTERNS.region),
      state: findAdminUnitValue(formData, ADMIN_UNIT_PATTERNS.state),
      lga: findAdminUnitValue(formData, ADMIN_UNIT_PATTERNS.lga),
      ward: findAdminUnitValue(formData, ADMIN_UNIT_PATTERNS.ward),
      flhf: findAdminUnitValue(formData, ADMIN_UNIT_PATTERNS.flhf),
      community: findAdminUnitValue(formData, ADMIN_UNIT_PATTERNS.community),
      school: findAdminUnitValue(formData, ADMIN_UNIT_PATTERNS.school),
    };

    // Determine state value (primary identifier for grouping)
    const stateValue = adminUnits.state || adminUnits.region || null;

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

    // If we have any administrative unit data, use it
    if (locationParts.length > 0) {
      return { 
        location: locationParts.join(", "), 
        state: stateValue 
      };
    }

    // Fall back to GPS coordinates
    const gpsLocation = submission.location as Record<string, any>;
    if (gpsLocation?.latitude && gpsLocation?.longitude) {
      const lat = parseFloat(gpsLocation.latitude);
      const lng = parseFloat(gpsLocation.longitude);
      
      if (!isNaN(lat) && !isNaN(lng)) {
        const detectedState = getStateFromGPS(lat, lng);
        if (detectedState) {
          return { location: detectedState, state: detectedState };
        }
        
        // Format GPS with altitude and precision if available
        let gpsString = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
        if (gpsLocation.altitude && !isNaN(parseFloat(gpsLocation.altitude))) {
          gpsString += ` (Alt: ${parseFloat(gpsLocation.altitude).toFixed(1)}m)`;
        }
        if (gpsLocation.accuracy && !isNaN(parseFloat(gpsLocation.accuracy))) {
          gpsString += ` [±${parseFloat(gpsLocation.accuracy).toFixed(0)}m]`;
        }
        
        return { location: gpsString, state: null };
      }
    }

    // Check for GPS data stored in form responses (geopoint questions)
    for (const key of Object.keys(formData || {})) {
      const value = formData[key];
      if (value && typeof value === "object" && (value.lat || value.latitude)) {
        const lat = parseFloat(value.lat || value.latitude);
        const lng = parseFloat(value.lng || value.longitude);
        
        if (!isNaN(lat) && !isNaN(lng)) {
          const detectedState = getStateFromGPS(lat, lng);
          if (detectedState) {
            return { location: detectedState, state: detectedState };
          }
          return { location: `${lat.toFixed(4)}, ${lng.toFixed(4)}`, state: null };
        }
      }
    }

    return { location: "Unknown", state: null };
  }, []);

  // Fetch submissions with full data
  const fetchSubmissions = useCallback(async (formsData: FormAnalytics[]) => {
    if (!user || formsData.length === 0) {
      setSubmissions([]);
      return [];
    }
    
    // Non-admins can only fetch if a specific formId is provided
    if (!isAdmin && !filters.formId) {
      setSubmissions([]);
      return [];
    }

    try {
      const formIds = formsData.map((f) => f.id);
      
      // Fetch ALL submissions using pagination to bypass the 1000-row default limit
      let allData: any[] = [];
      const PAGE_SIZE = 1000;
      let page = 0;
      let hasMore = true;
      
      while (hasMore) {
        let query = supabase
          .from("form_submissions")
          .select("*")
          .in("form_id", formIds)
          .order("submitted_at", { ascending: false })
          .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

        if (filters.startDate) {
          query = query.gte("submitted_at", filters.startDate);
        }
        if (filters.endDate) {
          query = query.lte("submitted_at", filters.endDate);
        }

        const { data, error } = await query;
        if (error) throw error;
        
        allData = allData.concat(data || []);
        hasMore = (data?.length || 0) === PAGE_SIZE;
        page++;
      }
      if (error) throw error;

      // Get user profiles for submitter names
      const userIds = [...new Set((data || []).map((s) => s.user_id))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, first_name, last_name")
        .in("user_id", userIds);

      const profileMap = new Map(
        (profiles || []).map((p) => [p.user_id, `${p.first_name} ${p.last_name}`])
      );
      const formMap = new Map(formsData.map((f) => [f.id, f.name]));

      const processedSubmissions: SubmissionRecord[] = (data || []).map((s) => {
        const { location, state } = extractLocation(s);
        return {
          id: s.id,
          form_id: s.form_id,
          form_name: formMap.get(s.form_id) || "Unknown Form",
          user_id: s.user_id,
          submitter_name: profileMap.get(s.user_id) || "Unknown",
          location,
          state,
          submitted_at: s.submitted_at || s.created_at,
          status: s.status,
          data: s.data as Record<string, any>,
          within_geofence: s.within_geofence,
        };
      });

      // Filter by state if specified
      const filteredSubmissions = filters.state
        ? processedSubmissions.filter((s) => s.state === filters.state)
        : processedSubmissions;

      setSubmissions(filteredSubmissions);
      return filteredSubmissions;
    } catch (error: any) {
      console.error("Error fetching submissions:", error);
      return [];
    }
  }, [user, isAdmin, filters.formId, filters.startDate, filters.endDate, filters.state, extractLocation]);

  // Calculate KPIs with real period-over-period comparisons
  const calculateKPIs = useCallback((submissionsData: SubmissionRecord[]) => {
    const mondayOfWeek = getMondayOfWeek();
    const prevMondayOfWeek = new Date(mondayOfWeek);
    prevMondayOfWeek.setDate(prevMondayOfWeek.getDate() - 7);

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

    const syncedSubmissions = submissionsData.filter((s) => s.status === "sent");
    const totalSubmissions = syncedSubmissions.length;

    // Current 30-day window vs previous 30-day window
    const currentPeriodSubs = syncedSubmissions.filter(
      (s) => new Date(s.submitted_at) >= thirtyDaysAgo
    ).length;
    const prevPeriodSubs = syncedSubmissions.filter(
      (s) => {
        const d = new Date(s.submitted_at);
        return d >= sixtyDaysAgo && d < thirtyDaysAgo;
      }
    ).length;
    const totalSubmissionsChange = prevPeriodSubs > 0
      ? Math.round(((currentPeriodSubs - prevPeriodSubs) / prevPeriodSubs) * 100)
      : currentPeriodSubs > 0 ? 100 : 0;

    // This week vs last week
    const thisWeekSubmissions = syncedSubmissions.filter(
      (s) => new Date(s.submitted_at) >= mondayOfWeek
    ).length;
    const lastWeekSubmissions = syncedSubmissions.filter(
      (s) => {
        const d = new Date(s.submitted_at);
        return d >= prevMondayOfWeek && d < mondayOfWeek;
      }
    ).length;
    const thisWeekChange = thisWeekSubmissions - lastWeekSubmissions;

    // Unique states — current vs previous period
    const currentStates = new Set(
      syncedSubmissions.filter(s => new Date(s.submitted_at) >= thirtyDaysAgo).map(s => s.state).filter(Boolean)
    );
    const prevStates = new Set(
      syncedSubmissions.filter(s => {
        const d = new Date(s.submitted_at);
        return d >= sixtyDaysAgo && d < thirtyDaysAgo;
      }).map(s => s.state).filter(Boolean)
    );
    const uniqueLocationsChange = currentStates.size - prevStates.size;

    // Avg completion (synced / total including drafts) — current vs previous
    const allSubmissions = submissionsData.length;
    const avgCompletion = allSubmissions > 0
      ? Math.round((totalSubmissions / allSubmissions) * 100)
      : 0;

    const currentAllSubs = submissionsData.filter(s => new Date(s.submitted_at) >= thirtyDaysAgo);
    const currentSynced = currentAllSubs.filter(s => s.status === "sent").length;
    const currentCompletion = currentAllSubs.length > 0 ? Math.round((currentSynced / currentAllSubs.length) * 100) : 0;

    const prevAllSubs = submissionsData.filter(s => {
      const d = new Date(s.submitted_at);
      return d >= sixtyDaysAgo && d < thirtyDaysAgo;
    });
    const prevSynced = prevAllSubs.filter(s => s.status === "sent").length;
    const prevCompletion = prevAllSubs.length > 0 ? Math.round((prevSynced / prevAllSubs.length) * 100) : 0;
    const avgCompletionChange = currentCompletion - prevCompletion;

    setKpis({
      totalSubmissions,
      totalSubmissionsChange,
      thisWeek: thisWeekSubmissions,
      thisWeekChange,
      uniqueLocations: currentStates.size,
      uniqueLocationsChange,
      avgCompletion,
      avgCompletionChange,
    });
  }, []);

  // Calculate form analytics
  const calculateFormAnalytics = useCallback((formsData: FormAnalytics[], submissionsData: SubmissionRecord[]) => {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const analytics = formsData.map((form) => {
      const formSubmissions = submissionsData.filter(
        (s) => s.form_id === form.id && s.status === "sent"
      );
      const currentCycle = formSubmissions.filter(
        (s) => new Date(s.submitted_at) >= thirtyDaysAgo
      );

      return {
        ...form,
        total_submissions: formSubmissions.length,
        current_cycle_submissions: currentCycle.length,
      };
    }).sort((a, b) => b.total_submissions - a.total_submissions);

    setFormAnalytics(analytics);
  }, []);

  // Calculate location analytics
  const calculateLocationAnalytics = useCallback((submissionsData: SubmissionRecord[]) => {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const syncedSubmissions = submissionsData.filter((s) => s.status === "sent");
    const stateMap = new Map<string, { total: number; current: number }>();

    syncedSubmissions.forEach((s) => {
      if (s.state) {
        const existing = stateMap.get(s.state) || { total: 0, current: 0 };
        existing.total++;
        if (new Date(s.submitted_at) >= thirtyDaysAgo) {
          existing.current++;
        }
        stateMap.set(s.state, existing);
      }
    });

    const analytics: LocationAnalytics[] = Array.from(stateMap.entries())
      .map(([state, data]) => ({
        state,
        total_submissions: data.total,
        current_cycle_submissions: data.current,
      }))
      .sort((a, b) => b.total_submissions - a.total_submissions);

    setLocationAnalytics(analytics);
  }, []);

  // Main data refresh function
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      await fetchProjects();
      const formsData = await fetchForms();
      if (formsData && formsData.length > 0) {
        const submissionsData = await fetchSubmissions(formsData);
        calculateKPIs(submissionsData);
        calculateFormAnalytics(formsData, submissionsData);
        calculateLocationAnalytics(submissionsData);
      }
    } catch (error: any) {
      toast({
        title: "Error loading analytics",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [fetchProjects, fetchForms, fetchSubmissions, calculateKPIs, calculateFormAnalytics, calculateLocationAnalytics]);

  useEffect(() => {
    refresh();
  }, [filters.projectId, filters.formId, filters.state, filters.startDate, filters.endDate]);

  // Get unique states for filtering
  const availableStates = useMemo(() => {
    const states = new Set(submissions.map((s) => s.state).filter(Boolean) as string[]);
    return Array.from(states).sort();
  }, [submissions]);

  return {
    loading,
    projects,
    forms,
    submissions,
    kpis,
    formAnalytics,
    locationAnalytics,
    availableStates,
    refresh,
  };
};

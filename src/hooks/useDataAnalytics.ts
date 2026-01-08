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

  // Fetch forms based on project filter
  const fetchForms = useCallback(async () => {
    if (!user || !isAdmin) return;

    try {
      let query = supabase.from("forms").select("id, name, questions, project_id");

      if (filters.projectId) {
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
  }, [user, isAdmin, filters.projectId]);

  // Determine location from submission data
  const extractLocation = useCallback((submission: any): { location: string; state: string | null } => {
    const formData = submission.data as Record<string, any>;
    
    // Try form data first
    const state = formData?.state || formData?.State;
    const lga = formData?.lga || formData?.LGA;
    const ward = formData?.ward || formData?.Ward;

    if (state) {
      const locationParts = [state, lga, ward].filter(Boolean);
      return { location: locationParts.join(", "), state: String(state) };
    }

    // Fall back to GPS
    const gpsLocation = submission.location as Record<string, any>;
    if (gpsLocation?.latitude && gpsLocation?.longitude) {
      const detectedState = getStateFromGPS(gpsLocation.latitude, gpsLocation.longitude);
      if (detectedState) {
        return { location: detectedState, state: detectedState };
      }
      return { 
        location: `${gpsLocation.latitude.toFixed(4)}, ${gpsLocation.longitude.toFixed(4)}`, 
        state: null 
      };
    }

    return { location: "Unknown", state: null };
  }, []);

  // Fetch submissions with full data
  const fetchSubmissions = useCallback(async (formsData: FormAnalytics[]) => {
    if (!user || !isAdmin || formsData.length === 0) {
      setSubmissions([]);
      return [];
    }

    try {
      const formIds = formsData.map((f) => f.id);
      let query = supabase
        .from("form_submissions")
        .select("*")
        .in("form_id", formIds)
        .order("submitted_at", { ascending: false });

      if (filters.startDate) {
        query = query.gte("submitted_at", filters.startDate);
      }
      if (filters.endDate) {
        query = query.lte("submitted_at", filters.endDate);
      }

      const { data, error } = await query;
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
  }, [user, isAdmin, filters.startDate, filters.endDate, filters.state, extractLocation]);

  // Calculate KPIs
  const calculateKPIs = useCallback((submissionsData: SubmissionRecord[]) => {
    const mondayOfWeek = getMondayOfWeek();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const syncedSubmissions = submissionsData.filter((s) => s.status === "submitted");
    const totalSubmissions = syncedSubmissions.length;

    // This week submissions
    const thisWeekSubmissions = syncedSubmissions.filter(
      (s) => new Date(s.submitted_at) >= mondayOfWeek
    ).length;

    // Recent (current cycle - last 30 days)
    const currentCycleSubmissions = syncedSubmissions.filter(
      (s) => new Date(s.submitted_at) >= thirtyDaysAgo
    ).length;

    // Unique states
    const uniqueStates = new Set(
      syncedSubmissions.map((s) => s.state).filter(Boolean)
    );

    // Calculate average completion (synced / total including drafts)
    const allSubmissions = submissionsData.length;
    const avgCompletion = allSubmissions > 0 
      ? Math.round((totalSubmissions / allSubmissions) * 100) 
      : 0;

    // Calculate changes (compared to previous period)
    const totalChange = totalSubmissions > 0 
      ? Math.round((currentCycleSubmissions / totalSubmissions) * 100) 
      : 0;

    setKpis({
      totalSubmissions,
      totalSubmissionsChange: totalChange,
      thisWeek: thisWeekSubmissions,
      thisWeekChange: currentCycleSubmissions,
      uniqueLocations: uniqueStates.size,
      uniqueLocationsChange: 0,
      avgCompletion,
      avgCompletionChange: 0,
    });
  }, []);

  // Calculate form analytics
  const calculateFormAnalytics = useCallback((formsData: FormAnalytics[], submissionsData: SubmissionRecord[]) => {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const analytics = formsData.map((form) => {
      const formSubmissions = submissionsData.filter(
        (s) => s.form_id === form.id && s.status === "submitted"
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

    const syncedSubmissions = submissionsData.filter((s) => s.status === "submitted");
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

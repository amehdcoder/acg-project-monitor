import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, MapPin, Map as MapIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import MapVisualization from "@/components/MapVisualization/MapVisualization";
import { MapMarker } from "@/components/MapVisualization/types";

interface CaseLocationMapProps {
  projectFilter?: string;
  caseTypeFilter?: string;
  statusFilter?: string;
  /** When provided (e.g. owner simulation), these markers are shown instead of live data. */
  simulatedMarkers?: MapMarker[];
}

// Status-based pin colour so cases show as different coloured points on the map.
const statusColor = (status?: string): string => {
  switch ((status || "").toLowerCase()) {
    case "closed":
      return "#94a3b8"; // slate
    case "overdue":
      return "#ef4444"; // red
    case "in_progress":
    case "in progress":
      return "#f59e0b"; // amber
    case "open":
    default:
      return "#10b981"; // green
  }
};

const CaseLocationMap = ({
  projectFilter = "all",
  caseTypeFilter = "all",
  statusFilter = "all",
  simulatedMarkers,
}: CaseLocationMapProps) => {
  const { user, isAdmin } = useAuth();
  const [markers, setMarkers] = useState<MapMarker[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (simulatedMarkers) {
      setMarkers(simulatedMarkers);
      setLoading(false);
      return;
    }
    if (user?.id) fetchCaseLocations();
  }, [user?.id, projectFilter, caseTypeFilter, statusFilter, simulatedMarkers]);


  const fetchCaseLocations = async () => {
    if (!user?.id) return;
    setLoading(true);

    try {
      // Get project IDs
      let projectIds: string[] = [];
      if (isAdmin) {
        const { data } = await supabase.from("projects").select("id");
        projectIds = (data || []).map((p) => p.id);
      } else {
        const { data: assignments } = await supabase
          .from("user_project_assignments")
          .select("project_id")
          .eq("user_id", user.id);
        projectIds = (assignments || []).map((a) => a.project_id);
      }

      if (projectIds.length === 0) {
        setMarkers([]);
        setLoading(false);
        return;
      }

      // Fetch cases with their activities that have form submissions
      let casesQuery = supabase
        .from("cases")
        .select(`
          id, name, status, owner_id, project_id, properties,
          case_types!inner(id, name, label),
          projects!inner(name)
        `)
        .in("project_id", projectFilter !== "all" ? [projectFilter] : projectIds);

      if (statusFilter !== "all") {
        casesQuery = casesQuery.eq("status", statusFilter);
      }

      const { data: casesData, error: casesError } = await casesQuery;
      if (casesError) throw casesError;

      let filteredCases = casesData || [];
      if (caseTypeFilter !== "all") {
        filteredCases = filteredCases.filter(
          (c: any) => c.case_types?.id === caseTypeFilter
        );
      }

      if (filteredCases.length === 0) {
        setMarkers([]);
        setLoading(false);
        return;
      }

      const caseIds = filteredCases.map((c: any) => c.id);

      // Fetch case activities with form submissions that have location data
      const { data: activities } = await supabase
        .from("case_activities")
        .select("case_id, form_submission_id")
        .in("case_id", caseIds)
        .not("form_submission_id", "is", null);

      const submissionIds = [
        ...new Set((activities || []).map((a) => a.form_submission_id).filter(Boolean)),
      ] as string[];

      // Also look for direct submissions from forms linked to these cases
      // Get form IDs that are configured for these case types
      const caseTypeIds = [...new Set(filteredCases.map((c: any) => c.case_types?.id).filter(Boolean))];
      
      const { data: forms } = await supabase
        .from("forms")
        .select("id, settings")
        .in("project_id", projectFilter !== "all" ? [projectFilter] : projectIds);

      const relevantFormIds = (forms || [])
        .filter((f: any) => {
          const s = f.settings as Record<string, any> | null;
          const cm = s?.caseManagement;
          return cm?.enabled && cm?.caseTypeId && caseTypeIds.includes(cm.caseTypeId);
        })
        .map((f: any) => f.id);

      // Fetch submissions with GPS data
      let allSubmissionLocations: MapMarker[] = [];

      // From case activities
      if (submissionIds.length > 0) {
        const { data: subs } = await supabase
          .from("form_submissions")
          .select("id, data, location, form_id, submitted_at, user_id")
          .in("id", submissionIds);

        for (const sub of subs || []) {
          const loc = extractLocation(sub);
          if (!loc) continue;

          const caseActivity = (activities || []).find(
            (a) => a.form_submission_id === sub.id
          );
          const caseData = filteredCases.find(
            (c: any) => c.id === caseActivity?.case_id
          );

          allSubmissionLocations.push({
            id: `sub-${sub.id}`,
            lat: loc.lat,
            lng: loc.lng,
            title: (caseData as any)?.name || "Case Location",
            state: (caseData as any)?.properties?.state,
            lga: (caseData as any)?.properties?.lga,
            ward: (caseData as any)?.properties?.ward,
            community: (caseData as any)?.properties?.community,
            formName: undefined,
            markerColor: statusColor((caseData as any)?.status),
            submittedAt: sub.submitted_at || undefined,
            data: {
              _geoSource: loc.source,
              _accuracy: loc.accuracy,
              caseName: (caseData as any)?.name,
              caseType: (caseData as any)?.case_types?.label,
              caseStatus: (caseData as any)?.status,
              projectName: (caseData as any)?.projects?.name,
            },
          });
        }
      }

      // From forms linked to case types (recent submissions with location)
      if (relevantFormIds.length > 0) {
        const { data: formSubs } = await supabase
          .from("form_submissions")
          .select("id, data, location, form_id, submitted_at, user_id")
          .in("form_id", relevantFormIds)
          .eq("status", "sent")
          .order("submitted_at", { ascending: false })
          .limit(500);

        const existingSubIds = new Set(submissionIds);

        for (const sub of formSubs || []) {
          if (existingSubIds.has(sub.id)) continue;
          const loc = extractLocation(sub);
          if (!loc) continue;

          const form = (forms || []).find((f: any) => f.id === sub.form_id);
          const formSettings = form?.settings as Record<string, any> | null;
          const caseTypeId = formSettings?.caseManagement?.caseTypeId;
          const matchingCase = filteredCases.find(
            (c: any) => c.case_types?.id === caseTypeId
          );

          allSubmissionLocations.push({
            id: `formsub-${sub.id}`,
            lat: loc.lat,
            lng: loc.lng,
            title: (matchingCase as any)?.name || "Submission Location",
            formName: undefined,
            markerColor: statusColor((matchingCase as any)?.status),
            submittedAt: sub.submitted_at || undefined,
            data: {
              _geoSource: loc.source,
              _accuracy: loc.accuracy,
              caseType: matchingCase
                ? (matchingCase as any)?.case_types?.label
                : "Unknown",
            },
          });
        }
      }

      // Deduplicate by location proximity
      setMarkers(allSubmissionLocations);
    } catch (error) {
      console.error("Error fetching case locations:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      {loading ? (
        <Card className="border-0 shadow-card">
          <CardContent className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground mr-2" />
            <span className="text-sm text-muted-foreground">Loading case locations...</span>
          </CardContent>
        </Card>
      ) : markers.length === 0 ? (
        <Card className="border-0 shadow-card">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <MapPin className="h-12 w-12 text-muted-foreground/30 mb-3" />
            <h3 className="font-semibold text-foreground">No Locations Found</h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-sm">
              No GPS data available for the current cases. Ensure forms capture location data during submissions.
            </p>
          </CardContent>
        </Card>
      ) : (
        <MapVisualization
          markers={markers}
          height="500px"
          initialView="nigeria"
          showControls={true}
          showLegend={true}
        />
      )}
    </div>
  );
};

// Extract GPS coordinates from a submission
function extractLocation(sub: {
  data: any;
  location: any;
}): { lat: number; lng: number; accuracy?: number; source: string } | null {
  const data = (sub.data || {}) as Record<string, any>;

  // Check form response fields for GPS data
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === "object" && value !== null && "latitude" in value && "longitude" in value) {
      const lat = Number(value.latitude);
      const lng = Number(value.longitude);
      if (!isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0) {
        return { lat, lng, accuracy: Number(value.accuracy) || undefined, source: "form_response" };
      }
    }

    // Check for string GPS format "lat lng alt acc"
    if (typeof value === "string") {
      const parts = value.trim().split(/\s+/);
      if (parts.length >= 2) {
        const lat = Number(parts[0]);
        const lng = Number(parts[1]);
        if (
          !isNaN(lat) && !isNaN(lng) &&
          lat >= -90 && lat <= 90 &&
          lng >= -180 && lng <= 180 &&
          (lat !== 0 || lng !== 0)
        ) {
          return {
            lat,
            lng,
            accuracy: parts.length >= 4 ? Number(parts[3]) : undefined,
            source: "form_response",
          };
        }
      }
    }
  }

  // Fall back to submission-level location metadata
  const loc = sub.location as Record<string, any> | null;
  if (loc) {
    const lat = Number(loc.latitude || loc.lat);
    const lng = Number(loc.longitude || loc.lng || loc.lon);
    if (!isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0) {
      return { lat, lng, accuracy: Number(loc.accuracy) || undefined, source: "metadata" };
    }
  }

  return null;
}

export default CaseLocationMap;

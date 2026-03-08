import { useState, useEffect, useMemo } from "react";
import { ChevronDown, ChevronRight, FileText, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { buildLabelMap } from "@/lib/formLabelUtils";
import SubmissionsTable from "./SubmissionsTable";
import type { SubmissionRecord, FormAnalytics } from "@/hooks/useDataAnalytics";
import { getStateFromGPS } from "@/hooks/useDataAnalytics";

interface FormSubmissionsAccordionProps {
  form: FormAnalytics;
  profiles: Map<string, string>;
}

// Admin unit patterns for location extraction
const ADMIN_UNIT_PATTERNS: Record<string, string[]> = {
  state: ["state", "province"],
  lga: ["lga", "local_government", "district"],
  ward: ["ward"],
  community: ["community", "village", "town"],
};

const findFieldValue = (data: Record<string, any>, patterns: string[]): string | null => {
  const keys = Object.keys(data);
  for (const pattern of patterns) {
    const match = keys.find((k) => k.toLowerCase().includes(pattern));
    if (match && data[match]) return String(data[match]);
  }
  return null;
};

const extractLocation = (submission: any): { location: string; state: string | null } => {
  const formData = (submission.data || {}) as Record<string, any>;
  const state = findFieldValue(formData, ADMIN_UNIT_PATTERNS.state);
  const lga = findFieldValue(formData, ADMIN_UNIT_PATTERNS.lga);
  const ward = findFieldValue(formData, ADMIN_UNIT_PATTERNS.ward);
  const community = findFieldValue(formData, ADMIN_UNIT_PATTERNS.community);
  const parts = [state, lga, ward, community].filter(Boolean);
  if (parts.length > 0) return { location: parts.join(", "), state: state || null };

  // GPS fallback
  for (const value of Object.values(formData)) {
    if (value && typeof value === "object" && (value as any).lat) {
      const lat = parseFloat((value as any).lat);
      const lng = parseFloat((value as any).lng || (value as any).longitude);
      if (!isNaN(lat) && !isNaN(lng)) {
        const detected = getStateFromGPS(lat, lng);
        return { location: detected || `${lat.toFixed(4)}, ${lng.toFixed(4)}`, state: detected };
      }
    }
  }
  return { location: "Unknown", state: null };
};

const FormSubmissionsAccordion = ({ form, profiles }: FormSubmissionsAccordionProps) => {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submissions, setSubmissions] = useState<SubmissionRecord[]>([]);
  const [loaded, setLoaded] = useState(false);

  const questionLabels = useMemo(
    () => (form.questions ? buildLabelMap(form.questions) : {}),
    [form.questions]
  );

  useEffect(() => {
    if (!expanded || loaded) return;

    const fetchSubmissions = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from("form_submissions")
          .select("*")
          .eq("form_id", form.id)
          .order("submitted_at", { ascending: false });

        if (error) throw error;

        const mapped: SubmissionRecord[] = (data || []).map((s) => {
          const loc = extractLocation(s);
          return {
            id: s.id,
            form_id: s.form_id,
            form_name: form.name,
            user_id: s.user_id,
            submitter_name: profiles.get(s.user_id) || "Unknown",
            location: loc.location,
            state: loc.state,
            submitted_at: s.submitted_at || s.created_at,
            status: s.status,
            data: (s.data || {}) as Record<string, any>,
            within_geofence: s.within_geofence,
          };
        });

        setSubmissions(mapped);
        setLoaded(true);
      } catch (err) {
        console.error("Error fetching submissions for form:", form.id, err);
      } finally {
        setLoading(false);
      }
    };

    fetchSubmissions();
  }, [expanded, loaded, form.id, form.name, profiles]);

  return (
    <Card className="border shadow-sm">
      <button
        className="w-full flex items-center justify-between p-4 hover:bg-muted/30 transition-colors text-left"
        onClick={() => setExpanded((prev) => !prev)}
      >
        <div className="flex items-center gap-3">
          {expanded ? (
            <ChevronDown className="h-5 w-5 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-5 w-5 text-muted-foreground" />
          )}
          <FileText className="h-5 w-5 text-primary" />
          <span className="font-medium text-foreground">{form.name}</span>
        </div>
        <Badge variant="secondary" className="text-xs">
          {loaded ? `${submissions.length} submissions` : `${form.total_submissions} submissions`}
        </Badge>
      </button>

      {expanded && (
        <CardContent className="pt-0 pb-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <span className="ml-2 text-sm text-muted-foreground">Loading submissions…</span>
            </div>
          ) : (
            <SubmissionsTable
              submissions={submissions}
              loading={false}
              questionLabels={questionLabels}
              pageSize={15}
            />
          )}
        </CardContent>
      )}
    </Card>
  );
};

export default FormSubmissionsAccordion;

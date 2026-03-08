import { useState, useEffect, useMemo, useCallback } from "react";
import { ChevronDown, ChevronRight, FileText, Loader2, Download } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { buildLabelMap } from "@/lib/formLabelUtils";
import { cleanFieldKey } from "@/lib/formLabelUtils";
import { toast } from "@/hooks/use-toast";
import SubmissionsTable from "./SubmissionsTable";
import type { SubmissionRecord, FormAnalytics } from "@/hooks/useDataAnalytics";
import { getStateFromGPS } from "@/hooks/useDataAnalytics";
import * as XLSX from "xlsx";

interface FormSubmissionsAccordionProps {
  form: FormAnalytics;
  profiles: Map<string, string>;
}

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

const formatExportValue = (value: any): string => {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return value.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
  if (Array.isArray(value)) return value.map(formatExportValue).join(", ");
  if (value && typeof value === "object" && ("lat" in value || "latitude" in value)) {
    const lat = value.lat || value.latitude;
    const lng = value.lng || value.longitude;
    return `${Number(lat).toFixed(6)}, ${Number(lng).toFixed(6)}`;
  }
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
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

  const handleUpdate = useCallback((id: string, updatedData: Record<string, any>) => {
    setSubmissions((prev) =>
      prev.map((s) => (s.id === id ? { ...s, data: updatedData } : s))
    );
  }, []);

  const handleDelete = useCallback((id: string) => {
    setSubmissions((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const handleValidate = useCallback((id: string) => {
    setSubmissions((prev) =>
      prev.map((s) => (s.id === id ? { ...s, status: "sent" } : s))
    );
  }, []);

  const exportToExcel = useCallback(() => {
    if (submissions.length === 0) {
      toast({ title: "No data", description: "No submissions to export.", variant: "destructive" });
      return;
    }

    // Collect all data keys
    const dataKeys = new Set<string>();
    submissions.forEach((s) => {
      if (s.data) Object.keys(s.data).forEach((k) => dataKeys.add(k));
    });
    const dataKeysArr = Array.from(dataKeys);

    // Build rows
    const rows = submissions.map((s, idx) => {
      const row: Record<string, any> = {
        "S/N": idx + 1,
        "Submitted By": s.submitter_name || "",
        "Date": s.submitted_at
          ? new Date(s.submitted_at).toLocaleDateString("en-US", { day: "2-digit", month: "short", year: "numeric" })
          : "",
        "Status": s.status === "sent" ? "Validated" : "Pending",
      };

      dataKeysArr.forEach((key) => {
        const label = questionLabels[key] || cleanFieldKey(key);
        const value = s.data?.[key];

        // Split GPS into lat/lng columns
        if (value && typeof value === "object" && ("lat" in value || "latitude" in value)) {
          row[`${label} (Lat)`] = Number(value.lat || value.latitude).toFixed(6);
          row[`${label} (Lng)`] = Number(value.lng || value.longitude).toFixed(6);
          if (value.accuracy) row[`${label} (Accuracy)`] = `±${Math.round(value.accuracy)}m`;
        } else {
          row[label] = formatExportValue(value);
        }
      });

      return row;
    });

    // Create workbook
    const ws = XLSX.utils.json_to_sheet(rows);

    // Auto column widths
    const allHeaders = Object.keys(rows[0] || {});
    ws["!cols"] = allHeaders.map((h) => {
      const maxLen = Math.max(
        h.length,
        ...rows.map((r) => String(r[h] || "").length)
      );
      return { wch: Math.min(maxLen + 2, 40) };
    });

    // Freeze header row
    ws["!freeze"] = { xSplit: 0, ySplit: 1 };

    // Auto filter
    ws["!autofilter"] = {
      ref: XLSX.utils.encode_range({
        s: { r: 0, c: 0 },
        e: { r: rows.length, c: allHeaders.length - 1 },
      }),
    };

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Submissions");

    const safeName = form.name.replace(/[^a-zA-Z0-9_-]/g, "_").substring(0, 40);
    XLSX.writeFile(wb, `${safeName}_submissions.xlsx`);

    toast({ title: "Exported", description: `${rows.length} submissions exported to Excel.` });
  }, [submissions, questionLabels, form.name]);

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
        <div className="flex items-center gap-2">
          {loaded && submissions.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={(e) => { e.stopPropagation(); exportToExcel(); }}
            >
              <Download className="h-3.5 w-3.5" />
              Export
            </Button>
          )}
          <Badge variant="secondary" className="text-xs">
            {loaded ? `${submissions.length} submissions` : `${form.total_submissions} submissions`}
          </Badge>
        </div>
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
              onSubmissionUpdate={handleUpdate}
              onSubmissionDelete={handleDelete}
              onSubmissionValidate={handleValidate}
            />
          )}
        </CardContent>
      )}
    </Card>
  );
};

export default FormSubmissionsAccordion;

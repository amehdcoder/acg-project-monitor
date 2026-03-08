import { useState } from "react";
import {
  FileText,
  Download,
  Calendar,
  Clock,
  Loader2,
  FileSpreadsheet,
  BarChart3,
  TrendingUp,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import jsPDF from "jspdf";
import * as XLSX from "xlsx";
import { format, subDays, startOfDay, endOfDay, startOfWeek, endOfWeek } from "date-fns";
import { buildLabelMap, getFieldLabel } from "@/lib/formLabelUtils";

interface Props {
  formId?: string;
  formName?: string;
  projectId?: string;
  projectName?: string;
}

const ReportGenerator = ({ formId, formName, projectId, projectName }: Props) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [reportType, setReportType] = useState<string>("daily");

  const fetchReportData = async (from: Date, to: Date) => {
    let query = supabase
      .from("form_submissions")
      .select("id, user_id, form_id, data, submitted_at, within_geofence, location, submission_type")
      .eq("status", "sent")
      .gte("submitted_at", from.toISOString())
      .lte("submitted_at", to.toISOString())
      .order("submitted_at", { ascending: false })
      .limit(1000);

    if (formId) query = query.eq("form_id", formId);

    const { data: submissions, error } = await query;
    if (error) throw error;

    // Fetch profiles for user names
    const userIds = [...new Set((submissions || []).map(s => s.user_id))];
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, first_name, last_name, designation, state")
      .in("user_id", userIds);

    const profileMap = new Map((profiles || []).map(p => [p.user_id, p]));

    // Fetch form names and questions for labels
    const formIds = [...new Set((submissions || []).map(s => s.form_id))];
    const { data: forms } = await supabase.from("forms").select("id, name, questions").in("id", formIds);
    const formMap = new Map((forms || []).map(f => [f.id, f.name]));

    // Build label map from all form questions
    const labelMap = {};
    (forms || []).forEach((f: any) => {
      if (f.questions && Array.isArray(f.questions)) {
        Object.assign(labelMap, buildLabelMap(f.questions));
      }
    });

    return {
      submissions: submissions || [],
      profileMap,
      formMap,
      labelMap,
      dateRange: { from, to },
    };
  };

  const generatePDF = async () => {
    setIsGenerating(true);
    try {
      const { from, to } = getDateRange();
      const { submissions, profileMap, formMap } = await fetchReportData(from, to);

      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();

      // Header
      doc.setFontSize(18);
      doc.setFont("helvetica", "bold");
      doc.text("ACG Monitor Report", pageWidth / 2, 20, { align: "center" });

      doc.setFontSize(11);
      doc.setFont("helvetica", "normal");
      doc.text(
        `${formName || projectName || "All Forms"} — ${format(from, "MMM d, yyyy")} to ${format(to, "MMM d, yyyy")}`,
        pageWidth / 2, 28, { align: "center" }
      );

      doc.setFontSize(9);
      doc.text(`Generated: ${format(new Date(), "PPpp")}`, pageWidth / 2, 34, { align: "center" });

      // Summary Section
      let y = 45;
      doc.setFontSize(13);
      doc.setFont("helvetica", "bold");
      doc.text("Summary", 14, y);
      y += 8;

      const uniqueUsers = new Set(submissions.map(s => s.user_id)).size;
      const registrations = submissions.filter(s => s.submission_type === "registration").length;
      const followUps = submissions.filter(s => s.submission_type === "follow_up").length;
      const geofenceChecked = submissions.filter(s => s.within_geofence !== null);
      const withinGeofence = geofenceChecked.filter(s => s.within_geofence === true);
      const compliance = geofenceChecked.length > 0
        ? Math.round((withinGeofence.length / geofenceChecked.length) * 100)
        : 100;

      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      const summaryItems = [
        `Total Submissions: ${submissions.length}`,
        `Unique Enumerators: ${uniqueUsers}`,
        `Registrations: ${registrations}`,
        `Follow-ups: ${followUps}`,
        `Geofence Compliance: ${compliance}%`,
        `Unique Forms: ${new Set(submissions.map(s => s.form_id)).size}`,
      ];
      summaryItems.forEach(item => {
        doc.text(`• ${item}`, 18, y);
        y += 6;
      });

      // Enumerator Performance Table
      y += 6;
      doc.setFontSize(13);
      doc.setFont("helvetica", "bold");
      doc.text("Enumerator Performance", 14, y);
      y += 8;

      // Table header
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.text("Name", 14, y);
      doc.text("Designation", 70, y);
      doc.text("State", 120, y);
      doc.text("Submissions", 155, y);
      y += 2;
      doc.line(14, y, pageWidth - 14, y);
      y += 5;

      // Table rows
      doc.setFont("helvetica", "normal");
      const userSubmissions = new Map<string, number>();
      submissions.forEach(s => {
        userSubmissions.set(s.user_id, (userSubmissions.get(s.user_id) || 0) + 1);
      });

      const sortedUsers = Array.from(userSubmissions.entries()).sort((a, b) => b[1] - a[1]);
      sortedUsers.slice(0, 20).forEach(([userId, count]) => {
        if (y > 270) {
          doc.addPage();
          y = 20;
        }
        const profile = profileMap.get(userId);
        doc.text(`${profile?.first_name || ""} ${profile?.last_name || ""}`.trim() || "Unknown", 14, y);
        doc.text(profile?.designation || "", 70, y);
        doc.text(profile?.state || "", 120, y);
        doc.text(count.toString(), 165, y);
        y += 5.5;
      });

      // Footer
      doc.setFontSize(8);
      doc.setTextColor(128);
      doc.text("Amehnities Consulting Group (ACG) — Monitoring & Supervision Platform", pageWidth / 2, 290, { align: "center" });

      doc.save(`ACG_Report_${format(new Date(), "yyyy-MM-dd")}.pdf`);
      toast({ title: "Report Generated", description: "PDF report has been downloaded." });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setIsGenerating(false);
    }
  };

  const generateExcel = async () => {
    setIsGenerating(true);
    try {
      const { from, to } = getDateRange();
      const { submissions, profileMap, formMap, labelMap } = await fetchReportData(from, to);

      // --- Summary sheet ---
      const summaryData = [
        ["ACG Monitor Report"],
        [`Date Range: ${format(from, "dd MMM yyyy")} - ${format(to, "dd MMM yyyy")}`],
        [`Generated: ${format(new Date(), "dd MMM yyyy, HH:mm")}`],
        [],
        ["Metric", "Value"],
        ["Total Submissions", submissions.length],
        ["Unique Enumerators", new Set(submissions.map(s => s.user_id)).size],
        ["Registrations", submissions.filter(s => s.submission_type === "registration").length],
        ["Follow-ups", submissions.filter(s => s.submission_type === "follow_up").length],
        ["Unique Forms", new Set(submissions.map(s => s.form_id)).size],
        ["Geofence Compliant", submissions.filter(s => s.within_geofence === true).length],
      ];

      // --- Submissions sheet (flattened form data) ---
      const dataKeySet = new Set<string>();
      submissions.forEach(s => {
        const d = s.data as Record<string, any> | null;
        if (d && typeof d === "object") {
          Object.entries(d).forEach(([k, v]) => {
            if (typeof v !== "object" || v === null) dataKeySet.add(k);
          });
        }
      });
      const dataKeys = Array.from(dataKeySet).sort();

      const subHeaders = ["S/N", "Submission ID", "Enumerator", "Designation", "State", "Form", "Type", "Submitted At", "Geofence", ...dataKeys.map(k => getFieldLabel(k, labelMap as any))];
      const subRows = submissions.map((s, idx) => {
        const profile = profileMap.get(s.user_id);
        const d = (s.data && typeof s.data === "object" ? s.data : {}) as Record<string, any>;
        return [
          idx + 1,
          s.id,
          `${profile?.first_name || ""} ${profile?.last_name || ""}`.trim() || "Unknown",
          profile?.designation || "",
          profile?.state || "",
          formMap.get(s.form_id) || s.form_id,
          s.submission_type || "regular",
          s.submitted_at ? format(new Date(s.submitted_at), "dd MMM yyyy, HH:mm") : "",
          s.within_geofence === null ? "" : s.within_geofence ? "Yes" : "No",
          ...dataKeys.map(k => {
            const v = d[k];
            if (v === null || v === undefined) return "";
            if (typeof v === "boolean") return v ? "Yes" : "No";
            return String(v);
          }),
        ];
      });

      // --- Enumerator performance sheet ---
      const userCounts = new Map<string, number>();
      submissions.forEach(s => userCounts.set(s.user_id, (userCounts.get(s.user_id) || 0) + 1));
      const perfHeaders = ["S/N", "Name", "Designation", "State", "Submissions"];
      const perfRows = Array.from(userCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([uid, count], idx) => {
          const p = profileMap.get(uid);
          return [
            idx + 1,
            `${p?.first_name || ""} ${p?.last_name || ""}`.trim(),
            p?.designation || "",
            p?.state || "",
            count,
          ];
        });

      // Auto-width helper
      const calcWidths = (headers: string[], rows: any[][]): { wch: number }[] =>
        headers.map((h, i) => {
          const maxLen = rows.reduce((m, r) => Math.max(m, String(r[i] || "").length), 0);
          return { wch: Math.min(Math.max(h.length, maxLen, 8) + 2, 50) };
        });

      const wb = XLSX.utils.book_new();

      // Summary
      const ws1 = XLSX.utils.aoa_to_sheet(summaryData);
      ws1['!cols'] = [{ wch: 22 }, { wch: 50 }];
      XLSX.utils.book_append_sheet(wb, ws1, "Summary");

      // Submissions
      const ws2 = XLSX.utils.aoa_to_sheet([subHeaders, ...subRows]);
      ws2['!cols'] = calcWidths(subHeaders, subRows);
      ws2['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: subRows.length, c: subHeaders.length - 1 } }) };
      // @ts-ignore
      ws2['!views'] = [{ state: 'frozen', ySplit: 1 }];
      XLSX.utils.book_append_sheet(wb, ws2, "Submissions");

      // Performance
      const ws3 = XLSX.utils.aoa_to_sheet([perfHeaders, ...perfRows]);
      ws3['!cols'] = calcWidths(perfHeaders, perfRows);
      ws3['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: perfRows.length, c: perfHeaders.length - 1 } }) };
      // @ts-ignore
      ws3['!views'] = [{ state: 'frozen', ySplit: 1 }];
      XLSX.utils.book_append_sheet(wb, ws3, "Enumerator Performance");

      XLSX.writeFile(wb, `ACG_Report_${format(new Date(), "yyyy-MM-dd")}.xlsx`);
      toast({ title: "Report Generated", description: "Excel report with 3 sheets has been downloaded." });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setIsGenerating(false);
    }
  };

  const getDateRange = () => {
    const now = new Date();
    switch (reportType) {
      case "daily":
        return { from: startOfDay(now), to: endOfDay(now) };
      case "yesterday":
        return { from: startOfDay(subDays(now, 1)), to: endOfDay(subDays(now, 1)) };
      case "weekly":
        return { from: startOfWeek(now, { weekStartsOn: 1 }), to: endOfWeek(now, { weekStartsOn: 1 }) };
      case "last7":
        return { from: startOfDay(subDays(now, 7)), to: endOfDay(now) };
      case "last30":
        return { from: startOfDay(subDays(now, 30)), to: endOfDay(now) };
      default:
        return { from: startOfDay(now), to: endOfDay(now) };
    }
  };

  return (
    <Card className="border-0 shadow-card">
      <CardHeader className="pb-3">
        <CardTitle className="font-display text-lg flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-primary" />
          Report Generator
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <Select value={reportType} onValueChange={setReportType}>
            <SelectTrigger className="flex-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="daily">
                <div className="flex items-center gap-2">
                  <Clock className="h-3.5 w-3.5" />
                  Today's Report
                </div>
              </SelectItem>
              <SelectItem value="yesterday">
                <div className="flex items-center gap-2">
                  <Calendar className="h-3.5 w-3.5" />
                  Yesterday's Report
                </div>
              </SelectItem>
              <SelectItem value="weekly">
                <div className="flex items-center gap-2">
                  <Calendar className="h-3.5 w-3.5" />
                  This Week
                </div>
              </SelectItem>
              <SelectItem value="last7">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-3.5 w-3.5" />
                  Last 7 Days
                </div>
              </SelectItem>
              <SelectItem value="last30">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-3.5 w-3.5" />
                  Last 30 Days
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Button
            variant="outline"
            onClick={generatePDF}
            disabled={isGenerating}
            className="flex items-center gap-2"
          >
            {isGenerating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileText className="h-4 w-4 text-destructive" />
            )}
            Export PDF
          </Button>
          <Button
            variant="outline"
            onClick={generateExcel}
            disabled={isGenerating}
            className="flex items-center gap-2"
          >
            {isGenerating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileSpreadsheet className="h-4 w-4 text-green-600" />
            )}
            Export Excel
          </Button>
        </div>

        <p className="text-xs text-muted-foreground text-center">
          {formName ? `Reporting on: ${formName}` : "Reporting on all forms"}
          {" · "}
          {(() => {
            const { from, to } = getDateRange();
            return `${format(from, "MMM d")} – ${format(to, "MMM d, yyyy")}`;
          })()}
        </p>
      </CardContent>
    </Card>
  );
};

export default ReportGenerator;

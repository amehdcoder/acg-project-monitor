import { useState, useEffect, useMemo } from "react";
import {
  Filter,
  RefreshCw,
  Download,
  ChevronDown,
  X,
  FileSpreadsheet,
  FileJson,
  FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import type { AnalyticsFilters as FilterType } from "@/hooks/useDataAnalytics";
import type { SubmissionRecord, FormAnalytics } from "@/hooks/useDataAnalytics";
import { buildLabelMap, getFieldLabel, type QuestionLabelMap } from "@/lib/formLabelUtils";
import ExportColumnPicker, { type ColumnDef } from "./ExportColumnPicker";

interface AnalyticsFiltersProps {
  projects: { id: string; name: string }[];
  forms: FormAnalytics[];
  availableStates: string[];
  filters: FilterType;
  onFilterChange: (filters: FilterType) => void;
  onRefresh: () => void;
  submissions: SubmissionRecord[];
  loading?: boolean;
}

const AnalyticsFilters = ({
  projects,
  forms,
  availableStates,
  filters,
  onFilterChange,
  onRefresh,
  submissions,
  loading,
}: AnalyticsFiltersProps) => {
  const [filterOpen, setFilterOpen] = useState(false);
  const [columnPickerOpen, setColumnPickerOpen] = useState(false);
  const [pendingFormat, setPendingFormat] = useState<"csv" | "json" | "xlsx">("xlsx");
  const [formLabelMap, setFormLabelMap] = useState<QuestionLabelMap>({});

  // Fetch form questions for label resolution when forms change
  useEffect(() => {
    const fetchFormLabels = async () => {
      const formIds = forms.map((f) => f.id);
      if (formIds.length === 0) return;

      const { data } = await supabase
        .from("forms")
        .select("id, questions")
        .in("id", formIds);

      const combined: QuestionLabelMap = {};
      (data || []).forEach((f: any) => {
        if (f.questions && Array.isArray(f.questions)) {
          Object.assign(combined, buildLabelMap(f.questions));
        }
      });
      setFormLabelMap(combined);
    };

    fetchFormLabels();
  }, [forms]);

  const hasActiveFilters = !!(
    filters.projectId ||
    filters.formId ||
    filters.state ||
    filters.startDate ||
    filters.endDate
  );

  const clearFilters = () => {
    onFilterChange({});
    setFilterOpen(false);
  };

  // Helper function to flatten nested objects
  const flattenObject = (obj: any, prefix = ''): Record<string, any> => {
    const result: Record<string, any> = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        const newKey = prefix ? `${prefix}_${key}` : key;
        const value = obj[key];
        if (value === null || value === undefined) {
          result[newKey] = '';
        } else if (Array.isArray(value)) {
          result[newKey] = value.map(v =>
            typeof v === 'object' ? JSON.stringify(v) : String(v)
          ).join(', ');
        } else if (typeof value === 'object' && !(value instanceof Date)) {
          Object.assign(result, flattenObject(value, newKey));
        } else if (typeof value === 'boolean') {
          result[newKey] = value ? 'Yes' : 'No';
        } else {
          result[newKey] = String(value);
        }
      }
    }
    return result;
  };

  const escapeCsvValue = (value: string): string => {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  };

  const getColumnWidths = (headers: string[], rows: string[][]): { wch: number }[] => {
    return headers.map((header, i) => {
      const maxDataLen = rows.reduce((max, row) => {
        const cellLen = (row[i] || '').toString().length;
        return Math.max(max, cellLen);
      }, 0);
      return { wch: Math.min(Math.max(header.length, maxDataLen, 8) + 2, 50) };
    });
  };

  // Build all available columns from submissions
  const allColumns: ColumnDef[] = useMemo(() => {
    const metaCols: ColumnDef[] = [
      { key: "meta_sn", label: "S/N", isMeta: true },
      { key: "meta_form", label: "Form", isMeta: true },
      { key: "meta_submitted_by", label: "Submitted By", isMeta: true },
      { key: "meta_location", label: "Location", isMeta: true },
      { key: "meta_lat", label: "Latitude", isMeta: true },
      { key: "meta_lng", label: "Longitude", isMeta: true },
      { key: "meta_date", label: "Date", isMeta: true },
      { key: "meta_time", label: "Time", isMeta: true },
      { key: "meta_status", label: "Status", isMeta: true },
      { key: "meta_geofence", label: "Geofence", isMeta: true },
    ];

    // Collect form data keys across all submissions
    const keySet = new Set<string>();
    submissions.forEach((s) => {
      if (s.data) {
        const flat = flattenObject(s.data);
        Object.keys(flat).forEach((k) => keySet.add(k));
      }
    });

    const formCols: ColumnDef[] = Array.from(keySet)
      .sort()
      .map((key) => ({
        key: `field_${key}`,
        label: getFieldLabel(key, formLabelMap),
        isMeta: false,
      }));

    return [...metaCols, ...formCols];
  }, [submissions, formLabelMap]);

  // Open column picker before export
  const initiateExport = (format: "csv" | "json" | "xlsx") => {
    if (submissions.length === 0) {
      toast({
        title: "No data to export",
        description: "Please select a form with submissions to export.",
        variant: "destructive",
      });
      return;
    }

    if (format === "json") {
      // JSON doesn't need column picker - export all
      handleExport("json", allColumns.map((c) => c.key));
      return;
    }

    setPendingFormat(format);
    setColumnPickerOpen(true);
  };

  const handleExport = async (format: "csv" | "json" | "xlsx", selectedKeys: string[]) => {
    try {
      const selectedSet = new Set(selectedKeys);

      // Flatten submissions
      const flattenedSubmissions = submissions.map((s) => {
        const flatData = s.data ? flattenObject(s.data) : {};
        return { ...s, flatData };
      });

      // Filter columns
      const selectedColumns = allColumns.filter((c) => selectedSet.has(c.key));
      const selectedMetaKeys = selectedColumns.filter((c) => c.isMeta).map((c) => c.key);
      const selectedFieldKeys = selectedColumns
        .filter((c) => !c.isMeta)
        .map((c) => c.key.replace(/^field_/, ""));

      const headers = selectedColumns.map((c) => c.label);

      const buildRow = (s: typeof flattenedSubmissions[0], index: number): string[] => {
        const date = new Date(s.submitted_at);
        const location = typeof s.location === "string" ? s.location : "";
        let lat = "", lng = "";

        if (s.data) {
          const d = s.data as Record<string, any>;
          if (d.gps_location) {
            lat = d.gps_location.lat?.toString() || d.gps_location.latitude?.toString() || "";
            lng = d.gps_location.lng?.toString() || d.gps_location.longitude?.toString() || "";
          }
          if (!lat) {
            for (const key of Object.keys(d)) {
              const v = d[key];
              if (v && typeof v === "object" && (v.lat || v.latitude) && (v.lng || v.longitude)) {
                lat = (v.lat || v.latitude)?.toString() || "";
                lng = (v.lng || v.longitude)?.toString() || "";
                break;
              }
            }
          }
        }

        const metaMap: Record<string, string> = {
          meta_sn: String(index + 1),
          meta_form: s.form_name || "",
          meta_submitted_by: s.submitter_name || "",
          meta_location: location,
          meta_lat: lat,
          meta_lng: lng,
          meta_date: date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }),
          meta_time: date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }),
          meta_status: s.status === "sent" ? "Synced" : s.status || "",
          meta_geofence: s.within_geofence === null ? "" : s.within_geofence ? "Yes" : "No",
        };

        const row: string[] = [];
        selectedColumns.forEach((col) => {
          if (col.isMeta) {
            row.push(metaMap[col.key] || "");
          } else {
            const rawKey = col.key.replace(/^field_/, "");
            row.push(s.flatData[rawKey] != null ? String(s.flatData[rawKey]) : "");
          }
        });
        return row;
      };

      let content: string;
      let mimeType: string;
      let extension: string;

      if (format === "csv") {
        const rows = flattenedSubmissions.map((s, i) => buildRow(s, i));
        const csvHeaders = headers.map(escapeCsvValue).join(",");
        const csvRows = rows.map((row) => row.map(escapeCsvValue).join(","));
        content = [csvHeaders, ...csvRows].join("\n");
        mimeType = "text/csv;charset=utf-8";
        extension = "csv";
      } else if (format === "json") {
        content = JSON.stringify(
          flattenedSubmissions.map((s) => ({
            form: s.form_name,
            submittedBy: s.submitter_name,
            location: s.location,
            date: s.submitted_at,
            status: s.status,
            ...s.flatData,
          })),
          null,
          2
        );
        mimeType = "application/json";
        extension = "json";
      } else {
        // Excel
        const rows = flattenedSubmissions.map((s, i) => buildRow(s, i));
        const wsData = [headers, ...rows];

        const XLSX = await import("xlsx");
        const ws = XLSX.utils.aoa_to_sheet(wsData);
        ws["!cols"] = getColumnWidths(headers, rows);
        ws["!autofilter"] = {
          ref: XLSX.utils.encode_range({
            s: { r: 0, c: 0 },
            e: { r: rows.length, c: headers.length - 1 },
          }),
        };
        // @ts-ignore
        ws["!views"] = [{ state: "frozen", ySplit: 1 }];

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Submissions");

        // Summary sheet
        const summaryData = [
          ["ACG Monitor — Data Export Summary"],
          [],
          ["Metric", "Value"],
          ["Total Records", submissions.length],
          ["Form(s)", [...new Set(submissions.map((s) => s.form_name))].join(", ")],
          ["Date Range", filters.startDate && filters.endDate
            ? `${filters.startDate} to ${filters.endDate}`
            : "All dates"],
          ["State Filter", filters.state || "All states"],
          ["Synced Records", submissions.filter((s) => s.status === "sent").length],
          ["Pending Records", submissions.filter((s) => s.status !== "sent").length],
          ["Columns Exported", selectedColumns.length],
          [],
          ["Exported At", new Date().toLocaleString("en-GB")],
        ];
        const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
        wsSummary["!cols"] = [{ wch: 20 }, { wch: 50 }];
        XLSX.utils.book_append_sheet(wb, wsSummary, "Summary");

        const excelBuffer = XLSX.write(wb, { bookType: "xlsx", type: "array" });
        const blob = new Blob([excelBuffer], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        });

        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `submissions-export-${new Date().toISOString().split("T")[0]}.xlsx`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        toast({
          title: "Export successful",
          description: `Exported ${submissions.length} records with ${selectedColumns.length} columns.`,
        });
        return;
      }

      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `submissions-export-${new Date().toISOString().split("T")[0]}.${extension}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast({
        title: "Export successful",
        description: `Exported ${submissions.length} submissions as ${format.toUpperCase()}.`,
      });
    } catch (error: any) {
      toast({
        title: "Export failed",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {/* Filter Popover */}
        <Popover open={filterOpen} onOpenChange={setFilterOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" className="relative">
              <Filter className="h-4 w-4" />
              Filter
              {hasActiveFilters && (
                <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-primary" />
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80" align="start">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-medium">Filters</h4>
                {hasActiveFilters && (
                  <Button variant="ghost" size="sm" onClick={clearFilters}>
                    <X className="h-4 w-4 mr-1" />
                    Clear
                  </Button>
                )}
              </div>

              <div className="space-y-3">
                <div className="space-y-1">
                  <Label>Project</Label>
                  <Select
                    value={filters.projectId || "all"}
                    onValueChange={(value) =>
                      onFilterChange({ ...filters, projectId: value === "all" ? undefined : value, formId: undefined })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="All Projects" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Projects</SelectItem>
                      {projects.map((project) => (
                        <SelectItem key={project.id} value={project.id}>
                          {project.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label>Form</Label>
                  <Select
                    value={filters.formId || "all"}
                    onValueChange={(value) =>
                      onFilterChange({ ...filters, formId: value === "all" ? undefined : value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="All Forms" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Forms</SelectItem>
                      {forms.map((form) => (
                        <SelectItem key={form.id} value={form.id}>
                          {form.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label>State</Label>
                  <Select
                    value={filters.state || "all"}
                    onValueChange={(value) =>
                      onFilterChange({ ...filters, state: value === "all" ? undefined : value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="All States" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All States</SelectItem>
                      {availableStates.map((state) => (
                        <SelectItem key={state} value={state}>
                          {state}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label>Start Date</Label>
                    <Input
                      type="date"
                      value={filters.startDate || ""}
                      onChange={(e) =>
                        onFilterChange({ ...filters, startDate: e.target.value || undefined })
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>End Date</Label>
                    <Input
                      type="date"
                      value={filters.endDate || ""}
                      onChange={(e) =>
                        onFilterChange({ ...filters, endDate: e.target.value || undefined })
                      }
                    />
                  </div>
                </div>
              </div>

              <Button className="w-full" onClick={() => setFilterOpen(false)}>
                Apply Filters
              </Button>
            </div>
          </PopoverContent>
        </Popover>

        {/* Refresh Button */}
        <Button variant="outline" onClick={onRefresh} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>

        {/* Export Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="acg">
              <Download className="h-4 w-4" />
              Export
              <ChevronDown className="h-4 w-4 ml-1" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => initiateExport("csv")}>
              <FileText className="h-4 w-4 mr-2" />
              Export as CSV
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => initiateExport("xlsx")}>
              <FileSpreadsheet className="h-4 w-4 mr-2" />
              Export as Excel
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => initiateExport("json")}>
              <FileJson className="h-4 w-4 mr-2" />
              Export as JSON
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Column Picker Dialog */}
      <ExportColumnPicker
        open={columnPickerOpen}
        onOpenChange={setColumnPickerOpen}
        columns={allColumns}
        exportFormat={pendingFormat}
        onExport={(selectedKeys) => handleExport(pendingFormat, selectedKeys)}
      />
    </>
  );
};

export default AnalyticsFilters;

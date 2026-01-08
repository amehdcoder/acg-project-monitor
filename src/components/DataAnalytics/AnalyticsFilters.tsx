import { useState } from "react";
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
import type { AnalyticsFilters as FilterType } from "@/hooks/useDataAnalytics";
import type { SubmissionRecord, FormAnalytics } from "@/hooks/useDataAnalytics";

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

  const handleExport = (format: "csv" | "json" | "xlsx") => {
    if (submissions.length === 0) {
      toast({
        title: "No data to export",
        description: "Please select a form with submissions to export.",
        variant: "destructive",
      });
      return;
    }

    try {
      let content: string;
      let mimeType: string;
      let extension: string;

      if (format === "csv") {
        const headers = ["Form", "Submitted By", "Location", "Date", "Status"];
        const rows = submissions.map((s) => [
          s.form_name,
          s.submitter_name,
          s.location,
          new Date(s.submitted_at).toLocaleDateString(),
          s.status,
        ]);
        content = [headers, ...rows].map((row) => row.join(",")).join("\n");
        mimeType = "text/csv";
        extension = "csv";
      } else if (format === "json") {
        content = JSON.stringify(
          submissions.map((s) => ({
            form: s.form_name,
            submittedBy: s.submitter_name,
            location: s.location,
            date: s.submitted_at,
            status: s.status,
            data: s.data,
          })),
          null,
          2
        );
        mimeType = "application/json";
        extension = "json";
      } else {
        // For xlsx, we'll export as CSV (would need xlsx library for true xlsx)
        const headers = ["Form", "Submitted By", "Location", "Date", "Status"];
        const rows = submissions.map((s) => [
          s.form_name,
          s.submitter_name,
          s.location,
          new Date(s.submitted_at).toLocaleDateString(),
          s.status,
        ]);
        content = [headers, ...rows].map((row) => row.join("\t")).join("\n");
        mimeType = "text/tab-separated-values";
        extension = "xls";
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
          <DropdownMenuItem onClick={() => handleExport("csv")}>
            <FileText className="h-4 w-4 mr-2" />
            Export as CSV
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleExport("xlsx")}>
            <FileSpreadsheet className="h-4 w-4 mr-2" />
            Export as Excel
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => handleExport("json")}>
            <FileJson className="h-4 w-4 mr-2" />
            Export as JSON
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};

export default AnalyticsFilters;

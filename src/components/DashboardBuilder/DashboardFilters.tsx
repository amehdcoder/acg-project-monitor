import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent } from "@/components/ui/card";
import { CalendarIcon, Filter, X } from "lucide-react";
import { format, subDays, startOfWeek, startOfMonth, startOfYear } from "date-fns";
import { cn } from "@/lib/utils";
import { DateRange } from "react-day-picker";

export interface DashboardFilterValues {
  dateRange: DateRange | undefined;
  location: string;
  customField?: string;
  customValue?: string;
}

interface DashboardFiltersProps {
  filters: DashboardFilterValues;
  onFiltersChange: (filters: DashboardFilterValues) => void;
  locations: string[];
  questions?: Array<{ id: string; label: string; type: string; options?: { label: string; value: string }[] }>;
}

const DATE_PRESETS = [
  { label: "Today", getValue: () => ({ from: new Date(), to: new Date() }) },
  { label: "Last 7 Days", getValue: () => ({ from: subDays(new Date(), 7), to: new Date() }) },
  { label: "Last 30 Days", getValue: () => ({ from: subDays(new Date(), 30), to: new Date() }) },
  { label: "This Week", getValue: () => ({ from: startOfWeek(new Date()), to: new Date() }) },
  { label: "This Month", getValue: () => ({ from: startOfMonth(new Date()), to: new Date() }) },
  { label: "This Year", getValue: () => ({ from: startOfYear(new Date()), to: new Date() }) },
];

const DashboardFilters = ({
  filters,
  onFiltersChange,
  locations,
  questions = [],
}: DashboardFiltersProps) => {
  const [showFilters, setShowFilters] = useState(false);

  const handleDateRangeChange = (range: DateRange | undefined) => {
    onFiltersChange({ ...filters, dateRange: range });
  };

  const handleLocationChange = (value: string) => {
    onFiltersChange({ ...filters, location: value === "__all__" ? "" : value });
  };

  const handleCustomFieldChange = (value: string) => {
    onFiltersChange({ ...filters, customField: value === "__none__" ? "" : value, customValue: "" });
  };

  const handleCustomValueChange = (value: string) => {
    onFiltersChange({ ...filters, customValue: value });
  };

  const clearFilters = () => {
    onFiltersChange({
      dateRange: undefined,
      location: "",
      customField: "",
      customValue: "",
    });
  };

  const activeFiltersCount = [
    filters.dateRange,
    filters.location,
    filters.customField && filters.customValue,
  ].filter(Boolean).length;

  const selectableQuestions = questions.filter(
    (q) => q.type === "select_one" || q.type === "select_multiple"
  );

  const selectedQuestion = questions.find((q) => q.id === filters.customField);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <Button
          variant={showFilters ? "secondary" : "outline"}
          size="sm"
          onClick={() => setShowFilters(!showFilters)}
          className="gap-2"
        >
          <Filter className="h-4 w-4" />
          Filters
          {activeFiltersCount > 0 && (
            <span className="ml-1 bg-primary text-primary-foreground rounded-full px-1.5 py-0.5 text-xs font-medium">
              {activeFiltersCount}
            </span>
          )}
        </Button>

        {/* Quick date presets */}
        <div className="flex gap-1">
          {DATE_PRESETS.slice(0, 3).map((preset) => (
            <Button
              key={preset.label}
              variant="ghost"
              size="sm"
              className={cn(
                "text-xs",
                filters.dateRange?.from &&
                format(filters.dateRange.from, "yyyy-MM-dd") === format(preset.getValue().from, "yyyy-MM-dd")
                  ? "bg-muted"
                  : ""
              )}
              onClick={() => handleDateRangeChange(preset.getValue())}
            >
              {preset.label}
            </Button>
          ))}
        </div>

        {activeFiltersCount > 0 && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="text-muted-foreground">
            <X className="h-4 w-4 mr-1" />
            Clear
          </Button>
        )}
      </div>

      {showFilters && (
        <Card>
          <CardContent className="pt-4">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {/* Date Range */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Date Range</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !filters.dateRange && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {filters.dateRange?.from ? (
                        filters.dateRange.to ? (
                          <>
                            {format(filters.dateRange.from, "LLL dd")} -{" "}
                            {format(filters.dateRange.to, "LLL dd, y")}
                          </>
                        ) : (
                          format(filters.dateRange.from, "LLL dd, y")
                        )
                      ) : (
                        "Select date range"
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <div className="flex">
                      <div className="border-r p-2 space-y-1">
                        {DATE_PRESETS.map((preset) => (
                          <Button
                            key={preset.label}
                            variant="ghost"
                            size="sm"
                            className="w-full justify-start text-xs"
                            onClick={() => handleDateRangeChange(preset.getValue())}
                          >
                            {preset.label}
                          </Button>
                        ))}
                      </div>
                      <Calendar
                        mode="range"
                        defaultMonth={filters.dateRange?.from}
                        selected={filters.dateRange}
                        onSelect={handleDateRangeChange}
                        numberOfMonths={2}
                      />
                    </div>
                  </PopoverContent>
                </Popover>
              </div>

              {/* Location Filter */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Location</Label>
                <Select
                  value={filters.location || "__all__"}
                  onValueChange={handleLocationChange}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All locations" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All locations</SelectItem>
                    {locations.map((loc) => (
                      <SelectItem key={loc} value={loc}>
                        {loc}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Custom Field Filter */}
              {selectableQuestions.length > 0 && (
                <>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Filter by Field</Label>
                    <Select
                      value={filters.customField || "__none__"}
                      onValueChange={handleCustomFieldChange}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select field" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">None</SelectItem>
                        {selectableQuestions.map((q) => (
                          <SelectItem key={q.id} value={q.id}>
                            {q.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {selectedQuestion && (
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">{selectedQuestion.label}</Label>
                      <Select
                        value={filters.customValue || "__all__"}
                        onValueChange={handleCustomValueChange}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select value" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__all__">All values</SelectItem>
                          {selectedQuestion.options?.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default DashboardFilters;

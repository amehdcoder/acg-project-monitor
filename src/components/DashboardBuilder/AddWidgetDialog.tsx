import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BarChart3,
  LineChart,
  PieChart,
  AreaChart,
  Activity,
  Table2,
  Hash,
  Type,
} from "lucide-react";
import type { DashboardWidget, WidgetConfig, FormQuestion } from "@/hooks/useDashboardBuilder";

interface AddWidgetDialogProps {
  open: boolean;
  onClose: () => void;
  onAdd: (
    widgetType: DashboardWidget["widget_type"],
    title: string,
    config: WidgetConfig
  ) => void;
  questions: FormQuestion[];
  editingWidget?: DashboardWidget | null;
}

const WIDGET_TYPES = [
  { type: "bar" as const, label: "Bar Chart", icon: BarChart3, description: "Compare categories" },
  { type: "line" as const, label: "Line Chart", icon: LineChart, description: "Show trends over time" },
  { type: "pie" as const, label: "Pie Chart", icon: PieChart, description: "Show proportions" },
  { type: "area" as const, label: "Area Chart", icon: AreaChart, description: "Show volume over time" },
  { type: "radar" as const, label: "Radar Chart", icon: Activity, description: "Compare multiple dimensions" },
  { type: "table" as const, label: "Data Table", icon: Table2, description: "Show recent submissions" },
  { type: "kpi" as const, label: "KPI Card", icon: Hash, description: "Display a single metric" },
  { type: "text" as const, label: "Text Block", icon: Type, description: "Add custom text" },
];

const AddWidgetDialog = ({
  open,
  onClose,
  onAdd,
  questions,
  editingWidget,
}: AddWidgetDialogProps) => {
  const [selectedType, setSelectedType] = useState<DashboardWidget["widget_type"]>(
    editingWidget?.widget_type || "bar"
  );
  const [title, setTitle] = useState(editingWidget?.title || "");
  const [config, setConfig] = useState<WidgetConfig>(editingWidget?.config || {});

  const handleSubmit = () => {
    if (!title.trim()) return;
    onAdd(selectedType, title, config);
    handleClose();
  };

  const handleClose = () => {
    setSelectedType("bar");
    setTitle("");
    setConfig({});
    onClose();
  };

  const choiceQuestions = questions.filter(
    (q) => q.type === "select_one" || q.type === "select_multiple"
  );
  const numericQuestions = questions.filter(
    (q) => q.type === "number" || q.type === "range"
  );

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {editingWidget ? "Edit Widget" : "Add New Widget"}
          </DialogTitle>
        </DialogHeader>

        <Tabs value={selectedType} onValueChange={(v) => setSelectedType(v as DashboardWidget["widget_type"])}>
          <TabsList className="grid grid-cols-4 lg:grid-cols-8 h-auto gap-1">
            {WIDGET_TYPES.map((wt) => (
              <TabsTrigger
                key={wt.type}
                value={wt.type}
                className="flex flex-col items-center gap-1 py-2 px-2"
              >
                <wt.icon className="h-4 w-4" />
                <span className="text-[10px] leading-tight">{wt.label}</span>
              </TabsTrigger>
            ))}
          </TabsList>

          <div className="mt-6 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">Widget Title</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Enter widget title..."
              />
            </div>

            {/* Chart-specific options */}
            {["bar", "line", "pie", "area", "radar"].includes(selectedType) && (
              <>
                <div className="space-y-2">
                  <Label>Data Source</Label>
                  <Select
                    value={config.groupBy || config.questionId || ""}
                    onValueChange={(value) => {
                      if (value === "location" || value === "date") {
                        setConfig({ ...config, groupBy: value, questionId: undefined });
                      } else {
                        setConfig({ ...config, questionId: value, groupBy: undefined });
                      }
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select data source..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="location">Submissions by Location</SelectItem>
                      <SelectItem value="date">Submissions over Time</SelectItem>
                      {choiceQuestions.length > 0 && (
                        <>
                          {choiceQuestions.map((q) => (
                            <SelectItem key={q.id} value={q.id}>
                              {q.label}
                            </SelectItem>
                          ))}
                        </>
                      )}
                      {numericQuestions.length > 0 && (
                        <>
                          {numericQuestions.map((q) => (
                            <SelectItem key={q.id} value={q.id}>
                              {q.label} (Numeric)
                            </SelectItem>
                          ))}
                        </>
                      )}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}

            {/* KPI-specific options */}
            {selectedType === "kpi" && (
              <>
                <div className="space-y-2">
                  <Label>Metric Type</Label>
                  <Select
                    value={config.kpiValue || "total_submissions"}
                    onValueChange={(value) => setConfig({ ...config, kpiValue: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="total_submissions">Total Submissions</SelectItem>
                      <SelectItem value="unique_locations">Unique Locations</SelectItem>
                      {numericQuestions.map((q) => (
                        <SelectItem key={q.id} value={q.id}>
                          {q.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {config.kpiValue && !["total_submissions", "unique_locations"].includes(config.kpiValue) && (
                  <div className="space-y-2">
                    <Label>Aggregation</Label>
                    <Select
                      value={config.aggregation || "count"}
                      onValueChange={(value) => setConfig({ ...config, aggregation: value as WidgetConfig["aggregation"], questionId: config.kpiValue })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="count">Count</SelectItem>
                        <SelectItem value="sum">Sum</SelectItem>
                        <SelectItem value="avg">Average</SelectItem>
                        <SelectItem value="min">Minimum</SelectItem>
                        <SelectItem value="max">Maximum</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="space-y-2">
                  <Label>Label</Label>
                  <Input
                    value={config.kpiLabel || ""}
                    onChange={(e) => setConfig({ ...config, kpiLabel: e.target.value })}
                    placeholder="e.g., Total Responses"
                  />
                </div>
              </>
            )}

            {/* Text widget options */}
            {selectedType === "text" && (
              <div className="space-y-2">
                <Label>Content</Label>
                <Textarea
                  value={config.textContent || ""}
                  onChange={(e) => setConfig({ ...config, textContent: e.target.value })}
                  placeholder="Enter your text content..."
                  rows={4}
                />
              </div>
            )}
          </div>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!title.trim()}>
            {editingWidget ? "Save Changes" : "Add Widget"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AddWidgetDialog;

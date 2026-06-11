import { useState, useMemo } from "react";
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
  MapPin,
  Navigation,
  AlertCircle,
  CheckCircle2,
  LayoutGrid,
} from "lucide-react";
import type { DashboardWidget, WidgetConfig, FormQuestion } from "@/hooks/useDashboardBuilder";
import { Badge } from "@/components/ui/badge";

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
  { type: "map" as const, label: "Map", icon: MapPin, description: "Geographic visualization" },
  { type: "location_table" as const, label: "Location Table", icon: LayoutGrid, description: "McKinsey-style location breakdown" },
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
  
  // Detect GPS/geopoint questions in the form
  const gpsQuestions = useMemo(() => {
    const gpsTypes = ["geopoint", "gps", "geolocation", "location"];
    const gpsPatterns = ["gps", "geopoint", "latitude", "longitude", "coordinates", "location", "geo"];
    
    return questions.filter((q) => {
      const typeMatch = gpsTypes.includes(q.type?.toLowerCase() || "");
      const labelMatch = gpsPatterns.some(p => q.label?.toLowerCase().includes(p));
      const idMatch = gpsPatterns.some(p => q.id?.toLowerCase().includes(p));
      return typeMatch || labelMatch || idMatch;
    });
  }, [questions]);

  const hasGpsQuestions = gpsQuestions.length > 0;

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

            {/* Map widget options */}
            {selectedType === "map" && (
              <div className="space-y-4">
                {/* GPS Question Detection Status */}
                <div className={`p-4 rounded-lg border ${hasGpsQuestions ? 'bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-800' : 'bg-amber-50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-800'}`}>
                  <div className="flex items-start gap-3">
                    {hasGpsQuestions ? (
                      <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400 mt-0.5" />
                    ) : (
                      <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5" />
                    )}
                    <div className="flex-1">
                      <p className={`text-sm font-medium ${hasGpsQuestions ? 'text-green-800 dark:text-green-200' : 'text-amber-800 dark:text-amber-200'}`}>
                        {hasGpsQuestions 
                          ? `${gpsQuestions.length} GPS question${gpsQuestions.length > 1 ? 's' : ''} detected`
                          : 'No GPS questions found in this form'
                        }
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {hasGpsQuestions 
                          ? 'The map will plot coordinates from GPS responses. If missing, submission metadata location will be used.'
                          : 'The map will use submission metadata (device location at collection time) to plot points.'
                        }
                      </p>
                      {hasGpsQuestions && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {gpsQuestions.map((q) => (
                            <Badge key={q.id} variant="secondary" className="text-xs bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                              <Navigation className="h-3 w-3 mr-1" />
                              {q.label || q.id}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* GPS Question Selection (if multiple) */}
                {gpsQuestions.length > 1 && (
                  <div className="space-y-2">
                    <Label>Primary GPS Question</Label>
                    <Select
                      value={config.questionId || gpsQuestions[0]?.id || ""}
                      onValueChange={(value) => setConfig({ ...config, questionId: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select GPS question..." />
                      </SelectTrigger>
                      <SelectContent>
                        {gpsQuestions.map((q) => (
                          <SelectItem key={q.id} value={q.id}>
                            <div className="flex items-center gap-2">
                              <Navigation className="h-3 w-3" />
                              {q.label || q.id}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Select which GPS question to use for plotting markers
                    </p>
                  </div>
                )}

                <div className="space-y-2">
                  <Label>Default View</Label>
                  <Select
                    value={config.groupBy || "nigeria"}
                    onValueChange={(value) => setConfig({ ...config, groupBy: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="nigeria">Nigeria</SelectItem>
                      <SelectItem value="africa">Africa</SelectItem>
                      <SelectItem value="world">World</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Initial map zoom level when the widget loads
                  </p>
                </div>

                {/* Map Features Description */}
                <div className="grid grid-cols-2 gap-2 pt-2">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <div className="h-2 w-2 rounded-full bg-primary" />
                    Marker clustering
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <div className="h-2 w-2 rounded-full bg-primary" />
                    Heatmap toggle
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <div className="h-2 w-2 rounded-full bg-primary" />
                    Multiple layers
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <div className="h-2 w-2 rounded-full bg-primary" />
                    Interactive popups
                  </div>
                </div>
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

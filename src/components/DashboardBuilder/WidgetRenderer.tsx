import { useMemo } from "react";
import { extractLocationInfo, extractGeoPointFromFormData } from "@/lib/locationUtils";
import { MapVisualization } from "@/components/MapVisualization";
import type { MapMarker, MapViewLevel } from "@/components/MapVisualization/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  Legend,
  AreaChart,
  Area,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
} from "recharts";
import { Trash2, Settings, GripVertical } from "lucide-react";
import type { DashboardWidget, WidgetConfig } from "@/hooks/useDashboardBuilder";
import type { SubmissionRecord } from "@/hooks/useDataAnalytics";

const CHART_COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
  "#10B981",
  "#F59E0B",
  "#EF4444",
  "#8B5CF6",
  "#EC4899",
];

interface WidgetRendererProps {
  widget: DashboardWidget;
  submissions: SubmissionRecord[];
  questions: any[];
  isEditing?: boolean;
  onEdit?: (widget: DashboardWidget) => void;
  onDelete?: (widgetId: string) => void;
}

const WidgetRenderer = ({
  widget,
  submissions,
  questions,
  isEditing = false,
  onEdit,
  onDelete,
}: WidgetRendererProps) => {
  const chartData = useMemo(() => {
    const config = widget.config;
    const syncedSubmissions = submissions.filter((s) => s.status === "sent");

    if (widget.widget_type === "kpi") {
      // Calculate KPI value
      if (config.kpiValue === "total_submissions") {
        return { value: syncedSubmissions.length, label: config.kpiLabel || "Total Submissions" };
      }
      if (config.kpiValue === "unique_locations") {
        const locations = new Set(syncedSubmissions.map((s) => s.state).filter(Boolean));
        return { value: locations.size, label: config.kpiLabel || "Unique Locations" };
      }
      if (config.questionId) {
        const values = syncedSubmissions
          .map((s) => parseFloat(s.data?.[config.questionId!]))
          .filter((v) => !isNaN(v));
        
        if (config.aggregation === "sum") {
          return { value: values.reduce((a, b) => a + b, 0), label: config.kpiLabel || "Sum" };
        }
        if (config.aggregation === "avg") {
          return { 
            value: values.length > 0 ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10 : 0, 
            label: config.kpiLabel || "Average" 
          };
        }
        if (config.aggregation === "min") {
          return { value: values.length > 0 ? Math.min(...values) : 0, label: config.kpiLabel || "Minimum" };
        }
        if (config.aggregation === "max") {
          return { value: values.length > 0 ? Math.max(...values) : 0, label: config.kpiLabel || "Maximum" };
        }
        return { value: values.length, label: config.kpiLabel || "Count" };
      }
      return { value: syncedSubmissions.length, label: config.kpiLabel || "Total" };
    }

    if (widget.widget_type === "text") {
      return { textContent: config.textContent || "Add your text content here" };
    }

    if (widget.widget_type === "map") {
      // Convert submissions to map markers - check form data for geo fields first, then metadata
      const primaryGpsQuestionId = config.questionId;
      
      const markers: MapMarker[] = syncedSubmissions
        .map((s) => {
          // First try to extract from specific GPS question if configured
          let geoFromForm = null;
          
          if (primaryGpsQuestionId && s.data?.[primaryGpsQuestionId]) {
            const gpsValue = s.data[primaryGpsQuestionId];
            // Try to parse the specific GPS question value
            if (typeof gpsValue === 'object' && gpsValue !== null) {
              const lat = parseFloat(gpsValue.lat ?? gpsValue.latitude);
              const lng = parseFloat(gpsValue.lng ?? gpsValue.longitude);
              if (!isNaN(lat) && !isNaN(lng)) {
                geoFromForm = { 
                  lat, 
                  lng, 
                  accuracy: gpsValue.accuracy, 
                  altitude: gpsValue.altitude 
                };
              }
            }
          }
          
          // If no specific question or it didn't have valid data, scan all form data
          if (!geoFromForm) {
            geoFromForm = extractGeoPointFromFormData(s.data || {}, questions);
          }
          
          // Fall back to submission metadata location
          const metadataLoc = s.location as { 
            lat?: number; 
            lng?: number; 
            latitude?: number; 
            longitude?: number;
            accuracy?: number;
            altitude?: number;
          } | null;
          
          // Determine final coordinates - prefer form data over metadata
          const lat = geoFromForm?.lat ?? metadataLoc?.lat ?? metadataLoc?.latitude;
          const lng = geoFromForm?.lng ?? metadataLoc?.lng ?? metadataLoc?.longitude;
          const accuracy = geoFromForm?.accuracy ?? metadataLoc?.accuracy;
          const altitude = geoFromForm?.altitude ?? metadataLoc?.altitude;
          
          if (typeof lat !== 'number' || typeof lng !== 'number' || isNaN(lat) || isNaN(lng)) {
            return null;
          }
          
          const locationInfo = extractLocationInfo(s.data || {}, { lat, lng, accuracy, altitude });
          
          return {
            id: s.id,
            lat,
            lng,
            title: s.submitter_name || "Submission",
            state: locationInfo.state,
            lga: locationInfo.lga,
            ward: locationInfo.ward,
            community: locationInfo.community,
            facility: locationInfo.flhf,
            submittedAt: s.submitted_at,
            submitterName: s.submitter_name,
            data: {
              ...s.data,
              _geoSource: geoFromForm ? 'form_response' : 'metadata',
              _accuracy: accuracy,
              _altitude: altitude,
            },
          };
        })
        .filter(Boolean) as MapMarker[];
      
      return { markers, defaultView: config.groupBy || "nigeria" };
    }

    if (widget.widget_type === "table") {
      // Return recent submissions
      return syncedSubmissions.slice(0, 10).map((s) => ({
        id: s.id,
        submitter: s.submitter_name,
        location: s.location,
        date: new Date(s.submitted_at).toLocaleDateString(),
      }));
    }

    // Chart data based on groupBy or questionId
    if (config.groupBy === "location" || config.groupBy === "state") {
      const locationData: Record<string, number> = {};
      syncedSubmissions.forEach((s) => {
        const key = s.state || s.location || "Unknown";
        locationData[key] = (locationData[key] || 0) + 1;
      });
      return Object.entries(locationData)
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 8);
    }

    if (config.groupBy === "date") {
      const timeData: Record<string, number> = {};
      syncedSubmissions.forEach((s) => {
        const date = new Date(s.submitted_at).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        });
        timeData[date] = (timeData[date] || 0) + 1;
      });
      return Object.entries(timeData).map(([name, value]) => ({ name, value }));
    }

    if (config.questionId) {
      const question = questions.find((q) => q.id === config.questionId);
      if (question?.type === "select_one" || question?.type === "select_multiple") {
        const answerData: Record<string, number> = {};
        syncedSubmissions.forEach((s) => {
          const answer = s.data?.[config.questionId!];
          if (answer) {
            const values = Array.isArray(answer) ? answer : [answer];
            values.forEach((v) => {
              answerData[v] = (answerData[v] || 0) + 1;
            });
          }
        });
        return Object.entries(answerData).map(([name, value]) => ({ name, value }));
      }

      if (question?.type === "number" || question?.type === "range") {
        const values = syncedSubmissions
          .map((s) => parseFloat(s.data?.[config.questionId!]))
          .filter((v) => !isNaN(v));
        
        // Create histogram
        if (values.length > 0) {
          const min = Math.min(...values);
          const max = Math.max(...values);
          const range = max - min || 1;
          const bucketCount = Math.min(8, values.length);
          const bucketSize = range / bucketCount;
          
          const buckets: Record<string, number> = {};
          for (let i = 0; i < bucketCount; i++) {
            const bucketMin = min + i * bucketSize;
            const bucketMax = min + (i + 1) * bucketSize;
            const label = `${Math.round(bucketMin)}-${Math.round(bucketMax)}`;
            buckets[label] = values.filter((v) => v >= bucketMin && v < bucketMax).length;
          }
          return Object.entries(buckets).map(([name, value]) => ({ name, value }));
        }
      }
    }

    return [];
  }, [widget, submissions, questions]);

  const renderChart = () => {
    const data = chartData as { name: string; value: number }[];
    const gid = widget.id.replace(/[^a-zA-Z0-9]/g, "");

    switch (widget.widget_type) {
      case "bar":
        return (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical">
              <defs>
                <linearGradient id={`barGrad-${gid}`} x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.55} />
                  <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={1} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 12 }} />
              <YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 11 }} />
              <Tooltip
                cursor={{ fill: "hsl(var(--primary) / 0.06)" }}
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "10px",
                  boxShadow: "0 8px 24px -8px hsl(var(--primary) / 0.25)",
                }}
              />
              <Bar dataKey="value" fill={`url(#barGrad-${gid})`} radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        );

      case "line":
        return (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "10px",
                  boxShadow: "0 8px 24px -8px hsl(var(--primary) / 0.25)",
                }}
              />
              <Line
                type="monotone"
                dataKey="value"
                stroke="hsl(var(--primary))"
                strokeWidth={2.5}
                dot={{ fill: "hsl(var(--primary))", r: 3 }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        );

      case "area":
        return (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data}>
              <defs>
                <linearGradient id={`areaGrad-${gid}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.45} />
                  <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "10px",
                  boxShadow: "0 8px 24px -8px hsl(var(--primary) / 0.25)",
                }}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke="hsl(var(--primary))"
                strokeWidth={2.5}
                fill={`url(#areaGrad-${gid})`}
              />
            </AreaChart>
          </ResponsiveContainer>
        );

      case "pie":
        return (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={40}
                outerRadius={72}
                paddingAngle={2}
                fill="hsl(var(--primary))"
                dataKey="value"
                label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                labelLine={false}
              >
                {data.map((_, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={CHART_COLORS[index % CHART_COLORS.length]}
                    stroke="hsl(var(--card))"
                    strokeWidth={2}
                  />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "10px",
                }}
              />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        );

      case "radar":
        return (
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={data}>
              <PolarGrid stroke="hsl(var(--border))" />
              <PolarAngleAxis dataKey="name" tick={{ fontSize: 11 }} />
              <PolarRadiusAxis tick={{ fontSize: 10 }} />
              <Radar
                name="Value"
                dataKey="value"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                fill="hsl(var(--primary) / 0.3)"
              />
              <Legend />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "10px",
                }}
              />
            </RadarChart>
          </ResponsiveContainer>
        );

      case "kpi":
        const kpiData = chartData as { value: number; label: string };
        return (
          <div className="flex flex-col items-center justify-center h-full rounded-xl bg-gradient-to-br from-primary/10 via-primary/5 to-transparent">
            <div className="bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-4xl font-extrabold tracking-tight text-transparent">
              {kpiData.value?.toLocaleString()}
            </div>
            <div className="mt-2 text-sm font-medium text-muted-foreground">{kpiData.label}</div>
          </div>
        );

      case "text":
        const textData = chartData as { textContent: string };
        return (
          <div className="prose prose-sm max-w-none dark:prose-invert">
            <p>{textData.textContent}</p>
          </div>
        );

      case "table":
        const tableData = chartData as { id: string; submitter: string; location: string; date: string }[];
        return (
          <div className="overflow-auto h-full rounded-lg border border-border/60">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="bg-gradient-to-r from-primary/10 to-primary/5 text-foreground">
                  <th className="text-left py-2.5 px-3 font-semibold">Submitter</th>
                  <th className="text-left py-2.5 px-3 font-semibold">Location</th>
                  <th className="text-left py-2.5 px-3 font-semibold">Date</th>
                </tr>
              </thead>
              <tbody>
                {tableData.map((row, i) => (
                  <tr
                    key={row.id}
                    className={`border-b border-border/40 transition-colors hover:bg-primary/5 ${
                      i % 2 === 1 ? "bg-muted/30" : ""
                    }`}
                  >
                    <td className="py-2 px-3 truncate font-medium">{row.submitter}</td>
                    <td className="py-2 px-3 truncate text-muted-foreground">{row.location}</td>
                    <td className="py-2 px-3 text-muted-foreground">{row.date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );

      case "map":
        const mapData = chartData as { markers: MapMarker[]; defaultView: string };
        const mapHeight = Math.max(widgetHeight - 60, 200);
        return (
          <div className="h-full w-full rounded-lg overflow-hidden" style={{ minHeight: `${mapHeight}px` }}>
            <MapVisualization
              markers={mapData.markers || []}
              initialView={(mapData.defaultView || "nigeria") as MapViewLevel}
              height={`${mapHeight}px`}
              showControls={false}
              showLegend={false}
            />
          </div>
        );

      default:
        return <div className="text-muted-foreground text-center">Unsupported widget type</div>;
    }
  };


  const widgetHeight = widget.position.h * 60;

  return (
    <Card className="relative h-full overflow-hidden border bg-card/80 shadow-card backdrop-blur-sm transition-all duration-200 hover:shadow-lg hover:border-primary/30 group">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-primary/60 via-primary/20 to-transparent" />
      <CardHeader className="py-3 px-4 flex flex-row items-center justify-between space-y-0">

        <div className="flex items-center gap-2">
          {isEditing && (
            <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab" />
          )}
          <CardTitle className="text-sm font-medium truncate">{widget.title}</CardTitle>
        </div>
        {isEditing && (
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => onEdit?.(widget)}
            >
              <Settings className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-destructive hover:text-destructive"
              onClick={() => onDelete?.(widget.id)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent className="p-4 pt-0" style={{ height: `${widgetHeight - 60}px` }}>
        {renderChart()}
      </CardContent>
    </Card>
  );
};

export default WidgetRenderer;

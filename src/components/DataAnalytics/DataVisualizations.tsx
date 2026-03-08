import { useMemo, useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { MapVisualization } from "@/components/MapVisualization";
import type { MapMarker } from "@/components/MapVisualization/types";
import type { SubmissionRecord, FormAnalytics } from "@/hooks/useDataAnalytics";
import { extractLocationInfo } from "@/lib/locationUtils";
import { supabase } from "@/integrations/supabase/client";
import { normalizeGeofence } from "@/hooks/useGeofenceValidation";

interface DataVisualizationsProps {
  submissions: SubmissionRecord[];
  selectedForm: FormAnalytics | null;
  loading?: boolean;
}

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

const DataVisualizations = ({ submissions, selectedForm, loading }: DataVisualizationsProps) => {
  // Fetch geofence boundaries for all forms with geofences
  const [geofenceBoundaries, setGeofenceBoundaries] = useState<{ name: string; coordinates: [number, number][]; color?: string }[]>([]);

  useEffect(() => {
    const fetchGeofences = async () => {
      const { data: forms } = await supabase
        .from("forms")
        .select("name, geofence")
        .not("geofence", "is", null);

      if (forms) {
        const boundaries = forms
          .map((f) => {
            const normalized = normalizeGeofence(f.geofence);
            if (!normalized || normalized.coordinates.length < 3) return null;
            return {
              name: `${f.name} — ${normalized.name}`,
              coordinates: normalized.coordinates,
              color: "#e11d48",
            };
          })
          .filter(Boolean) as { name: string; coordinates: [number, number][]; color: string }[];
        setGeofenceBoundaries(boundaries);
      }
    };
    fetchGeofences();
  }, []);
  // Analyze question types to determine appropriate visualizations
  const questionAnalysis = useMemo(() => {
    if (!selectedForm || !selectedForm.questions) return { types: [], hasNumeric: false, hasChoice: false, hasDate: false, hasLocation: false };

    const flatQuestions: any[] = [];
    
    // Flatten questions from groups
    const processQuestions = (questions: any[]) => {
      questions.forEach((q) => {
        if (q.questions) {
          // It's a group
          processQuestions(q.questions);
        } else {
          flatQuestions.push(q);
        }
      });
    };
    
    processQuestions(selectedForm.questions);

    return {
      questions: flatQuestions,
      hasNumeric: flatQuestions.some((q) => q.type === "number" || q.type === "range"),
      hasChoice: flatQuestions.some((q) => q.type === "select_one" || q.type === "select_multiple"),
      hasDate: flatQuestions.some((q) => q.type === "date" || q.type === "datetime"),
      hasLocation: flatQuestions.some((q) => q.type === "geopoint"),
      hasText: flatQuestions.some((q) => q.type === "text" || q.type === "note"),
    };
  }, [selectedForm]);

  // Prepare data for charts
  const chartData = useMemo(() => {
    const syncedSubmissions = submissions.filter((s) => s.status === "sent");

    // Submissions over time (for line chart)
    const timeData: Record<string, number> = {};
    syncedSubmissions.forEach((s) => {
      const date = new Date(s.submitted_at).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });
      timeData[date] = (timeData[date] || 0) + 1;
    });
    const timeSeriesData = Object.entries(timeData).map(([date, count]) => ({ date, count }));

    // Submissions by location (for pie chart)
    const locationData: Record<string, number> = {};
    syncedSubmissions.forEach((s) => {
      if (s.state) {
        locationData[s.state] = (locationData[s.state] || 0) + 1;
      }
    });
    const pieData = Object.entries(locationData)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);

    // Choice question analysis (for bar chart)
    const choiceData: Record<string, Record<string, number>> = {};
    const choiceQuestions = questionAnalysis.questions?.filter(
      (q) => q.type === "select_one" || q.type === "select_multiple"
    ) || [];

    choiceQuestions.forEach((question) => {
      choiceData[question.id] = {};
      syncedSubmissions.forEach((s) => {
        const answer = s.data?.[question.id];
        if (answer) {
          const values = Array.isArray(answer) ? answer : [answer];
          values.forEach((v) => {
            choiceData[question.id][v] = (choiceData[question.id][v] || 0) + 1;
          });
        }
      });
    });

    const choiceChartData = Object.entries(choiceData).map(([questionId, answers]) => {
      const question = choiceQuestions.find((q) => q.id === questionId);
      return {
        questionId,
        questionLabel: question?.label || questionId,
        data: Object.entries(answers).map(([name, value]) => ({ name, value })),
      };
    });

    // Numeric data analysis
    const numericQuestions = questionAnalysis.questions?.filter(
      (q) => q.type === "number" || q.type === "range"
    ) || [];

    const numericData = numericQuestions.map((question) => {
      const values = syncedSubmissions
        .map((s) => parseFloat(s.data?.[question.id]))
        .filter((v) => !isNaN(v));
      
      const avg = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
      const min = values.length > 0 ? Math.min(...values) : 0;
      const max = values.length > 0 ? Math.max(...values) : 0;

      return {
        name: question.label || question.id,
        average: Math.round(avg * 10) / 10,
        min,
        max,
      };
    });

    return { timeSeriesData, pieData, choiceChartData, numericData };
  }, [submissions, questionAnalysis]);

  // Prepare map markers from submissions
  const mapMarkers = useMemo((): MapMarker[] => {
    const syncedSubmissions = submissions.filter((s) => s.status === "sent");
    const markers: MapMarker[] = [];

    syncedSubmissions.forEach((submission) => {
      const locationInfo = extractLocationInfo(
        submission.data as Record<string, any>,
        submission.location as any
      );

      // Only add markers if we have GPS coordinates
      if (locationInfo.gpsCoords) {
        markers.push({
          id: submission.id,
          lat: locationInfo.gpsCoords.lat,
          lng: locationInfo.gpsCoords.lng,
          title: locationInfo.displayLocation,
          state: locationInfo.state,
          lga: locationInfo.lga,
          ward: locationInfo.ward,
          community: locationInfo.community,
          facility: locationInfo.flhf,
          submittedAt: submission.submitted_at,
          submitterName: submission.submitter_name,
          formName: selectedForm?.name,
          data: submission.data as Record<string, any>,
        });
      }
    });

    return markers;
  }, [submissions, selectedForm]);

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        {[1, 2].map((i) => (
          <Card key={i} className="border-0 shadow-card">
            <CardHeader>
              <div className="h-6 w-40 bg-muted rounded" />
            </CardHeader>
            <CardContent>
              <div className="h-64 bg-muted rounded" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (submissions.length === 0) {
    return (
      <Card className="border-0 shadow-card">
        <CardContent className="py-12 text-center text-muted-foreground">
          <p>No submission data available for visualization.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="map">Map</TabsTrigger>
          <TabsTrigger value="trends">Trends</TabsTrigger>
          <TabsTrigger value="distribution">Distribution</TabsTrigger>
          <TabsTrigger value="analysis">Analysis</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6 space-y-6">
          {/* Submissions Over Time */}
          <Card className="border-0 shadow-card">
            <CardHeader>
              <CardTitle className="font-display">Submissions Over Time</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData.timeSeriesData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px",
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="count"
                      stroke="hsl(var(--primary))"
                      fill="hsl(var(--primary) / 0.2)"
                      name="Submissions"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Location Distribution Pie */}
          {chartData.pieData.length > 0 && (
            <Card className="border-0 shadow-card">
              <CardHeader>
                <CardTitle className="font-display">Submissions by Location</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={chartData.pieData}
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                        fill="hsl(var(--primary))"
                        dataKey="value"
                        label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                      >
                        {chartData.pieData.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="map" className="mt-6">
          <Card className="border-0 shadow-card">
            <CardHeader>
              <CardTitle className="font-display">Geographic Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              {mapMarkers.length > 0 ? (
                <MapVisualization
                  markers={mapMarkers}
                  height="600px"
                  initialView="nigeria"
                  showControls={true}
                  showLegend={true}
                  geofences={geofenceBoundaries}
                />
              ) : (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
                    <svg className="h-8 w-8 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-medium text-foreground mb-2">No Location Data Available</h3>
                  <p className="text-sm text-muted-foreground max-w-md">
                    Submissions need GPS coordinates to appear on the map. Ensure forms have geopoint questions enabled.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="trends" className="mt-6 space-y-6">
          {/* Line Chart for Trends */}
          <Card className="border-0 shadow-card">
            <CardHeader>
              <CardTitle className="font-display">Submission Trends</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData.timeSeriesData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Line
                      type="monotone"
                      dataKey="count"
                      stroke="hsl(var(--primary))"
                      strokeWidth={2}
                      dot={{ fill: "hsl(var(--primary))" }}
                      name="Submissions"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="distribution" className="mt-6 space-y-6">
          {/* Choice Questions Bar Charts */}
          {chartData.choiceChartData.slice(0, 3).map((chartItem) => (
            <Card key={chartItem.questionId} className="border-0 shadow-card">
              <CardHeader>
                <CardTitle className="font-display text-base truncate">
                  {chartItem.questionLabel}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartItem.data} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis type="number" tick={{ fontSize: 12 }} />
                      <YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Bar dataKey="value" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          ))}

          {chartData.choiceChartData.length === 0 && (
            <Card className="border-0 shadow-card">
              <CardContent className="py-12 text-center text-muted-foreground">
                <p>No choice-based questions found for distribution analysis.</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="analysis" className="mt-6 space-y-6">
          {/* Numeric Data Radar Chart */}
          {chartData.numericData.length > 0 && (
            <Card className="border-0 shadow-card">
              <CardHeader>
                <CardTitle className="font-display">Numeric Data Analysis</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart data={chartData.numericData}>
                      <PolarGrid />
                      <PolarAngleAxis dataKey="name" tick={{ fontSize: 11 }} />
                      <PolarRadiusAxis tick={{ fontSize: 10 }} />
                      <Radar
                        name="Average"
                        dataKey="average"
                        stroke="hsl(var(--primary))"
                        fill="hsl(var(--primary) / 0.3)"
                      />
                      <Legend />
                      <Tooltip />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Summary Statistics */}
          <Card className="border-0 shadow-card">
            <CardHeader>
              <CardTitle className="font-display">Summary Statistics</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {chartData.numericData.map((item) => (
                  <div key={item.name} className="rounded-lg bg-muted/50 p-4">
                    <h4 className="font-medium text-foreground truncate">{item.name}</h4>
                    <div className="mt-2 grid grid-cols-3 gap-2 text-sm">
                      <div>
                        <p className="text-muted-foreground">Min</p>
                        <p className="font-semibold">{item.min}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Avg</p>
                        <p className="font-semibold text-primary">{item.average}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Max</p>
                        <p className="font-semibold">{item.max}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              {chartData.numericData.length === 0 && (
                <p className="text-center py-8 text-muted-foreground">
                  No numeric questions found for statistical analysis.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default DataVisualizations;

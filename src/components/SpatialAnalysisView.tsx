import { useState, useEffect, useMemo, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  MapPin, Loader2, Play, Lightbulb, CheckCircle, AlertTriangle,
  Layers, Target, Thermometer, Globe2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { isAiCreditError, localSpatialAnalysis, AI_CREDIT_TOAST } from "@/lib/aiCreditFallback";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ScatterChart, Scatter, Cell,
  PieChart, Pie,
} from "recharts";

const SPATIAL_ANALYSES = [
  {
    id: "hotspot",
    name: "Hotspot Analysis (Getis-Ord Gi*)",
    description: "Identify statistically significant spatial clusters of high and low values",
    icon: Thermometer,
    insight: "Reveals geographic areas with statistically significant concentrations (hot spots) or deficits (cold spots) of activity or specific outcomes.",
  },
  {
    id: "spatial_autocorrelation",
    name: "Spatial Autocorrelation (Moran's I)",
    description: "Measure the degree to which similar values cluster spatially",
    icon: Target,
    insight: "Tests whether nearby locations have more similar values than expected by chance. Positive = clustering, Negative = dispersion, Zero = random.",
  },
  {
    id: "dbscan_clustering",
    name: "DBSCAN Spatial Clustering",
    description: "Density-based clustering of geographic points without predefined cluster count",
    icon: Layers,
    insight: "Identifies clusters of arbitrary shape based on point density. Automatically determines the number of clusters and identifies noise/outlier points.",
  },
  {
    id: "kernel_density",
    name: "Kernel Density Estimation",
    description: "Create smooth density surfaces from point data",
    icon: Thermometer,
    insight: "Generates a continuous surface showing the intensity of point events. Useful for visualizing submission density, disease prevalence, or activity patterns.",
  },
  {
    id: "buffer_analysis",
    name: "Buffer / Proximity Analysis",
    description: "Analyze features within specified distances of health facilities or communities",
    icon: Target,
    insight: "Measures how many submissions fall within specified distances from key locations (health facilities, schools). Reveals coverage gaps and accessibility.",
  },
  {
    id: "suitability_mapping",
    name: "Multi-Criteria Suitability Mapping",
    description: "Combine multiple spatial criteria to identify optimal locations",
    icon: Globe2,
    insight: "Evaluates locations against multiple weighted criteria (accessibility, population density, disease prevalence) to identify priority intervention areas.",
  },
  {
    id: "interpolation",
    name: "Spatial Interpolation (IDW/Kriging)",
    description: "Predict values at unmeasured locations from surrounding sample points",
    icon: Layers,
    insight: "Estimates unknown values between sample points using distance-weighted averaging. Creates continuous surfaces from point measurements.",
  },
  {
    id: "nearest_neighbor",
    name: "Nearest Neighbor Analysis",
    description: "Determine if point distribution is clustered, random, or dispersed",
    icon: Target,
    insight: "Computes the average distance between each point and its nearest neighbor to determine spatial pattern. R < 1 = clustered, R = 1 = random, R > 1 = dispersed.",
  },
];

const COLORS = [
  "hsl(0, 70%, 50%)", "hsl(30, 80%, 55%)", "hsl(60, 70%, 50%)",
  "hsl(120, 60%, 40%)", "hsl(200, 70%, 50%)", "hsl(270, 60%, 55%)",
  "hsl(330, 70%, 50%)", "hsl(170, 60%, 40%)",
];

const SpatialAnalysisView = () => {
  const [projects, setProjects] = useState<any[]>([]);
  const [forms, setForms] = useState<any[]>([]);
  const [selectedProject, setSelectedProject] = useState("");
  const [selectedForm, setSelectedForm] = useState("");
  const [selectedAnalysis, setSelectedAnalysis] = useState("");
  const [results, setResults] = useState<any>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("projects").select("id, name").order("name");
      setProjects(data || []);
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (!selectedProject) { setForms([]); return; }
    (async () => {
      const { data } = await supabase.from("forms").select("id, name, questions").eq("project_id", selectedProject).order("name");
      setForms(data || []);
    })();
  }, [selectedProject]);

  const currentForm = forms.find((f: any) => f.id === selectedForm);
  const currentAnalysisType = SPATIAL_ANALYSES.find(a => a.id === selectedAnalysis);

  // Detect GPS questions
  const gpsQuestions = useMemo(() => {
    if (!currentForm?.questions) return [];
    const qs = currentForm.questions as any[];
    const flat: any[] = [];
    const flatten = (items: any[]) => {
      for (const q of items) {
        if (q.questions) flatten(q.questions);
        else if (q.type === "gps" || q.type === "geopoint" || (q.name && /gps|geo|location|latitude|coordinate/i.test(q.name))) {
          flat.push(q);
        }
      }
    };
    flatten(qs);
    return flat;
  }, [currentForm]);

  const runAnalysis = useCallback(async () => {
    if (!selectedForm || !selectedAnalysis) {
      toast({ title: "Missing Selection", description: "Select form and analysis type.", variant: "destructive" });
      return;
    }
    setIsAnalyzing(true);
    setResults(null);
    try {
      const { data: submissions, error } = await supabase
        .from("form_submissions")
        .select("id, data, submitted_at, user_id, location")
        .eq("form_id", selectedForm)
        .eq("status", "sent")
        .order("submitted_at", { ascending: false })
        .limit(500);

      if (error) throw error;
      if (!submissions?.length) {
        toast({ title: "No Data", description: "No submissions found." });
        setIsAnalyzing(false);
        return;
      }

      // 1. Run local spatial analysis first (instant, offline, zero-cost)
      const localResult = localSpatialAnalysis(submissions, selectedAnalysis, gpsQuestions);
      setResults(localResult);


      // 2. Optional: If user wants AI insights (and is online), they can trigger it separately.
      // For now, we'll stick to local results for "In-App without API" requirement.
      toast({ 
        title: "Spatial Analysis Complete", 
        description: "Computed instantly using in-app geospatial engine.",
      });

    } finally {
      setIsAnalyzing(false);
    }
  }, [selectedForm, selectedAnalysis, gpsQuestions, currentForm]);

  const renderCharts = () => {
    if (!results?.charts) return null;
    return results.charts.map((chart: any, i: number) => {
      if (chart.type === "bar") {
        return (
          <Card key={i}>
            <CardHeader><CardTitle className="text-base">{chart.title}</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={chart.data}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey={chart.xKey || "name"} tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  {(chart.bars || ["value"]).map((b: string, j: number) => (
                    <Bar key={b} dataKey={b} fill={COLORS[j % COLORS.length]} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        );
      }
      if (chart.type === "scatter") {
        return (
          <Card key={i}>
            <CardHeader><CardTitle className="text-base">{chart.title}</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <ScatterChart>
                  <CartesianGrid />
                  <XAxis dataKey="x" name={chart.xLabel || "Longitude"} tick={{ fontSize: 11 }} />
                  <YAxis dataKey="y" name={chart.yLabel || "Latitude"} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Scatter data={chart.data} fill={COLORS[0]}>
                    {chart.data.map((_: any, idx: number) => (
                      <Cell key={idx} fill={COLORS[(_.cluster ?? 0) % COLORS.length]} />
                    ))}
                  </Scatter>
                </ScatterChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        );
      }
      if (chart.type === "pie") {
        return (
          <Card key={i}>
            <CardHeader><CardTitle className="text-base">{chart.title}</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie data={chart.data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label>
                    {chart.data.map((_: any, j: number) => <Cell key={j} fill={COLORS[j % COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        );
      }
      return null;
    });
  };

  return (
    <div className="space-y-6 p-3 sm:p-4 lg:p-6 max-w-[1200px] mx-auto overflow-x-hidden">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-display text-xl sm:text-2xl font-bold text-foreground lg:text-3xl flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-primary/20 to-accent/20 border border-primary/10 shadow-sm">
              <Globe2 className="h-6 w-6 text-primary" />
            </div>
            Spatial Data Analysis
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground mt-1.5">
            Advanced geospatial analysis — 8 methods including hotspot detection, clustering, and interpolation
          </p>
        </div>
        {results && (
          <Badge variant="outline" className="self-start border-emerald-300 text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/20 gap-1.5 px-3 py-1">
            <CheckCircle className="h-3.5 w-3.5" />
            Results Ready
          </Badge>
        )}
      </div>

      {/* Step 1 */}
      <Card className="border-0 shadow-md">
        <CardHeader className="pb-4">
          <CardTitle className="text-lg flex items-center gap-2">
            <span className="flex items-center justify-center h-7 w-7 rounded-full bg-primary text-primary-foreground text-xs font-bold shadow-sm">1</span>
            Select Data Source
          </CardTitle>
          <CardDescription>Choose the project and form containing geospatial data</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium mb-1.5 block">Project</label>
            <Select value={selectedProject} onValueChange={v => { setSelectedProject(v); setSelectedForm(""); setResults(null); }}>
              <SelectTrigger className="h-11"><SelectValue placeholder="Select project..." /></SelectTrigger>
              <SelectContent>
                {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium mb-1.5 block">Form</label>
            <Select value={selectedForm} onValueChange={v => { setSelectedForm(v); setResults(null); }} disabled={!selectedProject}>
              <SelectTrigger className="h-11"><SelectValue placeholder="Select form..." /></SelectTrigger>
              <SelectContent>
                {forms.map((f: any) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {selectedForm && gpsQuestions.length === 0 && (
        <Alert variant="destructive" className="border-amber-300 bg-amber-50 dark:bg-amber-950/20 text-amber-800 dark:text-amber-200 [&>svg]:text-amber-600">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>No spatial data detected</AlertTitle>
          <AlertDescription>This form does not contain GPS/geopoint questions. Device metadata will be used as fallback if available.</AlertDescription>
        </Alert>
      )}

      {selectedForm && gpsQuestions.length > 0 && (
        <Alert className="border-emerald-200 bg-emerald-50/50 dark:bg-emerald-950/20">
          <MapPin className="h-4 w-4 text-emerald-600" />
          <AlertTitle className="text-emerald-700 dark:text-emerald-400">
            {gpsQuestions.length} GPS question{gpsQuestions.length !== 1 ? "s" : ""} detected
          </AlertTitle>
          <AlertDescription className="text-emerald-600 dark:text-emerald-300">
            Spatial coordinates available for analysis
          </AlertDescription>
        </Alert>
      )}

      {/* Step 2: Analysis Type */}
      {selectedForm && (
        <Card className="border-0 shadow-md">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg flex items-center gap-2">
              <span className="flex items-center justify-center h-7 w-7 rounded-full bg-primary text-primary-foreground text-xs font-bold shadow-sm">2</span>
              Choose Geospatial Analysis
            </CardTitle>
            <CardDescription>Select the spatial method to apply to your location data</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {SPATIAL_ANALYSES.map(a => (
                <button
                  key={a.id}
                  onClick={() => { setSelectedAnalysis(a.id); setResults(null); }}
                  className={`text-left p-3.5 rounded-xl border-2 transition-all group ${
                    selectedAnalysis === a.id
                      ? "border-primary bg-primary/5 ring-2 ring-primary/20 shadow-sm"
                      : "border-border hover:border-primary/40 hover:bg-muted/30 hover:shadow-sm"
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    <div className={`p-1.5 rounded-lg mt-0.5 ${selectedAnalysis === a.id ? "bg-primary/10" : "bg-muted"}`}>
                      <a.icon className={`h-4 w-4 flex-shrink-0 ${selectedAnalysis === a.id ? "text-primary" : "text-muted-foreground group-hover:text-foreground"}`} />
                    </div>
                    <div>
                      <p className="text-sm font-semibold leading-tight">{a.name}</p>
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{a.description}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {currentAnalysisType && (
        <Alert className="border-primary/20 bg-primary/5">
          <Lightbulb className="h-4 w-4 text-primary" />
          <AlertTitle className="text-primary">What this analysis provides</AlertTitle>
          <AlertDescription>{currentAnalysisType.insight}</AlertDescription>
        </Alert>
      )}

      {selectedAnalysis && (
        <Button onClick={runAnalysis} disabled={isAnalyzing} className="gap-2 h-11 px-6" variant="acg" size="lg">
          {isAnalyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          {isAnalyzing ? "Analyzing..." : `Run ${currentAnalysisType?.name || "Analysis"}`}
        </Button>
      )}

      {/* Results */}
      {results && (
        <div className="space-y-6">
          {results.summary && (
            <Card className="border-0 shadow-md border-l-4 border-l-emerald-500">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
                    <CheckCircle className="h-5 w-5 text-emerald-600" />
                  </div>
                  {currentAnalysisType?.name} Results
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground whitespace-pre-line leading-relaxed">{results.summary}</p>
              </CardContent>
            </Card>
          )}

          {results.statistics && results.statistics.length > 0 && (
            <Card className="border-0 shadow-md">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Target className="h-4 w-4 text-primary" />
                  Spatial Statistics
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="w-full">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b-2 border-primary/10">
                        {Object.keys(results.statistics[0]).map(k => (
                          <th key={k} className="text-left p-2.5 font-semibold text-foreground text-xs uppercase tracking-wider">{k}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {results.statistics.map((row: any, i: number) => (
                        <tr key={i} className="border-b border-border/50 hover:bg-muted/40 transition-colors">
                          {Object.values(row).map((v: any, j: number) => (
                            <td key={j} className="p-2.5 font-mono text-xs">{typeof v === "number" ? v.toFixed(4) : String(v ?? "")}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </ScrollArea>
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {renderCharts()}
          </div>

          {results.interpretation && (
            <Card className="border-0 shadow-md bg-gradient-to-br from-primary/5 to-accent/5">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-primary/10">
                    <Lightbulb className="h-4 w-4 text-primary" />
                  </div>
                  Interpretation
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground whitespace-pre-line leading-relaxed">{results.interpretation}</p>
              </CardContent>
            </Card>
          )}

          {results.recommendations?.length > 0 && (
            <Card className="border-0 shadow-md">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-accent" />
                  Recommendations
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2.5">
                  {results.recommendations.map((r: string, i: number) => (
                    <li key={i} className="flex items-start gap-2.5 text-sm p-2.5 rounded-lg bg-muted/30 border border-border/50">
                      <AlertTriangle className="h-4 w-4 text-accent flex-shrink-0 mt-0.5" />
                      <span className="leading-relaxed">{r}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
};

export default SpatialAnalysisView;

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, Shield, MapPin, Activity, Loader2, RefreshCw, CloudRain } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { format, subDays } from "date-fns";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from "recharts";

interface Props {
  projectId: string;
  formId: string;
}

interface WeatherData {
  temp: number;
  humidity: number;
  windSpeed: number;
  description: string;
  riskFactor: number; // 0-100
}

interface LocationRiskScore {
  lat: number;
  lng: number;
  name: string;
  overallRisk: number; // 0-100
  factors: {
    submissionAnomaly: number;
    geofenceViolation: number;
    offHoursActivity: number;
    clusterDensity: number;
    weather: number;
  };
  submissions: number;
  collectors: number;
  lastActivity: string;
  weather?: WeatherData;
}

const RiskScoreView = ({ projectId, formId }: Props) => {
  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);

  const [riskScores, setRiskScores] = useState<LocationRiskScore[]>([]);
  const [prevFactors, setPrevFactors] = useState<Record<string, number> | null>(null);
  const [loading, setLoading] = useState(false);
  const [timeWindow, setTimeWindow] = useState("7d");

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;
    const map = L.map(mapContainerRef.current, {
      center: [9.06, 7.49], zoom: 6, zoomControl: false,
    });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; OpenStreetMap', maxZoom: 19,
    }).addTo(map);
    L.control.zoom({ position: "topright" }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  const [weatherCache, setWeatherCache] = useState<Map<string, WeatherData>>(new Map());

  const fetchWeather = useCallback(async (lat: number, lng: number): Promise<WeatherData | null> => {
    const key = `${lat.toFixed(2)},${lng.toFixed(2)}`;
    if (weatherCache.has(key)) return weatherCache.get(key)!;
    try {
      const res = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code`
      );
      if (!res.ok) return null;
      const data = await res.json();
      const current = data.current;
      if (!current) return null;

      const weatherCode = current.weather_code || 0;
      const windSpeed = current.wind_speed_10m || 0;
      const temp = current.temperature_2m || 25;

      // Weather risk: storms, extreme heat/cold, high winds
      let riskFactor = 0;
      if (weatherCode >= 95) riskFactor += 40; // thunderstorm
      else if (weatherCode >= 61) riskFactor += 25; // rain
      else if (weatherCode >= 51) riskFactor += 10; // drizzle
      if (windSpeed > 40) riskFactor += 30;
      else if (windSpeed > 20) riskFactor += 15;
      if (temp > 40) riskFactor += 20;
      else if (temp < 5) riskFactor += 15;
      riskFactor = Math.min(100, riskFactor);

      const descriptions: Record<number, string> = {
        0: "Clear", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast",
        45: "Foggy", 51: "Light drizzle", 61: "Light rain", 63: "Moderate rain",
        65: "Heavy rain", 80: "Rain showers", 95: "Thunderstorm", 99: "Severe storm",
      };
      const desc = descriptions[weatherCode] || `Code ${weatherCode}`;

      const weather: WeatherData = {
        temp, humidity: current.relative_humidity_2m || 0,
        windSpeed, description: desc, riskFactor,
      };
      setWeatherCache(prev => new Map(prev).set(key, weather));
      return weather;
    } catch {
      return null;
    }
  }, [weatherCache]);

  // Shared helper: compute factor averages from submissions
  const computeFactorsFromSubmissions = useCallback((submissions: any[], formMap: Map<string, string>) => {
    const gridSize = 0.01;
    const cellMap = new Map<string, {
      submissions: any[];
      collectors: Set<string>;
      geofenceViolations: number;
      offHoursCount: number;
    }>();

    submissions.forEach(sub => {
      const loc = sub.location as any;
      if (!loc) return;
      const lat = loc.lat || loc.latitude;
      const lng = loc.lng || loc.longitude;
      if (!lat || !lng) return;
      const cellKey = `${Math.round(lat / gridSize) * gridSize},${Math.round(lng / gridSize) * gridSize}`;
      if (!cellMap.has(cellKey)) {
        cellMap.set(cellKey, { submissions: [], collectors: new Set(), geofenceViolations: 0, offHoursCount: 0 });
      }
      const cell = cellMap.get(cellKey)!;
      cell.submissions.push(sub);
      cell.collectors.add(sub.user_id);
      if (sub.within_geofence === false) cell.geofenceViolations++;
      if (sub.submitted_at) {
        const hour = new Date(sub.submitted_at).getHours();
        if (hour < 6 || hour > 20) cell.offHoursCount++;
      }
    });

    if (cellMap.size === 0) return null;

    const avgSubsPerCell = submissions.length / cellMap.size;
    let totalSA = 0, totalGV = 0, totalOH = 0, totalCD = 0;
    let count = 0;

    cellMap.forEach(cell => {
      const n = cell.submissions.length;
      totalSA += Math.min(100, Math.abs(n - avgSubsPerCell) / Math.max(avgSubsPerCell, 1) * 50);
      totalGV += n > 0 ? (cell.geofenceViolations / n) * 100 : 0;
      totalOH += n > 0 ? (cell.offHoursCount / n) * 100 : 0;
      totalCD += Math.min(100, cell.collectors.size > 3 ? (cell.collectors.size / 10) * 100 : 0);
      count++;
    });

    return {
      submissionAnomaly: Math.round(totalSA / count),
      geofenceViolation: Math.round(totalGV / count),
      offHoursActivity: Math.round(totalOH / count),
      clusterDensity: Math.round(totalCD / count),
      weather: 0,
    };
  }, []);

  const calculateRiskScores = useCallback(async () => {
    setLoading(true);

    try {
      const days = timeWindow === "1d" ? 1 : timeWindow === "7d" ? 7 : 30;
      const since = subDays(new Date(), days).toISOString();
      const prevSince = subDays(new Date(), days * 2).toISOString();

      let userIds: string[];
      if (projectId) {
        const { data: assignments } = await supabase
          .from("user_project_assignments")
          .select("user_id")
          .eq("project_id", projectId);
        if (!assignments?.length) { setLoading(false); return; }
        userIds = assignments.map(a => a.user_id);
      } else {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id")
          .eq("is_active", true)
          .limit(500);
        if (!profiles?.length) { setLoading(false); return; }
        userIds = profiles.map(p => p.user_id);
      }

      // Fetch current + previous period submissions in parallel
      let currentQuery = supabase
        .from("form_submissions")
        .select("user_id, location, submitted_at, within_geofence, form_id")
        .in("user_id", userIds)
        .gte("submitted_at", since)
        .not("location", "is", null)
        .limit(1000);
      if (formId) currentQuery = currentQuery.eq("form_id", formId);

      let prevQuery = supabase
        .from("form_submissions")
        .select("user_id, location, submitted_at, within_geofence, form_id")
        .in("user_id", userIds)
        .gte("submitted_at", prevSince)
        .lt("submitted_at", since)
        .not("location", "is", null)
        .limit(1000);
      if (formId) prevQuery = prevQuery.eq("form_id", formId);

      const [{ data: submissions }, { data: prevSubmissions }] = await Promise.all([currentQuery, prevQuery]);

      if (!submissions?.length) { setLoading(false); setRiskScores([]); setPrevFactors(null); return; }

      const allFormIds = [...new Set([...submissions.map(s => s.form_id), ...(prevSubmissions || []).map(s => s.form_id)])];
      const { data: forms } = await supabase
        .from("forms")
        .select("id, name")
        .in("id", allFormIds.length ? allFormIds : ["__none__"]);
      const formMap = new Map(forms?.map(f => [f.id, f.name]) || []);

      // Compute previous period factors for trend comparison
      const prevFactorsCalc = prevSubmissions?.length ? computeFactorsFromSubmissions(prevSubmissions, formMap) : null;
      setPrevFactors(prevFactorsCalc);

      // Grid clustering for current period
      const gridSize = 0.01;
      const cellMap = new Map<string, {
        lat: number; lng: number;
        submissions: any[];
        collectors: Set<string>;
        formNames: Set<string>;
        geofenceViolations: number;
        offHoursCount: number;
      }>();

      submissions.forEach(sub => {
        const loc = sub.location as any;
        if (!loc) return;
        const lat = loc.lat || loc.latitude;
        const lng = loc.lng || loc.longitude;
        if (!lat || !lng) return;

        const cellKey = `${Math.round(lat / gridSize) * gridSize},${Math.round(lng / gridSize) * gridSize}`;
        if (!cellMap.has(cellKey)) {
          cellMap.set(cellKey, {
            lat: Math.round(lat / gridSize) * gridSize,
            lng: Math.round(lng / gridSize) * gridSize,
            submissions: [],
            collectors: new Set(),
            formNames: new Set(),
            geofenceViolations: 0,
            offHoursCount: 0,
          });
        }
        const cell = cellMap.get(cellKey)!;
        cell.submissions.push(sub);
        cell.collectors.add(sub.user_id);
        const fname = formMap.get(sub.form_id);
        if (fname) cell.formNames.add(fname);
        if (sub.within_geofence === false) cell.geofenceViolations++;
        if (sub.submitted_at) {
          const hour = new Date(sub.submitted_at).getHours();
          if (hour < 6 || hour > 20) cell.offHoursCount++;
        }
      });

      // Calculate risk per cell with weather
      const avgSubsPerCell = submissions.length / Math.max(cellMap.size, 1);
      const scores: LocationRiskScore[] = [];

      // Fetch weather for up to 5 unique grid cells
      const cellEntries = Array.from(cellMap.entries());
      const weatherPromises = cellEntries.slice(0, 5).map(([, cell]) => fetchWeather(cell.lat, cell.lng));
      const weatherResults = await Promise.all(weatherPromises);
      const cellWeatherMap = new Map<string, WeatherData | null>();
      cellEntries.slice(0, 5).forEach(([key], i) => cellWeatherMap.set(key, weatherResults[i]));

      cellMap.forEach((cell, cellKey) => {
        const totalSubs = cell.submissions.length;
        const submissionAnomaly = Math.min(100, Math.abs(totalSubs - avgSubsPerCell) / Math.max(avgSubsPerCell, 1) * 50);
        const geofenceViolation = totalSubs > 0 ? (cell.geofenceViolations / totalSubs) * 100 : 0;
        const offHoursActivity = totalSubs > 0 ? (cell.offHoursCount / totalSubs) * 100 : 0;
        const clusterDensity = Math.min(100, cell.collectors.size > 3 ? (cell.collectors.size / 10) * 100 : 0);
        const weather = cellWeatherMap.get(cellKey) || null;
        const weatherRisk = weather?.riskFactor || 0;

        const overallRisk = Math.round(
          submissionAnomaly * 0.20 +
          geofenceViolation * 0.30 +
          offHoursActivity * 0.20 +
          clusterDensity * 0.15 +
          weatherRisk * 0.15
        );

        const lastSub = cell.submissions.sort((a: any, b: any) =>
          (b.submitted_at || "").localeCompare(a.submitted_at || "")
        )[0];

        scores.push({
          lat: cell.lat,
          lng: cell.lng,
          name: [...cell.formNames][0] || "Unknown Zone",
          overallRisk,
          factors: {
            submissionAnomaly: Math.round(submissionAnomaly),
            geofenceViolation: Math.round(geofenceViolation),
            offHoursActivity: Math.round(offHoursActivity),
            clusterDensity: Math.round(clusterDensity),
            weather: Math.round(weatherRisk),
          },
          submissions: totalSubs,
          collectors: cell.collectors.size,
          lastActivity: lastSub?.submitted_at || "",
          weather: weather || undefined,
        });
      });

      setRiskScores(scores.sort((a, b) => b.overallRisk - a.overallRisk));
    } catch (e) {
      console.error("Risk score error:", e);
      toast({ title: "Error", description: "Failed to calculate risk scores", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [projectId, formId, timeWindow, fetchWeather, computeFactorsFromSubmissions]);

  useEffect(() => { calculateRiskScores(); }, [calculateRiskScores]);

  // Realtime: auto-recalculate when new submissions arrive
  useEffect(() => {
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const debouncedRecalc = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => calculateRiskScores(), 2000);
    };

    const channel = supabase
      .channel("risk-score-realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "form_submissions" }, debouncedRecalc)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "field_activity" }, debouncedRecalc)
      .subscribe();

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      supabase.removeChannel(channel);
    };
  }, [calculateRiskScores]);

  // Render risk zones on map
  useEffect(() => {
    if (!mapRef.current || !layerRef.current) return;
    layerRef.current.clearLayers();

    riskScores.forEach(score => {
      const color = score.overallRisk >= 70 ? "#ef4444"
        : score.overallRisk >= 40 ? "#f59e0b"
        : "#22c55e";

      // Risk zone circle
      L.circle([score.lat, score.lng], {
        radius: 500 + score.submissions * 20,
        fillColor: color,
        fillOpacity: 0.2,
        color,
        weight: 2,
      }).addTo(layerRef.current!);

      // Center marker with risk score
      const icon = L.divIcon({
        className: "risk-score-marker",
        html: `<div style="background:${color};color:white;width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:bold;font-size:12px;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3);">${score.overallRisk}</div>`,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      });

      L.marker([score.lat, score.lng], { icon }).addTo(layerRef.current!)
        .bindPopup(`
          <div style="min-width:220px">
            <strong>${score.overallRisk >= 70 ? "🔴" : score.overallRisk >= 40 ? "🟡" : "🟢"} ${score.name}</strong><br/>
            <strong>Risk Score: ${score.overallRisk}/100</strong><br/>
            <hr style="margin:4px 0"/>
            📊 Submission Anomaly: ${score.factors.submissionAnomaly}%<br/>
            🚫 Geofence Violations: ${score.factors.geofenceViolation}%<br/>
            🌙 Off-Hours Activity: ${score.factors.offHoursActivity}%<br/>
            👥 Cluster Density: ${score.factors.clusterDensity}%<br/>
            🌦️ Weather Risk: ${score.factors.weather}%${score.weather ? ` (${score.weather.description}, ${score.weather.temp}°C, ${score.weather.windSpeed}km/h)` : ""}<br/>
            <hr style="margin:4px 0"/>
            📋 ${score.submissions} submissions • ${score.collectors} collectors<br/>
            ${score.lastActivity ? `🕐 Last: ${format(new Date(score.lastActivity), "MMM d, h:mm a")}` : ""}
          </div>
        `);
    });

    if (riskScores.length > 0 && mapRef.current) {
      const bounds = L.latLngBounds(riskScores.map(s => [s.lat, s.lng]));
      if (bounds.isValid()) mapRef.current.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [riskScores]);

  const riskChartData = riskScores.slice(0, 10).map(s => ({
    name: s.name.slice(0, 15),
    risk: s.overallRisk,
    submissions: s.submissions,
  }));

  const highRiskCount = riskScores.filter(s => s.overallRisk >= 70).length;
  const medRiskCount = riskScores.filter(s => s.overallRisk >= 40 && s.overallRisk < 70).length;
  const lowRiskCount = riskScores.filter(s => s.overallRisk < 40).length;

  // Compute actual average factor values from live data
  const avgFactors = useMemo(() => {
    if (riskScores.length === 0) return { submissionAnomaly: 0, geofenceViolation: 0, offHoursActivity: 0, clusterDensity: 0, weather: 0 };
    const totals = riskScores.reduce(
      (acc, s) => ({
        submissionAnomaly: acc.submissionAnomaly + s.factors.submissionAnomaly,
        geofenceViolation: acc.geofenceViolation + s.factors.geofenceViolation,
        offHoursActivity: acc.offHoursActivity + s.factors.offHoursActivity,
        clusterDensity: acc.clusterDensity + s.factors.clusterDensity,
        weather: acc.weather + s.factors.weather,
      }),
      { submissionAnomaly: 0, geofenceViolation: 0, offHoursActivity: 0, clusterDensity: 0, weather: 0 }
    );
    const n = riskScores.length;
    return {
      submissionAnomaly: Math.round(totals.submissionAnomaly / n),
      geofenceViolation: Math.round(totals.geofenceViolation / n),
      offHoursActivity: Math.round(totals.offHoursActivity / n),
      clusterDensity: Math.round(totals.clusterDensity / n),
      weather: Math.round(totals.weather / n),
    };
  }, [riskScores]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="p-3">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-red-500/10"><AlertTriangle className="h-4 w-4 text-red-500" /></div>
            <div>
              <p className="text-xs text-muted-foreground">High Risk</p>
              <p className="text-xl font-bold text-red-500">{highRiskCount}</p>
            </div>
          </div>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-amber-500/10"><Activity className="h-4 w-4 text-amber-500" /></div>
            <div>
              <p className="text-xs text-muted-foreground">Medium Risk</p>
              <p className="text-xl font-bold text-amber-500">{medRiskCount}</p>
            </div>
          </div>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-green-500/10"><Shield className="h-4 w-4 text-green-500" /></div>
            <div>
              <p className="text-xs text-muted-foreground">Low Risk</p>
              <p className="text-xl font-bold text-green-500">{lowRiskCount}</p>
            </div>
          </div>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-primary/10"><MapPin className="h-4 w-4 text-primary" /></div>
            <div>
              <p className="text-xs text-muted-foreground">Total Zones</p>
              <p className="text-xl font-bold">{riskScores.length}</p>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="lg:col-span-3">
          <Card className="border-0 shadow-card overflow-hidden">
            <div ref={mapContainerRef} style={{ height: "500px", width: "100%" }} className="rounded-lg" />
          </Card>
        </div>
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Shield className="h-4 w-4 text-primary" />Risk Controls
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Time Window</p>
                <Select value={timeWindow} onValueChange={setTimeWindow}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1d">Today</SelectItem>
                    <SelectItem value="7d">7 Days</SelectItem>
                    <SelectItem value="30d">30 Days</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={calculateRiskScores} disabled={loading} className="w-full gap-2" size="sm">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Recalculate
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Risk Factors</CardTitle>
              <CardDescription className="text-xs">Weighted scoring model</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-xs">
              {[
                { emoji: "🚫", label: "Geofence Violations", weight: "30%", value: avgFactors.geofenceViolation, prevKey: "geofenceViolation" },
                { emoji: "🌙", label: "Off-Hours Activity", weight: "20%", value: avgFactors.offHoursActivity, prevKey: "offHoursActivity" },
                { emoji: "📊", label: "Submission Anomaly", weight: "20%", value: avgFactors.submissionAnomaly, prevKey: "submissionAnomaly" },
                { emoji: "👥", label: "Cluster Density", weight: "15%", value: avgFactors.clusterDensity, prevKey: "clusterDensity" },
                { emoji: "🌦️", label: "Weather Conditions", weight: "15%", value: avgFactors.weather, prevKey: "weather" },
              ].map((f) => {
                const prev = prevFactors?.[f.prevKey];
                const diff = prev != null && riskScores.length > 0 ? f.value - prev : null;
                const trendUp = diff !== null && diff > 2;
                const trendDown = diff !== null && diff < -2;
                return (
                  <div key={f.label} className="space-y-1">
                    <div className="flex justify-between items-center">
                      <span>{f.emoji} {f.label}</span>
                      <div className="flex items-center gap-1.5">
                        {riskScores.length > 0 && diff !== null && (
                          <span className={`text-[10px] font-bold ${trendUp ? "text-destructive" : trendDown ? "text-green-600" : "text-muted-foreground"}`}>
                            {trendUp ? `↑+${diff}` : trendDown ? `↓${diff}` : "→"}
                          </span>
                        )}
                        <span className="font-semibold">{riskScores.length > 0 ? `${f.value}%` : "—"}</span>
                        <Badge variant="outline" className="text-[10px]">w: {f.weight}</Badge>
                      </div>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${f.value}%`,
                          backgroundColor: f.value >= 60 ? "hsl(0, 70%, 55%)" : f.value >= 30 ? "hsl(43, 80%, 50%)" : "hsl(140, 65%, 40%)",
                        }}
                      />
                  </div>
                </div>
              ))}
              {riskScores.length === 0 && (
                <p className="text-muted-foreground text-center py-2">No data for selected filters</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">High-Risk Zones</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="max-h-[200px] overflow-y-auto">
                {riskScores.filter(s => s.overallRisk >= 40).slice(0, 6).map((s, i) => (
                  <button
                    key={i}
                    onClick={() => mapRef.current?.setView([s.lat, s.lng], 14, { animate: true })}
                    className="w-full text-left px-4 py-2 border-b border-border hover:bg-muted/50"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium truncate">{s.name}</span>
                      <Badge variant={s.overallRisk >= 70 ? "destructive" : "secondary"} className="text-[10px]">
                        {s.overallRisk}
                      </Badge>
                    </div>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {riskChartData.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Risk Score Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={riskChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} domain={[0, 100]} />
                <Tooltip />
                <Bar dataKey="risk" name="Risk Score" radius={[4, 4, 0, 0]}>
                  {riskChartData.map((entry, idx) => (
                    <Cell key={idx} fill={entry.risk >= 70 ? "#ef4444" : entry.risk >= 40 ? "#f59e0b" : "#22c55e"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default RiskScoreView;

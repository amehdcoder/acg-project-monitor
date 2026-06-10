import { useMemo } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
  Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  BarChart3,
  Users,
  MapPin,
  CalendarDays,
  TrendingUp,
  Activity,
  Sparkles,
  FileText,
} from "lucide-react";
import { computeInsights, TABLEAU_PALETTE } from "@/lib/autoInsights";
import type { SubmissionRecord } from "@/hooks/useDataAnalytics";
import type { FormQuestion } from "@/hooks/useDashboardBuilder";
import MapVisualization from "@/components/MapVisualization/MapVisualization";
import handsEmblem from "@/assets/hands-emblem.png";
import amehniticon from "@/assets/amehnities-icon.png.asset.json";
import coatOfArms from "@/assets/nigeria-coat-of-arms.png";

interface AutoInsightsDashboardProps {
  formName: string;
  submissions: SubmissionRecord[];
  questions: FormQuestion[];
}

const chartTooltipStyle = {
  contentStyle: {
    background: "hsl(var(--popover))",
    border: "1px solid hsl(var(--border))",
    borderRadius: "10px",
    boxShadow: "0 8px 24px -8px rgba(0,0,0,0.25)",
    fontSize: "12px",
  },
  labelStyle: { color: "hsl(var(--foreground))", fontWeight: 600 },
};

const KpiCard = ({
  icon: Icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: any;
  label: string;
  value: string | number;
  sub?: string;
  accent: string;
}) => (
  <Card className="relative overflow-hidden border-0 shadow-card">
    <div className="absolute inset-x-0 top-0 h-1" style={{ background: accent }} />
    <CardContent className="p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <div
          className="p-1.5 rounded-lg"
          style={{ background: `${accent}22`, color: accent }}
        >
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <div className="text-3xl font-extrabold tabular-nums">{value}</div>
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
    </CardContent>
  </Card>
);

const SectionTitle = ({ icon: Icon, children }: { icon: any; children: React.ReactNode }) => (
  <div className="flex items-center gap-2 mb-3 mt-2">
    <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
      <Icon className="h-4 w-4" />
    </div>
    <h3 className="font-display text-base font-semibold">{children}</h3>
  </div>
);

const AutoInsightsDashboard = ({ formName, submissions, questions }: AutoInsightsDashboardProps) => {
  const insights = useMemo(() => computeInsights(submissions, questions), [submissions, questions]);

  if (insights.totalSubmissions === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-12 text-center">
          <Sparkles className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-medium mb-2">No data to analyze yet</h3>
          <p className="text-muted-foreground">
            Auto-insights will appear here automatically as submissions come in.
          </p>
        </CardContent>
      </Card>
    );
  }

  const accents = TABLEAU_PALETTE;

  return (
    <div className="space-y-6">
      {/* Branded header */}
      <Card className="border-0 shadow-card overflow-hidden">
        <div className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent px-5 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <img src={coatOfArms} alt="Nigerian Coat of Arms" width={48} height={48} loading="lazy" className="h-11 w-11 object-contain" />
            <div>
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <h2 className="font-display text-lg font-bold">Auto-Generated Insights</h2>
                <Badge variant="secondary" className="text-[10px]">Live</Badge>
              </div>
              <p className="text-sm text-muted-foreground">{formName}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <img src={amehniticon.url} alt="Amehnities" width={40} height={40} loading="lazy" className="h-9 w-9 object-contain" />
            <img src={handsEmblem} alt="HANDS" width={40} height={40} loading="lazy" className="h-9 w-9 object-contain" />
          </div>
        </div>
      </Card>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard icon={FileText} label="Submissions" value={insights.totalSubmissions} accent={accents[0]} />
        <KpiCard icon={Users} label="Collectors" value={insights.uniqueCollectors} accent={accents[2]} />
        <KpiCard icon={MapPin} label="Locations" value={insights.uniqueLocations} accent={accents[1]} />
        <KpiCard icon={CalendarDays} label="Active Days" value={insights.activeDays} accent={accents[5]} />
        <KpiCard icon={Activity} label="Avg / Collector" value={insights.avgPerCollector} accent={accents[6]} />
        <KpiCard
          icon={TrendingUp}
          label="Last Entry"
          value={insights.lastSubmissionAt ? new Date(insights.lastSubmissionAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) : "—"}
          accent={accents[3]}
        />
      </div>

      {/* Submissions over time */}
      {insights.timeSeries.length > 1 && (
        <Card className="border-0 shadow-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" /> Submissions Over Time
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={insights.timeSeries}>
                <defs>
                  <linearGradient id="aiArea" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={accents[0]} stopOpacity={0.5} />
                    <stop offset="100%" stopColor={accents[0]} stopOpacity={0.03} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="label" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis allowDecimals={false} fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip {...chartTooltipStyle} />
                <Area type="monotone" dataKey="value" name="Submissions" stroke={accents[0]} strokeWidth={2} fill="url(#aiArea)" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Map */}
      {insights.hasGeo && (
        <Card className="border-0 shadow-card overflow-hidden">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <MapPin className="h-4 w-4 text-primary" /> Geographic Distribution
              <Badge variant="secondary" className="text-[10px]">{insights.geoPoints.length} points</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <MapVisualization
              height="420px"
              markers={insights.geoPoints.map((g) => ({
                id: g.id,
                lat: g.lat,
                lng: g.lng,
                title: g.title,
                state: g.state,
                lga: g.lga,
                submitterName: g.submitterName,
                submittedAt: g.submittedAt,
                formName,
                data: g.data,
              }))}
            />
          </CardContent>
        </Card>
      )}

      {/* By state */}
      {insights.byState.length > 1 && (
        <Card className="border-0 shadow-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" /> Submissions by Location
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={Math.max(220, insights.byState.length * 30)}>
              <BarChart data={insights.byState} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                <XAxis type="number" allowDecimals={false} fontSize={11} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="name" width={110} fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip {...chartTooltipStyle} cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }} />
                <Bar dataKey="value" name="Submissions" radius={[0, 6, 6, 0]}>
                  {insights.byState.map((_, i) => (
                    <Cell key={i} fill={accents[i % accents.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Categorical questions */}
      {insights.categorical.length > 0 && (
        <div>
          <SectionTitle icon={BarChart3}>Question Breakdowns</SectionTitle>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {insights.categorical.map((c, idx) => (
              <Card key={c.questionId} className="border-0 shadow-card">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold truncate" title={c.label}>{c.label}</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Top: <span className="font-medium text-foreground">{c.topCategory}</span> · {c.uniqueValues} categories
                  </p>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={220}>
                    {c.data.length <= 5 ? (
                      <PieChart>
                        <Pie
                          data={c.data}
                          dataKey="value"
                          nameKey="name"
                          innerRadius={45}
                          outerRadius={80}
                          paddingAngle={2}
                        >
                          {c.data.map((_, i) => (
                            <Cell key={i} fill={accents[i % accents.length]} />
                          ))}
                        </Pie>
                        <Tooltip {...chartTooltipStyle} formatter={(v: any, n: any) => [`${v}`, n]} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                      </PieChart>
                    ) : (
                      <BarChart data={c.data}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                        <XAxis dataKey="name" fontSize={10} tickLine={false} axisLine={false} interval={0} angle={-25} textAnchor="end" height={60} />
                        <YAxis allowDecimals={false} fontSize={11} tickLine={false} axisLine={false} />
                        <Tooltip {...chartTooltipStyle} cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }} />
                        <Bar dataKey="value" name="Responses" radius={[6, 6, 0, 0]} fill={accents[(idx + 1) % accents.length]} />
                      </BarChart>
                    )}
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Numeric questions */}
      {insights.numeric.length > 0 && (
        <div>
          <SectionTitle icon={Activity}>Numeric Analysis</SectionTitle>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {insights.numeric.map((n, idx) => (
              <Card key={n.questionId} className="border-0 shadow-card">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold truncate" title={n.label}>{n.label}</CardTitle>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground mt-1">
                    <span>Mean <b className="text-foreground">{n.mean}</b></span>
                    <span>Median <b className="text-foreground">{n.median}</b></span>
                    <span>Min <b className="text-foreground">{n.min}</b></span>
                    <span>Max <b className="text-foreground">{n.max}</b></span>
                    <span>Sum <b className="text-foreground">{n.sum}</b></span>
                  </div>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={n.histogram}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                      <XAxis dataKey="name" fontSize={10} tickLine={false} axisLine={false} />
                      <YAxis allowDecimals={false} fontSize={11} tickLine={false} axisLine={false} />
                      <Tooltip {...chartTooltipStyle} cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }} />
                      <Bar dataKey="value" name="Count" radius={[6, 6, 0, 0]} fill={accents[(idx + 4) % accents.length]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Collector performance */}
      <div>
        <SectionTitle icon={Users}>Data Collector Activity</SectionTitle>
        <Card className="border-0 shadow-card overflow-hidden">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gradient-to-r from-primary/10 to-transparent">
                    <TableHead className="font-semibold">Collector</TableHead>
                    <TableHead className="text-right font-semibold">Submissions</TableHead>
                    <TableHead className="text-right font-semibold">Days Worked</TableHead>
                    <TableHead className="text-right font-semibold">Avg / Day</TableHead>
                    <TableHead className="font-semibold">First</TableHead>
                    <TableHead className="font-semibold">Last</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {insights.collectors.map((c, i) => {
                    const max = insights.collectors[0]?.submissions || 1;
                    return (
                      <TableRow key={c.name} className={i % 2 ? "bg-muted/30" : ""}>
                        <TableCell className="font-medium">{c.name}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <div className="h-1.5 rounded-full" style={{ width: `${Math.max(12, (c.submissions / max) * 80)}px`, background: accents[i % accents.length] }} />
                            <span className="tabular-nums font-semibold">{c.submissions}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          <Badge variant="secondary" className="tabular-nums">{c.daysWorked}</Badge>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{c.avgPerDay}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{c.firstDay || "—"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{c.lastDay || "—"}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AutoInsightsDashboard;

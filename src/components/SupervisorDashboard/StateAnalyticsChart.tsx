import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  LabelList,
} from "recharts";
import { Users, ShieldCheck, ChevronUp, MapPin } from "lucide-react";
import { UserStatus } from "@/hooks/useSupervisorDashboard";

// Stable color palette for LGA segments inside the stacked bar
const LGA_COLORS = [
  "hsl(var(--primary))",
  "hsl(210, 70%, 55%)",
  "hsl(160, 55%, 45%)",
  "hsl(45, 80%, 50%)",
  "hsl(280, 50%, 55%)",
  "hsl(20, 70%, 50%)",
  "hsl(340, 65%, 50%)",
  "hsl(190, 65%, 45%)",
  "hsl(120, 45%, 45%)",
  "hsl(260, 60%, 60%)",
];

interface Props {
  users: UserStatus[];
}

interface LgaData {
  lga: string;
  users: number;
  reporting: number;
  reportingRate: number;
}

interface StateData {
  state: string;
  totalUsers: number;
  activeUsers: number;
  reportingRate: number;
  notReportingRate: number;
  complianceRate: number;
  nonComplianceRate: number;
  hasGeofenceData: boolean;
  submissionsToday: number;
  lgas: LgaData[];
}

const StateAnalyticsChart = ({ users }: Props) => {
  const [expandedState, setExpandedState] = useState<string | null>(null);

  const stateData = useMemo(() => {
    const map = new Map<string, UserStatus[]>();
    users.forEach((u) => {
      const state = u.state || "Unassigned";
      if (!map.has(state)) map.set(state, []);
      map.get(state)!.push(u);
    });

    const data: StateData[] = Array.from(map.entries())
      .map(([state, members]) => {
        const fieldWorkers = members.filter(
          (m) => m.assigned_forms.length > 0 && m.is_active
        );
        const reporting = fieldWorkers.filter(
          (m) => m.submissions_today > 0
        ).length;
        const total = fieldWorkers.length || 1;
        const reportingRate = Math.round((reporting / total) * 100);

        const withGeofence = members.filter((m) => m.geofence_compliance !== null);
        const hasGeofenceData = withGeofence.length > 0;
        const avgCompliance =
          hasGeofenceData
            ? Math.round(
                withGeofence.reduce((s, m) => s + (m.geofence_compliance ?? 0), 0) /
                  withGeofence.length
              )
            : null;

        // Build LGA breakdown from submission-derived locations
        const lgaMap = new Map<string, { users: Set<string>; reporting: Set<string> }>();
        members.forEach((m) => {
          const lga = m.lga || "Unknown";
          if (!lgaMap.has(lga)) lgaMap.set(lga, { users: new Set(), reporting: new Set() });
          lgaMap.get(lga)!.users.add(m.user_id);
          if (m.submissions_today > 0) lgaMap.get(lga)!.reporting.add(m.user_id);
        });
        const lgas: LgaData[] = Array.from(lgaMap.entries())
          .map(([lga, data]) => ({
            lga,
            users: data.users.size,
            reporting: data.reporting.size,
            reportingRate: data.users.size > 0 ? Math.round((data.reporting.size / data.users.size) * 100) : 0,
          }))
          .sort((a, b) => b.users - a.users);

        return {
          state: state.length > 12 ? state.substring(0, 11) + "…" : state,
          fullState: state,
          totalUsers: members.length,
          activeUsers: members.filter((m) => m.status !== "offline").length,
          reportingRate,
          notReportingRate: 100 - reportingRate,
          complianceRate: avgCompliance ?? 0,
          nonComplianceRate: avgCompliance !== null ? 100 - avgCompliance : 0,
          hasGeofenceData,
          submissionsToday: members.reduce(
            (s, m) => s + m.submissions_today,
            0
          ),
          lgas,
        };
      })
      .filter((d) => d.state !== "Unassigned")
      .sort((a, b) => b.totalUsers - a.totalUsers)
      .slice(0, 12);

    return data;
  }, [users]);

  // Geofence chart data: only include states that actually have geofence data
  const geofenceStateData = useMemo(() => {
    return stateData.filter((d) => d.hasGeofenceData);
  }, [stateData]);

  const totals = useMemo(() => {
    const fieldWorkers = users.filter(
      (u) => u.assigned_forms.length > 0 && u.is_active
    );
    const reporting = fieldWorkers.filter(
      (u) => u.submissions_today > 0
    ).length;
    const totalWorkers = fieldWorkers.length || 1;
    const totalSubs = users.reduce((s, u) => s + u.submissions_today, 0);
    const withGeofence = users.filter((u) => u.geofence_compliance !== null);
    const avgCompliance =
      withGeofence.length > 0
        ? Math.round(
            withGeofence.reduce((s, u) => s + (u.geofence_compliance ?? 0), 0) /
              withGeofence.length
          )
        : null;

    return {
      totalFieldWorkers: fieldWorkers.length,
      reporting,
      reportingRate: Math.round((reporting / totalWorkers) * 100),
      totalSubs,
      avgCompliance,
      statesCovered: stateData.filter((s) => s.state !== "Unassigned").length,
    };
  }, [users, stateData]);

  if (stateData.length === 0) return null;

  const renderPercentLabel = (props: any) => {
    const { x, y, width, value } = props;
    if (!value || value < 8) return null;
    return (
      <text
        x={x + width / 2}
        y={y + 14}
        fill="white"
        textAnchor="middle"
        fontSize={10}
        fontWeight={600}
      >
        {value}%
      </text>
    );
  };

  const CustomReportingTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const entry = stateData.find(d => d.state === label);
    if (!entry) return null;
    return (
      <div className="bg-card border border-border rounded-lg p-3 shadow-lg text-xs space-y-2 min-w-[180px]">
        <p className="font-semibold text-sm">{entry.state}</p>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Reporting</span>
          <span className="font-medium text-green-600">{entry.reportingRate}%</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Not Reporting</span>
          <span className="font-medium text-destructive">{entry.notReportingRate}%</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Total Users</span>
          <span className="font-medium">{entry.totalUsers}</span>
        </div>
        {entry.lgas.length > 0 && (
          <div className="border-t border-border pt-1.5 mt-1.5">
            <p className="font-semibold text-[10px] text-muted-foreground uppercase tracking-wider mb-1">LGAs ({entry.lgas.length})</p>
            {entry.lgas.slice(0, 5).map(lga => (
              <div key={lga.lga} className="flex justify-between py-0.5">
                <span className="truncate mr-2">{lga.lga}</span>
                <span className="font-medium">{lga.reporting}/{lga.users}</span>
              </div>
            ))}
            {entry.lgas.length > 5 && (
              <p className="text-[10px] text-muted-foreground">+{entry.lgas.length - 5} more</p>
            )}
          </div>
        )}
      </div>
    );
  };

  const selectedStateData = expandedState ? stateData.find(d => d.state === expandedState) : null;

  return (
    <div className="space-y-4">
      {/* FIONET-style Reporting Analysis */}
      <Card className="border-0 shadow-card">
        <CardHeader className="pb-2">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div className="rounded-lg bg-primary/10 p-2">
                <Users className="h-4 w-4 text-primary" />
              </div>
              <div>
                <CardTitle className="font-display text-base">
                  Team Reporting by State
                </CardTitle>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Click a state bar to see LGA breakdown
                </p>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            {/* FIONET KPI Strip */}
            <div className="hidden sm:flex flex-col gap-2 w-28 shrink-0">
              <div className="rounded-lg bg-primary/10 border border-primary/20 p-2.5 text-center">
                <p className="text-[9px] font-semibold uppercase tracking-wider text-primary">
                  Field Workers
                </p>
                <p className="font-display text-xl font-bold text-foreground mt-0.5">
                  {totals.totalFieldWorkers}
                </p>
              </div>
              <div className="rounded-lg bg-green-500/10 border border-green-500/20 p-2.5 text-center">
                <p className="text-[9px] font-semibold uppercase tracking-wider text-green-700">
                  Reporting
                </p>
                <p className="font-display text-xl font-bold text-foreground mt-0.5">
                  {totals.reporting}
                </p>
              </div>
              <div className="rounded-lg bg-primary/10 border border-primary/20 p-2.5 text-center">
                <p className="text-[9px] font-semibold uppercase tracking-wider text-primary">
                  % Reporting
                </p>
                <p className="font-display text-xl font-bold text-foreground mt-0.5">
                  {totals.reportingRate}%
                </p>
              </div>
              <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-2.5 text-center">
                <p className="text-[9px] font-semibold uppercase tracking-wider text-destructive">
                  States
                </p>
                <p className="font-display text-xl font-bold text-foreground mt-0.5">
                  {totals.statesCovered}
                </p>
              </div>
            </div>

            {/* Stacked bar chart */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-4 mb-2 text-[10px] text-muted-foreground">
                <span className="flex items-center gap-1">
                  <span className="h-2.5 w-2.5 rounded-sm bg-[hsl(var(--primary))]" />
                  Reporting
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2.5 w-2.5 rounded-sm bg-[hsl(var(--primary)/0.2)]" />
                  Not Reporting
                </span>
              </div>
              <div className="h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={stateData}
                    margin={{ top: 5, right: 5, left: 0, bottom: 5 }}
                    onClick={(data) => {
                      if (data?.activeLabel) {
                        setExpandedState(prev => prev === data.activeLabel ? null : data.activeLabel!);
                      }
                    }}
                  >
                    <XAxis
                      dataKey="state"
                      tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                      interval={0}
                      angle={-30}
                      textAnchor="end"
                      height={50}
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                      domain={[0, 100]}
                      hide
                    />
                    <Tooltip content={<CustomReportingTooltip />} />
                    <Bar
                      dataKey="reportingRate"
                      stackId="a"
                      fill="hsl(var(--primary))"
                      radius={[0, 0, 0, 0]}
                      cursor="pointer"
                    >
                      <LabelList
                        dataKey="reportingRate"
                        content={renderPercentLabel}
                      />
                    </Bar>
                    <Bar
                      dataKey="notReportingRate"
                      stackId="a"
                      fill="hsl(var(--primary) / 0.15)"
                      radius={[4, 4, 0, 0]}
                      cursor="pointer"
                    >
                      <LabelList
                        dataKey="notReportingRate"
                        content={renderPercentLabel}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* LGA Breakdown Panel */}
          {selectedStateData && selectedStateData.lgas.length > 0 && (
            <div className="mt-4 rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-2 animate-in slide-in-from-top-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-primary" />
                  <span className="text-sm font-semibold">{expandedState} — LGA Breakdown</span>
                  <Badge variant="outline" className="text-[10px]">{selectedStateData.lgas.length} LGAs</Badge>
                </div>
                <button
                  onClick={() => setExpandedState(null)}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  <ChevronUp className="h-4 w-4" />
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[200px] overflow-y-auto">
                {selectedStateData.lgas.map((lga) => (
                  <div key={lga.lga} className="flex items-center justify-between rounded-md bg-background p-2 border border-border">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{lga.lga}</p>
                      <p className="text-[10px] text-muted-foreground">{lga.users} user{lga.users !== 1 ? "s" : ""}</p>
                    </div>
                    <div className="flex items-center gap-2 ml-2">
                      <div className="w-16 h-2 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${lga.reportingRate}%`,
                            backgroundColor: lga.reportingRate >= 80 ? "hsl(142 71% 35%)" : lga.reportingRate >= 50 ? "hsl(38 92% 50%)" : "hsl(0 84% 60%)",
                          }}
                        />
                      </div>
                      <span className={`text-[10px] font-semibold min-w-[32px] text-right ${
                        lga.reportingRate >= 80 ? "text-green-600" : lga.reportingRate >= 50 ? "text-amber-600" : "text-destructive"
                      }`}>
                        {lga.reportingRate}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Geofence Compliance by State — only show if any state has geofence data */}
      <Card className="border-0 shadow-card">
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-green-500/10 p-2">
              <ShieldCheck className="h-4 w-4 text-green-600" />
            </div>
            <div>
              <CardTitle className="font-display text-base">
                Geofence Compliance by State
              </CardTitle>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Average compliance rate per state (from submission location data)
              </p>
            </div>
            <Badge
              variant="outline"
              className={`ml-auto text-xs ${
                totals.avgCompliance === null
                  ? "bg-muted text-muted-foreground border-border"
                  : totals.avgCompliance >= 90
                  ? "bg-green-500/10 text-green-700 border-green-500/30"
                  : totals.avgCompliance >= 70
                  ? "bg-amber-500/10 text-amber-700 border-amber-500/30"
                  : "bg-destructive/10 text-destructive border-destructive/30"
              }`}
            >
              {totals.avgCompliance !== null ? `Avg: ${totals.avgCompliance}%` : "N/A"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {geofenceStateData.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <ShieldCheck className="h-10 w-10 text-muted-foreground/30 mb-2" />
              <p className="text-sm text-muted-foreground font-medium">No geofence data available</p>
              <p className="text-[10px] text-muted-foreground mt-1">
                Geofence compliance will appear here when forms with geofencing are used
              </p>
            </div>
          ) : (
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={geofenceStateData}
                  margin={{ top: 5, right: 5, left: 0, bottom: 5 }}
                >
                  <XAxis
                    dataKey="state"
                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                    interval={0}
                    angle={-30}
                    textAnchor="end"
                    height={50}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                    domain={[0, 100]}
                    hide
                  />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                      fontSize: "11px",
                    }}
                    formatter={(value: number, name: string) => [
                      `${value}%`,
                      name === "complianceRate" ? "Compliant" : "Non-Compliant",
                    ]}
                  />
                  <Bar
                    dataKey="complianceRate"
                    stackId="b"
                    fill="hsl(var(--primary))"
                    radius={[0, 0, 0, 0]}
                  >
                    <LabelList
                      dataKey="complianceRate"
                      content={renderPercentLabel}
                    />
                    {geofenceStateData.map((entry, index) => (
                      <Cell
                        key={index}
                        fill={
                          entry.complianceRate >= 90
                            ? "hsl(142 71% 35%)"
                            : entry.complianceRate >= 70
                            ? "hsl(38 92% 50%)"
                            : "hsl(0 84% 60%)"
                        }
                      />
                    ))}
                  </Bar>
                  <Bar
                    dataKey="nonComplianceRate"
                    stackId="b"
                    fill="hsl(0 84% 60% / 0.2)"
                    radius={[4, 4, 0, 0]}
                  >
                    <LabelList
                      dataKey="nonComplianceRate"
                      content={(props: any) => {
                        const { x, y, width, value } = props;
                        if (!value || value < 10) return null;
                        return (
                          <text
                            x={x + width / 2}
                            y={y + 14}
                            fill="hsl(0 84% 60%)"
                            textAnchor="middle"
                            fontSize={10}
                            fontWeight={600}
                          >
                            {value}%
                          </text>
                        );
                      }}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default StateAnalyticsChart;

import { useMemo } from "react";
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
import { Users, ShieldCheck } from "lucide-react";
import { UserStatus } from "@/hooks/useSupervisorDashboard";

interface Props {
  users: UserStatus[];
}

interface StateData {
  state: string;
  totalUsers: number;
  activeUsers: number;
  reportingRate: number;
  notReportingRate: number;
  complianceRate: number;
  nonComplianceRate: number;
  submissionsToday: number;
}

const StateAnalyticsChart = ({ users }: Props) => {
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
        const avgCompliance =
          withGeofence.length > 0
            ? Math.round(
                withGeofence.reduce((s, m) => s + (m.geofence_compliance ?? 0), 0) /
                  withGeofence.length
              )
            : null;

        return {
          state: state.length > 10 ? state.substring(0, 9) + "…" : state,
          totalUsers: members.length,
          activeUsers: members.filter((m) => m.status !== "offline").length,
          reportingRate,
          notReportingRate: 100 - reportingRate,
          complianceRate: avgCompliance ?? 0,
          nonComplianceRate: avgCompliance !== null ? 100 - avgCompliance : 0,
          submissionsToday: members.reduce(
            (s, m) => s + m.submissions_today,
            0
          ),
        };
      })
      .filter((d) => d.state !== "Unassigned" || users.length < 5)
      .sort((a, b) => b.totalUsers - a.totalUsers)
      .slice(0, 12);

    return data;
  }, [users]);

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
                  Field workers reporting vs not reporting today
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
                        name === "reportingRate" ? "Reporting" : "Not Reporting",
                      ]}
                    />
                    <Bar
                      dataKey="reportingRate"
                      stackId="a"
                      fill="hsl(var(--primary))"
                      radius={[0, 0, 0, 0]}
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
        </CardContent>
      </Card>

      {/* Geofence Compliance by State */}
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
                Average compliance rate per state
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
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={stateData}
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
                  {stateData.map((entry, index) => (
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
        </CardContent>
      </Card>
    </div>
  );
};

export default StateAnalyticsChart;

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapPin, Users, Layers } from "lucide-react";
import { UserStatus } from "@/hooks/useSupervisorDashboard";

interface Props {
  users: UserStatus[];
}

interface TerritoryGroup {
  state: string;
  lga: string | null;
  users: UserStatus[];
  activeCount: number;
  totalSubmissions: number;
  avgCompliance: number | null;
}

const STATUS_DOT: Record<string, string> = {
  active: "bg-green-500",
  idle: "bg-amber-500",
  offline: "bg-muted-foreground/40",
};

const TerritoryMap = ({ users }: Props) => {
  const [expandedTerritory, setExpandedTerritory] = useState<string | null>(null);

  const territories = useMemo(() => {
    const map = new Map<string, UserStatus[]>();
    users.forEach(u => {
      const key = u.state || "Unassigned";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(u);
    });

    const groups: TerritoryGroup[] = Array.from(map.entries()).map(([state, members]) => {
      const active = members.filter(m => m.status !== "offline").length;
      const totalSubs = members.reduce((s, m) => s + m.submissions_today, 0);
      const withGeo = members.filter(m => m.geofence_compliance !== null);
      const avgComp = withGeo.length > 0
        ? Math.round(withGeo.reduce((s, m) => s + (m.geofence_compliance ?? 0), 0) / withGeo.length)
        : null;
      // Group LGAs
      const lgaSet = new Set(members.map(m => m.lga).filter(Boolean));

      return {
        state,
        lga: lgaSet.size > 0 ? `${lgaSet.size} LGA(s)` : null,
        users: members,
        activeCount: active,
        totalSubmissions: totalSubs,
        avgCompliance: avgComp,
      };
    }).sort((a, b) => b.users.length - a.users.length);

    return groups;
  }, [users]);

  const usersWithLocation = useMemo(
    () => users.filter(u => u.last_location),
    [users]
  );

  return (
    <Card className="border-0 shadow-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-primary/10 p-2">
              <Layers className="h-4 w-4 text-primary" />
            </div>
            <div>
              <CardTitle className="font-display text-lg">Territory Overview</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                {territories.length} territories · {usersWithLocation.length} with GPS
              </p>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
          {territories.map((territory) => {
            const isExpanded = expandedTerritory === territory.state;
            return (
              <div key={territory.state}>
                <button
                  onClick={() => setExpandedTerritory(isExpanded ? null : territory.state)}
                  className="w-full flex items-center gap-3 rounded-lg border border-border/50 p-3 hover:bg-muted/30 transition-colors text-left"
                >
                  <div className="rounded-lg bg-primary/10 p-2 shrink-0">
                    <MapPin className="h-4 w-4 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">{territory.state}</p>
                      {territory.lga && (
                        <span className="text-[10px] text-muted-foreground">{territory.lga}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-[11px] text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        {territory.users.length} users
                      </span>
                      <span>{territory.activeCount} active</span>
                      <span>{territory.totalSubmissions} subs today</span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    {territory.avgCompliance !== null ? (
                      <>
                        <span className={`text-xs font-mono font-semibold ${
                          territory.avgCompliance >= 90 ? "text-green-600" :
                          territory.avgCompliance >= 70 ? "text-amber-600" : "text-destructive"
                        }`}>
                          {territory.avgCompliance}%
                        </span>
                        <p className="text-[10px] text-muted-foreground">compliance</p>
                      </>
                    ) : (
                      <span className="text-xs text-muted-foreground">No geofence</span>
                    )}
                  </div>
                </button>

                {/* Expanded user list */}
                {isExpanded && (
                  <div className="ml-6 mt-1 mb-2 space-y-1 border-l-2 border-border/50 pl-3">
                    {territory.users.map(u => (
                      <div key={u.user_id} className="flex items-center gap-2 py-1.5 text-xs">
                        <span className={`h-2 w-2 rounded-full shrink-0 ${STATUS_DOT[u.status]}`} />
                        <span className="font-medium truncate flex-1">
                          {u.first_name} {u.last_name}
                        </span>
                        <span className="text-muted-foreground">{u.lga || "—"}</span>
                        <Badge variant="outline" className="text-[9px] px-1 py-0 h-4">
                          {u.submissions_today} today
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {territories.length === 0 && (
            <div className="text-center py-8 text-muted-foreground text-sm">
              No territory data available
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default TerritoryMap;

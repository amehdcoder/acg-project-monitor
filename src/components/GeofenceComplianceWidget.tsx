import { useState, useEffect } from "react";
import { ShieldCheck, ShieldAlert, ShieldOff, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";

interface FormGeofenceStats {
  formName: string;
  inside: number;
  outside: number;
  noData: number;
  total: number;
}

const GeofenceComplianceWidget = () => {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<FormGeofenceStats[]>([]);
  const [totals, setTotals] = useState({ inside: 0, outside: 0, noData: 0, total: 0 });

  useEffect(() => {
    const fetchStats = async () => {
      setLoading(true);
      try {
        // Get forms with geofences
        const { data: forms } = await supabase
          .from("forms")
          .select("id, name, geofence")
          .not("geofence", "is", null);

        if (!forms || forms.length === 0) {
          setLoading(false);
          return;
        }

        const formIds = forms.map((f) => f.id);
        const { data: submissions } = await supabase
          .from("form_submissions")
          .select("form_id, within_geofence")
          .in("form_id", formIds);

        // Aggregate per form
        const formMap = new Map<string, FormGeofenceStats>();
        forms.forEach((f) => {
          formMap.set(f.id, { formName: f.name, inside: 0, outside: 0, noData: 0, total: 0 });
        });

        (submissions || []).forEach((s) => {
          const entry = formMap.get(s.form_id);
          if (!entry) return;
          entry.total++;
          if (s.within_geofence === true) entry.inside++;
          else if (s.within_geofence === false) entry.outside++;
          else entry.noData++;
        });

        const allStats = Array.from(formMap.values()).filter((s) => s.total > 0);
        const t = allStats.reduce(
          (acc, s) => ({
            inside: acc.inside + s.inside,
            outside: acc.outside + s.outside,
            noData: acc.noData + s.noData,
            total: acc.total + s.total,
          }),
          { inside: 0, outside: 0, noData: 0, total: 0 }
        );

        setStats(allStats);
        setTotals(t);
      } catch (err) {
        console.error("Error fetching geofence stats:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, []);

  const complianceRate = totals.total > 0
    ? Math.round((totals.inside / Math.max(totals.inside + totals.outside, 1)) * 100)
    : 0;

  if (loading) {
    return (
      <Card className="border-0 shadow-card">
        <CardHeader className="pb-2">
          <CardTitle className="font-display text-base flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Geofence Compliance
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (stats.length === 0) {
    return (
      <Card className="border-0 shadow-card">
        <CardHeader className="pb-2">
          <CardTitle className="font-display text-base flex items-center gap-2">
            <ShieldOff className="h-5 w-5 text-muted-foreground" />
            Geofence Compliance
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground py-4">
            No geofence-enabled forms have submissions yet.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-0 shadow-card">
      <CardHeader className="pb-2">
        <CardTitle className="font-display text-base flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" />
          Geofence Compliance
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Overall compliance */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-foreground">Overall Compliance</span>
            <span className="text-2xl font-bold text-foreground">{complianceRate}%</span>
          </div>
          <Progress value={complianceRate} className="h-2.5" />
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-green-500 inline-block" />
                Inside: {totals.inside}
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-destructive inline-block" />
                Outside: {totals.outside}
              </span>
              {totals.noData > 0 && (
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-muted-foreground inline-block" />
                  No data: {totals.noData}
                </span>
              )}
            </div>
            <span>{totals.total} total</span>
          </div>
        </div>

        {/* Per-form breakdown */}
        <div className="space-y-3 pt-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Per Form</p>
          {stats.map((s) => {
            const checked = s.inside + s.outside;
            const rate = checked > 0 ? Math.round((s.inside / checked) * 100) : 0;
            return (
              <div key={s.formName} className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-foreground truncate max-w-[60%]">{s.formName}</span>
                  <div className="flex items-center gap-2">
                    {rate >= 80 ? (
                      <Badge variant="secondary" className="bg-green-100 text-green-700 text-[10px]">
                        {rate}%
                      </Badge>
                    ) : rate >= 50 ? (
                      <Badge variant="secondary" className="bg-yellow-100 text-yellow-700 text-[10px]">
                        {rate}%
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="bg-red-100 text-red-700 text-[10px]">
                        {rate}%
                      </Badge>
                    )}
                    <span className="text-xs text-muted-foreground">{s.total} subs</span>
                  </div>
                </div>
                <div className="flex h-1.5 rounded-full overflow-hidden bg-muted">
                  {s.inside > 0 && (
                    <div
                      className="bg-green-500 transition-all"
                      style={{ width: `${(s.inside / s.total) * 100}%` }}
                    />
                  )}
                  {s.outside > 0 && (
                    <div
                      className="bg-destructive transition-all"
                      style={{ width: `${(s.outside / s.total) * 100}%` }}
                    />
                  )}
                  {s.noData > 0 && (
                    <div
                      className="bg-muted-foreground/30 transition-all"
                      style={{ width: `${(s.noData / s.total) * 100}%` }}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};

export default GeofenceComplianceWidget;

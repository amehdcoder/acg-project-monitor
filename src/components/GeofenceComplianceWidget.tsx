import { useState, useEffect, useCallback } from "react";
import { ShieldCheck, ShieldAlert, ShieldOff, Loader2, Bell, Settings2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface FormGeofenceStats {
  formName: string;
  inside: number;
  outside: number;
  noData: number;
  total: number;
}

const THRESHOLD_KEY = "geofence_alert_threshold";

const GeofenceComplianceWidget = () => {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<FormGeofenceStats[]>([]);
  const [totals, setTotals] = useState({ inside: 0, outside: 0, noData: 0, total: 0 });
  const [threshold, setThreshold] = useState(() => {
    const saved = localStorage.getItem(THRESHOLD_KEY);
    return saved ? Number(saved) : 20;
  });
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    const fetchStats = async () => {
      setLoading(true);
      try {
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

  const handleThresholdChange = useCallback((value: number[]) => {
    const v = value[0];
    setThreshold(v);
    localStorage.setItem(THRESHOLD_KEY, String(v));
  }, []);

  const triggerComplianceCheck = useCallback(async () => {
    setChecking(true);
    try {
      const { data, error } = await supabase.functions.invoke("check-geofence-compliance", {
        body: { threshold },
      });
      if (error) throw error;
      if (data?.alerts_sent > 0) {
        toast.warning(`${data.alerts_sent} geofence alert(s) sent to supervisors`);
      } else {
        toast.success("All forms within compliance threshold");
      }
    } catch (err: any) {
      toast.error("Failed to run compliance check: " + (err.message || "Unknown error"));
    } finally {
      setChecking(false);
    }
  }, [threshold]);

  const complianceRate = totals.total > 0
    ? Math.round((totals.inside / Math.max(totals.inside + totals.outside, 1)) * 100)
    : 0;

  const outsideRate = totals.total > 0
    ? Math.round((totals.outside / Math.max(totals.inside + totals.outside, 1)) * 100)
    : 0;

  const isAboveThreshold = outsideRate > threshold;

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
        <div className="flex items-center justify-between">
          <CardTitle className="font-display text-base flex items-center gap-2">
            {isAboveThreshold ? (
              <ShieldAlert className="h-5 w-5 text-destructive" />
            ) : (
              <ShieldCheck className="h-5 w-5 text-primary" />
            )}
            Geofence Compliance
          </CardTitle>
          <div className="flex items-center gap-1">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7">
                  <Settings2 className="h-3.5 w-3.5" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64" align="end">
                <div className="space-y-3">
                  <p className="text-sm font-medium">Alert Threshold</p>
                  <p className="text-xs text-muted-foreground">
                    Notify supervisors when outside-geofence rate exceeds this percentage.
                  </p>
                  <div className="flex items-center gap-3">
                    <Slider
                      value={[threshold]}
                      onValueChange={handleThresholdChange}
                      max={100}
                      min={0}
                      step={5}
                      className="flex-1"
                    />
                    <span className="text-sm font-mono font-medium w-10 text-right">
                      {threshold}%
                    </span>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full"
                    onClick={triggerComplianceCheck}
                    disabled={checking}
                  >
                    {checking ? (
                      <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
                    ) : (
                      <Bell className="h-3.5 w-3.5 mr-2" />
                    )}
                    Run Compliance Check
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Alert Banner */}
        {isAboveThreshold && (
          <div className="flex items-center gap-2 rounded-lg bg-destructive/10 border border-destructive/20 p-3">
            <ShieldAlert className="h-4 w-4 text-destructive shrink-0" />
            <p className="text-xs text-destructive font-medium">
              Outside-geofence rate ({outsideRate}%) exceeds threshold ({threshold}%)
            </p>
          </div>
        )}

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
            const formOutsideRate = checked > 0 ? Math.round((s.outside / checked) * 100) : 0;
            const formExceedsThreshold = formOutsideRate > threshold;
            return (
              <div key={s.formName} className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-foreground truncate max-w-[55%]">
                    {formExceedsThreshold && (
                      <ShieldAlert className="h-3 w-3 text-destructive inline mr-1" />
                    )}
                    {s.formName}
                  </span>
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

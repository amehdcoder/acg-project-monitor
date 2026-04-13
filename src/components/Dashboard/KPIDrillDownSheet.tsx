import { X, Send, CheckCircle, Users, FolderOpen, MapPin, Activity, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";

export interface DrillDownItem {
  label: string;
  value: number;
  extra?: string;
  pct?: number;
  color?: string;
}

export interface KPIDrillDownData {
  kpiKey: string;
  title: string;
  total: string;
  subtitle: string;
  items: DrillDownItem[];
}

interface Props {
  data: KPIDrillDownData | null;
  onClose: () => void;
}

const ICON_MAP: Record<string, React.ElementType> = {
  totalSubmissions: Send,
  syncRate: CheckCircle,
  dataCollectors: Users,
  activeProjects: FolderOpen,
  coverage: MapPin,
  geofenceCompliance: Activity,
};

const COLOR_MAP: Record<string, string> = {
  totalSubmissions: "from-[hsl(var(--kpi-submissions))] to-[hsl(var(--status-success-light))]",
  syncRate: "from-[hsl(var(--status-success))] to-[hsl(var(--status-success-light))]",
  dataCollectors: "from-[hsl(var(--kpi-collectors))] to-[hsl(var(--status-info-light))]",
  activeProjects: "from-[hsl(var(--kpi-projects))] to-[hsl(var(--chart-accent)/0.7)]",
  coverage: "from-[hsl(var(--kpi-coverage))] to-[hsl(var(--kpi-coverage)/0.7)]",
  geofenceCompliance: "from-[hsl(var(--kpi-geofence))] to-[hsl(var(--kpi-geofence)/0.7)]",
};

const TIER_COLORS = [
  "bg-[hsl(142,60%,40%)]",
  "bg-[hsl(200,70%,50%)]",
  "bg-[hsl(262,60%,55%)]",
  "bg-[hsl(30,85%,52%)]",
  "bg-[hsl(340,65%,50%)]",
  "bg-[hsl(180,50%,45%)]",
];

const KPIDrillDownSheet = ({ data, onClose }: Props) => {
  if (!data) return null;

  const Icon = ICON_MAP[data.kpiKey] || Send;
  const gradient = COLOR_MAP[data.kpiKey] || COLOR_MAP.totalSubmissions;
  const maxValue = Math.max(...data.items.map(i => i.value), 1);

  return (
    <Sheet open={!!data} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full sm:max-w-md p-0 border-l">
        {/* Header with gradient */}
        <div className={`bg-gradient-to-br ${gradient} px-5 py-5`}>
          <SheetHeader className="space-y-1">
            <div className="flex items-center gap-2.5">
              <div className="rounded-lg bg-white/20 p-2">
                <Icon className="h-5 w-5 text-white" />
              </div>
              <div>
                <SheetTitle className="text-white font-display text-lg">{data.title}</SheetTitle>
                <p className="text-white/70 text-xs">{data.subtitle}</p>
              </div>
            </div>
            <p className="text-3xl font-bold text-white font-display pt-2">{data.total}</p>
          </SheetHeader>
        </div>

        {/* Items list */}
        <ScrollArea className="h-[calc(100vh-180px)]">
          <div className="p-4 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              Breakdown ({data.items.length} items)
            </p>
            {data.items.length === 0 && (
              <p className="text-sm text-muted-foreground py-8 text-center">No data available</p>
            )}
            {data.items.map((item, idx) => {
              const barPct = (item.value / maxValue) * 100;
              const tierColor = item.color || TIER_COLORS[idx % TIER_COLORS.length];

              return (
                <div
                  key={`${item.label}-${idx}`}
                  className="rounded-lg border border-border bg-card p-3 hover:shadow-sm transition-shadow"
                >
                  <div className="flex items-start justify-between mb-1.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${tierColor}`} />
                      <span className="text-sm font-medium text-foreground truncate">{item.label}</span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-sm font-bold text-foreground">{item.value.toLocaleString()}</span>
                      {item.pct !== undefined && (
                        <Badge
                          variant="secondary"
                          className={`text-[9px] px-1.5 py-0 ${
                            item.pct >= 0
                              ? "bg-emerald-500/15 text-emerald-600"
                              : "bg-red-500/15 text-red-600"
                          }`}
                        >
                          {item.pct >= 0 ? <ArrowUpRight className="h-2.5 w-2.5 mr-0.5" /> : <ArrowDownRight className="h-2.5 w-2.5 mr-0.5" />}
                          {Math.abs(item.pct)}%
                        </Badge>
                      )}
                    </div>
                  </div>
                  {item.extra && (
                    <p className="text-[10px] text-muted-foreground mb-1.5 ml-4.5">{item.extra}</p>
                  )}
                  <div className="ml-4.5">
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full rounded-full ${tierColor} transition-all duration-500`}
                        style={{ width: `${barPct}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
};

export default KPIDrillDownSheet;

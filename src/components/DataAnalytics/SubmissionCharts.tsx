import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { FormAnalytics, LocationAnalytics } from "@/hooks/useDataAnalytics";
import { useIsMobile } from "@/hooks/use-mobile";

interface SubmissionChartsProps {
  formAnalytics: FormAnalytics[];
  locationAnalytics: LocationAnalytics[];
  loading?: boolean;
}

/** Horizontal bar item used for both desktop and mobile */
const HorizontalBarItem = ({
  label,
  total,
  currentCycle,
  maxValue,
  barColor,
  barBgColor,
}: {
  label: string;
  total: number;
  currentCycle: number;
  maxValue: number;
  barColor: string;
  barBgColor: string;
}) => {
  const totalPercent = (total / maxValue) * 100;
  const cyclePercent = total > 0 ? (currentCycle / total) * 100 : 0;

  return (
    <div className="space-y-1.5 min-w-0">
      <div className="flex justify-between text-sm gap-2">
        <span className="text-foreground truncate max-w-[180px] sm:max-w-[200px] text-xs sm:text-sm" title={label}>
          {label}
        </span>
        <span className="text-muted-foreground flex items-center gap-1.5 shrink-0 text-xs sm:text-sm">
          {total.toLocaleString()}
          {currentCycle > 0 && (
            <span className="text-green-600 text-[10px] sm:text-xs">(+{currentCycle})</span>
          )}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full ${barBgColor} relative`}
          style={{ width: `${totalPercent}%` }}
        >
          <div
            className={`absolute top-0 left-0 h-full rounded-full ${barColor} transition-all duration-500`}
            style={{ width: `${cyclePercent}%` }}
          />
        </div>
      </div>
    </div>
  );
};

/** Mobile layout: vertical bars in a horizontally scrollable container */
const MobileVerticalBars = ({
  items,
  maxValue,
  barColor,
}: {
  items: { label: string; total: number; currentCycle: number }[];
  maxValue: number;
  barColor: string;
}) => {
  if (items.length === 0) return null;

  return (
    <div className="overflow-x-auto -mx-2 px-2 pb-2" style={{ WebkitOverflowScrolling: "touch" }}>
      <div className="flex gap-3 items-end" style={{ minWidth: Math.max(items.length * 72, 280), height: 160 }}>
        {items.map((item, i) => {
          const heightPercent = maxValue > 0 ? (item.total / maxValue) * 100 : 0;
          const cyclePercent = item.total > 0 ? (item.currentCycle / item.total) * 100 : 0;

          return (
            <div key={i} className="flex flex-col items-center gap-1 flex-1 min-w-[56px]">
              <span className="text-[10px] text-muted-foreground font-medium">{item.total}</span>
              <div className="w-full relative rounded-t-md bg-muted overflow-hidden" style={{ height: `${Math.max(heightPercent, 4)}%` }}>
                <div className={`absolute bottom-0 left-0 w-full ${barColor} rounded-t-md transition-all duration-500`} style={{ height: `${cyclePercent}%` }} />
                <div className={`absolute bottom-0 left-0 w-full ${barColor} opacity-30 rounded-t-md`} style={{ height: "100%" }} />
              </div>
              <span className="text-[9px] text-muted-foreground text-center leading-tight line-clamp-2 w-full">
                {item.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const SubmissionCharts = ({ formAnalytics, locationAnalytics, loading }: SubmissionChartsProps) => {
  const isMobile = useIsMobile();
  const maxFormSubmissions = Math.max(...formAnalytics.map((f) => f.total_submissions), 1);
  const maxLocationSubmissions = Math.max(...locationAnalytics.map((l) => l.total_submissions), 1);

  if (loading) {
    return (
      <div className="grid gap-6 lg:grid-cols-2">
        {[1, 2].map((i) => (
          <Card key={i} className="border-0 shadow-card animate-pulse">
            <CardHeader>
              <div className="h-6 w-40 bg-muted rounded" />
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {[1, 2, 3, 4, 5].map((j) => (
                  <div key={j} className="space-y-2">
                    <div className="h-4 w-32 bg-muted rounded" />
                    <div className="h-2 bg-muted rounded-full" />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const formItems = formAnalytics.slice(0, 8).map((form) => ({
    label: form.name,
    total: form.total_submissions,
    currentCycle: form.current_cycle_submissions,
  }));

  const locationItems = locationAnalytics.slice(0, 8).map((loc) => ({
    label: `${loc.state} State`,
    total: loc.total_submissions,
    currentCycle: loc.current_cycle_submissions,
  }));

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Submissions by Form */}
      <Card className="border-0 shadow-card">
        <CardHeader>
          <CardTitle className="font-display text-base sm:text-lg">Submissions by Form</CardTitle>
        </CardHeader>
        <CardContent>
          {formAnalytics.length === 0 ? (
            <p className="text-center py-4 text-muted-foreground text-sm">No form data available</p>
          ) : isMobile ? (
            <MobileVerticalBars items={formItems} maxValue={maxFormSubmissions} barColor="bg-primary" />
          ) : (
            <div className="space-y-4">
              {formAnalytics.slice(0, 5).map((form) => (
                <HorizontalBarItem
                  key={form.id}
                  label={form.name}
                  total={form.total_submissions}
                  currentCycle={form.current_cycle_submissions}
                  maxValue={maxFormSubmissions}
                  barColor="bg-primary"
                  barBgColor="bg-primary/30"
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Submissions by Location */}
      <Card className="border-0 shadow-card">
        <CardHeader>
          <CardTitle className="font-display text-base sm:text-lg">Submissions by Location</CardTitle>
        </CardHeader>
        <CardContent>
          {locationAnalytics.length === 0 ? (
            <p className="text-center py-4 text-muted-foreground text-sm">No location data available</p>
          ) : isMobile ? (
            <MobileVerticalBars items={locationItems} maxValue={maxLocationSubmissions} barColor="bg-acg-gold" />
          ) : (
            <div className="space-y-4">
              {locationAnalytics.slice(0, 5).map((location) => (
                <HorizontalBarItem
                  key={location.state}
                  label={`${location.state} State`}
                  total={location.total_submissions}
                  currentCycle={location.current_cycle_submissions}
                  maxValue={maxLocationSubmissions}
                  barColor="bg-acg-gold"
                  barBgColor="bg-acg-gold/30"
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default SubmissionCharts;

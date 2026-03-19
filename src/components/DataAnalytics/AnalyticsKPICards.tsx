import { ClipboardCheck, CalendarDays, MapPin, TrendingUp } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { KPIData } from "@/hooks/useDataAnalytics";

interface AnalyticsKPICardsProps {
  kpis: KPIData;
  loading?: boolean;
}

const AnalyticsKPICards = ({ kpis, loading }: AnalyticsKPICardsProps) => {
  const cards = [
    {
      label: "Total Submissions",
      value: kpis.totalSubmissions.toLocaleString(),
      change: kpis.totalSubmissionsChange !== 0 ? `${kpis.totalSubmissionsChange > 0 ? "+" : ""}${kpis.totalSubmissionsChange}%` : null,
      changePositive: kpis.totalSubmissionsChange > 0,
      subtext: "Synced (sent)",
      icon: ClipboardCheck,
      color: "text-primary",
      bgColor: "bg-primary/10",
    },
    {
      label: "This Week",
      value: kpis.thisWeek.toLocaleString(),
      change: kpis.thisWeekChange !== 0 ? `${kpis.thisWeekChange > 0 ? "+" : ""}${kpis.thisWeekChange} vs last wk` : null,
      changePositive: kpis.thisWeekChange > 0,
      subtext: "Since Monday",
      icon: CalendarDays,
      color: "text-blue-600",
      bgColor: "bg-blue-100",
    },
    {
      label: "Unique Locations",
      value: kpis.uniqueLocations.toString(),
      change: kpis.uniqueLocationsChange !== 0 ? `${kpis.uniqueLocationsChange > 0 ? "+" : ""}${kpis.uniqueLocationsChange}` : null,
      changePositive: kpis.uniqueLocationsChange > 0,
      subtext: "States (30d)",
      icon: MapPin,
      color: "text-acg-gold",
      bgColor: "bg-acg-gold/10",
    },
    {
      label: "Avg. Completion",
      value: `${kpis.avgCompletion}%`,
      change: kpis.avgCompletionChange !== 0 ? `${kpis.avgCompletionChange > 0 ? "+" : ""}${kpis.avgCompletionChange}%` : null,
      changePositive: kpis.avgCompletionChange > 0,
      subtext: "Synced rate",
      icon: TrendingUp,
      color: "text-green-600",
      bgColor: "bg-green-100",
    },
  ];

  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} className="border-0 shadow-soft animate-pulse">
            <CardContent className="pt-4 sm:pt-6">
              <div className="h-3 w-20 bg-muted rounded mb-2" />
              <div className="h-7 w-14 bg-muted rounded" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
      {cards.map((card) => (
        <Card key={card.label} className="border-0 shadow-soft hover:shadow-card transition-shadow">
          <CardContent className="pt-4 sm:pt-6 px-3 sm:px-6 pb-4 sm:pb-6">
            <div className="flex items-start justify-between gap-1">
              <div className="min-w-0">
                <p className="text-xs sm:text-sm text-muted-foreground leading-tight">{card.label}</p>
                <div className="mt-1 flex items-baseline gap-1 sm:gap-2 flex-wrap">
                  <span className="font-display text-xl sm:text-2xl font-bold text-foreground">
                    {card.value}
                  </span>
                  {card.change && (
                    <span className="text-xs sm:text-sm font-medium text-green-600">{card.change}</span>
                  )}
                </div>
                {card.subtext && (
                  <p className="mt-0.5 text-xs text-muted-foreground">{card.subtext}</p>
                )}
              </div>
              <div className={`p-1.5 sm:p-2 rounded-lg shrink-0 ${card.bgColor}`}>
                <card.icon className={`h-4 w-4 sm:h-5 sm:w-5 ${card.color}`} />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

export default AnalyticsKPICards;

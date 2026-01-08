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
      change: kpis.totalSubmissionsChange > 0 ? `+${kpis.totalSubmissionsChange}%` : null,
      icon: ClipboardCheck,
      color: "text-primary",
      bgColor: "bg-primary/10",
    },
    {
      label: "This Week",
      value: kpis.thisWeek.toLocaleString(),
      change: kpis.thisWeekChange > 0 ? `+${kpis.thisWeekChange}` : null,
      subtext: "Current cycle",
      icon: CalendarDays,
      color: "text-blue-600",
      bgColor: "bg-blue-100",
    },
    {
      label: "Unique Locations",
      value: kpis.uniqueLocations.toString(),
      change: kpis.uniqueLocationsChange > 0 ? `+${kpis.uniqueLocationsChange}` : null,
      subtext: "States",
      icon: MapPin,
      color: "text-acg-gold",
      bgColor: "bg-acg-gold/10",
    },
    {
      label: "Avg. Completion",
      value: `${kpis.avgCompletion}%`,
      change: kpis.avgCompletionChange > 0 ? `+${kpis.avgCompletionChange}%` : null,
      subtext: "Synced rate",
      icon: TrendingUp,
      color: "text-green-600",
      bgColor: "bg-green-100",
    },
  ];

  if (loading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} className="border-0 shadow-soft animate-pulse">
            <CardContent className="pt-6">
              <div className="h-4 w-24 bg-muted rounded mb-2" />
              <div className="h-8 w-16 bg-muted rounded" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => (
        <Card key={card.label} className="border-0 shadow-soft hover:shadow-card transition-shadow">
          <CardContent className="pt-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{card.label}</p>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="font-display text-2xl font-bold text-foreground">
                    {card.value}
                  </span>
                  {card.change && (
                    <span className="text-sm font-medium text-green-600">{card.change}</span>
                  )}
                </div>
                {card.subtext && (
                  <p className="mt-0.5 text-xs text-muted-foreground">{card.subtext}</p>
                )}
              </div>
              <div className={`p-2 rounded-lg ${card.bgColor}`}>
                <card.icon className={`h-5 w-5 ${card.color}`} />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

export default AnalyticsKPICards;

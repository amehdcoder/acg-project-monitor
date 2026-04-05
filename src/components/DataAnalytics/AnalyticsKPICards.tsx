import { ClipboardCheck, CalendarDays, MapPin, TrendingUp } from "lucide-react";
import type { KPIData } from "@/hooks/useDataAnalytics";

interface AnalyticsKPICardsProps {
  kpis: KPIData;
  loading?: boolean;
}

const FionetKPICard = ({
  label,
  value,
  change,
  changePositive,
  color,
  icon: Icon,
}: {
  label: string;
  value: string;
  change: string | null;
  changePositive: boolean;
  color: string;
  icon: React.ElementType;
}) => (
  <div className={`rounded-xl p-4 text-white text-center shadow-card transition-all duration-300 hover:-translate-y-1 ${color}`}>
    <div className="flex items-center gap-1.5 justify-center mb-1.5">
      <Icon className="h-4 w-4" />
      <p className="text-[10px] sm:text-xs font-semibold uppercase tracking-wide leading-tight">{label}</p>
    </div>
    <p className="font-display text-2xl sm:text-3xl font-bold">{value}</p>
    {change && (
      <p className={`mt-1 text-[10px] sm:text-xs font-medium ${changePositive ? "text-white/90" : "text-white/70"}`}>
        {change}
      </p>
    )}
  </div>
);

const AnalyticsKPICards = ({ kpis, loading }: AnalyticsKPICardsProps) => {
  const cards = [
    {
      label: "Total Submissions",
      value: kpis.totalSubmissions.toLocaleString(),
      change: kpis.totalSubmissionsChange !== 0 ? `${kpis.totalSubmissionsChange > 0 ? "+" : ""}${kpis.totalSubmissionsChange}%` : null,
      changePositive: kpis.totalSubmissionsChange > 0,
      icon: ClipboardCheck,
      color: "bg-[hsl(142,60%,35%)]",
    },
    {
      label: "This Week",
      value: kpis.thisWeek.toLocaleString(),
      change: kpis.thisWeekChange !== 0 ? `${kpis.thisWeekChange > 0 ? "+" : ""}${kpis.thisWeekChange} vs last wk` : null,
      changePositive: kpis.thisWeekChange > 0,
      icon: CalendarDays,
      color: "bg-[hsl(142,50%,45%)]",
    },
    {
      label: "Unique Locations",
      value: kpis.uniqueLocations.toString(),
      change: kpis.uniqueLocationsChange !== 0 ? `${kpis.uniqueLocationsChange > 0 ? "+" : ""}${kpis.uniqueLocationsChange}` : null,
      changePositive: kpis.uniqueLocationsChange > 0,
      icon: MapPin,
      color: "bg-[hsl(142,40%,55%)]",
    },
    {
      label: "Avg. Completion",
      value: `${kpis.avgCompletion}%`,
      change: kpis.avgCompletionChange !== 0 ? `${kpis.avgCompletionChange > 0 ? "+" : ""}${kpis.avgCompletionChange}%` : null,
      changePositive: kpis.avgCompletionChange > 0,
      icon: TrendingUp,
      color: "bg-[hsl(30,80%,50%)]",
    },
  ];

  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="rounded-xl bg-muted animate-pulse h-24" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
      {cards.map((card) => (
        <FionetKPICard key={card.label} {...card} />
      ))}
    </div>
  );
};

export default AnalyticsKPICards;

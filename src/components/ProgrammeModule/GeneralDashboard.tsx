import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity, ArrowDownRight, ArrowRightLeft, ArrowUpRight, BarChart3, Brain, Building2,
  CalendarDays, CheckCircle2, Database, Droplets, Eye, FileText, HeartPulse, Hospital,
  Leaf, LocateFixed, Map as MapIcon, MapPin, MapPinned, Navigation, Pill, Plus, RefreshCw, Search,
  ShieldAlert, Sparkles, UserPlus, Users, Zap,
} from "lucide-react";
import { Bar, BarChart, Cell, Pie, PieChart, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChartContainer, ChartTooltipContent } from "@/components/ui/chart";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useBeneficiaryJourneys } from "@/lib/programmeModule/journey";
import { useFacilities } from "@/lib/programmeModule/facilities";
import { useSafeguardingConcerns } from "@/lib/programmeModule/safeguarding";
import type { BeneficiaryReferralRow, BeneficiaryRow, ProgrammeModuleConfig } from "@/lib/programmeModule/types";
import NigeriaChoropleth, { type ChoroCell } from "@/components/Dashboard/ops/NigeriaChoropleth";
import { lgaKey } from "@/components/Dashboard/ops/lgaGeo";
import Dhis2LgaExchangeDialog from "./Dhis2LgaExchangeDialog";
import { cn } from "@/lib/utils";

type Destination = "records" | "journey" | "facility" | "followups" | "clusters" | "safeguarding";

interface Props {
  projectId: string;
  moduleId?: string;
  config?: ProgrammeModuleConfig;
  beneficiaries: BeneficiaryRow[];
  allowedFacilityIds?: string[];
  isSafeguardingOfficer?: boolean;
  canRegister?: boolean;
  canExchange?: boolean;
  onNavigate: (destination: Destination) => void;
  onRegister: () => void;
  onOpenBeneficiary: (beneficiary: BeneficiaryRow) => void;
}

const COLORS = [
  "hsl(var(--records-teal))", "hsl(var(--records-blue))", "hsl(var(--records-amber))",
  "hsl(var(--records-purple))", "hsl(var(--records-green))", "hsl(var(--records-red))",
];

const normalized = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
const includesAny = (values: string[], keys: string[]) => values.some((value) => keys.some((key) => normalized(value).includes(key)));
const pct = (part: number, whole: number) => whole ? Math.round((part / whole) * 100) : 0;
const dateKey = (value: string) => value.slice(0, 10);
const formatRangeDate = (value: string) => new Date(`${dateKey(value)}T12:00:00`).toLocaleDateString(undefined, { month: "short", year: "numeric" });
const escapeHtml = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[character] || character));

const MAP_SCALE = [
  { fill: "hsl(var(--records-cyan))", label: "Lowest" },
  { fill: "hsl(var(--records-green))", label: "Low" },
  { fill: "hsl(var(--records-amber))", label: "Moderate" },
  { fill: "hsl(var(--records-purple))", label: "High" },
  { fill: "hsl(var(--records-red))", label: "Highest" },
];

const Panel = ({ title, subtitle, className, children, action, icon: Icon, tone = "teal" }: {
  title: string; subtitle?: string; className?: string; children: React.ReactNode; action?: React.ReactNode;
  icon?: React.ElementType; tone?: string;
}) => (
  <section className={cn("rounded-md border border-health-blue/15 bg-card shadow-soft", className)}>
    <header className="flex min-h-12 items-center justify-between gap-3 border-b border-health-blue/10 px-3 py-2">
      <div className="flex items-center gap-2.5">
        {Icon && (
          <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-primary-foreground shadow-soft", `records-stage-${tone}`)}>
            <Icon className="h-3.5 w-3.5" />
          </span>
        )}
        <div><h3 className="font-report-display text-sm font-bold text-health-ink">{title}</h3>{subtitle && <p className="text-[10px] text-muted-foreground">{subtitle}</p>}</div>
      </div>
      {action}
    </header>
    {children}
  </section>
);

const GeneralDashboard = ({
  projectId, moduleId, config, beneficiaries, allowedFacilityIds = [], isSafeguardingOfficer = false,
  canRegister = false, canExchange = false, onNavigate, onRegister, onOpenBeneficiary,
}: Props) => {
  const { profile } = useAuth();
  const { rows, loading, reload } = useBeneficiaryJourneys(projectId, moduleId);
  const { facilities } = useFacilities(projectId);
  const { concerns } = useSafeguardingConcerns(projectId, isSafeguardingOfficer);
  const [referrals, setReferrals] = useState<BeneficiaryReferralRow[]>([]);
  const [selectedGeography, setSelectedGeography] = useState<{ state: string; lga: string } | null>(null);
  const [exchangeOpen, setExchangeOpen] = useState(false);
  const selectGeography = (state: string, lga: string) => {
    setSelectedGeography({ state, lga });
    if (canExchange) setExchangeOpen(true);
  };

  const loadReferrals = useCallback(async () => {
    const { data } = await supabase.from("beneficiary_referrals").select("*")
      .eq("project_id", projectId).order("referral_date", { ascending: false }).limit(1000);
    setReferrals((data as unknown as BeneficiaryReferralRow[]) || []);
  }, [projectId]);

  useEffect(() => { void loadReferrals(); }, [loadReferrals]);

  const scopedRows = useMemo(() => {
    const ids = new Set(beneficiaries.map((beneficiary) => beneficiary.id));
    return rows.filter((row) => ids.has(row.beneficiary.id));
  }, [rows, beneficiaries]);
  const scopedIds = useMemo(() => new Set(beneficiaries.map((beneficiary) => beneficiary.id)), [beneficiaries]);
  const scopedReferrals = useMemo(() => referrals.filter((referral) => scopedIds.has(referral.beneficiary_id)), [referrals, scopedIds]);
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const periodStart = new Date(now);
  periodStart.setDate(periodStart.getDate() - 29);
  const priorPeriodStart = new Date(now);
  priorPeriodStart.setDate(priorPeriodStart.getDate() - 59);
  const currentStart = periodStart.toISOString().slice(0, 10);
  const previousStart = priorPeriodStart.toISOString().slice(0, 10);
  const inCurrentPeriod = (value?: string | null) => Boolean(value && dateKey(value) >= currentStart && dateKey(value) <= today);
  const inPreviousPeriod = (value?: string | null) => Boolean(value && dateKey(value) >= previousStart && dateKey(value) < currentStart);
  const trend = (current: number, previous: number) => ({
    delta: previous === 0 ? (current === 0 ? 0 : 100) : Math.round(((current - previous) / previous) * 100),
    current,
    previous,
  });
  const due = beneficiaries.filter((beneficiary) => beneficiary.next_follow_up_date && beneficiary.next_follow_up_date <= today).length;
  const pendingReferrals = scopedReferrals.filter((referral) => !["completed", "declined"].includes(referral.status)).length;
  const serviceCount = scopedRows.reduce((sum, row) => sum + row.serviceCount, 0);
  const componentCount = (keys: string[]) => scopedRows.filter((row) => includesAny(row.components, keys)).length;
  const assessed = scopedRows.filter((row) => Boolean(row.perceivedChange)).length;
  const improved = scopedRows.filter((row) => ["Improved", "Much improved"].includes(row.perceivedChange || "")).length;
  const outcomes = [
    { name: "Improved health", value: improved },
    { name: "Completed services", value: scopedRows.filter((row) => row.serviceCount > 0 && !row.perceivedChange).length },
    { name: "Referred & linked", value: new Set(scopedReferrals.map((referral) => referral.beneficiary_id)).size },
    { name: "Ongoing support", value: Math.max(beneficiaries.length - assessed, 0) },
  ].filter((item) => item.value > 0);
  const referralData = [
    { name: "Completed", value: scopedReferrals.filter((referral) => referral.status === "completed").length },
    { name: "In progress", value: scopedReferrals.filter((referral) => referral.status === "accepted").length },
    { name: "Pending", value: scopedReferrals.filter((referral) => referral.status === "initiated").length },
    { name: "Declined", value: scopedReferrals.filter((referral) => referral.status === "declined").length },
  ].filter((item) => item.value > 0);
  const componentData = (config?.components || []).filter((component) => !component.hidden).map((component) => ({
    name: component.label.replace(/\s+(services?|support|interventions?)$/i, ""),
    value: componentCount([normalized(component.key), normalized(component.label)]),
  })).sort((left, right) => right.value - left.value).slice(0, 5);
  const maxComponent = Math.max(...componentData.map((item) => item.value), 1);
  const facilityData = facilities
    .filter((facility) => !allowedFacilityIds.length || allowedFacilityIds.includes(facility.id))
    .map((facility) => {
      const people = beneficiaries.filter((beneficiary) => beneficiary.facility_id === facility.id);
      const served = people.filter((person) => scopedRows.find((row) => row.beneficiary.id === person.id)?.serviceCount).length;
      return { name: facility.name, people: people.length, rate: pct(served, people.length) };
    }).filter((item) => item.people > 0).sort((left, right) => right.people - left.people).slice(0, 5);
  const geography = useMemo(() => {
    const locations = new Map<string, { state: string; lga: string; wards: Set<string>; value: number }>();
    const states = new Set<string>();
    const wards = new Set<string>();
    let mapped = 0;
    beneficiaries.forEach((beneficiary) => {
      const state = beneficiary.state?.trim();
      const lga = beneficiary.lga?.trim();
      if (!state || !lga) return;
      mapped += 1;
      states.add(state);
      if (beneficiary.ward?.trim()) wards.add(`${state}|${lga}|${beneficiary.ward.trim()}`);
      const key = lgaKey(state, lga);
      const current = locations.get(key) || { state, lga, wards: new Set<string>(), value: 0 };
      current.value += 1;
      if (beneficiary.ward?.trim()) current.wards.add(beneficiary.ward.trim());
      locations.set(key, current);
    });
    const ranked = [...locations.values()].sort((left, right) => right.value - left.value);
    const maximum = Math.max(...ranked.map((item) => item.value), 1);
    const cells = new Map<string, ChoroCell>();
    locations.forEach((location, key) => {
      const scaleIndex = Math.min(MAP_SCALE.length - 1, Math.ceil((location.value / maximum) * MAP_SCALE.length) - 1);
      const tone = MAP_SCALE[Math.max(scaleIndex, 0)];
      cells.set(key, {
        fill: tone.fill,
        opacity: 0.84,
        popupHtml: `<div><strong>${escapeHtml(location.lga)}, ${escapeHtml(location.state)}</strong><br/>${location.value.toLocaleString()} beneficiar${location.value === 1 ? "y" : "ies"}<br/>${location.wards.size.toLocaleString()} ward${location.wards.size === 1 ? "" : "s"}<br/>${pct(location.value, mapped)}% of mapped records</div>`,
      });
    });
    return { cells, ranked, mapped, stateCount: states.size, wardCount: wards.size, lgaCount: locations.size };
  }, [beneficiaries]);
  const selectedGeographyData = selectedGeography
    ? geography.ranked.find((item) => lgaKey(item.state, item.lga) === lgaKey(selectedGeography.state, selectedGeography.lga))
    : undefined;
  const recent = beneficiaries.slice().sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 5);
  const active = beneficiaries.filter((beneficiary) => !["inactive", "closed", "deceased"].includes(beneficiary.status.toLowerCase())).length;
  const newThisMonth = beneficiaries.filter((beneficiary) => beneficiary.created_at >= monthStart).length;
  const flags = isSafeguardingOfficer ? concerns.filter((concern) => concern.status !== "closed").length : scopedRows.filter((row) => row.safeguardingFlags > 0).length;
  const dataExceptions = beneficiaries.filter((beneficiary) => !beneficiary.facility_id || !beneficiary.lga || !beneficiary.state).length;
  const serviceDates = scopedRows.flatMap((row) => row.serviceDates);
  const componentPeriodCount = (keys: string[], currentPeriod: boolean) => scopedRows.reduce((total, row) => total + Object.entries(row.componentServiceDates)
    .filter(([key]) => includesAny([key], keys))
    .flatMap(([, dates]) => dates)
    .filter(currentPeriod ? inCurrentPeriod : inPreviousPeriod).length, 0);
  const enrolmentTrend = trend(
    beneficiaries.filter((beneficiary) => inCurrentPeriod(beneficiary.created_at)).length,
    beneficiaries.filter((beneficiary) => inPreviousPeriod(beneficiary.created_at)).length,
  );
  const dueTrend = trend(
    beneficiaries.filter((beneficiary) => inCurrentPeriod(beneficiary.next_follow_up_date)).length,
    beneficiaries.filter((beneficiary) => inPreviousPeriod(beneficiary.next_follow_up_date)).length,
  );
  const referralTrend = trend(
    scopedReferrals.filter((referral) => inCurrentPeriod(referral.referral_date)).length,
    scopedReferrals.filter((referral) => inPreviousPeriod(referral.referral_date)).length,
  );
  const serviceTrend = trend(serviceDates.filter(inCurrentPeriod).length, serviceDates.filter(inPreviousPeriod).length);
  const componentTrend = (keys: string[]) => trend(componentPeriodCount(keys, true), componentPeriodCount(keys, false));
  const activeTrend = trend(
    beneficiaries.filter((beneficiary) => !["inactive", "closed", "deceased"].includes(beneficiary.status.toLowerCase()) && inCurrentPeriod(beneficiary.created_at)).length,
    beneficiaries.filter((beneficiary) => !["inactive", "closed", "deceased"].includes(beneficiary.status.toLowerCase()) && inPreviousPeriod(beneficiary.created_at)).length,
  );
  const activityDates = [
    ...beneficiaries.map((beneficiary) => beneficiary.created_at),
    ...serviceDates,
    ...scopedReferrals.map((referral) => referral.referral_date),
  ].filter(Boolean).sort();
  const journeyDateRange = activityDates.length
    ? `${formatRangeDate(activityDates[0])} – ${formatRangeDate(activityDates[activityDates.length - 1])}`
    : "No activity dates yet";

  const kpis = [
    { label: "Active beneficiaries", value: active, icon: Users, tone: "blue", trend: activeTrend },
    { label: "New enrolments", value: newThisMonth, icon: UserPlus, tone: "teal", trend: enrolmentTrend },
    { label: "Follow-ups due", value: due, icon: CalendarDays, tone: "amber", trend: dueTrend, inverse: true },
    { label: "Referrals pending", value: pendingReferrals, icon: ArrowRightLeft, tone: "red", trend: referralTrend, inverse: true },
    { label: "Services delivered", value: serviceCount, icon: Activity, tone: "purple", trend: serviceTrend },
    { label: "MMDP / NTD cases", value: componentCount(["mmdp", "ntd", "lymphatic", "onchocerciasis"]), icon: Pill, tone: "teal", trend: componentTrend(["mmdp", "ntd", "lymphatic", "onchocerciasis"]) },
    { label: "Eye health services", value: componentCount(["eye", "vision", "trachoma"]), icon: Eye, tone: "blue", trend: componentTrend(["eye", "vision", "trachoma"]) },
    { label: "Mental health support", value: componentCount(["mental", "psychosocial", "mhpss"]), icon: Brain, tone: "purple", trend: componentTrend(["mental", "psychosocial", "mhpss"]) },
    { label: "WASH interventions", value: componentCount(["wash", "water", "sanitation"]), icon: Droplets, tone: "cyan", trend: componentTrend(["wash", "water", "sanitation"]) },
    { label: "Livelihood support", value: componentCount(["livelihood", "empowerment"]), icon: Leaf, tone: "green", trend: componentTrend(["livelihood", "empowerment"]) },
  ];
  const journey = [
    { label: "Enrolment", value: beneficiaries.length, icon: Pill, tone: "teal" },
    { label: "Assessment", value: assessed, icon: Users, tone: "teal" },
    { label: "Service delivery", value: new Set(scopedRows.filter((row) => row.serviceCount > 0).map((row) => row.beneficiary.id)).size, icon: Activity, tone: "teal" },
    { label: "Referral", value: new Set(scopedReferrals.map((referral) => referral.beneficiary_id)).size, icon: Hospital, tone: "amber" },
    { label: "Follow-up", value: beneficiaries.filter((beneficiary) => beneficiary.next_follow_up_date).length, icon: CalendarDays, tone: "blue" },
    { label: "Outcome", value: assessed, icon: CheckCircle2, tone: "purple" },
  ];

  return (
    <div className="records-dashboard space-y-2 rounded-lg bg-health-surface p-2 font-report sm:p-3">
      <header className="flex flex-col justify-between gap-3 rounded-md border border-health-blue/10 bg-card px-3 py-3 shadow-soft sm:flex-row sm:items-center">
        <div className="flex items-center gap-3">
          <span className="records-stage-teal flex h-11 w-11 items-center justify-center rounded-xl text-primary-foreground shadow-card"><Sparkles className="h-6 w-6" /></span>
          <div><h2 className="font-report-display text-lg font-bold text-health-ink">Welcome back, {profile?.first_name || "Team"}</h2><p className="text-xs text-muted-foreground">Track, manage and improve beneficiary outcomes across all programme components.</p></div>
        </div>
        <div className="flex items-center gap-3 border-health-blue/15 sm:border-l sm:pl-4">
          <span className="records-stage-blue flex h-9 w-9 items-center justify-center rounded-lg text-primary-foreground"><CalendarDays className="h-4 w-4" /></span>
          <div><p className="text-xs font-bold text-health-ink">{now.toLocaleDateString(undefined, { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}</p><p className="text-[10px] text-muted-foreground">Live project view · {beneficiaries.length.toLocaleString()} records</p></div>
          <Button variant="ghost" size="icon" onClick={() => { void reload(); void loadReferrals(); }} aria-label="Refresh dashboard"><RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} /></Button>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
        {kpis.map((item) => {
          const improving = item.inverse ? item.trend.delta <= 0 : item.trend.delta >= 0;
          const TrendIcon = item.trend.delta >= 0 ? ArrowUpRight : ArrowDownRight;
          return <div key={item.label} className={cn("records-kpi rounded-md border bg-card p-3 shadow-soft", `records-kpi-${item.tone}`)}><div className="flex items-start gap-3"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-primary-foreground shadow-card"><item.icon className="h-6 w-6" /></span><div className="min-w-0"><p className="text-[10px] font-bold text-health-ink">{item.label}</p><p className="font-report-display text-2xl font-bold tabular-nums text-health-ink">{item.value.toLocaleString()}</p><p className={cn("flex items-center gap-0.5 text-[9px] font-semibold", improving ? "text-records-green" : "text-destructive")} title={`${item.trend.current} in the latest 30 days; ${item.trend.previous} in the preceding 30 days`}><TrendIcon className="h-3 w-3 shrink-0" /><span>{item.trend.delta > 0 ? "+" : ""}{item.trend.delta}%</span><span className="truncate font-normal text-muted-foreground">vs prior 30 days</span></p></div></div></div>;
        })}
      </div>

      <div className="grid gap-2 xl:grid-cols-[2fr_1fr]">
        <Panel icon={Activity} tone="teal" title="Beneficiary Journey" subtitle="From enrolment to better health and inclusion" action={<Button variant="ghost" size="sm" onClick={() => onNavigate("journey")}>View report</Button>}>
          <div className="grid grid-cols-2 gap-y-6 px-3 py-5 sm:grid-cols-3 lg:grid-cols-6">
            {journey.map((item, index) => <div key={item.label} className="relative text-center"><div className={cn("mx-auto flex h-12 w-12 items-center justify-center rounded-full border-4 border-card text-primary-foreground shadow-card", `records-stage-${item.tone}`)}><item.icon className="h-6 w-6" /></div>{index < journey.length - 1 && <span className="absolute left-[60%] top-6 hidden h-0.5 w-[80%] bg-records-teal/55 lg:block" />}<p className="mt-2 text-[10px] font-bold text-health-ink">{item.label}</p><p className="font-report-display text-lg font-bold text-health-ink">{item.value.toLocaleString()}</p><p className="whitespace-nowrap text-[9px] text-muted-foreground">{journeyDateRange}</p></div>)}
          </div>
        </Panel>
        <Panel icon={ShieldAlert} tone="amber" title="Key Alerts & Actions" action={<Button variant="ghost" size="sm" onClick={() => onNavigate("followups")}>View all</Button>}>
          <div className="space-y-1.5 p-2">
            {[
              { label: "Overdue follow-ups", value: due, icon: CalendarDays, tone: "red", go: "followups" as Destination },
              { label: "Safeguarding / access restricted", value: flags, icon: ShieldAlert, tone: "amber", go: isSafeguardingOfficer ? "safeguarding" as Destination : "records" as Destination },
              { label: "Data quality exceptions", value: dataExceptions, icon: Database, tone: "blue", go: "records" as Destination },
              { label: "Referral escalations", value: pendingReferrals, icon: ArrowRightLeft, tone: "purple", go: "followups" as Destination },
            ].map((alert) => <Button key={alert.label} variant="outline" className="h-auto w-full justify-start gap-3 px-2.5 py-2 text-left" onClick={() => onNavigate(alert.go)}><span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-primary-foreground", `records-stage-${alert.tone}`)}><alert.icon className="h-4 w-4" /></span><span className="flex-1"><span className="block text-xs font-semibold text-health-ink">{alert.label}</span><span className="block text-[10px] font-normal text-muted-foreground">{alert.value.toLocaleString()} record{alert.value === 1 ? "" : "s"}</span></span><span className="text-health-blue">›</span></Button>)}
          </div>
        </Panel>
      </div>

      <div className="grid gap-2 lg:grid-cols-2 xl:grid-cols-4">
        <Panel icon={BarChart3} tone="blue" title="Service Uptake by Component"><div className="h-44 p-2"><ChartContainer config={{ value: { label: "Beneficiaries", color: "hsl(var(--records-teal))" } }} className="h-full w-full"><BarChart data={componentData} margin={{ bottom: 34 }}><XAxis dataKey="name" tick={{ fontSize: 9 }} interval={0} angle={-35} textAnchor="end" height={52} tickFormatter={(v: string) => (v.length > 14 ? `${v.slice(0, 13)}…` : v)} /><YAxis hide domain={[0, maxComponent]} /><Tooltip content={<ChartTooltipContent />} /><Bar dataKey="value" radius={[3, 3, 0, 0]}>{componentData.map((_, index) => <Cell key={index} fill={COLORS[index % COLORS.length]} />)}</Bar></BarChart></ChartContainer></div></Panel>
        <Panel icon={HeartPulse} tone="purple" title="Beneficiary Outcomes"><RingChart data={outcomes} total={outcomes.reduce((sum, item) => sum + item.value, 0)} label="with outcome" /></Panel>
        <Panel icon={ArrowRightLeft} tone="red" title="Referral Status"><RingChart data={referralData} total={scopedReferrals.length} label="total referrals" /></Panel>
        <Panel icon={Hospital} tone="blue" title="Facility Performance"><div className="space-y-3 p-3">{facilityData.length ? facilityData.map((facility) => <div key={facility.name}><div className="mb-1 flex justify-between gap-2 text-[10px]"><span className="truncate font-semibold text-health-ink">{facility.name}</span><span>{facility.rate}%</span></div><div className="h-2 overflow-hidden rounded-sm bg-muted"><div className="h-full bg-records-blue" style={{ width: `${facility.rate}%` }} /></div></div>) : <Empty label="No facility-linked records yet" />}</div></Panel>
      </div>

      <Panel
        icon={MapPinned}
        tone="green"
        title="Geographic Distribution"
        subtitle="Live beneficiary concentration by Local Government Area"
        action={<Button variant="ghost" size="sm" onClick={() => onNavigate("clusters")}><MapIcon className="h-4 w-4" /> Explore clusters</Button>}
      >
        <div className="grid gap-0 lg:grid-cols-[minmax(0,2.2fr)_minmax(270px,0.8fr)]">
          <div className="relative min-h-[390px] overflow-hidden border-b border-health-blue/10 bg-health-surface lg:border-b-0 lg:border-r">
            {geography.mapped > 0 ? (
              <NigeriaChoropleth
                cells={geography.cells}
                height={390}
                showBasemap={false}
                className="z-0 !bg-card"
                onSelectUnit={selectGeography}
              />
            ) : (
              <div className="flex h-[390px] flex-col items-center justify-center gap-3 px-6 text-center">
                <span className="records-stage-green flex h-14 w-14 items-center justify-center rounded-full text-primary-foreground shadow-card"><MapPinned className="h-7 w-7" /></span>
                <div><p className="text-sm font-bold text-health-ink">No mapped beneficiary locations yet</p><p className="mt-1 text-xs text-muted-foreground">State and LGA details will automatically populate this map.</p></div>
              </div>
            )}
            {geography.mapped > 0 && (
              <div className="pointer-events-none absolute bottom-3 left-3 z-[500] rounded-md border border-health-blue/10 bg-card/95 p-2 shadow-card backdrop-blur-sm">
                <p className="mb-1.5 text-[9px] font-bold uppercase text-health-ink">Beneficiary concentration</p>
                <div className="flex flex-wrap gap-x-3 gap-y-1">
                  <span className="flex items-center gap-1 text-[9px] text-muted-foreground"><span className="h-2.5 w-2.5 rounded-sm border border-border bg-muted" />No records</span>
                  {MAP_SCALE.map((item) => <span key={item.label} className="flex items-center gap-1 text-[9px] text-muted-foreground"><span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: item.fill }} />{item.label}</span>)}
                </div>
              </div>
            )}
          </div>
          <div className="p-3">
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: "Mapped records", value: geography.mapped, icon: MapPin, tone: "green" },
                { label: "States covered", value: geography.stateCount, icon: MapIcon, tone: "blue" },
                { label: "LGAs covered", value: geography.lgaCount, icon: LocateFixed, tone: "purple" },
                { label: "Wards covered", value: geography.wardCount, icon: Navigation, tone: "amber" },
              ].map((item) => <div key={item.label} className="rounded-md border border-health-blue/10 bg-health-surface p-2.5"><div className="flex items-center gap-2"><span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-primary-foreground", `records-stage-${item.tone}`)}><item.icon className="h-4 w-4" /></span><div><p className="font-report-display text-lg font-bold leading-none text-health-ink">{item.value.toLocaleString()}</p><p className="mt-1 text-[9px] font-semibold text-muted-foreground">{item.label}</p></div></div></div>)}
            </div>

            {selectedGeography && (
              <div className="mt-3 rounded-md border border-records-green/25 bg-records-green/5 p-3">
                <div className="flex items-start gap-2"><span className="records-stage-green flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-primary-foreground"><MapPin className="h-4 w-4" /></span><div className="min-w-0"><p className="truncate text-xs font-bold text-health-ink">{selectedGeography.lga}, {selectedGeography.state}</p><p className="text-[10px] text-muted-foreground">{selectedGeographyData ? `${selectedGeographyData.value.toLocaleString()} beneficiaries · ${selectedGeographyData.wards.size.toLocaleString()} wards · ${pct(selectedGeographyData.value, geography.mapped)}% of mapped records` : "No beneficiary records in this LGA"}</p></div></div>
              </div>
            )}

            <div className="mt-3">
              <p className="mb-2 text-[10px] font-bold uppercase text-health-ink">Leading locations</p>
              <div className="space-y-2">
                {geography.ranked.slice(0, 5).map((location, index) => <button key={lgaKey(location.state, location.lga)} type="button" className="grid w-full grid-cols-[auto_1fr_auto] items-center gap-2 text-left" onClick={() => selectGeography(location.state, location.lga)}><span className="flex h-6 w-6 items-center justify-center rounded-md text-[9px] font-bold text-primary-foreground" style={{ backgroundColor: MAP_SCALE[Math.min(index, MAP_SCALE.length - 1)].fill }}>{index + 1}</span><span className="min-w-0"><span className="block truncate text-[10px] font-bold text-health-ink">{location.lga}</span><span className="block truncate text-[9px] text-muted-foreground">{location.state} · {location.wards.size} ward{location.wards.size === 1 ? "" : "s"}</span></span><span className="font-report-display text-sm font-bold tabular-nums text-health-ink">{location.value}</span></button>)}
                {!geography.ranked.length && <Empty label="No geographic data recorded" />}
              </div>
            </div>
          </div>
        </div>
      </Panel>

      <div className="grid gap-2 xl:grid-cols-[2fr_1.05fr]">
        <Panel icon={FileText} tone="teal" title="Recent Beneficiary Records" subtitle="Latest enrolments and updates across all components">
          <div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left text-[10px]"><thead className="bg-health-surface text-muted-foreground"><tr><th className="px-3 py-2">Case ID</th><th className="px-3 py-2">Name</th><th className="px-3 py-2">Location</th><th className="px-3 py-2">Components</th><th className="px-3 py-2">Last update</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Action</th></tr></thead><tbody className="divide-y">{recent.map((beneficiary) => { const row = scopedRows.find((item) => item.beneficiary.id === beneficiary.id); return <tr key={beneficiary.id}><td className="px-3 py-2 font-mono text-health-blue">{beneficiary.case_id}</td><td className="px-3 py-2 font-semibold text-health-ink">{beneficiary.full_name}</td><td className="px-3 py-2">{[beneficiary.lga, beneficiary.ward].filter(Boolean).join(" / ") || "Not recorded"}</td><td className="px-3 py-2"><div className="flex max-w-52 flex-wrap gap-1">{(row?.components || []).slice(0, 2).map((component) => <Badge key={component} variant="secondary" className="text-[9px]">{config?.components.find((item) => item.key === component)?.label || component}</Badge>)}</div></td><td className="px-3 py-2">{new Date(beneficiary.updated_at).toLocaleDateString()}</td><td className="px-3 py-2"><Badge variant="outline" className="border-records-green/30 bg-records-green/10 text-records-green">{beneficiary.status}</Badge></td><td className="px-3 py-2"><Button variant="outline" size="sm" className="h-7 text-[10px]" onClick={() => onOpenBeneficiary(beneficiary)}>View</Button></td></tr>; })}</tbody></table>{!recent.length && <Empty label="No beneficiaries registered yet" />}</div>
        </Panel>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
          <Panel icon={Zap} tone="amber" title="Quick Actions"><div className="grid grid-cols-2 gap-2 p-2">{canRegister && <Button variant="outline" className="h-auto justify-start gap-2.5 px-2 py-3 text-xs" onClick={onRegister}><span className="records-stage-teal flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-primary-foreground"><Plus className="h-4 w-4" /></span> Add beneficiary</Button>}<Button variant="outline" className="h-auto justify-start gap-2.5 px-2 py-3 text-xs" onClick={() => onNavigate("records")}><span className="records-stage-blue flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-primary-foreground"><Search className="h-4 w-4" /></span> Search records</Button><Button variant="outline" className="h-auto justify-start gap-2.5 px-2 py-3 text-xs" onClick={() => onNavigate("facility")}><span className="records-stage-amber flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-primary-foreground"><Building2 className="h-4 w-4" /></span> Facilities</Button><Button variant="outline" className="h-auto justify-start gap-2.5 px-2 py-3 text-xs" onClick={() => onNavigate("journey")}><span className="records-stage-purple flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-primary-foreground"><FileText className="h-4 w-4" /></span> Generate report</Button></div></Panel>
        </div>
      </div>
      {canExchange && <Dhis2LgaExchangeDialog projectId={projectId} geography={selectedGeography} open={exchangeOpen} onOpenChange={setExchangeOpen} />}
    </div>
  );
};

const Empty = ({ label }: { label: string }) => <p className="py-8 text-center text-xs text-muted-foreground">{label}</p>;

const RingChart = ({ data, total, label }: { data: { name: string; value: number }[]; total: number; label: string }) => (
  <div className="grid min-h-44 grid-cols-[1fr_1.1fr] items-center gap-1 p-2">
    <div className="relative h-32"><ChartContainer config={{ value: { label: "Records" } }} className="h-full w-full"><PieChart><Pie data={data.length ? data : [{ name: "No data", value: 1 }]} dataKey="value" nameKey="name" innerRadius={38} outerRadius={56} paddingAngle={1}>{(data.length ? data : [{ name: "No data", value: 1 }]).map((_, index) => <Cell key={index} fill={data.length ? COLORS[index % COLORS.length] : "hsl(var(--muted))"} />)}</Pie><Tooltip content={<ChartTooltipContent nameKey="name" />} /></PieChart></ChartContainer><div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"><span className="font-report-display text-lg font-bold text-health-ink">{total.toLocaleString()}</span><span className="max-w-16 text-center text-[8px] text-muted-foreground">{label}</span></div></div>
    <div className="space-y-2">{data.map((item, index) => <div key={item.name} className="flex items-center gap-2 text-[9px]"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} /><span className="flex-1 text-muted-foreground">{item.name}</span><span className="font-bold text-health-ink">{pct(item.value, total)}%</span></div>)}</div>
  </div>
);

export default GeneralDashboard;
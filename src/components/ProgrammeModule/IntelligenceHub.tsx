import { useEffect, useState } from "react";
import { Activity, Brain, ChevronRight, Cloud, Database, Home, MapPin, RefreshCw, Share2, ShieldAlert, ShieldCheck, Users, Droplets } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { WorkspaceNavItem, WorkspaceView } from "./WorkspaceNavigation";
import type { BeneficiaryRow } from "@/lib/programmeModule/types";
import network from "@/assets/intelligence/network.png.asset.json";
import risk from "@/assets/intelligence/risk.png.asset.json";
import exchange from "@/assets/intelligence/exchange.png.asset.json";

const cards = {
  network: { art: network.url, tone: "blue", chips: [[Home, "Households"], [Users, "Kinship"], [Droplets, "WASH links"]] },
  risk: { art: risk.url, tone: "orange", chips: [[ShieldAlert, "High risk"], [Activity, "Moderate risk"], [ShieldCheck, "Low risk"], [MapPin, "Dispatched visits"]] },
  exchange: { art: exchange.url, tone: "violet", chips: [[Database, "DHIS2"], [Share2, "LMIS"], [Activity, "FHIR"], [RefreshCw, "ADX"], [Database, "SDMX"]] },
} as const;

interface Props {
  beneficiaries: BeneficiaryRow[];
  items: WorkspaceNavItem[];
  pending: number;
  components: number;
  onOpen: (view: WorkspaceView) => void;
}

export default function IntelligenceHub({ beneficiaries, items, pending, components, onOpen }: Props) {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); };
  }, []);

  return (
    <section className="overview-hub space-y-4">
      <header className="overview-heading px-5 py-6 sm:px-7">
        <h2 className="font-report-display text-4xl font-extrabold">Intelligence</h2>
        <p className="mt-2 max-w-xl text-base sm:text-lg">Predictive analytics for targeted action and greater impact.</p>
      </header>
      <div className="overview-status grid grid-cols-2 gap-4 border bg-card p-4 sm:grid-cols-4">
        <div className="flex items-center gap-3"><Database className="h-7 w-7 shrink-0 text-health-teal" /><div><p className="font-bold">Data sources</p><p className="text-sm text-muted-foreground">{beneficiaries.length.toLocaleString()} records connected</p></div></div>
        <div className="flex items-center gap-3"><RefreshCw className="h-7 w-7 shrink-0 text-health-teal" /><div><p className="font-bold">Last sync</p><p className="text-sm text-muted-foreground">{pending ? `${pending.toLocaleString()} queued` : "Up to date"}</p></div></div>
        <div className="flex items-center gap-3"><Brain className="h-7 w-7 shrink-0 text-health-blue" /><div><p className="font-bold">Models</p><p className="text-sm text-muted-foreground">{components.toLocaleString()} active</p></div></div>
        <div className="flex items-center gap-3"><Cloud className="h-7 w-7 shrink-0 text-health-blue" /><div><p className="font-bold">Predictions</p><p className="text-sm text-muted-foreground">{online ? "Up to date" : "Offline — on device"}</p></div></div>
      </div>
      <div className="grid gap-4">
        {items.filter((item) => item.show).map((item) => {
          const card = cards[item.key as keyof typeof cards];
          if (!card) return null;
          return (
            <Button key={item.key} variant="ghost" onClick={() => onOpen(item.key)} className={`overview-card overview-${card.tone} group relative h-auto w-full flex-col items-stretch overflow-hidden border p-4 text-left shadow-soft sm:p-5`}>
              <div className="overview-art" aria-hidden="true"><img src={card.art} alt="" loading="lazy" /></div>
              <div className="relative flex items-start gap-4 pr-8 sm:gap-5">
                <span className="overview-card-icon flex shrink-0 items-center justify-center rounded-2xl"><item.icon className="h-10 w-10 sm:h-12 sm:w-12" /></span>
                <div className="overview-card-copy min-w-0 py-1"><h3 className="whitespace-normal break-words font-report-display text-xl font-extrabold sm:text-2xl">{item.label}</h3><p className="mt-2 whitespace-normal break-words text-base font-normal text-muted-foreground sm:text-lg">{item.description}.</p></div>
              </div>
              <span className="overview-arrow absolute right-4 top-5 flex h-10 w-10 items-center justify-center rounded-full"><ChevronRight className="h-7 w-7" /></span>
              <div className="relative mt-4 flex flex-wrap gap-2">
                {card.chips.map(([Icon, label], i) => <span key={label} className={`overview-chip overview-chip-${i % 5} flex items-center gap-2 rounded-full px-3 py-2 text-xs font-medium sm:text-sm`}><Icon className="h-4 w-4" />{label}</span>)}
              </div>
            </Button>
          );
        })}
      </div>
    </section>
  );
}

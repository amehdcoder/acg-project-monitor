import { memo, useMemo } from "react";
import type { FormGroup } from "@/components/FormBuilder/types";
import fgnEmblem from "@/assets/fgn-emblem.png";
import { toast } from "@/hooks/use-toast";
import {
  Home,
  CalendarCheck,
  Users,
  Stethoscope,
  FileText,
  Package,
  Megaphone,
  ShieldPlus,
  Search,
  BarChart3,
  ClipboardCheck,
  Send,
  ClipboardList,
  Camera,
  Mic,
  MapPin,
  PenLine,
  Paperclip,
  StickyNote,
  ShieldCheck,
  Percent,
  CheckCircle2,
  type LucideIcon,
} from "lucide-react";

const SECTION_ICONS: LucideIcon[] = [
  Home,            // 1 General Information
  CalendarCheck,   // 2 Planning & Preparation
  Users,           // 3 CDD Assessment
  Stethoscope,     // 4 Service Delivery Observation
  FileText,        // 5 Registers & Data Management
  Package,         // 6 Inventory & Supplies
  Megaphone,       // 7 Community Engagement
  ShieldPlus,      // 8 Adverse Events & Safety
  Home,            // 9 Household Verification
  Search,          // 10 Cross-cutting Checks
  BarChart3,       // 11 Summary & Scoring
  ClipboardCheck,  // 12 Corrective Actions
];

const stripHtml = (s: string) => s.replace(/<[^>]*>/g, "").trim();

const scrollToName = (name: string) => {
  const el = document.querySelector(`[data-question-name="${name}"]`);
  if (el) {
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    return true;
  }
  return false;
};

interface SidebarProps {
  groups: FormGroup[];
  formName: string;
  startedAt?: Date | null;
  lastSaved?: Date | null;
  activeIndex: number;
  onSelect: (index: number) => void;
  onReview?: () => void;
}

/** Fixed left navigation panel — mirrors the MDA Supervisory Checklist mockup. */
export const MdaChecklistSidebar = memo(function MdaChecklistSidebar({ groups, startedAt, lastSaved, activeIndex, onSelect, onReview }: SidebarProps) {
  const supervisionId = useMemo(() => {
    const d = startedAt ?? new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `SUP-${yyyy}-${mm}-${dd}-0001`;
  }, [startedAt]);

  return (
    <aside className="hidden lg:flex fixed left-0 top-0 bottom-0 z-30 w-64 flex-col overflow-hidden bg-[hsl(215_60%_15%)] text-white/90">
      {/* Emblem header */}
      <div className="flex shrink-0 flex-col items-center gap-2 border-b border-white/10 px-4 py-5 text-center">
        <img src={fgnEmblem} alt="Federal Government of Nigeria coat of arms" className="h-16 w-16 object-contain" />
        <p className="text-xs font-bold uppercase tracking-wide leading-tight">
          NTD Programme<br />Nigeria
        </p>
      </div>

      {/* Section navigation */}
      <nav className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-3 py-4">
        {groups.map((g, i) => {
          const Icon = SECTION_ICONS[i] ?? ClipboardList;
          const active = activeIndex === i;
          return (
            <button
              key={g.id}
              onClick={() => onSelect(i)}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-[13px] leading-snug transition-colors ${
                active
                  ? "bg-emerald-500 text-white font-semibold shadow-sm"
                  : "hover:bg-white/10 text-white/80"
              }`}
            >
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${active ? "bg-white/20" : "bg-white/5"}`}>
                <Icon className="h-[18px] w-[18px]" />
              </span>
              <span className="line-clamp-2">{stripHtml(g.label)}</span>
            </button>
          );
        })}

        <button
          onClick={onReview}
          className="mt-3 flex w-full items-center gap-3 rounded-lg border border-emerald-400/30 px-3 py-3 text-left text-[13px] font-semibold text-emerald-300 hover:bg-white/10"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-emerald-400/20">
            <Send className="h-[18px] w-[18px]" />
          </span>
          Review &amp; Submit
        </button>
      </nav>


      {/* Footer meta */}
      <div className="shrink-0 space-y-3 border-t border-white/10 px-4 py-4 text-[11px]">
        <div>
          <p className="text-white/50">Supervision ID</p>
          <p className="font-medium text-white/90">{supervisionId}</p>
        </div>
        <div>
          <p className="text-white/50">Started</p>
          <p className="font-medium text-white/90">
            {(startedAt ?? new Date()).toLocaleString([], {
              day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
            })}
          </p>
        </div>
        <div>
          <p className="text-white/50">Last saved</p>
          <p className="font-medium text-emerald-300">
            {lastSaved ? lastSaved.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "Just now"}
          </p>
        </div>
      </div>
    </aside>
  );
});

interface SummaryProps {
  responses: Record<string, any>;
  nameToId: Record<string, string>;
}

const num = (v: any): number | null => {
  const n = parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
};

/** Auto-calculated supervision summary cards. */
export function MdaSummaryCards({ responses, nameToId }: SummaryProps) {
  const get = (name: string) => responses[nameToId[name]];

  const score = num(get("implementation_score"));
  const risk = String(get("risk_category") || "").toLowerCase();
  const treated = num(get("individuals_treated")) ?? num(get("persons_treated"));
  const coverage = num(get("coverage_achieved")) ?? num(get("verified_coverage"));

  const scoreBand = score == null ? "—" : score >= 80 ? "Good" : score >= 60 ? "Fair" : "Needs Attention";
  const riskLabel = risk ? risk.charAt(0).toUpperCase() + risk.slice(1) : "—";
  const riskBand = risk === "low" ? "Acceptable" : risk === "medium" ? "Monitor" : risk === "high" ? "Action needed" : "—";

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="mb-3 text-sm font-semibold text-primary">
        SUPERVISION SUMMARY <span className="font-normal text-muted-foreground">(Auto-calculated)</span>
      </p>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {/* Implementation Score */}
        <div className="rounded-lg bg-sky-50 p-4 dark:bg-sky-950/30">
          <div className="flex items-center gap-2">
            <ClipboardCheck className="h-6 w-6 text-sky-600" />
            <span className="text-2xl font-bold text-sky-700 dark:text-sky-300">{score == null ? "—" : `${score}%`}</span>
          </div>
          <p className="mt-1 text-xs font-medium text-foreground">Implementation Score</p>
          <span className="mt-2 inline-block rounded-md bg-sky-100 px-2 py-0.5 text-[11px] font-medium text-sky-700 dark:bg-sky-900/50 dark:text-sky-300">{scoreBand}</span>
        </div>

        {/* Risk Category */}
        <div className="rounded-lg bg-emerald-50 p-4 dark:bg-emerald-950/30">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-emerald-600" />
            <span className="text-2xl font-bold capitalize text-emerald-700 dark:text-emerald-300">{riskLabel}</span>
          </div>
          <p className="mt-1 text-xs font-medium text-foreground">Risk Category</p>
          <span className="mt-2 inline-block rounded-md bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300">{riskBand}</span>
        </div>

        {/* Individuals Treated */}
        <div className="rounded-lg bg-amber-50 p-4 dark:bg-amber-950/30">
          <div className="flex items-center gap-2">
            <Users className="h-6 w-6 text-amber-600" />
            <span className="text-2xl font-bold text-amber-700 dark:text-amber-300">{treated == null ? "—" : treated.toLocaleString()}</span>
          </div>
          <p className="mt-1 text-xs font-medium text-foreground">Individuals Treated</p>
          <span className="mt-2 inline-flex items-center gap-1 rounded-md bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:bg-amber-900/50 dark:text-amber-300"><CheckCircle2 className="h-3 w-3" />Recorded</span>
        </div>

        {/* Coverage Achieved */}
        <div className="rounded-lg bg-violet-50 p-4 dark:bg-violet-950/30">
          <div className="flex items-center gap-2">
            <Percent className="h-6 w-6 text-violet-600" />
            <span className="text-2xl font-bold text-violet-700 dark:text-violet-300">{coverage == null ? "—" : `${coverage}%`}</span>
          </div>
          <p className="mt-1 text-xs font-medium text-foreground">Coverage Achieved</p>
          <span className="mt-2 inline-flex items-center gap-1 rounded-md bg-violet-100 px-2 py-0.5 text-[11px] font-medium text-violet-700 dark:bg-violet-900/50 dark:text-violet-300"><CheckCircle2 className="h-3 w-3" />Computed</span>
        </div>
      </div>
    </div>
  );
}

const QUICK_ACTIONS: { icon: LucideIcon; label: string; target?: string; tint: string }[] = [
  { icon: Camera, label: "Capture Photo", target: "location_photos", tint: "text-emerald-600 bg-emerald-50" },
  { icon: Mic, label: "Record Audio", tint: "text-sky-600 bg-sky-50" },
  { icon: MapPin, label: "Update GPS", target: "geolocation", tint: "text-amber-600 bg-amber-50" },
  { icon: PenLine, label: "Add Signature", target: "supervisor_signature", tint: "text-violet-600 bg-violet-50" },
  { icon: Paperclip, label: "Add Attachment", target: "location_photos", tint: "text-rose-600 bg-rose-50" },
  { icon: StickyNote, label: "Field Note", target: "overall_summary", tint: "text-teal-600 bg-teal-50" },
];

/** Quick action shortcuts that jump to the relevant question. */
export const MdaQuickActions = memo(function MdaQuickActions() {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="mb-3 text-sm font-semibold text-foreground">QUICK ACTIONS</p>
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
        {QUICK_ACTIONS.map((a) => {
          const Icon = a.icon;
          return (
            <button
              key={a.label}
              onClick={() => {
                if (a.target && scrollToName(a.target)) return;
                toast({ title: a.label, description: "Scroll to the related question to complete this action." });
              }}
              className="flex flex-col items-center gap-2 rounded-lg border border-border p-3 text-center transition-colors hover:bg-muted/50"
            >
              <span className={`flex h-10 w-10 items-center justify-center rounded-lg ${a.tint}`}>
                <Icon className="h-5 w-5" />
              </span>
              <span className="text-[11px] font-medium leading-tight text-foreground">{a.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
});

/** Important reminder banner. */
export const MdaReminder = memo(function MdaReminder() {
  return (
    <div className="rounded-xl border border-sky-200 bg-sky-50 p-4 dark:border-sky-900 dark:bg-sky-950/30">
      <p className="text-sm font-semibold text-sky-800 dark:text-sky-300">Important Reminder</p>
      <p className="mt-1 text-xs text-sky-700/90 dark:text-sky-300/80">
        Ensure you observe all activities, verify data, take photo evidence and provide accurate feedback.
        Your supervision helps improve the quality and impact of MDA.
      </p>
    </div>
  );
}

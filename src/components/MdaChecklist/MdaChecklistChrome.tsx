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

import {
  buildAdaptiveCards,
  type FieldMeta,
  type Tint,
  type ResolvedCard,
} from "@/lib/mdaSummaryRules";

interface SummaryProps {
  responses: Record<string, any>;
  nameToId: Record<string, string>;
  /** Current form fields (name/label/type) so the summary can adapt to edits. */
  fields?: FieldMeta[];
}

const ICON_MAP: Record<ResolvedCard["icon"], LucideIcon> = {
  ClipboardCheck,
  ShieldCheck,
  Users,
  Percent,
  BarChart3,
};

const TINTS: Record<Tint, { box: string; icon: string; value: string; badge: string }> = {
  sky:     { box: "bg-sky-50 dark:bg-sky-950/30",         icon: "text-sky-600",     value: "text-sky-700 dark:text-sky-300",         badge: "bg-sky-100 text-sky-700 dark:bg-sky-900/50 dark:text-sky-300" },
  emerald: { box: "bg-emerald-50 dark:bg-emerald-950/30", icon: "text-emerald-600", value: "text-emerald-700 dark:text-emerald-300", badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300" },
  amber:   { box: "bg-amber-50 dark:bg-amber-950/30",     icon: "text-amber-600",   value: "text-amber-700 dark:text-amber-300",     badge: "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300" },
  violet:  { box: "bg-violet-50 dark:bg-violet-950/30",   icon: "text-violet-600",  value: "text-violet-700 dark:text-violet-300",   badge: "bg-violet-100 text-violet-700 dark:bg-violet-900/50 dark:text-violet-300" },
  rose:    { box: "bg-rose-50 dark:bg-rose-950/30",       icon: "text-rose-600",    value: "text-rose-700 dark:text-rose-300",       badge: "bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300" },
  teal:    { box: "bg-teal-50 dark:bg-teal-950/30",       icon: "text-teal-600",    value: "text-teal-700 dark:text-teal-300",       badge: "bg-teal-100 text-teal-700 dark:bg-teal-900/50 dark:text-teal-300" },
};

const NUMERIC_TYPES = new Set(["number", "integer", "decimal", "calculate", "range"]);
// Field name fragments that read naturally as a percentage / rate.
const PCT_HINTS = ["coverage", "percent", "percentage", "rate", "score", "ratio", "proportion"];

/**
 * Auto-calculated supervision summary cards.
 *
 * The summary adapts to form edits: a canonical card is only rendered when the
 * field it computes from still exists in the (possibly edited) form AND has a
 * value. When canonical cards drop out, their slots are filled with other
 * numeric fields discovered in the current form so the summary always stays
 * insightful — never showing a metric that can no longer be auto-computed.
 */
export function MdaSummaryCards({ responses, nameToId, fields }: SummaryProps) {
  const get = (name: string) => responses[nameToId[name]];
  // A field is present in the current form only when it still maps to a question.
  const has = (name: string) => Object.prototype.hasOwnProperty.call(nameToId, name);

  const cards: SummaryCard[] = [];
  const usedNames = new Set<string>();

  // ── Canonical card 1: Implementation Score ──────────────────────────────
  if (has("implementation_score")) {
    const score = num(get("implementation_score"));
    if (score != null) {
      usedNames.add("implementation_score");
      cards.push({
        key: "implementation_score",
        icon: ClipboardCheck,
        tint: "sky",
        value: `${score}%`,
        title: "Implementation Score",
        band: score >= 80 ? "Good" : score >= 60 ? "Fair" : "Needs Attention",
      });
    }
  }

  // ── Canonical card 2: Risk Category ─────────────────────────────────────
  if (has("risk_category")) {
    const risk = String(get("risk_category") || "").toLowerCase();
    if (risk) {
      usedNames.add("risk_category");
      cards.push({
        key: "risk_category",
        icon: ShieldCheck,
        tint: "emerald",
        value: risk.charAt(0).toUpperCase() + risk.slice(1),
        title: "Risk Category",
        band: risk === "low" ? "Acceptable" : risk === "medium" ? "Monitor" : risk === "high" ? "Action needed" : "Recorded",
      });
    }
  }

  // ── Canonical card 3: Individuals Treated ───────────────────────────────
  {
    const treatedName = has("individuals_treated") ? "individuals_treated" : has("persons_treated") ? "persons_treated" : null;
    const treated = treatedName ? num(get(treatedName)) : null;
    if (treatedName && treated != null) {
      usedNames.add(treatedName);
      cards.push({
        key: "treated",
        icon: Users,
        tint: "amber",
        value: treated.toLocaleString(),
        title: "Individuals Treated",
        band: "Recorded",
      });
    }
  }

  // ── Canonical card 4: Coverage Achieved ─────────────────────────────────
  {
    const covName = has("coverage_achieved") ? "coverage_achieved" : has("verified_coverage") ? "verified_coverage" : null;
    const coverage = covName ? num(get(covName)) : null;
    if (covName && coverage != null) {
      usedNames.add(covName);
      cards.push({
        key: "coverage",
        icon: Percent,
        tint: "violet",
        value: `${coverage}%`,
        title: "Coverage Achieved",
        band: "Computed",
      });
    }
  }

  // ── Auto-discovered replacements ────────────────────────────────────────
  // Fill remaining slots (target 4 cards) with other numeric fields in the form
  // that currently have a value, so a removed/retyped canonical metric is
  // replaced by something that CAN be auto-computed from the edited form.
  const replacementTints: Tint[] = ["teal", "rose", "amber", "violet", "sky", "emerald"];
  if (fields && fields.length > 0) {
    for (const f of fields) {
      if (cards.length >= 4) break;
      if (usedNames.has(f.name)) continue;
      if (!NUMERIC_TYPES.has(f.type)) continue;
      const v = num(get(f.name));
      if (v == null) continue;
      usedNames.add(f.name);
      const lname = (f.name + " " + f.label).toLowerCase();
      const isPct = PCT_HINTS.some((h) => lname.includes(h)) && v <= 100;
      cards.push({
        key: `auto_${f.name}`,
        icon: isPct ? Percent : BarChart3,
        tint: replacementTints[cards.length % replacementTints.length],
        value: isPct ? `${v}%` : v.toLocaleString(),
        title: stripTags(f.label) || f.name,
        band: "Auto-computed",
      });
    }
  }

  if (cards.length === 0) return null;

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="mb-3 text-sm font-semibold text-primary">
        SUPERVISION SUMMARY <span className="font-normal text-muted-foreground">(Auto-calculated)</span>
      </p>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((c) => {
          const t = TINTS[c.tint];
          const Icon = c.icon;
          return (
            <div key={c.key} className={`rounded-lg p-4 ${t.box}`}>
              <div className="flex items-center gap-2">
                <Icon className={`h-6 w-6 ${t.icon}`} />
                <span className={`text-2xl font-bold ${t.value}`}>{c.value}</span>
              </div>
              <p className="mt-1 text-xs font-medium text-foreground">{c.title}</p>
              <span className={`mt-2 inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium ${t.badge}`}>
                <CheckCircle2 className="h-3 w-3" />{c.band}
              </span>
            </div>
          );
        })}
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
});

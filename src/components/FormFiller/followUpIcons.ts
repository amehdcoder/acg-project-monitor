import {
  Activity,
  Baby,
  CalendarCheck,
  ClipboardCheck,
  ClipboardList,
  FlaskConical,
  HeartPulse,
  Home,
  Pill,
  RefreshCw,
  Ruler,
  Stethoscope,
  Syringe,
  Thermometer,
  Users,
  Utensils,
  type LucideIcon,
} from "lucide-react";

/**
 * Maps a follow-up question group to a contextually appropriate icon.
 * Matching is keyword-based against the group's label/name so each
 * follow-up module renders with a meaningful, distinct icon.
 */
const ICON_RULES: { keywords: string[]; icon: LucideIcon }[] = [
  { keywords: ["vaccin", "immuniz", "syringe", "injection"], icon: Syringe },
  { keywords: ["medic", "drug", "treatment", "dose", "pill", "therapy"], icon: Pill },
  { keywords: ["lab", "test", "sample", "specimen", "result", "diagnos"], icon: FlaskConical },
  { keywords: ["temperature", "fever"], icon: Thermometer },
  { keywords: ["vital", "bp", "pressure", "pulse", "heart"], icon: HeartPulse },
  { keywords: ["symptom", "exam", "clinical", "assessment", "check-up", "checkup"], icon: Stethoscope },
  { keywords: ["pregnan", "anc", "antenatal", "birth", "delivery", "newborn", "infant", "baby", "child"], icon: Baby },
  { keywords: ["nutrition", "feed", "diet", "meal", "food"], icon: Utensils },
  { keywords: ["measure", "height", "weight", "muac", "anthropom"], icon: Ruler },
  { keywords: ["household", "house", "home", "dwelling"], icon: Home },
  { keywords: ["member", "family", "contact", "people", "person"], icon: Users },
  { keywords: ["visit", "round", "appointment", "schedule"], icon: CalendarCheck },
  { keywords: ["monitor", "progress", "status", "activity"], icon: Activity },
  { keywords: ["outcome", "close", "complete", "final", "summary"], icon: ClipboardCheck },
  { keywords: ["survey", "questionnaire", "record", "register"], icon: ClipboardList },
];

export const getFollowUpIcon = (label?: string, name?: string): LucideIcon => {
  const haystack = `${label || ""} ${name || ""}`.toLowerCase();
  for (const rule of ICON_RULES) {
    if (rule.keywords.some((k) => haystack.includes(k))) return rule.icon;
  }
  return RefreshCw;
};

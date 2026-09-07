/**
 * Live-schema overlay for the See Clear checklist and dashboard.
 *
 * The checklist ships with a code-defined question set (see `definition.ts`) so
 * it works fully offline. Whenever the linked KoboToolbox form is edited —
 * question wording changed, options renamed, questions added or removed — the
 * snapshot stored in `seeclear_kobo_schema` becomes the source of truth.
 *
 * This module merges the live snapshot over the static definition:
 *   • question labels follow the live Kobo labels
 *   • select option labels follow the live Kobo choice lists
 *   • Yes/No or equipment questions added in Kobo appear automatically
 *   • questions deleted in Kobo disappear from the checklist
 *
 * If no snapshot exists (or the sync failed), everything falls back to the
 * static definition, so the checklist never breaks.
 */
import type { SchemaField } from "@/hooks/useSeeClearKoboSchema";
import {
  GENERAL_QUESTIONS, HR_QUESTIONS, INFRA_QUESTIONS, EQUIPMENT_ITEMS,
  FACILITY_LEVELS, OWNERSHIP_TYPES, FUNCTIONAL_STATUS,
  CHALLENGE_OPTIONS, RECOMMENDATION_OPTIONS,
  type YesNoQ, type EquipItem,
} from "@/lib/seeclear/definition";

export type Choices = Record<string, { value: string; label: string }[]>;
export interface Option { value: string; label: string }

/** Strip Kobo markdown/number prefixes so labels read cleanly in the app. */
const clean = (s: string) =>
  s.replace(/\*\*/g, "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();

const SECTION_PREFIX: Record<string, RegExp> = {
  hr: /^hr_/,
  infra: /^in_/,
};

/** Yes/No questions of one checklist section, reconciled with the live form. */
function mergeYesNo(
  base: YesNoQ[],
  fields: SchemaField[],
  sectionKey: "general" | "hr" | "infra",
): YesNoQ[] {
  if (!fields.length) return base;
  const live = new Map(
    fields.filter((f) => f.list_name === "yes_no").map((f) => [f.name, f]),
  );
  // Keep the static order for known questions that still exist in Kobo.
  const kept = base
    .filter((q) => live.has(q.key))
    .map((q) => ({ ...q, label: clean(live.get(q.key)!.label) || q.label }));
  const known = new Set(base.map((q) => q.key));
  // Questions added in Kobo: attach them to the section their name belongs to.
  const prefix = SECTION_PREFIX[sectionKey];
  const added: YesNoQ[] = [];
  live.forEach((f, name) => {
    if (known.has(name)) return;
    const belongs = prefix
      ? prefix.test(name)
      : !SECTION_PREFIX.hr.test(name) && !SECTION_PREFIX.infra.test(name);
    if (!belongs) return;
    added.push({ key: name, label: clean(f.label) || name, good: "yes" });
  });
  const merged = [...kept, ...added];
  return merged.length ? merged : base;
}

/** Equipment items, reconciled with the live `equip_status` questions. */
function mergeEquipment(fields: SchemaField[]): EquipItem[] {
  if (!fields.length) return EQUIPMENT_ITEMS;
  const live = new Map(
    fields.filter((f) => f.list_name === "equip_status").map((f) => [f.name, f]),
  );
  if (!live.size) return EQUIPMENT_ITEMS;
  const known = new Set(EQUIPMENT_ITEMS.map((i) => i.key));
  const kept = EQUIPMENT_ITEMS
    .filter((i) => live.has(i.key))
    .map((i) => ({ ...i, label: clean(live.get(i.key)!.label) || i.label }));
  const added: EquipItem[] = [];
  live.forEach((f, name) => {
    if (known.has(name)) return;
    added.push({ key: name, label: clean(f.label) || name, group: "advanced" });
  });
  return [...kept, ...added];
}

/** Option list from the live choices, falling back to the static list. */
function mergeOptions(choices: Choices, listName: string, base: Option[]): Option[] {
  const live = choices?.[listName];
  if (!live?.length) return base;
  return live.map((o) => ({ value: o.value, label: clean(o.label) || o.value }));
}

/** Free-text chip lists (challenges / recommendations) from the live choices. */
function mergeChips(choices: Choices, listName: string, base: string[]): string[] {
  const live = choices?.[listName];
  if (!live?.length) return base;
  return live.map((o) => clean(o.label) || o.value);
}

export interface SeeClearLive {
  general: YesNoQ[];
  hr: YesNoQ[];
  infra: YesNoQ[];
  equipment: EquipItem[];
  facilityLevels: Option[];
  ownershipTypes: Option[];
  functionalStatus: Option[];
  challengeOptions: string[];
  recommendationOptions: string[];
  /** Live question label for any Kobo field name (falls back to the name). */
  labelFor: (name: string) => string;
  /** Live answer label for a coded value on a question. */
  answerLabel: (name: string, value: string) => string;
  /** True when a live snapshot is driving the form. */
  isLive: boolean;
}

export function buildSeeClearLive(fields: SchemaField[], choices: Choices): SeeClearLive {
  const isLive = Array.isArray(fields) && fields.length > 0;
  const byName = new Map((fields ?? []).map((f) => [f.name, f]));

  return {
    general: mergeYesNo(GENERAL_QUESTIONS, fields ?? [], "general"),
    hr: mergeYesNo(HR_QUESTIONS, fields ?? [], "hr"),
    infra: mergeYesNo(INFRA_QUESTIONS, fields ?? [], "infra"),
    equipment: mergeEquipment(fields ?? []),
    facilityLevels: mergeOptions(choices, "facility_level", FACILITY_LEVELS),
    ownershipTypes: mergeOptions(choices, "ownership", OWNERSHIP_TYPES),
    functionalStatus: mergeOptions(choices, "functional_status", FUNCTIONAL_STATUS),
    challengeOptions: mergeChips(choices, "challenges", CHALLENGE_OPTIONS),
    recommendationOptions: mergeChips(choices, "recommendations", RECOMMENDATION_OPTIONS),
    labelFor: (name: string) => clean(byName.get(name)?.label ?? "") || name.replace(/_/g, " "),
    answerLabel: (name: string, value: string) => {
      const list = byName.get(name)?.list_name;
      const opt = list ? choices?.[list]?.find((o) => o.value === value) : undefined;
      return opt ? clean(opt.label) || value : value;
    },
    isLive,
  };
}

export default buildSeeClearLive;

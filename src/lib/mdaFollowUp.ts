import type { FormGroup } from "@/components/FormBuilder/types";

export const MDA_FOLLOWUP_COMPLETION = "follow_up_on_mda_completion";
export const MDA_FOLLOWUP_COMMODITIES = "follow_up_on_mda_commodities";
export const MDA_FOLLOWUP_ADVERSE = "adverse_reaction_management";

export const MDA_FOLLOWUP_GROUP_NAMES = new Set([
  MDA_FOLLOWUP_COMPLETION,
  MDA_FOLLOWUP_COMMODITIES,
  MDA_FOLLOWUP_ADVERSE,
]);

const FOLLOWUP_ALIASES: Record<string, string> = {
  [MDA_FOLLOWUP_COMPLETION]: MDA_FOLLOWUP_COMPLETION,
  followup_on_mda_completion: MDA_FOLLOWUP_COMPLETION,
  follow_up_mda_completion: MDA_FOLLOWUP_COMPLETION,
  mda_completion_follow_up: MDA_FOLLOWUP_COMPLETION,
  mda_completion: MDA_FOLLOWUP_COMPLETION,

  [MDA_FOLLOWUP_COMMODITIES]: MDA_FOLLOWUP_COMMODITIES,
  followup_on_mda_commodities: MDA_FOLLOWUP_COMMODITIES,
  follow_up_mda_commodities: MDA_FOLLOWUP_COMMODITIES,
  mda_commodities_follow_up: MDA_FOLLOWUP_COMMODITIES,
  mda_commodities: MDA_FOLLOWUP_COMMODITIES,
  // Common typo from requirements/conversation history — keep harmlessly supported.
  follow_up_on_mda_communities: MDA_FOLLOWUP_COMMODITIES,
  followup_on_mda_communities: MDA_FOLLOWUP_COMMODITIES,
  follow_up_mda_communities: MDA_FOLLOWUP_COMMODITIES,

  [MDA_FOLLOWUP_ADVERSE]: MDA_FOLLOWUP_ADVERSE,
  follow_up_on_adverse_reactions: MDA_FOLLOWUP_ADVERSE,
  followup_on_adverse_reactions: MDA_FOLLOWUP_ADVERSE,
  follow_up_on_mda_adverse_reactions: MDA_FOLLOWUP_ADVERSE,
  adverse_reactions_follow_up: MDA_FOLLOWUP_ADVERSE,
  adverse_reactions: MDA_FOLLOWUP_ADVERSE,
};

export function normalizeMdaGroupKey(value?: string | null): string {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/^\d+[\s._:-]+/, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/**
 * Return the canonical MDA follow-up group name for a group, supporting older
 * saved copies where names/labels may have been edited, hyphenated, or created
 * from a slightly different template slug.
 */
export function getMdaFollowUpGroupName(group?: Pick<FormGroup, "name" | "label"> | null): string | null {
  if (!group) return null;
  const keys = [normalizeMdaGroupKey(group.name), normalizeMdaGroupKey(group.label)].filter(Boolean);

  for (const key of keys) {
    if (FOLLOWUP_ALIASES[key]) return FOLLOWUP_ALIASES[key];
  }

  for (const key of keys) {
    const isFollow = key.includes("follow") || key.includes("management");
    if (isFollow && key.includes("mda") && key.includes("completion")) return MDA_FOLLOWUP_COMPLETION;
    if (isFollow && key.includes("mda") && (key.includes("commodit") || key.includes("communit"))) return MDA_FOLLOWUP_COMMODITIES;
    if (key.includes("adverse") && (isFollow || key.includes("reaction"))) return MDA_FOLLOWUP_ADVERSE;
  }

  return null;
}

export function isMdaFollowUpGroup(group?: Pick<FormGroup, "name" | "label"> | null): boolean {
  return !!getMdaFollowUpGroupName(group);
}

export function hasMdaFollowUpGroups(groups?: Array<Pick<FormGroup, "name" | "label">> | null): boolean {
  return !!groups?.some(isMdaFollowUpGroup);
}

export function isMdaChecklistLike(args: {
  settings?: Record<string, any> | null;
  formName?: string | null;
  groups?: Array<Pick<FormGroup, "name" | "label">> | null;
}): boolean {
  const settings = args.settings || {};
  const name = String(args.formName || "").toLowerCase();
  return (
    !!settings.isMdaChecklist ||
    !!settings.n ||
    name.includes("integrated mda supervisory checklist") ||
    name.includes("mda supervisory checklist") ||
    hasMdaFollowUpGroups(args.groups)
  );
}

export function canRoleBuildMdaFollowUps(args: {
  role?: string | null;
  isOwnerLevel?: boolean | null;
}): boolean {
  return args.role === "super_admin" || args.role === "systems_admin" || !!args.isOwnerLevel;
}
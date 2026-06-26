// Utilities for copying the Integrated MDA Supervisory Checklist from one
// project into another. The copied checklist remains 100% editable in the
// destination project (it is a standard flat groups/questions payload), and
// can optionally be restricted to a single state so field users only ever
// pick the supervision location/cascade within that state.

import type { FormGroup, Question, QuestionOption } from "@/components/FormBuilder/types";
import { getAllStates } from "@/lib/nigeriaAdminData";

/** Match the slug rule used when the checklist cascade options were built. */
export const slugifyState = (s: string): string =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

export interface StateChoice {
  /** Option value stored on the State question (e.g. "jigawa"). */
  value: string;
  /** Human label (e.g. "Jigawa"). */
  label: string;
}

/** All Nigerian states as selectable destination-state choices. */
export function getStateChoices(): StateChoice[] {
  return getAllStates().map((name) => ({ value: slugifyState(name), label: name }));
}

const isGroup = (g: any): g is FormGroup =>
  g && typeof g === "object" && Array.isArray(g.questions);

function restrictQuestionToState(q: Question, stateValue: string): Question {
  const opts = (q.options ?? []) as QuestionOption[];
  if (q.name === "state") {
    const filtered = opts.filter((o) => o.value === stateValue);
    return {
      ...q,
      options: filtered.length ? filtered : opts,
      // Preselect & lock the destination state so users "just" pick the
      // location cascade beneath it.
      defaultValue: stateValue,
      readOnly: true,
    } as Question;
  }
  if (q.name === "lga") {
    return { ...q, options: opts.filter((o) => o.parentValue === stateValue) };
  }
  if (q.name === "ward") {
    const prefix = `${stateValue}__`;
    return { ...q, options: opts.filter((o) => String(o.parentValue ?? "").startsWith(prefix)) };
  }
  return q;
}

/**
 * Return a deep clone of the checklist groups, with the State/LGA/Ward cascade
 * restricted to a single state (and that state preselected + locked).
 * Passing an empty/undefined state returns an unrestricted clone.
 */
export function restrictChecklistToState(
  questions: FormGroup[],
  stateValue?: string | null,
): FormGroup[] {
  const cloned: FormGroup[] = JSON.parse(JSON.stringify(questions ?? []));
  if (!stateValue) return cloned;
  return cloned.map((g) => {
    if (!isGroup(g)) return g;
    return { ...g, questions: g.questions.map((q) => restrictQuestionToState(q as Question, stateValue)) };
  });
}

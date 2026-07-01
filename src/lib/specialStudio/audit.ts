// Special Form Studio — edit history (audit) helpers.
//
// Computes a human-readable, field-level diff between two versions of a form's
// sections/settings, and records it to `special_form_studio_audit`.

import { supabase } from "@/integrations/supabase/client";
import type { FormGroup, Question } from "@/components/FormBuilder/types";

export interface StudioChange {
  field: string;
  kind: "added" | "removed" | "modified" | "meta";
  detail: string;
}

function flat(sections: FormGroup[]): Map<string, { q: Question; section: string }> {
  const m = new Map<string, { q: Question; section: string }>();
  for (const s of sections) for (const q of s.questions) m.set(q.id, { q, section: s.label });
  return m;
}

function summarizeQuestion(q: Question): string {
  const bits: string[] = [q.type];
  if (q.required) bits.push("required");
  if (q.relevant) bits.push("conditional");
  if (q.validation && Object.keys(q.validation).length) bits.push("validated");
  return bits.join(", ");
}

export function diffForms(
  prev: { sections: FormGroup[]; name: string; theme?: unknown } | null,
  next: { sections: FormGroup[]; name: string; theme?: unknown },
): StudioChange[] {
  const changes: StudioChange[] = [];
  if (!prev) {
    changes.push({ field: next.name, kind: "added", detail: `Created form with ${flat(next.sections).size} field(s)` });
    return changes;
  }
  if (prev.name !== next.name) {
    changes.push({ field: "Form name", kind: "meta", detail: `"${prev.name}" → "${next.name}"` });
  }
  if (JSON.stringify(prev.theme) !== JSON.stringify(next.theme)) {
    changes.push({ field: "Theme / styling", kind: "meta", detail: "Appearance updated" });
  }
  const a = flat(prev.sections);
  const b = flat(next.sections);
  for (const [id, { q, section }] of b) {
    const before = a.get(id);
    if (!before) {
      changes.push({ field: q.label || "(untitled)", kind: "added", detail: `Added to "${section}" (${summarizeQuestion(q)})` });
      continue;
    }
    const bq = before.q;
    const deltas: string[] = [];
    if (bq.label !== q.label) deltas.push(`label "${bq.label}" → "${q.label}"`);
    if (bq.required !== q.required) deltas.push(q.required ? "made required" : "made optional");
    if ((bq.relevant || "") !== (q.relevant || "")) deltas.push("visibility rule changed");
    if (JSON.stringify(bq.validation || {}) !== JSON.stringify(q.validation || {})) deltas.push("validation rule changed");
    if (JSON.stringify(bq.options || []) !== JSON.stringify(q.options || [])) deltas.push("options changed");
    if (before.section !== section) deltas.push(`moved to "${section}"`);
    if (deltas.length) changes.push({ field: q.label || "(untitled)", kind: "modified", detail: deltas.join("; ") });
  }
  for (const [id, { q, section }] of a) {
    if (!b.has(id)) changes.push({ field: q.label || "(untitled)", kind: "removed", detail: `Removed from "${section}"` });
  }
  return changes;
}

export async function recordStudioAudit(params: {
  formId: string | null;
  projectId: string | null;
  formName: string;
  action: "created" | "updated" | "published";
  changes: StudioChange[];
  userId?: string | null;
  userName?: string | null;
  userEmail?: string | null;
}): Promise<void> {
  try {
    const summary = params.changes.length
      ? `${params.changes.length} change(s): ${params.changes.slice(0, 3).map((c) => c.field).join(", ")}${params.changes.length > 3 ? "…" : ""}`
      : "No field changes";
    await supabase.from("special_form_studio_audit").insert({
      form_id: params.formId,
      project_id: params.projectId,
      form_name: params.formName,
      action: params.action,
      summary,
      changes: params.changes as unknown as object,
      changed_by: params.userId || null,
      changed_by_name: params.userName || null,
      changed_by_email: params.userEmail || null,
    } as never);
  } catch {
    // Non-blocking — never fail a save because history logging failed.
  }
}

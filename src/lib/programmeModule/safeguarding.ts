// Restricted safeguarding module.
//
// Detailed safeguarding narratives, concerns and actions never live in the
// general beneficiary record. They are stored here and are readable only by
// people an administrator has appointed as safeguarding officers for the
// project — ordinary administrators and facility focal persons cannot read
// them at all, which is enforced in the database, not in this code.

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface SafeguardingConcernRow {
  id: string;
  project_id: string;
  module_id: string | null;
  beneficiary_id: string | null;
  beneficiary_label: string | null;
  facility_id: string | null;
  concern_date: string;
  categories: string[];
  severity: string;
  immediate_action: string | null;
  narrative: string;
  action_taken: string | null;
  referral_made: string[];
  consent_obtained: string | null;
  status: string;
  outcome: string | null;
  closed_at: string | null;
  reported_by: string | null;
  assigned_to: string | null;
  created_at: string;
  updated_at: string;
  /** True when the narrative fields live only inside the encrypted vault. */
  is_encrypted?: boolean;
  vault_cipher?: unknown;
}

export interface SafeguardingNoteRow {
  id: string;
  concern_id: string;
  project_id: string;
  note: string;
  author_id: string | null;
  created_at: string;
  cipher?: unknown;
}

export const CONCERN_CATEGORIES = [
  "Neglect", "Abuse", "Exploitation", "Violence", "Discrimination", "Stigma",
  "Financial exploitation", "Other",
];

export const SEVERITIES = [
  { value: "low", label: "Low — monitor" },
  { value: "moderate", label: "Moderate — act this week" },
  { value: "high", label: "High — act today" },
  { value: "critical", label: "Critical — immediate protection risk" },
];

export const SEVERITY_LABEL: Record<string, string> =
  Object.fromEntries(SEVERITIES.map((s) => [s.value, s.label]));

export const IMMEDIATE_ACTIONS = ["No", "Yes", "Urgent", "Referred"];

export const REFERRAL_ACTIONS = [
  "Safeguarding focal person", "Health facility", "Social welfare service",
  "Protection service", "Community support", "Emergency service", "Other",
];

export const CONSENT_OPTIONS = [
  "Consent given by the beneficiary",
  "Consent given by parent/guardian",
  "Consent declined — acted on duty of care",
  "Unable to obtain consent",
  "Not applicable",
];

export const CONCERN_STATUSES = [
  { value: "open", label: "Open" },
  { value: "in_progress", label: "Under investigation" },
  { value: "referred", label: "Referred on" },
  { value: "closed", label: "Closed" },
];

export const CONCERN_STATUS_LABEL: Record<string, string> =
  Object.fromEntries(CONCERN_STATUSES.map((s) => [s.value, s.label]));

/** True when the signed-in user is an active safeguarding officer here. */
export const useIsSafeguardingOfficer = (projectId?: string) => {
  const [isOfficer, setIsOfficer] = useState(false);
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!projectId) { if (!cancelled) { setIsOfficer(false); setLoading(false); } return; }
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) { if (!cancelled) { setIsOfficer(false); setLoading(false); } return; }
      const { data } = await supabase.rpc("is_safeguarding_officer" as never, {
        _user_id: auth.user.id, _project_id: projectId,
      } as never);
      if (cancelled) return;
      setIsOfficer(Boolean(data));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [projectId, revision]);

  return { isOfficer, loading, reload: () => setRevision((value) => value + 1) };
};

const asArray = (v: unknown): string[] =>
  Array.isArray(v) ? v.map((x) => String(x)) : [];

const normalize = (r: Record<string, unknown>): SafeguardingConcernRow => ({
  ...(r as unknown as SafeguardingConcernRow),
  categories: asArray(r.categories),
  referral_made: asArray(r.referral_made),
});

/** Concerns on a project — returns nothing unless the reader is an officer. */
export const useSafeguardingConcerns = (projectId?: string, enabled = true) => {
  const [concerns, setConcerns] = useState<SafeguardingConcernRow[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!projectId || !enabled) { setConcerns([]); return; }
    setLoading(true);
    const { data } = await supabase
      .from("safeguarding_concerns" as never)
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(500);
    setConcerns(((data as unknown as Record<string, unknown>[]) || []).map(normalize));
    setLoading(false);
  }, [projectId, enabled]);

  useEffect(() => { void load(); }, [load]);

  return { concerns, loading, reload: load };
};

export interface ConcernInput {
  project_id: string;
  module_id?: string | null;
  beneficiary_id?: string | null;
  beneficiary_label?: string | null;
  facility_id?: string | null;
  concern_date: string;
  categories: string[];
  severity: string;
  immediate_action?: string | null;
  narrative: string;
  action_taken?: string | null;
  referral_made: string[];
  consent_obtained?: string | null;
  status: string;
  outcome?: string | null;
}

export const saveConcern = async (input: ConcernInput, existingId?: string) => {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("You must be signed in.");

  if (existingId) {
    const { error } = await supabase
      .from("safeguarding_concerns" as never)
      .update({
        ...input,
        closed_at: input.status === "closed" ? new Date().toISOString() : null,
      } as never)
      .eq("id", existingId);
    if (error) throw error;
    await logAccess(input.project_id, existingId, "updated");
    return existingId;
  }

  const { data, error } = await supabase
    .from("safeguarding_concerns" as never)
    .insert({ ...input, reported_by: auth.user.id } as never)
    .select("id")
    .single();
  if (error) throw error;
  const id = (data as unknown as { id: string }).id;
  await logAccess(input.project_id, id, "created");
  return id;
};

export const logAccess = async (projectId: string, concernId: string | null, action: string) => {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return;
  await supabase.from("safeguarding_access_log" as never).insert({
    project_id: projectId, concern_id: concernId, user_id: auth.user.id, action,
  } as never);
};

export const useSafeguardingNotes = (concernId?: string) => {
  const [notes, setNotes] = useState<SafeguardingNoteRow[]>([]);

  const load = useCallback(async () => {
    if (!concernId) { setNotes([]); return; }
    const { data } = await supabase
      .from("safeguarding_notes" as never)
      .select("*")
      .eq("concern_id", concernId)
      .order("created_at", { ascending: false })
      .limit(200);
    setNotes((data as unknown as SafeguardingNoteRow[]) || []);
  }, [concernId]);

  useEffect(() => { void load(); }, [load]);

  return { notes, reload: load };
};

export const addNote = async (concernId: string, projectId: string, note: string) => {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("You must be signed in.");
  const { error } = await supabase.from("safeguarding_notes" as never).insert({
    concern_id: concernId, project_id: projectId, note, author_id: auth.user.id,
  } as never);
  if (error) throw error;
};

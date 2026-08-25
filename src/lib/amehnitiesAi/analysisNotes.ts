/**
 * analysisNotes — durable, searchable knowledge captured from AI analysis runs.
 *
 * A note records what was asked, what the analysis found, the code and output
 * that produced it, and the community scope it applies to (State → LGA → Ward →
 * Community). Notes are linked to the dataset they came from, and are visible
 * only to their author, that author's project team, or an admin (enforced by
 * RLS on `ai_analysis_notes` / `ai_datasets`).
 *
 * Every saved note is also pushed into the AI's long-term vector memory so the
 * assistant recalls prior findings in later conversations.
 */
import { supabase } from "@/integrations/supabase/client";
import type { ChartSpec } from "./pyodideSandbox";
import { indexMemory } from "./frontierClient";

export interface DatasetRef {
  id: string;
  name: string;
  row_count: number;
}

export interface AnalysisNoteInput {
  title: string;
  question?: string;
  findings: string;
  code?: string | null;
  stdout?: string | null;
  chart?: ChartSpec | null;
  tags?: string[];
  datasetId?: string | null;
  datasetName?: string | null;
  conversationId?: string | null;
  projectId?: string | null;
  scope?: {
    state?: string | null;
    lga?: string | null;
    ward?: string | null;
    community?: string | null;
  };
}

export interface AnalysisNote {
  id: string;
  title: string;
  question: string | null;
  findings: string;
  tags: string[];
  dataset_name: string | null;
  scope_state: string | null;
  scope_lga: string | null;
  scope_ward: string | null;
  scope_community: string | null;
  created_at: string;
}

/** Registers an uploaded dataset so notes can point at a durable row. */
export async function registerDataset(input: {
  name: string;
  fileType?: string;
  kind?: string;
  rowCount?: number;
  columns?: string[];
  summary?: string;
  conversationId?: string | null;
  projectId?: string | null;
}): Promise<DatasetRef | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Sign in to save datasets.");

  const { data, error } = await supabase
    .from("ai_datasets")
    .insert({
      name: input.name.slice(0, 200),
      file_type: input.fileType ?? null,
      kind: input.kind ?? "table",
      row_count: input.rowCount ?? 0,
      columns: (input.columns ?? []) as unknown as never,
      summary: input.summary ?? null,
      conversation_id: input.conversationId ?? null,
      project_id: input.projectId ?? null,
      created_by: user.id,
    })
    .select("id,name,row_count")
    .single();
  if (error) throw error;
  return data as DatasetRef;
}

const scopeLine = (s: AnalysisNoteInput["scope"]) =>
  [s?.state && `State: ${s.state}`, s?.lga && `LGA: ${s.lga}`, s?.ward && `Ward: ${s.ward}`,
   s?.community && `Community: ${s.community}`].filter(Boolean).join(" · ");

/** Saves one analysis note and mirrors it into long-term vector memory. */
export async function saveAnalysisNote(input: AnalysisNoteInput): Promise<AnalysisNote> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Sign in to save notes.");

  const { data, error } = await supabase
    .from("ai_analysis_notes")
    .insert({
      title: input.title.slice(0, 200),
      question: input.question?.slice(0, 4000) ?? null,
      findings: input.findings.slice(0, 20000),
      code: input.code ?? null,
      stdout: input.stdout?.slice(0, 20000) ?? null,
      chart: (input.chart ?? null) as unknown as never,
      tags: input.tags ?? [],
      dataset_id: input.datasetId ?? null,
      dataset_name: input.datasetName ?? null,
      conversation_id: input.conversationId ?? null,
      project_id: input.projectId ?? null,
      scope_state: input.scope?.state ?? null,
      scope_lga: input.scope?.lga ?? null,
      scope_ward: input.scope?.ward ?? null,
      scope_community: input.scope?.community ?? null,
      created_by: user.id,
    })
    .select("id,title,question,findings,tags,dataset_name,scope_state,scope_lga,scope_ward,scope_community,created_at")
    .single();
  if (error) throw error;

  // Mirror into vector memory (best effort — the note itself is already saved).
  try {
    const scope = scopeLine(input.scope);
    await indexMemory([{
      kind: "analysis_note",
      title: input.title,
      source_id: `note:${data.id}`,
      content: [
        `ANALYSIS NOTE — ${input.title}`,
        scope && `Scope: ${scope}`,
        input.datasetName && `Dataset: ${input.datasetName}`,
        input.question && `Question: ${input.question}`,
        `Findings: ${input.findings}`,
        input.stdout && `Computed output:\n${input.stdout.slice(0, 4000)}`,
      ].filter(Boolean).join("\n"),
      metadata: {
        note_id: data.id,
        dataset_id: input.datasetId ?? null,
        project_id: input.projectId ?? null,
        ...input.scope,
      },
    }]);
  } catch (e) {
    console.warn("Note saved, but memory indexing failed:", (e as Error)?.message);
  }

  return data as unknown as AnalysisNote;
}

/** Full-text + scope search over the notes the caller is allowed to see. */
export async function searchAnalysisNotes(params: {
  query?: string;
  state?: string;
  lga?: string;
  datasetId?: string;
  limit?: number;
} = {}): Promise<AnalysisNote[]> {
  let q = supabase
    .from("ai_analysis_notes")
    .select("id,title,question,findings,tags,dataset_name,scope_state,scope_lga,scope_ward,scope_community,created_at")
    .order("created_at", { ascending: false })
    .limit(params.limit ?? 50);

  const term = params.query?.trim();
  if (term) {
    const safe = term.replace(/[%,()]/g, " ");
    q = q.or(`title.ilike.%${safe}%,findings.ilike.%${safe}%,question.ilike.%${safe}%`);
  }
  if (params.state) q = q.eq("scope_state", params.state);
  if (params.lga) q = q.eq("scope_lga", params.lga);
  if (params.datasetId) q = q.eq("dataset_id", params.datasetId);

  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as unknown as AnalysisNote[];
}

export async function deleteAnalysisNote(id: string): Promise<void> {
  const { error } = await supabase.from("ai_analysis_notes").delete().eq("id", id);
  if (error) throw error;
}

/** Projects the signed-in user is assigned to — used to scope a note to a team. */
export async function listMyProjects(): Promise<{ id: string; name: string }[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data, error } = await supabase
    .from("user_project_assignments")
    .select("project_id, projects(id,name)")
    .eq("user_id", user.id);
  if (error) return [];
  return (data ?? [])
    .map((r: any) => r.projects)
    .filter((p: any) => p?.id)
    .map((p: any) => ({ id: p.id as string, name: (p.name as string) ?? "Project" }));
}

export type ExternalProvider = "google" | "microsoft" | "mentimeter" | "other";
export interface DetectedSource { provider: ExternalProvider; formId: string; problem?: string }

/** Recognise a pasted form link (or bare ID) and pull out the provider's form ID. */
export function detectExternalSource(raw: string, fallback: ExternalProvider = "google"): DetectedSource {
  const value = raw.trim();
  if (!/^https?:\/\//i.test(value)) return { provider: fallback, formId: value };
  let url: URL;
  try { url = new URL(value); } catch { return { provider: fallback, formId: "", problem: "This link is not a valid web address." }; }
  const host = url.hostname.toLowerCase();
  if (host === "forms.gle") return { provider: "google", formId: "", problem: "Short Google links cannot be read. Open the form in Google Forms and paste the link from the editor (it contains /edit)." };
  if (host.endsWith("docs.google.com")) {
    if (/\/forms\/d\/e\//.test(url.pathname)) return { provider: "google", formId: "", problem: "This is the respondent link. Paste the link from the Google Forms editor (it contains /edit)." };
    const id = url.pathname.match(/\/forms\/d\/([a-zA-Z0-9_-]{5,})/)?.[1];
    return id ? { provider: "google", formId: id } : { provider: "google", formId: "", problem: "No Google form ID was found in this link." };
  }
  if (/(^|\.)forms\.(office|microsoft)\.com$/.test(host) || host.endsWith("forms.office365.us")) {
    const id = url.searchParams.get("id") ?? url.searchParams.get("FormId") ?? url.pathname.match(/\/r\/([a-zA-Z0-9_-]{5,})/)?.[1] ?? "";
    return id && /^[a-zA-Z0-9_-]{5,255}$/.test(id) ? { provider: "microsoft", formId: id } : { provider: "microsoft", formId: "", problem: "Paste the Microsoft Forms share or design link that contains the form ID." };
  }
  if (/(^|\.)menti(meter)?\.com$/.test(host)) return { provider: "mentimeter", formId: url.pathname.split("/").filter(Boolean).pop() ?? "" };
  return { provider: "other", formId: "", problem: "This form platform is not recognised. Use a direct ID from an automated source." };
}

export const PARTICIPANT_FIELDS = [
  { id: "name", label: "Name" },
  { id: "designation", label: "Designation" },
  { id: "lga", label: "LGA" },
  { id: "state", label: "State" },
  { id: "cohort", label: "Cohort" },
  { id: "participant_key", label: "Participant ID / email" },
] as const;

/** Build the participant display label from the fields an Admin chose, in order. */
export function participantLabel(row: Record<string, unknown>, fields: string[] | null | undefined): string {
  const chosen = fields?.length ? fields : ["name"];
  const parts = chosen.map(f => {
    const v = row[f];
    return typeof v === "string" ? (f === "participant_key" ? v.replace(/^(app|external|kobo):/, "") : v).trim() : "";
  }).filter(Boolean);
  return parts.join(" · ") || String(row.name ?? "Unnamed participant");
}

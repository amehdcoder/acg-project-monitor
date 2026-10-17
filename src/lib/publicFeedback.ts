/** Published links must never depend on the editor's temporary preview origin. */
const PUBLIC_ORIGIN = "https://handscollect.lovable.app";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FEEDBACK_PATH = /^\/(feedback|ccff)(\/|$)/i;

type FeedbackLocation = { pathname: string; search: string; hash: string };

export function isPublicFeedbackLocation(location: FeedbackLocation): boolean {
  return FEEDBACK_PATH.test(location.pathname) ||
    (location.pathname === "/" && FEEDBACK_PATH.test(location.hash.replace(/^#/, "")));
}

/** Accept older hash/query links but never infer a project or leave the public form. */
export function feedbackProjectId(location: FeedbackLocation): string | undefined {
  const hashPath = location.hash.replace(/^#/, "");
  const source = FEEDBACK_PATH.test(location.pathname)
    ? `${location.pathname}${location.search}` : hashPath;
  const [path, query = ""] = source.split("?");
  const match = /^\/(?:feedback|ccff)(?:\/([^/]+))?\/?$/i.exec(path);
  if (!match) return undefined;
  const params = new URLSearchParams(query);
  let candidate = match[1] || params.get("project_id") || params.get("projectId") || params.get("project");
  try { candidate = candidate ? decodeURIComponent(candidate) : null; } catch { return undefined; }
  return candidate && UUID.test(candidate) ? candidate : undefined;
}

export function publicFeedbackUrl(projectId: string, origin: string): string {
  if (!UUID.test(projectId)) throw new Error("A valid project is required for a feedback link");
  const current = new URL(origin);
  const published = ["handscollect.lovable.app", "www.amehnities.org", "amehnities.org"];
  const base = current.protocol === "https:" && published.includes(current.hostname)
    ? current.origin : PUBLIC_ORIGIN;
  return `${base}/feedback/${encodeURIComponent(projectId)}`;
}
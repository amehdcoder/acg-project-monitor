/**
 * Owner-only simulation for the Integrated MDA Supervisory Checklist dashboards.
 *
 * This generates fully synthetic, in-memory submissions that match a checklist's
 * own question schema so an Owner can preview how the dashboards behave with
 * data. It NEVER writes anything to the database and is never persisted, so it
 * can never tamper with real submissions — the caller simply swaps the array it
 * feeds to the dashboard components while simulation is on.
 */

interface SimOption { label?: string; value?: string }
interface SimQuestion {
  id: string; name?: string; label?: string; type?: string;
  options?: SimOption[]; questions?: SimQuestion[];
}

export interface SimSubmission {
  id: string;
  projectId?: string | null;
  state?: string | null;
  lga?: string | null;
  ward?: string | null;
  submitter?: string | null;
  submittedAt?: string | null;
  status?: string | null;
  location?: { latitude?: number; longitude?: number } | null;
  data: Record<string, any>;
  __simulated: true;
}

// Approximate state centroids for GPS jitter (covers MDA states).
const STATE_CENTROID: Record<string, { lat: number; lng: number; spread: number }> = {
  jigawa: { lat: 12.228, lng: 9.5616, spread: 0.9 },
  kano: { lat: 12.0022, lng: 8.592, spread: 0.7 },
  katsina: { lat: 12.6, lng: 7.6, spread: 0.8 },
  sokoto: { lat: 13.05, lng: 5.25, spread: 0.8 },
  bauchi: { lat: 10.3158, lng: 9.8442, spread: 0.9 },
  yobe: { lat: 12.29, lng: 11.44, spread: 0.9 },
  kebbi: { lat: 11.5, lng: 4.2, spread: 0.9 },
  zamfara: { lat: 12.17, lng: 6.25, spread: 0.9 },
};
const DEFAULT_CENTROID = { lat: 9.082, lng: 8.6753, spread: 1.5 };

const SUPERVISORS = [
  "Aisha Bello", "Musa Ibrahim", "Grace Okoro", "Yakubu Sani",
  "Fatima Lawal", "Chinedu Eze", "Halima Garba", "Daniel Adeyemi",
];

const rand = (n: number) => Math.floor(Math.random() * n);
const pick = <T,>(arr: T[]): T => arr[rand(arr.length)];
const jitter = (base: number, spread: number) => base + (Math.random() - 0.5) * spread;
const slug = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

function flatten(qs: SimQuestion[]): SimQuestion[] {
  const out: SimQuestion[] = [];
  for (const q of qs || []) {
    if (Array.isArray(q.questions) && q.questions.length) out.push(...flatten(q.questions));
    else out.push(q);
  }
  return out;
}

function findQuestion(flat: SimQuestion[], name: string): SimQuestion | undefined {
  return flat.find((q) => slug(q.name || q.id || "") === name || slug(q.label || "") === name);
}

// Pick the LGA/ward option whose parent matches the chosen state, when present.
function answerFor(q: SimQuestion, ctx: { state?: string }): any {
  const opts = q.options || [];
  const type = q.type || "";
  if (opts.length) {
    let pool = opts;
    if ((q.name === "lga" || q.name === "ward") && ctx.state) {
      const filtered = opts.filter((o) => slug(String((o as any).parentValue ?? "")).includes(slug(ctx.state || "")));
      if (filtered.length) pool = filtered;
    }
    if (type === "select_multiple") {
      const n = 1 + rand(Math.min(3, pool.length));
      const chosen = [...pool].sort(() => Math.random() - 0.5).slice(0, n);
      return chosen.map((o) => o.value || o.label).join(" ");
    }
    const o = pick(pool);
    return o.value ?? o.label ?? "";
  }
  if (type === "integer" || type === "decimal" || type === "number") return rand(120) + 1;
  if (type === "date") {
    const d = new Date(); d.setDate(d.getDate() - rand(14));
    return d.toISOString().slice(0, 10);
  }
  if (type === "text" || type === "note") return pick(["No issues noted", "Refresher needed", "Stock adequate", "Followed up", ""]);
  return "";
}

/**
 * Build `count` synthetic submissions for a checklist, restricted to a state
 * when the checklist's State question only offers one option (e.g. Jigawa).
 */
export function generateMdaSimulation(
  questions: SimQuestion[],
  opts?: { count?: number; projectId?: string | null; restrictState?: string | null },
): SimSubmission[] {
  const count = opts?.count ?? 36;
  const flat = flatten(questions);
  const stateQ = findQuestion(flat, "state");
  const stateOpts = stateQ?.options || [];
  const restrict = opts?.restrictState ? slug(opts.restrictState) : undefined;

  const statusQ = findQuestion(flat, "status_of_mda");
  const mdaStatusOpts = statusQ?.options?.map((o) => String(o.value || o.label)) || ["completed", "ongoing", "not_started", "halted"];

  const out: SimSubmission[] = [];
  for (let i = 0; i < count; i++) {
    // Resolve the state for this record.
    let stateVal = restrict || "";
    if (!stateVal && stateOpts.length) stateVal = String(pick(stateOpts).value || pick(stateOpts).label);
    if (!stateVal) stateVal = "jigawa";
    const stateSlug = slug(stateVal);

    const data: Record<string, any> = {};
    for (const q of flat) {
      const key = q.name || q.id;
      if (!key) continue;
      if (q.name === "state") { data[key] = stateVal; continue; }
      data[key] = answerFor(q, { state: stateVal });
    }
    // Ensure key dashboard fields exist & vary realistically.
    data.status_of_mda = pick(mdaStatusOpts);
    if (!("risk_category" in data) || !data.risk_category) data.risk_category = pick(["low", "low", "medium", "high"]);

    const c = STATE_CENTROID[stateSlug] || DEFAULT_CENTROID;
    const lat = jitter(c.lat, c.spread);
    const lng = jitter(c.lng, c.spread);

    const submittedAt = new Date(Date.now() - rand(7) * 86400000 - rand(86400000)).toISOString();
    const status = pick(["finalized", "finalized", "finalized", "draft", "sent"]);

    out.push({
      id: `sim-${i}-${Math.random().toString(36).slice(2, 8)}`,
      projectId: opts?.projectId ?? null,
      state: stateVal,
      lga: data.lga ?? null,
      ward: data.ward ?? null,
      submitter: pick(SUPERVISORS),
      submittedAt,
      status,
      location: { latitude: lat, longitude: lng },
      data,
      __simulated: true,
    });
  }
  return out;
}

/**
 * Owner-only dashboard simulation.
 *
 * Generates a large, realistic synthetic dataset that matches the shape of a
 * form's real submissions so the Owner can preview the FULL potential of a
 * custom dashboard with high data volume — without touching real data and
 * without spending any AI credits. Generation is 100% local & deterministic
 * per seed so charts look stable while toggled on.
 */

import type { SubmissionRecord } from "@/hooks/useDataAnalytics";
import type { FormQuestion } from "@/hooks/useDashboardBuilder";

const SIM_STATES = [
  "Lagos", "Kano", "Kaduna", "Oyo", "Rivers", "Bauchi", "Borno", "Anambra",
  "Katsina", "Delta", "Sokoto", "Plateau", "Cross River", "Benue", "Niger",
  "Imo", "Akwa Ibom", "Ogun", "Enugu", "Kebbi", "Edo", "Ondo", "Adamawa",
  "Abia", "Osun", "Ekiti", "Kwara", "Gombe", "Yobe", "Taraba", "Ebonyi",
  "Nasarawa", "Zamfara", "Bayelsa", "Jigawa", "Kogi", "FCT Abuja",
];

const SIM_NAMES = [
  "Aisha Bello", "Chidi Okafor", "Ibrahim Musa", "Ngozi Eze", "Tunde Adeyemi",
  "Fatima Sani", "Emeka Nwosu", "Hauwa Yusuf", "Segun Balogun", "Amina Garba",
  "Obinna Udo", "Zainab Lawal", "Bashir Aliyu", "Chiamaka Obi", "Yakubu Danjuma",
  "Funke Akin", "Suleiman Abubakar", "Blessing Etim", "Murtala Bello", "Grace Ime",
];

// Small, fast seeded PRNG (mulberry32) so the dataset is stable per session.
function makeRng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rng: () => number, arr: T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

/**
 * Build a synthetic answer for a single question based on its type/options.
 */
function synthAnswer(rng: () => number, q: FormQuestion): any {
  const type = (q.type || "text").toLowerCase();

  if (q.options && q.options.length > 0) {
    return pick(rng, q.options).value;
  }

  if (type.includes("int") || type.includes("number") || type.includes("decimal") || type.includes("range")) {
    return Math.round(rng() * 100);
  }
  if (type.includes("bool") || type.includes("yes") || type.includes("check")) {
    return rng() > 0.5 ? "yes" : "no";
  }
  if (type.includes("date")) {
    const d = new Date(Date.now() - Math.floor(rng() * 90) * 86400000);
    return d.toISOString().slice(0, 10);
  }
  if (type.includes("select") || type.includes("choice")) {
    return pick(rng, ["Option A", "Option B", "Option C", "Option D"]);
  }
  // Free text — keep short & varied
  return pick(rng, ["Completed", "In progress", "Follow-up needed", "Verified", "Pending review"]);
}

export interface SimulationOptions {
  count?: number;
  formId: string;
  formName: string;
  questions: FormQuestion[];
  /** spread submissions across the last N days */
  days?: number;
  seed?: number;
}

/**
 * Generate a large synthetic submission set for dashboard preview.
 */
export function generateSimulatedSubmissions(opts: SimulationOptions): SubmissionRecord[] {
  const { formId, formName, questions, count = 2500, days = 90, seed = 1337 } = opts;
  const rng = makeRng(seed + count);
  const out: SubmissionRecord[] = [];
  const now = Date.now();

  for (let i = 0; i < count; i++) {
    const state = pick(rng, SIM_STATES);
    // Weight recent days more heavily for a realistic ramp curve.
    const dayOffset = Math.floor(Math.pow(rng(), 1.6) * days);
    const ts = new Date(now - dayOffset * 86400000 - Math.floor(rng() * 86400000));

    const data: Record<string, any> = {};
    for (const q of questions) {
      if (!q?.id) continue;
      data[q.id] = synthAnswer(rng, q);
    }

    out.push({
      id: `sim-${formId}-${i}`,
      form_id: formId,
      form_name: formName,
      user_id: `sim-user-${i % SIM_NAMES.length}`,
      submitter_name: SIM_NAMES[i % SIM_NAMES.length],
      location: state,
      state,
      submitted_at: ts.toISOString(),
      status: "sent",
      data,
      within_geofence: rng() > 0.18, // ~82% compliance
    });
  }

  // newest first for consistency with real queries
  out.sort((a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime());
  return out;
}

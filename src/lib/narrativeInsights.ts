// ─────────────────────────────────────────────────────────────────────────
// Narrative Insights Engine
// ---------------------------------------------------------------------------
// A dashboard-agnostic engine that reads collected form submissions + the
// form's question structure and produces a PLAIN-LANGUAGE narrative:
//   • a detailed statement of WHY the data was collected (derived from the
//     form name and the questions themselves),
//   • a human summary of what the data is saying,
//   • whether there are issues and what they are,
//   • what to do immediately (real-time) and during future planning,
//   • downloadable "action lists" (e.g. communities where MDA isn't complete)
//     that back each recommendation.
//
// Every dashboard supplies the same normalized shape, so one engine powers
// Bloomberg, MDA, SARMAAN, See Clear, IRF and any future dashboard.
// ─────────────────────────────────────────────────────────────────────────

export interface NarrativeQuestion {
  id: string;
  name?: string;
  label?: string;
  type?: string;
  options?: { label?: string; value?: string }[];
  questions?: NarrativeQuestion[]; // when this node is a group
}

export interface NarrativeSubmission {
  id: string;
  state?: string | null;
  lga?: string | null;
  ward?: string | null;
  submitter_name?: string | null;
  submitted_at?: string | null;
  data: Record<string, any>;
}

export interface NarrativeConfig {
  /** Human name of the form/programme, e.g. "Integrated MDA Supervisory Checklist". */
  formName?: string;
  /** Optional short description if the form carries one. */
  formDescription?: string;
  /** Optional explicit domain label to bias purpose derivation. */
  domainHint?: string;
}

export type Tone = "positive" | "warning" | "critical" | "neutral";

export interface NarrativeActionList {
  id: string;
  title: string;
  description: string;
  columns: { key: string; label: string }[];
  rows: Record<string, string | number | null | undefined>[];
  /** IDs of the exact submissions backing this list — used to build a
   *  form-scoped Excel export whose columns are the ACTUAL form questions
   *  (never leaked from another form). */
  submissionIds?: string[];
  /** The question id this list was flagged on (highlighted in the export). */
  flaggedQuestionId?: string;
}


export interface NarrativeItem {
  tone: Tone;
  text: string;
  /** id of an action list users can download for supporting detail. */
  listId?: string;
}

export interface NarrativeResult {
  purpose: string;
  purposeBullets: string[];
  summary: string[];
  issues: NarrativeItem[];
  immediateActions: NarrativeItem[];
  futureActions: NarrativeItem[];
  actionLists: Record<string, NarrativeActionList>;
  dataCoverageNote: string;
  hasData: boolean;
}

// ───────────────────────── helpers ─────────────────────────
const nf = (n: number) => new Intl.NumberFormat().format(Math.round(n || 0));
const pretty = (s: string) =>
  String(s).replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim().replace(/\b\w/g, (l) => l.toUpperCase());
const isFilled = (v: any) =>
  v !== null && v !== undefined && v !== "" && !(Array.isArray(v) && v.length === 0);

const flattenQuestions = (qs: NarrativeQuestion[] | undefined): NarrativeQuestion[] => {
  const out: NarrativeQuestion[] = [];
  const walk = (list: NarrativeQuestion[] | undefined) => {
    for (const q of list || []) {
      if (Array.isArray(q?.questions) && q.questions.length) walk(q.questions);
      else if (q?.id) out.push(q);
    }
  };
  walk(qs);
  return out;
};

const labelOf = (q: NarrativeQuestion) => q.label || q.name || pretty(q.id);

// Negative / attention answers across many phrasings.
const NEGATIVE_RE =
  /^(no|none|nil)$|not\s+(completed|complete|done|conducted|available|present|reached|covered|functional|working|met|achieved)|incomplete|refus|declin|absent|missing|unavailable|stock[\s-]?out|out\s+of\s+stock|non[\s-]?compl|^poor$|^low$|^bad$|^inadequate$|shortage|expired/i;
const POSITIVE_RE = /^(yes|done|completed|complete|available|present|functional|adequate|good|high|met|achieved)$/i;
const PARTIAL_RE = /^(partly|partial|partially|somewhat|in\s?progress|ongoing)$/i;

const asArray = (v: any): any[] => (Array.isArray(v) ? v : [v]);

// Detect a special field by testing key + label against a regex.
const findFieldId = (qs: NarrativeQuestion[], re: RegExp): string | undefined => {
  const hit = qs.find((q) => re.test(q.id) || re.test(labelOf(q)));
  return hit?.id;
};

// Resolve a display value for a sub's admin geography or a data key.
const geoVal = (s: NarrativeSubmission, keys: RegExp): string => {
  const d = s.data || {};
  for (const [k, v] of Object.entries(d)) {
    if (keys.test(k) && isFilled(v)) return String(Array.isArray(v) ? v.join(", ") : v);
  }
  return "";
};

const COMMUNITY_RE = /communit|settlement|village|hamlet/i;
const TEAM_RE = /team[\s_-]*code|team[\s_-]*id|team[\s_-]*name|team\b/i;
const APEX_RE = /apex|health\s*facility|facility\s*name|phc\b/i;
const WARD_RE = /(^|_)ward(_|$)|ward[\s_-]*name/i;
const LGA_RE = /(^|_)lga(_|$)|local[\s_-]*government/i;

const communityName = (s: NarrativeSubmission) => geoVal(s, COMMUNITY_RE) || "—";
const teamCode = (s: NarrativeSubmission) => geoVal(s, TEAM_RE) || "—";
const apexFacility = (s: NarrativeSubmission) => geoVal(s, APEX_RE) || "—";
const wardName = (s: NarrativeSubmission) => s.ward || geoVal(s, WARD_RE) || "—";
const lgaName = (s: NarrativeSubmission) => s.lga || geoVal(s, LGA_RE) || "—";

// ───────────────────────── purpose derivation ─────────────────────────
interface Theme { re: RegExp; label: string; blurb: string }
const THEMES: Theme[] = [
  { re: /mass\s*drug|(\bmda\b)|deworm|praziquantel|ivermectin|albendazole|treatment\s*coverage/i,
    label: "Mass Drug Administration (MDA)",
    blurb: "verify that mass drug administration reached every targeted community, that commodities were available and correctly administered, and that adverse reactions were captured and managed" },
  { re: /awareness|sensiti[sz]|acsm|mobili[sz]|town\s*announ|iec|visibility|demand\s*generation|communication/i,
    label: "Advocacy, Communication & Social Mobilization (ACSM)",
    blurb: "measure the reach and quality of community awareness — announcements, IEC materials, sensitisation and mobilization — that drive demand and acceptance for the programme" },
  { re: /supervis|checklist|monitor|quality\s*assur|fidelity|compliance/i,
    label: "Supervision & Quality Assurance",
    blurb: "monitor implementation fidelity in the field, surface non-compliance early, and hold teams accountable to the programme's standard operating procedures" },
  { re: /enrol|school|pupil|student|attendance|education/i,
    label: "School Enrolment / Education",
    blurb: "validate school enrolment and attendance figures against what is observed on the ground so that planning and resourcing rest on trustworthy numbers" },
  { re: /refus|hesitan|non[\s-]?compliance|conversion/i,
    label: "Refusal & Hesitancy Management",
    blurb: "track refusals and hesitancy so that trusted leaders can be engaged to convert non-compliant households and communities" },
  { re: /water|sanitation|hygiene|wash|latrine|borehole/i,
    label: "WASH (Water, Sanitation & Hygiene)",
    blurb: "assess water, sanitation and hygiene conditions so that gaps can be prioritised and resourced" },
  { re: /household|coverage|census|registration|micro[\s-]?plan/i,
    label: "Household Coverage & Registration",
    blurb: "confirm household-level coverage and registration completeness so that no eligible population is left behind" },
  { re: /adverse|reaction|referr|case\s*management|health\s*facility/i,
    label: "Case & Adverse-Event Management",
    blurb: "ensure adverse events and referrals are documented and followed through to resolution" },
];

function derivePurpose(cfg: NarrativeConfig, flat: NarrativeQuestion[]): { purpose: string; bullets: string[] } {
  const name = cfg.formName || "this form";
  const haystack = [cfg.formName, cfg.formDescription, cfg.domainHint, ...flat.map(labelOf)]
    .filter(Boolean)
    .join(" • ");
  const matched = THEMES.filter((t) => t.re.test(haystack));
  const themeLabels = matched.map((t) => t.label);
  const blurbs = matched.map((t) => t.blurb);

  // What the instrument measures — grouped question themes.
  const bullets: string[] = [];
  if (matched.length) {
    for (const t of matched.slice(0, 5)) bullets.push(`${t.label}: to ${t.blurb}.`);
  }
  // Fallback structural read of the questions themselves.
  const nQuestions = flat.length;
  if (nQuestions) {
    bullets.push(
      `The instrument captures ${nf(nQuestions)} field${nQuestions === 1 ? "" : "s"} spanning ${
        [...new Set(flat.map((q) => (q.type || "response").toLowerCase()))].slice(0, 6).join(", ")
      } — combining what teams did, where, and to what standard.`,
    );
  }

  const purpose =
    matched.length > 0
      ? `“${name}” exists to ${blurbs.slice(0, 3).join("; ")}. In short, it is a decision-support instrument for ${
          themeLabels.slice(0, 3).join(", ")
        } — every question is a lever a programme manager can act on. The analysis below reads those answers the way an experienced M&E lead would: it states plainly what the field is telling us, flags where the programme is off-track, and recommends what to do now and in the next planning cycle.`
      : `“${name}” is a structured field instrument. Reading its questions, it is designed to document who was reached, what was done, where, and to what standard, so that managers can judge whether implementation is on track and decide where to intervene. The analysis below turns those answers into plain language: what the data says, where the risks are, and what to do about them now and in future planning.`;

  return { purpose, bullets };
}

// ───────────────────────── main ─────────────────────────
export function buildNarrative(
  submissions: NarrativeSubmission[],
  questions: NarrativeQuestion[],
  cfg: NarrativeConfig = {},
): NarrativeResult {
  const flat = flattenQuestions(questions);
  const { purpose, bullets: purposeBullets } = derivePurpose(cfg, flat);
  const total = submissions.length;
  const actionLists: Record<string, NarrativeActionList> = {};
  const issues: NarrativeItem[] = [];
  const immediateActions: NarrativeItem[] = [];
  const futureActions: NarrativeItem[] = [];
  const summary: string[] = [];

  if (total === 0) {
    return {
      purpose,
      purposeBullets,
      summary: ["No submissions have been collected yet, so there is nothing to interpret. Once teams begin submitting, this section will explain in plain language what the data is saying and what to do about it."],
      issues: [],
      immediateActions: [],
      futureActions: [],
      actionLists: {},
      dataCoverageNote: "Awaiting first submissions.",
      hasData: false,
    };
  }

  // ── geography + collectors ──
  const lgas = new Set<string>();
  const wards = new Set<string>();
  const communities = new Set<string>();
  const collectors = new Set<string>();
  let lastAt = "";
  for (const s of submissions) {
    const l = lgaName(s); if (l !== "—") lgas.add(l);
    const w = wardName(s); if (w !== "—") wards.add(`${l}||${w}`);
    const c = communityName(s); if (c !== "—") communities.add(`${l}||${c}`);
    if (s.submitter_name) collectors.add(s.submitter_name);
    if (s.submitted_at && s.submitted_at > lastAt) lastAt = s.submitted_at;
  }

  const geoParts: string[] = [];
  if (lgas.size) geoParts.push(`${nf(lgas.size)} LGA${lgas.size === 1 ? "" : "s"}`);
  if (wards.size) geoParts.push(`${nf(wards.size)} ward${wards.size === 1 ? "" : "s"}`);
  if (communities.size) geoParts.push(`${nf(communities.size)} communit${communities.size === 1 ? "y" : "ies"}`);
  summary.push(
    `A total of ${nf(total)} submission${total === 1 ? "" : "s"} ${
      collectors.size ? `from ${nf(collectors.size)} field ${collectors.size === 1 ? "officer" : "officers"} ` : ""
    }${geoParts.length ? `covering ${geoParts.join(", ")} ` : ""}${
      lastAt ? `were recorded, with the latest on ${new Date(lastAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}.` : "have been recorded."
    }`,
  );

  // ── per-field completeness + compliance scan ──
  const negativeFieldsForList: { q: NarrativeQuestion; rows: NarrativeSubmission[] }[] = [];
  let lowCoverageCount = 0;
  const positiveHighlights: string[] = [];

  for (const q of flat) {
    const raw = submissions.map((s) => s.data?.[q.id]).filter(isFilled);
    if (!raw.length) continue;
    const responseRate = Math.round((raw.length / total) * 100);

    // Categorical / yes-no compliance reading.
    const counts = new Map<string, number>();
    let looksCategorical = false;
    for (const v of raw) {
      for (const it of asArray(v)) {
        if (!isFilled(it)) continue;
        const key = pretty(String(it));
        counts.set(key, (counts.get(key) || 0) + 1);
        if (typeof it === "boolean" || String(it).length < 40) looksCategorical = true;
      }
    }
    if (!looksCategorical || counts.size === 0 || counts.size > 25) continue;

    const answered = [...counts.values()].reduce((a, b) => a + b, 0);
    let neg = 0, pos = 0, part = 0;
    for (const [name, c] of counts) {
      if (NEGATIVE_RE.test(name)) neg += c;
      else if (POSITIVE_RE.test(name)) pos += c;
      else if (PARTIAL_RE.test(name)) part += c;
    }
    const isComplianceField = neg + pos + part >= answered * 0.6 && (neg > 0 || pos > 0);
    if (!isComplianceField) continue;

    const negPct = Math.round((neg / answered) * 100);
    const posPct = Math.round((pos / answered) * 100);

    if (neg > 0 && negPct >= 15) {
      // Rows failing this compliance field become an action list.
      const rows = submissions.filter((s) =>
        asArray(s.data?.[q.id]).some((v) => isFilled(v) && NEGATIVE_RE.test(pretty(String(v)))),
      );
      negativeFieldsForList.push({ q, rows });
      const tone: Tone = negPct >= 40 ? "critical" : "warning";
      issues.push({
        tone,
        text: `${negPct}% (${nf(neg)} of ${nf(answered)}) reported a gap on “${labelOf(q)}”. ${
          negPct >= 40 ? "This is a material shortfall that needs action now." : "This is a notable gap worth closing."
        }`,
        listId: `neg_${q.id}`,
      });
    } else if (posPct >= 80) {
      positiveHighlights.push(`${posPct}% met the standard on “${labelOf(q)}”`);
    }

    if (responseRate < 50) lowCoverageCount++;
  }

  // Build the action lists from negative-field rows.
  for (const { q, rows } of negativeFieldsForList) {
    if (!rows.length) continue;
    actionLists[`neg_${q.id}`] = {
      id: `neg_${q.id}`,
      title: `Follow-up list — ${labelOf(q)}`,
      description: `Communities/records that reported a gap on “${labelOf(q)}” and require follow-up.`,
      flaggedQuestionId: q.id,
      submissionIds: rows.map((s) => s.id),
      columns: [
        { key: "lga", label: "LGA" },
        { key: "ward", label: "Ward" },
        { key: "apex", label: "Ward Apex Facility" },
        { key: "community", label: "Community" },
        { key: "team", label: "Team Code" },
        { key: "response", label: "Reported" },
        { key: "submitter", label: "Submitted By" },
        { key: "date", label: "Date" },
      ],
      rows: rows.map((s) => ({
        lga: lgaName(s),
        ward: wardName(s),
        apex: apexFacility(s),
        community: communityName(s),
        team: teamCode(s),
        response: asArray(s.data?.[q.id]).map((v) => pretty(String(v))).join(", "),
        submitter: s.submitter_name || "—",
        date: s.submitted_at ? new Date(s.submitted_at).toLocaleDateString("en-GB") : "—",
      })),
    };
  }

  // ── MDA-specific completion focus (targeted, high-value) ──
  const mdaCompletionId = findFieldId(flat, /mda.*(complet|conduct|administ)|(complet|conduct).*mda|drug.*administ/i);
  if (mdaCompletionId) {
    const notDone = submissions.filter((s) =>

      asArray(s.data?.[mdaCompletionId]).some((v) => isFilled(v) && NEGATIVE_RE.test(pretty(String(v)))),
    );
    if (notDone.length) {
      const listId = "mda_not_completed";
      actionLists[listId] = {
        id: listId,
        title: "Communities where MDA is not completed",
        description: "Communities that require immediate follow-up to complete mass drug administration.",
        flaggedQuestionId: mdaCompletionId,
        submissionIds: notDone.map((s) => s.id),

        columns: [
          { key: "lga", label: "LGA" },
          { key: "ward", label: "Ward" },
          { key: "apex", label: "Ward Apex Facility" },
          { key: "community", label: "Community" },
          { key: "team", label: "Team Code" },
          { key: "submitter", label: "Reported By" },
          { key: "date", label: "Date" },
        ],
        rows: notDone.map((s) => ({
          lga: lgaName(s), ward: wardName(s), apex: apexFacility(s),
          community: communityName(s), team: teamCode(s),
          submitter: s.submitter_name || "—",
          date: s.submitted_at ? new Date(s.submitted_at).toLocaleDateString("en-GB") : "—",
        })),
      };
      immediateActions.push({
        tone: "critical",
        text: `Deploy teams to the ${nf(notDone.length)} communit${notDone.length === 1 ? "y" : "ies"} where MDA is not yet complete before the round closes — every incomplete community is untreated population.`,
        listId,
      });
    }
  }

  // ── refusal-specific focus ──
  const refusalId = findFieldId(flat, /refus|hesitan|non[\s-]?compl|declin/i);
  if (refusalId) {
    const refused = submissions.filter((s) =>
      asArray(s.data?.[refusalId]).some((v) => isFilled(v) && (NEGATIVE_RE.test(pretty(String(v))) || /refus|hesitan|declin|yes/i.test(pretty(String(v))))),
    );
    if (refused.length) {
      const listId = "communities_with_refusals";
      actionLists[listId] = {
        id: listId,
        title: "Communities with refusals",
        description: "Communities reporting refusals/hesitancy for trusted-leader engagement.",
        columns: [
          { key: "lga", label: "LGA" },
          { key: "ward", label: "Ward" },
          { key: "apex", label: "Ward Apex Facility" },
          { key: "community", label: "Community" },
          { key: "team", label: "Team Code" },
          { key: "date", label: "Date" },
        ],
        rows: refused.map((s) => ({
          lga: lgaName(s), ward: wardName(s), apex: apexFacility(s),
          community: communityName(s), team: teamCode(s),
          date: s.submitted_at ? new Date(s.submitted_at).toLocaleDateString("en-GB") : "—",
        })),
      };
      immediateActions.push({
        tone: "warning",
        text: `Engage religious and traditional leaders in the ${nf(refused.length)} communit${refused.length === 1 ? "y" : "ies"} reporting refusals/hesitancy to convert non-compliance before the round ends.`,
        listId,
      });
    }
  }

  // ── data-quality: missing geography ──
  const noGeo = submissions.filter((s) => lgaName(s) === "—" && wardName(s) === "—");
  if (noGeo.length && total >= 5 && noGeo.length / total >= 0.1) {
    issues.push({
      tone: "warning",
      text: `${Math.round((noGeo.length / total) * 100)}% of submissions (${nf(noGeo.length)}) are missing location details, which weakens geographic targeting.`,
    });
    futureActions.push({ tone: "neutral", text: "Make LGA/ward/community fields mandatory so every record can be mapped and followed up." });
  }

  // ── summary narrative synthesis ──
  if (issues.filter((i) => i.tone === "critical").length) {
    summary.push(`The data shows real problems that need attention: there ${issues.length === 1 ? "is" : "are"} ${issues.length} issue${issues.length === 1 ? "" : "s"} flagged below, including ${issues.filter((i) => i.tone === "critical").length} that ${issues.filter((i) => i.tone === "critical").length === 1 ? "is" : "are"} serious. The recommended actions and their supporting lists tell you exactly where to intervene.`);
  } else if (issues.length) {
    summary.push(`Overall the programme is broadly on track, but ${issues.length} area${issues.length === 1 ? "" : "s"} need${issues.length === 1 ? "s" : ""} attention (see below). None are severe, but closing them will lift quality.`);
  } else {
    summary.push("Overall the collected data looks healthy — no material compliance or data-quality issues were detected across the fields analysed.");
  }
  if (positiveHighlights.length) {
    summary.push(`On the positive side, ${positiveHighlights.slice(0, 3).join("; ")}.`);
  }

  // Generic future-planning recommendations.
  if (issues.some((i) => i.tone === "critical" || i.tone === "warning")) {
    futureActions.push({ tone: "neutral", text: "Use the gap lists above to pre-position commodities, teams and supervision in the historically weak LGAs/wards for the next round." });
    futureActions.push({ tone: "neutral", text: "Schedule refresher training focused on the specific checklist items that failed most often this round." });
  } else {
    futureActions.push({ tone: "neutral", text: "Sustain the current supervision cadence and document what is working so it can be replicated when the programme scales." });
  }
  if (lowCoverageCount > 0) {
    futureActions.push({ tone: "warning", text: `${lowCoverageCount} field${lowCoverageCount === 1 ? " was" : "s were"} answered on fewer than half of submissions — tighten data completeness so future analysis is fully reliable.` });
  }
  if (!immediateActions.length) {
    immediateActions.push({ tone: "positive", text: "No urgent field actions are required from this data right now — maintain routine monitoring and keep validating incoming submissions." });
  }

  const dataCoverageNote = `Based on ${nf(total)} submission${total === 1 ? "" : "s"}${
    lgas.size ? ` across ${nf(lgas.size)} LGA${lgas.size === 1 ? "" : "s"}` : ""
  }. Figures update in real time as new data arrives.`;

  return {
    purpose,
    purposeBullets,
    summary,
    issues,
    immediateActions,
    futureActions,
    actionLists,
    dataCoverageNote,
    hasData: true,
  };
}

// CSV builder for downloadable action lists.
export function actionListToCsv(list: NarrativeActionList): string {
  const esc = (v: any) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = list.columns.map((c) => esc(c.label)).join(",");
  const body = list.rows.map((r) => list.columns.map((c) => esc(r[c.key])).join(",")).join("\n");
  return `${header}\n${body}`;
}

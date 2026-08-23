/**
 * Web knowledge retrieval for the Amehnities Data Assistant.
 *
 * The assistant is grounded in two things: the live application data, and the
 * published public-health / M&E literature on the internet. This module covers
 * the second half — it searches open, authoritative, key-free sources at answer
 * time and returns short passages the model can quote and cite as [W1], [W2] …
 *
 * Sources (all free, no API key, all with stable public URLs):
 *  - Europe PMC — indexes PubMed/MEDLINE, preprints and WHO/agency reports, so
 *    it covers epidemiology, NTD/MDA doctrine and M&E methods literature.
 *  - Wikipedia REST — concise definitional grounding for M&E terminology
 *    (logframe, theory of change, DALY, coverage survey, LQAS …).
 *
 * Everything is bounded and cached: at most a handful of small requests per
 * question, a short-lived in-memory cache, and hard timeouts so a slow or down
 * source can never stall the answer stream.
 */

export interface WebSource {
  ref: string;          // W1, W2 …
  title: string;
  url: string;
  publisher: string;
  year?: string;
  snippet: string;
}

const CACHE_TTL_MS = 30 * 60_000;
const cache = new Map<string, { at: number; value: WebSource[] }>();

/** Questions that clearly only concern the app's own rows need no web lookup. */
const APP_ONLY = /^(how many|how much|list|show|count|total|who submitted|which user|latest|last)\b/i;
const KNOWLEDGE_SIGNALS =
  /who\s+(guideline|recommend|standard)|guideline|evidence|literature|best practice|definition|define|methodolog|framework|indicator|protocol|research|study|studies|published|global|international|benchmark|why|how do|how should|what is|explain|theory|logframe|log frame|monitoring and evaluation|m&e|dalys?|lqas|sample size|confidence interval|epidemiolog|prevalence|elimination|threshold/i;

/**
 * Decide whether an internet lookup adds value. Pure record look-ups against
 * the app's own tables skip it (faster answers, no needless traffic).
 */
export function shouldSearchWeb(question: string): boolean {
  const q = question.trim();
  if (!q) return false;
  if (KNOWLEDGE_SIGNALS.test(q)) return true;
  if (APP_ONLY.test(q) && q.split(/\s+/).length <= 14) return false;
  return q.split(/\s+/).length > 6;
}

async function timedFetch(url: string, ms = 6000): Promise<Response | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, {
      signal: ctrl.signal,
      headers: { Accept: "application/json", "User-Agent": "AmehnitiesAssistant/1.0 (public-health analytics)" },
    });
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

const clean = (s: unknown, n = 700) =>
  String(s ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, n);

/** Build a focused literature query out of the user's question. */
function literatureQuery(question: string): string {
  const terms = question
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3)
    .slice(0, 12)
    .join(" ");
  return terms || question.slice(0, 120);
}

async function europePmc(question: string, limit = 5): Promise<Omit<WebSource, "ref">[]> {
  const q = encodeURIComponent(
    `(${literatureQuery(question)}) AND (public health OR epidemiology OR "mass drug administration" OR "monitoring and evaluation" OR coverage) AND (OPEN_ACCESS:y OR SRC:MED)`,
  );
  const url = `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${q}&format=json&pageSize=${limit}&resultType=core&sort=CITED%20desc`;
  const resp = await timedFetch(url);
  if (!resp?.ok) return [];
  const json = await resp.json().catch(() => null);
  const rows = json?.resultList?.result ?? [];
  return (rows as Record<string, unknown>[])
    .filter((r) => r?.title)
    .map((r) => {
      const doi = r.doi ? `https://doi.org/${r.doi}` : "";
      const pmid = r.pmid ? `https://pubmed.ncbi.nlm.nih.gov/${r.pmid}/` : "";
      const epmc = `https://europepmc.org/article/${String(r.source ?? "MED")}/${String(r.id ?? "")}`;
      return {
        title: clean(r.title, 220),
        url: doi || pmid || epmc,
        publisher: clean(r.journalTitle || r.source || "Europe PMC", 80),
        year: r.pubYear ? String(r.pubYear) : undefined,
        snippet: clean(r.abstractText || r.authorString || "", 700),
      };
    })
    .filter((s) => s.snippet.length > 40 || s.title.length > 20);
}

async function wikipedia(question: string, limit = 2): Promise<Omit<WebSource, "ref">[]> {
  const q = encodeURIComponent(literatureQuery(question));
  const url = `https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*&generator=search&gsrsearch=${q}&gsrlimit=${limit}&prop=extracts|info&exintro=1&explaintext=1&inprop=url`;
  const resp = await timedFetch(url);
  if (!resp?.ok) return [];
  const json = await resp.json().catch(() => null);
  const pages = json?.query?.pages ? Object.values(json.query.pages) : [];
  return (pages as Record<string, unknown>[])
    .map((p) => ({
      title: clean(p.title, 160),
      url: String(p.fullurl ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(String(p.title ?? ""))}`),
      publisher: "Wikipedia",
      snippet: clean(p.extract, 600),
    }))
    .filter((s) => s.snippet.length > 80);
}

/**
 * Retrieve, de-duplicate and rank web knowledge for one question.
 * Peer-reviewed literature ranks above encyclopaedic definitions.
 */
export async function retrieveWebKnowledge(question: string, max = 6): Promise<WebSource[]> {
  const key = question.trim().toLowerCase().slice(0, 300);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;

  const [lit, wiki] = await Promise.all([
    europePmc(question).catch(() => []),
    wikipedia(question).catch(() => []),
  ]);

  const seen = new Set<string>();
  const merged: WebSource[] = [];
  for (const s of [...lit, ...wiki]) {
    const k = s.url.toLowerCase();
    if (!s.url || seen.has(k)) continue;
    seen.add(k);
    merged.push({ ...s, ref: `W${merged.length + 1}` });
    if (merged.length >= max) break;
  }

  // Cache misses too — a source that is down should not be retried per keystroke.
  cache.set(key, { at: Date.now(), value: merged });
  if (cache.size > 200) cache.delete(cache.keys().next().value as string);
  return merged;
}

/** Prompt block describing the retrieved evidence and how to cite it. */
export function webKnowledgeBlock(sources: WebSource[]): string {
  if (!sources.length) return "";
  const lines = [
    "PUBLISHED EVIDENCE FROM THE INTERNET (peer-reviewed literature, guidance and reference material retrieved live for this question).",
    "Cite these with [W1], [W2] … exactly as written. Use them for definitions, WHO/global standards, methodology and comparison with published findings — never as a source of figures about this application's own data.",
    "If published evidence contradicts what the application data shows, say so explicitly and cite both sides.",
    "",
  ];
  for (const s of sources) {
    lines.push(
      `[${s.ref}] ${s.title}${s.year ? ` (${s.year})` : ""} — ${s.publisher}\n    url: ${s.url}\n    excerpt: ${s.snippet}`,
    );
  }
  return lines.join("\n");
}

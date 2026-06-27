/**
 * MDA Dashboard drill-down
 * ────────────────────────────────────────────────────────────────────────
 * Renders the EXACT underlying submissions behind a clicked KPI / follow-up
 * card. Each submission is shown as an expandable card revealing every
 * recorded answer (including follow-up answers merged onto the community).
 *
 * Scales to large datasets via:
 *   • a search box (location / community / submitter / ID / answers),
 *   • module / geography (state, LGA) / date-range filters,
 *   • incremental "infinite scroll" rendering so the sheet stays fast.
 *
 * It is fully form-driven — questions/groups are flattened from the current
 * form structure so labels stay accurate after any Form Builder edit.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  ChevronDown, MapPin, User2, CalendarClock, ClipboardList, Search, X, Filter, Download,
} from "lucide-react";
import { buildSubmissionsCsv, downloadCsv, slugify, type CsvRow } from "@/lib/mda/csvExport";

interface QOption { id?: string; label: string; value: string; }
interface FormQuestion {
  id: string;
  name?: string;
  label?: string;
  type?: string;
  options?: QOption[];
  questions?: FormQuestion[];
  linkedSourceField?: string;
}
export interface DrillSubmission {
  id: string;
  state?: string | null;
  lga?: string | null;
  ward?: string | null;
  submitter?: string | null;
  submittedAt?: string | null;
  status?: string | null;
  /** Optional follow-up module label, enables the module filter. */
  module?: string | null;
  data?: Record<string, any>;
}

export interface DrillData {
  title: string;
  subtitle?: string;
  tint?: string;
  rows: DrillSubmission[];
}

interface Props {
  data: DrillData | null;
  questions: FormQuestion[];
  /** Names of follow-up question/source fields, to flag updated answers. */
  followUpFields?: Set<string>;
  onClose: () => void;
}

const stripTags = (s?: string) => String(s || "").replace(/<[^>]*>/g, "").trim();
const ALL = "__all__";
const PAGE = 25;

interface FlatQ { key: string; label: string; q: FormQuestion; }
function flatten(questions: FormQuestion[]): FlatQ[] {
  const out: FlatQ[] = [];
  const walk = (qs: FormQuestion[]) => {
    for (const item of qs || []) {
      const isGroup = Array.isArray(item.questions) && !item.type;
      if (isGroup) walk(item.questions || []);
      else if (item.type) {
        const key = item.name || item.id;
        out.push({ key, label: stripTags(item.label) || key, q: item });
      }
    }
  };
  walk(questions);
  return out;
}

function displayValue(q: FormQuestion, raw: any): string {
  if (raw === undefined || raw === null || raw === "") return "—";
  const labelFor = (val: string) =>
    stripTags(q.options?.find((o) => o.value === val || o.label === val)?.label) || val;
  if (Array.isArray(raw)) return raw.map((v) => labelFor(String(v))).join(", ");
  if (typeof raw === "object") {
    try { return JSON.stringify(raw); } catch { return String(raw); }
  }
  const s = String(raw);
  if (q.type === "select_multiple" && s.includes(" ")) {
    return s.split(/\s+/).map(labelFor).join(", ");
  }
  return labelFor(s);
}

function locationOf(s: DrillSubmission): string {
  const d = s.data || {};
  const parts = [
    s.state ?? d.state,
    s.lga ?? d.lga,
    s.ward ?? d.ward,
    d.community_name ?? d.community,
    d.settlement_name ?? d.settlement,
  ].map((x) => stripTags(x as string)).filter(Boolean);
  return parts.join(" › ") || "Location not recorded";
}

function SubmissionCard({
  s, flat, followUpFields,
}: { s: DrillSubmission; flat: FlatQ[]; followUpFields?: Set<string> }) {
  const [open, setOpen] = useState(false);
  const answered = flat.filter((f) => {
    const v = s.data?.[f.key];
    return v !== undefined && v !== null && v !== "";
  });
  const when = s.submittedAt ? new Date(s.submittedAt) : null;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="rounded-lg border border-border bg-card">
        <CollapsibleTrigger className="flex w-full items-start justify-between gap-2 p-3 text-left">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
              <MapPin className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate">{locationOf(s)}</span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
              {s.submitter && (
                <span className="flex items-center gap-1"><User2 className="h-3 w-3" />{stripTags(s.submitter)}</span>
              )}
              {when && !isNaN(when.getTime()) && (
                <span className="flex items-center gap-1"><CalendarClock className="h-3 w-3" />{when.toLocaleString()}</span>
              )}
              {s.module && (
                <Badge variant="outline" className="px-1.5 py-0 text-[9px]">{s.module}</Badge>
              )}
              {s.status && (
                <Badge variant="secondary" className="px-1.5 py-0 text-[9px] uppercase">{s.status}</Badge>
              )}
            </div>
          </div>
          <ChevronDown className={`mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="space-y-1.5 border-t border-border px-3 py-2.5">
            {answered.length === 0 && (
              <p className="text-xs text-muted-foreground">No answers recorded.</p>
            )}
            {answered.map((f) => {
              const isFollowUp = followUpFields?.has(f.key);
              return (
                <div key={f.key} className="grid grid-cols-[1fr_auto] items-start gap-2 text-xs">
                  <span className="flex items-center gap-1 text-muted-foreground">
                    {f.label}
                    {isFollowUp && (
                      <Badge className="bg-emerald-500/15 px-1 py-0 text-[8px] text-emerald-600 dark:text-emerald-400">follow-up</Badge>
                    )}
                  </span>
                  <span className="text-right font-medium text-foreground">{displayValue(f.q, s.data?.[f.key])}</span>
                </div>
              );
            })}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

export default function MdaDrillDownSheet({ data, questions, followUpFields, onClose }: Props) {
  const flat = useMemo(() => flatten(questions), [questions]);

  const [search, setSearch] = useState("");
  const [moduleFilter, setModuleFilter] = useState(ALL);
  const [stateFilter, setStateFilter] = useState(ALL);
  const [lgaFilter, setLgaFilter] = useState(ALL);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [visible, setVisible] = useState(PAGE);

  const rows = data?.rows || [];

  // Reset all controls whenever a new drill-down is opened.
  useEffect(() => {
    setSearch("");
    setModuleFilter(ALL);
    setStateFilter(ALL);
    setLgaFilter(ALL);
    setDateFrom("");
    setDateTo("");
    setVisible(PAGE);
  }, [data]);

  const stateOf = (s: DrillSubmission) => stripTags(s.state ?? s.data?.state);
  const lgaOf = (s: DrillSubmission) => stripTags(s.lga ?? s.data?.lga);

  const moduleOptions = useMemo(
    () => Array.from(new Set(rows.map((r) => r.module).filter(Boolean))) as string[],
    [rows],
  );
  const stateOptions = useMemo(
    () => Array.from(new Set(rows.map(stateOf).filter(Boolean))).sort(),
    [rows],
  );
  const lgaOptions = useMemo(
    () =>
      Array.from(
        new Set(
          rows
            .filter((r) => stateFilter === ALL || stateOf(r) === stateFilter)
            .map(lgaOf)
            .filter(Boolean),
        ),
      ).sort(),
    [rows, stateFilter],
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const fromTs = dateFrom ? new Date(dateFrom).getTime() : null;
    const toTs = dateTo ? new Date(dateTo).getTime() + 86_400_000 : null; // inclusive day
    return rows.filter((r) => {
      if (moduleFilter !== ALL && r.module !== moduleFilter) return false;
      if (stateFilter !== ALL && stateOf(r) !== stateFilter) return false;
      if (lgaFilter !== ALL && lgaOf(r) !== lgaFilter) return false;
      if (fromTs || toTs) {
        const t = r.submittedAt ? new Date(r.submittedAt).getTime() : NaN;
        if (isNaN(t)) return false;
        if (fromTs && t < fromTs) return false;
        if (toTs && t >= toTs) return false;
      }
      if (term) {
        const hay = [
          r.id,
          r.submitter,
          locationOf(r),
          ...Object.values(r.data || {}).map((v) =>
            Array.isArray(v) ? v.join(" ") : String(v ?? ""),
          ),
        ]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
  }, [rows, search, moduleFilter, stateFilter, lgaFilter, dateFrom, dateTo]);

  // Reset pagination whenever the filtered result changes.
  useEffect(() => setVisible(PAGE), [search, moduleFilter, stateFilter, lgaFilter, dateFrom, dateTo]);

  const hasFilters =
    !!search || moduleFilter !== ALL || stateFilter !== ALL || lgaFilter !== ALL || !!dateFrom || !!dateTo;
  const clearFilters = () => {
    setSearch(""); setModuleFilter(ALL); setStateFilter(ALL); setLgaFilter(ALL);
    setDateFrom(""); setDateTo("");
  };

  const onScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 240) {
      setVisible((v) => (v < filtered.length ? v + PAGE : v));
    }
  };

  if (!data) return null;
  const tint = data.tint || "#6366f1";
  const shown = filtered.slice(0, visible);

  return (
    <Sheet open={!!data} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="flex w-full flex-col p-0 sm:max-w-lg">
        <div className="px-5 py-4 text-white" style={{ background: tint }}>
          <SheetHeader className="space-y-1 text-left">
            <SheetTitle className="flex items-center gap-2 text-white">
              <ClipboardList className="h-5 w-5" />
              {data.title}
            </SheetTitle>
            <SheetDescription className="text-white/80">
              {hasFilters
                ? `${filtered.length} of ${rows.length} submission${rows.length === 1 ? "" : "s"}`
                : data.subtitle || `${rows.length} underlying submission${rows.length === 1 ? "" : "s"}`}
            </SheetDescription>
          </SheetHeader>
        </div>

        {/* ── Filters ── */}
        <div className="space-y-2 border-b bg-muted/30 px-4 py-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search ID, supervisor, community, answer…"
              className="h-9 pl-8 text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            {moduleOptions.length > 0 && (
              <Select value={moduleFilter} onValueChange={setModuleFilter}>
                <SelectTrigger className="col-span-2 h-8 text-xs"><SelectValue placeholder="Module" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All modules</SelectItem>
                  {moduleOptions.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            <Select value={stateFilter} onValueChange={(v) => { setStateFilter(v); setLgaFilter(ALL); }}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="State" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All states</SelectItem>
                {stateOptions.map((st) => <SelectItem key={st} value={st}>{st}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={lgaFilter} onValueChange={setLgaFilter} disabled={lgaOptions.length === 0}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="LGA" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All LGAs</SelectItem>
                {lgaOptions.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-1">
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-8 px-2 text-xs" aria-label="From date" />
            </div>
            <div className="flex items-center gap-1">
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-8 px-2 text-xs" aria-label="To date" />
            </div>
          </div>
          {hasFilters && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
            >
              <X className="h-3 w-3" /> Clear filters
            </button>
          )}
        </div>

        {/* ── List (incremental scroll) ── */}
        <div className="min-h-0 flex-1 overflow-y-auto" onScroll={onScroll}>
          <div className="space-y-2 p-4">
            {filtered.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                {rows.length === 0 ? "No submissions to show." : (
                  <span className="flex flex-col items-center gap-1">
                    <Filter className="h-5 w-5 opacity-50" />
                    No submissions match these filters.
                  </span>
                )}
              </p>
            ) : (
              <>
                {shown.map((s) => (
                  <SubmissionCard key={s.id} s={s} flat={flat} followUpFields={followUpFields} />
                ))}
                {visible < filtered.length && (
                  <p className="py-3 text-center text-[11px] text-muted-foreground">
                    Showing {shown.length} of {filtered.length} — scroll for more
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

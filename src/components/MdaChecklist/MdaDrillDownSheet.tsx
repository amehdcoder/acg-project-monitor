/**
 * MDA Dashboard drill-down
 * ────────────────────────────────────────────────────────────────────────
 * Renders the EXACT underlying submissions behind a clicked KPI / follow-up
 * card. Each submission is shown as an expandable card revealing every
 * recorded answer (including follow-up answers merged onto the community).
 *
 * It is fully form-driven — questions/groups are flattened from the current
 * form structure so labels stay accurate after any Form Builder edit.
 */
import { useMemo, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronDown, MapPin, User2, CalendarClock, ClipboardList } from "lucide-react";

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
  // select_multiple often stored as space-joined values
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
  if (!data) return null;
  const tint = data.tint || "#6366f1";

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
              {data.subtitle || `${data.rows.length} underlying submission${data.rows.length === 1 ? "" : "s"}`}
            </SheetDescription>
          </SheetHeader>
        </div>
        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-2 p-4">
            {data.rows.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">No submissions to show.</p>
            ) : (
              data.rows.map((s) => (
                <SubmissionCard key={s.id} s={s} flat={flat} followUpFields={followUpFields} />
              ))
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

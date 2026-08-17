/**
 * Community Visited register — every community captured on the Integrated MDA
 * Supervisory Checklist with the KoboToolbox device metadata timestamps
 * (`start` = form opened, `end` = form saved).
 *
 * Selecting a monitor / supervisor in the performance tables filters this
 * register instantly to that person's records.
 */
import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MapPin, X } from "lucide-react";
import { resolveChecklistValue } from "./checklistSchema";

export interface CommunityVisitRow {
  key: string;
  community: string;
  state: string;
  lga: string;
  ward: string;
  flhf: string;
  person: string;
  start: string;
  end: string;
  duration: string;
}

const txt = (v: unknown) => String(v ?? "").trim();

/** Format a Kobo ISO timestamp (with device offset) for display. */
function fmt(v: unknown): string {
  const s = txt(v);
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleString(undefined, {
    year: "numeric", month: "short", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
}

function durationOf(start: unknown, end: unknown): string {
  const a = new Date(txt(start)).getTime();
  const b = new Date(txt(end)).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return "—";
  const mins = Math.round((b - a) / 60_000);
  if (mins < 60) return `${mins} min`;
  return `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, "0")}m`;
}

/**
 * Build the visit rows. `resolvePerson` maps a checklist record to the
 * canonical monitor / supervisor name used by the performance tables, so the
 * click-to-filter interaction matches fuzzy-resolved spelling variants too.
 */
export function buildCommunityVisits(
  parents: Record<string, unknown>[],
  resolvePerson: (p: Record<string, unknown>) => string,
): CommunityVisitRow[] {
  const rows: CommunityVisitRow[] = [];
  parents.forEach((p, i) => {
    const community = txt(resolveChecklistValue("COMMUNITIES", p.COMMUNITIES) || p.COMMUNITIES);
    if (!community) return;
    const start = txt(p._start) || txt(p._submission_time);
    const end = txt(p._end) || txt(p._submission_time);
    rows.push({
      key: `${txt(p._uuid) || txt(p._id) || i}`,
      community,
      state: txt(resolveChecklistValue("State", p.State) || p.State),
      lga: txt(resolveChecklistValue("LGA", p.LGA) || p.LGA),
      ward: txt(resolveChecklistValue("Ward", p.Ward) || p.Ward),
      flhf: txt(p.FLHF),
      person: resolvePerson(p),
      start,
      end,
      duration: durationOf(start, end),
    });
  });
  return rows.sort((a, b) => (b.start || "").localeCompare(a.start || ""));
}

export default function CommunityVisitedTable({
  rows, selected, onClearSelection,
}: {
  rows: CommunityVisitRow[];
  selected: string | null;
  onClearSelection: () => void;
}) {
  const filtered = useMemo(() => {
    if (!selected) return rows;
    const k = selected.trim().toLowerCase();
    return rows.filter((r) => r.person.trim().toLowerCase() === k);
  }, [rows, selected]);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
        {selected ? (
          <>
            <Badge variant="secondary" className="gap-1 text-[10px]">
              <MapPin className="h-3 w-3" /> {selected}
            </Badge>
            <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" onClick={onClearSelection}>
              <X className="h-3 w-3 mr-1" /> Clear
            </Button>
          </>
        ) : (
          <span>Click a name in the performance tables to filter these visits.</span>
        )}
        <span className="ml-auto">
          <strong className="text-foreground">{filtered.length.toLocaleString()}</strong> visit{filtered.length === 1 ? "" : "s"}
        </span>
      </div>

      {filtered.length === 0 ? (
        <div className="h-[180px] flex items-center justify-center text-xs text-muted-foreground">
          No community visits for this selection
        </div>
      ) : (
        <div className="max-h-[340px] overflow-auto rounded-md border">
          <table className="w-full min-w-[720px] text-xs">
            <thead className="bg-muted/60 sticky top-0 z-10">
              <tr>
                <th className="text-left px-2 py-2 font-semibold whitespace-nowrap">Name of Community</th>
                <th className="text-left px-2 py-2 font-semibold whitespace-nowrap">Ward / LGA</th>
                <th className="text-left px-2 py-2 font-semibold whitespace-nowrap">Monitor / Supervisor</th>
                <th className="text-left px-2 py-2 font-semibold whitespace-nowrap">Start Time</th>
                <th className="text-left px-2 py-2 font-semibold whitespace-nowrap">End Time</th>
                <th className="text-right px-2 py-2 font-semibold whitespace-nowrap">Duration</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.key} className="border-t hover:bg-muted/30 align-top">
                  <td className="px-2 py-1.5 font-medium whitespace-normal break-words">{r.community}</td>
                  <td className="px-2 py-1.5 text-muted-foreground whitespace-normal break-words">
                    {[r.ward, r.lga].filter(Boolean).join(" · ") || "—"}
                  </td>
                  <td className="px-2 py-1.5 whitespace-normal break-words">{r.person || "—"}</td>
                  <td className="px-2 py-1.5 tabular-nums whitespace-nowrap">{fmt(r.start)}</td>
                  <td className="px-2 py-1.5 tabular-nums whitespace-nowrap">{fmt(r.end)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap">{r.duration}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

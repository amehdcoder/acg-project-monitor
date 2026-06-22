import { useMemo } from "react";
import { ArrowLeft, History, CheckCircle2, Layers, AlertTriangle, Trash2, Loader2 } from "lucide-react";

export interface DuplicateCopy {
  id: string;
  validator: string;
  date: string | null;
  kept: boolean;
}
export interface DuplicateGroup {
  schoolKey: string;
  school: string;
  code: string;
  state: string;
  lga: string;
  total: number;
  extras: number;
  crossValidator: boolean;
  validators: string[];
  copies: DuplicateCopy[];
}

interface Props {
  validator: string;
  groups: DuplicateGroup[];
  onClose: () => void;
  canDelete?: boolean;
  onDelete?: (id: string, label: string) => void;
  deletingId?: string | null;
}

const fmt = (n: number) => n.toLocaleString();

// Admin drill-down for a single validator: shows every school they validated
// more than once, with each of their copies marked retained (the survivor the
// dashboard counts) vs superseded (an extra duplicate). This makes irregular
// cases easy to verify school-by-school.
export default function BloombergValidatorDrilldown({
  validator,
  groups,
  onClose,
  canDelete,
  onDelete,
  deletingId,
}: Props) {
  const data = useMemo(() => {
    const rows = groups
      .map((g) => {
        const mine = g.copies.filter((c) => c.validator === validator);
        if (mine.length === 0) return null;
        const retained = mine.filter((c) => c.kept).length;
        const superseded = mine.filter((c) => !c.kept).length;
        return { group: g, mine, retained, superseded };
      })
      .filter(Boolean) as { group: DuplicateGroup; mine: DuplicateCopy[]; retained: number; superseded: number }[];
    rows.sort(
      (a, b) => b.superseded - a.superseded || a.group.school.localeCompare(b.group.school),
    );
    const totals = rows.reduce(
      (t, r) => ({
        schools: t.schools + 1,
        retained: t.retained + r.retained,
        superseded: t.superseded + r.superseded,
        entries: t.entries + r.mine.length,
      }),
      { schools: 0, retained: 0, superseded: 0, entries: 0 },
    );
    return { rows, totals };
  }, [groups, validator]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#f4f6fb]">
      <div className="shrink-0 px-4 py-4 text-white" style={{ background: "linear-gradient(160deg, #0c2340, #163a63)" }}>
        <div className="flex items-center gap-3">
          <button onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 hover:bg-white/20">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-bold">{validator}</h1>
            <p className="text-xs text-white/70">Duplicate validations by school — superseded vs retained</p>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4 space-y-4">
        {/* Summary KPIs */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-border bg-card p-3 shadow-sm">
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground"><Layers className="h-3.5 w-3.5" /> Schools duplicated</div>
            <div className="mt-1 text-2xl font-bold text-foreground">{fmt(data.totals.schools)}</div>
          </div>
          <div className="rounded-xl border border-border bg-card p-3 shadow-sm">
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground"><History className="h-3.5 w-3.5" /> Total entries</div>
            <div className="mt-1 text-2xl font-bold text-foreground">{fmt(data.totals.entries)}</div>
          </div>
          <div className="rounded-xl border border-border bg-card p-3 shadow-sm">
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground"><AlertTriangle className="h-3.5 w-3.5" /> Superseded</div>
            <div className="mt-1 text-2xl font-bold text-amber-600">{fmt(data.totals.superseded)}</div>
          </div>
          <div className="rounded-xl border border-border bg-card p-3 shadow-sm">
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground"><CheckCircle2 className="h-3.5 w-3.5" /> Retained</div>
            <div className="mt-1 text-2xl font-bold text-emerald-600">{fmt(data.totals.retained)}</div>
          </div>
        </div>

        <p className="rounded-lg border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
          A school's most recent submission is <span className="font-semibold text-emerald-600">retained</span> (counted on the dashboard);
          older copies are <span className="font-semibold text-amber-600">superseded</span> duplicates. Cross-validator schools were also
          validated by someone else — verify which figure is correct in the field.
        </p>

        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          {data.rows.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">This validator has no duplicate validations.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="py-1.5 pr-3 font-semibold">School</th>
                    <th className="py-1.5 pr-3 font-semibold">State / LGA</th>
                    <th className="py-1.5 pr-3 font-semibold">Date sent</th>
                    <th className="py-1.5 pr-3 font-semibold">Entry</th>
                    {canDelete && <th className="py-1.5 pr-3 text-right font-semibold">Action</th>}
                  </tr>
                </thead>
                <tbody>
                  {data.rows.flatMap((r) =>
                    r.mine
                      .slice()
                      .sort((a, b) => Number(b.kept) - Number(a.kept))
                      .map((c, idx) => (
                        <tr key={c.id} className={`border-b border-border/50 last:border-0 ${idx === 0 ? "border-t-2 border-t-border" : ""}`}>
                          <td className="py-1.5 pr-3 text-foreground">
                            {idx === 0 ? (
                              <span className="font-medium">
                                {r.group.school}{" "}
                                <span className="text-[10px] font-normal text-muted-foreground">({r.group.total} total)</span>
                                {r.group.crossValidator && (
                                  <span className="ml-1.5 rounded-full bg-rose-100 px-1.5 py-0.5 text-[9px] font-semibold text-rose-700">multiple validators</span>
                                )}
                              </span>
                            ) : (
                              <span className="pl-3 text-muted-foreground">↳ {r.group.code}</span>
                            )}
                          </td>
                          <td className="py-1.5 pr-3 text-muted-foreground">{idx === 0 ? `${r.group.state} / ${r.group.lga}` : ""}</td>
                          <td className="py-1.5 pr-3 text-muted-foreground">{c.date ? new Date(c.date).toLocaleString() : "—"}</td>
                          <td className="py-1.5 pr-3">
                            {c.kept ? (
                              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">Retained</span>
                            ) : (
                              <span className="rounded-full bg-amber-200 px-2 py-0.5 text-[10px] font-semibold text-amber-800">Superseded</span>
                            )}
                          </td>
                          {canDelete && (
                            <td className="py-1.5 pr-3 text-right">
                              {!c.kept && onDelete && (
                                <button
                                  onClick={() => onDelete(c.id, `${r.group.school} (duplicate)`)}
                                  disabled={deletingId === c.id}
                                  className="inline-flex h-7 w-7 items-center justify-center rounded-md text-amber-700 hover:bg-amber-100 disabled:opacity-50"
                                  title="Delete this superseded duplicate"
                                >
                                  {deletingId === c.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                                </button>
                              )}
                            </td>
                          )}
                        </tr>
                      )),
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

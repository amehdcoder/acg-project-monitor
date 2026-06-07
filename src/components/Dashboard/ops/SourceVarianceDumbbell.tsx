interface VarianceRow {
  name: string;
  summary: number | null;
  ces: number | null;
  supervision: number | null;
}

interface SourceVarianceDumbbellProps {
  rows: VarianceRow[];
}

const SERIES = [
  { key: "summary", label: "Treatment Summary", color: "#16a34a" },
  { key: "ces", label: "Coverage Evaluation (CES)", color: "#2563eb" },
  { key: "supervision", label: "MDA Supervision", color: "#f97316" },
] as const;

/**
 * Coverage spread between the three triangulation sources per LGA, rendered as a
 * dumbbell: a connecting line from the lowest to the highest source value with a
 * coloured dot for each source. A wide line = sources disagree (investigate).
 */
export default function SourceVarianceDumbbell({ rows }: SourceVarianceDumbbellProps) {
  if (rows.length === 0) {
    return (
      <div className="flex items-center justify-center h-[320px] text-sm font-bold text-slate-400">
        No LGA yet has two comparable sources.
      </div>
    );
  }
  const pct = (v: number) => `${v}%`;
  return (
    <div>
      <div className="flex flex-wrap items-center gap-4 mb-3">
        {SERIES.map((s) => (
          <div key={s.key} className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: s.color }} />
            <span className="text-[10px] font-bold text-slate-600">{s.label}</span>
          </div>
        ))}
      </div>
      <div className="space-y-2.5 max-h-[360px] overflow-y-auto pr-1">
        {rows.map((r) => {
          const vals = SERIES.map((s) => ({ ...s, v: r[s.key] })).filter((x) => x.v != null) as {
            key: string; label: string; color: string; v: number;
          }[];
          const min = Math.min(...vals.map((x) => x.v));
          const max = Math.max(...vals.map((x) => x.v));
          return (
            <div key={r.name} className="flex items-center gap-2">
              <span className="w-24 shrink-0 text-[10px] font-bold text-slate-600 truncate" title={r.name}>{r.name}</span>
              <div className="relative flex-1 h-5">
                {/* baseline */}
                <div className="absolute inset-x-0 top-1/2 h-px bg-slate-100" />
                {/* spread line */}
                {vals.length > 1 && (
                  <div
                    className="absolute top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-slate-300"
                    style={{ left: `${min}%`, width: `${Math.max(0, max - min)}%` }}
                  />
                )}
                {vals.map((x) => (
                  <span
                    key={x.key}
                    title={`${x.label}: ${pct(x.v)}`}
                    className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full border border-white shadow-sm"
                    style={{ left: `${x.v}%`, background: x.color }}
                  />
                ))}
              </div>
              <span className="w-12 shrink-0 text-right text-[10px] font-black text-slate-500">
                {vals.length > 1 ? `${Math.round(max - min)}pp` : "—"}
              </span>
            </div>
          );
        })}
      </div>
      <div className="flex justify-between mt-1 px-24 text-[9px] font-bold text-slate-400">
        <span>0%</span><span>50%</span><span>100%</span>
      </div>
    </div>
  );
}

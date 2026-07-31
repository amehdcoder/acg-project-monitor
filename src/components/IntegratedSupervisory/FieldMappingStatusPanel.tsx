import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { CheckCircle2, CircleSlash, Loader2, Search, TriangleAlert } from "lucide-react";
import { computeMappingStatus, type MappingState } from "./checklistSchema";
import type { KoboCache } from "./koboClient";

const STATE_META: Record<MappingState, { label: string; cls: string; Icon: React.ElementType }> = {
  mapped: { label: "Mapped", cls: "border-emerald-300 bg-emerald-50 text-emerald-700", Icon: CheckCircle2 },
  missing_label: { label: "Missing Label", cls: "border-amber-300 bg-amber-50 text-amber-800", Icon: TriangleAlert },
  not_in_data: { label: "Not in Kobo Data", cls: "border-rose-300 bg-rose-50 text-rose-700", Icon: CircleSlash },
  syncing: { label: "Syncing", cls: "border-sky-300 bg-sky-50 text-sky-700", Icon: Loader2 },
};

export default function FieldMappingStatusPanel({ cache }: { cache: KoboCache | null }) {
  const [q, setQ] = useState("");
  const statuses = useMemo(
    () => computeMappingStatus(cache?.results ?? [], cache?.survey ?? null),
    [cache],
  );

  const counts = useMemo(() => {
    const c: Record<MappingState, number> = { mapped: 0, missing_label: 0, not_in_data: 0, syncing: 0 };
    for (const s of statuses) c[s.state]++;
    return c;
  }, [statuses]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return statuses;
    return statuses.filter((s) => `${s.label} ${s.name} ${s.section}`.toLowerCase().includes(needle));
  }, [statuses, q]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {(Object.keys(STATE_META) as MappingState[]).map((k) => (
          counts[k] > 0 ? (
            <Badge key={k} variant="outline" className={STATE_META[k].cls}>{STATE_META[k].label}: {counts[k]}</Badge>
          ) : null
        ))}
        <span className="text-[11px] text-muted-foreground ml-auto">{statuses.length} declared fields</span>
      </div>

      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search fields..." className="pl-8 h-9" />
      </div>

      <div className="rounded-md border max-h-[300px] overflow-y-auto">
        <table className="w-full text-xs">
          <thead className="bg-muted/60 sticky top-0">
            <tr>
              <th className="text-left px-2 py-1.5 font-semibold">Field</th>
              <th className="text-left px-2 py-1.5 font-semibold">Section</th>
              <th className="text-left px-2 py-1.5 font-semibold">Answered</th>
              <th className="text-left px-2 py-1.5 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((s) => {
              const meta = STATE_META[s.state];
              return (
                <tr key={s.name} className="border-t">
                  <td className="px-2 py-1.5">
                    <div className="font-medium truncate max-w-[230px]" title={s.label}>{s.label}</div>
                    <div className="font-mono text-[10px] text-muted-foreground truncate max-w-[230px]">{s.koboPath ?? s.name}</div>
                  </td>
                  <td className="px-2 py-1.5 text-muted-foreground">{s.section}{s.repeat ? " (repeat)" : ""}</td>
                  <td className="px-2 py-1.5">{s.answered}</td>
                  <td className="px-2 py-1.5">
                    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-semibold ${meta.cls}`}>
                      <meta.Icon className={`h-3 w-3 ${s.state === "syncing" ? "animate-spin" : ""}`} /> {meta.label}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import { Users, Search, FileSpreadsheet, ShieldAlert } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { IRF_CATEGORY_FORMS } from "@/lib/irf/categoryForms";
import type { IrfReport } from "@/lib/irf/definition";

interface Props {
  rows: IrfReport[];
  duplicateIds: Set<string>;
}

interface SubmitterRow {
  id: string;
  name: string;
  forms: { name: string; count: number }[];
  total: number;
  duplicates: number;
  lastAt: string | null;
}

const formName = (id: string) =>
  IRF_CATEGORY_FORMS.find((f) => f.id === id)?.short || (id === "other" ? "Legacy / Other" : id);

export default function IrfSubmitterPanel({ rows, duplicateIds }: Props) {
  const [names, setNames] = useState<Record<string, string>>({});
  const [q, setQ] = useState("");

  const ids = useMemo(() => Array.from(new Set(rows.map((r) => r.created_by).filter(Boolean))) as string[], [rows]);

  useEffect(() => {
    if (!ids.length) return;
    let active = true;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("user_id, first_name, last_name, email")
        .in("user_id", ids);
      if (!active || !data) return;
      const map: Record<string, string> = {};
      data.forEach((p: any) => {
        const full = [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
        map[p.user_id] = full || p.email || "Unknown user";
      });
      setNames(map);
    })();
    return () => { active = false; };
  }, [ids]);

  const submitters = useMemo<SubmitterRow[]>(() => {
    const by = new Map<string, { forms: Map<string, number>; total: number; duplicates: number; lastAt: string | null }>();
    for (const r of rows) {
      const uid = r.created_by || "unknown";
      let entry = by.get(uid);
      if (!entry) { entry = { forms: new Map(), total: 0, duplicates: 0, lastAt: null }; by.set(uid, entry); }
      const cat = (r as any).form_category || "other";
      entry.forms.set(cat, (entry.forms.get(cat) || 0) + 1);
      entry.total += 1;
      if (duplicateIds.has(r.id)) entry.duplicates += 1;
      const at = r.created_at || null;
      if (at && (!entry.lastAt || at > entry.lastAt)) entry.lastAt = at;
    }
    return [...by.entries()]
      .map(([id, e]) => ({
        id,
        name: names[id] || (id === "unknown" ? "Unknown user" : "Loading…"),
        forms: [...e.forms.entries()].map(([f, count]) => ({ name: formName(f), count })).sort((a, b) => b.count - a.count),
        total: e.total,
        duplicates: e.duplicates,
        lastAt: e.lastAt,
      }))
      .sort((a, b) => b.total - a.total);
  }, [rows, duplicateIds, names]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return submitters;
    return submitters.filter((s) => s.name.toLowerCase().includes(t) || s.forms.some((f) => f.name.toLowerCase().includes(t)));
  }, [submitters, q]);

  const totalDupes = useMemo(() => submitters.reduce((a, s) => a + s.duplicates, 0), [submitters]);

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b bg-gradient-to-r from-[#6a4c93]/10 to-[#0b5394]/10 p-4">
        <Users className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">Data Submitters & Submissions</h3>
        <span className="ml-auto text-xs text-muted-foreground">
          {submitters.length} submitter(s) · {totalDupes} duplicate(s)
        </span>
      </div>

      <div className="border-b p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by submitter or form…" className="h-9 pl-8 text-sm" />
        </div>
      </div>

      {!filtered.length ? (
        <div className="flex h-32 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
          <FileSpreadsheet className="h-7 w-7 opacity-40" />
          No matching submitters.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
                <th className="px-3 py-2 text-left font-semibold">Submitter</th>
                <th className="px-3 py-2 text-left font-semibold">Forms submitted</th>
                <th className="px-3 py-2 text-right font-semibold">Submissions</th>
                <th className="px-3 py-2 text-right font-semibold">Duplicates</th>
                <th className="px-3 py-2 text-right font-semibold">Last submission</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr key={s.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="px-3 py-2 font-medium text-foreground">{s.name}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {s.forms.map((f) => (
                        <span key={f.name} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-foreground">
                          {f.name} <span className="text-muted-foreground">×{f.count}</span>
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right font-semibold text-foreground">{s.total}</td>
                  <td className="px-3 py-2 text-right">
                    {s.duplicates > 0 ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-600 dark:text-amber-400">
                        <ShieldAlert className="h-3 w-3" /> {s.duplicates}
                      </span>
                    ) : (
                      <span className="text-xs text-emerald-600 dark:text-emerald-400">None</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right text-xs text-muted-foreground">
                    {s.lastAt ? new Date(s.lastAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="border-t px-3 py-2 text-[11px] text-muted-foreground">
        Duplicate flags use the same signature detection as the duplicate review panel; counts above reflect auto-flagged repeat submissions per submitter.
      </p>
    </Card>
  );
}

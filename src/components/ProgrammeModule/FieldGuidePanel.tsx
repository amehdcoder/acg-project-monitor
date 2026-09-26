import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { BookOpenCheck, CalendarX2, Fingerprint, MapPinned, Ruler, Stethoscope, UserRound, Users } from "lucide-react";
import { RESOLVE_REASONS } from "./BrainFlagDialogs";

/**
 * Field guide: which beneficiary-record fields most often go wrong, with
 * concrete examples, plus live evidence from this module's reviewed flags.
 */
type Guide = { field: string; icon: typeof UserRound; risk: "High" | "Medium"; why: string; wrong: string[]; right: string; check: string };

const GUIDE: Guide[] = [
  { field: "Age / date of birth", icon: UserRound, risk: "High",
    why: "Typed by hand, often estimated, and easy to swap day/month or enter the registration year.",
    wrong: ["Age 140 or age 0 for an adult", "Date of birth 2026-09-20 (same as registration day)", "Age 12 with marital status ‘Married’ and 5 children"],
    right: "Age 34, born 1992 — consistent with marital status and household role.",
    check: "Ask for a card or event calendar; confirm age agrees with household role and marital status." },
  { field: "State → LGA → Ward", icon: MapPinned, risk: "High",
    why: "Similar ward names exist in different LGAs; free-text spellings drift from the INEC registry.",
    wrong: ["Ward ‘Kofa’ recorded under an LGA that has no Kofa ward", "LGA ‘Dutse’ with state ‘Kano’", "‘Kiru’, ‘Kirru’ and ‘kiru LGA’ for the same place"],
    right: "Pick from the cascading list: Jigawa → Dutse → Kachi.",
    check: "Always use the dropdowns; if you must type, match the official spelling." },
  { field: "GPS latitude / longitude", icon: MapPinned, risk: "High",
    why: "Captured before the fix settles, typed manually, or swapped.",
    wrong: ["Latitude 8.5, longitude 12.0 swapped (lands in Cameroon)", "0.0, 0.0 (no fix)", "A Kano record plotted in Lagos"],
    right: "Latitude 11.99, longitude 8.52 for Kano city — inside Nigeria (lat 4–14, long 2.7–14.7).",
    check: "Wait for the accuracy to drop below 20 m before saving; glance at the map pin." },
  { field: "Registration & follow-up dates", icon: CalendarX2, risk: "High",
    why: "Device clocks are wrong, or the next visit is set before the last one.",
    wrong: ["Next follow-up 2024-01-10 on a record registered 2026-03-02", "Service date in the future", "Year typed as 2062"],
    right: "Registered 2026-03-02, next follow-up 2026-04-02.",
    check: "Check the phone date before fieldwork; follow-ups must come after registration." },
  { field: "Sex & sex-specific data", icon: Users, risk: "Medium",
    why: "Defaults left unchanged or wrong option tapped.",
    wrong: ["Male recorded as pregnant", "Hydrocele stage filled for a female", "Sex blank with a female first name"],
    right: "Female, pregnant: yes — ivermectin deferred.",
    check: "Confirm sex first; the form hides options that don't apply." },
  { field: "Clinical stage & morbidity", icon: Stethoscope, risk: "Medium",
    why: "Stages are judgement calls and often don't match the photo or earlier visits.",
    wrong: ["Lymphoedema stage 7 at registration, stage 1 a week later", "Stage recorded but no limb selected", "Photo shows no swelling but stage 5"],
    right: "Stage 3, left leg, photo attached; follow-up stage 3 or 2.",
    check: "Compare with the previous visit and the photo; big jumps need a comment." },
  { field: "Measurements & counts", icon: Ruler, risk: "Medium",
    why: "Wrong units (cm vs m, kg vs lb) or an extra zero.",
    wrong: ["Height 17 cm for an adult", "Weight 650 kg", "Household size 60"],
    right: "Height 170 cm, weight 65 kg, household size 6.",
    check: "Say the number back to the person; check the unit on the form." },
  { field: "Duplicate people", icon: Fingerprint, risk: "Medium",
    why: "The same person registered twice at different visits or by different CDDs.",
    wrong: ["Two records ‘Aisha Musa’, same village, same age, different Case IDs"],
    right: "Search by name and village before registering; open the existing record instead.",
    check: "Use search first; flag suspected duplicates rather than deleting them." },
];

export default function FieldGuidePanel({ moduleId }: { moduleId?: string }) {
  const [rows, setRows] = useState<{ cells: any[]; status: string; reason_code: string | null }[]>([]);
  const [q, setQ] = useState("");
  useEffect(() => {
    if (!moduleId) return;
    void supabase.from("brain_flags" as never).select("cells,status,reason_code").eq("module_id", moduleId).limit(5000)
      .then(({ data }) => setRows((data as any[]) || []));
  }, [moduleId]);

  const live = useMemo(() => {
    const m = new Map<string, { flagged: number; real: number; reviewed: number; example?: string }>();
    for (const r of rows) {
      const real = RESOLVE_REASONS.find((x) => x.code === r.reason_code)?.realError;
      for (const c of new Set((r.cells || []).map((c: any) => String(c.col)))) {
        const k = c.startsWith("p:") ? c.slice(2).replace(/_/g, " ") : c;
        const e = m.get(k) ?? { flagged: 0, real: 0, reviewed: 0 };
        e.flagged++;
        if (r.status === "resolved") { e.reviewed++; if (real) e.real++; }
        if (!e.example) { const cell = (r.cells || []).find((x: any) => x.col === c); if (cell) e.example = `${cell.original ?? "blank"}${cell.suggested !== undefined ? ` (expected ≈ ${cell.suggested})` : ""}`; }
        m.set(k, e);
      }
    }
    return [...m.entries()].map(([field, v]) => ({ field, ...v })).sort((a, b) => b.flagged - a.flagged).slice(0, 8);
  }, [rows]);

  const guide = GUIDE.filter((g) => !q || `${g.field} ${g.why} ${g.wrong.join(" ")}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight"><BookOpenCheck className="h-5 w-5 text-primary" />Field guide</h2>
          <p className="text-sm text-muted-foreground">The fields that most often go wrong in beneficiary records, with examples, so errors are caught at the doorstep before the brain has to flag them.</p>
        </div>
        <Input className="h-8 w-60" placeholder="Search fields or examples" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <Card>
        <CardHeader><CardTitle>What the brain is finding in this project</CardTitle></CardHeader>
        <CardContent className="p-0">
          {!live.length ? <p className="px-4 pb-4 text-sm text-muted-foreground">No flags yet. As the brain and your team flag records, the fields with the most problems appear here.</p> : (
            <table className="w-full text-sm">
              <thead><tr className="border-b border-border/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-2 font-semibold">Field</th><th className="px-4 py-2 font-semibold">Times flagged</th><th className="px-4 py-2 font-semibold">Confirmed real errors</th><th className="px-4 py-2 font-semibold">Example</th>
              </tr></thead>
              <tbody>{live.map((l) => (
                <tr key={l.field} className="border-b border-border/40 hover:bg-muted/40">
                  <td className="px-4 py-2 font-medium">{l.field}</td>
                  <td className="px-4 py-2">{l.flagged}</td>
                  <td className="px-4 py-2">{l.reviewed ? `${l.real} of ${l.reviewed} reviewed (${Math.round(100 * l.real / l.reviewed)}%)` : "not reviewed yet"}</td>
                  <td className="px-4 py-2 font-mono text-xs text-muted-foreground">{l.example ?? "—"}</td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-3 lg:grid-cols-2">
        {guide.map((g) => (
          <Card key={g.field} className={`border-l-2 ${g.risk === "High" ? "border-l-destructive" : "border-l-primary"}`}>
            <CardContent className="space-y-2 p-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="flex items-center gap-2 font-semibold"><g.icon className="h-4 w-4 text-primary" />{g.field}</h3>
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><span className={`h-2 w-2 rounded-full ${g.risk === "High" ? "bg-destructive" : "bg-primary"}`} />{g.risk} error risk</span>
              </div>
              <p className="text-sm text-muted-foreground">{g.why}</p>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Common mistakes</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm">{g.wrong.map((w) => <li key={w}>{w}</li>)}</ul>
              </div>
              <p className="text-sm"><span className="font-semibold">Correct: </span>{g.right}</p>
              <p className="rounded-md bg-muted/50 p-2 text-xs"><span className="font-semibold">Before saving: </span>{g.check}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

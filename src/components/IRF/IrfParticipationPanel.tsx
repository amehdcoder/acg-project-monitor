import { useEffect, useMemo, useState } from "react";
import { UserCheck, UserX, Download, FileSpreadsheet, FileText, FileType2, Loader2, CheckCircle2, Clock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { IRF_CATEGORY_FORMS } from "@/lib/irf/categoryForms";
import type { IrfReport } from "@/lib/irf/definition";
import {
  exportParticipationExcel,
  exportParticipationWord,
  exportParticipationPdf,
  type ParticipationTable,
} from "@/lib/irf/participationExport";

interface Props {
  rows: IrfReport[];
  duplicateIds: Set<string>;
  projectId?: string | null;
}

interface Grant {
  form_category: string;
  grant_type: "user" | "designation";
  user_id: string | null;
  designation: string | null;
  project_id: string | null;
}

interface Profile {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  designation: string | null;
  last_seen_at: string | null;
}

const formShort = (id: string) =>
  IRF_CATEGORY_FORMS.find((f) => f.id === id)?.short || (id === "other" ? "Legacy / Other" : id);

const nameOf = (p?: Profile) =>
  p ? [p.first_name, p.last_name].filter(Boolean).join(" ").trim() || p.email || "Unknown user" : "Unknown user";

const fmtDate = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
    : "Never active";

interface SubmittedRow {
  userId: string;
  name: string;
  granted: string[];
  submitted: { form: string; count: number }[];
  total: number;
}
interface PendingRow {
  userId: string;
  name: string;
  granted: string[];
  lastActive: string | null;
}

export default function IrfParticipationPanel({ rows, duplicateIds, projectId }: Props) {
  const [grants, setGrants] = useState<Grant[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      const { data: g } = await supabase.from("irf_form_access" as any).select("form_category, grant_type, user_id, designation, project_id");
      const grantRows = ((g as any) || []) as Grant[];
      // Project-scoped grants only (null project = applies everywhere).
      const scoped = grantRows.filter((x) => !x.project_id || !projectId || x.project_id === projectId);
      const { data: profs } = await supabase
        .from("profiles")
        .select("user_id, first_name, last_name, email, designation, last_seen_at");
      if (!active) return;
      const pmap: Record<string, Profile> = {};
      ((profs as any) || []).forEach((p: Profile) => { pmap[p.user_id] = p; });
      setGrants(scoped);
      setProfiles(pmap);
      setLoading(false);
    })();
    return () => { active = false; };
  }, [projectId]);

  // Map userId -> Set of granted form-category ids (resolving designation grants).
  const grantedByUser = useMemo(() => {
    const map = new Map<string, Set<string>>();
    const add = (uid: string, cat: string) => {
      if (!map.has(uid)) map.set(uid, new Set());
      map.get(uid)!.add(cat);
    };
    const allProfiles = Object.values(profiles);
    for (const g of grants) {
      if (g.grant_type === "user" && g.user_id) {
        add(g.user_id, g.form_category);
      } else if (g.grant_type === "designation" && g.designation) {
        allProfiles
          .filter((p) => (p.designation || "") === g.designation)
          .forEach((p) => add(p.user_id, g.form_category));
      }
    }
    return map;
  }, [grants, profiles]);

  // Submissions grouped by user -> category -> unique count (excludes duplicates).
  const submittedByUser = useMemo(() => {
    const map = new Map<string, Map<string, number>>();
    for (const r of rows) {
      const uid = (r as any).created_by;
      if (!uid) continue;
      if (duplicateIds.has((r as any).id)) continue; // count unique only
      const cat = (r as any).form_category || "other";
      if (!map.has(uid)) map.set(uid, new Map());
      const inner = map.get(uid)!;
      inner.set(cat, (inner.get(cat) || 0) + 1);
    }
    return map;
  }, [rows, duplicateIds]);

  const { submitted, pending } = useMemo(() => {
    const submittedRows: SubmittedRow[] = [];
    const pendingRows: PendingRow[] = [];

    // Union of everyone granted access AND everyone who actually submitted.
    const userIds = new Set<string>([...grantedByUser.keys(), ...submittedByUser.keys()]);

    for (const uid of userIds) {
      const prof = profiles[uid];
      const granted = Array.from(grantedByUser.get(uid) || []).map(formShort).sort();
      const subMap = submittedByUser.get(uid);
      if (subMap && subMap.size) {
        const subs = Array.from(subMap.entries())
          .map(([form, count]) => ({ form: formShort(form), count }))
          .sort((a, b) => b.count - a.count);
        submittedRows.push({
          userId: uid,
          name: nameOf(prof),
          granted: granted.length ? granted : subs.map((s) => s.form),
          submitted: subs,
          total: subs.reduce((s, x) => s + x.count, 0),
        });
      } else {
        pendingRows.push({
          userId: uid,
          name: nameOf(prof),
          granted,
          lastActive: prof?.last_seen_at || null,
        });
      }
    }
    submittedRows.sort((a, b) => b.total - a.total);
    pendingRows.sort((a, b) => a.name.localeCompare(b.name));
    return { submitted: submittedRows, pending: pendingRows };
  }, [grantedByUser, submittedByUser, profiles]);

  const buildTables = (): ParticipationTable[] => {
    const submittedTable: ParticipationTable = {
      title: "Submitted — Active Data Contributors",
      subtitle: `${submitted.length} contributor(s) · generated ${new Date().toLocaleString()}`,
      accent: "16A34A",
      headers: ["Name", "Forms granted (should submit)", "Forms submitted", "Unique submissions per form"],
      rows: submitted.map((s) => [
        s.name,
        s.granted.join(", ") || "—",
        s.submitted.map((x) => x.form).join(", "),
        s.submitted.map((x) => `${x.form}: ${x.count}`).join("\n"),
      ]),
    };
    const pendingTable: ParticipationTable = {
      title: "Not Yet Submitted — Awaiting Data",
      subtitle: `${pending.length} user(s) with access but no submissions · generated ${new Date().toLocaleString()}`,
      accent: "DC2626",
      headers: ["Name", "Forms granted (should submit)", "Last active on the app"],
      rows: pending.map((p) => [p.name, p.granted.join(", ") || "—", fmtDate(p.lastActive)]),
    };
    return [submittedTable, pendingTable];
  };

  const doExport = async (kind: "excel" | "word" | "pdf") => {
    if (!submitted.length && !pending.length) {
      toast.error("No participation data to export yet.");
      return;
    }
    setBusy(true);
    try {
      const tables = buildTables();
      if (kind === "excel") await exportParticipationExcel(tables, "sarmaan-acsm-participation");
      else if (kind === "word") exportParticipationWord(tables, "sarmaan-acsm-participation");
      else exportParticipationPdf(tables, "sarmaan-acsm-participation");
      toast.success(`Participation tables exported as ${kind.toUpperCase()}.`);
    } catch (e: any) {
      toast.error(e?.message || "Export failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b bg-gradient-to-r from-[#0c2340] to-[#1a4a6e] p-4">
        <UserCheck className="h-4 w-4 text-white" />
        <h3 className="text-sm font-semibold text-white">Data Participation & Coverage</h3>
        <span className="ml-auto text-xs text-white/70">
          {submitted.length} submitted · {pending.length} pending
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="secondary" className="h-8 gap-1.5 text-xs" disabled={busy || loading}>
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              Download
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => doExport("excel")}>
              <FileSpreadsheet className="mr-2 h-4 w-4 text-emerald-600" /> Excel (.xlsx)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => doExport("word")}>
              <FileType2 className="mr-2 h-4 w-4 text-blue-600" /> Word (.doc)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => doExport("pdf")}>
              <FileText className="mr-2 h-4 w-4 text-red-600" /> PDF (.pdf)
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {loading ? (
        <div className="flex h-28 items-center justify-center text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading participation…
        </div>
      ) : (
        <div className="space-y-6 p-4">
          {/* Table 1 — Submitted */}
          <div>
            <div className="mb-2 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <h4 className="text-sm font-semibold text-foreground">Submitted — active data contributors</h4>
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                {submitted.length}
              </span>
            </div>
            {!submitted.length ? (
              <p className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">No submissions yet.</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full min-w-[720px] text-sm">
                  <thead>
                    <tr className="bg-emerald-600 text-left text-xs text-white">
                      <th className="px-3 py-2 font-semibold">Name</th>
                      <th className="px-3 py-2 font-semibold">Forms granted (should submit)</th>
                      <th className="px-3 py-2 font-semibold">Forms submitted</th>
                      <th className="px-3 py-2 text-right font-semibold">Unique submissions / form</th>
                    </tr>
                  </thead>
                  <tbody>
                    {submitted.map((s, i) => (
                      <tr key={s.userId} className={i % 2 ? "bg-background" : "bg-emerald-50/40 dark:bg-emerald-500/5"}>
                        <td className="px-3 py-2 font-medium text-foreground">{s.name}</td>
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap gap-1">
                            {s.granted.length ? s.granted.map((g) => (
                              <span key={g} className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-foreground">{g}</span>
                            )) : <span className="text-xs text-muted-foreground">—</span>}
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap gap-1">
                            {s.submitted.map((x) => (
                              <span key={x.form} className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">{x.form}</span>
                            ))}
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex flex-col items-end gap-0.5">
                            {s.submitted.map((x) => (
                              <span key={x.form} className="text-[11px] text-muted-foreground">
                                {x.form} <span className="font-bold text-foreground">×{x.count}</span>
                              </span>
                            ))}
                            <span className="mt-0.5 rounded bg-emerald-600 px-1.5 py-0.5 text-[10px] font-bold text-white">Total {s.total}</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Table 2 — Not yet submitted */}
          <div>
            <div className="mb-2 flex items-center gap-2">
              <UserX className="h-4 w-4 text-red-600" />
              <h4 className="text-sm font-semibold text-foreground">Not yet submitted — awaiting data</h4>
              <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-medium text-red-700 dark:bg-red-500/15 dark:text-red-300">
                {pending.length}
              </span>
            </div>
            {!pending.length ? (
              <p className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">Everyone with access has submitted. 🎉</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full min-w-[640px] text-sm">
                  <thead>
                    <tr className="bg-red-600 text-left text-xs text-white">
                      <th className="px-3 py-2 font-semibold">Name</th>
                      <th className="px-3 py-2 font-semibold">Forms granted (should submit)</th>
                      <th className="px-3 py-2 font-semibold">Last active on the app</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pending.map((p, i) => (
                      <tr key={p.userId} className={i % 2 ? "bg-background" : "bg-red-50/40 dark:bg-red-500/5"}>
                        <td className="px-3 py-2 font-medium text-foreground">{p.name}</td>
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap gap-1">
                            {p.granted.length ? p.granted.map((g) => (
                              <span key={g} className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-foreground">{g}</span>
                            )) : <span className="text-xs text-muted-foreground">—</span>}
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                            <Clock className="h-3 w-3" /> {fmtDate(p.lastActive)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

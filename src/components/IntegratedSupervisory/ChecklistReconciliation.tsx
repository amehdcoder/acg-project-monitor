/**
 * Automated reconciliation report.
 *
 * Compares the raw KoboToolbox submissions held in the offline cache against
 * the flattened respondent rows the dashboards consume, and surfaces every
 * mismatch: dropped repeat items, orphaned respondent rows, duplicate UUIDs,
 * submissions with no interviews, and missing mandatory geography fields.
 */
import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertTriangle, CheckCircle2, Download, GitCompareArrows, ShieldAlert } from "lucide-react";
import { buildChecklistDataset } from "./checklistSchema";
import type { KoboCache } from "./koboClient";

type Severity = "error" | "warning";

interface Issue {
  severity: Severity;
  type: string;
  uuid: string;
  submissionId: string;
  submittedAt: string;
  geography: string;
  expected: string;
  actual: string;
  detail: string;
}

const MANDATORY = ["State", "LGA", "Ward", "COMMUNITIES"] as const;

/** Count repeat items directly on the raw submission (schema-agnostic). */
function rawRepeatCount(raw: any): number {
  let best = 0;
  const walk = (o: any) => {
    if (!o || typeof o !== "object") return;
    for (const v of Object.values(o)) {
      if (Array.isArray(v) && v.every((i) => i && typeof i === "object" && !Array.isArray(i))) {
        best = Math.max(best, v.length);
        continue;
      }
      if (v && typeof v === "object") walk(v);
    }
  };
  walk(raw);
  return best;
}

interface Props { cache: KoboCache | null; canExport?: boolean }

export default function ChecklistReconciliation({ cache, canExport = true }: Props) {
  const { issues, stats } = useMemo(() => {
    const raws: any[] = cache?.results ?? [];
    const { parents, respondents } = buildChecklistDataset(raws);

    const respondentsByParent = new Map<string, number>();
    for (const r of respondents) {
      const key = String(r.parent_uuid ?? "");
      respondentsByParent.set(key, (respondentsByParent.get(key) ?? 0) + 1);
    }

    const found: Issue[] = [];
    const seenUuid = new Map<string, number>();

    raws.forEach((raw, i) => {
      const uuid = String(raw?._uuid ?? "");
      const parent = parents[i] ?? {};
      const submissionId = String(raw?._id ?? "—");
      const submittedAt = String(raw?._submission_time ?? "—");
      const geography = MANDATORY.map((k) => String((parent as any)[k] ?? "")).filter(Boolean).join(" › ") || "—";
      const base = { uuid: uuid || "—", submissionId, submittedAt, geography };

      seenUuid.set(uuid, (seenUuid.get(uuid) ?? 0) + 1);

      const rawCount = rawRepeatCount(raw);
      const flatCount = respondentsByParent.get(uuid) ?? 0;

      if (rawCount !== flatCount) {
        found.push({
          ...base, severity: "error", type: "Repeat count mismatch",
          expected: `${rawCount} interview${rawCount === 1 ? "" : "s"}`,
          actual: `${flatCount} flattened row${flatCount === 1 ? "" : "s"}`,
          detail: "Respondent repeat items were not fully unrolled into flat rows.",
        });
      } else if (rawCount === 0) {
        found.push({
          ...base, severity: "warning", type: "No respondent interviews",
          expected: "≥ 1 interview", actual: "0",
          detail: "Checklist submitted without any Respondent_Interview entries.",
        });
      }

      const missing = MANDATORY.filter((k) => !String((parent as any)[k] ?? "").trim());
      if (missing.length) {
        found.push({
          ...base, severity: "warning", type: "Missing geography",
          expected: MANDATORY.join(", "), actual: `missing ${missing.join(", ")}`,
          detail: "Mandatory administrative fields could not be resolved from the submission.",
        });
      }
    });

    for (const [uuid, n] of seenUuid) {
      if (n > 1) {
        found.push({
          severity: "error", type: "Duplicate submission UUID",
          uuid: uuid || "—", submissionId: "—", submittedAt: "—", geography: "—",
          expected: "1 record", actual: `${n} records`,
          detail: "The same Kobo UUID appears more than once in the cached payload.",
        });
      }
    }

    const parentUuids = new Set(raws.map((r) => String(r?._uuid ?? "")));
    for (const key of respondentsByParent.keys()) {
      if (!parentUuids.has(key)) {
        found.push({
          severity: "error", type: "Orphaned respondent row",
          uuid: key || "—", submissionId: "—", submittedAt: "—", geography: "—",
          expected: "matching parent submission", actual: "no parent found",
          detail: "A flattened respondent row references a submission that is not in the cache.",
        });
      }
    }

    const expectedRespondents = raws.reduce((a, r) => a + rawRepeatCount(r), 0);

    return {
      issues: found,
      stats: {
        koboReported: cache?.count ?? 0,
        cachedSubmissions: raws.length,
        parents: parents.length,
        expectedRespondents,
        flattenedRespondents: respondents.length,
        errors: found.filter((f) => f.severity === "error").length,
        warnings: found.filter((f) => f.severity === "warning").length,
      },
    };
  }, [cache]);

  const exportCsv = () => {
    const head = ["Severity", "Issue", "Submission ID", "UUID", "Submitted", "Geography", "Expected", "Actual", "Detail"];
    const lines = [head, ...issues.map((i) => [
      i.severity, i.type, i.submissionId, i.uuid, i.submittedAt, i.geography, i.expected, i.actual, i.detail,
    ])]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob([lines], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `kobo-reconciliation-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const clean = issues.length === 0 && stats.cachedSubmissions > 0;

  return (
    <Card className="overflow-hidden">
      <CardHeader className="py-3 px-4 border-b bg-muted/40 flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <GitCompareArrows className="h-4 w-4 text-primary" /> Kobo ↔ Flattened Data Reconciliation
        </CardTitle>
        <div className="flex items-center gap-2">
          {clean ? (
            <Badge className="bg-emerald-600 text-white text-[10px]"><CheckCircle2 className="h-3 w-3 mr-1" /> Fully reconciled</Badge>
          ) : (
            <>
              {stats.errors > 0 && <Badge variant="destructive" className="text-[10px]">{stats.errors} error{stats.errors === 1 ? "" : "s"}</Badge>}
              {stats.warnings > 0 && <Badge variant="secondary" className="text-[10px]">{stats.warnings} warning{stats.warnings === 1 ? "" : "s"}</Badge>}
            </>
          )}
          {canExport && (
            <Button size="sm" variant="outline" className="h-7 px-2 text-[11px]" onClick={exportCsv} disabled={issues.length === 0}>
              <Download className="h-3.5 w-3.5 mr-1" /> Export
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="p-4 space-y-4">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Submissions on Kobo", stats.koboReported],
            ["Cached submissions", stats.cachedSubmissions],
            ["Interviews expected", stats.expectedRespondents],
            ["Flattened respondent rows", stats.flattenedRespondents],
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded-lg border bg-card p-3">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
              <p className="font-display text-xl font-bold">{Number(value).toLocaleString()}</p>
            </div>
          ))}
        </div>

        {stats.cachedSubmissions === 0 ? (
          <div className="rounded-md border border-dashed p-4 text-xs text-muted-foreground">
            No cached submissions to reconcile. Run a Kobo sync first.
          </div>
        ) : clean ? (
          <div className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-xs text-emerald-800 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" />
            Every submission unrolled exactly as expected — {stats.flattenedRespondents.toLocaleString()} respondent rows
            from {stats.cachedSubmissions.toLocaleString()} checklists, with no missing geography or duplicates.
          </div>
        ) : (
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[130px]">Severity</TableHead>
                  <TableHead>Issue</TableHead>
                  <TableHead>Submission</TableHead>
                  <TableHead>Geography</TableHead>
                  <TableHead>Expected</TableHead>
                  <TableHead>Actual</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {issues.slice(0, 300).map((i, n) => (
                  <TableRow key={`${i.type}-${i.uuid}-${n}`}>
                    <TableCell>
                      <Badge variant={i.severity === "error" ? "destructive" : "secondary"} className="text-[10px]">
                        {i.severity === "error" ? <ShieldAlert className="h-3 w-3 mr-1" /> : <AlertTriangle className="h-3 w-3 mr-1" />}
                        {i.severity}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs font-medium">
                      {i.type}
                      <div className="text-[11px] font-normal text-muted-foreground">{i.detail}</div>
                    </TableCell>
                    <TableCell className="text-[11px] font-mono">
                      {i.submissionId}
                      <div className="text-muted-foreground">{i.submittedAt}</div>
                    </TableCell>
                    <TableCell className="text-[11px]">{i.geography}</TableCell>
                    <TableCell className="text-[11px]">{i.expected}</TableCell>
                    <TableCell className="text-[11px] font-semibold">{i.actual}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {issues.length > 300 && (
              <p className="p-2 text-[11px] text-muted-foreground">Showing first 300 of {issues.length} issues — export for the full report.</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

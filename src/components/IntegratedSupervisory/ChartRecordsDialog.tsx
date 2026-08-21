/**
 * Poster-style record drill-down for every chart on the Integrated MDA
 * Supervisory Checklist dashboard.
 *
 * Clicking any pie slice or bar opens this dialog with the exact KoboToolbox
 * submissions that produced that segment, rendered as a colourful, readable
 * table with a CSV export.
 */
import { useMemo } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Download, Table2 } from "lucide-react";
import { resolveChecklistValue } from "./checklistSchema";

export interface ChartDrillSpec {
  /** Chart / question the segment belongs to. */
  title: string;
  /** Clicked category, e.g. "No". */
  category: string;
  /** Accent colour of the clicked segment. */
  color?: string;
  /** Matching KoboToolbox records (parents or flattened respondents). */
  rows: Record<string, unknown>[];
  /** Optional note rendered under the title. */
  note?: string;
}

const COLUMNS: { key: string; label: string }[] = [
  { key: "State", label: "State" },
  { key: "LGA", label: "LGA" },
  { key: "Ward", label: "Ward" },
  { key: "FLHF", label: "Health facility" },
  { key: "COMMUNITIES", label: "Community" },
  { key: "MDA_Campaign_Type", label: "Campaign" },
  { key: "Designation", label: "Designation" },
  { key: "Independent_Monitor_s_Name", label: "Independent monitor" },
  { key: "Name_of_Supervisor", label: "Supervisor" },
];

const cellOf = (row: Record<string, unknown>, key: string): string => {
  const raw = row[key];
  if (raw == null || raw === "") return "";
  return resolveChecklistValue(key, raw) || String(raw);
};

const dateOf = (row: Record<string, unknown>): string => {
  const s = String(row._end ?? row._submission_time ?? row.end ?? "").trim();
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : "";
};

export default function ChartRecordsDialog({
  spec, onClose,
}: { spec: ChartDrillSpec | null; onClose: () => void }) {
  const open = !!spec;
  const rows = spec?.rows ?? [];
  const accent = spec?.color || "#1668DC";

  /* Only show columns that actually carry data for this selection. */
  const columns = useMemo(
    () => COLUMNS.filter((c) => rows.some((r) => cellOf(r, c.key))),
    [rows],
  );
  const hasDate = useMemo(() => rows.some((r) => dateOf(r)), [rows]);

  const download = () => {
    const heads = [...columns.map((c) => c.label), ...(hasDate ? ["Date"] : [])];
    const esc = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
    const csv = [
      heads.map(esc).join(","),
      ...rows.map((r) =>
        [...columns.map((c) => cellOf(r, c.key)), ...(hasDate ? [dateOf(r)] : [])].map(esc).join(","),
      ),
    ].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${spec?.title ?? "records"} — ${spec?.category ?? ""}.csv`.replace(/[/\\?%*:|"<>]/g, "-");
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-[96vw] sm:max-w-[92vw] lg:max-w-[1150px] p-0 overflow-hidden">
        <DialogHeader
          className="space-y-1 px-5 py-4 text-white"
          style={{ background: `linear-gradient(105deg, ${accent} 0%, ${accent}CC 55%, ${accent}88 100%)` }}
        >
          <DialogTitle className="flex flex-wrap items-center gap-2 text-base font-bold text-white">
            <Table2 className="h-4 w-4" />
            {spec?.title}
            <Badge className="border-white/40 bg-white/20 text-white hover:bg-white/20">
              {spec?.category}
            </Badge>
          </DialogTitle>
          <DialogDescription className="text-[12px] text-white/90">
            {rows.length.toLocaleString()} KoboToolbox record{rows.length === 1 ? "" : "s"} produced this segment
            {spec?.note ? ` · ${spec.note}` : ""}.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between gap-2 border-b bg-muted/40 px-4 py-2">
          <p className="text-[11px] text-muted-foreground">
            Every row below answered <strong className="text-foreground">{spec?.category}</strong> for this question.
          </p>
          <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={download} disabled={!rows.length}>
            <Download className="mr-1 h-3.5 w-3.5" /> Export CSV
          </Button>
        </div>

        <div className="max-h-[68vh] overflow-auto">
          {rows.length === 0 ? (
            <p className="p-8 text-center text-xs text-muted-foreground">No records for this segment.</p>
          ) : (
            <table className="w-full min-w-[720px] text-xs">
              <thead className="sticky top-0 z-10">
                <tr style={{ background: accent }} className="text-white">
                  <th className="px-2 py-2 text-left font-semibold">#</th>
                  {columns.map((c) => (
                    <th key={c.key} className="whitespace-nowrap px-2 py-2 text-left font-semibold">{c.label}</th>
                  ))}
                  {hasDate && <th className="whitespace-nowrap px-2 py-2 text-left font-semibold">Date</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr
                    key={`${String(r._uuid ?? r.parent_uuid ?? i)}-${i}`}
                    className={`border-t transition-colors hover:bg-primary/5 ${i % 2 ? "bg-muted/30" : "bg-background"}`}
                  >
                    <td className="px-2 py-1.5 tabular-nums text-muted-foreground">{i + 1}</td>
                    {columns.map((c) => (
                      <td key={c.key} className="px-2 py-1.5 align-top">
                        {cellOf(r, c.key) || <span className="text-muted-foreground">—</span>}
                      </td>
                    ))}
                    {hasDate && (
                      <td className="whitespace-nowrap px-2 py-1.5 tabular-nums align-top text-muted-foreground">
                        {dateOf(r) || "—"}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

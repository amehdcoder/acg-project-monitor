import { useMemo, useState } from "react";
import {
  Pencil, Search, ChevronLeft, ChevronRight, Copy, MapPin,
  CalendarDays, User, FileEdit, Database, ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import FormDataTable, { type FieldDescriptor } from "@/components/FormDataTable";
import SubmissionEditHistory from "@/components/SubmissionEditHistory";
import { getFieldLabel, type QuestionLabelMap } from "@/lib/formLabelUtils";

export interface EditableSubmission {
  id: string;
  data: Record<string, any>;
  submitter?: string | null;
  submittedAt?: string | null;
  state?: string | null;
  lga?: string | null;
  ward?: string | null;
  /** Ordered list of every form field so the editor can render all questions. */
  fieldSpec?: FieldDescriptor[];
  /** Current values for column-mapped fields (keyed by column name). */
  columns?: Record<string, any>;
  [k: string]: any;
}

interface Props {
  submissions: EditableSubmission[];
  questionLabels?: QuestionLabelMap;
  /** Table to persist edits to. */
  table?: string;
  /** JSON column that stores the answers. */
  dataColumn?: string;
  /** Ids flagged as duplicates — highlighted in the table. */
  duplicateIds?: Set<string>;
  /** Called after a submission is edited so the dashboard can refresh. */
  onChanged?: () => void | Promise<void>;
  /** When true, each row gets an owner-only delete button that removes the row. */
  enableDelete?: boolean;
  title?: string;
  pageSize?: number;
}

const geoLabel = (s: EditableSubmission) =>
  [s.lga, s.ward].filter(Boolean).join(" · ") || s.state || "—";

const fmtDate = (v?: string | null) => {
  if (!v) return "—";
  const d = new Date(v);
  return isNaN(d.getTime()) ? "—" : d.toLocaleString();
};

/**
 * Beautiful, colorful admin-only submission table with full-field inline editing.
 * Every field of a submission can be edited via the drill-in dialog and is
 * persisted back to the source table so linked dashboards refresh in real time.
 */
export default function AdminSubmissionEditor({
  submissions,
  questionLabels,
  table = "form_submissions",
  dataColumn = "data",
  duplicateIds,
  onChanged,
  enableDelete = false,
  title = "Submissions — Admin edit",
  pageSize = 10,
}: Props) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [active, setActive] = useState<EditableSubmission | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const handleDelete = async (s: EditableSubmission) => {
    if (!window.confirm("Permanently delete this submission? This updates every part of the dashboard instantly.")) return;
    setDeleting(s.id);
    const { error } = await supabase.from(table as any).delete().eq("id", s.id);
    setDeleting(null);
    if (error) { window.alert(`Delete failed: ${error.message}`); return; }
    await onChanged?.();
  };


  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = q
      ? submissions.filter((s) => {
          const hay = [
            s.submitter, s.state, s.lga, s.ward, s.id,
            ...Object.values(s.data || {}).map((v) =>
              typeof v === "object" ? JSON.stringify(v) : String(v ?? "")),
          ].join(" ").toLowerCase();
          return hay.includes(q);
        })
      : submissions;
    return [...rows].sort(
      (a, b) => new Date(b.submittedAt || 0).getTime() - new Date(a.submittedAt || 0).getTime(),
    );
  }, [submissions, search]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = filtered.slice(safePage * pageSize, safePage * pageSize + pageSize);

  const summarize = (s: EditableSubmission) => {
    const entries = Object.entries(s.data || {})
      .filter(([, v]) => v !== null && v !== undefined && v !== "" && typeof v !== "object")
      .slice(0, 2);
    return entries.map(([k, v]) => `${getFieldLabel(k, questionLabels)}: ${String(v)}`).join("  ·  ");
  };

  return (
    <Card className="overflow-hidden border-primary/20">
      <div className="flex flex-wrap items-center gap-2 border-b bg-gradient-to-r from-[#0c2340] to-[#1a4a6e] px-4 py-3">
        <FileEdit className="h-5 w-5 text-white" />
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-white">{title}</h3>
          <p className="text-xs text-white/70">
            {filtered.length} submission(s) · click a row to edit every field
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Badge variant="secondary" className="gap-1 bg-white/15 text-white hover:bg-white/25">
            <ShieldCheck className="h-3 w-3" /> Admin
          </Badge>
        </div>
      </div>

      <div className="flex items-center gap-2 border-b bg-muted/40 px-3 py-2.5">
        <Search className="h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0); }}
          placeholder="Search by submitter, location or any answer…"
          className="h-8 border-0 bg-transparent text-sm shadow-none focus-visible:ring-0"
        />
      </div>

      <div className="divide-y">
        {pageRows.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">No submissions match your search.</p>
        ) : (
          pageRows.map((s, i) => {
            const isDup = duplicateIds?.has(s.id);
            const rank = safePage * pageSize + i + 1;
            return (
              <button
                key={s.id}
                onClick={() => setActive(s)}
                className={`group flex w-full items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-primary/5 ${
                  isDup ? "bg-amber-50/70 dark:bg-amber-500/5" : ""
                }`}
              >
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${
                  isDup ? "bg-amber-500" : "bg-gradient-to-br from-[#1a4a6e] to-[#0891b2]"
                }`}>
                  {rank}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm font-medium text-foreground">
                    <span className="inline-flex items-center gap-1 truncate">
                      <User className="h-3.5 w-3.5 text-primary" />
                      {s.submitter || "Unknown submitter"}
                    </span>
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <MapPin className="h-3.5 w-3.5 text-emerald-600" /> {geoLabel(s)}
                    </span>
                    {isDup && (
                      <Badge variant="outline" className="gap-1 border-amber-400 text-amber-700 dark:text-amber-300">
                        <Copy className="h-3 w-3" /> Duplicate
                      </Badge>
                    )}
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                    <CalendarDays className="h-3 w-3" /> {fmtDate(s.submittedAt)}
                    {summarize(s) && <span className="truncate">· {summarize(s)}</span>}
                  </div>
                </div>
                <Badge className="shrink-0 gap-1 bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground">
                  <Pencil className="h-3 w-3" /> Edit
                </Badge>
              </button>
            );
          })
        )}
      </div>

      {pageCount > 1 && (
        <div className="flex items-center justify-between gap-2 border-t bg-muted/30 px-3 py-2 text-xs">
          <span className="text-muted-foreground">
            Page {safePage + 1} of {pageCount}
          </span>
          <div className="flex gap-1">
            <Button variant="outline" size="sm" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" disabled={safePage >= pageCount - 1} onClick={() => setPage(safePage + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      <Dialog open={!!active} onOpenChange={(o) => !o && setActive(null)}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-hidden p-0">
          <DialogHeader className="border-b bg-gradient-to-r from-[#0c2340] to-[#1a4a6e] px-5 py-4">
            <DialogTitle className="flex items-center gap-2 text-white">
              <Database className="h-5 w-5" /> Edit submission
            </DialogTitle>
            <DialogDescription className="text-white/70">
              {active?.submitter || "Unknown"} · {active ? geoLabel(active) : ""} · {fmtDate(active?.submittedAt)}
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[75vh] px-5 py-4">
            {active && (
              <FormDataTable
                data={active.data || {}}
                submissionId={active.id}
                table={table}
                dataColumn={dataColumn}
                questionLabels={questionLabels}
                fieldSpec={active.fieldSpec}
                columnData={active.columns}
                onDataUpdate={async (updated) => {
                  setActive((prev) => (prev ? { ...prev, data: updated } : prev));
                  await onChanged?.();
                }}
                onColumnsUpdate={(updatedColumns) => {
                  setActive((prev) =>
                    prev ? { ...prev, columns: updatedColumns } : prev,
                  );
                }}
              />
            )}
            {active && (
              <SubmissionEditHistory submissionId={active.id} tableName={table} />
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

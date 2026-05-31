import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft, Download, Loader2, Users, ClipboardList, Building2,
  FileSpreadsheet, RefreshCw, Banknote, Accessibility,
} from "lucide-react";
import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import {
  TRAINING_TYPES, DESIGNATIONS, SEXES, DISABILITY_TYPES, BANKS, labelOf, UProParticipant,
} from "@/lib/uprp/definitions";

interface Props {
  projectId?: string | null;
  onClose: () => void;
}

interface UProSubmission {
  id: string;
  name_of_data_collector: string;
  type_of_training: string;
  training_center: string;
  participants: UProParticipant[];
  documents: { name: string; url: string; size: number }[];
  location: { lat: number; lng: number } | null;
  created_at: string;
}

const EMERALD = "FF0F7E4F";
const EMERALD_LIGHT = "FFE7F4EC";

const Stat = ({ icon: Icon, label, value }: { icon: any; label: string; value: string | number }) => (
  <div className="rounded-xl border border-emerald-100 bg-white p-3 shadow-sm">
    <div className="flex items-center gap-2 text-emerald-700">
      <Icon className="h-4 w-4" />
      <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
    </div>
    <p className="mt-1 text-2xl font-bold text-foreground">{value}</p>
  </div>
);

const UPRPSubmissionsView = ({ projectId, onClose }: Props) => {
  const { user, isSuperAdmin } = useAuth();
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [rows, setRows] = useState<UProSubmission[]>([]);

  const load = async () => {
    setLoading(true);
    try {
      let q = supabase.from("uprp_submissions").select("*").order("created_at", { ascending: false }).limit(1000);
      if (projectId) q = q.eq("project_id", projectId);
      // Regular users only ever see their own records. Super Admins see everyone's.
      if (!isSuperAdmin && user?.id) q = q.eq("user_id", user.id);
      const { data, error } = await q;
      if (error) throw error;
      setRows((data as any) || []);
    } catch (e: any) {
      toast({ title: "Could not load submissions", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [projectId]);

  // Flatten one row per participant for analytics + export.
  const flat = useMemo(() => {
    const out: { sub: UProSubmission; p: UProParticipant }[] = [];
    for (const sub of rows) for (const p of (sub.participants || [])) out.push({ sub, p });
    return out;
  }, [rows]);

  const stats = useMemo(() => {
    const total = flat.length;
    const female = flat.filter((r) => r.p.sex === "female").length;
    const male = flat.filter((r) => r.p.sex === "male").length;
    const disability = flat.filter((r) => r.p.has_disability === "yes").length;
    const banked = flat.filter((r) => r.p.account_number && r.p.bank_name).length;
    const centers = new Set(rows.map((r) => r.training_center)).size;
    return { total, female, male, disability, banked, centers, sessions: rows.length };
  }, [flat, rows]);

  const byDesignation = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of flat) m.set(r.p.designation, (m.get(r.p.designation) || 0) + 1);
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [flat]);

  const exportExcel = async () => {
    if (flat.length === 0) { toast({ title: "Nothing to export", variant: "destructive" }); return; }
    setExporting(true);
    try {
      const wb = new ExcelJS.Workbook();
      wb.creator = "Amehnities";
      wb.created = new Date();

      const styleHeader = (row: ExcelJS.Row) => {
        row.eachCell((cell) => {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: EMERALD } };
          cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11, name: "Calibri" };
          cell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
          cell.border = { bottom: { style: "thin", color: { argb: "FFB7D9C6" } } };
        });
        row.height = 24;
      };
      const bandRows = (ws: ExcelJS.Worksheet, startRow: number, cols: number) => {
        for (let r = startRow; r <= ws.rowCount; r++) {
          const row = ws.getRow(r);
          if ((r - startRow) % 2 === 1) {
            for (let c = 1; c <= cols; c++) {
              row.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: EMERALD_LIGHT } };
            }
          }
          row.eachCell((cell) => {
            cell.alignment = { ...cell.alignment, vertical: "middle", wrapText: true };
            cell.border = { bottom: { style: "hair", color: { argb: "FFD9E8DF" } } };
          });
        }
      };

      // ── Sheet 1: Participants ──────────────────────────────
      const ws = wb.addWorksheet("Participants", { views: [{ state: "frozen", ySplit: 1 }] });
      const headers = [
        "S/N", "Date", "Data Collector", "Training Type", "Training Center",
        "Participant Name", "Designation", "State", "LGA", "Ward", "FLHF", "Community/Settlement",
        "Sex", "Phone", "Has Disability", "Disability Type",
        "Account Name", "Account Number", "Bank",
      ];
      ws.columns = headers.map((h) => ({ header: h, width: Math.min(Math.max(h.length + 4, 12), 30) }));
      ws.getColumn(18).numFmt = "@"; // account number as text
      flat.forEach((r, i) => {
        const p = r.p;
        ws.addRow([
          i + 1,
          new Date(r.sub.created_at).toLocaleDateString(),
          r.sub.name_of_data_collector,
          labelOf(TRAINING_TYPES, r.sub.type_of_training),
          r.sub.training_center,
          p.name, labelOf(DESIGNATIONS, p.designation),
          p.state, p.lga, p.ward, p.flhf_name, p.community_name,
          labelOf(SEXES, p.sex), p.phone,
          p.has_disability === "yes" ? "Yes" : "No",
          p.has_disability === "yes" ? labelOf(DISABILITY_TYPES, p.disability_type) : "",
          p.account_name, p.account_number, labelOf(BANKS, p.bank_name),
        ]);
      });
      styleHeader(ws.getRow(1));
      bandRows(ws, 2, headers.length);
      ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: headers.length } };

      // ── Sheet 2: Summary ───────────────────────────────────
      const sum = wb.addWorksheet("Summary");
      sum.columns = [{ width: 32 }, { width: 18 }];
      sum.addRow(["UPRP Submissions Summary", ""]);
      sum.mergeCells("A1:B1");
      sum.getRow(1).getCell(1).font = { bold: true, size: 14, color: { argb: EMERALD } };
      sum.addRow(["Generated", new Date().toLocaleString()]);
      sum.addRow([]);
      const metricHeader = sum.addRow(["Metric", "Value"]);
      styleHeader(metricHeader);
      [
        ["Training Sessions", stats.sessions],
        ["Training Centers", stats.centers],
        ["Total Participants", stats.total],
        ["Female", stats.female],
        ["Male", stats.male],
        ["With Disability", stats.disability],
        ["With Bank Details", stats.banked],
      ].forEach((r) => sum.addRow(r));
      sum.addRow([]);
      const dHeader = sum.addRow(["Designation", "Count"]);
      styleHeader(dHeader);
      byDesignation.forEach(([d, n]) => sum.addRow([labelOf(DESIGNATIONS, d), n]));

      const buf = await wb.xlsx.writeBuffer();
      saveAs(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
        `UPRP_Submissions_${new Date().toISOString().slice(0, 10)}.xlsx`);
      toast({ title: "Excel exported", description: `${flat.length} participant record(s).` });
    } catch (e: any) {
      toast({ title: "Export failed", description: e.message, variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="min-h-full bg-[#F4F8F5]">
      <div className="bg-gradient-to-br from-emerald-800 to-emerald-700 px-4 pb-5 pt-4 text-white">
        <button onClick={onClose} className="mb-3 inline-flex items-center gap-1.5 text-sm text-emerald-100 hover:text-white">
          <ArrowLeft className="h-4 w-4" /> Forms
        </button>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold leading-tight">UPRP Records & Analysis</h1>
            <p className="mt-1 text-xs text-emerald-100/90">Saved participant registrations and payment details.</p>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button onClick={load} variant="secondary" size="sm" className="bg-white/15 text-white hover:bg-white/25">
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button onClick={exportExcel} disabled={exporting || loading} size="sm" className="bg-white text-emerald-700 hover:bg-emerald-50">
              {exporting ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Download className="mr-1.5 h-4 w-4" />}
              Export Excel
            </Button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-3xl space-y-4 p-4">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading submissions…
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat icon={Users} label="Participants" value={stats.total} />
              <Stat icon={ClipboardList} label="Sessions" value={stats.sessions} />
              <Stat icon={Building2} label="Centers" value={stats.centers} />
              <Stat icon={Banknote} label="Banked" value={stats.banked} />
              <Stat icon={Users} label="Female" value={stats.female} />
              <Stat icon={Users} label="Male" value={stats.male} />
              <Stat icon={Accessibility} label="Disability" value={stats.disability} />
              <Stat icon={FileSpreadsheet} label="Documents" value={rows.reduce((n, r) => n + (r.documents?.length || 0), 0)} />
            </div>

            {byDesignation.length > 0 && (
              <div className="rounded-xl border border-emerald-100 bg-white p-4 shadow-sm">
                <h3 className="mb-3 text-sm font-bold text-foreground">Participants by Designation</h3>
                <div className="space-y-2">
                  {byDesignation.map(([d, n]) => {
                    const pct = stats.total ? Math.round((n / stats.total) * 100) : 0;
                    return (
                      <div key={d}>
                        <div className="mb-0.5 flex justify-between text-xs">
                          <span className="font-medium text-foreground">{labelOf(DESIGNATIONS, d)}</span>
                          <span className="text-muted-foreground">{n} ({pct}%)</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-emerald-50">
                          <div className="h-full rounded-full bg-emerald-600" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="rounded-xl border border-emerald-100 bg-white shadow-sm">
              <h3 className="border-b border-emerald-50 p-4 text-sm font-bold text-foreground">Recent Submissions</h3>
              {rows.length === 0 ? (
                <p className="p-6 text-center text-sm text-muted-foreground">No UPRP submissions yet.</p>
              ) : (
                <div className="divide-y divide-emerald-50">
                  {rows.map((r) => (
                    <div key={r.id} className="flex items-center gap-3 p-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-sm font-bold text-emerald-700">
                        {r.participants?.length || 0}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-emerald-800">{r.training_center}</p>
                        <p className="truncate text-[11px] text-muted-foreground">
                          {labelOf(TRAINING_TYPES, r.type_of_training)} · {r.name_of_data_collector} · {new Date(r.created_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default UPRPSubmissionsView;

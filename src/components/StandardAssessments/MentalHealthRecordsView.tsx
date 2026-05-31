import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft, Download, Loader2, Users, Brain, CloudRain, RefreshCw,
  Activity, TrendingUp, TrendingDown, Minus, ChevronRight,
} from "lucide-react";
import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { STANDARD_ASSESSMENTS } from "@/lib/standardAssessments/definitions";

interface Props {
  projectId?: string | null;
  onClose: () => void;
}

interface Row {
  id: string;
  user_id: string;
  form_code: "gad_7" | "phq_9";
  data: Record<string, any>;
  demographics: Record<string, any>;
  score: number | null;
  severity: string | null;
  created_at: string;
}

interface PatientTimeline {
  patientId: string;
  fullName: string;
  sex: string;
  age: string;
  state: string;
  visits: Row[]; // chronological ascending
  firstScore: number;
  lastScore: number;
  delta: number;
  formCode: "gad_7" | "phq_9";
}

const EMERALD = "FF0F7E4F";
const EMERALD_LIGHT = "FFE7F4EC";
const VIOLET = "FF5B21B6";

const Stat = ({ icon: Icon, label, value, tone = "emerald" }: { icon: any; label: string; value: string | number; tone?: "emerald" | "violet" }) => (
  <div className={`rounded-xl border bg-white p-3 shadow-sm ${tone === "violet" ? "border-violet-100" : "border-emerald-100"}`}>
    <div className={`flex items-center gap-2 ${tone === "violet" ? "text-violet-700" : "text-emerald-700"}`}>
      <Icon className="h-4 w-4" />
      <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
    </div>
    <p className="mt-1 text-2xl font-bold text-foreground">{value}</p>
  </div>
);

const fmtDate = (s: string) => new Date(s).toLocaleDateString();

const MentalHealthRecordsView = ({ projectId, onClose }: Props) => {
  const { user, isSuperAdmin } = useAuth();
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [openPatient, setOpenPatient] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      let q = supabase
        .from("standard_assessment_submissions")
        .select("id,user_id,form_code,data,demographics,score,severity,created_at")
        .in("form_code", ["gad_7", "phq_9"])
        .order("created_at", { ascending: false })
        .limit(2000);
      if (projectId) q = q.eq("project_id", projectId);
      if (!isSuperAdmin && user?.id) q = q.eq("user_id", user.id);
      const { data, error } = await q;
      if (error) throw error;
      setRows((data as Row[]) || []);
    } catch (e: any) {
      toast({ title: "Could not load records", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [projectId, isSuperAdmin, user?.id]);

  const stats = useMemo(() => {
    const gad = rows.filter((r) => r.form_code === "gad_7");
    const phq = rows.filter((r) => r.form_code === "phq_9");
    const patients = new Set(rows.map((r) => r.demographics?.patient_id).filter(Boolean));
    return {
      total: rows.length,
      gad: gad.length,
      phq: phq.length,
      patients: patients.size,
      avgGad: gad.length ? gad.reduce((a, r) => a + (r.score ?? 0), 0) / gad.length : 0,
      avgPhq: phq.length ? phq.reduce((a, r) => a + (r.score ?? 0), 0) / phq.length : 0,
    };
  }, [rows]);

  // Build longitudinal timelines keyed by patient_id + form_code
  const timelines = useMemo<PatientTimeline[]>(() => {
    const map = new Map<string, Row[]>();
    for (const r of rows) {
      const pid = String(r.demographics?.patient_id || "").trim();
      if (!pid) continue;
      const key = `${pid}__${r.form_code}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    const out: PatientTimeline[] = [];
    for (const [key, visits] of map.entries()) {
      visits.sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at));
      const first = visits[0];
      const last = visits[visits.length - 1];
      const [pid, formCode] = key.split("__");
      out.push({
        patientId: pid,
        fullName: first.demographics?.full_name || "",
        sex: first.demographics?.sex || "",
        age: String(first.demographics?.age ?? ""),
        state: first.demographics?.state || "",
        visits,
        firstScore: first.score ?? 0,
        lastScore: last.score ?? 0,
        delta: (last.score ?? 0) - (first.score ?? 0),
        formCode: formCode as "gad_7" | "phq_9",
      });
    }
    // Patients with repeated visits first, then by most recent activity
    out.sort((a, b) => {
      if (b.visits.length !== a.visits.length) return b.visits.length - a.visits.length;
      return +new Date(b.visits[b.visits.length - 1].created_at) - +new Date(a.visits[a.visits.length - 1].created_at);
    });
    return out;
  }, [rows]);

  const repeatPatients = timelines.filter((t) => t.visits.length > 1).length;

  const exportExcel = async () => {
    if (rows.length === 0) { toast({ title: "Nothing to export", variant: "destructive" }); return; }
    setExporting(true);
    try {
      const wb = new ExcelJS.Workbook();
      wb.creator = "Amehnities";
      wb.created = new Date();

      const styleHeader = (row: ExcelJS.Row, color = EMERALD) => {
        row.eachCell((cell) => {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: color } };
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

      const buildItemCols = (code: "gad_7" | "phq_9") => {
        const def = STANDARD_ASSESSMENTS[code];
        return def.items.map((q) => q.id);
      };

      // ── Per-form submission sheets ───────────────────────────
      (["gad_7", "phq_9"] as const).forEach((code) => {
        const def = STANDARD_ASSESSMENTS[code];
        const formRows = rows.filter((r) => r.form_code === code);
        if (formRows.length === 0) return;
        const itemIds = buildItemCols(code);
        const ws = wb.addWorksheet(def.shortName, { views: [{ state: "frozen", ySplit: 1 }] });
        const headers = [
          "S/N", "Date", "Patient ID", "Name", "Sex", "Age", "State",
          ...itemIds.map((_, i) => `Q${i + 1}`),
          "Total Score", "Severity",
        ];
        ws.columns = headers.map((h) => ({ header: h, width: Math.min(Math.max(h.length + 3, 9), 28) }));
        ws.getColumn(3).numFmt = "@";
        // chronological ascending for readability
        [...formRows].sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at)).forEach((r, i) => {
          ws.addRow([
            i + 1,
            fmtDate(r.created_at),
            r.demographics?.patient_id || "",
            r.demographics?.full_name || "",
            r.demographics?.sex || "",
            r.demographics?.age ?? "",
            r.demographics?.state || "",
            ...itemIds.map((id) => (r.data?.[id] ?? "")),
            r.score ?? "",
            r.severity || "",
          ]);
        });
        styleHeader(ws.getRow(1), code === "phq_9" ? VIOLET : EMERALD);
        bandRows(ws, 2, headers.length);
        ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: headers.length } };
      });

      // ── Longitudinal tracking sheet ──────────────────────────
      const lt = wb.addWorksheet("Longitudinal Tracking", { views: [{ state: "frozen", ySplit: 1 }] });
      const ltHeaders = [
        "Patient ID", "Name", "Assessment", "Sex", "Age", "State", "Visits",
        "First Date", "First Score", "Latest Date", "Latest Score", "Change", "Trend", "Score History",
      ];
      lt.columns = ltHeaders.map((h) => ({ header: h, width: Math.min(Math.max(h.length + 3, 10), 34) }));
      lt.getColumn(1).numFmt = "@";
      timelines.forEach((t) => {
        const trend = t.delta < 0 ? "Improved" : t.delta > 0 ? "Worsened" : "No change";
        const history = t.visits.map((v) => `${fmtDate(v.created_at)}: ${v.score}`).join("  →  ");
        lt.addRow([
          t.patientId, t.fullName, STANDARD_ASSESSMENTS[t.formCode].shortName,
          t.sex, t.age, t.state, t.visits.length,
          fmtDate(t.visits[0].created_at), t.firstScore,
          fmtDate(t.visits[t.visits.length - 1].created_at), t.lastScore,
          t.delta > 0 ? `+${t.delta}` : t.delta, trend, history,
        ]);
      });
      styleHeader(lt.getRow(1));
      bandRows(lt, 2, ltHeaders.length);
      lt.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ltHeaders.length } };

      // ── Summary sheet ────────────────────────────────────────
      const sum = wb.addWorksheet("Summary");
      sum.columns = [{ width: 34 }, { width: 18 }];
      sum.addRow(["Mental Health Assessments Summary", ""]);
      sum.mergeCells("A1:B1");
      sum.getRow(1).getCell(1).font = { bold: true, size: 14, color: { argb: EMERALD } };
      sum.addRow(["Generated", new Date().toLocaleString()]);
      sum.addRow([]);
      const mh = sum.addRow(["Metric", "Value"]);
      styleHeader(mh);
      [
        ["Total Assessments", stats.total],
        ["Unique Patients", stats.patients],
        ["Patients with Repeat Visits", repeatPatients],
        ["GAD-7 Assessments", stats.gad],
        ["PHQ-9 Assessments", stats.phq],
        ["Average GAD-7 Score", stats.avgGad.toFixed(1)],
        ["Average PHQ-9 Score", stats.avgPhq.toFixed(1)],
      ].forEach((r) => sum.addRow(r));

      const buf = await wb.xlsx.writeBuffer();
      saveAs(
        new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
        `MentalHealth_Assessments_${new Date().toISOString().slice(0, 10)}.xlsx`,
      );
      toast({ title: "Excel exported", description: `${rows.length} assessment record(s).` });
    } catch (e: any) {
      toast({ title: "Export failed", description: e.message, variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  const active = openPatient ? timelines.find((t) => `${t.patientId}__${t.formCode}` === openPatient) : null;

  return (
    <div className="min-h-full bg-[#F4F8F5]">
      <div className="bg-gradient-to-br from-emerald-800 to-violet-800 px-4 pb-5 pt-4 text-white">
        <button onClick={onClose} className="mb-3 inline-flex items-center gap-1.5 text-sm text-white/80 hover:text-white">
          <ArrowLeft className="h-4 w-4" /> Mental Health
        </button>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold leading-tight">Records & Longitudinal Tracking</h1>
            <p className="mt-1 text-xs text-white/85">
              {isSuperAdmin
                ? "All users' GAD-7 & PHQ-9 assessments tracked over time."
                : "Your GAD-7 & PHQ-9 assessments tracked over time."}
            </p>
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
            <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading records…
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat icon={Activity} label="Assessments" value={stats.total} />
              <Stat icon={Users} label="Patients" value={stats.patients} />
              <Stat icon={Brain} label="GAD-7" value={stats.gad} />
              <Stat icon={CloudRain} label="PHQ-9" value={stats.phq} tone="violet" />
            </div>

            {/* Longitudinal list */}
            <div className="rounded-xl border border-emerald-100 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-emerald-50 p-4">
                <h3 className="text-sm font-bold text-foreground">Patient Timelines</h3>
                <span className="text-[11px] text-muted-foreground">
                  {repeatPatients} with repeat visit{repeatPatients === 1 ? "" : "s"}
                </span>
              </div>
              {timelines.length === 0 ? (
                <p className="p-6 text-center text-sm text-muted-foreground">
                  No assessments with a Patient ID yet.
                </p>
              ) : (
                <div className="divide-y divide-emerald-50">
                  {timelines.map((t) => {
                    const key = `${t.patientId}__${t.formCode}`;
                    const improved = t.delta < 0;
                    const worsened = t.delta > 0;
                    const TrendIcon = improved ? TrendingDown : worsened ? TrendingUp : Minus;
                    const tone = t.formCode === "phq_9" ? "violet" : "emerald";
                    return (
                      <button
                        key={key}
                        onClick={() => setOpenPatient(openPatient === key ? null : key)}
                        className="flex w-full items-center gap-3 p-3 text-left hover:bg-slate-50"
                      >
                        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold ${tone === "violet" ? "bg-violet-100 text-violet-700" : "bg-emerald-100 text-emerald-700"}`}>
                          {t.visits.length}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-foreground">
                            {t.fullName || t.patientId}
                            <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
                              {STANDARD_ASSESSMENTS[t.formCode].shortName}
                            </span>
                          </p>
                          <p className="truncate text-[11px] text-muted-foreground">
                            {t.patientId} · {t.sex || "—"}, {t.age || "—"}y · {t.state || "—"}
                          </p>
                        </div>
                        {t.visits.length > 1 && (
                          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${improved ? "bg-emerald-50 text-emerald-700" : worsened ? "bg-rose-50 text-rose-600" : "bg-slate-100 text-slate-500"}`}>
                            <TrendIcon className="h-3 w-3" />
                            {improved ? "Improved" : worsened ? "Worsened" : "No change"} ({t.delta > 0 ? `+${t.delta}` : t.delta})
                          </span>
                        )}
                        <ChevronRight className={`h-4 w-4 shrink-0 text-slate-300 transition-transform ${openPatient === key ? "rotate-90" : ""}`} />
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Expanded patient timeline */}
            {active && (
              <div className="rounded-xl border border-emerald-100 bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-foreground">
                      {active.fullName || active.patientId} — {STANDARD_ASSESSMENTS[active.formCode].shortName}
                    </h3>
                    <p className="text-[11px] text-muted-foreground">Score trend over time</p>
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={active.visits.map((v) => ({ date: fmtDate(v.created_at), score: v.score ?? 0 }))}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} domain={[0, active.formCode === "phq_9" ? 27 : 21]} />
                    <Tooltip />
                    <Line
                      type="monotone"
                      dataKey="score"
                      stroke={active.formCode === "phq_9" ? "#7C3AED" : "#0F7E4F"}
                      strokeWidth={2}
                      dot={{ r: 4 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
                <div className="mt-3 space-y-1.5">
                  {active.visits.map((v) => (
                    <div key={v.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-xs">
                      <span className="text-muted-foreground">{new Date(v.created_at).toLocaleString()}</span>
                      <span className="font-semibold text-foreground">Score {v.score} · {v.severity}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default MentalHealthRecordsView;

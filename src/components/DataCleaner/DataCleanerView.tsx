import { useState, useMemo, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  LayoutDashboard, Upload, Table2, ShieldCheck, AlertTriangle, BarChart3,
  Target, Pill, MapPinned, Download, History, ScrollText, MessageSquareHeart,
  Activity, Globe2, FlaskConical, ListChecks, ArrowLeft, CheckCircle2, XCircle,
  Wand2, FileSpreadsheet, Database,
} from "lucide-react";
import { toast } from "sonner";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip as RTooltip, CartesianGrid,
  PieChart, Pie, Cell, LineChart, Line,
} from "recharts";
import { MDA_CONFIGS, MDA_LIST, MdaTypeId, FEEDBACK_AREAS, FeedbackArea } from "@/lib/dataCleaner/schemas";
import { validateDataset, ValidationResult, RowResult, CellIssue } from "@/lib/dataCleaner/engine";
import { importWorkbook, exportTemplate, exportCleaned, newBatchId } from "@/lib/dataCleaner/io";
import {
  getSessions, saveSession, getAudit, appendAudit, getFeedback, saveFeedback,
  learningSummary, CleaningSession, AuditEntry,
} from "@/lib/dataCleaner/storage";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";

type SectionId =
  | "dashboard" | "import" | "preview" | "validation" | "issues" | "kpis"
  | "coverage" | "drug" | "geo" | "export" | "history" | "audit"
  | "feedback" | "performance" | "geoRegistry" | "drugRules" | "valRules";

const NAV: { group: string; items: { id: SectionId; label: string; icon: any }[] }[] = [
  { group: "Data Workflow", items: [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "import", label: "Import Data", icon: Upload },
    { id: "preview", label: "Data Preview", icon: Table2 },
    { id: "validation", label: "Validation & Cleaning", icon: ShieldCheck },
    { id: "issues", label: "Issue Register", icon: AlertTriangle },
  ]},
  { group: "Insights & Reports", items: [
    { id: "kpis", label: "Summary & KPIs", icon: BarChart3 },
    { id: "coverage", label: "Coverage Analysis", icon: Target },
    { id: "drug", label: "Drug & Ratio Analysis", icon: Pill },
    { id: "geo", label: "Geographic Coverage", icon: MapPinned },
    { id: "export", label: "Export Data", icon: Download },
  ]},
  { group: "History & Governance", items: [
    { id: "history", label: "Cleaning History", icon: History },
    { id: "audit", label: "Audit Trail", icon: ScrollText },
    { id: "feedback", label: "User Feedback", icon: MessageSquareHeart },
    { id: "performance", label: "System Performance", icon: Activity },
  ]},
  { group: "Reference Data", items: [
    { id: "geoRegistry", label: "Geography Registry", icon: Globe2 },
    { id: "drugRules", label: "Drug & Ratio Rules", icon: FlaskConical },
    { id: "valRules", label: "Validation Rules", icon: ListChecks },
  ]},
];

const STATUS_STYLE: Record<string, string> = {
  "Validated": "bg-[#16A34A]/10 text-[#16A34A]",
  "Auto-Corrected": "bg-[#2563EB]/10 text-[#2563EB]",
  "Needs Review": "bg-[#F59E0B]/10 text-[#F59E0B]",
  "Critical Alert": "bg-[#EF4444]/10 text-[#EF4444]",
};
const SEV_COLOR: Record<string, string> = {
  critical: "#EF4444", high: "#F59E0B", warning: "#7C3AED", governance: "#06B6D4",
};

const PIE_COLORS = ["#16A34A", "#F59E0B", "#EF4444", "#2563EB", "#7C3AED", "#06B6D4"];

export default function DataCleanerView() {
  const navigate = useNavigate();
  const [section, setSection] = useState<SectionId>("dashboard");
  const [mda, setMda] = useState<MdaTypeId>("ONCHOLF");
  const [reportingYear, setReportingYear] = useState<string>(String(new Date().getFullYear()));
  const [result, setResult] = useState<ValidationResult | null>(null);
  const [batchId, setBatchId] = useState<string>("");
  const [fileName, setFileName] = useState<string>("");
  const [reviewer] = useState<string>("Data Manager");
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const config = MDA_CONFIGS[mda];
  const kpis = result?.kpis;

  const handleFile = useCallback(async (file: File) => {
    try {
      const imp = await importWorkbook(file, config);
      if (!imp.rows.length) { toast.error("No data rows found in the workbook."); return; }
      const res = validateDataset(config, imp.rows, { autoApply: true });
      setResult(res);
      setBatchId(imp.batchId);
      setFileName(imp.fileName);
      setSection("validation");
      if (imp.missingColumns.length)
        toast.warning(`${imp.missingColumns.length} expected column(s) missing for ${config.label}.`);
      toast.success(`Imported ${res.rows.length} rows · ${res.kpis.autoCorrections} auto-corrected.`);
    } catch (e: any) {
      toast.error("Import failed: " + (e?.message || "invalid file"));
    }
  }, [config]);

  const onImportClick = () => fileRef.current?.click();

  const handleExportCleaned = () => {
    if (!result) { toast.error("Import and clean a dataset first."); return; }
    exportCleaned(config, result.rows, batchId || newBatchId(), reviewer);
    toast.success("Cleaned dataset exported.");
  };

  const concludeCleaning = () => {
    if (!result) return;
    // persist audit + session
    const audit: AuditEntry[] = [];
    result.rows.forEach((r) => r.issues.filter((i) => i.autoFix !== undefined).forEach((i) => {
      audit.push({
        id: crypto.randomUUID(), batchId, date: new Date().toISOString(),
        rowRef: `${batchId}-R${r.index + 1}`, field: i.col,
        oldValue: String(i.original ?? ""), newValue: String(r.values[i.col] ?? ""),
        rule: i.category, user: reviewer,
      });
    }));
    appendAudit(audit);
    const session: CleaningSession = {
      id: batchId || newBatchId(), batchId, mdaType: mda, fileName,
      date: new Date().toISOString(), totalRows: kpis!.totalRows, validRows: kpis!.validRows,
      autoCorrections: kpis!.autoCorrections, criticalIssues: kpis!.criticalIssues,
      dataQualityScore: kpis!.dataQualityScore, reviewer, concluded: true,
    };
    saveSession(session);
    setFeedbackOpen(true);
  };

  return (
    <div className="flex h-[100dvh] w-full overflow-hidden bg-[#F8FAFC] text-slate-800">
      {/* Sidebar */}
      <aside className="hidden md:flex w-64 shrink-0 flex-col bg-[#0B2E6D] text-white overflow-y-auto">
        <div className="flex items-center gap-3 px-5 py-5 border-b border-white/10">
          <div className="h-10 w-10 rounded-full bg-white/15 grid place-items-center text-lg font-bold">+</div>
          <div>
            <p className="text-sm font-bold leading-tight">WHO NTD</p>
            <p className="text-[11px] text-white/60">Data Cleaner</p>
          </div>
        </div>
        <nav className="flex-1 py-3">
          {NAV.map((g) => (
            <div key={g.group} className="mb-2">
              <p className="px-5 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-white/40">{g.group}</p>
              {g.items.map((it) => {
                const Icon = it.icon;
                const active = section === it.id;
                return (
                  <button key={it.id} onClick={() => setSection(it.id)}
                    className={`flex w-full items-center gap-3 px-5 py-2 text-sm transition-colors ${active ? "bg-[#2563EB] text-white" : "text-white/75 hover:bg-white/10"}`}>
                    <Icon className="h-4 w-4" />{it.label}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>
        <button onClick={() => navigate("/")} className="flex items-center gap-2 px-5 py-4 text-xs text-white/60 hover:text-white border-t border-white/10">
          <ArrowLeft className="h-4 w-4" /> Back to App
        </button>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="shrink-0 bg-white border-b border-[#E2E8F0] px-6 py-3">
          <div className="flex flex-wrap items-center gap-3 justify-between">
            <div>
              <h1 className="text-xl font-bold text-[#0B2E6D]">NTD Treatment Data Cleaner</h1>
              <p className="text-xs text-slate-500">Clean. Validate. Improve. NTD Data for Impact.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex flex-col">
                <label className="text-[10px] font-medium text-slate-500">MDA Type</label>
                <Select value={mda} onValueChange={(v) => { setMda(v as MdaTypeId); setResult(null); }}>
                  <SelectTrigger className="h-9 w-56 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>{MDA_LIST.map((m) => <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="flex flex-col">
                <label className="text-[10px] font-medium text-slate-500">Reporting Year</label>
                <Input value={reportingYear} onChange={(e) => setReportingYear(e.target.value)} className="h-9 w-24 text-sm" />
              </div>
              <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.currentTarget.value = ""; }} />
              <Button onClick={onImportClick} className="h-9 mt-4 bg-[#16A34A] hover:bg-[#15803d]"><Upload className="h-4 w-4 mr-1" />Import Data</Button>
              <Button onClick={handleExportCleaned} className="h-9 mt-4 bg-[#7C3AED] hover:bg-[#6d28d9]"><Download className="h-4 w-4 mr-1" />Export Cleaned</Button>
              <Button variant="outline" onClick={() => exportTemplate(config)} className="h-9 mt-4"><FileSpreadsheet className="h-4 w-4 mr-1" />Template</Button>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-6">
          {renderSection()}
        </div>
      </main>

      <FeedbackDialog open={feedbackOpen} onOpenChange={setFeedbackOpen} mda={mda} batchId={batchId} reviewer={reviewer} score={kpis?.dataQualityScore ?? 80} />
    </div>
  );

  function renderSection() {
    switch (section) {
      case "dashboard": return <DashboardSection />;
      case "import": return <ImportSection onImportClick={onImportClick} config={config} />;
      case "preview":
      case "validation": return <ValidationSection result={result} config={config} review={section === "validation"} onConclude={concludeCleaning} />;
      case "issues": return <IssuesSection result={result} />;
      case "kpis": return <DashboardSection />;
      case "coverage": return <CoverageSection result={result} config={config} />;
      case "drug": return <DrugSection result={result} />;
      case "geo": return <GeoSection result={result} />;
      case "export": return <ExportSection onExport={handleExportCleaned} onTemplate={() => exportTemplate(config)} config={config} result={result} onConclude={concludeCleaning} />;
      case "history": return <HistorySection />;
      case "audit": return <AuditSection />;
      case "feedback": return <FeedbackSection onNew={() => setFeedbackOpen(true)} hasResult={!!result} />;
      case "performance": return <PerformanceSection />;
      case "geoRegistry": return <RefCard title="Geography Registry" desc="State → LGA → Ward → Community master registry powers geographic validation. Geographic columns are matched against official Nigerian administrative hierarchy; mismatches are flagged with a suggested registry correction." />;
      case "drugRules": return <DrugRulesSection />;
      case "valRules": return <ValRulesSection config={config} />;
      default: return null;
    }
  }

  function DashboardSection() {
    if (!kpis) return <EmptyState onImport={onImportClick} />;
    const cards = [
      { label: "Total Rows Imported", value: kpis.totalRows, sub: "100% of dataset", color: "#2563EB", icon: Database },
      { label: "Rows Valid", value: kpis.validRows, sub: pct(kpis.validRows, kpis.totalRows), color: "#16A34A", icon: CheckCircle2 },
      { label: "Rows with Issues", value: kpis.rowsWithIssues, sub: pct(kpis.rowsWithIssues, kpis.totalRows), color: "#F59E0B", icon: AlertTriangle },
      { label: "Critical Issues", value: kpis.criticalIssues, sub: pct(kpis.criticalIssues, kpis.totalRows), color: "#EF4444", icon: XCircle },
      { label: "Auto-Corrections Applied", value: kpis.autoCorrections, sub: pct(kpis.autoCorrections, kpis.totalRows), color: "#7C3AED", icon: Wand2 },
      { label: "Data Quality Score", value: kpis.dataQualityScore + "%", sub: scoreLabel(kpis.dataQualityScore), color: "#0B2E6D", icon: ShieldCheck },
      { label: "Data Completeness", value: kpis.completeness + "%", sub: scoreLabel(kpis.completeness), color: "#06B6D4", icon: BarChart3 },
    ];
    const mini = [
      { label: "Geographic Integrity", value: kpis.geographicIntegrity + "%" },
      { label: "Drug Ratio Compliance", value: kpis.drugRatioCompliance + "%" },
      { label: "Inventory Balance Compliance", value: kpis.inventoryBalanceCompliance + "%" },
      { label: "Duplicate Rows Detected", value: String(kpis.duplicatesMerged) },
      { label: "Therapeutic Coverage Pass Rate", value: kpis.coveragePassRate + "%" },
      { label: "Drug Wastage Rate", value: kpis.drugWastageRate + "%" },
      { label: "Audit Trail Completeness", value: kpis.auditTrailCompleteness + "%" },
    ];
    const issueData = Object.entries(kpis.issueCategoryCounts).map(([k, v]) => ({ name: k, value: v })).sort((a, b) => b.value - a.value).slice(0, 8);
    const covData = [
      { name: `Above (≥${config.coverageThreshold}%)`, value: kpis.coverageBuckets.above },
      { name: "Below Threshold", value: kpis.coverageBuckets.below },
      { name: "Critical (<60% of target)", value: kpis.coverageBuckets.critical },
    ];
    return (
      <div className="space-y-5">
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
          {cards.map((c) => <KpiCard key={c.label} {...c} />)}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
          {mini.map((m) => (
            <div key={m.label} className="rounded-xl bg-white border border-[#E2E8F0] p-3">
              <p className="text-lg font-bold text-[#0B2E6D]">{m.value}</p>
              <p className="text-[11px] text-slate-500 leading-tight">{m.label}</p>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Panel title="Issue Type Breakdown">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={issueData} margin={{ left: -10, bottom: 40 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis dataKey="name" angle={-30} textAnchor="end" height={70} tick={{ fontSize: 10 }} interval={0} />
                <YAxis tick={{ fontSize: 11 }} /><RTooltip />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {issueData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Panel>
          <Panel title="Coverage Distribution">
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={covData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={2}>
                  {covData.map((_, i) => <Cell key={i} fill={["#16A34A", "#F59E0B", "#EF4444"][i]} />)}
                </Pie>
                <RTooltip /></PieChart>
            </ResponsiveContainer>
            <div className="flex justify-center gap-3 text-[11px] flex-wrap">
              {covData.map((d, i) => <span key={d.name} className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: ["#16A34A", "#F59E0B", "#EF4444"][i] }} />{d.name}: {d.value}</span>)}
            </div>
          </Panel>
        </div>
      </div>
    );
  }
}

/* ── shared small components ─────────────────────────────────────────────── */
function KpiCard({ label, value, sub, color, icon: Icon }: any) {
  return (
    <div className="rounded-xl bg-white border border-[#E2E8F0] p-3.5 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-2xl font-bold" style={{ color }}>{value}</p>
          <p className="text-[11px] font-medium text-slate-600 leading-tight mt-0.5">{label}</p>
          <p className="text-[10px] text-slate-400">{sub}</p>
        </div>
        <div className="h-8 w-8 rounded-lg grid place-items-center shrink-0" style={{ background: color + "1a" }}>
          <Icon className="h-4 w-4" style={{ color }} />
        </div>
      </div>
    </div>
  );
}
function Panel({ title, children, action }: any) {
  return (
    <div className="rounded-xl bg-white border border-[#E2E8F0] p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3"><h3 className="font-semibold text-sm text-[#0B2E6D]">{title}</h3>{action}</div>
      {children}
    </div>
  );
}
function EmptyState({ onImport }: { onImport: () => void }) {
  return (
    <div className="grid place-items-center h-full text-center">
      <div className="max-w-md">
        <div className="mx-auto h-16 w-16 rounded-2xl bg-[#2563EB]/10 grid place-items-center mb-4"><Upload className="h-7 w-7 text-[#2563EB]" /></div>
        <h2 className="text-lg font-bold text-[#0B2E6D]">No dataset loaded</h2>
        <p className="text-sm text-slate-500 mt-1 mb-4">Select an MDA type, then import the matching Excel template. The cleaner validates every column, flags issues and suggests fixes automatically.</p>
        <Button onClick={onImport} className="bg-[#16A34A] hover:bg-[#15803d]"><Upload className="h-4 w-4 mr-1" />Import Data</Button>
      </div>
    </div>
  );
}
function pct(n: number, d: number) { return d ? `${((n / d) * 100).toFixed(1)}%` : "0%"; }
function scoreLabel(s: number) { return s >= 90 ? "Excellent" : s >= 75 ? "Good" : s >= 60 ? "Fair" : "Needs work"; }

function ImportSection({ onImportClick, config }: any) {
  return (
    <div className="max-w-2xl space-y-4">
      <Panel title={`Import — ${config.label}`}>
        <p className="text-sm text-slate-600 mb-3">Upload the Excel workbook for the selected MDA type. The cleaner auto-detects the <strong>{config.sheet}</strong> sheet, maps its {config.columns.length} columns and runs the full validation engine on import.</p>
        <div onClick={onImportClick} className="cursor-pointer rounded-xl border-2 border-dashed border-[#2563EB]/40 bg-[#2563EB]/5 p-10 text-center hover:bg-[#2563EB]/10">
          <Upload className="h-8 w-8 mx-auto text-[#2563EB] mb-2" />
          <p className="text-sm font-medium text-[#0B2E6D]">Click to upload .xlsx / .xls</p>
          <p className="text-xs text-slate-500">Validation rules apply automatically per MDA type</p>
        </div>
      </Panel>
    </div>
  );
}

function ValidationSection({ result, config, review, onConclude }: { result: ValidationResult | null; config: any; review: boolean; onConclude: () => void }) {
  if (!result) return <p className="text-sm text-slate-500">Import a dataset to preview and clean.</p>;
  const keyCols = ["State", "LGA", "Ward", "Community", "Total Census", "Total Treated", "Therapeutic Coverage (%)"].filter((k) => config.columns.some((c: any) => c.key === k));
  const issueMap = (r: RowResult, col: string) => r.issues.find((i) => i.col === col);
  const shown = result.rows.slice(0, 100);
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-600">Showing {shown.length} of {result.rows.length} rows · failed cells highlighted with suggested fixes.</p>
        {review && <Button onClick={onConclude} className="bg-[#0B2E6D] hover:bg-[#0a275c]"><CheckCircle2 className="h-4 w-4 mr-1" />Conclude Cleaning & Rate</Button>}
      </div>
      <div className="rounded-xl bg-white border border-[#E2E8F0] overflow-auto">
        <table className="w-full text-xs">
          <thead className="bg-[#F8FAFC] text-slate-600">
            <tr>
              <th className="px-2 py-2 text-left">#</th>
              {keyCols.map((c) => <th key={c} className="px-2 py-2 text-left whitespace-nowrap">{c}</th>)}
              <th className="px-2 py-2 text-left">Status</th>
              <th className="px-2 py-2 text-left">Top Issue / Suggested Fix</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => {
              const top = r.issues[0];
              return (
                <tr key={r.index} className="border-t border-[#E2E8F0] hover:bg-slate-50">
                  <td className="px-2 py-1.5 text-slate-400">{r.index + 1}</td>
                  {keyCols.map((c) => {
                    const iss = issueMap(r, c);
                    return (
                      <td key={c} className={`px-2 py-1.5 whitespace-nowrap ${iss ? "bg-[#EF4444]/5 text-[#EF4444] font-medium" : ""}`}>
                        {String(r.values[c] ?? "")}{iss && <AlertTriangle className="inline h-3 w-3 ml-1" />}
                      </td>
                    );
                  })}
                  <td className="px-2 py-1.5"><span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${STATUS_STYLE[r.status]}`}>{r.status}</span></td>
                  <td className="px-2 py-1.5 text-slate-600">{top ? <span><span style={{ color: SEV_COLOR[top.severity] }}>●</span> {top.message} — <em className="text-[#2563EB]">{top.suggestedFix}</em></span> : <span className="text-[#16A34A]">No issues</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function IssuesSection({ result }: { result: ValidationResult | null }) {
  if (!result) return <p className="text-sm text-slate-500">Import a dataset to view the issue register.</p>;
  const issues = result.issues.slice(0, 500);
  return (
    <div className="rounded-xl bg-white border border-[#E2E8F0] overflow-auto">
      <table className="w-full text-xs">
        <thead className="bg-[#F8FAFC] text-slate-600"><tr>
          <th className="px-3 py-2 text-left">Row</th><th className="px-3 py-2 text-left">Column</th>
          <th className="px-3 py-2 text-left">Category</th><th className="px-3 py-2 text-left">Severity</th>
          <th className="px-3 py-2 text-left">Message</th><th className="px-3 py-2 text-left">Suggested Fix</th>
        </tr></thead>
        <tbody>
          {issues.map((i: CellIssue, idx) => (
            <tr key={idx} className="border-t border-[#E2E8F0]">
              <td className="px-3 py-1.5">{i.rowIndex + 1}</td>
              <td className="px-3 py-1.5 whitespace-nowrap">{i.col}</td>
              <td className="px-3 py-1.5">{i.category}</td>
              <td className="px-3 py-1.5"><span className="px-2 py-0.5 rounded-full text-[10px] font-medium" style={{ background: SEV_COLOR[i.severity] + "1a", color: SEV_COLOR[i.severity] }}>{i.severity}</span></td>
              <td className="px-3 py-1.5 text-slate-600">{i.message}</td>
              <td className="px-3 py-1.5 text-[#2563EB]">{i.suggestedFix}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CoverageSection({ result, config }: any) {
  if (!result) return <p className="text-sm text-slate-500">Import a dataset to analyse coverage.</p>;
  const k = result.kpis;
  const data = [
    { name: "Above", value: k.coverageBuckets.above, fill: "#16A34A" },
    { name: "Below", value: k.coverageBuckets.below, fill: "#F59E0B" },
    { name: "Critical", value: k.coverageBuckets.critical, fill: "#EF4444" },
  ];
  return (
    <Panel title={`Therapeutic Coverage Analysis (threshold ≥ ${config.coverageThreshold}%)`}>
      <p className="text-sm text-slate-600 mb-3">Pass rate: <strong>{k.coveragePassRate}%</strong> of reporting units met the {config.label} therapeutic coverage threshold.</p>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={data}><CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" /><XAxis dataKey="name" /><YAxis /><RTooltip />
          <Bar dataKey="value" radius={[6, 6, 0, 0]}>{data.map((d, i) => <Cell key={i} fill={d.fill} />)}</Bar></BarChart>
      </ResponsiveContainer>
    </Panel>
  );
}

function DrugSection({ result }: { result: ValidationResult | null }) {
  if (!result) return <p className="text-sm text-slate-500">Import a dataset to analyse drug ratios & inventory.</p>;
  const k = result.kpis;
  return (
    <div className="grid md:grid-cols-3 gap-4">
      <KpiCard label="Drug Ratio Compliance" value={k.drugRatioCompliance + "%"} sub={scoreLabel(k.drugRatioCompliance)} color="#2563EB" icon={Pill} />
      <KpiCard label="Inventory Balance Compliance" value={k.inventoryBalanceCompliance + "%"} sub={scoreLabel(k.inventoryBalanceCompliance)} color="#16A34A" icon={Database} />
      <KpiCard label="Drug Wastage Rate" value={k.drugWastageRate + "%"} sub="lost ÷ received" color="#EF4444" icon={FlaskConical} />
    </div>
  );
}

function GeoSection({ result }: { result: ValidationResult | null }) {
  if (!result) return <p className="text-sm text-slate-500">Import a dataset to analyse geographic coverage.</p>;
  return <KpiCard label="Geographic Integrity Score" value={result.kpis.geographicIntegrity + "%"} sub={scoreLabel(result.kpis.geographicIntegrity)} color="#06B6D4" icon={Globe2} />;
}

function ExportSection({ onExport, onTemplate, config, result, onConclude }: any) {
  return (
    <div className="max-w-2xl space-y-4">
      <Panel title={`Export — ${config.label}`}>
        <p className="text-sm text-slate-600 mb-4">Exports use the exact column structure for <strong>{config.label}</strong>, with system audit columns (Row_ID, Validation_Status, Cleaning_Log, hashes, reviewer) appended.</p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={onExport} disabled={!result} className="bg-[#7C3AED] hover:bg-[#6d28d9]"><Download className="h-4 w-4 mr-1" />Export Cleaned Dataset</Button>
          <Button variant="outline" onClick={onTemplate}><FileSpreadsheet className="h-4 w-4 mr-1" />Download Blank Template</Button>
          {result && <Button onClick={onConclude} className="bg-[#0B2E6D] hover:bg-[#0a275c]"><CheckCircle2 className="h-4 w-4 mr-1" />Conclude & Rate Cleaning</Button>}
        </div>
      </Panel>
    </div>
  );
}

function HistorySection() {
  const sessions = getSessions();
  if (!sessions.length) return <RefCard title="Cleaning History" desc="No cleaning sessions yet. Conclude a cleaning run to record it here." />;
  return (
    <div className="rounded-xl bg-white border border-[#E2E8F0] overflow-auto">
      <table className="w-full text-xs">
        <thead className="bg-[#F8FAFC] text-slate-600"><tr>
          {["Date", "Batch", "MDA", "File", "Rows", "Valid", "Auto-Fixed", "Critical", "Quality", "Rating"].map((h) => <th key={h} className="px-3 py-2 text-left">{h}</th>)}
        </tr></thead>
        <tbody>{sessions.map((s) => (
          <tr key={s.id} className="border-t border-[#E2E8F0]">
            <td className="px-3 py-1.5">{s.date.slice(0, 10)}</td><td className="px-3 py-1.5">{s.batchId}</td>
            <td className="px-3 py-1.5">{s.mdaType}</td><td className="px-3 py-1.5">{s.fileName}</td>
            <td className="px-3 py-1.5">{s.totalRows}</td><td className="px-3 py-1.5">{s.validRows}</td>
            <td className="px-3 py-1.5">{s.autoCorrections}</td><td className="px-3 py-1.5 text-[#EF4444]">{s.criticalIssues}</td>
            <td className="px-3 py-1.5">{s.dataQualityScore}%</td><td className="px-3 py-1.5">{s.selfRating ? s.selfRating + "%" : "—"}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

function AuditSection() {
  const audit = getAudit();
  if (!audit.length) return <RefCard title="Audit Trail" desc="Every automated correction is logged here: field, old value, new value, rule triggered, user and timestamp." />;
  return (
    <div className="rounded-xl bg-white border border-[#E2E8F0] overflow-auto">
      <table className="w-full text-xs">
        <thead className="bg-[#F8FAFC] text-slate-600"><tr>
          {["Date", "Row", "Field", "Old", "New", "Rule", "User"].map((h) => <th key={h} className="px-3 py-2 text-left">{h}</th>)}
        </tr></thead>
        <tbody>{audit.slice(0, 500).map((a) => (
          <tr key={a.id} className="border-t border-[#E2E8F0]">
            <td className="px-3 py-1.5 whitespace-nowrap">{a.date.slice(0, 16).replace("T", " ")}</td>
            <td className="px-3 py-1.5">{a.rowRef}</td><td className="px-3 py-1.5">{a.field}</td>
            <td className="px-3 py-1.5 text-[#EF4444]">{a.oldValue}</td><td className="px-3 py-1.5 text-[#16A34A]">{a.newValue}</td>
            <td className="px-3 py-1.5">{a.rule}</td><td className="px-3 py-1.5">{a.user}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

function FeedbackSection({ onNew, hasResult }: { onNew: () => void; hasResult: boolean }) {
  const fb = getFeedback();
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="font-semibold text-[#0B2E6D]">User Feedback on Automated Cleaning</h3>
        <Button onClick={onNew} disabled={!hasResult} className="bg-[#2563EB] hover:bg-[#1d4fd7]"><MessageSquareHeart className="h-4 w-4 mr-1" />Rate Current Cleaning</Button>
      </div>
      {!fb.length ? <RefCard title="No feedback yet" desc="After concluding a cleaning run, rate the system's performance and disaggregate the score across areas. This trains the learning model." /> :
        <div className="rounded-xl bg-white border border-[#E2E8F0] overflow-auto">
          <table className="w-full text-xs"><thead className="bg-[#F8FAFC] text-slate-600"><tr>
            {["Date", "MDA", "Score", "Top Areas", "Comment"].map((h) => <th key={h} className="px-3 py-2 text-left">{h}</th>)}
          </tr></thead><tbody>{fb.map((f) => (
            <tr key={f.id} className="border-t border-[#E2E8F0]">
              <td className="px-3 py-1.5">{f.date.slice(0, 10)}</td><td className="px-3 py-1.5">{f.mdaType}</td>
              <td className="px-3 py-1.5 font-semibold text-[#0B2E6D]">{f.overallScore}%</td>
              <td className="px-3 py-1.5">{Object.entries(f.disaggregation).map(([a, p]) => `${a} ${p}%`).join(", ")}</td>
              <td className="px-3 py-1.5 text-slate-600">{f.comment}</td>
            </tr>
          ))}</tbody></table>
        </div>}
    </div>
  );
}

function PerformanceSection() {
  const sum = learningSummary();
  const weightData = Object.entries(sum.weights).map(([k, v]) => ({ name: k, value: +(v * 100).toFixed(1) }));
  return (
    <div className="space-y-4">
      <div className="grid md:grid-cols-3 gap-4">
        <KpiCard label="Feedback Records" value={sum.count} sub="user ratings" color="#2563EB" icon={MessageSquareHeart} />
        <KpiCard label="Avg System Rating" value={sum.avgScore + "%"} sub={scoreLabel(sum.avgScore)} color="#16A34A" icon={Activity} />
        <KpiCard label="Learning Areas Tuned" value={weightData.length} sub="confidence weights" color="#7C3AED" icon={Wand2} />
      </div>
      {!!sum.trend.length && <Panel title="Rating Trend">
        <ResponsiveContainer width="100%" height={240}><LineChart data={sum.trend}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" /><XAxis dataKey="date" tick={{ fontSize: 11 }} /><YAxis domain={[0, 100]} /><RTooltip />
          <Line type="monotone" dataKey="score" stroke="#16A34A" strokeWidth={2} /></LineChart></ResponsiveContainer>
      </Panel>}
      {!!weightData.length && <Panel title="Model Confidence by Area (learned from feedback)">
        <ResponsiveContainer width="100%" height={260}><BarChart data={weightData} layout="vertical" margin={{ left: 30 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" /><XAxis type="number" domain={[0, 100]} /><YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 11 }} /><RTooltip />
          <Bar dataKey="value" radius={[0, 4, 4, 0]}>{weightData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}</Bar></BarChart></ResponsiveContainer>
      </Panel>}
      {!sum.count && <RefCard title="System Performance" desc="The learning model adjusts its per-area confidence based on user feedback. Conclude a cleaning run and submit a rating to begin training." />}
    </div>
  );
}

function DrugRulesSection() {
  const rows = [
    ["ONCHO Only", "IVM ratio 1.0–3.5", "≥ 80%"],
    ["LF Only", "IVM 1.0–3.5; ALB ≈ 1.0", "≥ 65%"],
    ["ONCHOLF", "IVM 1.0–3.5; ALB ≈ 1.0", "≥ 65%"],
    ["SCH Only", "PZQ 2.0–3.0", "≥ 75%"],
    ["SCHSTH", "PZQ 2.0–3.0; MEB ≈ 1.0", "≥ 75%"],
    ["Trachoma", "AZT Tabs 3.0–4.0; AZT POS 4–10 ml; TEO ≈ 2.0", "≥ 80%"],
  ];
  return (
    <Panel title="Drug & Ratio Rules (SOP)">
      <table className="w-full text-sm"><thead className="text-slate-500"><tr><th className="text-left py-1">MDA Type</th><th className="text-left py-1">Drug ratio rule</th><th className="text-left py-1">Coverage threshold</th></tr></thead>
        <tbody>{rows.map((r) => <tr key={r[0]} className="border-t border-[#E2E8F0]"><td className="py-1.5 font-medium">{r[0]}</td><td className="py-1.5">{r[1]}</td><td className="py-1.5">{r[2]}</td></tr>)}</tbody></table>
      <p className="text-xs text-slate-500 mt-3">SCHSTH templates exported by this cleaner include the missing <strong>MEB Received/Used/Lost/Balance</strong> columns so the MEB ratio can be validated against a real source field.</p>
    </Panel>
  );
}

function ValRulesSection({ config }: { config: any }) {
  return (
    <Panel title={`Validation Rules — ${config.label} (${config.rules.length} active checks across ${config.columns.length} columns)`}>
      <div className="max-h-[60vh] overflow-auto text-xs">
        <table className="w-full"><thead className="bg-[#F8FAFC] text-slate-600 sticky top-0"><tr><th className="px-2 py-2 text-left">Column / Target</th><th className="px-2 py-2 text-left">Rule</th></tr></thead>
          <tbody>{config.rules.map((r: any, i: number) => (
            <tr key={i} className="border-t border-[#E2E8F0]"><td className="px-2 py-1.5">{r.col || r.bal || r.used || "—"}</td><td className="px-2 py-1.5 text-slate-600">{describeRule(r)}</td></tr>
          ))}</tbody></table>
      </div>
    </Panel>
  );
}
function describeRule(r: any): string {
  switch (r.t) {
    case "required": return "Required field";
    case "year": return "Valid 4-digit year (2020–2035)";
    case "date": return "Valid date";
    case "dateGte": return `Must be ≥ ${r.ref}`;
    case "int": return "Integer ≥ 0";
    case "num": return "Numeric ≥ 0";
    case "sum": return `Must equal sum of: ${r.parts.join(" + ")}`;
    case "lte": return `Should not exceed ${r.ref}`;
    case "usedLteRec": return `${r.drug} Used ≤ Received`;
    case "balance": return `${r.drug} Balance = Received − Used − Lost`;
    case "ratio": return `${r.drug} ratio = Used ÷ Total Treated; range ${r.min}–${r.max}`;
    case "coverage": return `= Treated ÷ Census × 100; flag if < ${r.threshold}%`;
    case "geocov": return "Should be 100% where treatment occurred";
    case "disease": return `Must be one of: ${r.accepted.join(", ")}`;
    default: return r.t;
  }
}

function RefCard({ title, desc }: { title: string; desc: string }) {
  return <Panel title={title}><p className="text-sm text-slate-600">{desc}</p></Panel>;
}

/* ── Feedback dialog (learning) ──────────────────────────────────────────── */
function FeedbackDialog({ open, onOpenChange, mda, batchId, reviewer, score }: any) {
  const [overall, setOverall] = useState<number[]>([score]);
  const [areas, setAreas] = useState<FeedbackArea[]>([]);
  const [alloc, setAlloc] = useState<Record<string, number>>({});
  const [comment, setComment] = useState("");
  const totalAlloc = Object.values(alloc).reduce((a, b) => a + (b || 0), 0);

  const toggle = (a: FeedbackArea) => {
    setAreas((prev) => prev.includes(a) ? prev.filter((x) => x !== a) : [...prev, a]);
    setAlloc((prev) => { const n = { ...prev }; if (n[a] !== undefined) delete n[a]; else n[a] = 0; return n; });
  };

  const submit = () => {
    if (!areas.length) { toast.error("Select at least one area the system did well."); return; }
    if (Math.round(totalAlloc) !== 100) { toast.error(`Disaggregation must total 100% (currently ${totalAlloc}%).`); return; }
    saveFeedback({
      id: crypto.randomUUID(), batchId, date: new Date().toISOString(), mdaType: mda, reviewer,
      overallScore: overall[0], disaggregation: alloc, comment,
    });
    // attach rating to session
    const sessions = getSessions();
    const s = sessions.find((x) => x.batchId === batchId);
    if (s) { s.selfRating = overall[0]; saveSession(s); }
    toast.success("Thank you — feedback recorded and the learning model updated.");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Rate the Automated Cleaning</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium">Overall system performance: <span className="text-[#2563EB] font-bold">{overall[0]}%</span></label>
            <Slider value={overall} onValueChange={setOverall} min={0} max={100} step={1} className="mt-2" />
          </div>
          <div>
            <label className="text-sm font-medium">Areas the system did very well</label>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {FEEDBACK_AREAS.map((a) => (
                <button key={a} onClick={() => toggle(a)} className={`px-2.5 py-1 rounded-full text-xs border ${areas.includes(a) ? "bg-[#2563EB] text-white border-[#2563EB]" : "border-[#E2E8F0] text-slate-600"}`}>{a}</button>
              ))}
            </div>
          </div>
          {!!areas.length && (
            <div>
              <label className="text-sm font-medium">Disaggregate the score across areas (must total 100%) — <span className={Math.round(totalAlloc) === 100 ? "text-[#16A34A]" : "text-[#EF4444]"}>{totalAlloc}%</span></label>
              <div className="space-y-2 mt-2">
                {areas.map((a) => (
                  <div key={a} className="flex items-center gap-2">
                    <span className="text-xs w-24">{a}</span>
                    <Slider value={[alloc[a] ?? 0]} onValueChange={(v) => setAlloc((p) => ({ ...p, [a]: v[0] }))} min={0} max={100} step={5} className="flex-1" />
                    <span className="text-xs w-10 text-right">{alloc[a] ?? 0}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <Textarea placeholder="Optional comment (what to improve next time)…" value={comment} onChange={(e) => setComment(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} className="bg-[#0B2E6D] hover:bg-[#0a275c]">Submit Feedback</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

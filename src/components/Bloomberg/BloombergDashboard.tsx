import { useMemo, useRef, useState } from "react";
import { ArrowLeft, RefreshCw, School, CheckCircle2, FileText, Users, TrendingUp, AlertTriangle, MapPin, Download, Upload, Loader2, FileImage, Sparkles, XCircle, ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid,
} from "recharts";
import MapVisualization from "@/components/MapVisualization/MapVisualization";
import { MapMarker } from "@/components/MapVisualization/types";
import { useBloombergDashboard } from "@/hooks/useBloombergDashboard";
import { useAuth } from "@/hooks/useAuth";
import { exportSchoolTemplate, importSchoolTemplate } from "@/lib/bloomberg/schoolTemplate";
import { toast } from "sonner";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import bloombergLogo from "@/assets/bloomberg-eye-logo.png";
import { pctTone, toneColor, varianceTone } from "@/lib/conditionalFormatting";


const NAVY = "#0c2340";
const BLUE = "#2563eb";
const TEAL = "#14b8a6";
const PINK = "#ec4899";

interface Props {
  onClose: () => void;
}

const fmt = (n: number) => n.toLocaleString();

// Reason colors for the "schools that do not exist" analysis.
const REASON_COLORS: Record<string, string> = {
  wrong_location: "#dc2626",
  renamed: "#f59e0b",
  closed_down: "#7c3aed",
  inaccessible: "#0ea5e9",
  other: "#64748b",
};

// Status pill — colors validation workflow state.
const StatusBadge = ({ status }: { status: string }) => {
  const map: Record<string, { label: string; bg: string; fg: string }> = {
    sent: { label: "Submitted", bg: "#dcfce7", fg: "#15803d" },
    finalized: { label: "Finalized", bg: "#dbeafe", fg: "#1d4ed8" },
    draft: { label: "Draft", bg: "#fef3c7", fg: "#b45309" },
  };
  const s = map[status] || { label: status, bg: "#f1f5f9", fg: "#475569" };
  return (
    <span className="inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: s.bg, color: s.fg }}>
      {s.label}
    </span>
  );
};

// Operational status pill.
const OpBadge = ({ value, label }: { value: string | null; label: string | null }) => {
  if (!label) return <span className="text-muted-foreground">—</span>;
  const map: Record<string, { bg: string; fg: string }> = {
    operational: { bg: "#dcfce7", fg: "#15803d" },
    partially: { bg: "#fef3c7", fg: "#b45309" },
    closed: { bg: "#fee2e2", fg: "#b91c1c" },
    merged: { bg: "#ede9fe", fg: "#6d28d9" },
  };
  const s = (value && map[value]) || { bg: "#f1f5f9", fg: "#475569" };
  return (
    <span className="inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: s.bg, color: s.fg }}>
      {label}
    </span>
  );
};


const Kpi = ({ icon: Icon, label, value, tint, sub }: { icon: any; label: string; value: string; tint: string; sub?: string }) => (
  <div
    className="relative overflow-hidden rounded-xl border border-border bg-card p-4 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md"
    style={{ background: `linear-gradient(135deg, ${tint}0d, transparent 70%)` }}
  >
    <span className="absolute inset-y-0 left-0 w-1" style={{ background: tint }} />
    <div className="flex items-center justify-between">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: `${tint}1a`, color: tint }}>
        <Icon className="h-4 w-4" />
      </div>
    </div>
    <p className="mt-2 text-2xl font-bold" style={{ color: tint }}>{value}</p>
    {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
  </div>
);

export default function BloombergDashboard({ onClose }: Props) {
  const { stats, byState, points, nonExistent, validatedTable, loading, reload, simulate, setSimulate } = useBloombergDashboard();
  const { isOwner, isSuperAdmin } = useAuth();
  const canManage = isOwner || isSuperAdmin;
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const captureRef = useRef<HTMLDivElement | null>(null);

  const captureCanvas = async () => {
    const el = captureRef.current;
    if (!el) throw new Error("Dashboard not ready");
    return html2canvas(el, {
      backgroundColor: "#f4f6fb",
      scale: 2,
      useCORS: true,
      logging: false,
      windowWidth: el.scrollWidth,
      windowHeight: el.scrollHeight,
    });
  };

  const stamp = () => {
    const d = new Date();
    return d.toISOString().slice(0, 19).replace(/[:T]/g, "-");
  };

  const exportImage = async (format: "png" | "jpeg") => {
    setCapturing(true);
    try {
      const canvas = await captureCanvas();
      const link = document.createElement("a");
      link.download = `bloomberg-validation-dashboard-${stamp()}.${format}`;
      link.href = canvas.toDataURL(`image/${format}`, 0.95);
      link.click();
      toast.success(`Dashboard exported as ${format.toUpperCase()}`);
    } catch (e: any) {
      toast.error(e?.message || "Export failed");
    } finally {
      setCapturing(false);
    }
  };

  const exportPDF = async () => {
    setCapturing(true);
    try {
      const canvas = await captureCanvas();
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF({
        orientation: canvas.width > canvas.height ? "landscape" : "portrait",
        unit: "px",
        format: [canvas.width, canvas.height],
      });
      pdf.addImage(imgData, "PNG", 0, 0, canvas.width, canvas.height);
      pdf.save(`bloomberg-validation-dashboard-${stamp()}.pdf`);
      toast.success("Dashboard exported as PDF");
    } catch (e: any) {
      toast.error(e?.message || "Export failed");
    } finally {
      setCapturing(false);
    }
  };



  const handleExport = async () => {
    setExporting(true);
    try {
      await exportSchoolTemplate();
      toast.success("Empty template exported — ready to fill & re-import");
    } catch (e: any) {
      toast.error(e?.message || "Export failed");
    } finally {
      setExporting(false);
    }
  };

  const handleImport = async (file: File | null) => {
    if (!file) return;
    setImporting(true);
    try {
      const res = await importSchoolTemplate(file);
      if (res.errors.length) {
        toast.warning(`Imported ${res.schools} schools, ${res.baselines} baselines — ${res.errors.length} issue(s)`, {
          description: res.errors.slice(0, 3).join(" • "),
        });
      } else {
        toast.success(`Updated ${res.schools.toLocaleString()} schools & ${res.baselines.toLocaleString()} baseline records`);
      }
      reload();
    } catch (e: any) {
      toast.error(e?.message || "Import failed");
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };



  const markers: MapMarker[] = useMemo(
    () =>
      points.map((p, i) => ({
        id: `bbg-${i}`,
        lat: p.lat,
        lng: p.lng,
        title: p.name || "Validated school",
        description: p.status,
        markerColor: p.status === "sent" || p.status === "finalized" ? TEAL : "#f59e0b",
      })),
    [points],
  );

  const genderData = [
    { name: "Boys", value: stats.validatedMale, color: BLUE },
    { name: "Girls", value: stats.validatedFemale, color: PINK },
  ];

  const comparisonData = [
    { name: "Baseline (LEA)", value: stats.baselineTotal, color: "#94a3b8" },
    { name: "Validated", value: stats.validatedTotal, color: TEAL },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#f4f6fb]">
      {/* Navy header */}
      <div className="shrink-0 px-4 py-4 text-white" style={{ background: `linear-gradient(160deg, ${NAVY}, #163a63)` }}>
        <div className="flex items-center justify-between gap-3">
          <button onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 hover:bg-white/20">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2">
            <img src={bloombergLogo} alt="Bloomberg School Eye Health" className="h-7 w-7 rounded" loading="lazy" width={28} height={28} />
            <span className="text-sm font-semibold leading-tight">Bloomberg School<br />Eye Health Project</span>
          </div>
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="secondary" disabled={capturing} className="h-9 bg-white/15 text-white hover:bg-white/25 border-0">
                  {capturing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                  <span className="ml-1.5 hidden sm:inline">Export</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => exportPDF()}>
                  <FileText className="mr-2 h-4 w-4" /> Export as PDF
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => exportImage("png")}>
                  <FileImage className="mr-2 h-4 w-4" /> Export as PNG
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => exportImage("jpeg")}>
                  <FileImage className="mr-2 h-4 w-4" /> Export as JPEG
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            {isOwner && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setSimulate(!simulate)}
                className={`h-9 border-0 ${simulate ? "bg-[#2dd4a8] text-[#0c2340] hover:bg-[#22c0a0] font-semibold" : "bg-white/15 text-white hover:bg-white/25"}`}
              >
                <Sparkles className="h-4 w-4" />
                <span className="ml-1.5 hidden sm:inline">{simulate ? "Simulating" : "Simulate"}</span>
              </Button>
            )}
            <Button size="sm" variant="secondary" onClick={reload} disabled={loading} className="h-9 bg-white/15 text-white hover:bg-white/25 border-0">
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>



        <h1 className="mt-3 text-2xl font-bold">Validation Dashboard</h1>
        <p className="text-sm text-white/70">Independent school enrolment validation — admin analytics</p>
        {canManage && (
          <div className="mt-3 flex flex-wrap gap-2">
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              hidden
              onChange={(e) => handleImport(e.target.files?.[0] || null)}
            />
            <Button size="sm" onClick={handleExport} disabled={exporting} className="h-9 bg-white/15 text-white hover:bg-white/25 border-0">
              {exporting ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Download className="mr-1.5 h-4 w-4" />}
              Export Template
            </Button>
            <Button size="sm" onClick={() => fileRef.current?.click()} disabled={importing} className="h-9 bg-[#2dd4a8] text-[#0c2340] hover:bg-[#22c0a0] border-0 font-semibold">
              {importing ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Upload className="mr-1.5 h-4 w-4" />}
              Import Schools & Baselines
            </Button>
          </div>
        )}
      </div>

      <div ref={captureRef} className="min-h-0 flex-1 overflow-y-auto p-4 space-y-4">
        {/* Report header & timestamp — visible and captured in exports */}
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card px-4 py-3 shadow-sm">
          <div className="flex items-center gap-2">
            <img src={bloombergLogo} alt="" className="h-8 w-8 rounded" width={32} height={32} />
            <div>
              <h2 className="text-sm font-bold text-foreground">Bloomberg Validation Dashboard</h2>
              <p className="text-xs text-muted-foreground">School Enrolment Validation Report</p>
            </div>
          </div>
          <p className="text-xs font-medium text-muted-foreground">Generated: {new Date().toLocaleString()}</p>
        </div>

        {/* KPI tiles */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi icon={School} label="Total Schools" value={fmt(stats.totalSchools)} tint={NAVY} />
          <Kpi icon={CheckCircle2} label="Schools Validated" value={fmt(stats.validatedSchools)} tint={toneColor(pctTone(stats.coveragePct, { good: 75, ok: 50, warn: 25 }))} sub={`${stats.coveragePct.toFixed(1)}% coverage`} />
          <Kpi icon={FileText} label="Submissions" value={fmt(stats.submittedCount)} tint={BLUE} sub={`${stats.draftCount} drafts`} />
          <Kpi icon={Users} label="Pupils Validated" value={fmt(stats.validatedTotal)} tint={PINK} />
          <Kpi icon={Users} label="Baseline (LEA)" value={fmt(stats.baselineTotal)} tint="#64748b" sub="for validated schools" />
          <Kpi
            icon={TrendingUp}
            label="Overall Variance"
            value={`${stats.overallPct >= 0 ? "+" : ""}${stats.overallPct.toFixed(1)}%`}
            tint={toneColor(varianceTone(stats.overallPct))}
            sub="validated vs baseline"
          />
          <Kpi icon={Users} label="Boys" value={fmt(stats.validatedMale)} tint={BLUE} />
          <Kpi icon={Users} label="Girls" value={fmt(stats.validatedFemale)} tint={PINK} />
        </div>

        {/* Map */}
        <div className="rounded-xl border border-border bg-card p-3 shadow-sm">
          <div className="mb-2 flex items-center gap-2">
            <MapPin className="h-4 w-4 text-[#2563eb]" />
            <h3 className="text-sm font-semibold text-foreground">Validated Schools Across Nigeria</h3>
          </div>
          <MapVisualization markers={markers} height="420px" showNigeriaBoundaries showLegend={false} />
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <h3 className="mb-3 text-sm font-semibold text-foreground">Baseline vs Validated Enrolment</h3>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={comparisonData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip formatter={(v: number) => fmt(v)} />
                <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                  {comparisonData.map((d, i) => (
                    <Cell key={i} fill={d.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <h3 className="mb-3 text-sm font-semibold text-foreground">Gender Distribution (Validated)</h3>
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={genderData} dataKey="value" nameKey="name" innerRadius={60} outerRadius={95} paddingAngle={3}>
                  {genderData.map((d, i) => (
                    <Cell key={i} fill={d.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => fmt(v)} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Submissions by state */}
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold text-foreground">Submissions by State</h3>
          <ResponsiveContainer width="100%" height={Math.max(160, byState.length * 32)}>
            <BarChart data={byState} layout="vertical" margin={{ left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 12 }} allowDecimals={false} />
              <YAxis type="category" dataKey="state" width={110} tick={{ fontSize: 12 }} />
              <Tooltip />
              <Bar dataKey="count" fill={BLUE} radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Top discrepancies */}
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            <h3 className="text-sm font-semibold text-foreground">Top Enrolment Discrepancies</h3>
          </div>
          {stats.discrepancies.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No validated schools with baseline data yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="py-2 pr-3">School</th>
                    <th className="py-2 px-3 text-right">Baseline</th>
                    <th className="py-2 px-3 text-right">Validated</th>
                    <th className="py-2 px-3 text-right">Diff</th>
                    <th className="py-2 pl-3 text-right">Variance</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.discrepancies.map((d, i) => (
                    <tr key={i} className="border-b border-border/50 last:border-0">
                      <td className="py-2 pr-3 font-medium text-foreground">{d.school}</td>
                      <td className="py-2 px-3 text-right tabular-nums">{fmt(d.baseline)}</td>
                      <td className="py-2 px-3 text-right tabular-nums">{fmt(d.validated)}</td>
                      <td className={`py-2 px-3 text-right tabular-nums ${d.diff < 0 ? "text-red-600" : "text-emerald-600"}`}>
                        {d.diff >= 0 ? "+" : ""}{fmt(d.diff)}
                      </td>
                      <td className={`py-2 pl-3 text-right font-semibold tabular-nums ${Math.abs(d.pct) >= 20 ? "text-red-600" : "text-amber-600"}`}>
                        {d.pct >= 0 ? "+" : ""}{d.pct.toFixed(1)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Schools that do not exist + reason analysis */}
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="mb-1 flex items-center gap-2">
            <XCircle className="h-4 w-4 text-red-600" />
            <h3 className="text-sm font-semibold text-foreground">Schools That Do Not Exist / Not Found</h3>
            <span className="ml-auto rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-bold text-red-700">{fmt(nonExistent.total)}</span>
          </div>
          <p className="mb-3 text-xs text-muted-foreground">Schools that field validators could not locate, with the documented reason for each.</p>
          {nonExistent.total === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No schools have been reported as non-existent.</p>
          ) : (
            <>
              {/* Reason analysis bars */}
              <div className="mb-4 space-y-2">
                {nonExistent.reasonAnalysis.map((r) => (
                  <div key={r.key} className="flex items-center gap-3">
                    <span className="w-44 shrink-0 truncate text-xs font-medium text-foreground" title={r.name}>{r.name}</span>
                    <div className="relative h-5 flex-1 overflow-hidden rounded bg-muted">
                      <div className="h-full rounded" style={{ width: `${Math.max(4, r.pct)}%`, background: REASON_COLORS[r.key] || "#64748b" }} />
                    </div>
                    <span className="w-24 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{r.count} ({r.pct.toFixed(0)}%)</span>
                  </div>
                ))}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-muted-foreground">
                      <th className="py-2 pr-3">School</th>
                      <th className="py-2 px-3">Code</th>
                      <th className="py-2 px-3">State</th>
                      <th className="py-2 px-3">LGA</th>
                      <th className="py-2 px-3">Reason</th>
                      <th className="py-2 pl-3">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {nonExistent.rows.map((r, i) => (
                      <tr key={i} className="border-b border-border/50 last:border-0">
                        <td className="py-2 pr-3 font-medium text-foreground">{r.school}</td>
                        <td className="py-2 px-3 text-xs text-muted-foreground">{r.code}</td>
                        <td className="py-2 px-3">{r.state}</td>
                        <td className="py-2 px-3">{r.lga}</td>
                        <td className="py-2 px-3">
                          <span className="inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold text-white" style={{ background: REASON_COLORS[r.reasonValue] || "#64748b" }}>
                            {r.reason}
                          </span>
                        </td>
                        <td className="py-2 pl-3"><StatusBadge status={r.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        {/* Validated schools register with status & variance */}
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="mb-1 flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-[#2563eb]" />
            <h3 className="text-sm font-semibold text-foreground">Validated Schools — Status & Variance Register</h3>
            <span className="ml-auto rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-bold text-blue-700">{fmt(validatedTable.length)}</span>
          </div>
          <p className="mb-3 text-xs text-muted-foreground">Every validated school with baseline vs validated enrolment, whether a variance exists and its magnitude. Rows tinted by variance severity.</p>
          {validatedTable.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No validated schools yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="py-2 pr-3">School</th>
                    <th className="py-2 px-3">State / LGA</th>
                    <th className="py-2 px-3">Operational</th>
                    <th className="py-2 px-3 text-right">Baseline</th>
                    <th className="py-2 px-3 text-right">Validated</th>
                    <th className="py-2 px-3 text-center">Variance?</th>
                    <th className="py-2 px-3 text-right">Diff</th>
                    <th className="py-2 px-3 text-right">%</th>
                    <th className="py-2 pl-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {validatedTable.map((r, i) => {
                    const sev = !r.hasVariance ? 0 : Math.abs(r.pct) >= 20 ? 3 : Math.abs(r.pct) >= 10 ? 2 : 1;
                    const rowBg = sev === 3 ? "bg-red-50/70" : sev === 2 ? "bg-amber-50/60" : sev === 1 ? "bg-yellow-50/40" : "bg-emerald-50/40";
                    return (
                      <tr key={i} className={`border-b border-border/50 last:border-0 ${rowBg}`}>
                        <td className="py-2 pr-3">
                          <div className="font-medium text-foreground">{r.school}</div>
                          <div className="text-[11px] text-muted-foreground">{r.code} · {r.type}</div>
                        </td>
                        <td className="py-2 px-3 text-xs">{r.state}<br /><span className="text-muted-foreground">{r.lga}</span></td>
                        <td className="py-2 px-3"><OpBadge value={r.operationalValue} label={r.operational} /></td>
                        <td className="py-2 px-3 text-right tabular-nums">{r.hasBaseline ? fmt(r.baseline) : "—"}</td>
                        <td className="py-2 px-3 text-right tabular-nums">{fmt(r.validated)}</td>
                        <td className="py-2 px-3 text-center">
                          {!r.hasBaseline ? (
                            <span className="inline-block rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">No baseline</span>
                          ) : r.hasVariance ? (
                            <span className="inline-block rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700">Variance</span>
                          ) : (
                            <span className="inline-block rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">Match</span>
                          )}
                        </td>
                        <td className={`py-2 px-3 text-right tabular-nums ${!r.hasBaseline ? "text-muted-foreground" : r.diff < 0 ? "text-red-600" : r.diff > 0 ? "text-emerald-600" : "text-muted-foreground"}`}>
                          {r.hasBaseline ? `${r.diff >= 0 ? "+" : ""}${fmt(r.diff)}` : "—"}
                        </td>
                        <td className={`py-2 px-3 text-right font-semibold tabular-nums ${!r.hasBaseline ? "text-muted-foreground" : Math.abs(r.pct) >= 20 ? "text-red-600" : Math.abs(r.pct) >= 10 ? "text-amber-600" : r.hasVariance ? "text-yellow-600" : "text-emerald-600"}`}>
                          {r.hasBaseline ? `${r.pct >= 0 ? "+" : ""}${r.pct.toFixed(1)}%` : "—"}
                        </td>
                        <td className="py-2 pl-3"><StatusBadge status={r.status} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

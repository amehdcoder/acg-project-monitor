import { useMemo, useRef, useState } from "react";
import {
  ArrowLeft, RefreshCw, Building2, CheckCircle2, FileText, Landmark, Users, ClipboardList,
  TrendingUp, AlertTriangle, MapPin, Download, Loader2, FileImage, Sparkles, ArrowLeftRight, Gauge, Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid, ReferenceLine,
} from "recharts";
import MapVisualization from "@/components/MapVisualization/MapVisualization";
import { MapMarker } from "@/components/MapVisualization/types";
import { useSeeClearDashboard } from "@/hooks/useSeeClearDashboard";
import AccountabilityTable from "@/components/shared/AccountabilityTable";
import NarrativeInsightsPanel from "@/components/shared/NarrativeInsightsPanel";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import handsLogo from "@/assets/logo-amehnities.png";
import coatOfArms from "@/assets/nigeria-coat-of-arms.png.asset.json";
import { pctTone, toneColor } from "@/lib/conditionalFormatting";
import OwnerSubmissionManager from "@/components/owner/OwnerSubmissionManager";

const NAVY = "#0c2340";
const BLUE = "#2563eb";
const TEAL = "#14b8a6";
const PURPLE = "#9b72cf";

interface Props { onClose: () => void; }
const fmt = (n: number) => n.toLocaleString();

const Kpi = ({ icon: Icon, label, value, tint, sub }: { icon: any; label: string; value: string; tint: string; sub?: string }) => (
  <div
    className="relative overflow-hidden rounded-xl border border-border bg-card p-4 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md"
    style={{ background: `linear-gradient(135deg, ${tint}0d, transparent 70%)` }}
  >
    <span className="absolute inset-y-0 left-0 w-1" style={{ background: tint }} />
    <div className="flex items-center justify-between">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: `${tint}1a`, color: tint }}><Icon className="h-4 w-4" /></div>
    </div>
    <p className="mt-2 text-2xl font-bold" style={{ color: tint }}>{value}</p>
    {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
  </div>
);

export default function SeeClearDashboard({ onClose }: Props) {
  const { rows, stats, byLevel, byOwnership, readinessByLevel, equipment, referrals, dataQuality, flagged, challenges, points, draftCount, loading, reload, simulate, setSimulate, deleteFacilities, accountability } = useSeeClearDashboard();
  const { isOwner, isSuperAdmin, isOwnerLevel } = useAuth();
  const [capturing, setCapturing] = useState(false);
  const captureRef = useRef<HTMLDivElement | null>(null);
  // Owner / Co-owner only hard delete (never while simulating).
  const canDelete = isOwnerLevel && !simulate;
  const [deleting, setDeleting] = useState<string | null>(null);
  const handleDeleteRow = async (id: string, label: string) => {
    if (!window.confirm(`Permanently delete the monitoring entry for "${label}"?\n\nThis removes it from the database and every dashboard view. This cannot be undone.`)) return;
    setDeleting(id);
    try {
      await deleteFacilities([id]);
      toast.success("Monitoring entry deleted");
    } catch (e) {
      toast.error(`Could not delete: ${(e as Error).message}`);
    } finally {
      setDeleting(null);
    }
  };

  const stamp = () => new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const captureCanvas = async () => {
    const el = captureRef.current;
    if (!el) throw new Error("Dashboard not ready");
    return html2canvas(el, { backgroundColor: "#f4f6fb", scale: 2, useCORS: true, logging: false, windowWidth: el.scrollWidth, windowHeight: el.scrollHeight });
  };
  const exportImage = async (format: "png" | "jpeg") => {
    setCapturing(true);
    try { const c = await captureCanvas(); const a = document.createElement("a"); a.download = `eye-health-monitoring-dashboard-${stamp()}.${format}`; a.href = c.toDataURL(`image/${format}`, 0.95); a.click(); toast.success(`Dashboard exported as ${format.toUpperCase()}`); }
    catch (e: any) { toast.error(e?.message || "Export failed"); } finally { setCapturing(false); }
  };
  const exportPDF = async () => {
    setCapturing(true);
    try { const c = await captureCanvas(); const pdf = new jsPDF({ orientation: c.width > c.height ? "landscape" : "portrait", unit: "px", format: [c.width, c.height] }); pdf.addImage(c.toDataURL("image/png"), "PNG", 0, 0, c.width, c.height); pdf.save(`eye-health-monitoring-dashboard-${stamp()}.pdf`); toast.success("Dashboard exported as PDF"); }
    catch (e: any) { toast.error(e?.message || "Export failed"); } finally { setCapturing(false); }
  };

  const markers: MapMarker[] = useMemo(() => points.map((p, i) => ({ id: `sc-${i}`, lat: p.lat, lng: p.lng, title: p.name || "Facility", description: `${p.band} readiness`, markerColor: p.color })), [points]);
  const canSim = isOwner || isSuperAdmin;

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#f4f6fb]">
      {/* Header */}
      <div className="shrink-0 px-4 py-4 text-white" style={{ background: `linear-gradient(160deg, ${NAVY}, #163a63)` }}>
        <div className="flex items-center justify-between gap-3">
          <button onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 hover:bg-white/20"><ArrowLeft className="h-5 w-5" /></button>
          <div className="flex items-center gap-2">
            <img src={coatOfArms.url} alt="" className="h-7 w-7" loading="lazy" />
            <span className="text-center text-xs font-semibold leading-tight">Plateau Comprehensive and<br />Inclusive Eye Health Project</span>
            <img src={handsLogo} alt="HANDS" className="h-7 w-7 rounded" loading="lazy" />
          </div>
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="secondary" disabled={capturing} className="h-9 border-0 bg-white/15 text-white hover:bg-white/25">{capturing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}<span className="ml-1.5 hidden sm:inline">Export</span></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={exportPDF}><FileText className="mr-2 h-4 w-4" /> Export as PDF</DropdownMenuItem>
                <DropdownMenuItem onClick={() => exportImage("png")}><FileImage className="mr-2 h-4 w-4" /> Export as PNG</DropdownMenuItem>
                <DropdownMenuItem onClick={() => exportImage("jpeg")}><FileImage className="mr-2 h-4 w-4" /> Export as JPEG</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            {canSim && (
              <Button size="sm" variant="secondary" onClick={() => setSimulate(!simulate)} className={`h-9 border-0 ${simulate ? "bg-[#2dd4a8] font-semibold text-[#0c2340] hover:bg-[#22c0a0]" : "bg-white/15 text-white hover:bg-white/25"}`}><Sparkles className="h-4 w-4" /><span className="ml-1.5 hidden sm:inline">{simulate ? "Simulating" : "Simulate"}</span></Button>
            )}
            <Button size="sm" variant="secondary" onClick={reload} disabled={loading} className="h-9 border-0 bg-white/15 text-white hover:bg-white/25"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /></Button>
            <OwnerSubmissionManager
              table="seeclear_monitoring"
              title="facility records"
              labelColumns={["facility_name", "lga", "ward", "community"]}
              onChanged={reload}
              compact
              className="h-9 border-0 bg-white/15 text-white hover:bg-white/25"
            />
          </div>
        </div>
        <h1 className="mt-3 text-2xl font-bold">Eye Health Facility Monitoring Dashboard</h1>
        <p className="text-sm text-white/70">Facility readiness, equipment, referrals & data quality analytics</p>
      </div>

      <div ref={captureRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card px-4 py-3 shadow-sm">
          <div className="flex items-center gap-2">
            <img src={handsLogo} alt="" className="h-8 w-8 rounded" />
            <div><h2 className="text-sm font-bold text-foreground">Eye Health Facility Monitoring</h2><p className="text-xs text-muted-foreground">Monitoring, Evaluation & Learning Report</p></div>
          </div>
          <p className="text-xs font-medium text-muted-foreground">Last updated: {new Date().toLocaleString()}</p>
        </div>

        {/* KPI tiles */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi icon={Building2} label="Total Facilities Assessed" value={fmt(stats.total)} tint={NAVY} sub="Across 3 levels" />
          <Kpi icon={CheckCircle2} label="Functional Facilities" value={fmt(stats.functional)} tint={toneColor(pctTone(stats.functionalPct))} sub={`${stats.functionalPct.toFixed(1)}%`} />
          <Kpi icon={Landmark} label="Government Facilities" value={fmt(stats.government)} tint={BLUE} sub={`${stats.governmentPct.toFixed(1)}%`} />
          <Kpi icon={Users} label="Private Facilities" value={fmt(stats.private)} tint={PURPLE} sub={`${stats.privatePct.toFixed(1)}%`} />
          <Kpi icon={Building2} label="Facilities with Essential Supplies" value={fmt(stats.withSupplies)} tint={toneColor(pctTone(stats.withSuppliesPct))} sub={`${stats.withSuppliesPct.toFixed(1)}%`} />
          <Kpi icon={ClipboardList} label="Facilities with Complete Records" value={fmt(stats.withRecords)} tint={toneColor(pctTone(stats.withRecordsPct))} sub={`${stats.withRecordsPct.toFixed(1)}%`} />
          <Kpi icon={ArrowLeftRight} label="Referral Compliance Rate" value={`${stats.referralCompliancePct.toFixed(1)}%`} tint={toneColor(pctTone(stats.referralCompliancePct))} sub={pctTone(stats.referralCompliancePct) === "good" ? "Excellent" : pctTone(stats.referralCompliancePct) === "ok" ? "Good" : pctTone(stats.referralCompliancePct) === "warn" ? "Needs attention" : "Critical"} />
          <Kpi icon={Gauge} label="Average Readiness Score" value={`${stats.avgReadiness.toFixed(1)}%`} tint={toneColor(pctTone(stats.avgReadiness))} sub={stats.avgReadinessBand.label} />
        </div>

        {/* Donuts + readiness + map */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <h3 className="mb-3 text-sm font-semibold text-foreground">Facilities by Level</h3>
            <ResponsiveContainer width="100%" height={240}><PieChart><Pie data={byLevel} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={2}>{byLevel.map((d, i) => <Cell key={i} fill={d.color} />)}</Pie><Tooltip formatter={(v: number) => fmt(v)} /><Legend /></PieChart></ResponsiveContainer>
          </div>
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <h3 className="mb-3 text-sm font-semibold text-foreground">Facilities by Ownership</h3>
            <ResponsiveContainer width="100%" height={240}><PieChart><Pie data={byOwnership} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={2}>{byOwnership.map((d, i) => <Cell key={i} fill={d.color} />)}</Pie><Tooltip formatter={(v: number) => fmt(v)} /><Legend /></PieChart></ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold text-foreground">Average Readiness Score by Facility Level</h3>
          <ResponsiveContainer width="100%" height={260}><BarChart data={readinessByLevel}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="name" tick={{ fontSize: 11 }} /><YAxis domain={[0, 100]} tick={{ fontSize: 12 }} /><Tooltip formatter={(v: number) => `${v}%`} /><ReferenceLine y={stats.avgReadiness} stroke="#2563eb" strokeDasharray="4 4" label={{ value: `Overall ${stats.avgReadiness.toFixed(1)}%`, fontSize: 10, fill: "#2563eb" }} /><Bar dataKey="value" radius={[6, 6, 0, 0]}>{readinessByLevel.map((_, i) => <Cell key={i} fill={[BLUE, TEAL, PURPLE][i]} />)}</Bar></BarChart></ResponsiveContainer>
        </div>

        <div className="rounded-xl border border-border bg-card p-3 shadow-sm">
          <div className="mb-2 flex items-center gap-2"><MapPin className="h-4 w-4 text-[#2563eb]" /><h3 className="text-sm font-semibold text-foreground">Facilities on Map (by Readiness Score)</h3></div>
          <MapVisualization markers={markers} height="420px" showNigeriaBoundaries showLegend={false} />
        </div>

        {/* Equipment availability/functionality */}
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold text-foreground">Equipment & Supply Availability & Functionality</h3>
          <ResponsiveContainer width="100%" height={300}><BarChart data={equipment} margin={{ bottom: 40 }}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="name" tick={{ fontSize: 9 }} interval={0} angle={-30} textAnchor="end" height={60} /><YAxis domain={[0, 100]} tick={{ fontSize: 12 }} /><Tooltip formatter={(v: number) => `${v}%`} /><Legend /><Bar name="Availability (%)" dataKey="availability" fill={BLUE} radius={[4, 4, 0, 0]} /><Bar name="Functionality (%)" dataKey="functionality" fill={TEAL} radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer>
        </div>

        {/* Referral + data quality */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <h3 className="mb-3 text-sm font-semibold text-foreground">Referral & Follow-up Performance</h3>
            <div className="grid grid-cols-2 gap-3 text-center sm:grid-cols-4">
              <div><p className="text-xs text-muted-foreground">Referrals Made</p><p className="text-xl font-bold text-foreground">{fmt(referrals.made)}</p></div>
              <div><p className="text-xs text-muted-foreground">Referrals Completed</p><p className="text-xl font-bold text-foreground">{fmt(referrals.completed)}</p></div>
              <div><p className="text-xs text-muted-foreground">Compliance Rate</p><p className="text-xl font-bold text-[#16a34a]">{referrals.compliancePct.toFixed(1)}%</p></div>
              <div><p className="text-xs text-muted-foreground">With Follow-up</p><p className="text-xl font-bold text-foreground">{fmt(referrals.followUp)}</p></div>
            </div>
          </div>
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <h3 className="mb-3 text-sm font-semibold text-foreground">Data Quality Overview</h3>
            <div className="grid grid-cols-2 gap-3">
              {dataQuality.map((d) => { const b = d.value >= 80 ? "#16a34a" : d.value >= 60 ? "#f59e0b" : "#dc2626"; return (
                <div key={d.label} className="rounded-lg border border-border p-3"><p className="text-[11px] leading-tight text-muted-foreground">{d.label}</p><p className="mt-1 text-lg font-bold" style={{ color: b }}>{d.value}%</p></div>
              ); })}
            </div>
          </div>
        </div>

        {/* Top flagged facilities */}
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="mb-3 flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-500" /><h3 className="text-sm font-semibold text-foreground">Top Flagged Facilities / Common Gaps</h3></div>
          {flagged.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">No flagged facilities yet.</p> : (
            <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b border-border text-left text-xs text-muted-foreground"><th className="py-2 pr-3">Facility</th><th className="py-2 px-3">LGA</th><th className="py-2 px-3">Level</th><th className="py-2 px-3">Ownership</th><th className="py-2 px-3 text-right">Readiness</th><th className="py-2 pl-3">Critical Gap</th></tr></thead><tbody>
              {flagged.map((f, i) => { const b = f.readiness >= 60 ? "#f59e0b" : "#dc2626"; return (
                <tr key={i} className="border-b border-border/50 last:border-0"><td className="py-2 pr-3 font-medium text-foreground">{f.facility}</td><td className="py-2 px-3 capitalize">{f.lga}</td><td className="py-2 px-3 capitalize">{f.level}</td><td className="py-2 px-3 capitalize">{f.ownership}</td><td className="py-2 px-3 text-right"><span className="rounded-full px-2 py-0.5 text-xs font-bold text-white" style={{ background: b }}>{f.readiness}%</span></td><td className="py-2 pl-3 text-muted-foreground">{f.gap}</td></tr>
              ); })}
            </tbody></table></div>
          )}
        </div>

        {/* Common challenges */}
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold text-foreground">Common Challenges & Recommendations</h3>
          {challenges.length === 0 ? <p className="py-4 text-center text-sm text-muted-foreground">No challenges recorded yet.</p> : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {challenges.slice(0, 6).map((c, i) => (
                <div key={i} className="rounded-lg border border-border p-3 text-center"><p className="text-[11px] font-semibold leading-tight text-foreground">{c.name}</p><p className="mt-1 text-lg font-bold text-[#dc2626]">{c.count}</p><p className="text-[10px] text-muted-foreground">{c.pct.toFixed(1)}% of facilities</p></div>
              ))}
            </div>
          )}
        </div>

        {/* Field worker accountability */}
        <AccountabilityTable users={accountability} unitLabel="Health Facility" unitLabelPlural="Health Facilities" accent={TEAL} />



        {/* Owner-only management register */}
        {canDelete && (
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="mb-1 flex items-center gap-2">
              <Trash2 className="h-4 w-4 text-red-600" />
              <h3 className="text-sm font-semibold text-foreground">Manage Monitoring Entries (Owner only)</h3>
              <span className="ml-auto rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-bold text-red-700">{fmt(rows.length)}</span>
            </div>
            <p className="mb-3 text-xs text-muted-foreground">Permanently delete monitoring entries. This cannot be undone.</p>
            {rows.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No monitoring entries yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-muted-foreground">
                      <th className="py-2 pr-3">Facility</th>
                      <th className="py-2 px-3">State / LGA</th>
                      <th className="py-2 px-3">Level</th>
                      <th className="py-2 px-3">Status</th>
                      <th className="py-2 pl-3 text-right">Manage</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id} className="border-b border-border/50 last:border-0">
                        <td className="py-2 pr-3 font-medium text-foreground">{r.facility_name || "Unnamed facility"}</td>
                        <td className="py-2 px-3 text-xs capitalize">{r.state || "—"}<br /><span className="text-muted-foreground">{r.lga || ""}</span></td>
                        <td className="py-2 px-3 capitalize">{r.facility_level || "—"}</td>
                        <td className="py-2 px-3 capitalize">{r.status || "—"}</td>
                        <td className="py-2 pl-3 text-right">
                          <button
                            type="button"
                            onClick={() => handleDeleteRow(r.id, r.facility_name || "this entry")}
                            disabled={deleting === r.id}
                            title="Delete this monitoring entry (Owner only)"
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
                          >
                            {deleting === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {draftCount > 0 && <p className="text-center text-xs text-muted-foreground">{draftCount} draft checklist(s) not yet included in analytics.</p>}
      </div>
    </div>
  );
}

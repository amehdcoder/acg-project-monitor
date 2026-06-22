import { useMemo, useRef, useState } from "react";
import { ArrowLeft, RefreshCw, School, CheckCircle2, FileText, Users, TrendingUp, AlertTriangle, MapPin, Download, Upload, Loader2, FileImage, XCircle, ClipboardList, Trash2, History } from "lucide-react";
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
import BloombergStateLGADrilldown from "@/components/Bloomberg/BloombergStateLGADrilldown";
import AccountabilityTable from "@/components/shared/AccountabilityTable";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { exportSchoolTemplate, importSchoolTemplate } from "@/lib/bloomberg/schoolTemplate";
import { exportCollectedData } from "@/lib/bloomberg/collectedDataExport";
import { exportPhotoEvidence } from "@/lib/bloomberg/photoEvidenceExport";
import { toast } from "sonner";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import bloombergLogo from "@/assets/bloomberg-eye-logo.png";
import { pctTone, toneColor, varianceTone } from "@/lib/conditionalFormatting";
import { labelPillStyle } from "@/lib/lgaColors";
import { prettyAdminLabel } from "@/lib/formLabelUtils";
import { formatP } from "@/lib/statisticalInference";
import { useTablePagination } from "@/hooks/useTablePagination";
import { Sigma, ChevronLeft, ChevronRight } from "lucide-react";

// Compact pager for large registers — keeps the DOM small on big datasets.
const Pager = ({
  page, totalPages, totalItems, startIndex, pageSize, onPrev, onNext, hasPrev, hasNext,
}: {
  page: number; totalPages: number; totalItems: number; startIndex: number; pageSize: number;
  onPrev: () => void; onNext: () => void; hasPrev: boolean; hasNext: boolean;
}) => {
  if (totalItems <= pageSize) return null;
  const from = startIndex + 1;
  const to = Math.min(startIndex + pageSize, totalItems);
  return (
    <div className="mt-3 flex items-center justify-between gap-2 text-xs text-muted-foreground">
      <span className="tabular-nums">{from.toLocaleString()}–{to.toLocaleString()} of {totalItems.toLocaleString()}</span>
      <div className="flex items-center gap-1">
        <button type="button" onClick={onPrev} disabled={!hasPrev}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border transition-colors hover:bg-muted disabled:opacity-40">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="px-1 tabular-nums">Page {page} / {totalPages}</span>
        <button type="button" onClick={onNext} disabled={!hasNext}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border transition-colors hover:bg-muted disabled:opacity-40">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};

// One-way ANOVA verdict card: tells the user whether enrolment variance
// genuinely differs across the level (State / LGA) at the 95% confidence level.
const AnovaCard = ({
  title,
  result,
}: {
  title: string;
  result: { groups: number; n: number; fStat: number; dfBetween: number; dfWithin: number; pValue: number; etaSquared: number; significant: boolean } | null;
}) => {
  if (!result) {
    return (
      <div className="rounded-lg border border-border bg-muted/30 p-3">
        <p className="text-xs font-semibold text-foreground">{title}</p>
        <p className="mt-1 text-[11px] text-muted-foreground">Not enough comparable data yet (need ≥ 2 groups with baselines).</p>
      </div>
    );
  }
  const tint = result.significant ? "#dc2626" : "#15803d";
  return (
    <div className="rounded-lg border border-border bg-card p-3" style={{ background: `linear-gradient(135deg, ${tint}0d, transparent 70%)` }}>
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-foreground">{title}</p>
        <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: `${tint}1a`, color: tint }}>
          {result.significant ? "Significant" : "Not significant"}
        </span>
      </div>
      <p className="mt-1.5 text-[11px] tabular-nums text-muted-foreground">
        F({result.dfBetween}, {result.dfWithin}) = {result.fStat.toFixed(2)} · {formatP(result.pValue)} · η² = {result.etaSquared.toFixed(3)}
      </p>
      <p className="mt-0.5 text-[11px] text-muted-foreground">
        {result.groups} groups · n = {result.n} schools.{" "}
        {result.significant
          ? "Differences across groups are unlikely to be chance."
          : "Differences are within expected random variation."}
      </p>
    </div>
  );
};

// Professional, color-coded label pill for admin units (State / LGA). Same name
// always renders with the same beautiful tint across every table.
const Label = ({ name, prefix }: { name?: string | null; prefix?: string | null }) => {
  const text = prettyAdminLabel(name, prefix);
  if (!text || text === "—") return <span className="text-muted-foreground">—</span>;
  return (
    <span
      className="inline-block max-w-[160px] truncate rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
      style={labelPillStyle(text)}
      title={text}
    >
      {text}
    </span>
  );
};


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
  const { validations, stats, byState, stateBreakdown, inference, points, nonExistent, validatedTable, notValidatedTable, accountability, recovery, duplicates, deviceAudit, loading, reload, deleteValidations } = useBloombergDashboard();
  const { isOwner, isSuperAdmin, isOwnerLevel, isAdmin } = useAuth();
  const canManage = isOwner || isSuperAdmin;
  // Pagination keeps very large registers fast — only a page of rows is ever
  // mounted to the DOM at once, so the dashboard stays responsive on big data.
  const validatedPg = useTablePagination(validatedTable, 25);
  const notValidatedPg = useTablePagination(notValidatedTable, 25);
  const managePg = useTablePagination(validations, 25);
  const [downloadingData, setDownloadingData] = useState(false);
  const handleDownloadData = async () => {
    setDownloadingData(true);
    try {
      const n = await exportCollectedData();
      toast.success(n > 0 ? `Exported ${n.toLocaleString()} validation record(s) to Excel` : "No submitted data to export yet");
    } catch (e: any) {
      toast.error(e?.message || "Could not export collected data");
    } finally {
      setDownloadingData(false);
    }
  };
  // Download every uploaded photo (signboard / classroom / register / extra) as
  // a ZIP, foldered by State › LGA › School – Validator, with a manifest CSV.
  const [downloadingPhotos, setDownloadingPhotos] = useState(false);
  const [photoProgress, setPhotoProgress] = useState<{ done: number; total: number } | null>(null);
  const handleDownloadPhotos = async () => {
    setDownloadingPhotos(true);
    setPhotoProgress(null);
    try {
      const { photos, schools } = await exportPhotoEvidence((p) => setPhotoProgress(p));
      toast.success(`Downloaded ${photos.toLocaleString()} photo(s) across ${schools.toLocaleString()} school(s)`);
    } catch (e: any) {
      toast.error(e?.message || "Could not download photo evidence");
    } finally {
      setDownloadingPhotos(false);
      setPhotoProgress(null);
    }
  };

  // Hard-delete of validation entries is restricted to the Owner / Co-owner.
  const canDelete = isOwnerLevel;
  const [deleting, setDeleting] = useState<string | null>(null);
  const handleDeleteRow = async (id: string, label: string) => {
    if (!window.confirm(`Permanently delete the validation entry for "${label}"?\n\nThis removes it from the database and every dashboard view. This cannot be undone.`)) return;
    setDeleting(id);
    try {
      await deleteValidations([id]);
      toast.success("Validation entry deleted");
    } catch (e) {
      toast.error(`Could not delete: ${(e as Error).message}`);
    } finally {
      setDeleting(null);
    }
  };
  // Bulk-clean superseded duplicate copies, keeping the most recent entry per school.
  const [cleaningDupes, setCleaningDupes] = useState(false);
  const handleRemoveAllDuplicates = async () => {
    const ids = duplicates.groups.flatMap((g) => g.copies.filter((c) => !c.kept).map((c) => c.id));
    if (!ids.length) return;
    if (!window.confirm(
      `Remove ${ids.length} superseded duplicate entr${ids.length === 1 ? "y" : "ies"} across ${duplicates.schoolsWithDuplicates} school(s)?\n\nThe most recent validation for each school is kept. This cannot be undone.`,
    )) return;
    setCleaningDupes(true);
    try {
      await deleteValidations(ids);
      toast.success(`Removed ${ids.length} duplicate entr${ids.length === 1 ? "y" : "ies"}`);
    } catch (e) {
      toast.error(`Could not remove duplicates: ${(e as Error).message}`);
    } finally {
      setCleaningDupes(false);
    }
  };
  // Duplicate audit filters — quickly narrow the list by validator, by duplicate
  // type (same-validator re-submission vs different-validator cross-validation),
  // and by row status (superseded copies vs the retained survivor).
  const [dupValidator, setDupValidator] = useState<string>("all");
  const [dupType, setDupType] = useState<"all" | "same" | "cross">("all");
  const [dupRowStatus, setDupRowStatus] = useState<"all" | "kept" | "superseded">("all");

  // Distinct validators that appear anywhere in the duplicate groups.
  const dupValidators = useMemo(() => {
    const set = new Set<string>();
    duplicates.groups.forEach((g) => g.copies.forEach((c) => set.add(c.validator)));
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [duplicates.groups]);

  // Apply the three filters. A group survives if it matches the duplicate-type
  // filter AND still has at least one copy after the validator/row-status
  // filters are applied to its copies.
  const filteredDupGroups = useMemo(() => {
    return duplicates.groups
      .filter((g) => {
        if (dupType === "same") return !g.crossValidator;
        if (dupType === "cross") return g.crossValidator;
        return true;
      })
      .map((g) => {
        const copies = g.copies.filter((c) => {
          if (dupValidator !== "all" && c.validator !== dupValidator) return false;
          if (dupRowStatus === "kept" && !c.kept) return false;
          if (dupRowStatus === "superseded" && c.kept) return false;
          return true;
        });
        return { ...g, copies };
      })
      .filter((g) => g.copies.length > 0);
  }, [duplicates.groups, dupValidator, dupType, dupRowStatus]);

  // Copy-level reconciliation for the active filter. The per-validator badges
  // count SUPERSEDED copies, while a "school" can contain several copies, so a
  // school count alone cannot be reconciled against the badge. We therefore
  // surface the exact copy breakdown (total / superseded / retained) for the
  // current filter — selecting a validator then shows a superseded figure that
  // matches that validator's badge exactly.
  const filteredCopyStats = useMemo(() => {
    let entries = 0;
    let superseded = 0;
    let retained = 0;
    filteredDupGroups.forEach((g) =>
      g.copies.forEach((c) => {
        entries += 1;
        if (c.kept) retained += 1;
        else superseded += 1;
      }),
    );
    return { entries, superseded, retained, schools: filteredDupGroups.length };
  }, [filteredDupGroups]);

  // Paginate by group so the DOM never mounts thousands of rows at once.
  const dupPg = useTablePagination(filteredDupGroups, 40);

  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [resetting, setResetting] = useState(false);
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

  const handleFactoryReset = async () => {
    if (!window.confirm("Factory reset all user-entered Bloomberg validation data?\n\nThis removes validation submissions only. The school register and baseline figures are preserved.")) return;
    setResetting(true);
    try {
      const { data, error } = await (supabase as any).rpc("owner_reset_bloomberg_validation_data");
      if (error) throw error;
      toast.success(`Bloomberg validation data reset (${data?.validations_deleted ?? 0} entries removed)`);
      reload();
    } catch (e: any) {
      toast.error(e?.message || "Factory reset failed");
    } finally {
      setResetting(false);
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
                {isAdmin && (
                  <DropdownMenuItem onClick={() => handleDownloadData()} disabled={downloadingData}>
                    <Download className="mr-2 h-4 w-4" /> Download Collected Data (Excel)
                  </DropdownMenuItem>
                )}
                {isAdmin && (
                  <DropdownMenuItem onClick={() => handleDownloadPhotos()} disabled={downloadingPhotos}>
                    {downloadingPhotos ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileImage className="mr-2 h-4 w-4" />}
                    {downloadingPhotos && photoProgress
                      ? `Downloading photos ${photoProgress.done}/${photoProgress.total}…`
                      : "Download Photo Evidence (ZIP)"}
                  </DropdownMenuItem>
                )}
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
            {isOwner && (
              <Button size="sm" onClick={handleFactoryReset} disabled={resetting} className="h-9 bg-red-500 text-white hover:bg-red-600 border-0 font-semibold">
                {resetting ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Trash2 className="mr-1.5 h-4 w-4" />}
                Factory Reset Validation Data
              </Button>
            )}
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
          <Kpi icon={FileText} label="Submissions" value={fmt(stats.submittedCount)} tint={BLUE} sub={`${fmt(stats.uniqueValidations)} unique · ${fmt(stats.duplicateCount)} duplicate${stats.duplicateCount === 1 ? "" : "s"}`} />
          <Kpi icon={History} label="Duplicate Submissions" value={fmt(stats.duplicateCount)} tint={toneColor(stats.duplicateCount > 0 ? "warn" : "good")} sub={`across ${fmt(stats.schoolsWithDuplicates)} school${stats.schoolsWithDuplicates === 1 ? "" : "s"}`} />

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

        {/* Admin-only: submissions auto-recovered from devices' "Ready to send"
            tab (collected with the old draft/finalize form). */}
        {canManage && recovery.total > 0 && (
          <div className="rounded-xl border border-emerald-300/60 bg-emerald-50 p-4 shadow-sm dark:border-emerald-900/50 dark:bg-emerald-950/30">
            <div className="mb-2 flex items-center gap-2">
              <History className="h-4 w-4 text-emerald-600" />
              <h3 className="text-sm font-semibold text-foreground">Recovered Submissions</h3>
              <span className="ml-auto rounded-full bg-emerald-600 px-2 py-0.5 text-xs font-bold text-white">
                {fmt(recovery.total)} total
              </span>
            </div>
            <p className="mb-3 text-xs text-muted-foreground">
              Entries auto-recovered from {recovery.validatorCount} validator{recovery.validatorCount === 1 ? "" : "s"}’ devices
              (stuck in the old “Ready to send” tab) and merged into this dashboard.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-emerald-200 text-left text-muted-foreground dark:border-emerald-900">
                    <th className="py-1.5 pr-3 font-semibold">Validator</th>
                    <th className="py-1.5 pr-3 text-right font-semibold">Recovered</th>
                    <th className="py-1.5 font-semibold">Last recovered</th>
                  </tr>
                </thead>
                <tbody>
                  {recovery.validators.map((r, i) => (
                    <tr key={i} className="border-b border-emerald-100/60 last:border-0 dark:border-emerald-900/40">
                      <td className="py-1.5 pr-3 text-foreground">{r.name}</td>
                      <td className="py-1.5 pr-3 text-right font-semibold text-foreground">{fmt(r.count)}</td>
                      <td className="py-1.5 text-muted-foreground">
                        {r.lastAt ? new Date(r.lastAt).toLocaleString() : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Duplicate validation audit trail */}
        {canManage && duplicates.schoolsWithDuplicates > 0 && (
          <div className="rounded-xl border border-amber-300/60 bg-amber-50 p-4 shadow-sm dark:border-amber-900/50 dark:bg-amber-950/30">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <History className="h-4 w-4 text-amber-600" />
              <h3 className="text-sm font-semibold text-foreground">Duplicate Validation Entries</h3>
              <span className="ml-auto rounded-full bg-amber-600 px-2 py-0.5 text-xs font-bold text-white">
                {fmt(duplicates.extraEntries)} duplicate{duplicates.extraEntries === 1 ? "" : "s"}
              </span>
            </div>
            <p className="mb-3 text-xs text-muted-foreground">
              {fmt(duplicates.schoolsWithDuplicates)} school{duplicates.schoolsWithDuplicates === 1 ? "" : "s"} {duplicates.schoolsWithDuplicates === 1 ? "was" : "were"} validated more than once,
              producing <span className="font-semibold text-foreground">{fmt(duplicates.extraEntries)}</span> extra entr{duplicates.extraEntries === 1 ? "y" : "ies"}.
              Reconciliation: <span className="font-semibold text-foreground">{fmt(stats.submittedCount)}</span> submissions
              − <span className="font-semibold text-foreground">{fmt(stats.uniqueValidations)}</span> unique validations
              = <span className="font-semibold text-foreground">{fmt(stats.duplicateCount)}</span> duplicates,
              the same figure shown on the KPI card and totalled in the per-validator breakdown below.
              The most recent submission per school is kept; older copies are listed below with the validator and the date each was sent.
            </p>


            {/* Deeper duplicate insight: who and how */}
            <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="rounded-lg border border-amber-200 bg-white/70 p-2 dark:border-amber-900/50 dark:bg-amber-950/20">
                <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Affected schools</div>
                <div className="text-lg font-bold text-foreground">{fmt(duplicates.schoolsWithDuplicates)}</div>
              </div>
              <div className="rounded-lg border border-amber-200 bg-white/70 p-2 dark:border-amber-900/50 dark:bg-amber-950/20">
                <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Extra (superseded) entries</div>
                <div className="text-lg font-bold text-foreground">{fmt(duplicates.extraEntries)}</div>
              </div>
              <div className="rounded-lg border border-amber-200 bg-white/70 p-2 dark:border-amber-900/50 dark:bg-amber-950/20">
                <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Same validator re-submitted</div>
                <div className="text-lg font-bold text-foreground">{fmt(duplicates.sameValidatorGroups)}</div>
              </div>
              <div className="rounded-lg border border-amber-200 bg-white/70 p-2 dark:border-amber-900/50 dark:bg-amber-950/20">
                <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Different validators</div>
                <div className="text-lg font-bold text-foreground">{fmt(duplicates.crossValidatorGroups)}</div>
              </div>
            </div>

            {duplicates.validatorBreakdown.length > 0 && (
              <div className="mb-3 rounded-lg border border-amber-200 bg-white/60 p-2 dark:border-amber-900/50 dark:bg-amber-950/20">
                <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Superseded copies by validator — total {fmt(duplicates.extraEntries)} (click a name to view that validator's superseded copies)
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {duplicates.validatorBreakdown.map((v) => {
                    const active = dupValidator === v.validator && dupRowStatus === "superseded";
                    return (
                      <button
                        key={v.validator}
                        type="button"
                        onClick={() => {
                          if (active) {
                            setDupValidator("all");
                            setDupRowStatus("all");
                          } else {
                            setDupValidator(v.validator);
                            setDupRowStatus("superseded");
                            setDupType("all");
                          }
                          dupPg.resetPage();
                        }}
                        title={`${v.validator}: ${v.extras} superseded cop${v.extras === 1 ? "y" : "ies"}. Click to filter the table below.`}
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium transition ${
                          active
                            ? "bg-amber-600 text-white"
                            : "bg-amber-100 text-amber-800 hover:bg-amber-200 dark:bg-amber-900/50 dark:text-amber-200 dark:hover:bg-amber-900/70"
                        }`}
                      >
                        {v.validator}
                        <span className={`rounded-full px-1.5 text-[10px] font-bold ${active ? "bg-white text-amber-700" : "bg-amber-600 text-white"}`}>{fmt(v.extras)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {canDelete && (
              <button
                onClick={handleRemoveAllDuplicates}
                disabled={cleaningDupes}
                className="mb-3 inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
                {cleaningDupes ? "Removing…" : `Remove all ${fmt(duplicates.extraEntries)} superseded duplicate${duplicates.extraEntries === 1 ? "" : "s"}`}
              </button>
            )}

            {/* Filters: narrow the audit list by validator, duplicate type and row status. */}
            <div className="mb-3 flex flex-wrap items-end gap-2">
              <label className="flex flex-col gap-1">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Validator</span>
                <select
                  value={dupValidator}
                  onChange={(e) => { setDupValidator(e.target.value); dupPg.resetPage(); }}
                  className="h-8 rounded-md border border-amber-300 bg-white px-2 text-xs text-foreground dark:border-amber-900 dark:bg-amber-950/40"
                >
                  <option value="all">All validators</option>
                  {dupValidators.map((v) => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Duplicate type</span>
                <select
                  value={dupType}
                  onChange={(e) => { setDupType(e.target.value as typeof dupType); dupPg.resetPage(); }}
                  className="h-8 rounded-md border border-amber-300 bg-white px-2 text-xs text-foreground dark:border-amber-900 dark:bg-amber-950/40"
                >
                  <option value="all">All types</option>
                  <option value="same">Same validator</option>
                  <option value="cross">Different validators</option>
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Entry status</span>
                <select
                  value={dupRowStatus}
                  onChange={(e) => { setDupRowStatus(e.target.value as typeof dupRowStatus); dupPg.resetPage(); }}
                  className="h-8 rounded-md border border-amber-300 bg-white px-2 text-xs text-foreground dark:border-amber-900 dark:bg-amber-950/40"
                >
                  <option value="all">All entries</option>
                  <option value="kept">Retained only</option>
                  <option value="superseded">Superseded only</option>
                </select>
              </label>
              {(dupValidator !== "all" || dupType !== "all" || dupRowStatus !== "all") && (
                <button
                  onClick={() => { setDupValidator("all"); setDupType("all"); setDupRowStatus("all"); dupPg.resetPage(); }}
                  className="h-8 rounded-md border border-amber-300 px-2.5 text-xs font-medium text-amber-700 hover:bg-amber-100 dark:border-amber-900 dark:text-amber-300 dark:hover:bg-amber-900/40"
                >
                  Clear filters
                </button>
              )}
              <span className="ml-auto self-center text-right text-[11px] text-muted-foreground">
                {fmt(filteredCopyStats.schools)} school{filteredCopyStats.schools === 1 ? "" : "s"} ·{" "}
                {fmt(filteredCopyStats.entries)} entr{filteredCopyStats.entries === 1 ? "y" : "ies"} ·{" "}
                <span className="font-semibold text-amber-700 dark:text-amber-300">{fmt(filteredCopyStats.superseded)} superseded</span>
                {" "}· {fmt(filteredCopyStats.retained)} retained
              </span>
            </div>

            <div className="max-h-[28rem] overflow-auto rounded-lg border border-amber-200 dark:border-amber-900" style={{ contentVisibility: "auto" }}>
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-amber-100/80 backdrop-blur dark:bg-amber-950/60">
                  <tr className="text-left text-muted-foreground">
                    <th className="py-1.5 pl-3 pr-3 font-semibold">School</th>
                    <th className="py-1.5 pr-3 font-semibold">State / LGA</th>
                    <th className="py-1.5 pr-3 font-semibold">Validator</th>
                    <th className="py-1.5 pr-3 font-semibold">Date sent</th>
                    <th className="py-1.5 pr-3 font-semibold">Status</th>
                    {canDelete && <th className="py-1.5 pr-3 text-right font-semibold">Action</th>}
                  </tr>
                </thead>
                <tbody>
                  {dupPg.paginatedData.length === 0 ? (
                    <tr>
                      <td colSpan={canDelete ? 6 : 5} className="py-6 text-center text-muted-foreground">
                        No duplicate entries match the selected filters.
                      </td>
                    </tr>
                  ) : (
                    dupPg.paginatedData.flatMap((g) =>
                      g.copies.map((c, idx) => (
                        <tr
                          key={c.id}
                          className={`border-b border-amber-100/60 last:border-0 dark:border-amber-900/40 ${idx === 0 ? "border-t-2 border-t-amber-300/70 dark:border-t-amber-800" : ""}`}
                        >
                          <td className="py-1.5 pl-3 pr-3 text-foreground">
                            {idx === 0 ? (
                              <span className="font-medium">
                                {g.school} <span className="text-[10px] font-normal text-muted-foreground">({g.total} entries)</span>
                                {g.crossValidator && (
                                  <span className="ml-1.5 rounded-full bg-rose-100 px-1.5 py-0.5 text-[9px] font-semibold text-rose-700 dark:bg-rose-950/50 dark:text-rose-300" title="Validated by more than one person">
                                    multiple validators
                                  </span>
                                )}
                              </span>
                            ) : (
                              <span className="pl-3 text-muted-foreground">↳ {g.code}</span>
                            )}
                          </td>
                          <td className="py-1.5 pr-3 text-muted-foreground">{idx === 0 ? `${g.state} / ${g.lga}` : ""}</td>
                          <td className="py-1.5 pr-3 text-foreground">{c.validator}</td>
                          <td className="py-1.5 pr-3 text-muted-foreground">{c.date ? new Date(c.date).toLocaleString() : "—"}</td>
                          <td className="py-1.5 pr-3">
                            {c.kept ? (
                              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">Kept</span>
                            ) : (
                              <span className="rounded-full bg-amber-200 px-2 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-900/60 dark:text-amber-200">Duplicate</span>
                            )}
                          </td>
                          {canDelete && (
                            <td className="py-1.5 pr-3 text-right">
                              {!c.kept && (
                                <button
                                  onClick={() => handleDeleteRow(c.id, `${g.school} (duplicate)`)}
                                  disabled={deleting === c.id}
                                  className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-amber-700 hover:bg-amber-200 disabled:opacity-50 dark:text-amber-300 dark:hover:bg-amber-900/50"
                                  title="Delete this duplicate entry"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </td>
                          )}
                        </tr>
                      )),
                    )
                  )}
                </tbody>
              </table>
            </div>
            <Pager page={dupPg.currentPage} totalPages={dupPg.totalPages} totalItems={dupPg.totalItems} startIndex={dupPg.startIndex} pageSize={dupPg.pageSize} onPrev={dupPg.prevPage} onNext={dupPg.nextPage} hasPrev={dupPg.hasPrev} hasNext={dupPg.hasNext} />
          </div>
        )}



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

        {/* State → LGA disaggregation drill-down */}
        {/* Statistical inference — overall significance of variance */}
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="mb-1 flex items-center gap-2">
            <Sigma className="h-4 w-4 text-[#2563eb]" />
            <h3 className="text-sm font-semibold text-foreground">Statistical Significance (95% Confidence)</h3>
          </div>
          <p className="mb-3 text-xs text-muted-foreground">
            One-way ANOVA on each school's enrolment variance (validated vs LEA baseline), testing whether the differences
            across States and across LGAs are statistically significant or just random noise.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <AnovaCard title="Variance across States" result={inference.byState} />
            <AnovaCard title="Variance across LGAs" result={inference.byLga} />
          </div>
        </div>

        {/* State → LGA disaggregation drill-down */}
        <BloombergStateLGADrilldown data={stateBreakdown} />

        {/* Field worker accountability */}
        <AccountabilityTable users={accountability} unitLabel="School" unitLabelPlural="Schools" accent={BLUE} />

        {/* Device form audit — drafts / ready-to-send / submitted reported by
            every user's device, so the dashboard sees on-device form state for
            all users (including drafts that never left the device). */}
        {canManage && (
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <History className="h-4 w-4" style={{ color: BLUE }} />
              <h3 className="text-sm font-semibold text-foreground">Device Form Audit (All Users)</h3>
              <span className="ml-auto rounded-full px-2 py-0.5 text-xs font-bold text-white" style={{ backgroundColor: BLUE }}>
                {fmt(deviceAudit.userCount)} user{deviceAudit.userCount === 1 ? "" : "s"} · {fmt(deviceAudit.deviceCount)} device{deviceAudit.deviceCount === 1 ? "" : "s"}
              </span>
            </div>
            <p className="mb-3 text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">{fmt(deviceAudit.totals.drafts)}</span> drafts and
              {" "}<span className="font-semibold text-foreground">{fmt(deviceAudit.totals.readyToSend)}</span> ready-to-send forms reported live from each user's device, plus
              {" "}<span className="font-semibold text-foreground">{fmt(deviceAudit.totals.submitted)}</span> successfully submitted (counted from the server, so it matches the Submissions KPI exactly).
            </p>

            {deviceAudit.rows.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No device reports yet. They appear once users open the validation form on their devices.
              </p>
            ) : (
              <div className="overflow-x-auto" style={{ contentVisibility: "auto" }}>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border text-left text-muted-foreground">
                      <th className="py-1.5 pr-3 font-semibold">User</th>
                      <th className="py-1.5 pr-3 text-right font-semibold">Drafts</th>
                      <th className="py-1.5 pr-3 text-right font-semibold">Ready to send</th>
                      <th className="py-1.5 pr-3 text-right font-semibold">Submitted</th>
                      <th className="py-1.5 pr-3 text-right font-semibold">Devices</th>
                      <th className="py-1.5 font-semibold">Last activity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {deviceAudit.rows.map((r) => (
                      <tr key={r.userId} className="border-b border-border/60 last:border-0">
                        <td className="py-1.5 pr-3 text-foreground">
                          {r.name}
                          {r.email ? <span className="block text-[10px] text-muted-foreground">{r.email}</span> : null}
                        </td>
                        <td className="py-1.5 pr-3 text-right font-semibold text-amber-600">{fmt(r.drafts)}</td>
                        <td className="py-1.5 pr-3 text-right font-semibold" style={{ color: BLUE }}>{fmt(r.readyToSend)}</td>
                        <td className="py-1.5 pr-3 text-right font-semibold text-emerald-600">{fmt(r.submitted)}</td>
                        <td className="py-1.5 pr-3 text-right text-muted-foreground">{fmt(r.devices)}</td>
                        <td className="py-1.5 text-muted-foreground">
                          {r.lastActivity ? new Date(r.lastActivity).toLocaleString() : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}




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
                        <td className="py-2 px-3"><Label name={r.state} /></td>
                        <td className="py-2 px-3"><Label name={r.lga} /></td>
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
                    <th className="py-2 pr-3">State</th>
                    <th className="py-2 px-3">LGA</th>
                    <th className="py-2 px-3">School</th>
                    <th className="py-2 px-3">Operational</th>
                    <th className="py-2 px-3 text-right">Baseline</th>
                    <th className="py-2 px-3 text-right">Validated</th>
                    <th className="py-2 px-3 text-center">Variance?</th>
                    <th className="py-2 px-3 text-right">Diff</th>
                    <th className="py-2 px-3 text-right">%</th>
                    <th className="py-2 pl-3">Status</th>
                    {canDelete && <th className="py-2 pl-3 text-right">Manage</th>}
                  </tr>
                </thead>
                <tbody>
                  {validatedPg.paginatedData.map((r, i) => {
                    return (
                      <tr key={i} className="border-b border-border/50 last:border-0 bg-white hover:bg-muted/30">
                        <td className="py-2 pr-3 align-top"><Label name={r.state} /></td>
                        <td className="py-2 px-3 align-top"><Label name={r.lga} prefix={r.state} /></td>
                        <td className="py-2 px-3 align-top">
                          <div className="font-medium text-foreground whitespace-normal break-words">{r.school}</div>
                        </td>
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
                        {canDelete && (
                          <td className="py-2 pl-3 text-right">
                            <button
                              type="button"
                              onClick={() => handleDeleteRow(r.id, r.school)}
                              disabled={deleting === r.id}
                              title="Delete this validation entry (Owner only)"
                              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
                            >
                              {deleting === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <Pager page={validatedPg.currentPage} totalPages={validatedPg.totalPages} totalItems={validatedPg.totalItems} startIndex={validatedPg.startIndex} pageSize={validatedPg.pageSize} onPrev={validatedPg.prevPage} onNext={validatedPg.nextPage} hasPrev={validatedPg.hasPrev} hasNext={validatedPg.hasNext} />
            </div>
          )}
        </div>

        {/* Schools not yet validated — baseline figures only, validated blank */}
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="mb-1 flex items-center gap-2">
            <School className="h-4 w-4 text-amber-500" />
            <h3 className="text-sm font-semibold text-foreground">Schools Not Yet Validated</h3>
            <span className="ml-auto rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-bold text-amber-700">{fmt(notValidatedTable.length)}</span>
          </div>
          <p className="mb-3 text-xs text-muted-foreground">Schools in the register awaiting field validation. Baseline (LEA) enrolment is shown; validated enrolment is left blank until collected. Rows are color-coded by LGA.</p>
          {notValidatedTable.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Every school in the register has been validated. 🎉</p>
          ) : (
            <>
            <div className="max-h-[480px] overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-card">
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="py-2 pr-3">State</th>
                    <th className="py-2 px-3">LGA</th>
                    <th className="py-2 px-3">School</th>
                    <th className="py-2 px-3 text-right">Baseline (Boys)</th>
                    <th className="py-2 px-3 text-right">Baseline (Girls)</th>
                    <th className="py-2 px-3 text-right">Baseline Total</th>
                    <th className="py-2 pl-3 text-right">Validated</th>
                  </tr>
                </thead>
                <tbody>
                  {notValidatedPg.paginatedData.map((r) => (
                    <tr key={r.id} className="border-b border-border/50 last:border-0" style={{ background: `${labelPillStyle(r.lga).background as string}55` }}>
                      <td className="py-2 pr-3"><Label name={r.state} /></td>
                      <td className="py-2 px-3"><Label name={r.lga} /></td>
                      <td className="py-2 px-3">
                        <div className="font-medium text-foreground">{r.school}</div>
                        <div className="text-[11px] text-muted-foreground">{r.code} · {r.type}</div>
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums">{r.baselineMale != null ? fmt(r.baselineMale) : "—"}</td>
                      <td className="py-2 px-3 text-right tabular-nums">{r.baselineFemale != null ? fmt(r.baselineFemale) : "—"}</td>
                      <td className="py-2 px-3 text-right font-semibold tabular-nums">{r.hasBaseline ? fmt(r.baseline) : "—"}</td>
                      <td className="py-2 pl-3 text-right">
                        <span className="inline-block rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-400">Pending</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager page={notValidatedPg.currentPage} totalPages={notValidatedPg.totalPages} totalItems={notValidatedPg.totalItems} startIndex={notValidatedPg.startIndex} pageSize={notValidatedPg.pageSize} onPrev={notValidatedPg.prevPage} onNext={notValidatedPg.nextPage} hasPrev={notValidatedPg.hasPrev} hasNext={notValidatedPg.hasNext} />
            </>
          )}
        </div>

        {/* Owner-only management register — lists every entry (any status) so it is always deletable */}
        {canDelete && (
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="mb-1 flex items-center gap-2">
              <Trash2 className="h-4 w-4 text-red-600" />
              <h3 className="text-sm font-semibold text-foreground">Manage Validation Entries (Owner only)</h3>
              <span className="ml-auto rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-bold text-red-700">{fmt(validations.length)}</span>
            </div>
            <p className="mb-3 text-xs text-muted-foreground">Permanently delete validation entries of any status (draft, finalized or submitted). This cannot be undone.</p>
            {validations.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No validation entries yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-muted-foreground">
                      <th className="py-2 pr-3">School</th>
                      <th className="py-2 px-3">State</th>
                      <th className="py-2 px-3">LGA</th>
                      <th className="py-2 px-3">Status</th>
                      <th className="py-2 pl-3 text-right">Manage</th>
                    </tr>
                  </thead>
                  <tbody>
                    {managePg.paginatedData.map((r) => (
                      <tr key={r.id} className="border-b border-border/50 last:border-0">
                        <td className="py-2 pr-3 font-medium text-foreground">{r.school_name || "Unnamed school"}</td>
                        <td className="py-2 px-3"><Label name={r.state} /></td>
                        <td className="py-2 px-3"><Label name={r.lga} prefix={r.state} /></td>
                        <td className="py-2 px-3"><StatusBadge status={r.status || "draft"} /></td>
                        <td className="py-2 pl-3 text-right">
                          <button
                            type="button"
                            onClick={() => handleDeleteRow(r.id, r.school_name || "this entry")}
                            disabled={deleting === r.id}
                            title="Delete this validation entry (Owner only)"
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
            <Pager page={managePg.currentPage} totalPages={managePg.totalPages} totalItems={managePg.totalItems} startIndex={managePg.startIndex} pageSize={managePg.pageSize} onPrev={managePg.prevPage} onNext={managePg.nextPage} hasPrev={managePg.hasPrev} hasNext={managePg.hasNext} />
          </div>
        )}
      </div>
    </div>
  );
}

import { memo, useEffect, useState } from "react";
import * as XLSX from "xlsx";
import { ChevronDown, Download, Loader2, MapPinCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { analyseGpsQuality, type GpsFinding, type GpsQualityEntry, type GpsQualityReport, type GpsStatus } from "@/lib/microplanning/gpsQuality";
import { loadNigeriaAdminBoundaries } from "@/lib/microplanning/nigeriaAdminBoundaries";

const LABEL: Record<GpsStatus, string> = {
  inside: "Inside recorded LGA", border: "Within 1 km of LGA line", near_border: "1–5 km across LGA line",
  swapped: "Lat/long swapped", other_lga: "Another LGA (> 5 km)", other_state: "Another State",
  outside_nigeria: "Outside Nigeria", unknown_lga: "LGA name not recognised",
};
const TONE: Record<GpsStatus, string> = {
  inside: "bg-primary/10 text-primary", border: "bg-secondary text-secondary-foreground", near_border: "bg-secondary text-secondary-foreground",
  swapped: "bg-destructive/15 text-destructive", other_lga: "bg-destructive/15 text-destructive", other_state: "bg-destructive/15 text-destructive",
  outside_nigeria: "bg-destructive/25 text-destructive", unknown_lga: "bg-muted text-muted-foreground",
};
const ACTION = (s: GpsStatus) => s === "border" || s === "near_border" ? "Accepted (boundary precision)" : s === "swapped" ? "Swap latitude/longitude" : s === "unknown_lga" ? "Check LGA spelling" : "Re-capture GPS on site";

function exportFindings(findings: GpsFinding[], projectName?: string | null) {
  const rows = findings.map((f) => ({
    "Point type": f.kind === "flhf" ? "FLHF" : f.kind[0].toUpperCase() + f.kind.slice(1), Name: f.name, State: f.state, LGA: f.lga, Ward: f.ward,
    Latitude: f.lat, Longitude: f.lng, "GPS falls in State": f.foundState ?? "Outside Nigeria", "GPS falls in LGA": f.foundLga ?? "—",
    "Km from recorded LGA": f.kmFromLga ?? "", Issue: LABEL[f.status], Action: ACTION(f.status), "Map link": `https://www.google.com/maps?q=${f.lat},${f.lng}`,
  }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "GPS quality findings");
  XLSX.writeFile(wb, `GPS_quality_${(projectName || "project").replace(/[^\w-]+/g, "_")}.xlsx`);
}

function GpsQualityCheck({ entries, projectName }: { entries: GpsQualityEntry[]; projectName?: string | null }) {
  const [open, setOpen] = useState(false);
  const [report, setReport] = useState<GpsQualityReport | null>(null);
  const [error, setError] = useState(false);
  const [show, setShow] = useState(50);
  useEffect(() => {
    if (!open) return;
    let live = true; setReport(null); setError(false);
    loadNigeriaAdminBoundaries().then((b) => new Promise<void>((done) => setTimeout(() => {
      if (live) setReport(analyseGpsQuality(entries, b.lgas.features)); done();
    }, 0))).catch(() => live && setError(true));
    return () => { live = false; };
  }, [open, entries]);
  const issues = report?.findings.filter((f) => f.status !== "border" && f.status !== "near_border") ?? [];
  return <section className="rounded-xl border border-border bg-card" aria-label="GPS quality check">
    <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left">
      <span className="flex items-center gap-2 text-sm font-semibold"><MapPinCheck className="h-4 w-4 text-primary" />GPS quality check
        <span className="hidden text-xs font-normal text-muted-foreground sm:inline">· every point tested against official State/LGA boundaries</span></span>
      <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
    </button>
    {open && <div className="space-y-4 border-t border-border p-4">
      {error && <p className="text-sm text-destructive">Boundary data could not be loaded. Reconnect and open again.</p>}
      {!report && !error && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Checking GPS points…</p>}
      {report && <>
        <div className="flex flex-wrap items-center gap-4">
          <div className="rounded-lg bg-muted px-4 py-2 text-center">
            <div className="text-2xl font-bold tabular-nums">{report.score}%</div>
            <div className="text-[11px] text-muted-foreground">GPS points accepted</div>
          </div>
          <div className="flex flex-1 flex-wrap gap-1.5">
            {(Object.keys(LABEL) as GpsStatus[]).filter((k) => report.counts[k]).map((k) =>
              <span key={k} className={`rounded-full px-2.5 py-1 text-xs font-medium ${TONE[k]}`}>{LABEL[k]}: <b className="tabular-nums">{report.counts[k].toLocaleString()}</b></span>)}
            {report.missing > 0 && <span className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">No GPS: <b>{report.missing.toLocaleString()}</b></span>}
          </div>
          {issues.length > 0 && <Button size="sm" variant="outline" onClick={() => exportFindings(report.findings, projectName)}><Download className="mr-1.5 h-4 w-4" />Download findings</Button>}
        </div>
        <ul className="space-y-1.5">
          {report.insights.map((i, n) => <li key={n} className="flex gap-2 text-sm leading-snug">
            <span className={`mt-1.5 h-2 w-2 flex-none rounded-full ${i.tone === "good" ? "bg-primary" : i.tone === "warn" ? "bg-status-warning" : "bg-destructive"}`} />{i.text}</li>)}
        </ul>
        {issues.length > 0 && <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[820px] text-xs">
            <thead className="bg-muted text-left"><tr>{["Point", "Recorded State / LGA / Ward", "GPS", "GPS falls in", "Km", "Issue", "Action"].map((h) => <th key={h} className="whitespace-nowrap px-2 py-1.5 font-semibold">{h}</th>)}</tr></thead>
            <tbody>{issues.slice(0, show).map((f, i) => <tr key={`${f.entryId}-${f.kind}-${i}`} className="border-t border-border">
              <td className="px-2 py-1.5"><Badge variant="outline" className="mr-1 text-[10px]">{f.kind === "flhf" ? "FLHF" : f.kind}</Badge>{f.name}</td>
              <td className="px-2 py-1.5">{f.state} / {f.lga} / {f.ward}</td>
              <td className="px-2 py-1.5 tabular-nums"><a className="text-primary underline" href={`https://www.google.com/maps?q=${f.lat},${f.lng}`} target="_blank" rel="noopener noreferrer">{f.lat.toFixed(5)}, {f.lng.toFixed(5)}</a></td>
              <td className="px-2 py-1.5">{f.foundLga ? `${f.foundLga}, ${f.foundState}` : "Outside Nigeria"}</td>
              <td className="px-2 py-1.5 tabular-nums">{f.kmFromLga ?? "—"}</td>
              <td className="px-2 py-1.5"><span className={`rounded px-1.5 py-0.5 ${TONE[f.status]}`}>{LABEL[f.status]}</span></td>
              <td className="px-2 py-1.5">{ACTION(f.status)}</td>
            </tr>)}</tbody>
          </table>
          {issues.length > show && <div className="p-2 text-center"><Button size="sm" variant="ghost" onClick={() => setShow((s) => s + 100)}>Show more ({(issues.length - show).toLocaleString()} left)</Button></div>}
        </div>}
        <p className="text-[11px] text-muted-foreground">Boundaries: OSGOF · OCHA COD-AB. Points within 5 km of their LGA line are accepted as boundary precision; repeated FLHF locations are counted once.</p>
      </>}
    </div>}
  </section>;
}
export default memo(GpsQualityCheck);

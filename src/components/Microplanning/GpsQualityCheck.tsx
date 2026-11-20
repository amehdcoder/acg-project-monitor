import { memo, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Download, Loader2, MapPinCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { type GpsQualityEntry, type GpsQualityReport, type GpsStatus } from "@/lib/microplanning/gpsQuality";
import { loadNigeriaAdminBoundaries } from "@/lib/microplanning/nigeriaAdminBoundaries";
import { toast } from "@/hooks/use-toast";
import { gpsQualitySignature, matchingGpsQuality, type SavedGpsQuality } from '@/lib/microplanning/gpsQualityCache';
import { cacheGetForUser, cacheSetForUser } from '@/lib/programmeModule/offlineReadCache';

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

function GpsQualityCheck({ entries, projectName, projectId, userId }: { entries: GpsQualityEntry[]; projectName?: string | null; projectId: string; userId: string }) {
  const [open, setOpen] = useState(false);
  const [started, setStarted] = useState(false);
  const signature = useMemo(() => gpsQualitySignature(entries), [entries]);
  const latestEntries = useRef(entries);
  latestEntries.current = entries;
  const [report, setReport] = useState<GpsQualityReport | null>(null);
  const [error, setError] = useState(false);
  const [show, setShow] = useState(50);
  const worker = useRef<Worker | null>(null);
  const generation = useRef(0);
  const exportLock = useRef(false);
  const [exporting, setExporting] = useState(false);
  const [prepared, setPrepared] = useState<Blob | null>(null);
  useEffect(() => {
    if (!started) return;
    let live = true; setReport(null); setError(false); setPrepared(null); setExporting(false); exportLock.current = false; setShow(50);
    const current = new Worker(new URL('../../lib/microplanning/gpsQuality.worker.ts', import.meta.url), { type: 'module' });
    worker.current = current;
    const fail = (message: string) => {
      if (!live) return;
      setExporting(false); exportLock.current = false;
      toast({ title: 'GPS review could not be prepared', description: message, variant: 'destructive' });
      setError(true);
    };
    current.onmessage = ({ data }) => {
      if (!live) return;
      if (data.kind === 'report') {
        setReport(data.report);
        void cacheSetForUser(userId, `gps-quality:${projectId}`, { signature, report: data.report });
      }
      if (data.kind === 'workbook') { setPrepared(new Blob([data.buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })); setExporting(false); exportLock.current = false; }
      if (data.kind === 'error') fail(data.message);
    };
    current.onerror = () => fail('Please reopen the section and try again.');
    const snapshot = latestEntries.current;
    // Only exact current authorized inputs may hydrate; never reuse another
    // user's report or a report from a wider/different filter scope.
    cacheGetForUser<SavedGpsQuality>(userId, `gps-quality:${projectId}`).then(async saved => {
      if (!live) return;
      const cached = matchingGpsQuality(saved, signature);
      if (cached) { setReport(cached); return; }
      const b = await loadNigeriaAdminBoundaries();
      if (live) current.postMessage({ kind: 'analyse', entries: snapshot, lgas: b.lgas.features });
    }).catch(() => live && setError(true));
    return () => { live = false; generation.current++; current.terminate(); worker.current = null; };
  }, [started, signature, userId, projectId]);
  const download = () => {
    if (!prepared) return;
    const filename = `GPS_quality_${(projectName || 'project').replace(/[^\w-]+/g, '_')}.xlsx`;
    const file = new File([prepared], filename, { type: prepared.type });
    if (matchMedia('(pointer: coarse)').matches && navigator.canShare?.({ files: [file] })) {
      navigator.share({ files: [file], title: filename }).catch(e => { if (e.name !== 'AbortError') toast({ title: 'File could not be shared', description: 'Please try the download again.', variant: 'destructive' }); });
      return;
    }
    const url = URL.createObjectURL(prepared), a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 30_000);
  };
  const prepareExport = async () => {
    if (!report || !worker.current || exportLock.current) return;
    const version = generation.current, current = worker.current;
    exportLock.current = true; setExporting(true);
    try {
      const [{ renderGpsQualityMap }, boundaries] = await Promise.all([import('@/lib/microplanning/gpsQualityMap'), loadNigeriaAdminBoundaries()]);
      const map = await renderGpsQualityMap(report, boundaries);
      if (version === generation.current) current.postMessage({ kind: 'export', report, projectName: projectName || 'Project', map }, [map.buffer]);
    } catch (e) {
      if (version !== generation.current) return;
      setExporting(false); exportLock.current = false;
      toast({ title: 'Workbook could not be prepared', description: e instanceof Error ? e.message : 'Please try again.', variant: 'destructive' });
    }
  };
  const issues = report?.findings.filter((f) => f.status !== "border" && f.status !== "near_border") ?? [];
  return <section className="rounded-xl border border-border bg-card" aria-label="GPS quality check">
    <Button variant="ghost" aria-expanded={open} onClick={() => { setStarted(true); setOpen((v) => !v); }} className="flex h-auto w-full items-center justify-between gap-3 whitespace-normal px-4 py-3 text-left">
      <span className="flex items-center gap-2 text-sm font-semibold"><MapPinCheck className="h-4 w-4 text-primary" />GPS quality check
        <span className="hidden text-xs font-normal text-muted-foreground sm:inline">· every point tested against official State/LGA boundaries</span></span>
      <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
    </Button>
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
          {report.findings.length > 0 && <Button size="sm" variant="outline" disabled={exporting} onClick={prepared ? download : prepareExport}>
            {exporting ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Download className="mr-1.5 h-4 w-4" />}
            {exporting ? 'Preparing workbook…' : prepared ? 'Download Excel workbook' : 'Download findings'}
          </Button>}
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

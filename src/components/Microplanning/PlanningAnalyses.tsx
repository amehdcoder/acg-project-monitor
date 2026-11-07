import { memo, useMemo, useState, type ReactNode } from "react";
import { BarChart3, ChevronDown, Download, Building2, ShieldCheck, Navigation, Phone, FileCheck2, ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { analysePlanning, analysisLabels, type AnalysisEntry } from "@/lib/microplanning/planningAnalysis";
import CorrelationHeatmaps from "./CorrelationHeatmaps";

const integer = (n: number) => Math.round(n).toLocaleString();
function Section({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return <Collapsible open={open} onOpenChange={setOpen} className="border-b border-border">
    <CollapsibleTrigger asChild><Button variant="ghost" className="h-auto min-h-12 w-full justify-start gap-3 rounded-none px-3 py-3 text-left">
      <span className="text-primary">{icon}</span><span className="flex-1 whitespace-normal text-sm font-semibold">{title}</span><ChevronDown className={`h-4 w-4 shrink-0 ${open ? "rotate-180" : ""}`} />
    </Button></CollapsibleTrigger>
    <CollapsibleContent className="px-3 pb-4">{open && children}</CollapsibleContent>
  </Collapsible>;
}
function GridTable({ headers, children }: { headers: string[]; children: ReactNode }) {
  return <div className="max-h-[480px] overflow-auto"><Table><TableHeader><TableRow>{headers.map(h => <TableHead key={h} className="whitespace-nowrap">{h}</TableHead>)}</TableRow></TableHeader><TableBody>{children}</TableBody></Table></div>;
}
function Content({ entries, calcTargetPop, targetLabel }: { entries: AnalysisEntry[]; calcTargetPop: (e: AnalysisEntry) => number; targetLabel: string }) {
  const a = useMemo(() => analysePlanning(entries, calcTargetPop), [entries, calcTargetPop]);
  const [page, setPage] = useState(0);
  const maxPage = Math.max(0, Math.ceil(a.actions.length / 25) - 1), currentPage = Math.min(page, maxPage);
  const exportReview = async () => {
    const XLSX = await import("xlsx");
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(a.actions.map(r => ({ "Community / settlement": r.name, Geography: r.geography, "Recorded population": r.population, "Target population": r.target, "Target age scheme": targetLabel, "Planning checks": r.reasons.join("; "), "Facility distance (km)": r.distance?.km, "Distance evidence": r.distance?.source }))), "Planning review");
    XLSX.writeFile(workbook, "Microplanning-evidence-review.xlsx");
  };
  return <>
    <div className="grid grid-cols-2 gap-3 border-y py-3 lg:grid-cols-4">
      {[{ label: "Population in constrained locations", value: a.exposedPopulation, detail: `${a.exposedRecords} records · counted once`, tone: "text-destructive" }, { label: "Target population", value: a.eligible, detail: targetLabel, tone: "text-primary" }, { label: "FLHF assignment missing", value: a.unassigned, detail: "Recorded entries", tone: "text-accent-foreground" }, { label: "Access / security unknown", value: a.unknownConditions, detail: "Recorded entries", tone: "text-muted-foreground" }].map(k => <div key={k.label} className="min-w-0 border-l-2 border-primary/30 pl-3"><p className="text-xs text-muted-foreground">{k.label}</p><p className={`text-xl font-bold tabular-nums ${k.tone}`}>{integer(k.value)}</p><p className="text-xs text-muted-foreground break-words">{k.detail}</p></div>)}
    </div>
    <p className="py-3 text-xs text-muted-foreground">Recorded-entry sums, not unique residents or people treated. {a.missingPopulation} records lack population; {a.missingTarget} have no positive recorded target. Constraints do not establish treatment failure.</p>
    <Section title="Correlation heatmaps · population & operational relationships" icon={<BarChart3 className="h-4 w-4" />}>
      <CorrelationHeatmaps entries={entries} />
    </Section>
    <Section title="Population exposure · accessibility × security" icon={<ShieldCheck className="h-4 w-4" />}>
      <GridTable headers={["Accessibility", ...a.matrix[0].cells.map(c => analysisLabels[c.security])]}>{a.matrix.map(m => <TableRow key={m.access}><TableCell className="font-medium whitespace-nowrap">{analysisLabels[m.access]}</TableCell>{m.cells.map(c => <TableCell key={c.security} className={m.access === "inaccessible" || c.security === "not_cleared" ? "bg-destructive/5" : c.security === "cleared" ? "bg-primary/5" : "bg-muted/30"}><p className="font-bold tabular-nums">{integer(c.population)}</p><p className="text-xs text-muted-foreground whitespace-nowrap">{a.population ? (100 * c.population / a.population).toFixed(1) : "—"}% of known population</p><p className="text-xs text-muted-foreground">{c.records} records · {integer(c.target)} target{c.missingPopulation ? ` · ${c.missingPopulation} population missing` : ""}</p></TableCell>)}</TableRow>)}</GridTable>
    </Section>
    <Section title="Recorded facility responsibilities & workload" icon={<Building2 className="h-4 w-4" />}>
      <p className="mb-3 text-xs text-muted-foreground">Grouped by State, LGA, Ward and recorded FLHF name. CDD mentions are not verified unique staff or available capacity.</p>
      <GridTable headers={["FLHF / geography", "Records", "Population", "Target", "Households", "CDD name mentions", "No CDD name recorded", "Constrained records", "Mean distance"]}>{a.facilities.map(f => <TableRow key={f.key}><TableCell className="min-w-48"><p className="font-semibold">{f.name}</p><p className="text-xs text-muted-foreground">{[f.state, f.lga, f.ward].filter(Boolean).join(" · ")}</p></TableCell>{[f.records, f.population, f.target, f.households, f.rosterMentions, f.noRoster, f.exposed].map((n,i) => <TableCell key={i} className="tabular-nums">{integer(n)}</TableCell>)}<TableCell className="whitespace-nowrap">{f.distanceCount ? `${(f.distanceTotal / f.distanceCount).toFixed(1)} km · ${f.distanceCount} records` : "Not available"}</TableCell></TableRow>)}</GridTable>
    </Section>
    <Section title="Facility distance & population reach profile" icon={<Navigation className="h-4 w-4" />}>
      <p className="mb-3 text-xs text-muted-foreground">GPS distances are straight-line, not road distance or travel time. Bands are descriptive, not WHO access thresholds.</p>
      <GridTable headers={["Distance band", "Records", "Population", "Target population", "GPS-derived records", "Share of known population"]}>{a.distance.map(d => <TableRow key={d.label}><TableCell>{d.label}</TableCell><TableCell>{d.records}</TableCell><TableCell>{integer(d.population)}</TableCell><TableCell>{integer(d.target)}</TableCell><TableCell>{d.gps}</TableCell><TableCell><div className="flex min-w-32 items-center gap-2"><Progress value={a.population ? d.population / a.population * 100 : 0} className="h-2" /><span className="text-xs tabular-nums">{a.population ? `${(d.population / a.population * 100).toFixed(1)}%` : "—"}</span></div></TableCell></TableRow>)}</GridTable>
    </Section>
    <Section title="Operational contact readiness" icon={<Phone className="h-4 w-4" />}>
      <p className="mb-3 text-xs text-muted-foreground">Completeness only: recorded contact details are not verified working numbers or confirmed personnel.</p>
      <GridTable headers={["Contact role", "Name & phone", "Name only", "Phone only", "Neither recorded", "Population on incomplete-contact records"]}>{a.contacts.map(c => <TableRow key={c.role}><TableCell className="font-medium">{c.role}</TableCell>{[c.both, c.nameOnly, c.phoneOnly, c.neither, c.incompletePopulation].map((n,i) => <TableCell key={i}>{integer(n)}</TableCell>)}</TableRow>)}</GridTable>
    </Section>
    <Section title="Population evidence · sources, planning years & completeness" icon={<FileCheck2 className="h-4 w-4" />}>
      <div className="mb-3 flex flex-wrap gap-2"><Badge variant="outline">{a.missingPopulation} population missing</Badge><Badge variant="outline">{a.missingHouseholds} household count missing</Badge><Badge variant="outline">{a.missingGps} without usable Nigeria GPS</Badge><Badge variant="outline">{a.noRoster} CDD names unrecorded</Badge></div>
      <p className="mb-3 text-xs text-muted-foreground">Recorded planning year is not an enumeration date. Source labels do not establish accuracy; GPS bounds alone do not validate State or Ward placement.</p>
      <GridTable headers={["Population source", "Recorded planning year", "Records", "Known population"]}>{a.provenance.map(p => <TableRow key={p.key}><TableCell>{p.source}</TableCell><TableCell>{p.year}</TableCell><TableCell>{p.records}</TableCell><TableCell>{integer(p.population)}</TableCell></TableRow>)}</GridTable>
    </Section>
    <Section title="Settlement planning review list" icon={<ClipboardList className="h-4 w-4" />}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><p className="text-xs text-muted-foreground">{a.actions.length} records with planning checks · ranked by checks, then target population</p><Button variant="outline" size="sm" onClick={exportReview}><Download className="mr-2 h-4 w-4" />Download review</Button></div>
      <GridTable headers={["Community / settlement", "Population", "Target", "Planning checks"]}>{a.actions.slice(currentPage * 25, currentPage * 25 + 25).map(r => <TableRow key={r.key}><TableCell className="min-w-48"><p className="font-medium">{r.name}</p><p className="text-xs text-muted-foreground">{r.geography}</p></TableCell><TableCell>{r.population == null ? "Not recorded" : integer(r.population)}</TableCell><TableCell>{integer(r.target)}</TableCell><TableCell className="min-w-56 text-xs">{r.reasons.join(" · ")}</TableCell></TableRow>)}</GridTable>
      <div className="mt-3 flex items-center justify-end gap-2"><Button variant="outline" size="sm" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous</Button><span className="text-xs">{currentPage + 1} / {maxPage + 1}</span><Button variant="outline" size="sm" disabled={currentPage === maxPage} onClick={() => setPage(currentPage + 1)}>Next</Button></div>
    </Section>
    {!entries.length && <p className="py-4 text-sm text-muted-foreground">No records in the selected scope.</p>}
  </>;
}
function PlanningAnalyses(props: { entries: AnalysisEntry[]; calcTargetPop: (e: AnalysisEntry) => number; targetLabel: string }) {
  const [open, setOpen] = useState(false);
  return <section className="py-3" aria-label="ESPEN-aligned planning analyses"><Collapsible open={open} onOpenChange={setOpen}>
    <CollapsibleTrigger asChild><Button variant="outline" className="h-auto min-h-14 w-full justify-start gap-3 px-3 py-3 text-left"><BarChart3 className="h-5 w-5 shrink-0 text-primary" /><span className="flex-1 whitespace-normal font-semibold">ESPEN-aligned planning analyses</span><Badge variant="secondary">7 analyses</Badge><ChevronDown className={`h-4 w-4 shrink-0 ${open ? "rotate-180" : ""}`} /></Button></CollapsibleTrigger>
    <CollapsibleContent>{open && <Content {...props} />}</CollapsibleContent>
  </Collapsible><div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground"><a className="underline underline-offset-2" href="https://espen.afro.who.int/tools-resources/advanced-analytical-tools/espen-geospatial-microplanner" target="_blank" rel="noopener noreferrer">ESPEN Microplanner guidance</a><a className="underline underline-offset-2" href="https://www.who.int/publications/i/item/9789240049482" target="_blank" rel="noopener noreferrer">WHO microplanning manual</a></div></section>;
}
export default memo(PlanningAnalyses);
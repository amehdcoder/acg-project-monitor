/**
 * At-risk communities — WHO-style accountability register.
 *
 * Communities where the Integrated MDA Supervisory Checklist reports the MDA
 * as "Not Started" or "Halted" AND the supervisor reported the CDD medicines
 * to be insufficient, joined to the Level 3 (facility → CDD) medicine issues
 * so the responsible CDD(s) and FLHF in-charge can be reached immediately.
 */
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertOctagon, Download, FileSpreadsheet, PhoneCall, PhoneOff, PackageX, Users } from "lucide-react";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { type LogisticsDataset } from "@/lib/isc/medicineAccountability";
import { buildAtRiskCommunities, summariseAtRisk, type RiskFilter } from "@/lib/isc/atRiskCommunities";
import {
  AT_RISK_COLUMNS as COLS, atRiskHaystack, buildAtRiskExportRows, flattenAtRisk,
} from "@/lib/isc/atRiskExport";
import GeoFilterBar, { EMPTY_GEO_SCOPE, matchesGeoScope, type GeoScope } from "./GeoFilterBar";
import { exportCsv, exportXlsx } from "./exportKoboData";
import type { KoboCache } from "./koboClient";

const MODE_LABEL: Record<RiskFilter, string> = {
  both: "Not Started / Halted AND medicines insufficient",
  blocked: "Not Started or Halted (any medicine status)",
  insufficient: "Medicines reported insufficient (any MDA status)",
};

export default function AtRiskCommunitiesTable({
  checklistCache, logistics,
}: { checklistCache: KoboCache | null; logistics: LogisticsDataset | null }) {
  const [mode, setMode] = useState<RiskFilter>("both");
  const [q, setQ] = useState("");
  const [scope, setScope] = useState<GeoScope>(EMPTY_GEO_SCOPE);
  const dq = useDebouncedValue(q, 300);

  const rows = useMemo(
    () => buildAtRiskCommunities(checklistCache?.results ?? [], logistics, mode),
    [checklistCache, logistics, mode],
  );
  const stats = useMemo(() => summariseAtRisk(rows), [rows]);

  const flat = useMemo(() => flattenAtRisk(rows), [rows]);

  const filtered = useMemo(() => {
    const n = dq.trim().toLowerCase();
    return flat
      .filter((r) => matchesGeoScope(r, scope))
      .filter((r) => !n || atRiskHaystack(r).includes(n));
  }, [flat, dq, scope]);

  const stamp = new Date().toISOString().slice(0, 10);
  const exportRows = useMemo(() => buildAtRiskExportRows(filtered), [filtered]);


  return (
    <Card className="overflow-hidden border-rose-300">
      <CardHeader className="border-b bg-gradient-to-r from-rose-500/15 via-amber-500/10 to-transparent py-3 px-4">
        <CardTitle className="flex flex-wrap items-center gap-2 text-sm font-semibold">
          <AlertOctagon className="h-4 w-4 text-rose-600" />
          Communities at risk — MDA blocked with insufficient medicines
          <Badge variant="outline" className="border-rose-300 bg-rose-50 text-[10px] text-rose-700">
            {stats.communities.toLocaleString()} communities
          </Badge>
        </CardTitle>
        <CardDescription className="text-[11px]">
          Checklist evidence (Status of MDA · medicine sufficiency) joined to the Level 3 facility → CDD medicine
          issues, with the contact chain needed to unblock each community.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-3 p-4">
        {/* KPI strip */}
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-6">
          {[
            { label: "Communities flagged", value: stats.communities, cls: "border-rose-300 bg-rose-50 text-rose-700", icon: AlertOctagon },
            { label: "Not Started", value: stats.notStarted, cls: "border-amber-300 bg-amber-50 text-amber-700", icon: PackageX },
            { label: "Halted", value: stats.halted, cls: "border-fuchsia-300 bg-fuchsia-50 text-fuchsia-700", icon: PackageX },
            { label: "No medicine issued", value: stats.withoutIssue, cls: "border-slate-300 bg-slate-100 text-slate-700", icon: PhoneOff },
            { label: "Units issued", value: stats.unitsIssued, cls: "border-emerald-300 bg-emerald-50 text-emerald-700", icon: FileSpreadsheet },
            { label: "CDDs involved", value: stats.cdds, cls: "border-sky-300 bg-sky-50 text-sky-700", icon: Users },
          ].map((k) => (
            <div key={k.label} className={`rounded-lg border p-2.5 ${k.cls}`}>
              <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide">
                <k.icon className="h-3 w-3" /> {k.label}
              </p>
              <p className="text-xl font-bold leading-tight">{Math.round(k.value).toLocaleString()}</p>
            </div>
          ))}
        </div>

        {/* toolbar */}
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Select value={mode} onValueChange={(v) => setMode(v as RiskFilter)}>
              <SelectTrigger className="h-8 w-[330px] text-[12px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(MODE_LABEL) as RiskFilter[]).map((m) => (
                  <SelectItem key={m} value={m} className="text-[12px]">{MODE_LABEL[m]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Badge variant="outline" className="ml-auto text-[10px]">
              {filtered.length.toLocaleString()} of {flat.length.toLocaleString()} communities
            </Badge>
            <Button size="sm" variant="outline" className="h-8 text-[11px]" disabled={!exportRows.length}
              onClick={() => exportXlsx(exportRows, COLS, null, `At_risk_communities_${stamp}.xlsx`)}>
              <FileSpreadsheet className="mr-1 h-3.5 w-3.5" /> Excel
            </Button>
            <Button size="sm" variant="outline" className="h-8 text-[11px]" disabled={!exportRows.length}
              onClick={() => exportCsv(exportRows, COLS, null, `At_risk_communities_${stamp}.csv`)}>
              <Download className="mr-1 h-3.5 w-3.5" /> CSV
            </Button>
          </div>
          <GeoFilterBar
            records={flat}
            scope={scope}
            onScopeChange={setScope}
            query={q}
            onQueryChange={setQ}
            queryPlaceholder="Quick lookup — community, CDD, FLHF or phone…"
          />
        </div>


        {!filtered.length ? (
          <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-4 text-[12px] text-emerald-800">
            No community currently matches “{MODE_LABEL[mode]}” — either distribution is running everywhere reported,
            or the checklist has not yet recorded an MDA status with a medicine-sufficiency answer.
          </div>
        ) : (
          <div className="max-h-[65vh] overflow-auto rounded-xl border border-slate-300 shadow-sm">
            <table className="w-full min-w-[1400px] border-collapse text-[11.5px]">
              <thead className="sticky top-0 z-10">
                <tr className="bg-gradient-to-r from-rose-900 via-rose-800 to-amber-800 text-white">
                  {["#", ...COLS.map((c) => c.label)].map((h, i) => (
                    <th key={`${h}-${i}`} className="whitespace-nowrap border-r border-white/10 px-2.5 py-2 text-left text-[9.5px] font-semibold uppercase tracking-wide">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => (
                  <tr key={r.id} className={`border-t align-top ${i % 2 ? "bg-slate-50/70" : "bg-background"} hover:bg-rose-50/60`}>
                    <td className="px-2 py-2 text-right tabular-nums text-[10.5px] text-muted-foreground">{i + 1}</td>
                    <td className="px-2.5 py-2 font-semibold text-slate-900">{r.community}</td>
                    <td className="px-2.5 py-2 text-slate-700">{r.ward || "—"}</td>
                    <td className="px-2.5 py-2 font-medium text-indigo-700">{r.lga || "—"}</td>
                    <td className="px-2.5 py-2 text-teal-700">{r.state || "—"}</td>
                    <td className="px-2.5 py-2 text-slate-700">{r.flhf}</td>
                    <td className="px-2.5 py-2">
                      <Badge variant="outline" className={`text-[9.5px] ${r.status === "halted" ? "border-fuchsia-300 bg-fuchsia-50 text-fuchsia-700" : "border-amber-300 bg-amber-50 text-amber-700"}`}>
                        {r.statusLabel}
                      </Badge>
                    </td>
                    <td className="px-2.5 py-2">
                      <Badge variant="outline" className="border-rose-300 bg-rose-50 text-[9.5px] text-rose-700">
                        {r.sufficiencyLabel}
                      </Badge>
                    </td>
                    <td className="max-w-[220px] break-words px-2.5 py-2 text-slate-700">{r.insufficientMedicines}</td>
                    <td className="max-w-[260px] break-words px-2.5 py-2 text-slate-800">{r.medicinesIssued}</td>
                    <td className="px-2.5 py-2 text-right tabular-nums font-bold text-emerald-700">
                      {Math.round(r.totalIssued).toLocaleString()}
                    </td>
                    <td className="max-w-[200px] break-words px-2.5 py-2 text-slate-800">{r.cddList}</td>
                    <td className="px-2.5 py-2 font-mono text-[10.5px]">
                      {r.cddPhones.length ? (
                        <span className="flex items-center gap-1 text-sky-700"><PhoneCall className="h-3 w-3" />{r.cddPhoneList}</span>
                      ) : <span className="italic text-muted-foreground">Not captured</span>}
                    </td>
                    <td className="px-2.5 py-2 text-slate-800">{r.inCharge}</td>
                    <td className="px-2.5 py-2 font-mono text-[10.5px]">
                      {r.inChargePhone !== "Not captured" ? (
                        <span className="flex items-center gap-1 text-sky-700"><PhoneCall className="h-3 w-3" />{r.inChargePhone}</span>
                      ) : <span className="italic text-muted-foreground">Not captured</span>}
                    </td>
                    <td className="px-2.5 py-2 text-slate-700">{r.monitor}</td>
                    <td className="px-2.5 py-2 tabular-nums text-slate-600">{r.visitDate || "—"}</td>
                    <td className="px-2.5 py-2 text-right tabular-nums text-slate-600">{r.reports}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="rounded-md border border-dashed bg-muted/40 px-3 py-2 text-[10.5px] leading-relaxed text-muted-foreground">
          <strong>How to read this register.</strong> A community appears when a supervisor recorded the MDA as
          <strong> Not Started</strong> or <strong>Halted</strong> and reported the CDD's medicines as insufficient.
          Medicines issued, CDD names and the FLHF in-charge come from the Level 3 (facility → CDD) records of the
          medicine logistics form, matched on community name inside the same LGA. Phone numbers are shown when the
          logistics form captured them; “Not captured” means the contact field was left blank at source.
        </p>
      </CardContent>
    </Card>
  );
}

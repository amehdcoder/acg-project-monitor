import * as XLSX from "xlsx";
import { withRecomputedDistances } from "./distance";
import { analyzeDuplicates, type DuplicateCandidate } from "./duplicates";
import { countGeography } from "./geoCounts";

export interface FilterContext {
  project?: string;
  state?: string;
  lga?: string;
  ward?: string;
  accessibility?: string;
  security?: string;
  terrain?: string;
  keyRatio?: string;
  disability?: string;
  search?: string;
  campaign?: string;
}

const PRETTY: Record<keyof FilterContext, string> = {
  project: "Project",
  state: "State",
  lga: "LGA",
  ward: "Ward",
  accessibility: "Accessibility",
  security: "Security Clearance",
  terrain: "Terrain",
  keyRatio: "Key Ratio",
  disability: "Disability Type",
  search: "Search",
  campaign: "Campaign Type",
};

const isSet = (v?: string) => !!v && v !== "all";

export function activeFilterList(ctx: FilterContext): Array<[string, string]> {
  return (Object.keys(PRETTY) as Array<keyof FilterContext>)
    .filter((k) => isSet(ctx[k]))
    .map((k) => [PRETTY[k], String(ctx[k])]);
}

export function filterScopeLabel(ctx: FilterContext): string {
  const parts = activeFilterList(ctx).map(([k, v]) => `${k}: ${v}`);
  return parts.length ? parts.join(" • ") : "All data (no filters)";
}

const slug = (s: string) => s.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);

const label = (k: string) => k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

/**
 * Export exactly what is on screen — at any level of filtering (project, state,
 * LGA, ward, or any indicator disaggregation). Adds a Filters sheet documenting
 * the exact scope so the workbook is self-describing in supervision meetings.
 */
export type DuplicateExportMode = "all" | "kept";

export function exportFilteredMicroplan(
  inputRows: Record<string, unknown>[],
  ctx: FilterContext,
  opts?: { hiddenKeys?: string[]; sheetName?: string; duplicateMode?: DuplicateExportMode },
): { fileName: string; count: number; duplicatesFlagged: number; removed: number } {
  const mode: DuplicateExportMode = opts?.duplicateMode ?? "all";

  // Duplicate intelligence (same State → LGA → Ward → FLHF → Community/Settlement).
  const dup = analyzeDuplicates(inputRows as unknown as DuplicateCandidate[]);
  const removable = new Set(dup.removableIds);
  const sourceRows =
    mode === "kept"
      ? inputRows.filter((r) => !removable.has(String((r as any).id)))
      : inputRows;
  const removed = inputRows.length - sourceRows.length;

  const dupFlag = (r: Record<string, unknown>) => {
    const id = String((r as any).id ?? "");
    if (!dup.duplicateIds.has(id)) return "Unique";
    if (dup.conflictIds.has(id)) return "Duplicate — population conflict (review)";
    return removable.has(id) ? "Duplicate — removable copy" : "Duplicate — kept original";
  };

  // Recompute Haversine distances from the latest GPS (field, GRID3-resolved or centroid).
  const rows = sourceRows.map((r) => withRecomputedDistances(r));
  const hidden = new Set(opts?.hiddenKeys ?? ["user_id", "project_id", "created_by", "idempotency_key"]);

  const keys: string[] = [];
  const seen = new Set<string>();
  for (const r of rows.slice(0, 500)) {
    for (const k of Object.keys(r || {})) {
      if (hidden.has(k) || k.startsWith("__") || seen.has(k)) continue;
      seen.add(k);
      keys.push(k);
    }
  }
  const ordered = [
    ...["state", "lga", "ward", "flhf_name", "community_name", "settlement_name"].filter((k) => seen.has(k)),
    ...keys.filter((k) => !["state", "lga", "ward", "flhf_name", "community_name", "settlement_name"].includes(k)),
  ];

  const data = rows.map((r, i) => {
    const o: Record<string, unknown> = { "Duplicates Flagged": dupFlag(sourceRows[i]) };
    for (const k of ordered) {
      const v = (r as any)[k];
      o[label(k)] = v && typeof v === "object" ? JSON.stringify(v) : v ?? "";
    }
    return o;
  });

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(data.length ? data : [{ Note: "No records match the current filters" }]);
  ws["!cols"] = [{ wch: 34 }, ...ordered.map((k) => ({ wch: Math.min(28, Math.max(12, label(k).length + 2)) }))];
  ws["!autofilter"] = { ref: ws["!ref"] as string };
  ws["!freeze"] = { xSplit: 0, ySplit: 1 };
  XLSX.utils.book_append_sheet(wb, ws, opts?.sheetName ?? "Filtered Data");

  const filters = activeFilterList(ctx);
  const geo = countGeography(rows as any[]);
  const meta = XLSX.utils.aoa_to_sheet([
    ["Geo Microplanning — Filtered Export"],
    ["Generated", new Date().toLocaleString()],
    ["Export scope", mode === "kept" ? "Non-duplicate kept set (removable copies excluded)" : "All records (duplicates included, flagged)"],
    ["Records", rows.length],
    ["Duplicate records flagged", dup.duplicateRecordCount],
    ["Population-conflict duplicates (manual decision)", dup.conflictIds.size],
    ["Removable duplicate copies", dup.removableIds.length],
    ["Excluded from this export", removed],
    [],
    ["Geography KPI (blank-excluding composite keys)", ""],
    ["States", geo.states],
    ["LGAs", geo.lgas],
    ["Wards", geo.wards],
    ["Health facilities", geo.flhfs],
    [],
    ["Filter", "Value"],
    ...(filters.length ? filters : [["(none)", "All data"]]),
  ]);
  meta["!cols"] = [{ wch: 24 }, { wch: 48 }];
  XLSX.utils.book_append_sheet(wb, meta, "Filters");

  const scopeBits = filters.map(([, v]) => slug(v)).filter(Boolean).slice(0, 3);
  const fileName = `Microplan-${scopeBits.length ? scopeBits.join("_") : "All"}-${mode === "kept" ? "Deduped-" : ""}${new Date()
    .toISOString()
    .slice(0, 10)}.xlsx`;
  XLSX.writeFile(wb, fileName);
  return { fileName, count: rows.length, duplicatesFlagged: dup.duplicateRecordCount, removed };
}

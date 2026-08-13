import { useState, useEffect, useCallback, useRef, useMemo, Fragment } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import MicroplanDeleteConfirmDialog from "./MicroplanDeleteConfirmDialog";
import MicroplanDuplicatesPanel from "./MicroplanDuplicatesPanel";
import { analyzeDuplicates, duplicateKey } from "@/lib/microplanning/duplicates";

import { toast } from "@/hooks/use-toast";
import { Plus, Map as MapIcon, List, Download, Upload, Search, Trash2, Edit, MapPin, Users, Building2, FileSpreadsheet, Maximize2, Minimize2, UserPlus, X, Pill, Activity, Navigation, Home, Target, Globe, Heart, Copy, AlertTriangle, ChevronUp, Layers } from "lucide-react";
import { useTablePagination } from "@/hooks/useTablePagination";
import TablePagination from "@/components/ui/table-pagination";
import MicroplanEntryForm, { MicroplanFormData } from "./MicroplanEntryForm";
import MicroplanMap from "./MicroplanMap";
import CoverageView from "./CoverageView";
import ReconciliationView from "./ReconciliationView";
import MissingCommunitiesView from "./MissingCommunitiesView";
import TravelRouteMap from "./TravelRouteMap";
import HistoricalDataReview from "./HistoricalDataReview";
import MicroplanSummaryView from "./MicroplanSummaryView";
import GpsResolveCell from "./GpsResolveCell";
import DrillBreadcrumb from "./DrillBreadcrumb";
import { exportFilteredMicroplan, filterScopeLabel } from "@/lib/microplanning/filteredExport";
import { harmonizeFacilityNames, applyRenamesLocally, type FacilityRename } from "@/lib/microplanning/facilityHarmonizer";

import { countGeography } from "@/lib/microplanning/geoCounts";
import { effectiveDistanceKm, withRecomputedDistances } from "@/lib/microplanning/distance";
import { DISABILITY_TYPES, pwdValue, pwdTotalFor } from "@/lib/microplanning/disabilityTypes";
import { PWD_FLAG } from "./LargePopulationFlags";
import DesignationManagerDialog from "./DesignationManagerDialog";
import AllocationHistoryDialog from "./AllocationHistoryDialog";
import MicroplanDeleteRequestDialog from "./MicroplanDeleteRequestDialog";
import MicroplanDeleteRequestsPanel from "./MicroplanDeleteRequestsPanel";
import KoboSyncSettingsDialog from "./KoboSyncSettingsDialog";
import KoboSyncStatusChip from "./KoboSyncStatusChip";
import { TabSyncStatus } from "./TabSyncStatus";
import useRealtimeMicroplanEntries from "@/hooks/useRealtimeMicroplanEntries";
import { useMicroplanScope } from "@/hooks/useMicroplanScope";
import { isLensReadOnly, LENS_READONLY_MESSAGE } from "@/lib/mdaLens/writeGuard";
import { useMdaLens } from "@/hooks/useMdaLens";
import { campaignInLensScope, projectInLensScope, rowInLensScope, MICROPLAN_TABS } from "@/lib/mdaLens/config";
import LensScopeBanner, { lensScopeSummary } from "@/components/MdaLens/LensScopeBanner";

import MdaLensExportButton from "@/components/UserManagement/MdaLensExportButton";
import { useProjectScope } from "@/hooks/useProjectScope";
import { rowInScope } from "@/lib/projectScope";
import { useTargetPopFields } from "@/hooks/useTargetPopFields";
import { fetchAllRowsKeyset } from "@/lib/fetchAllRowsKeyset";
import { ShieldCheck, History as HistoryIcon, Layers as LayersIcon, ChevronDown, Accessibility, ArrowUpDown } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { DEMO_ENTRIES } from "./demoData";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import { exportMicroplanWorkbook } from "@/lib/microplanning/microplanTemplate";
import GeoMedicineAllocationTable from "@/components/Microplanning/GeoMedicineAllocationTable";
import GeoExclusionPanel from "@/components/Microplanning/GeoExclusionPanel";
import { useGeoExclusions, rowExcluded } from "@/lib/microplanning/geoExclusions";

import { parseMedicineUploadFile, exportMedicineUploadTemplate, parseAllocationPlanFile, exportAllocationPlanTemplate, type UploadedMedicineEntry } from "@/lib/microplanning/medicineUpload";

// Exact template column headers matching the NTDs Microplan Template
const TEMPLATE_HEADERS = [
  "Year of Microplanning",
  "Source of Population Data",
  "State",
  "LGA",
  "Ward",
  "Name of FLHF",
  "Name of FLHF In-charge",
  "Phone Number of FLHF In-charge",
  "Name of Community",
  "Name of Community Leader",
  "Phone Number of Community Leader",
  "Distance of Community to FLHF (KM)",
  "Name of Settlements",
  "Name of Mai Unguwa",
  "Distance of Settlement to FLHF (KM)",
  "Type of Terrain",
  "Accessibility",
  "Security Clearance",
  "Estimated Total Population",
  "Estimated Population of Children 5 - 14 Years Old",
  "Estimated Population of Adults 15 years and above",
  "Estimated Population of Children 0 - 4 Years Old",
  "Number of HHs",
  "Trachoma: 0-5 Months",
  "Trachoma: 6 Months - 6 Years",
  "Trachoma: 7 - 14 Years",
  "Trachoma: 15+ Years",
  "Name(s) of CDD",
  "Phone Number(s) of CDD(s)",
  "Is CDD from Community/Settlement",
  "Community Latitude",
  "Community Longitude",
  "FLHF Latitude",
  "FLHF Longitude",
  "Settlement Latitude",
  "Settlement Longitude",
  "Campaign Type",
  "Notes",
];

// Map from template header → DB field
const HEADER_TO_FIELD: Record<string, keyof MicroplanFormData> = {
  "Year of Microplanning": "year_of_microplanning",
  "Source of Population Data": "population_source",
  "State": "state",
  "LGA": "lga",
  "Ward": "ward",
  "Name of FLHF": "flhf_name",
  "Name of FLHF In-charge": "flhf_incharge_name",
  "Phone Number of FLHF In-charge": "flhf_incharge_phone",
  "Name of Community": "community_name",
  "Name of Community Leader": "community_leader_name",
  "Phone Number of Community Leader": "community_leader_phone",
  "Distance of Community to FLHF (KM)": "community_distance_to_flhf_km",
  "Name of Settlements": "settlement_name",
  "Name of Mai Unguwa": "settlement_mai_unguwa",
  "Distance of Settlement to FLHF (KM)": "settlement_distance_to_flhf_km",
  "Type of Terrain": "terrain_type",
  "Accessibility": "accessibility",
  "Security Clearance": "security_clearance",
  "Estimated Total Population": "estimated_total_population",
  "Estimated Population of Children 5 - 14 Years Old": "estimated_children_5_14",
  "Estimated Population of Adults 15 years and above": "estimated_adults_15_plus",
  "Estimated Population of Children 0 - 4 Years Old": "estimated_children_0_4",
  "Number of HHs": "number_of_households",
  "Trachoma: 0-5 Months": "trachoma_0_5_months",
  "Trachoma: 6 Months - 6 Years": "trachoma_6m_6y",
  "Trachoma: 7 - 14 Years": "trachoma_7_14y",
  "Trachoma: 15+ Years": "trachoma_15_plus",
  "Name(s) of CDD": "cdd_names",
  "Phone Number(s) of CDD(s)": "cdd_phone_numbers",
  "Is CDD from Community/Settlement": "cdd_from_community",
  "Community Latitude": "community_latitude",
  "Community Longitude": "community_longitude",
  "FLHF Latitude": "flhf_latitude",
  "FLHF Longitude": "flhf_longitude",
  "Settlement Latitude": "settlement_latitude",
  "Settlement Longitude": "settlement_longitude",
  "Campaign Type": "campaign_type",
  "Notes": "notes",
};

const FIELD_TO_HEADER: Record<string, string> = Object.fromEntries(
  Object.entries(HEADER_TO_FIELD).map(([k, v]) => [v, k])
);

const numericFields = new Set([
  "community_distance_to_flhf_km", "settlement_distance_to_flhf_km",
  "estimated_total_population", "estimated_children_5_14", "estimated_adults_15_plus",
  "estimated_children_0_4", "number_of_households", "community_latitude", "community_longitude",
  "flhf_latitude", "flhf_longitude", "settlement_latitude", "settlement_longitude",
  "year_of_microplanning", "trachoma_0_5_months", "trachoma_6m_6y", "trachoma_7_14y", "trachoma_15_plus",
]);

// Paginated entry list for entry-only users
const EntryOnlyList = ({ entries, loading, onEdit, onDelete, readOnly = false }: { entries: any[]; loading: boolean; onEdit: (entry: any) => void; onDelete: (id: string) => void; readOnly?: boolean }) => {
  const pagination = useTablePagination(entries, 10);

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
        <List className="h-4 w-4 text-primary" />
        Your Submitted Entries ({entries.length})
      </h2>
      {loading ? (
        <div className="text-xs text-muted-foreground py-4 text-center">Loading entries...</div>
      ) : entries.length === 0 ? (
        <Card className="border-dashed border-border">
          <CardContent className="py-8 text-center">
            <MapPin className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No entries yet</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Click "Add Entry" to create your first microplan entry.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {/* Mobile card view */}
          <div className="block sm:hidden space-y-2">
            {pagination.paginatedData.map((entry: any) => (
              <Card key={entry.id} className="border-border/50">
                <CardContent className="p-3 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold">{entry.community_name}</span>
                    {!readOnly && (
                    <div className="flex items-center gap-0.5">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(entry)}>
                        <Edit className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => onDelete(entry.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-1 text-[11px] text-muted-foreground">
                    <span>State: <strong className="text-foreground">{entry.state}</strong></span>
                    <span>LGA: <strong className="text-foreground">{entry.lga}</strong></span>
                    <span>Ward: <strong className="text-foreground">{entry.ward}</strong></span>
                    <span>FLHF: <strong className="text-foreground">{entry.flhf_name}</strong></span>
                    <span>Pop: <strong className="text-foreground">{entry.estimated_total_population?.toLocaleString() || "—"}</strong></span>
                    <span>Date: <strong className="text-foreground">{new Date(entry.created_at).toLocaleDateString()}</strong></span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          {/* Desktop table view */}
          <div className="hidden sm:block rounded-md border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">State</TableHead>
                  <TableHead className="text-xs">LGA</TableHead>
                  <TableHead className="text-xs">Ward</TableHead>
                  <TableHead className="text-xs">Community</TableHead>
                  <TableHead className="text-xs">FLHF</TableHead>
                  <TableHead className="text-xs">Population</TableHead>
                  <TableHead className="text-xs">Date</TableHead>
                  <TableHead className="text-xs w-[90px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagination.paginatedData.map((entry: any) => (
                  <TableRow key={entry.id} className="cursor-pointer hover:bg-muted/50">
                    <TableCell className="text-xs">{entry.state}</TableCell>
                    <TableCell className="text-xs">{entry.lga}</TableCell>
                    <TableCell className="text-xs">{entry.ward}</TableCell>
                    <TableCell className="text-xs font-medium">{entry.community_name}</TableCell>
                    <TableCell className="text-xs">{entry.flhf_name}</TableCell>
                    <TableCell className="text-xs">{entry.estimated_total_population?.toLocaleString() || "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{new Date(entry.created_at).toLocaleDateString()}</TableCell>
                    <TableCell>
                      {!readOnly && (
                      <div className="flex items-center gap-0.5">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(entry)}>
                          <Edit className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => onDelete(entry.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <TablePagination
            currentPage={pagination.currentPage}
            totalPages={pagination.totalPages}
            totalItems={pagination.totalItems}
            startIndex={pagination.startIndex}
            pageSize={pagination.pageSize}
            hasPrev={pagination.hasPrev}
            hasNext={pagination.hasNext}
            onPrev={pagination.prevPage}
            onNext={pagination.nextPage}
          />
        </div>
      )}
    </div>
  );
};

// Paginated admin list view for full access users
const AdminListView = ({ entries, loading, onEdit, onDelete, onBulkDelete, readOnly = false, onGpsResolved }: { entries: any[]; loading: boolean; onEdit: (entry: any) => void; onDelete: (id: string) => void; onBulkDelete?: (ids: string[]) => void; readOnly?: boolean; onGpsResolved?: (id: string, patch: Record<string, unknown>) => void }) => {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showOnlyDuplicates, setShowOnlyDuplicates] = useState(false);
  const [exactOnly, setExactOnly] = useState(false);
  const [pwdOnly, setPwdOnly] = useState(false);
  const [pwdSort, setPwdSort] = useState<"asc" | "desc" | null>(null);

  const pwdFlaggedCount = useMemo(
    () => entries.filter((e: any) => pwdTotalFor(e) >= PWD_FLAG).length,
    [entries],
  );

  // Duplicate intelligence: same State/LGA/Ward/FLHF/Community/Settlement.
  const dupAnalysis = useMemo(() => analyzeDuplicates(entries as any[]), [entries]);
  const visibleEntries = useMemo(() => {
    let base = showOnlyDuplicates
      ? entries.filter((e: any) =>
          (exactOnly ? dupAnalysis.exactIds : dupAnalysis.duplicateIds).has(e.id),
        )
      : entries;
    if (pwdOnly) base = base.filter((e: any) => pwdTotalFor(e) >= PWD_FLAG);

    // Explicit PWD sort takes precedence over duplicate clustering.
    if (pwdSort) {
      return [...base].sort((a: any, b: any) => {
        const d = pwdTotalFor(a) - pwdTotalFor(b);
        return pwdSort === "desc" ? -d : d;
      });
    }

    // Keep every duplicate group's records immediately after each other so they
    // are easy to compare side by side before deciding what to remove.
    const groupRank = new Map<string, number>();
    const memberRank = new Map<string, number>();
    dupAnalysis.groups.forEach((g, gi) => {
      groupRank.set(g.key, gi);
      g.records.forEach((r, ri) => memberRank.set(r.id, ri));
    });
    const rankOf = (e: any) => {
      const gi = groupRank.get(duplicateKey(e));
      return gi === undefined || !dupAnalysis.duplicateIds.has(e.id) ? null : gi;
    };

    return [...base].sort((a: any, b: any) => {
      const ra = rankOf(a);
      const rb = rankOf(b);
      if (ra === null && rb === null) return 0;
      if (ra === null) return 1; // duplicates float to the top, grouped
      if (rb === null) return -1;
      if (ra !== rb) return ra - rb;
      return (memberRank.get(a.id) ?? 0) - (memberRank.get(b.id) ?? 0);
    });
  }, [entries, showOnlyDuplicates, exactOnly, pwdOnly, pwdSort, dupAnalysis]);


  const pagination = useTablePagination(visibleEntries, 25);

  // Per-record duplicate metadata (group index, position, oldest/newest).
  const dupMeta = useMemo(() => {
    const m = new Map<string, { gi: number; ri: number; group: (typeof dupAnalysis.groups)[number] }>();
    dupAnalysis.groups.forEach((g, gi) => g.records.forEach((r, ri) => m.set(r.id, { gi, ri, group: g })));
    return m;
  }, [dupAnalysis]);

  // Ordered list of duplicate clusters as they appear in the visible table,
  // used by the "Previous / Next duplicate group" navigation.
  const groupSequence = useMemo(() => {
    const seen = new Map<string, number>();
    visibleEntries.forEach((e: any, i: number) => {
      if (!dupAnalysis.duplicateIds.has(e.id)) return;
      const k = duplicateKey(e);
      if (!seen.has(k)) seen.set(k, i);
    });
    return [...seen.entries()].map(([key, index]) => ({ key, index }));
  }, [visibleEntries, dupAnalysis]);

  const [groupCursor, setGroupCursor] = useState(0);
  useEffect(() => { setGroupCursor(0); }, [groupSequence.length]);

  const gotoGroup = useCallback((idx: number) => {
    if (!groupSequence.length) return;
    const next = (idx + groupSequence.length) % groupSequence.length;
    setGroupCursor(next);
    const target = groupSequence[next];
    pagination.goToPage(Math.floor(target.index / pagination.pageSize) + 1);
    window.setTimeout(() => {
      document
        .querySelector(`[data-dup-group="${CSS.escape(target.key)}"]`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 60);
  }, [groupSequence, pagination]);

  const selectGroup = (ids: string[], all: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => (all ? next.delete(id) : next.add(id)));
      return next;
    });


  // Drop selections that are no longer part of the filtered result set.
  useEffect(() => {
    setSelected((prev) => {
      if (!prev.size) return prev;
      const ids = new Set(entries.map((e: any) => e.id));
      const next = new Set([...prev].filter((id) => ids.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [entries]);

  const toggleOne = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const pageIds = pagination.paginatedData.map((e: any) => e.id);
  const allPageSelected = pageIds.length > 0 && pageIds.every((id: string) => selected.has(id));
  const togglePage = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (allPageSelected) pageIds.forEach((id: string) => next.delete(id));
      else pageIds.forEach((id: string) => next.add(id));
      return next;
    });
  const selectAllFiltered = () => setSelected(new Set(visibleEntries.map((e: any) => e.id)));
  const clearSelection = () => setSelected(new Set());

  const dupBadge = (id: string) => {
    if (!dupAnalysis.duplicateIds.has(id)) return null;
    const meta = dupMeta.get(id);
    const isOldest = meta?.group.oldestId === id;
    const isNewest = meta?.group.newestId === id;
    return (
      <span className="inline-flex items-center gap-1">
        {dupAnalysis.conflictIds.has(id) ? (
          <Badge variant="outline" className="border-red-300 text-red-700 text-[9px] gap-0.5">
            <AlertTriangle className="h-2.5 w-2.5" /> Dup · pop conflict
          </Badge>
        ) : (
          <Badge variant="outline" className="border-amber-300 text-amber-700 text-[9px] gap-0.5">
            <Copy className="h-2.5 w-2.5" /> Duplicate
          </Badge>
        )}
        {isOldest ? (
          <Badge variant="outline" className="border-emerald-300 text-emerald-700 text-[9px]">Old (original)</Badge>
        ) : isNewest ? (
          <Badge variant="outline" className="border-sky-300 text-sky-700 text-[9px]">New (latest copy)</Badge>
        ) : (
          <Badge variant="outline" className="text-[9px] text-muted-foreground">Copy {(meta?.ri ?? 0) + 1}</Badge>
        )}
      </span>
    );
  };

  /** Group header row shown above the first record of each duplicate cluster. */
  const GroupHeader = ({ group, colSpan }: { group: (typeof dupAnalysis.groups)[number]; colSpan: number }) => {
    const ids = group.records.map((r) => r.id);
    const allSelected = ids.every((id) => selected.has(id));
    const r0: any = group.records[0];
    const fields: [string, string][] = [
      ["State", r0.state], ["LGA", r0.lga], ["Ward", r0.ward],
      ["FLHF", r0.flhf_name], ["Community", r0.community_name], ["Settlement", r0.settlement_name],
    ];
    return (
      <TableRow data-dup-group={group.key} className="bg-amber-50/70 dark:bg-amber-950/20 hover:bg-amber-50/70">
        <TableCell colSpan={colSpan} className="py-2">
          <div className="flex flex-wrap items-center gap-2">
            {!readOnly && (
              <Checkbox
                checked={allSelected}
                onCheckedChange={() => selectGroup(ids, allSelected)}
                aria-label="Select all in this duplicate set"
              />
            )}
            <Layers className="h-3.5 w-3.5 text-amber-600" />
            <span className="text-[11px] font-semibold">
              Duplicate set · {group.records.length} matching records
            </span>
            {group.records.some((r) => pwdTotalFor(r as any) >= PWD_FLAG) && (
              <Badge variant="outline" className="border-purple-400 bg-purple-100/60 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300 text-[9px] gap-0.5 font-semibold">
                <Accessibility className="h-2.5 w-2.5" /> PWD ≥ {PWD_FLAG} · {group.records.filter((r) => pwdTotalFor(r as any) >= PWD_FLAG).length} record(s)
              </Badge>
            )}
            {group.conflicting && (
              <Badge variant="outline" className="border-red-300 text-red-700 text-[9px]">Population conflict</Badge>
            )}

            <span className="flex flex-wrap items-center gap-1">
              {fields.map(([label, val]) => {
                const key = label === "FLHF" ? "flhf_name" : label === "Community" ? "community_name" : label === "Settlement" ? "settlement_name" : label.toLowerCase();
                const differs = group.varyingFields?.includes(key);
                return (
                  <Badge
                    key={label}
                    variant="outline"
                    className={`text-[9px] ${differs ? "border-amber-500 bg-amber-100/70 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 font-semibold" : "text-muted-foreground"}`}
                  >
                    {label}: {val || "—"}{differs ? " ⚠ differs" : ""}
                  </Badge>
                );
              })}
            </span>
            {!readOnly && (
              <Button variant="link" size="sm" className="h-6 px-1 text-[11px] ml-auto" onClick={() => selectGroup(ids, allSelected)}>
                {allSelected ? "Unselect this set" : `Select all ${ids.length} in this set`}
              </Button>
            )}
          </div>
        </TableCell>
      </TableRow>
    );
  };


  return (
    <div className="space-y-3">
    <MicroplanDuplicatesPanel
      analysis={dupAnalysis as any}
      readOnly={readOnly}
      onSelectAll={(ids) => setSelected(new Set(ids))}
      showOnlyDuplicates={showOnlyDuplicates}
      onToggleFilter={setShowOnlyDuplicates}
      exactOnly={exactOnly}
      onToggleExactOnly={setExactOnly}
      selectedIds={selected}
      onToggleSelect={toggleOne}
      onAddToSelection={(ids) => setSelected((prev) => new Set([...prev, ...ids]))}
      onRemoveSelected={() => {
        const ids = [...selected].filter((id) => dupAnalysis.duplicateIds.has(id));
        if (ids.length) onBulkDelete?.(ids);
      }}
    />
    <Card className="border-border/50">
      <CardContent className="p-0">
        {/* PWD watchlist filter */}
        <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-border/50 bg-purple-50/40 dark:bg-purple-950/10">
          <Accessibility className="h-3.5 w-3.5 text-purple-600" />
          <span className="text-[11px] font-medium">
            {pwdFlaggedCount} record{pwdFlaggedCount === 1 ? "" : "s"} with persons with disability ≥ {PWD_FLAG}
          </span>
          <Button
            variant={pwdOnly ? "secondary" : "outline"}
            size="sm"
            className="h-7 text-[11px] gap-1"
            onClick={() => setPwdOnly((v) => !v)}
          >
            <Accessibility className="h-3 w-3" />
            {pwdOnly ? `Showing PWD ≥ ${PWD_FLAG} only` : `Show PWD ≥ ${PWD_FLAG} only`}
          </Button>
        </div>
        {/* Duplicate cluster navigation */}

        {groupSequence.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-border/50 bg-amber-50/50 dark:bg-amber-950/10">
            <Layers className="h-3.5 w-3.5 text-amber-600" />
            <span className="text-[11px] font-medium">
              Duplicate group {Math.min(groupCursor + 1, groupSequence.length)} of {groupSequence.length}
            </span>
            <Button variant="outline" size="sm" className="h-7 text-[11px] gap-1" onClick={() => gotoGroup(groupCursor - 1)}>
              <ChevronUp className="h-3 w-3" /> Previous duplicate group
            </Button>
            <Button variant="outline" size="sm" className="h-7 text-[11px] gap-1" onClick={() => gotoGroup(groupCursor + 1)}>
              <ChevronDown className="h-3 w-3" /> Next duplicate group
            </Button>
          </div>
        )}
        {/* Selection toolbar */}

        {!readOnly && (
          <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-border/50 bg-muted/30">
            <Checkbox
              checked={allPageSelected && pageIds.length > 0}
              onCheckedChange={togglePage}
              aria-label="Select all records on this page"
              disabled={!pageIds.length}
            />
            <span className="text-[11px] text-muted-foreground">
              {selected.size > 0 ? `${selected.size} selected` : "Select records"}
            </span>
            {selected.size > 0 && selected.size < visibleEntries.length && (
              <Button variant="link" size="sm" className="h-6 px-1 text-[11px]" onClick={selectAllFiltered}>
                Select all {visibleEntries.length} filtered
              </Button>
            )}

            {selected.size > 0 && (
              <>
                <Button variant="link" size="sm" className="h-6 px-1 text-[11px]" onClick={clearSelection}>
                  Clear
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  className="h-7 text-[11px] gap-1 ml-auto"
                  onClick={() => onBulkDelete?.([...selected])}
                >
                  <Trash2 className="h-3 w-3" /> Delete {selected.size}
                </Button>
              </>
            )}
          </div>
        )}

        {/* Mobile card view */}
        <div className="block sm:hidden p-2 space-y-2">
          {loading ? (
            <div className="text-xs text-muted-foreground py-8 text-center">Loading...</div>
          ) : pagination.paginatedData.length === 0 ? (
            <div className="text-center text-muted-foreground py-8 text-xs">No entries yet. Click 'Add Entry' to start microplanning.</div>
          ) : pagination.paginatedData.map((entry: any, idx: number) => {
            const meta = dupMeta.get(entry.id);
            const prevEntry: any = pagination.paginatedData[idx - 1];
            const isGroupStart = !!meta && (!prevEntry || !dupMeta.has(prevEntry.id) || duplicateKey(prevEntry) !== duplicateKey(entry));
            const groupIds = meta ? meta.group.records.map((r) => r.id) : [];
            const groupAllSelected = groupIds.length > 0 && groupIds.every((id) => selected.has(id));
            return (
            <Fragment key={entry.id}>
            {isGroupStart && meta && (
              <div data-dup-group={meta.group.key} className="rounded-md border border-amber-300/70 bg-amber-50/70 dark:bg-amber-950/20 px-2 py-1.5 space-y-1">
                <div className="flex items-center gap-2">
                  {!readOnly && (
                    <Checkbox
                      checked={groupAllSelected}
                      onCheckedChange={() => selectGroup(groupIds, groupAllSelected)}
                      aria-label="Select all in this duplicate set"
                    />
                  )}
                  <span className="text-[11px] font-semibold">Duplicate set · {groupIds.length} matching records</span>
                  {meta.group.records.some((r) => pwdTotalFor(r as any) >= PWD_FLAG) && (
                    <Badge variant="outline" className="border-purple-400 text-purple-700 text-[9px]">
                      PWD ≥ {PWD_FLAG} ({meta.group.records.filter((r) => pwdTotalFor(r as any) >= PWD_FLAG).length})
                    </Badge>
                  )}
                  {meta.group.conflicting && (

                    <Badge variant="outline" className="border-red-300 text-red-700 text-[9px]">Pop conflict</Badge>
                  )}
                </div>
                <div className="flex flex-wrap gap-1">
                  {([["State", entry.state, "state"], ["LGA", entry.lga, "lga"], ["Ward", entry.ward, "ward"], ["FLHF", entry.flhf_name, "flhf_name"], ["Community", entry.community_name, "community_name"], ["Settlement", entry.settlement_name, "settlement_name"]] as [string, string, string][]).map(([label, val, key]) => {
                    const differs = meta.group.varyingFields?.includes(key);
                    return (
                      <Badge key={label} variant="outline" className={`text-[9px] ${differs ? "border-amber-500 bg-amber-100/70 text-amber-800 font-semibold" : "text-muted-foreground"}`}>
                        {label}: {val || "—"}{differs ? " ⚠" : ""}
                      </Badge>
                    );
                  })}
                </div>
              </div>
            )}
            <Card className={pwdTotalFor(entry) >= PWD_FLAG ? "border-purple-400 bg-purple-50/50 dark:bg-purple-950/20" : "border-border/40"}>



              <CardContent className="p-3 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {!readOnly && (
                      <Checkbox
                        checked={selected.has(entry.id)}
                        onCheckedChange={() => toggleOne(entry.id)}
                        aria-label={`Select ${entry.community_name ?? "record"}`}
                      />
                    )}
                    <span className="text-xs font-semibold truncate">{entry.community_name}</span>
                    {dupBadge(entry.id)}
                  </div>

                  {!readOnly && (
                  <div className="flex items-center gap-0.5">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(entry)}>
                      <Edit className="h-3 w-3" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => onDelete(entry.id)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-1 text-[11px] text-muted-foreground">
                  <span>{entry.state} / {entry.lga}</span>
                  <span>Ward: {entry.ward}</span>
                  <span>FLHF: {entry.flhf_name}</span>
                  <span>Pop: {entry.estimated_total_population?.toLocaleString() || "—"}</span>
                  <span className={pwdTotalFor(entry) >= PWD_FLAG ? "font-bold text-purple-700 dark:text-purple-300" : ""}>
                    PWD: {pwdTotalFor(entry) ? pwdTotalFor(entry).toLocaleString() : "—"}{pwdTotalFor(entry) >= PWD_FLAG ? " ⚑" : ""}
                  </span>

                  {entry.accessibility && <span className="capitalize">{entry.accessibility.replace(/_/g, " ")}</span>}
                  <span className="col-span-2"><GpsResolveCell entry={entry} readOnly={readOnly} onResolved={onGpsResolved} compact /></span>
                </div>
              </CardContent>
            </Card>
            </Fragment>
            );
          })}

          {visibleEntries.length > 25 && (
            <TablePagination
              currentPage={pagination.currentPage}
              totalPages={pagination.totalPages}
              totalItems={pagination.totalItems}
              startIndex={pagination.startIndex}
              pageSize={pagination.pageSize}
              hasPrev={pagination.hasPrev}
              hasNext={pagination.hasNext}
              onPrev={pagination.prevPage}
              onNext={pagination.nextPage}
            />
          )}
        </div>
        {/* Desktop table */}
        <div className="hidden sm:block overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {!readOnly && (
                  <TableHead className="w-[36px]">
                    <Checkbox
                      checked={allPageSelected && pageIds.length > 0}
                      onCheckedChange={togglePage}
                      aria-label="Select all records on this page"
                      disabled={!pageIds.length}
                    />
                  </TableHead>
                )}
                <TableHead className="text-xs">State</TableHead>
                <TableHead className="text-xs">LGA</TableHead>
                <TableHead className="text-xs">Ward</TableHead>
                <TableHead className="text-xs">FLHF</TableHead>
                <TableHead className="text-xs">Community</TableHead>
                <TableHead className="text-xs">Settlement</TableHead>
                <TableHead className="text-xs text-right">Population</TableHead>
                <TableHead className="text-xs text-right">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 hover:text-foreground"
                    onClick={() => setPwdSort((s) => (s === "desc" ? "asc" : s === "asc" ? null : "desc"))}
                    aria-label="Sort by persons with disability"
                  >
                    PWD
                    {pwdSort === "desc" ? <ChevronDown className="h-3 w-3" /> : pwdSort === "asc" ? <ChevronUp className="h-3 w-3" /> : <ArrowUpDown className="h-3 w-3 opacity-50" />}
                  </button>
                </TableHead>
                <TableHead className="text-xs">Access</TableHead>
                <TableHead className="text-xs">GPS</TableHead>
                <TableHead className="text-xs w-[80px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={readOnly ? 11 : 12} className="text-center text-muted-foreground py-8">Loading...</TableCell>
                </TableRow>
              ) : pagination.paginatedData.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={readOnly ? 11 : 12} className="text-center text-muted-foreground py-8">
                    No entries yet. Click 'Add Entry' to start microplanning.
                  </TableCell>
                </TableRow>

              ) : pagination.paginatedData.map((entry: any, idx: number) => {
                const meta = dupMeta.get(entry.id);
                const prevEntry: any = pagination.paginatedData[idx - 1];
                const isGroupStart = !!meta && (!prevEntry || !dupMeta.has(prevEntry.id) || duplicateKey(prevEntry) !== duplicateKey(entry));
                return (
                <Fragment key={entry.id}>
                {isGroupStart && meta && <GroupHeader group={meta.group} colSpan={readOnly ? 11 : 12} />}

                <TableRow className={`text-xs ${pwdTotalFor(entry) >= PWD_FLAG ? "bg-purple-50/60 dark:bg-purple-950/20 border-l-2 border-l-purple-500" : meta ? "bg-amber-50/30 dark:bg-amber-950/10" : ""}`} data-state={selected.has(entry.id) ? "selected" : undefined}>

                  {!readOnly && (
                    <TableCell className="w-[36px]">
                      <Checkbox
                        checked={selected.has(entry.id)}
                        onCheckedChange={() => toggleOne(entry.id)}
                        aria-label={`Select ${entry.community_name ?? "record"}`}
                      />
                    </TableCell>
                  )}
                  <TableCell>{entry.state}</TableCell>

                  <TableCell>{entry.lga}</TableCell>
                  <TableCell>{entry.ward}</TableCell>
                  <TableCell>{entry.flhf_name}</TableCell>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate">{entry.community_name}</span>
                      {dupBadge(entry.id)}
                    </div>
                  </TableCell>
                  <TableCell>{entry.settlement_name || "—"}</TableCell>
                  <TableCell className="text-right">{entry.estimated_total_population?.toLocaleString() || "—"}</TableCell>
                  <TableCell className={`text-right tabular-nums ${pwdTotalFor(entry) >= PWD_FLAG ? "font-bold text-purple-700 dark:text-purple-300" : "text-muted-foreground"}`}>
                    {pwdTotalFor(entry) ? pwdTotalFor(entry).toLocaleString() : "—"}
                  </TableCell>

                  <TableCell>
                    {entry.accessibility && (
                      <Badge variant="outline" className={`text-[10px] ${
                        entry.accessibility === "accessible" ? "border-green-300 text-green-700" :
                        entry.accessibility === "hard_to_reach" ? "border-amber-300 text-amber-700" :
                        entry.accessibility === "inaccessible" ? "border-red-300 text-red-700" :
                        "border-purple-300 text-purple-700"
                      }`}>
                        {entry.accessibility.replace(/_/g, " ")}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <GpsResolveCell entry={entry} readOnly={readOnly} onResolved={onGpsResolved} />
                  </TableCell>

                  <TableCell>
                    {readOnly ? (
                      <span className="text-[10px] text-muted-foreground">View only</span>
                    ) : (
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onEdit(entry)}>
                        <Edit className="h-3 w-3" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => onDelete(entry.id)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                    )}
                  </TableCell>
                </TableRow>
                </Fragment>
                );
              })}

            </TableBody>
          </Table>
        </div>
        {visibleEntries.length > 25 && (
          <div className="hidden sm:block p-2 border-t border-border">
            <TablePagination
              currentPage={pagination.currentPage}
              totalPages={pagination.totalPages}
              totalItems={pagination.totalItems}
              startIndex={pagination.startIndex}
              pageSize={pagination.pageSize}
              hasPrev={pagination.hasPrev}
              hasNext={pagination.hasNext}
              onPrev={pagination.prevPage}
              onNext={pagination.nextPage}
            />
          </div>
        )}
      </CardContent>
    </Card>
    </div>
  );

};

interface MicroplanningViewProps {
  entryOnly?: boolean;
}

const MicroplanningView = ({ entryOnly = false }: MicroplanningViewProps) => {
  const { user, isOwner, isSuperAdmin, isAdmin } = useAuth();
  const [entries, setEntries] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingEntry, setEditingEntry] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);
  const [dialogFullscreen, setDialogFullscreen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterState, setFilterState] = useState<string>("all");
  const [filterLga, setFilterLga] = useState<string>("all");
  const [filterWard, setFilterWard] = useState<string>("all");
  const [filterAccessibility, setFilterAccessibility] = useState<string>("all");
  const [filterSecurity, setFilterSecurity] = useState<string>("all");
  const [filterTerrain, setFilterTerrain] = useState<string>("all");
  const [filterKeyRatio, setFilterKeyRatio] = useState<string>("all"); // "cdd_from_community" | "cdd_external" | "hard_to_reach"
  const [filterDisability, setFilterDisability] = useState<string>("all"); // disability type key
  const [activeView, setActiveView] = useState<"list" | "medicine" | "coverage" | "reconciliation" | "gaps" | "map" | "routes" | "historical" | "summary">("list");
  // Where the current drill-through started, so we can offer a one-click return.
  const [drillOrigin, setDrillOrigin] = useState<"disability" | "accessibility" | "security" | "terrain" | "keyRatio" | "summary" | null>(null);
  const backToDisaggregation = useCallback(() => {
    if (drillOrigin === "summary") { setActiveView("summary"); setDrillOrigin(null); return; }
    if (drillOrigin === "disability") setFilterDisability("all");
    if (drillOrigin === "accessibility") setFilterAccessibility("all");
    if (drillOrigin === "security") setFilterSecurity("all");
    if (drillOrigin === "terrain") setFilterTerrain("all");
    if (drillOrigin === "keyRatio") setFilterKeyRatio("all");
    setActiveView("list");
    setDrillOrigin(null);
    requestAnimationFrame(() => {
      document.getElementById(`disagg-${drillOrigin}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }, [drillOrigin]);

  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Medicine Allocation state - multiple LGAs (in-edit buffer)
  const [medAllocEntries, setMedAllocEntries] = useState<{ id?: string; lga: string; ward?: string; flhf?: string; amount: string; jrsm?: string; medicine_name?: string; year?: number }[]>([{ lga: "", ward: "", flhf: "", amount: "", jrsm: "" }]);
  // Debounced mirror of the allocation entries. Typing in the medicine / JRSM /
  // population inputs updates `medAllocEntries` instantly (snappy UI) but the
  // heavy per-community recomputation only runs ~400ms after the user pauses,
  // so editing thousands of rows never blocks the main thread keystroke-by-keystroke.
  const [debouncedAllocEntries, setDebouncedAllocEntries] = useState(medAllocEntries);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedAllocEntries(medAllocEntries), 400);
    return () => clearTimeout(t);
  }, [medAllocEntries]);
  const [savedAllocations, setSavedAllocations] = useState<any[]>([]);
  const [savingAllocations, setSavingAllocations] = useState(false);
  // Medicine "upload & compute" — ad-hoc population rows used as the breakdown source
  const [uploadedMedEntries, setUploadedMedEntries] = useState<UploadedMedicineEntry[]>([]);
  const [uploadingMed, setUploadingMed] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const medUploadRef = useRef<HTMLInputElement>(null);
  // Allocation Plan upload — auto-builds allocation rows from a single sheet
  const [uploadingAlloc, setUploadingAlloc] = useState(false);
  const allocUploadRef = useRef<HTMLInputElement>(null);
  // % of total population that should be computed as the target population
  const [medTargetPct, setMedTargetPct] = useState<number>(() => {
    const v = parseFloat(localStorage.getItem("microplanning.medTargetPct") || "");
    return Number.isFinite(v) && v > 0 && v <= 100 ? v : 100;
  });
  useEffect(() => { localStorage.setItem("microplanning.medTargetPct", String(medTargetPct)); }, [medTargetPct]);
  // Adoption flow: prompt admin to use uploaded population as project microplan data
  const [showAdoptDialog, setShowAdoptDialog] = useState(false);
  const [adopting, setAdopting] = useState(false);

  // User access management state
  const [showAccessManager, setShowAccessManager] = useState(false);
  const [deleteRequestTarget, setDeleteRequestTarget] = useState<{ id: string; label?: string; projectId?: string | null } | null>(null);
  const [deleteTargetIds, setDeleteTargetIds] = useState<string[]>([]);
  const [deleting, setDeleting] = useState(false);

  const [showDeleteRequestsPanel, setShowDeleteRequestsPanel] = useState(false);
  const [showKoboSettings, setShowKoboSettings] = useState(false);
  const [showDesignationManager, setShowDesignationManager] = useState(false);
  const [showHistoryDialog, setShowHistoryDialog] = useState(false);
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [grantedUsers, setGrantedUsers] = useState<any[]>([]);
  const [accessSearchQuery, setAccessSearchQuery] = useState("");
  const canManageAccess = isOwner || isSuperAdmin;
  // Use the shared `isAdmin` from useAuth so Systems Admins (not just Owner /
  // Super Admin) get full in-page admin behaviour and scope bypass.

  // Designation-based scope (admins bypass)
  const scope = useMicroplanScope(isAdmin);
  const { lens, lensEnabled, canOpenMicroplanTab } = useMdaLens();
  const lensScopeLabel = lensScopeSummary(lens);
  // MDA Lens users are strictly read-only: they may view and export their scoped
  // data but can never edit or delete a submission (also enforced by RLS).
  const lensReadOnly = isLensReadOnly({ lens, lensEnabled, isAdmin, isOwner });
  const blockLensWrite = () => {
    toast({
      title: "View-only access",
      description: LENS_READONLY_MESSAGE,
      variant: "destructive",
    });
  };
  // Pre-select the geography filters when the lens grants exactly one State / LGA,
  // so scoped users land straight on their own real-time slice.
  useEffect(() => {
    if (!lens) return;
    if (lens.states.length === 1) setFilterState((c) => (c === "all" ? lens.states[0] : c));
    if (lens.lgas.length === 1) setFilterLga((c) => (c === "all" ? lens.lgas[0] : c));
  }, [lens]);

  // Project-level geographic scope (State/LGA/Ward set on the project itself).
  const { scope: projectScope } = useProjectScope(selectedProjectId);
  // Shared target-population disaggregation selection (syncs with Map tab + globally)
  const { calcTargetPop } = useTargetPopFields();

  const fetchProjects = useCallback(async () => {
    let data: { id: string; name: string }[] | null = null;
    if (isAdmin) {
      // Admins/owner see every project.
      const res = await supabase.from("projects").select("id, name").order("name");
      data = res.data;
    } else {
      // Tier 1: non-admins only see projects they are assigned to, so data is
      // only ever entered under a project the user has been granted.
      const { data: assignments } = await supabase
        .from("user_project_assignments")
        .select("project_id")
        .eq("user_id", user?.id);
      const projectIds = (assignments || []).map((a: any) => a.project_id);
      if (projectIds.length > 0) {
        const res = await supabase
          .from("projects")
          .select("id, name")
          .in("id", projectIds)
          .order("name");
        data = res.data;
      } else {
        data = [];
      }
    }
    const visibleProjects = lens ? (data || []).filter((project) => projectInLensScope(lens, project.id)) : (data || []);
    setProjects(visibleProjects);
    if (visibleProjects.length > 0 && (!selectedProjectId || !visibleProjects.some((project) => project.id === selectedProjectId))) {
      setSelectedProjectId(visibleProjects[0].id);
      // For entry-only users, auto-open the form immediately once project is set
      if (entryOnly) {
        setShowForm(true);
      }
    }
  }, [selectedProjectId, entryOnly, isAdmin, user?.id, lens]);

  const fetchEntries = useCallback(async () => {
    if (!selectedProjectId) return;
    setLoading(true);
    try {
      // Keyset-paginate ALL rows so KPIs/coverage are never silently truncated
      // and the scan scales past the offset cap on very large projects.
      const data = await fetchAllRowsKeyset<any>((limit, afterId) => {
        let query = supabase
          .from("microplan_entries")
          .select("*")
          .eq("project_id", selectedProjectId);
        if (entryOnly && user?.id) {
          query = query.or(`created_by.eq.${user.id},created_by.is.null`);
        }
        if (afterId) query = query.gt("id", afterId);
        return query.order("id", { ascending: true }).limit(limit);
      });
      setEntries(data || []);
    } catch (error: any) {
      toast({ title: "Error loading entries", description: error.message, variant: "destructive" });
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [selectedProjectId, entryOnly, user?.id]);

  const fetchGrantedUsers = useCallback(async () => {
    const { data } = await supabase
      .from("microplan_form_access")
      .select("id, user_id, created_at");
    if (data && data.length > 0) {
      // Fetch profile info for granted users
      const userIds = data.map(d => d.user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, first_name, last_name, email")
        .in("user_id", userIds);
      const merged = data.map(d => ({
        ...d,
        profile: profiles?.find(p => p.user_id === d.user_id),
      }));
      setGrantedUsers(merged);
    } else {
      setGrantedUsers([]);
    }
  }, []);

  const fetchAllUsers = useCallback(async () => {
    const { data } = await supabase
      .from("profiles")
      .select("user_id, first_name, last_name, email, is_active")
      .eq("is_active", true)
      .order("first_name");
    setAllUsers(data || []);
  }, []);

  useEffect(() => { fetchProjects(); }, [fetchProjects]);
  useEffect(() => { fetchEntries(); }, [fetchEntries]);
  // Real-time: refresh entries whenever the Kobo webhook (or any other client)
  // inserts / updates / deletes a row on the active project.
  useRealtimeMicroplanEntries(selectedProjectId || null, fetchEntries);
  // Non-admin project members only get the Planning list + form. Force-reset
  // the view so analytics/dashboard tabs can never render for them.
  const canOpenView = useCallback(
    (v: string) => (isAdmin ? true : lensEnabled ? canOpenMicroplanTab(v) : v === "list"),
    [isAdmin, lensEnabled, canOpenMicroplanTab],
  );
  useEffect(() => {
    if (!canOpenView(activeView)) {
      const next = MICROPLAN_TABS.find((t) => canOpenView(t.id))?.id ?? "list";
      setActiveView(next as any);
    }
  }, [canOpenView, activeView]);

  // Fetch persisted medicine allocations for the active project
  const fetchAllocations = useCallback(async () => {
    if (!selectedProjectId) return;
    const { data, error } = await supabase
      .from("microplan_medicine_allocations")
      .select("*")
      .eq("project_id", selectedProjectId)
      .order("created_at", { ascending: true });
    if (error) {
      console.warn("Allocations load failed", error.message);
      return;
    }
    setSavedAllocations(data || []);
    if (data && data.length > 0) {
      setMedAllocEntries(data.map((d: any) => ({
        id: d.id,
        lga: d.lga,
        ward: d.ward || "",
        flhf: d.flhf || "",
        amount: String(d.amount ?? ""),
        medicine_name: d.medicine_name || "",
        year: d.year,
      })));
    } else {
      setMedAllocEntries([{ lga: "", ward: "", flhf: "", amount: "" }]);
    }
  }, [selectedProjectId]);
  useEffect(() => { fetchAllocations(); }, [fetchAllocations]);

  // Auto-open the entry form when in entryOnly mode
  useEffect(() => {
    if (entryOnly && selectedProjectId && !showForm) {
      setShowForm(true);
    }
  }, [entryOnly, selectedProjectId]);

  const handleSubmit = async (formData: MicroplanFormData) => {
    if (!user?.id) {
      toast({ title: "Authentication required", description: "Please log in to save entries.", variant: "destructive" });
      return;
    }
    if (!selectedProjectId) {
      toast({ title: "No project selected", description: "Please wait for projects to load or contact an admin.", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const payload: any = {
        ...formData,
        project_id: selectedProjectId,
        created_by: user.id,
        updated_by: user.id,
      };

      if (editingEntry) {
        // ── GPS override write-back ─────────────────────────────────
        // If the original GRID3 lat/lng already exists and the user has
        // changed it, persist the new value into the *_override columns
        // and leave the GRID3 source coordinates intact.
        const pairs: Array<[string, string, string, string]> = [
          ["community_latitude", "community_longitude", "community_lat_override", "community_lng_override"],
          ["flhf_latitude", "flhf_longitude", "flhf_lat_override", "flhf_lng_override"],
          ["settlement_latitude", "settlement_longitude", "settlement_lat_override", "settlement_lng_override"],
        ];
        let didOverride = false;
        for (const [latKey, lngKey, latOv, lngOv] of pairs) {
          const origLat = (editingEntry as any)[latKey];
          const origLng = (editingEntry as any)[lngKey];
          const newLat = (formData as any)[latKey];
          const newLng = (formData as any)[lngKey];
          if (
            origLat != null && origLng != null &&
            newLat != null && newLng != null &&
            (Number(origLat) !== Number(newLat) || Number(origLng) !== Number(newLng))
          ) {
            payload[latOv] = newLat;
            payload[lngOv] = newLng;
            payload[latKey] = origLat;
            payload[lngKey] = origLng;
            didOverride = true;
          }
        }
        if (didOverride) {
          payload.gps_overridden_by = user.id;
          payload.gps_overridden_at = new Date().toISOString();
        }

        const { error } = await supabase.from("microplan_entries").update(payload).eq("id", editingEntry.id);
        if (error) throw error;
        toast({ title: didOverride ? "✅ Entry updated (GPS saved as override)" : "✅ Entry updated" });
      } else {
        // Flag duplicate community rows (same State · LGA · Ward · FLHF · Community).
        const newKey = dupKey(payload);
        const existingMatch = entries.find((e) => dupKey(e) === newKey);
        if (existingMatch) {
          const overwrite = window.confirm(
            `A matching entry already exists for "${payload.community_name}" (${payload.lga}).\n\nClick OK to UPDATE the existing entry with these values, or Cancel to add it as a separate new row.`,
          );
          if (overwrite) {
            const { error } = await supabase.from("microplan_entries").update(payload).eq("id", existingMatch.id);
            if (error) throw error;
            toast({ title: "🔄 Existing entry updated", description: "Duplicate detected — the matching entry was updated." });
            setShowForm(false);
            setEditingEntry(null);
            fetchEntries();
            return;
          }
        }
        const { error } = await supabase.from("microplan_entries").insert(payload);
        if (error) throw error;
        toast({ title: existingMatch ? "✅ Entry added (duplicate kept separate)" : "✅ Entry added" });
      }
      setShowForm(false);
      setEditingEntry(null);
      fetchEntries();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = (id: string) => {
    if (lensReadOnly) { blockLensWrite(); return; }
    // Non-admins cannot delete directly — they must submit a delete request
    // for admin approval. Admins delete after an explicit confirmation.
    if (!isAdmin && !isOwner) {
      const entry = entries.find((e: any) => e.id === id);
      const label = entry ? [entry.community_name, entry.settlement_name].filter(Boolean).join(" / ") : undefined;
      setDeleteRequestTarget({ id, label, projectId: entry?.project_id ?? selectedProjectId ?? null });
      return;
    }
    setDeleteTargetIds([id]);
  };

  // Bulk delete from the Planning list selection — admins only, and always
  // behind the typed confirmation dialog.
  const handleBulkDelete = (ids: string[]) => {
    if (lensReadOnly) { blockLensWrite(); return; }
    if (!ids.length) return;
    if (!isAdmin && !isOwner) {
      toast({ title: "Approval required", description: "Only admins can delete records. Request deletion per record instead.", variant: "destructive" });
      return;
    }
    setDeleteTargetIds(ids);
  };

  const confirmDelete = async () => {
    if (!deleteTargetIds.length) return;
    setDeleting(true);
    try {
      const { error } = await supabase.from("microplan_entries").delete().in("id", deleteTargetIds);
      if (error) {
        toast({ title: "Error", description: error.message, variant: "destructive" });
        return;
      }
      toast({ title: deleteTargetIds.length > 1 ? `${deleteTargetIds.length} entries deleted` : "Entry deleted" });
      setDeleteTargetIds([]);
      fetchEntries();
    } finally {
      setDeleting(false);
    }
  };


  // Grant user access
  const grantAccess = async (userId: string) => {
    if (!user?.id) return;
    const { error } = await supabase.from("microplan_form_access").insert({
      user_id: userId,
      granted_by: user.id,
    });
    if (error) {
      if (error.code === "23505") {
        toast({ title: "User already has access", variant: "destructive" });
      } else {
        toast({ title: "Error granting access", description: error.message, variant: "destructive" });
      }
    } else {
      toast({ title: "✅ Access granted" });
      fetchGrantedUsers();
    }
  };

  const revokeAccess = async (accessId: string) => {
    const { error } = await supabase.from("microplan_form_access").delete().eq("id", accessId);
    if (error) {
      toast({ title: "Error revoking access", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Access revoked" });
      fetchGrantedUsers();
    }
  };

  const openAccessManager = () => {
    setShowAccessManager(true);
    fetchGrantedUsers();
    fetchAllUsers();
  };

  // ---- EXPORT: Blank branded template or filled data ----
  const handleExportTemplate = async (filled: boolean) => {
    // Lens/scope aware: never export rows outside what this user may see.
    const dataRows = filled
      ? displayEntries.map(withRecomputedDistances).map((entry) =>
          TEMPLATE_HEADERS.map((header) => {
            const field = HEADER_TO_FIELD[header];
            if (!field) return "";
            const val = (entry as any)[field];
            if (field === "cdd_from_community") return val ? "Yes" : "No";
            return (val ?? "") as string | number;
          }),
        )
      : [];

    const fileName = filled
      ? `Microplan_Data_${selectedProjectId.slice(0, 8)}.xlsx`
      : "NTDs_Microplan_Template_Blank.xlsx";

    try {
      await exportMicroplanWorkbook({ filled, dataRows, fileName });
      toast({ title: filled ? "📊 Data exported" : "📋 Template downloaded", description: fileName });
    } catch (err: any) {
      toast({ title: "Export failed", description: err?.message, variant: "destructive" });
    }
  };

  // ---- IMPORT: Read xlsx and insert entries ----
  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user?.id || !selectedProjectId) return;

    setImporting(true);
    try {
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const allRows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });

      // Find the header row (the one containing "Name of FLHF")
      let headerRowIdx = -1;
      for (let i = 0; i < Math.min(allRows.length, 10); i++) {
        const row = allRows[i];
        if (row && row.some((cell: any) => String(cell).includes("Name of FLHF"))) {
          headerRowIdx = i;
          break;
        }
      }

      if (headerRowIdx === -1) {
        toast({ title: "Invalid template", description: "Could not find header row with 'Name of FLHF'. Please use the exported template.", variant: "destructive" });
        return;
      }

      const headers: string[] = allRows[headerRowIdx].map((h: any) => String(h).trim().replace(/\s*\*+$/, ""));
      const dataRows = allRows.slice(headerRowIdx + 1).filter(row => row && row.some((cell: any) => cell !== undefined && cell !== ""));

      if (dataRows.length === 0) {
        toast({ title: "No data rows", description: "The template has no data rows below the headers.", variant: "destructive" });
        return;
      }

      const entriesToInsert: any[] = [];
      let skipped = 0;

      for (const row of dataRows) {
        const entry: any = { project_id: selectedProjectId, created_by: user.id, updated_by: user.id };

        headers.forEach((header, idx) => {
          const field = HEADER_TO_FIELD[header];
          if (!field) return;
          let val = row[idx];
          if (val === undefined || val === null || val === "") {
            entry[field] = null;
            return;
          }
          if (field === "cdd_from_community") {
            entry[field] = String(val).toLowerCase() === "yes" || val === true || val === 1;
          } else if (numericFields.has(field)) {
            const n = Number(val);
            entry[field] = isNaN(n) ? null : n;
          } else {
            entry[field] = String(val);
          }
        });

        // Validate required fields
        if (!entry.state || !entry.lga || !entry.ward || !entry.flhf_name || !entry.community_name) {
          skipped++;
          continue;
        }
        entriesToInsert.push(entry);
      }

      if (entriesToInsert.length === 0) {
        toast({ title: "No valid entries", description: `${skipped} rows skipped due to missing required fields (State, LGA, Ward, FLHF, Community).`, variant: "destructive" });
        return;
      }

      // Insert in batches of 50
      for (let i = 0; i < entriesToInsert.length; i += 50) {
        const batch = entriesToInsert.slice(i, i + 50);
        const { error } = await supabase.from("microplan_entries").insert(batch);
        if (error) throw error;
      }

      toast({
        title: `✅ Imported ${entriesToInsert.length} entries`,
        description: skipped > 0 ? `${skipped} rows skipped (missing required fields)` : undefined,
      });
      fetchEntries();
    } catch (err: any) {
      toast({ title: "Import failed", description: err.message, variant: "destructive" });
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // Use demo data when no real entries exist. Never for MDA Lens users — a
  // scoped user must only ever see real, in-scope submissions (or an empty state).
  const isUsingDemoData = entries.length === 0 && !loading && !lensEnabled;
  const rawBaseEntries = isUsingDemoData ? DEMO_ENTRIES : entries;

  // Global GRID3 fuzzy harmonisation of health-facility names, applied
  // in-memory so the Planning table, dashboards and every export show one
  // standard spelling per ward without mutating the stored records.
  const [facilityRenames, setFacilityRenames] = useState<FacilityRename[]>([]);
  const harmonizeKey = useMemo(
    () =>
      rawBaseEntries
        .map((e: any) => `${e?.id}|${e?.state}|${e?.lga}|${e?.ward}|${e?.flhf_name}`)
        .join("~"),
    [rawBaseEntries],
  );
  useEffect(() => {
    let cancelled = false;
    if (!rawBaseEntries.length) { setFacilityRenames([]); return; }
    harmonizeFacilityNames(rawBaseEntries as any[])
      .then((res) => { if (!cancelled) setFacilityRenames(res.renames); })
      .catch(() => { if (!cancelled) setFacilityRenames([]); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [harmonizeKey]);

  const baseEntries = useMemo<any[]>(
    () => (facilityRenames.length ? applyRenamesLocally(rawBaseEntries as any[], facilityRenames) : (rawBaseEntries as any[])),
    [rawBaseEntries, facilityRenames],
  );

  // Designation-scope filter: admins always see all; non-admins with no
  // designation assignment also see all (legacy). Users with assignments are
  // restricted to rows that match at least one of their assignments.
  // Project-scoped geography archive: LGAs/wards the manager has dropped from
  // every KPI, chart, table and export until they are restored.
  const dashExcl = useGeoExclusions(`dashboard.${selectedProjectId || "all"}`);

  /** Everything the user is allowed to see (designation + project scope + lens),
   *  BEFORE archiving. This is the universe the exclusion panel may offer, so it
   *  can never surface geographies that are not part of the project. */
  const scopedEntries = useMemo(() => {
    let result = baseEntries;
    if (!isAdmin && !scope.loading && scope.designations.length > 0 && !scope.hasNoRestriction) {
      result = result.filter((e: any) => scope.isInScope(e));
    }
    result = result.filter((e: any) => rowInScope(projectScope, e));
    if (lens) result = result.filter((e: any) =>
      rowInLensScope(lens, e.state, e.lga, e.ward) && campaignInLensScope(lens, e.campaign_type)
    );
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseEntries, isAdmin, scope, projectScope, lens]);

  const displayEntries = useMemo(() => {
    // Archived geographies — excluded from every downstream computation.
    if (dashExcl.keys.size > 0) return scopedEntries.filter((e: any) => !rowExcluded(dashExcl.keys, e));
    return scopedEntries;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopedEntries, dashExcl.archived]);



  // Columns for the MDA Lens export (questions as columns, responses as rows).
  const lensExportColumns = useMemo(() => {
    const hidden = new Set(["user_id", "project_id", "created_by", "idempotency_key"]);
    const keys = new Set<string>();
    for (const r of displayEntries.slice(0, 200)) Object.keys(r || {}).forEach((k) => keys.add(k));
    return [...keys]
      .filter((k) => !hidden.has(k))
      .map((k) => ({
        key: k,
        label: k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
        geo: ["state", "lga", "ward"].includes(k),
      }));
  }, [displayEntries]);

  // Filters (memoized — avoids re-deriving over millions of rows every render)
  const uniqueStates = useMemo(
    () => [...new Set(displayEntries.map(e => e.state))].sort(),
    [displayEntries],
  );
  const uniqueLgas = useMemo(() => [...new Set(displayEntries
    .filter((e) => filterState === "all" || e.state === filterState)
    .map((e) => e.lga).filter(Boolean))].sort(), [displayEntries, filterState]);
  const uniqueWards = useMemo(() => [...new Set(displayEntries
    .filter((e) => (filterState === "all" || e.state === filterState) && (filterLga === "all" || e.lga === filterLga))
    .map((e) => e.ward).filter(Boolean))].sort(), [displayEntries, filterState, filterLga]);

  // MDA Lens: lock any geography level the grant pins to a single value.
  const lensLockState = !!lens?.states.length && uniqueStates.length <= 1;
  const lensLockLga = !!lens?.lgas.length && uniqueLgas.length <= 1;
  const lensLockWard = !!lens?.wards.length && uniqueWards.length <= 1;
  useEffect(() => {
    if (lensLockState && uniqueStates[0] && filterState !== uniqueStates[0]) setFilterState(uniqueStates[0] as string);
    if (lensLockLga && uniqueLgas[0] && filterLga !== uniqueLgas[0]) setFilterLga(uniqueLgas[0] as string);
    if (lensLockWard && uniqueWards[0] && filterWard !== uniqueWards[0]) setFilterWard(uniqueWards[0] as string);
  }, [lensLockState, lensLockLga, lensLockWard, uniqueStates, uniqueLgas, uniqueWards, filterState, filterLga, filterWard]);

  const filtered = useMemo(() => displayEntries.filter(e => {
    if (filterState !== "all" && e.state !== filterState) return false;
    if (filterLga !== "all" && e.lga !== filterLga) return false;
    if (filterWard !== "all" && e.ward !== filterWard) return false;
    if (filterAccessibility !== "all") {
      const acc = e.accessibility || "unset";
      if (acc !== filterAccessibility) return false;
    }
    if (filterSecurity !== "all") {
      const sec = e.security_clearance || "unknown";
      const match = filterSecurity === "unknown" ? (!e.security_clearance || e.security_clearance === "unknown") : sec === filterSecurity;
      if (!match) return false;
    }
    if (filterTerrain !== "all") {
      const ter = e.terrain_type || "unset";
      if (ter !== filterTerrain) return false;
    }
    if (filterKeyRatio !== "all") {
      if (filterKeyRatio === "cdd_from_community" && !e.cdd_from_community) return false;
      if (filterKeyRatio === "cdd_external" && e.cdd_from_community) return false;
      if (filterKeyRatio === "hard_to_reach" && !(e.accessibility === "hard_to_reach" || e.accessibility === "inaccessible")) return false;
    }
    if (filterDisability !== "all") {
      const def = DISABILITY_TYPES.find(d => d.key === filterDisability);
      if (!def) return false;
      if (pwdValue(e as any, def.field) <= 0) return false;
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return [e.community_name, e.settlement_name, e.flhf_name, e.lga, e.ward].some(v => v?.toLowerCase().includes(q));
    }
    return true;
  }), [displayEntries, filterState, filterLga, filterWard, filterAccessibility, filterSecurity, filterTerrain, filterKeyRatio, filterDisability, searchQuery]);

  // Filter context used by the breadcrumb trail and the "export any level" button.
  const exportFilterContext = useMemo(() => ({
    project: projects.find((p) => p.id === selectedProjectId)?.name,
    state: filterState,
    lga: filterLga,
    ward: filterWard,
    accessibility: filterAccessibility,
    security: filterSecurity,
    terrain: filterTerrain,
    keyRatio: filterKeyRatio,
    disability: filterDisability === "all"
      ? "all"
      : DISABILITY_TYPES.find((d) => d.key === filterDisability)?.label ?? filterDisability,
    search: searchQuery || undefined,
  }), [projects, selectedProjectId, filterState, filterLga, filterWard, filterAccessibility, filterSecurity, filterTerrain, filterKeyRatio, filterDisability, searchQuery]);

  const drillCrumbs = useMemo(() => {
    const c: { label: string; value: string; onClear?: () => void }[] = [];
    if (filterState !== "all") c.push({ label: "State", value: filterState, onClear: lensLockState ? undefined : () => { setFilterState("all"); setFilterLga("all"); setFilterWard("all"); } });
    if (filterLga !== "all") c.push({ label: "LGA", value: filterLga, onClear: lensLockLga ? undefined : () => { setFilterLga("all"); setFilterWard("all"); } });
    if (filterWard !== "all") c.push({ label: "Ward", value: filterWard, onClear: lensLockWard ? undefined : () => setFilterWard("all") });
    if (filterAccessibility !== "all") c.push({ label: "Accessibility", value: filterAccessibility.replace(/_/g, " "), onClear: () => setFilterAccessibility("all") });
    if (filterSecurity !== "all") c.push({ label: "Security", value: filterSecurity.replace(/_/g, " "), onClear: () => setFilterSecurity("all") });
    if (filterTerrain !== "all") c.push({ label: "Terrain", value: filterTerrain, onClear: () => setFilterTerrain("all") });
    if (filterKeyRatio !== "all") c.push({ label: "Key Ratio", value: filterKeyRatio.replace(/_/g, " "), onClear: () => setFilterKeyRatio("all") });
    if (filterDisability !== "all") c.push({ label: "Disability", value: DISABILITY_TYPES.find(d => d.key === filterDisability)?.label ?? filterDisability, onClear: () => setFilterDisability("all") });
    return c;
  }, [filterState, filterLga, filterWard, filterAccessibility, filterSecurity, filterTerrain, filterKeyRatio, filterDisability, lensLockState, lensLockLga, lensLockWard]);

  // ===== COMPREHENSIVE KPI ENGINE — single pass over `filtered` (memoized) =====
  // Previously ~25 separate map/filter/reduce passes ran on EVERY render. With
  // millions of rows that froze the page; now it's one loop, recomputed only
  // when the filtered set actually changes.
  const kpis = useMemo(() => {
    let totalPop = 0, totalChildren04 = 0, totalChildren514 = 0, totalAdults15 = 0, totalHouseholds = 0, targetPop = 0;
    let geotagged = 0, hardToReach = 0, uniqueSettlements = 0, cddFromCommunity = 0;
    let distSum = 0, distCount = 0;
    // (geography counts are computed via countGeography below)
    const accessStats = { accessible: 0, hard_to_reach: 0, inaccessible: 0, seasonal: 0, unset: 0 };
    const securityStats = { cleared: 0, partial: 0, not_cleared: 0, unknown: 0 };
    const terrainCounts: Record<string, number> = {};
    const disabilityStats: Record<string, { pop: number; communities: number }> = Object.fromEntries(
      DISABILITY_TYPES.map(d => [d.key, { pop: 0, communities: 0 }]),
    );
    let totalPwd = 0;
    for (const e of filtered) {
      for (const d of DISABILITY_TYPES) {
        const v = pwdValue(e as any, d.field);
        if (v > 0) { disabilityStats[d.key].pop += v; disabilityStats[d.key].communities += 1; }
      }
      totalPwd += pwdTotalFor(e as any);
      totalPop += e.estimated_total_population || 0;
      totalChildren04 += e.estimated_children_0_4 || 0;
      totalChildren514 += e.estimated_children_5_14 || 0;
      totalAdults15 += e.estimated_adults_15_plus || 0;
      totalHouseholds += e.number_of_households || 0;
      targetPop += calcTargetPop(e as any);
      if (e.community_latitude && e.community_longitude) geotagged++;
      const acc = e.accessibility;
      if (acc === "hard_to_reach" || acc === "inaccessible") hardToReach++;
      // Wards (and LGAs) are counted on a composite key so identically named
      // wards in different LGAs are never collapsed, and blanks never count —
      // this keeps the dashboard KPI identical to the Microplan Summary rollup.
      if (e.settlement_name) uniqueSettlements++;
      if (e.cdd_from_community) cddFromCommunity++;
      const d = effectiveDistanceKm(e as any);
      if (d != null && d > 0) { distSum += d; distCount++; }
      if (acc === "accessible") accessStats.accessible++;
      else if (acc === "hard_to_reach") accessStats.hard_to_reach++;
      else if (acc === "inaccessible") accessStats.inaccessible++;
      else if (acc === "seasonal") accessStats.seasonal++;
      else if (!acc) accessStats.unset++;
      const sc = e.security_clearance;
      if (sc === "cleared") securityStats.cleared++;
      else if (sc === "partial") securityStats.partial++;
      else if (sc === "not_cleared") securityStats.not_cleared++;
      else if (!sc || sc === "unknown") securityStats.unknown++;
      const t = e.terrain_type || "unset";
      terrainCounts[t] = (terrainCounts[t] || 0) + 1;
    }
    const count = filtered.length;
    return {
      totalPop, totalChildren04, totalChildren514, totalAdults15, totalHouseholds, targetPop,
      geotagged, geotaggedPct: count > 0 ? (geotagged / count) * 100 : 0,
      hardToReach,
      ...(() => {
        // Shared helper — same blank-excluding composite keys used by the
        // Microplan Summary rollup and the Excel export summary sheet.
        const g = countGeography(filtered as any[]);
        return { uniqueStatesCount: g.states, uniqueLGAsCount: g.lgas, uniqueWardsCount: g.wards, uniqueFLHFs: g.flhfs };
      })(),
      uniqueSettlements, cddFromCommunity, cddPct: count > 0 ? (cddFromCommunity / count) * 100 : 0,
      avgDistKm: distCount ? (distSum / distCount).toFixed(1) : "—",
      avgHouseholdsPerCommunity: count > 0 && totalHouseholds > 0 ? Math.round(totalHouseholds / count) : 0,
      accessStats, securityStats, terrainCounts, disabilityStats, totalPwd,
    };
  }, [filtered, calcTargetPop]);
  const {
    totalPop, totalChildren04, totalChildren514, totalAdults15, totalHouseholds, targetPop,
    geotagged, geotaggedPct, hardToReach, uniqueStatesCount, uniqueLGAsCount, uniqueWardsCount,
    uniqueFLHFs, uniqueSettlements, cddFromCommunity, cddPct, avgDistKm, avgHouseholdsPerCommunity,
    accessStats, securityStats, terrainCounts, disabilityStats, totalPwd,
  } = kpis;

  const TERRAIN_EMOJI: Record<string, string> = { flat: "🌾", hilly: "⛰️", mountainous: "🏔️", riverine: "🌊", swampy: "🏝️", desert: "🏜️", forest: "🌲" };


  // Medicine allocation: unique LGAs from current entries
  // When the user has uploaded ad-hoc population rows, the medicine breakdown
  // computes from those instead of the saved microplan entries.
  const medicineSourceEntries = useMemo(
    () => (uploadedMedEntries.length > 0 ? (uploadedMedEntries as any[]) : displayEntries),
    [uploadedMedEntries, displayEntries],
  );
  // Normalised geographic key so allocation rows (which may write "MARMA") match
  // population rows (which may read "MARMA WARD") despite case, whitespace, or a
  // trailing "ward"/"district" suffix. Without this, communities silently fail to
  // match an allocation and render blank.
  const normGeo = useCallback((s: unknown) =>
    String(s ?? "")
      .toLowerCase()
      .replace(/\b(ward|district)\b/g, " ")
      .replace(/[^a-z0-9]/g, ""), []);
  const geoEq = useCallback((a: unknown, b: unknown) => normGeo(a) === normGeo(b), [normGeo]);
  // Pre-built geographic index of the population source. Built ONCE per dataset
  // change instead of re-scanning millions of rows for every allocation row,
  // option lookup, warning and missing-ward computation (was O(rows × allocs)).
  const medicineIndex = useMemo(() => {
    const tp = (e: any) =>
      e && e.__uploaded
        ? Math.round((Number(e.estimated_total_population) || 0) * (medTargetPct / 100))
        : (calcTargetPop(e) || (e.estimated_total_population || 0));

    type Node = { e: any; tp: number; nFlhf: string };
    const byLga = new Map<string, Node[]>();        // normLga -> entries
    const byWard = new Map<string, Node[]>();        // normLga|normWard -> entries
    const byFlhf = new Map<string, Node[]>();        // normLga|normWard|normFlhf -> entries
    const lgaSet = new Set<string>();                // raw LGA values for dropdown
    const wardOpts = new Map<string, Set<string>>(); // raw LGA -> raw wards
    const flhfByLgaWard = new Map<string, Set<string>>(); // raw LGA|ward -> raw flhfs
    const flhfByLga = new Map<string, Set<string>>();     // raw LGA -> raw flhfs
    const wardAgg = new Map<string, { lga: string; ward: string; nLga: string; nWard: string; communities: number; targetPop: number }>();

    const push = (m: Map<string, Node[]>, k: string, n: Node) => {
      const a = m.get(k);
      if (a) a.push(n); else m.set(k, [n]);
    };
    const addOpt = (m: Map<string, Set<string>>, k: string, v: string) => {
      let s = m.get(k);
      if (!s) { s = new Set(); m.set(k, s); }
      s.add(v);
    };

    for (const e of medicineSourceEntries as any[]) {
      const rawLga = e.lga;
      const nLga = normGeo(rawLga);
      const nWard = normGeo(e.ward);
      const nFlhf = normGeo(e.flhf_name);
      const node: Node = { e, tp: tp(e), nFlhf };
      if (rawLga) lgaSet.add(rawLga);
      push(byLga, nLga, node);
      if (nWard) push(byWard, `${nLga}|${nWard}`, node);
      if (nWard && nFlhf) push(byFlhf, `${nLga}|${nWard}|${nFlhf}`, node);
      // dropdown option maps (raw values preserved for display)
      if (rawLga && e.ward) addOpt(wardOpts, rawLga, e.ward);
      if (rawLga && e.flhf_name) {
        addOpt(flhfByLga, rawLga, e.flhf_name);
        if (e.ward) addOpt(flhfByLgaWard, `${rawLga}|${e.ward}`, e.flhf_name);
      }
      // per-ward aggregation for missing-ward detection
      const wardStr = String(e.ward ?? "").trim();
      const lgaStr = String(rawLga ?? "").trim();
      if (lgaStr && wardStr && wardStr !== "—") {
        const key = `${nLga}|${nWard}`;
        const prev = wardAgg.get(key);
        if (prev) { prev.communities++; prev.targetPop += node.tp; }
        else wardAgg.set(key, { lga: lgaStr, ward: wardStr, nLga, nWard, communities: 1, targetPop: node.tp });
      }
    }
    return { byLga, byWard, byFlhf, lgaSet, wardOpts, flhfByLgaWard, flhfByLga, wardAgg };
  }, [medicineSourceEntries, medTargetPct, calcTargetPop, normGeo]);

  // Resolve the population rows covered by an allocation row at its chosen depth.
  const allocScope = useCallback((me: { lga?: string; ward?: string; flhf?: string }) => {
    const nLga = normGeo(me.lga);
    if (me.flhf && me.ward)
      return medicineIndex.byFlhf.get(`${nLga}|${normGeo(me.ward)}|${normGeo(me.flhf)}`) || [];
    if (me.ward)
      return medicineIndex.byWard.get(`${nLga}|${normGeo(me.ward)}`) || [];
    if (me.flhf) {
      const nf = normGeo(me.flhf);
      return (medicineIndex.byLga.get(nLga) || []).filter(n => n.nFlhf === nf);
    }
    return medicineIndex.byLga.get(nLga) || [];
  }, [medicineIndex, normGeo]);

  const allLgasForMedicine = useMemo(() => [...medicineIndex.lgaSet].sort(), [medicineIndex]);
  // Cascaded option lookups for optional Ward / FLHF drill-down (O(1) map reads)
  const wardsForLga = useCallback(
    (lga: string) => [...(medicineIndex.wardOpts.get(lga) || [])].sort(),
    [medicineIndex],
  );
  const flhfsForWard = useCallback(
    (lga: string, ward: string) => {
      if (ward) return [...(medicineIndex.flhfByLgaWard.get(`${lga}|${ward}`) || [])].sort();
      return [...(medicineIndex.flhfByLga.get(lga) || [])].sort();
    },
    [medicineIndex],
  );


  const getTargetPop = (e: any) => {
    // Uploaded population rows: target population = total population × chosen %.
    if (e && e.__uploaded) {
      return Math.round((Number(e.estimated_total_population) || 0) * (medTargetPct / 100));
    }
    return calcTargetPop(e) || (e.estimated_total_population || 0);
  };

  // User-configurable target drug-per-person ratio band (persisted)
  const [targetRatioMin, setTargetRatioMin] = useState<number>(() => {
    const v = parseFloat(localStorage.getItem("microplanning.targetRatioMin") || "");
    return Number.isFinite(v) && v > 0 ? v : 2.5;
  });
  const [targetRatioMax, setTargetRatioMax] = useState<number>(() => {
    const v = parseFloat(localStorage.getItem("microplanning.targetRatioMax") || "");
    return Number.isFinite(v) && v > 0 ? v : 3.0;
  });
  useEffect(() => { localStorage.setItem("microplanning.targetRatioMin", String(targetRatioMin)); }, [targetRatioMin]);
  useEffect(() => { localStorage.setItem("microplanning.targetRatioMax", String(targetRatioMax)); }, [targetRatioMax]);
  const TARGET_RATIO_MIN = targetRatioMin;
  const TARGET_RATIO_MAX = targetRatioMax;
  const TARGET_RATIO_MID = (TARGET_RATIO_MIN + TARGET_RATIO_MAX) / 2;

  const medicineAllocationData = useMemo(() => {
    const validEntries = debouncedAllocEntries.filter(me => me.lga && me.amount && Number(me.amount) > 0);
    if (validEntries.length === 0) return [];

    const allRows: { entryId: string; year: number; state: string; lga: string; ward: string; flhf: string; community: string; settlement: string; targetPop: number; medicineRequired: number; medicineUsed: number; pct: number; jrsmTarget: number; peopleToTreat: number; ratio: number; ratioStatus: "ok" | "low" | "high" | "na"; suggestedPeople: number; scaleFactor: number }[] = [];

    for (const me of validEntries) {
      const totalMedicine = Number(me.amount);
      const jrsmTotal = Number(me.jrsm) || 0;
      const lgaEntries = allocScope(me);
      if (lgaEntries.length === 0) continue;

      const rows = lgaEntries.map(n => {
        const e = n.e;
        return {
          entryId: e.id,
          year: e.year_of_microplanning || new Date().getFullYear(),
          state: e.state,
          lga: e.lga,
          ward: e.ward,
          flhf: e.flhf_name,
          community: e.community_name,
          settlement: e.settlement_name || "—",
          targetPop: n.tp,
          medicineUsed: Number((e as any).medicine_used) || 0,
        };
      });

      const totalTargetPop = rows.reduce((s, r) => s + r.targetPop, 0);

      allRows.push(...rows.map(r => {
        const share = totalTargetPop > 0 ? r.targetPop / totalTargetPop : 0;
        const medicineRequired = Math.round(share * totalMedicine);
        const peopleToTreat = jrsmTotal > 0 ? Math.round(share * jrsmTotal) : 0;
        const ratio = peopleToTreat > 0 ? medicineRequired / peopleToTreat : 0;
        let ratioStatus: "ok" | "low" | "high" | "na" = "na";
        if (peopleToTreat > 0) {
          if (ratio < TARGET_RATIO_MIN) ratioStatus = "low";
          else if (ratio > TARGET_RATIO_MAX) ratioStatus = "high";
          else ratioStatus = "ok";
        }
        // Suggested people-to-treat that lands the ratio at the midpoint (2.75)
        const suggestedPeople = Math.round(medicineRequired / TARGET_RATIO_MID);
        // Scaling factor to apply to current people-to-treat to reach midpoint
        const scaleFactor = peopleToTreat > 0 ? suggestedPeople / peopleToTreat : 0;
        return {
          ...r,
          medicineRequired,
          pct: share * 100,
          jrsmTarget: peopleToTreat,
          peopleToTreat,
          ratio,
          ratioStatus,
          suggestedPeople,
          scaleFactor,
        };
      }));
    }

    return allRows;
  }, [debouncedAllocEntries, allocScope, TARGET_RATIO_MIN, TARGET_RATIO_MAX, TARGET_RATIO_MID]);

  // Render the per-community allocation preview in pages of 100 so even a
  // computed plan spanning tens of thousands of communities stays smooth and
  // never floods the DOM (which previously froze / crashed the browser).
  const medAllocPagination = useTablePagination(medicineAllocationData, 100);
  // Memoized grand totals over the FULL dataset (independent of the visible page).
  const medAllocTotals = useMemo(() => {
    let targetPop = 0, medicine = 0, people = 0;
    for (const r of medicineAllocationData) {
      targetPop += r.targetPop; medicine += r.medicineRequired; people += r.peopleToTreat;
    }
    return { targetPop, medicine, people, ratio: people > 0 ? medicine / people : 0 };
  }, [medicineAllocationData]);


  // ---- Allocation validation ----
  // Prevent allocations whose JRSM target (people to treat) exceeds the target
  // population available at the chosen depth (LGA / Ward / FLHF). Returns the
  // offending entries with their totals so the UI can show a precise error.
  const allocationWarnings = useMemo(() => {
    const out: { idx: number; lga: string; ward: string; flhf: string; depth: string; jrsm: number; targetPop: number; over: number }[] = [];
    debouncedAllocEntries.forEach((me, idx) => {
      if (!me.lga) return;
      const jrsm = Number(me.jrsm) || 0;
      if (jrsm <= 0) return;
      const scope = allocScope(me);
      if (scope.length === 0) return;
      const targetPop = scope.reduce((s, n) => s + n.tp, 0);
      if (targetPop > 0 && jrsm > targetPop) {
        const depth = me.flhf ? "FLHF" : me.ward ? "Ward" : "LGA";
        out.push({ idx, lga: me.lga, ward: me.ward || "—", flhf: me.flhf || "—", depth, jrsm, targetPop, over: jrsm - targetPop });
      }
    });
    return out;
  }, [debouncedAllocEntries, allocScope]);

  // ---- Wards present in the population data but NOT covered by the allocation ----
  // After uploading/entering an allocation plan, surface every ward that the
  // "Upload Population Data" feature imported but the allocation plan never
  // covered (either by a ward-level row or an LGA-wide row). The admin can add
  // them to the allocation table and type values so they spread to communities.
  const missingAllocationWards = useMemo(() => {
    // Only relevant once at least one allocation row exists.
    const hasAlloc = debouncedAllocEntries.some((me) => me.lga);
    if (!hasAlloc) return [] as { lga: string; ward: string; communities: number; targetPop: number }[];

    // LGAs covered by an LGA-wide allocation row (no ward) cover all their wards.
    const lgaWide = new Set(
      debouncedAllocEntries.filter((me) => me.lga && !me.ward).map((me) => normGeo(me.lga)),
    );
    const coveredWard = new Set(
      debouncedAllocEntries
        .filter((me) => me.lga && me.ward)
        .map((me) => `${normGeo(me.lga)}|${normGeo(me.ward)}`),
    );

    // Use the pre-aggregated per-ward index instead of rescanning every row.
    const out: { lga: string; ward: string; communities: number; targetPop: number }[] = [];
    for (const w of medicineIndex.wardAgg.values()) {
      if (lgaWide.has(w.nLga)) continue; // whole LGA already allocated
      if (coveredWard.has(`${w.nLga}|${w.nWard}`)) continue; // ward already allocated
      out.push({ lga: w.lga, ward: w.ward, communities: w.communities, targetPop: w.targetPop });
    }
    return out.sort((a, b) =>
      a.lga === b.lga ? a.ward.localeCompare(b.ward) : a.lga.localeCompare(b.lga),
    );
  }, [debouncedAllocEntries, medicineIndex, normGeo]);



  // Per-LGA adjustment suggestions (drug/person ratio → 2.5–3.0)
  const lgaAdjustmentSuggestions = useMemo(() => {
    const out: { lga: string; idx: number; medicineTotal: number; jrsmCurrent: number; jrsmSuggested: number; ratioCurrent: number; scaleFactor: number; status: "ok" | "low" | "high" | "na" }[] = [];
    medAllocEntries.forEach((me, idx) => {
      if (!me.lga || !me.amount) return;
      const med = Number(me.amount);
      const jrsm = Number(me.jrsm) || 0;
      if (med <= 0 || jrsm <= 0) return;
      const ratio = med / jrsm;
      let status: "ok" | "low" | "high" | "na" = "ok";
      if (ratio < TARGET_RATIO_MIN) status = "low";
      else if (ratio > TARGET_RATIO_MAX) status = "high";
      const jrsmSuggested = Math.round(med / TARGET_RATIO_MID);
      out.push({
        lga: me.lga, idx,
        medicineTotal: med,
        jrsmCurrent: jrsm,
        jrsmSuggested,
        ratioCurrent: ratio,
        scaleFactor: jrsmSuggested / jrsm,
        status,
      });
    });
    return out;
  }, [medAllocEntries, TARGET_RATIO_MIN, TARGET_RATIO_MAX, TARGET_RATIO_MID]);

  // ---- Medicine "upload & compute" handlers ----
  const handleMedicineUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingMed(true);
    setUploadProgress(0);
    try {
      const { entries, skipped, total } = await parseMedicineUploadFile(file, (done, tot) => {
        setUploadProgress(tot > 0 ? Math.round((done / tot) * 100) : 100);
      });
      if (entries.length === 0) {
        toast({ title: "No valid rows", description: "Ensure State, LGA, Community/Settlement and Total Population are filled.", variant: "destructive" });
        return;
      }
      setUploadedMedEntries(entries);
      toast({
        title: `✅ ${entries.length.toLocaleString()} rows ready`,
        description: `Target population computed from ${total.toLocaleString()} rows${skipped > 0 ? ` · ${skipped.toLocaleString()} skipped` : ""}. Enter medicine per LGA below.`,
      });
      // Offer admins to adopt this population as the project's microplan data.
      if (isAdmin && selectedProjectId) setShowAdoptDialog(true);
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploadingMed(false);
      setUploadProgress(0);
      if (medUploadRef.current) medUploadRef.current.value = "";
    }
  };

  // ---- Allocation Plan upload: auto-build allocation rows from one sheet ----
  const handleAllocationPlanUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingAlloc(true);
    try {
      const { rows, skipped, total } = await parseAllocationPlanFile(file);
      if (rows.length === 0) {
        toast({ title: "No valid rows", description: "Ensure LGA and at least one of JRSM / Medicine columns are filled.", variant: "destructive" });
        return;
      }
      // Build allocation entries: prefer Ward-level rows; fall back to LGA total.
      const built: typeof medAllocEntries = [];
      const seen = new Set<string>();
      const lgaHasWard = new Set(rows.filter(r => r.ward && r.medicineByWard > 0).map(r => r.lga));
      for (const r of rows) {
        if (r.ward && (r.medicineByWard > 0 || r.jrsm > 0)) {
          const key = `${r.lga}|${r.ward}`.toLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);
          built.push({ lga: r.lga, ward: r.ward, flhf: "", amount: String(r.medicineByWard || 0), jrsm: r.jrsm ? String(r.jrsm) : "", year: new Date().getFullYear() });
        } else if (!lgaHasWard.has(r.lga) && r.medicineByLga > 0) {
          const key = `${r.lga}|`.toLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);
          built.push({ lga: r.lga, ward: "", flhf: "", amount: String(r.medicineByLga), jrsm: r.jrsm ? String(r.jrsm) : "", year: new Date().getFullYear() });
        }
      }
      if (built.length === 0) {
        toast({ title: "Nothing to allocate", description: "No medicine quantities found in the sheet.", variant: "destructive" });
        return;
      }
      setMedAllocEntries(built);
      toast({
        title: `✅ ${built.length.toLocaleString()} allocation(s) built`,
        description: `From ${total.toLocaleString()} rows${skipped > 0 ? ` · ${skipped.toLocaleString()} skipped` : ""}. Medicine & expected treatment auto-distributed per community.`,
      });
    } catch (err: any) {
      toast({ title: "Allocation upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploadingAlloc(false);
      if (allocUploadRef.current) allocUploadRef.current.value = "";
    }
  };

  // Stable duplicate key for a microplan/community row.
  const dupKey = (e: any) =>
    [e.state, e.lga, e.ward, e.flhf_name, e.community_name]
      .map((v) => String(v ?? "").trim().toLowerCase())
      .join("|");

  // Duplicate analysis between the uploaded rows and existing project entries.
  const adoptionStats = useMemo(() => {
    const existing: Record<string, any> = {};
    entries.forEach((e) => { existing[dupKey(e)] = e; });
    let newCount = 0;
    let dupeCount = 0;
    const seenInUpload = new Set<string>();
    let internalDupes = 0;
    for (const u of uploadedMedEntries) {
      const k = dupKey(u);
      if (seenInUpload.has(k)) internalDupes++;
      seenInUpload.add(k);
      if (existing[k]) dupeCount++;
      else newCount++;
    }
    return { newCount, dupeCount, internalDupes, total: uploadedMedEntries.length };
  }, [uploadedMedEntries, entries]);

  // Side-by-side preview rows: computed target population + duplicate flags.
  const uploadPreviewRows = useMemo(() => {
    const existing: Record<string, any> = {};
    entries.forEach((e) => { existing[dupKey(e)] = e; });
    const seen = new Set<string>();
    return uploadedMedEntries.map((u) => {
      const k = dupKey(u);
      const existingMatch = existing[k];
      const internalDup = seen.has(k);
      seen.add(k);
      return {
        row: u,
        targetPop: Math.round((Number(u.estimated_total_population) || 0) * (medTargetPct / 100)),
        existingMatch: existingMatch || null,
        internalDup,
        isDup: !!existingMatch || internalDup,
      };
    });
  }, [uploadedMedEntries, entries, medTargetPct]);

  // Map an uploaded population row to a microplan_entries payload.
  const uploadedToEntry = (u: UploadedMedicineEntry) => ({
    project_id: selectedProjectId,
    created_by: user?.id,
    updated_by: user?.id,
    year_of_microplanning: u.year_of_microplanning,
    population_source: "Upload & Compute",
    state: u.state,
    lga: u.lga,
    ward: u.ward === "—" ? null : u.ward,
    flhf_name: u.flhf_name === "—" ? null : u.flhf_name,
    community_name: u.community_name,
    settlement_name: u.settlement_name === "—" ? null : u.settlement_name,
    estimated_total_population: u.estimated_total_population,
    estimated_children_0_4: u.estimated_children_0_4,
    estimated_children_5_14: u.estimated_children_5_14,
    estimated_adults_15_plus: u.estimated_adults_15_plus,
    trachoma_0_5_months: u.trachoma_0_5_months,
    trachoma_6m_6y: u.trachoma_6m_6y,
    trachoma_7_14y: u.trachoma_7_14y,
    trachoma_15_plus: u.trachoma_15_plus,
  });

  // Adopt uploaded population as project microplan data.
  // mode: "skip" = insert new only · "update" = insert new + overwrite duplicates
  //       "keep" = insert every uploaded row (duplicates included, nothing collapsed).
  const adoptUploadedData = async (mode: "skip" | "update" | "keep") => {
    if (!user?.id || !selectedProjectId || uploadedMedEntries.length === 0) return;
    setAdopting(true);
    try {
      const existing: Record<string, any> = {};
      entries.forEach((e) => { existing[dupKey(e)] = e; });

      const toInsert: any[] = [];
      const toUpdate: { id: string; payload: any }[] = [];
      const seen = new Set<string>();

      for (const u of uploadedMedEntries) {
        const payload = uploadedToEntry(u);
        if (mode === "keep") {
          // Keep every single row — no dedup, no collapsing internal duplicates.
          toInsert.push(payload);
          continue;
        }
        const k = dupKey(u);
        if (seen.has(k)) continue; // collapse internal duplicates
        seen.add(k);
        const match = existing[k];
        if (match) {
          if (mode === "update") toUpdate.push({ id: match.id, payload });
        } else {
          toInsert.push(payload);
        }
      }

      // Bulk insert in chunks to stay responsive on large files.
      for (let i = 0; i < toInsert.length; i += 200) {
        const batch = toInsert.slice(i, i + 200);
        const { error } = await supabase.from("microplan_entries").insert(batch);
        if (error) throw error;
        await new Promise((r) => setTimeout(r, 0));
      }
      // Update duplicates if requested.
      for (let i = 0; i < toUpdate.length; i += 50) {
        const batch = toUpdate.slice(i, i + 50);
        await Promise.all(
          batch.map(({ id, payload }) =>
            supabase.from("microplan_entries").update(payload).eq("id", id),
          ),
        );
        await new Promise((r) => setTimeout(r, 0));
      }

      toast({
        title: "✅ Adopted as project microplan data",
        description: `${toInsert.length.toLocaleString()} new${toUpdate.length > 0 ? ` · ${toUpdate.length.toLocaleString()} updated` : mode === "skip" && adoptionStats.dupeCount > 0 ? ` · ${adoptionStats.dupeCount.toLocaleString()} duplicates skipped` : ""}.`,
      });
      setShowAdoptDialog(false);
      setUploadedMedEntries([]);
      fetchEntries();
    } catch (err: any) {
      toast({ title: "Adoption failed", description: err.message, variant: "destructive" });
    } finally {
      setAdopting(false);
    }
  };

  const clearMedicineUpload = () => {
    setUploadedMedEntries([]);
    toast({ title: "Upload cleared", description: "Medicine breakdown reverted to saved microplan entries." });
  };

  const totalUploadedPop = useMemo(
    () => uploadedMedEntries.reduce((s, e) => s + (e.estimated_total_population || 0), 0),
    [uploadedMedEntries],
  );

  // Colorful, insightful confirmation that adopts uploaded population as project data.
  const renderAdoptDialog = () => (
    <Dialog open={showAdoptDialog} onOpenChange={(o) => { if (!adopting) setShowAdoptDialog(o); }}>
      <DialogContent className="max-w-lg p-0 overflow-hidden">
        <div className="bg-gradient-to-r from-indigo-600 via-purple-600 to-fuchsia-600 p-5 text-white">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2 text-lg">
              <Building2 className="h-5 w-5" /> Use this data as Project Microplan?
            </DialogTitle>
          </DialogHeader>
          <p className="text-white/90 text-sm mt-2">
            Adopt the uploaded population as the official microplanning data for this project. Once adopted, new
            submissions from the <strong>New Entry</strong> form will add new rows or update matching ones, and you can
            edit or delete any entry from the list.
          </p>
        </div>
        <div className="p-5 space-y-4">
          {/* Insight cards */}
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg border bg-emerald-50 dark:bg-emerald-950/30 p-2">
              <div className="text-xl font-extrabold text-emerald-600">{adoptionStats.newCount.toLocaleString()}</div>
              <div className="text-[10px] text-muted-foreground font-medium">New rows</div>
            </div>
            <div className="rounded-lg border bg-amber-50 dark:bg-amber-950/30 p-2">
              <div className="text-xl font-extrabold text-amber-600">{adoptionStats.dupeCount.toLocaleString()}</div>
              <div className="text-[10px] text-muted-foreground font-medium">Duplicates found</div>
            </div>
            <div className="rounded-lg border bg-blue-50 dark:bg-blue-950/30 p-2">
              <div className="text-xl font-extrabold text-blue-600">{totalUploadedPop.toLocaleString()}</div>
              <div className="text-[10px] text-muted-foreground font-medium">Total population</div>
            </div>
          </div>

          {adoptionStats.dupeCount > 0 && (
            <div className="rounded-lg border border-amber-300/70 bg-amber-50/70 dark:bg-amber-950/20 p-3 text-[12px] text-amber-800 dark:text-amber-300 flex gap-2">
              <span className="text-base">⚠️</span>
              <span>
                <strong>{adoptionStats.dupeCount.toLocaleString()}</strong> uploaded row(s) match existing entries
                (same State · LGA · Ward · FLHF · Community). Choose whether to skip them or overwrite with the uploaded
                values.
                {adoptionStats.internalDupes > 0 && (
                  <> {adoptionStats.internalDupes.toLocaleString()} duplicate row(s) within your file will be collapsed.</>
                )}
              </span>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <Button
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
              disabled={adopting || adoptionStats.newCount === 0 && adoptionStats.dupeCount === 0}
              onClick={() => adoptUploadedData("skip")}
            >
              {adopting ? "Adopting…" : `✅ Add ${adoptionStats.newCount.toLocaleString()} new (skip duplicates)`}
            </Button>
            {adoptionStats.dupeCount > 0 && (
              <Button
                variant="outline"
                className="w-full gap-2 border-amber-400 text-amber-700 hover:bg-amber-50"
                disabled={adopting}
                onClick={() => adoptUploadedData("update")}
              >
                🔄 Add new & update {adoptionStats.dupeCount.toLocaleString()} duplicates
              </Button>
            )}
            <Button
              variant="outline"
              className="w-full gap-2 border-blue-400 text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-950/30"
              disabled={adopting || adoptionStats.total === 0}
              onClick={() => adoptUploadedData("keep")}
            >
              ➕ Add all {adoptionStats.total.toLocaleString()} rows (keep duplicates)
            </Button>
            <Button variant="ghost" className="w-full text-muted-foreground" disabled={adopting} onClick={() => setShowAdoptDialog(false)}>
              Not now — keep it for medicine breakdown only
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );

  const applySuggestedJrsm = (idx: number, newJrsm: number) => {
    setMedAllocEntries(prev => prev.map((row, i) => i === idx ? { ...row, jrsm: String(newJrsm) } : row));
    toast({ title: "✅ JRSM target adjusted", description: `Set to ${newJrsm.toLocaleString()} people (ratio ≈ ${TARGET_RATIO_MID.toFixed(2)}).` });
  };

  // Medicine allocation export helpers
  const exportMedicineCSV = () => {
    if (medicineAllocationData.length === 0) return;
    const ws = XLSX.utils.json_to_sheet(medicineAllocationData.map(r => ({
      Year: r.year, State: r.state, LGA: r.lga, Ward: r.ward, FLHF: r.flhf,
      Community: r.community, Settlement: r.settlement,
      "Target Population": r.targetPop, "Medicine Required": r.medicineRequired, "% Share": r.pct.toFixed(1),
      "Expected Treatment (People)": r.peopleToTreat, "Drug/Person Ratio": r.ratio ? r.ratio.toFixed(2) : "—",
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Medicine Allocation");
    XLSX.writeFile(wb, "Medicine_Allocation_by_LGA.csv", { bookType: "csv" });
    toast({ title: "CSV exported", description: `${medicineAllocationData.length} rows exported.` });
  };

  const exportMedicineExcel = () => {
    if (medicineAllocationData.length === 0) return;
    const ws = XLSX.utils.json_to_sheet(medicineAllocationData.map(r => ({
      Year: r.year, State: r.state, LGA: r.lga, Ward: r.ward, FLHF: r.flhf,
      Community: r.community, Settlement: r.settlement,
      "Target Population": r.targetPop, "Medicine Required": r.medicineRequired, "% Share": Number(r.pct.toFixed(1)),
      "Expected Treatment (People)": r.peopleToTreat, "Drug/Person Ratio": r.ratio ? Number(r.ratio.toFixed(2)) : 0,
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Medicine Allocation");
    XLSX.writeFile(wb, "Medicine_Allocation_by_LGA.xlsx");
    toast({ title: "Excel exported", description: `${medicineAllocationData.length} rows exported.` });
  };

  const exportMedicinePDF = () => {
    if (medicineAllocationData.length === 0) return;
    const doc = new (jsPDF as any)({ orientation: "landscape", unit: "mm", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    doc.setFontSize(14);
    doc.text("Medicine Allocation by LGA", 14, 15);
    doc.setFontSize(8);
    const headers = ["Year", "State", "LGA", "Ward", "FLHF", "Community", "Settlement", "Target Pop", "Medicine Req."];
    const colW = [16, 25, 30, 28, 35, 35, 30, 22, 24];
    let y = 24;
    doc.setFont("helvetica", "bold");
    let x = 14;
    headers.forEach((h, i) => { doc.text(h, x, y); x += colW[i]; });
    y += 2; doc.line(14, y, pageWidth - 14, y); y += 4;
    doc.setFont("helvetica", "normal"); doc.setFontSize(7);
    medicineAllocationData.forEach(r => {
      if (y > doc.internal.pageSize.getHeight() - 12) { doc.addPage(); y = 15; }
      x = 14;
      [String(r.year), r.state, r.lga, r.ward, r.flhf, r.community, r.settlement, r.targetPop.toLocaleString(), r.medicineRequired.toLocaleString()].forEach((cell, i) => {
        const maxW = colW[i] - 2;
        const truncated = doc.getTextWidth(cell) > maxW ? cell.substring(0, Math.floor(maxW / 2)) + "…" : cell;
        doc.text(truncated, x, y); x += colW[i];
      });
      y += 4.5;
    });
    doc.save("Medicine_Allocation_by_LGA.pdf");
    toast({ title: "PDF exported", description: `${medicineAllocationData.length} rows exported.` });
  };

  const addMedAllocRow = () => setMedAllocEntries(prev => [...prev, { lga: "", ward: "", flhf: "", amount: "", jrsm: "" }]);
  // Add an uncovered (missing) ward to the allocation table, ready for the admin
  // to type its medicine amount / JRSM target so it spreads to its communities.
  const addMissingWardRow = (lga: string, ward: string) => {
    setMedAllocEntries(prev => {
      const exists = prev.some(p => normGeo(p.lga) === normGeo(lga) && normGeo(p.ward) === normGeo(ward));
      if (exists) return prev;
      // Drop the leading empty placeholder row if present.
      const base = prev.length === 1 && !prev[0].lga && !prev[0].amount ? [] : prev;
      return [...base, { lga, ward, flhf: "", amount: "", jrsm: "", year: new Date().getFullYear() }];
    });
    toast({ title: "Ward added", description: `${ward} (${lga}) added — enter its medicine & JRSM target.` });
  };
  const addAllMissingWardRows = () => {
    if (missingAllocationWards.length === 0) return;
    setMedAllocEntries(prev => {
      const base = prev.length === 1 && !prev[0].lga && !prev[0].amount ? [] : [...prev];
      const out = [...base];
      for (const m of missingAllocationWards) {
        const exists = out.some(p => normGeo(p.lga) === normGeo(m.lga) && normGeo(p.ward) === normGeo(m.ward));
        if (!exists) out.push({ lga: m.lga, ward: m.ward, flhf: "", amount: "", jrsm: "", year: new Date().getFullYear() });
      }
      return out;
    });
    toast({ title: `✅ ${missingAllocationWards.length} ward(s) added`, description: "Enter medicine & JRSM targets to spread them to communities." });
  };
  const removeMedAllocRow = async (idx: number) => {
    const row = medAllocEntries[idx];
    if (row?.id) {
      // Persisted row → delete from DB (audit trail captured by trigger)
      const { error } = await supabase
        .from("microplan_medicine_allocations")
        .delete()
        .eq("id", row.id);
      if (error) {
        toast({ title: "Delete failed", description: error.message, variant: "destructive" });
        return;
      }
      toast({ title: "Allocation deleted" });
      await fetchAllocations();
      return;
    }
    setMedAllocEntries(prev => prev.filter((_, i) => i !== idx));
  };
  const updateMedAllocRow = (idx: number, field: "lga" | "ward" | "flhf" | "amount" | "jrsm", value: string) => {
    setMedAllocEntries(prev => prev.map((row, i) => {
      if (i !== idx) return row;
      const next = { ...row, [field]: value };
      // Reset deeper levels when a parent changes to keep the cascade valid
      if (field === "lga") { next.ward = ""; next.flhf = ""; }
      if (field === "ward") { next.flhf = ""; }
      return next;
    }));
  };

  // Persist all current allocation rows (insert new, update changed)
  const saveAllocations = async () => {
    if (!selectedProjectId || !user?.id) return;
    if (!isAdmin) {
      toast({ title: "Admin only", description: "Only admins can save medicine allocations.", variant: "destructive" });
      return;
    }
    if (allocationWarnings.length > 0) {
      const w = allocationWarnings[0];
      toast({
        title: "🚫 Allocation exceeds target population",
        description: `${w.lga}${w.ward !== "—" ? ` · ${w.ward}` : ""}${w.flhf !== "—" ? ` · ${w.flhf}` : ""}: JRSM target ${w.jrsm.toLocaleString()} exceeds ${w.depth} target population ${w.targetPop.toLocaleString()} by ${w.over.toLocaleString()}.${allocationWarnings.length > 1 ? ` (+${allocationWarnings.length - 1} more)` : ""}`,
        variant: "destructive",
      });
      return;
    }
    setSavingAllocations(true);
    try {
      const valid = medAllocEntries.filter(r => r.lga && r.amount && Number(r.amount) > 0);
      for (const row of valid) {
        const payload = {
          project_id: selectedProjectId,
          lga: row.lga,
          ward: row.ward || null,
          flhf: row.flhf || null,
          amount: Number(row.amount),
          medicine_name: row.medicine_name || null,
          year: row.year || new Date().getFullYear(),
          state: displayEntries.find((e: any) => e.lga === row.lga)?.state || null,
          updated_by: user.id,
        };
        if (row.id) {
          const { error } = await supabase
            .from("microplan_medicine_allocations")
            .update(payload)
            .eq("id", row.id);
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from("microplan_medicine_allocations")
            .insert({ ...payload, created_by: user.id });
          if (error) throw error;
        }
      }
      toast({ title: "✅ Allocations saved", description: `${valid.length} LGA allocation(s) persisted with audit trail.` });
      await fetchAllocations();
    } catch (e: any) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    } finally {
      setSavingAllocations(false);
    }
  };

  // Access manager: filter users not already granted
  const grantedUserIds = new Set(grantedUsers.map(g => g.user_id));
  const availableUsers = allUsers.filter(u => {
    if (grantedUserIds.has(u.user_id)) return false;
    if (accessSearchQuery) {
      const q = accessSearchQuery.toLowerCase();
      return [u.first_name, u.last_name, u.email].some(v => v?.toLowerCase().includes(q));
    }
    return true;
  });

  return (
    <div className="space-y-4 py-2">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-1">
        <div>
          <h1 className="text-lg sm:text-xl font-extrabold text-foreground flex items-center gap-2 tracking-tight">
            <div className="p-1.5 rounded-lg bg-primary/10">
              <MapPin className="h-5 w-5 text-primary" />
            </div>
            {entryOnly ? "Microplan Entry Form" : "Geo-enabled Microplanning"}
          </h1>
          <p className="text-xs text-muted-foreground mt-1 ml-10">
            {entryOnly ? "Add new community-level microplanning entries" : "Community-level campaign planning with georeferenced data across all 36 states + FCT"}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {!entryOnly && (
            <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
              <SelectTrigger className="w-[180px] h-9 text-xs border-primary/20 shadow-sm">
                <SelectValue placeholder="Select project" />
              </SelectTrigger>
              <SelectContent>
                {projects.map(p => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {!entryOnly && canManageAccess && (
            <Button size="sm" variant="outline" onClick={openAccessManager} className="shadow-sm">
              <UserPlus className="h-3.5 w-3.5 mr-1" /> Access
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => setShowDeleteRequestsPanel(true)} className="shadow-sm">
            <ShieldCheck className="h-3.5 w-3.5 mr-1" />
            {(isAdmin || isOwner) ? "Delete Requests" : "My Delete Requests"}
          </Button>
          <KoboSyncStatusChip projectId={selectedProjectId || null} onNewSuccess={fetchEntries} />
          <TabSyncStatus projectId={selectedProjectId || null} table="microplan_entries" syncEventStatus="microplan_sync" onResync={fetchEntries} />
          {isSuperAdmin && (
            <Button size="sm" variant="outline" onClick={() => setShowKoboSettings(true)} className="shadow-sm">
              <HistoryIcon className="h-3.5 w-3.5 mr-1" /> Kobo Sync
            </Button>
          )}
          <Button size="sm" onClick={() => { setEditingEntry(null); setShowForm(true); }} className="shadow-sm font-semibold">
            <Plus className="h-3.5 w-3.5 mr-1" /> Add Entry
          </Button>
        </div>
      </div>


      {!entryOnly && (
        <>
          {/* Demo Data Banner — dynamically reflects the project's state lock */}
          {isUsingDemoData && (() => {
            const totalDemo = DEMO_ENTRIES.length;
            const activeDemo = displayEntries.length;
            const lockedStates = projectScope?.states ?? [];
            const noun = activeDemo === 1 ? "community" : "communities";
            const stateList =
              lockedStates.length === 0
                ? ""
                : lockedStates.length === 1
                  ? lockedStates[0]
                  : lockedStates.length === 2
                    ? `${lockedStates[0]} and ${lockedStates[1]}`
                    : `${lockedStates.slice(0, -1).join(", ")}, and ${lockedStates[lockedStates.length - 1]}`;
            const message = lockedStates.length > 0
              ? `Showing ${activeDemo.toLocaleString()} sample ${noun} in ${stateList} (out of ${totalDemo} total nationwide sample dataset). This data will automatically disappear when you add real entries.`
              : `Showing ${totalDemo} sample communities across Nigeria. This data will automatically disappear when you add real entries.`;
            return (
              <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg px-4 py-2.5 flex items-center gap-3">
                <span className="text-lg">🎯</span>
                <div className="flex-1">
                  <p className="text-xs font-semibold text-amber-800 dark:text-amber-200">Demo Data Preview</p>
                  <p className="text-[10px] text-amber-600 dark:text-amber-400">{message}</p>
                </div>
                <Badge variant="outline" className="border-amber-300 text-amber-700 dark:text-amber-300 text-[10px]">DEMO</Badge>
              </div>
            );
          })()}

          {/* ===== FIONET-STYLE KPI DASHBOARD ===== */}
          {/* Row 1: Primary colored KPI blocks */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            {[
              { label: "Communities", value: filtered.length.toLocaleString(), icon: Building2, bg: "hsl(215, 70%, 32%)" },
              { label: "Total Population", value: totalPop.toLocaleString(), icon: Users, bg: "hsl(215, 65%, 38%)" },
              { label: "Target Population", value: targetPop.toLocaleString(), icon: Target, bg: "hsl(142, 60%, 35%)" },
              { label: "Health Facilities", value: String(uniqueFLHFs), icon: Heart, bg: "hsl(262, 50%, 40%)" },
              { label: "Households", value: totalHouseholds.toLocaleString(), icon: Home, bg: "hsl(25, 70%, 45%)" },
              { label: "Geotagged", value: `${geotagged}/${filtered.length}`, icon: Globe, bg: geotaggedPct >= 70 ? "hsl(142, 60%, 35%)" : geotaggedPct >= 40 ? "hsl(45, 80%, 45%)" : "hsl(0, 65%, 48%)" },
            ].map(kpi => (
              <div key={kpi.label} className="rounded-xl p-3 text-white text-center shadow-md" style={{ background: kpi.bg }}>
                <div className="flex items-center justify-center gap-1.5 mb-1">
                  <kpi.icon className="h-3.5 w-3.5 opacity-80" />
                  <p className="text-[9px] font-bold uppercase tracking-wider opacity-90">{kpi.label}</p>
                </div>
                <p className="text-xl sm:text-2xl font-black tabular-nums leading-tight">{kpi.value}</p>
              </div>
            ))}
          </div>

          {/* Row 2: Secondary KPI strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
            {[
              { label: "States", value: uniqueStatesCount },
              { label: "LGAs", value: uniqueLGAsCount },
              { label: "Wards", value: uniqueWardsCount },
              { label: "Settlements", value: uniqueSettlements },
              { label: "Children 0-4", value: totalChildren04.toLocaleString() },
              { label: "Children 5-14", value: totalChildren514.toLocaleString() },
              { label: "Adults 15+", value: totalAdults15.toLocaleString() },
              { label: "Avg Dist. FLHF", value: `${avgDistKm} km` },
            ].map(kpi => (
              <Card key={kpi.label} className="border-border/40 shadow-sm">
                <CardContent className="p-2.5 text-center">
                  <p className="text-[9px] text-muted-foreground font-medium uppercase tracking-wide">{kpi.label}</p>
                  <p className="text-sm font-bold tabular-nums text-foreground mt-0.5">{kpi.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Row 3: Breakdown panels — Accessibility, Security, Terrain, CDD (click to filter) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Accessibility */}
            <Card className="border-border/40 shadow-sm">
              <CardContent className="p-3">
                <div className="flex items-center justify-between mb-2.5">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                    <span className="inline-block w-2 h-2 rounded-full" style={{ background: "hsl(142, 60%, 35%)" }} />
                    <span id="disagg-accessibility">Accessibility</span>
                  </p>
                  {filterAccessibility !== "all" && (
                    <button onClick={() => setFilterAccessibility("all")} className="text-[9px] text-primary hover:underline">Clear</button>
                  )}
                </div>
                <div className="space-y-2">
                  {[
                    { key: "accessible", label: "Accessible", count: accessStats.accessible, color: "hsl(142, 60%, 35%)" },
                    { key: "hard_to_reach", label: "Hard to Reach", count: accessStats.hard_to_reach, color: "hsl(45, 80%, 50%)" },
                    { key: "inaccessible", label: "Inaccessible", count: accessStats.inaccessible, color: "hsl(0, 70%, 50%)" },
                    { key: "seasonal", label: "Seasonal", count: accessStats.seasonal, color: "hsl(262, 50%, 55%)" },
                    { key: "unset", label: "Not Set", count: accessStats.unset, color: "hsl(220, 10%, 70%)" },
                  ].map(item => {
                    const active = filterAccessibility === item.key;
                    return (
                      <button
                        key={item.label}
                        onClick={() => { setFilterAccessibility(active ? "all" : item.key); setDrillOrigin(active ? null : "accessibility"); }}
                        className={`w-full flex items-center gap-2 text-xs px-1.5 py-1 rounded transition-colors ${active ? "bg-primary/10 ring-1 ring-primary/40" : "hover:bg-muted/50"}`}
                      >
                        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: item.color }} />
                        <span className="flex-1 text-left text-foreground">{item.label}</span>
                        <span className="font-bold tabular-nums text-foreground">{item.count}</span>
                        <div className="w-14 h-2 bg-muted rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all" style={{ width: `${filtered.length ? (item.count / filtered.length) * 100 : 0}%`, background: item.color }} />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Security */}
            <Card className="border-border/40 shadow-sm">
              <CardContent className="p-3">
                <div className="flex items-center justify-between mb-2.5">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                    <span className="inline-block w-2 h-2 rounded-full" style={{ background: "hsl(215, 70%, 40%)" }} />
                    <span id="disagg-security">Security Clearance</span>
                  </p>
                  {filterSecurity !== "all" && (
                    <button onClick={() => setFilterSecurity("all")} className="text-[9px] text-primary hover:underline">Clear</button>
                  )}
                </div>
                <div className="space-y-2">
                  {[
                    { key: "cleared", label: "Cleared", count: securityStats.cleared, color: "hsl(142, 60%, 35%)" },
                    { key: "partial", label: "Partial", count: securityStats.partial, color: "hsl(45, 80%, 50%)" },
                    { key: "not_cleared", label: "Not Cleared", count: securityStats.not_cleared, color: "hsl(0, 70%, 50%)" },
                    { key: "unknown", label: "Unknown", count: securityStats.unknown, color: "hsl(220, 10%, 70%)" },
                  ].map(item => {
                    const active = filterSecurity === item.key;
                    return (
                      <button
                        key={item.label}
                        onClick={() => { setFilterSecurity(active ? "all" : item.key); setDrillOrigin(active ? null : "security"); }}
                        className={`w-full flex items-center gap-2 text-xs px-1.5 py-1 rounded transition-colors ${active ? "bg-primary/10 ring-1 ring-primary/40" : "hover:bg-muted/50"}`}
                      >
                        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: item.color }} />
                        <span className="flex-1 text-left text-foreground">{item.label}</span>
                        <span className="font-bold tabular-nums text-foreground">{item.count}</span>
                        <div className="w-14 h-2 bg-muted rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all" style={{ width: `${filtered.length ? (item.count / filtered.length) * 100 : 0}%`, background: item.color }} />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Terrain */}
            <Card className="border-border/40 shadow-sm">
              <CardContent className="p-3">
                <div className="flex items-center justify-between mb-2.5">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                    <span className="inline-block w-2 h-2 rounded-full" style={{ background: "hsl(25, 70%, 45%)" }} />
                    <span id="disagg-terrain">Terrain Types</span>
                  </p>
                  {filterTerrain !== "all" && (
                    <button onClick={() => setFilterTerrain("all")} className="text-[9px] text-primary hover:underline">Clear</button>
                  )}
                </div>
                <div className="space-y-2">
                  {Object.entries(terrainCounts).sort((a, b) => b[1] - a[1]).map(([terrain, count]) => {
                    const active = filterTerrain === terrain;
                    return (
                      <button
                        key={terrain}
                        onClick={() => { setFilterTerrain(active ? "all" : terrain); setDrillOrigin(active ? null : "terrain"); }}
                        className={`w-full flex items-center gap-2 text-xs px-1.5 py-1 rounded transition-colors ${active ? "bg-primary/10 ring-1 ring-primary/40" : "hover:bg-muted/50"}`}
                      >
                        <span className="flex-shrink-0 text-sm">{TERRAIN_EMOJI[terrain] || "❓"}</span>
                        <span className="flex-1 text-left capitalize text-foreground">{terrain === "unset" ? "Not Set" : terrain}</span>
                        <span className="font-bold tabular-nums text-foreground">{count}</span>
                        <div className="w-14 h-2 bg-muted rounded-full overflow-hidden">
                          <div className="h-full rounded-full bg-primary/60 transition-all" style={{ width: `${filtered.length ? (count / filtered.length) * 100 : 0}%` }} />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Disability Types — clickable population disaggregation */}
            <Card className="border-border/40 shadow-sm">
              <CardContent className="p-3">
                <div className="flex items-center justify-between mb-2.5">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                    <span className="inline-block w-2 h-2 rounded-full" style={{ background: "hsl(262, 55%, 52%)" }} />
                    <span id="disagg-disability">Disability Types</span>
                  </p>
                  {filterDisability !== "all" && (
                    <button onClick={() => setFilterDisability("all")} className="text-[9px] text-primary hover:underline">Clear</button>
                  )}
                </div>
                <div className="flex items-baseline justify-between mb-2">
                  <span className="text-[10px] text-muted-foreground">Total persons with disability</span>
                  <span className="text-sm font-bold tabular-nums text-foreground">{totalPwd.toLocaleString()}</span>
                </div>
                <div className="space-y-2">
                  {DISABILITY_TYPES.map((d) => {
                    const stat = disabilityStats[d.key] || { pop: 0, communities: 0 };
                    const active = filterDisability === d.key;
                    const share = totalPwd > 0 ? (stat.pop / totalPwd) * 100 : 0;
                    return (
                      <button
                        key={d.key}
                        onClick={() => { setFilterDisability(active ? "all" : d.key); setDrillOrigin(active ? null : "disability"); setActiveView("list"); }}
                        title={`${stat.communities} communities reporting ${d.label}`}
                        className={`w-full flex items-center gap-2 text-xs px-1.5 py-1 rounded transition-colors ${active ? "bg-primary/10 ring-1 ring-primary/40" : "hover:bg-muted/50"}`}
                      >
                        <span
                          className="flex-shrink-0 flex items-center justify-center h-6 w-6 rounded-md"
                          style={{ background: `${d.color}1A` }}
                        >
                          <d.icon className="h-3.5 w-3.5" style={{ color: d.color }} />
                        </span>
                        <span className="flex-1 text-left text-foreground">{d.label}</span>
                        <span className="font-bold tabular-nums text-foreground">{stat.pop.toLocaleString()}</span>
                        <span className="text-[9px] text-muted-foreground tabular-nums w-14 text-right">{stat.communities} comm.</span>
                        <div className="w-14 h-2 bg-muted rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all" style={{ width: `${share}%`, background: d.color }} />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </CardContent>
            </Card>


            {/* CDD & Key Ratios */}
            <Card className="border-border/40 shadow-sm">
              <CardContent className="p-3">
                <div className="flex items-center justify-between mb-2.5">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                    <span className="inline-block w-2 h-2 rounded-full" style={{ background: "hsl(262, 50%, 50%)" }} />
                    <span id="disagg-keyRatio">Key Ratios</span>
                  </p>
                  {filterKeyRatio !== "all" && (
                    <button onClick={() => setFilterKeyRatio("all")} className="text-[9px] text-primary hover:underline">Clear</button>
                  )}
                </div>
                <div className="space-y-3">
                  <button
                    onClick={() => { const on = filterKeyRatio === "cdd_from_community"; setFilterKeyRatio(on ? "all" : "cdd_from_community"); setDrillOrigin(on ? null : "keyRatio"); }}
                    className={`w-full text-left p-1.5 rounded transition-colors ${filterKeyRatio === "cdd_from_community" ? "bg-primary/10 ring-1 ring-primary/40" : "hover:bg-muted/50"}`}
                  >
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-muted-foreground">CDD from Community</span>
                      <span className="font-bold" style={{ color: cddPct >= 70 ? "hsl(142, 60%, 35%)" : cddPct >= 40 ? "hsl(45, 80%, 45%)" : "hsl(0, 65%, 48%)" }}>
                        {cddPct.toFixed(0)}%
                      </span>
                    </div>
                    <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${cddPct}%`, background: cddPct >= 70 ? "hsl(142, 60%, 35%)" : cddPct >= 40 ? "hsl(45, 80%, 45%)" : "hsl(0, 65%, 48%)" }} />
                    </div>
                    <p className="text-[9px] text-muted-foreground mt-0.5">{cddFromCommunity} of {filtered.length} communities</p>
                  </button>
                  <button
                    onClick={() => { const on = filterKeyRatio === "hard_to_reach"; setFilterKeyRatio(on ? "all" : "hard_to_reach"); setDrillOrigin(on ? null : "keyRatio"); }}
                    className={`w-full text-left p-1.5 rounded transition-colors ${filterKeyRatio === "hard_to_reach" ? "bg-primary/10 ring-1 ring-primary/40" : "hover:bg-muted/50"}`}
                  >
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-muted-foreground">Hard to Reach</span>
                      <span className="font-bold" style={{ color: "hsl(45, 80%, 45%)" }}>{hardToReach}</span>
                    </div>
                    <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${filtered.length ? (hardToReach / filtered.length) * 100 : 0}%`, background: "hsl(45, 80%, 45%)" }} />
                    </div>
                  </button>
                  <div className="p-1.5">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-muted-foreground">Avg HH/Community</span>
                      <span className="font-bold text-foreground">{avgHouseholdsPerCommunity}</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>


          {/* Drill-through breadcrumb trail */}
          <DrillBreadcrumb
            crumbs={drillCrumbs}
            origin={drillOrigin}
            onBack={backToDisaggregation}
            onReset={drillCrumbs.length ? () => {
              setFilterAccessibility("all"); setFilterSecurity("all"); setFilterTerrain("all");
              setFilterKeyRatio("all"); setFilterDisability("all");
              if (!lensLockWard) setFilterWard("all");
              setDrillOrigin(null);
            } : undefined}
          />

          {/* Active indicator-filter reset bar */}
          {(filterAccessibility !== "all" || filterSecurity !== "all" || filterTerrain !== "all" || filterKeyRatio !== "all" || filterDisability !== "all") && (
            <div className="flex items-center gap-2 flex-wrap rounded-md border border-primary/30 bg-primary/5 px-3 py-2">
              <span className="text-xs font-medium text-primary">Indicator filter active:</span>
              {filterAccessibility !== "all" && <span className="text-[11px] rounded bg-background px-2 py-0.5 border">Accessibility: {filterAccessibility}</span>}
              {filterSecurity !== "all" && <span className="text-[11px] rounded bg-background px-2 py-0.5 border">Security: {filterSecurity}</span>}
              {filterTerrain !== "all" && <span className="text-[11px] rounded bg-background px-2 py-0.5 border">Terrain: {filterTerrain}</span>}
              {filterKeyRatio !== "all" && <span className="text-[11px] rounded bg-background px-2 py-0.5 border">Key Ratio: {filterKeyRatio}</span>}
              {filterDisability !== "all" && <span className="text-[11px] rounded bg-background px-2 py-0.5 border">Disability: {DISABILITY_TYPES.find(d => d.key === filterDisability)?.label ?? filterDisability}</span>}
              <Button
                size="sm"
                variant="outline"
                className="ml-auto h-7 text-xs gap-1"
                onClick={() => {
                  setFilterAccessibility("all");
                  setFilterSecurity("all");
                  setFilterTerrain("all");
                  setFilterKeyRatio("all");
                  setFilterDisability("all");
                }}
              >
                <X className="h-3.5 w-3.5" /> Reset filters
              </Button>
            </div>
          )}

          <LensScopeBanner lens={lens} />

          {/* Dashboard-wide geography archive */}
          {(isAdmin || lensEnabled) && (
            <GeoExclusionPanel
              rows={scopedEntries as any[]}
              getPop={(r: any) => Number(r?.estimated_total_population) || 0}
              archived={dashExcl.archived}
              keys={dashExcl.keys}
              exclude={dashExcl.exclude}
              restore={dashExcl.restore}
              restoreAll={dashExcl.restoreAll}
              undo={dashExcl.undo}
              redo={dashExcl.redo}
              reset={dashExcl.reset}
              canUndo={dashExcl.canUndo}
              canRedo={dashExcl.canRedo}
              disabled={lensReadOnly}
              title="Dashboard coverage — drop LGAs or wards"
              subtitle="Archive geographies to remove them from every KPI, chart, table and export on this page. Nothing is deleted — restore them any time to bring the figures back."
            />
          )}

          {/* Complete project data — WHO / Nigeria NTD standard table + export */}
          <ProjectDataTable
            entries={displayEntries as any[]}
            projectName={projects.find((p) => p.id === selectedProjectId)?.name || "All projects"}
            scopeLabel={filterScopeLabel(filterContext)}
            campaignLabel={filterContext.campaign}
            exclusions={dashExcl.archived.map((a) => ({ level: a.level, state: a.state, lga: a.lga, ward: a.ward }))}
          />




          {/* Filters & View Toggle */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search communities, FLHF..." className="pl-8 h-8 text-xs" />
            </div>
            <Select value={filterState} disabled={lensLockState} onValueChange={(value) => { setFilterState(value); setFilterLga("all"); setFilterWard("all"); }}>
              <SelectTrigger className="w-[130px] h-8 text-xs"><SelectValue placeholder="All States" /></SelectTrigger>
              <SelectContent>
                {!lensLockState && <SelectItem value="all">All States</SelectItem>}
                {uniqueStates.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterLga} disabled={lensLockLga} onValueChange={(value) => { setFilterLga(value); setFilterWard("all"); }}>
              <SelectTrigger className="w-[130px] h-8 text-xs"><SelectValue placeholder="All LGAs" /></SelectTrigger>
              <SelectContent>
                {!lensLockLga && <SelectItem value="all">All LGAs</SelectItem>}
                {uniqueLgas.map((lga) => <SelectItem key={lga} value={lga}>{lga}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterWard} disabled={lensLockWard} onValueChange={setFilterWard}>
              <SelectTrigger className="w-[130px] h-8 text-xs"><SelectValue placeholder="All Wards" /></SelectTrigger>
              <SelectContent>
                {!lensLockWard && <SelectItem value="all">All Wards</SelectItem>}
                {uniqueWards.map((ward) => <SelectItem key={ward} value={ward}>{ward}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterAccessibility} onValueChange={setFilterAccessibility}>
              <SelectTrigger className="w-[140px] h-8 text-xs"><SelectValue placeholder="Accessibility" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Access</SelectItem>
                <SelectItem value="accessible">Accessible</SelectItem>
                <SelectItem value="hard_to_reach">Hard to Reach</SelectItem>
                <SelectItem value="inaccessible">Inaccessible</SelectItem>
                <SelectItem value="seasonal">Seasonal</SelectItem>
              </SelectContent>
            </Select>
            {/* Analytics/dashboard tabs are admin-only. Non-admin project members
                only see their own submitted entries (Planning list) and the form. */}
            {(isAdmin || lensEnabled) && (
              <div className="flex border border-border rounded-lg overflow-hidden">
                {canOpenView("list") && (<Button variant={activeView === "list" ? "default" : "ghost"} size="sm" className="rounded-none h-8 gap-1" onClick={() => setActiveView("list")}>
                  <List className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline text-xs">Planning</span>
                </Button>)}
                {canOpenView("medicine") && (<Button variant={activeView === "medicine" ? "default" : "ghost"} size="sm" className="rounded-none h-8 gap-1" onClick={() => setActiveView("medicine")}>
                  <Pill className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline text-xs">Medicine</span>
                </Button>)}
                {canOpenView("coverage") && (<Button variant={activeView === "coverage" ? "default" : "ghost"} size="sm" className="rounded-none h-8 gap-1" onClick={() => setActiveView("coverage")}>
                  <Activity className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline text-xs">Coverage</span>
                </Button>)}
                {canOpenView("reconciliation") && (<Button variant={activeView === "reconciliation" ? "default" : "ghost"} size="sm" className="rounded-none h-8 gap-1" onClick={() => setActiveView("reconciliation")}>
                  <Heart className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline text-xs">Reconciliation</span>
                </Button>)}
                {canOpenView("gaps") && (<Button variant={activeView === "gaps" ? "default" : "ghost"} size="sm" className="rounded-none h-8 gap-1" onClick={() => setActiveView("gaps")}>
                  <Target className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline text-xs">Gaps</span>
                </Button>)}
                {canOpenView("map") && (<Button variant={activeView === "map" ? "default" : "ghost"} size="sm" className="rounded-none h-8 gap-1" onClick={() => setActiveView("map")}>
                  <MapIcon className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline text-xs">Map</span>
                </Button>)}
                {canOpenView("routes") && (<Button variant={activeView === "routes" ? "default" : "ghost"} size="sm" className="rounded-none h-8 gap-1" onClick={() => setActiveView("routes")}>
                  <Navigation className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline text-xs">Routes</span>
                </Button>)}
                {canOpenView("historical") && (<Button variant={activeView === "historical" ? "default" : "ghost"} size="sm" className="rounded-none h-8 gap-1" onClick={() => setActiveView("historical")}>
                  <HistoryIcon className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline text-xs">Historical</span>
                </Button>)}
                {canOpenView("summary") && (<Button variant={activeView === "summary" ? "default" : "ghost"} size="sm" className="rounded-none h-8 gap-1" onClick={() => setActiveView("summary")}>
                  <LayersIcon className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline text-xs">Summary</span>
                </Button>)}
              </div>
            )}
            {(isAdmin || (lensEnabled && lens?.can_export)) && (
              <MdaLensExportButton
                title="Geo Microplanning — Scoped Export"
                scopeLabel={lensScopeLabel}
                sheetName="Microplan"
                columns={lensExportColumns}
                rows={filtered as unknown as Record<string, unknown>[]}
              />
            )}
            {canManageAccess && (
              <Button size="sm" variant="outline" className="h-8 text-xs gap-1" onClick={() => setShowDesignationManager(true)}>
                <ShieldCheck className="h-3.5 w-3.5" /> Designations
              </Button>
            )}
            {canManageAccess && (
              <Button size="sm" variant="outline" className="h-8 text-xs gap-1" onClick={() => setShowHistoryDialog(true)}>
                <HistoryIcon className="h-3.5 w-3.5" /> Allocation History
              </Button>
            )}
          </div>

          {/* Export / Import bar */}
          <div className="flex items-center gap-2 flex-wrap">
            <Button size="sm" variant="outline" onClick={() => handleExportTemplate(false)}>
              <FileSpreadsheet className="h-3.5 w-3.5 mr-1" /> Download Blank Template
            </Button>
            <Button size="sm" variant="outline" onClick={() => handleExportTemplate(true)} disabled={entries.length === 0}>
              <Download className="h-3.5 w-3.5 mr-1" /> Export Data as Template
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" disabled={filtered.length === 0} className="gap-1">
                  <Download className="h-3.5 w-3.5" /> Export Current Filter ({filtered.length.toLocaleString()})
                  <ChevronDown className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-72">
                <DropdownMenuLabel className="text-[11px]">Excel export — duplicates flagged</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => {
                    const r = exportFilteredMicroplan(filtered as Record<string, unknown>[], exportFilterContext, { duplicateMode: "all" });
                    toast({ title: `\u2705 Exported ${r.count.toLocaleString()} records`, description: `${r.fileName} \u2022 ${r.duplicatesFlagged.toLocaleString()} duplicate rows flagged` });
                  }}
                >
                  <div className="flex flex-col">
                    <span className="text-xs font-medium">All records</span>
                    <span className="text-[10px] text-muted-foreground">Includes duplicates, each labelled in a “Duplicates Flagged” column</span>
                  </div>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    const r = exportFilteredMicroplan(filtered as Record<string, unknown>[], exportFilterContext, { duplicateMode: "kept" });
                    toast({ title: `\u2705 Exported ${r.count.toLocaleString()} records`, description: `${r.fileName} \u2022 ${r.removed.toLocaleString()} duplicate copies excluded` });
                  }}
                >
                  <div className="flex flex-col">
                    <span className="text-xs font-medium">Non-duplicate kept set only</span>
                    <span className="text-[10px] text-muted-foreground">Removes exact-population repeats; population conflicts are kept for review</span>
                  </div>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <span className="text-[10px] text-muted-foreground max-w-[280px] truncate" title={filterScopeLabel(exportFilterContext)}>
              {filterScopeLabel(exportFilterContext)}
            </span>
            <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={importing || !selectedProjectId}>
              <Upload className="h-3.5 w-3.5 mr-1" /> {importing ? "Importing..." : "Import Template"}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={handleImport}
            />
          </div>

          {/* Map View */}
          {activeView === "map" && (
            <MicroplanMap
              entries={filtered}
              onEntryClick={(id) => {
                if (lensReadOnly) { blockLensWrite(); return; }
                const entry = entries.find(e => e.id === id);
                if (entry) { setEditingEntry(entry); setShowForm(true); }
              }}
            />
          )}

          {/* List View */}
          {activeView === "list" && (
            <AdminListView
              entries={filtered}
              loading={loading}
              onEdit={(entry) => { if (lensReadOnly) { blockLensWrite(); return; } setEditingEntry(entry); setShowForm(true); }}
              onDelete={handleDelete}
              onBulkDelete={handleBulkDelete}

              readOnly={lensReadOnly}
              onGpsResolved={(id, patch) =>
                setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)))
              }
            />
          )}

          {/* Medicine Allocation View */}
          {activeView === "medicine" && (
            <>
            <GeoMedicineAllocationTable
              rows={medicineSourceEntries as any[]}
              getTargetPop={getTargetPop}
              scopeLabel={`${allLgasForMedicine.length} LGA(s) in view`}
              projectName={projects.find((p) => p.id === selectedProjectId)?.name}
              targetPopBasis={uploadedMedEntries.length > 0 ? `Uploaded total population × ${medTargetPct}%` : "Microplan target population"}
              readOnly={lensReadOnly}
              scopeId={selectedProjectId || "all"}

            />
            <Card className="border-border/50">

              <CardContent className="p-4 space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <Pill className="h-5 w-5 text-emerald-600" />
                    <h2 className="text-sm font-bold text-foreground">Medicine Allocation by LGA</h2>
                  </div>
                  {medicineAllocationData.length > 0 && (
                    <div className="flex items-center gap-1.5">
                      <Button size="sm" variant="outline" className="h-7 text-[10px] gap-1" onClick={exportMedicineCSV}>
                        <Download className="h-3 w-3" /> CSV
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 text-[10px] gap-1" onClick={exportMedicineExcel}>
                        <FileSpreadsheet className="h-3 w-3" /> Excel
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 text-[10px] gap-1" onClick={exportMedicinePDF}>
                        <Download className="h-3 w-3" /> PDF
                      </Button>
                    </div>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Add one or more LGAs with their allocated medicine quantities and the JRSM target (people to be treated). Both values are proportionally distributed across communities/settlements based on target population. The drug-per-person ratio should remain between <strong>2.5 and 3.0</strong>.
                </p>

                {/* Upload & Compute panel */}
                <div className="rounded-lg border border-emerald-300/60 bg-gradient-to-br from-emerald-50/70 to-background dark:from-emerald-950/20 p-3 space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-base">📤</span>
                    <h3 className="text-xs font-bold text-foreground">Upload & Compute Target Population</h3>
                    {uploadedMedEntries.length > 0 && (
                      <Badge className="text-[10px] bg-emerald-600 hover:bg-emerald-600">
                        {uploadedMedEntries.length.toLocaleString()} rows · {uploadedMedEntries.reduce((s, e) => s + e.estimated_total_population, 0).toLocaleString()} pop
                      </Badge>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Upload a simple sheet with <strong>Year, State, LGA, Ward, FLHF, Community or Settlement, Total Population</strong>. The target population is computed automatically and the medicine you enter per LGA is broken down across every community/settlement.
                  </p>
                  {/* Target % of total population */}
                  <div className="rounded-md border border-amber-300/60 bg-amber-50/70 dark:bg-amber-950/20 px-3 py-2 flex items-center gap-3 flex-wrap">
                    <Target className="h-4 w-4 text-amber-600 shrink-0" />
                    <div className="flex-1 min-w-[180px]">
                      <p className="text-[11px] font-semibold text-amber-800 dark:text-amber-300">Target population = % of Total Population</p>
                      <p className="text-[10px] text-amber-700/80 dark:text-amber-400/80">Set the share of the uploaded total population that should be treated as the target (e.g. 100% for whole community, or your eligible-cohort %).</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Input
                        type="number"
                        value={medTargetPct}
                        onChange={(e) => {
                          const v = parseFloat(e.target.value);
                          setMedTargetPct(Number.isFinite(v) ? Math.min(100, Math.max(0, v)) : 0);
                        }}
                        className="h-8 w-20 text-xs text-center font-bold"
                        min={0}
                        max={100}
                        step={0.5}
                      />
                      <span className="text-sm font-bold text-amber-700">%</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1" onClick={() => exportMedicineUploadTemplate()}>
                      <FileSpreadsheet className="h-3 w-3" /> Download Upload Template
                    </Button>
                    <Button size="sm" className="h-7 text-[11px] gap-1 bg-emerald-600 hover:bg-emerald-700" onClick={() => medUploadRef.current?.click()} disabled={uploadingMed}>
                      <Upload className="h-3 w-3" /> {uploadingMed ? `Computing… ${uploadProgress}%` : "Upload Population Data"}
                    </Button>
                    {uploadedMedEntries.length > 0 && !uploadingMed && (
                      <Button size="sm" variant="ghost" className="h-7 text-[11px] gap-1 text-destructive" onClick={clearMedicineUpload}>
                        <X className="h-3 w-3" /> Clear upload
                      </Button>
                    )}
                    <input
                      ref={medUploadRef}
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      className="hidden"
                      onChange={handleMedicineUpload}
                    />
                  </div>
                  {uploadedMedEntries.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-[10px] text-emerald-700 dark:text-emerald-400">
                        ✓ Breakdown is using your uploaded data. Clear the upload to switch back to saved microplan entries.
                      </p>

                      {/* Side-by-side preview: computed target population + duplicate highlighting */}
                      <div className="rounded-lg border bg-background overflow-hidden">
                        <div className="flex items-center justify-between gap-2 px-3 py-2 bg-muted/40 border-b flex-wrap">
                          <h4 className="text-[11px] font-bold text-foreground">Preview & duplicate check</h4>
                          <div className="flex items-center gap-3 text-[10px] flex-wrap">
                            <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-emerald-500" /> New ({adoptionStats.newCount.toLocaleString()})</span>
                            <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-amber-500" /> Duplicate ({(adoptionStats.dupeCount + adoptionStats.internalDupes).toLocaleString()})</span>
                          </div>
                        </div>
                        <div className="max-h-72 overflow-auto">
                          <table className="w-full text-[10px] border-collapse">
                            <thead className="sticky top-0 z-10 bg-background">
                              <tr className="text-left text-muted-foreground">
                                <th className="px-2 py-1.5 font-semibold border-b">#</th>
                                <th className="px-2 py-1.5 font-semibold border-b">State</th>
                                <th className="px-2 py-1.5 font-semibold border-b">LGA</th>
                                <th className="px-2 py-1.5 font-semibold border-b">Ward</th>
                                <th className="px-2 py-1.5 font-semibold border-b">FLHF</th>
                                <th className="px-2 py-1.5 font-semibold border-b">Community</th>
                                <th className="px-2 py-1.5 font-semibold border-b text-right">Total Pop</th>
                                <th className="px-2 py-1.5 font-semibold border-b text-right">Target Pop</th>
                                <th className="px-2 py-1.5 font-semibold border-b">Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {uploadPreviewRows.slice(0, 500).map((p, i) => (
                                <tr
                                  key={i}
                                  className={p.isDup ? "bg-amber-50/80 dark:bg-amber-950/20" : "even:bg-muted/20"}
                                >
                                  <td className="px-2 py-1 border-b text-muted-foreground">{i + 1}</td>
                                  <td className="px-2 py-1 border-b">{p.row.state}</td>
                                  <td className="px-2 py-1 border-b">{p.row.lga}</td>
                                  <td className="px-2 py-1 border-b">{p.row.ward}</td>
                                  <td className="px-2 py-1 border-b">{p.row.flhf_name}</td>
                                  <td className="px-2 py-1 border-b">{p.row.community_name}</td>
                                  <td className="px-2 py-1 border-b text-right tabular-nums">{p.row.estimated_total_population.toLocaleString()}</td>
                                  <td className="px-2 py-1 border-b text-right tabular-nums font-semibold text-emerald-700 dark:text-emerald-400">{p.targetPop.toLocaleString()}</td>
                                  <td className="px-2 py-1 border-b">
                                    {p.existingMatch ? (
                                      <Badge variant="outline" className="text-[9px] border-amber-400 text-amber-700 bg-amber-50">Matches existing</Badge>
                                    ) : p.internalDup ? (
                                      <Badge variant="outline" className="text-[9px] border-amber-400 text-amber-700 bg-amber-50">Dup in file</Badge>
                                    ) : (
                                      <Badge variant="outline" className="text-[9px] border-emerald-400 text-emerald-700 bg-emerald-50">New</Badge>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        {uploadPreviewRows.length > 500 && (
                          <div className="px-3 py-1.5 text-[10px] text-muted-foreground border-t bg-muted/30">
                            Showing first 500 of {uploadPreviewRows.length.toLocaleString()} rows. All rows are processed on adoption.
                          </div>
                        )}
                      </div>

                      {isAdmin && (
                        <Button
                          size="sm"
                          className="h-8 text-[11px] gap-1 bg-gradient-to-r from-indigo-600 via-purple-600 to-fuchsia-600 hover:opacity-90 text-white shadow-md"
                          onClick={() => setShowAdoptDialog(true)}
                        >
                          <Building2 className="h-3.5 w-3.5" /> Use as Project Microplan Data…
                        </Button>
                      )}
                    </div>
                  )}
                </div>
                {renderAdoptDialog()}

                {/* Upload Allocation Plan panel — fully automates allocation */}
                <div className="rounded-lg border border-indigo-300/60 bg-gradient-to-br from-indigo-50/70 to-background dark:from-indigo-950/20 p-3 space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-base">🧮</span>
                    <h3 className="text-xs font-bold text-foreground">Upload Allocation Plan (auto-allocate)</h3>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Upload a sheet with <strong>State, LGA, Ward, SAC Requiring PC (JRSM-Target People), Medicine Allocated by Ward, Medicine Allocated by LGA</strong>. The app builds every allocation automatically — no need to select the LGA, drill down to the ward, or type the medicine/JRSM. Then download the allocation &amp; expected treatment per community below.
                  </p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1" onClick={() => exportAllocationPlanTemplate()}>
                      <FileSpreadsheet className="h-3 w-3" /> Download Allocation Template
                    </Button>
                    <Button size="sm" className="h-7 text-[11px] gap-1 bg-indigo-600 hover:bg-indigo-700" onClick={() => allocUploadRef.current?.click()} disabled={uploadingAlloc}>
                      <Upload className="h-3 w-3" /> {uploadingAlloc ? "Building…" : "Upload Allocation Plan"}
                    </Button>
                    <input
                      ref={allocUploadRef}
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      className="hidden"
                      onChange={handleAllocationPlanUpload}
                    />
                  </div>
                </div>

                {/* Validation: allocations exceeding target population at chosen depth */}
                {allocationWarnings.length > 0 && (
                  <div className="rounded-lg border-2 border-red-400/70 bg-red-50/80 dark:bg-red-950/20 p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-base">🚫</span>
                      <h3 className="text-xs font-bold text-red-700 dark:text-red-400">
                        {allocationWarnings.length} allocation{allocationWarnings.length > 1 ? "s" : ""} exceed the target population
                      </h3>
                    </div>
                    <p className="text-[11px] text-red-700/90 dark:text-red-300/90">
                      The JRSM target (people to treat) cannot be larger than the target population available at the chosen depth. Reduce the target(s) below before saving.
                    </p>
                    <div className="overflow-auto rounded-md border border-red-300/60 bg-background">
                      <table className="w-full text-[10px] border-collapse">
                        <thead>
                          <tr className="text-left text-muted-foreground bg-red-100/50 dark:bg-red-950/30">
                            <th className="px-2 py-1.5 font-semibold border-b">LGA</th>
                            <th className="px-2 py-1.5 font-semibold border-b">Ward</th>
                            <th className="px-2 py-1.5 font-semibold border-b">FLHF</th>
                            <th className="px-2 py-1.5 font-semibold border-b">Depth</th>
                            <th className="px-2 py-1.5 font-semibold border-b text-right">JRSM Target</th>
                            <th className="px-2 py-1.5 font-semibold border-b text-right">Target Pop</th>
                            <th className="px-2 py-1.5 font-semibold border-b text-right">Over by</th>
                          </tr>
                        </thead>
                        <tbody>
                          {allocationWarnings.map((w, i) => (
                            <tr key={i} className="even:bg-red-50/40 dark:even:bg-red-950/10">
                              <td className="px-2 py-1 border-b">{w.lga}</td>
                              <td className="px-2 py-1 border-b">{w.ward}</td>
                              <td className="px-2 py-1 border-b">{w.flhf}</td>
                              <td className="px-2 py-1 border-b">{w.depth}</td>
                              <td className="px-2 py-1 border-b text-right tabular-nums font-semibold">{w.jrsm.toLocaleString()}</td>
                              <td className="px-2 py-1 border-b text-right tabular-nums">{w.targetPop.toLocaleString()}</td>
                              <td className="px-2 py-1 border-b text-right tabular-nums font-bold text-red-600">+{w.over.toLocaleString()}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Wards imported from population data but missing from the allocation plan */}
                {missingAllocationWards.length > 0 && (
                  <div className="rounded-lg border-2 border-amber-400/70 bg-gradient-to-br from-amber-50/90 to-orange-50/70 dark:from-amber-950/30 dark:to-orange-950/20 p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2">
                        <span className="text-base">🧭</span>
                        <h3 className="text-xs font-bold text-amber-800 dark:text-amber-300">
                          {missingAllocationWards.length} ward{missingAllocationWards.length > 1 ? "s" : ""} in your population data {missingAllocationWards.length > 1 ? "are" : "is"} not in the allocation plan
                        </h3>
                      </div>
                      <Button
                        size="sm"
                        className="h-7 text-xs gap-1 bg-amber-600 hover:bg-amber-700 text-white"
                        onClick={addAllMissingWardRows}
                      >
                        ➕ Add all to allocation table
                      </Button>
                    </div>
                    <p className="text-[11px] text-amber-800/90 dark:text-amber-300/90">
                      These wards were imported by <strong>Upload Population Data</strong> but no matching row exists in the
                      <strong> Allocation Plan</strong>. Add them to the table below and type their medicine &amp; JRSM target so they spread to their communities.
                    </p>
                    <div className="overflow-auto rounded-md border border-amber-300/60 bg-background max-h-56">
                      <table className="w-full text-[10px] border-collapse">
                        <thead className="sticky top-0">
                          <tr className="text-left text-muted-foreground bg-amber-100/60 dark:bg-amber-950/40">
                            <th className="px-2 py-1.5 font-semibold border-b">LGA</th>
                            <th className="px-2 py-1.5 font-semibold border-b">Ward</th>
                            <th className="px-2 py-1.5 font-semibold border-b text-right">Communities</th>
                            <th className="px-2 py-1.5 font-semibold border-b text-right">Target Pop</th>
                            <th className="px-2 py-1.5 font-semibold border-b text-right">Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {missingAllocationWards.map((m, i) => (
                            <tr key={`${m.lga}-${m.ward}-${i}`} className="even:bg-amber-50/40 dark:even:bg-amber-950/10">
                              <td className="px-2 py-1 border-b">{m.lga}</td>
                              <td className="px-2 py-1 border-b font-medium">{m.ward}</td>
                              <td className="px-2 py-1 border-b text-right tabular-nums">{m.communities.toLocaleString()}</td>
                              <td className="px-2 py-1 border-b text-right tabular-nums">{m.targetPop.toLocaleString()}</td>
                              <td className="px-2 py-1 border-b text-right">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-6 px-2 text-[10px] gap-1 border-amber-400 text-amber-700 hover:bg-amber-100"
                                  onClick={() => addMissingWardRow(m.lga, m.ward)}
                                >
                                  ➕ Add
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}


                {/* Multiple LGA entry rows */}
                <div className="space-y-2">
                  {medAllocEntries.map((entry, idx) => (
                    <div key={idx} className="flex items-end gap-2 flex-wrap">
                      <div className="space-y-1 flex-1 min-w-[160px]">
                        {idx === 0 && <label className="text-xs font-medium text-foreground">LGA</label>}
                        <Select value={entry.lga} onValueChange={v => updateMedAllocRow(idx, "lga", v)}>
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue placeholder="Select LGA" />
                          </SelectTrigger>
                          <SelectContent>
                            {allLgasForMedicine.map(l => (
                              <SelectItem key={l} value={l}>{l}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1 flex-1 min-w-[150px]">
                        {idx === 0 && <label className="text-xs font-medium text-foreground">Ward <span className="text-muted-foreground font-normal">(optional)</span></label>}
                        <Select
                          value={entry.ward || "__all__"}
                          onValueChange={v => updateMedAllocRow(idx, "ward", v === "__all__" ? "" : v)}
                          disabled={!entry.lga}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue placeholder="All wards" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__all__">All wards</SelectItem>
                            {wardsForLga(entry.lga).map(w => (
                              <SelectItem key={w} value={w}>{w}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1 flex-1 min-w-[150px]">
                        {idx === 0 && <label className="text-xs font-medium text-foreground">FLHF <span className="text-muted-foreground font-normal">(optional)</span></label>}
                        <Select
                          value={entry.flhf || "__all__"}
                          onValueChange={v => updateMedAllocRow(idx, "flhf", v === "__all__" ? "" : v)}
                          disabled={!entry.lga}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue placeholder="All FLHFs" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__all__">All FLHFs</SelectItem>
                            {flhfsForWard(entry.lga, entry.ward || "").map(f => (
                              <SelectItem key={f} value={f}>{f}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1 w-[140px]">
                        {idx === 0 && <label className="text-xs font-medium text-foreground">Medicine Allocated</label>}
                        <Input
                          type="number"
                          value={entry.amount}
                          onChange={e => updateMedAllocRow(idx, "amount", e.target.value)}
                          placeholder="e.g. 50000"
                          className="h-8 text-xs"
                          min={1}
                        />
                      </div>
                      <div className="space-y-1 w-[140px]">
                        {idx === 0 && <label className="text-xs font-medium text-foreground">JRSM Target (people)</label>}
                        <Input
                          type="number"
                          value={entry.jrsm || ""}
                          onChange={e => updateMedAllocRow(idx, "jrsm", e.target.value)}
                          placeholder="e.g. 18000"
                          className="h-8 text-xs"
                          min={0}
                        />
                      </div>
                      {medAllocEntries.length > 1 && (
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => removeMedAllocRow(idx)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  ))}
                  <div className="flex items-center gap-2 flex-wrap">
                    <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={addMedAllocRow}>
                      <Plus className="h-3 w-3" /> Add another LGA
                    </Button>
                    {isAdmin && (
                      <Button size="sm" className="h-7 text-xs gap-1" onClick={saveAllocations} disabled={savingAllocations || allocationWarnings.length > 0}>
                        💾 {savingAllocations ? "Saving…" : "Save Allocations"}
                      </Button>
                    )}
                    {isAdmin && (
                      <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={() => setShowHistoryDialog(true)}>
                        <HistoryIcon className="h-3 w-3" /> View History
                      </Button>
                    )}
                  </div>
                </div>

                {medicineAllocationData.length > 0 && (
                  <>
                    <Badge variant="secondary" className="text-xs px-3">
                      {medicineAllocationData.length} communities · Total medicine: {medicineAllocationData.reduce((s, r) => s + r.medicineRequired, 0).toLocaleString()} units
                    </Badge>

                    {/* JRSM Adjustment Helper */}
                    {lgaAdjustmentSuggestions.length > 0 && (
                      <div className="rounded-lg border border-border/60 bg-gradient-to-br from-amber-50/60 to-background dark:from-amber-950/20 p-3 space-y-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-base">🎯</span>
                          <h3 className="text-xs font-bold text-foreground">JRSM Adjustment Helper</h3>
                          <div className="flex items-center gap-1.5 ml-auto">
                            <Label className="text-[10px] text-muted-foreground">Target ratio</Label>
                            <Input
                              type="number"
                              step="0.1"
                              min="0.1"
                              value={targetRatioMin}
                              onChange={(e) => {
                                const v = parseFloat(e.target.value);
                                if (Number.isFinite(v) && v > 0) setTargetRatioMin(v);
                              }}
                              className="h-7 w-16 text-[11px] tabular-nums"
                              aria-label="Minimum target ratio"
                            />
                            <span className="text-[10px] text-muted-foreground">–</span>
                            <Input
                              type="number"
                              step="0.1"
                              min="0.1"
                              value={targetRatioMax}
                              onChange={(e) => {
                                const v = parseFloat(e.target.value);
                                if (Number.isFinite(v) && v > 0) setTargetRatioMax(v);
                              }}
                              className="h-7 w-16 text-[11px] tabular-nums"
                              aria-label="Maximum target ratio"
                            />
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="h-7 text-[10px] px-2"
                              onClick={() => { setTargetRatioMin(2.5); setTargetRatioMax(3.0); }}
                            >
                              Reset
                            </Button>
                          </div>
                          <span className="text-[10px] text-muted-foreground basis-full">Mid {TARGET_RATIO_MID.toFixed(2)} · suggestions update automatically{TARGET_RATIO_MIN >= TARGET_RATIO_MAX ? " · ⚠ min must be below max" : ""}</span>
                        </div>
                        <div className="grid gap-1.5">
                          {lgaAdjustmentSuggestions.map(s => {
                            const inRange = s.status === "ok";
                            return (
                              <div key={`${s.lga}-${s.idx}`} className={`flex items-center justify-between gap-2 rounded-md border p-2 text-xs ${
                                inRange ? "border-emerald-300/60 bg-emerald-50/50 dark:bg-emerald-950/20"
                                        : "border-amber-300/70 bg-amber-50/60 dark:bg-amber-950/20"
                              }`}>
                                <div className="flex-1 min-w-0">
                                  <div className="font-semibold truncate">{s.lga}</div>
                                  <div className="text-[10px] text-muted-foreground tabular-nums">
                                    Medicine {s.medicineTotal.toLocaleString()} ÷ JRSM {s.jrsmCurrent.toLocaleString()} = ratio <span className={`font-bold ${
                                      inRange ? "text-emerald-700" : s.status === "high" ? "text-red-600" : "text-amber-700"
                                    }`}>{s.ratioCurrent.toFixed(2)}</span>
                                  </div>
                                </div>
                                {inRange ? (
                                  <Badge variant="outline" className="text-[10px] border-emerald-400 text-emerald-700">In range ✓</Badge>
                                ) : (
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    <div className="text-right">
                                      <div className="text-[10px] text-muted-foreground">Suggested JRSM</div>
                                      <div className="text-xs font-bold tabular-nums">{s.jrsmSuggested.toLocaleString()}</div>
                                      <div className="text-[9px] text-muted-foreground">×{s.scaleFactor.toFixed(3)}</div>
                                    </div>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-7 text-[10px] px-2"
                                      onClick={() => applySuggestedJrsm(s.idx, s.jrsmSuggested)}
                                    >
                                      Apply
                                    </Button>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                        <p className="text-[10px] text-muted-foreground">
                          Suggestion sets JRSM = Medicine ÷ {TARGET_RATIO_MID} so the drug-per-person ratio lands at the midpoint of the safe band. Per-community shares recompute proportionally.
                        </p>
                      </div>
                    )}

                    <div className="border border-border rounded-lg overflow-hidden">
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs border-collapse">
                          <thead>
                            <tr className="bg-emerald-600 text-white">
                              <th className="px-3 py-2.5 text-left font-semibold border-r border-emerald-500">Year</th>
                              <th className="px-3 py-2.5 text-left font-semibold border-r border-emerald-500">State</th>
                              <th className="px-3 py-2.5 text-left font-semibold border-r border-emerald-500">LGA</th>
                              <th className="px-3 py-2.5 text-left font-semibold border-r border-emerald-500">Ward</th>
                              <th className="px-3 py-2.5 text-left font-semibold border-r border-emerald-500">FLHF</th>
                              <th className="px-3 py-2.5 text-left font-semibold border-r border-emerald-500">Community</th>
                              <th className="px-3 py-2.5 text-left font-semibold border-r border-emerald-500">Settlement</th>
                              <th className="px-3 py-2.5 text-right font-semibold border-r border-emerald-500">Target Pop</th>
                              <th className="px-3 py-2.5 text-right font-semibold border-r border-emerald-500">Medicine Required</th>
                              <th className="px-3 py-2.5 text-right font-semibold border-r border-emerald-500">People to Treat (JRSM)</th>
                              <th className="px-3 py-2.5 text-right font-semibold">Drug/Person Ratio</th>
                            </tr>
                          </thead>
                          <tbody>
                            {medAllocPagination.paginatedData.map((row: any, i: number) => (
                              <tr key={medAllocPagination.startIndex + i} className={`border-b border-border/50 ${i % 2 === 0 ? "bg-background" : "bg-muted/20"} hover:bg-emerald-50 dark:hover:bg-emerald-950/20 transition-colors`}>
                                <td className="px-3 py-2 border-r border-border/30">{row.year}</td>
                                <td className="px-3 py-2 border-r border-border/30">{row.state}</td>
                                <td className="px-3 py-2 border-r border-border/30 font-medium">{row.lga}</td>
                                <td className="px-3 py-2 border-r border-border/30">{row.ward}</td>
                                <td className="px-3 py-2 border-r border-border/30">{row.flhf}</td>
                                <td className="px-3 py-2 border-r border-border/30 font-medium">{row.community}</td>
                                <td className="px-3 py-2 border-r border-border/30 text-muted-foreground">{row.settlement}</td>
                                <td className="px-3 py-2 text-right border-r border-border/30 tabular-nums">{row.targetPop.toLocaleString()}</td>
                                <td className="px-3 py-2 text-right tabular-nums font-bold text-emerald-700 dark:text-emerald-400 border-r border-border/30">
                                  {row.medicineRequired.toLocaleString()}
                                  <span className="text-[9px] font-normal text-muted-foreground ml-1">({row.pct.toFixed(1)}%)</span>
                                </td>
                                <td className="px-3 py-2 text-right tabular-nums border-r border-border/30">
                                  {row.peopleToTreat > 0 ? row.peopleToTreat.toLocaleString() : <span className="text-muted-foreground">—</span>}
                                </td>
                                <td className={`px-3 py-2 text-right tabular-nums font-semibold ${
                                  row.ratioStatus === "ok" ? "text-emerald-600 dark:text-emerald-400" :
                                  row.ratioStatus === "low" ? "text-amber-600 dark:text-amber-400" :
                                  row.ratioStatus === "high" ? "text-red-600 dark:text-red-400" :
                                  "text-muted-foreground"
                                }`}>
                                  {row.peopleToTreat > 0 ? (
                                    <>
                                      {row.ratio.toFixed(2)}
                                      <span className="text-[9px] font-normal ml-1">
                                        {row.ratioStatus === "ok" ? "✓" : row.ratioStatus === "low" ? "↓ <2.5" : "↑ >3.0"}
                                      </span>
                                    </>
                                  ) : "—"}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr className="bg-emerald-700 text-white font-bold">
                              <td colSpan={7} className="px-3 py-2.5 border-r border-emerald-600">TOTAL</td>
                              <td className="px-3 py-2.5 text-right border-r border-emerald-600 tabular-nums">
                                {medAllocTotals.targetPop.toLocaleString()}
                              </td>
                              <td className="px-3 py-2.5 text-right tabular-nums border-r border-emerald-600">
                                {medAllocTotals.medicine.toLocaleString()}
                              </td>
                              <td className="px-3 py-2.5 text-right tabular-nums border-r border-emerald-600">
                                {medAllocTotals.people.toLocaleString()}
                              </td>
                              <td className="px-3 py-2.5 text-right tabular-nums">
                                {medAllocTotals.people > 0 ? medAllocTotals.ratio.toFixed(2) : "—"}
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                      {medAllocPagination.totalPages > 1 && (
                        <TablePagination
                          currentPage={medAllocPagination.currentPage}
                          totalPages={medAllocPagination.totalPages}
                          totalItems={medAllocPagination.totalItems}
                          startIndex={medAllocPagination.startIndex}
                          pageSize={medAllocPagination.pageSize}
                          hasPrev={medAllocPagination.hasPrev}
                          hasNext={medAllocPagination.hasNext}
                          onPrev={medAllocPagination.prevPage}
                          onNext={medAllocPagination.nextPage}
                        />
                      )}
                    </div>
                  </>
                )}


                {medicineAllocationData.length === 0 && medAllocEntries.every(e => !e.lga) && (
                  <div className="text-center py-12 text-muted-foreground">
                    <Pill className="h-10 w-10 mx-auto mb-3 opacity-30" />
                    <p className="text-sm font-medium">Select an LGA and enter medicine quantity</p>
                    <p className="text-xs mt-1">Medicine will be proportionally distributed based on target population</p>
                  </div>
                )}
              </CardContent>
            </Card>
            </>
          )}

          {/* Coverage View */}
          {activeView === "coverage" && (
            <CoverageView entries={displayEntries} onRefresh={fetchEntries} projectId={selectedProjectId || null} />
          )}

          {/* Reconciliation View — Balance of medicine + reversal destination */}
          {activeView === "reconciliation" && (
            <ReconciliationView
              entries={displayEntries as any}
              allocationRows={medicineAllocationData}
              onRefresh={fetchEntries}
              projectId={selectedProjectId || null}
            />
          )}

          {/* Coverage Gaps — communities/settlements with no microplan entry */}
          {activeView === "gaps" && (
            <MissingCommunitiesView
              entries={displayEntries as any}
              projectId={selectedProjectId || null}
              isInScope={scope.isInScope}
              scopeRestricted={!isAdmin && !scope.hasNoRestriction}
            />
          )}


          {/* Travel Routes View */}
          {activeView === "routes" && (
            <TravelRouteMap entries={displayEntries} />
          )}

          {/* Historical Data Review — population trend vs WorldPop/GRID3 */}
          {activeView === "historical" && (
            <HistoricalDataReview entries={displayEntries as any} />
          )}

          {/* Summary — hierarchical LGA → Ward → Health Facility rollup */}
          {activeView === "summary" && (
            <MicroplanSummaryView
              entries={filtered as any}
              readOnly={lensReadOnly}
              onRefresh={fetchEntries}
            />
          )}
        </>
      )}

      {/* Entry-only users: show their own submitted entries */}
      {entryOnly && (
        <EntryOnlyList
          entries={entries}
          loading={loading}
          onEdit={(entry) => { if (lensReadOnly) { blockLensWrite(); return; } setEditingEntry(entry); setShowForm(true); }}
          onDelete={handleDelete}
          readOnly={lensReadOnly}
        />
      )}

      {/* Designation manager (admin only) */}
      {canManageAccess && (
        <DesignationManagerDialog
          open={showDesignationManager}
          onClose={() => setShowDesignationManager(false)}
          entries={baseEntries as any}
        />
      )}

      {/* Allocation history (admin only) */}
      {canManageAccess && selectedProjectId && (
        <AllocationHistoryDialog
          open={showHistoryDialog}
          onClose={() => setShowHistoryDialog(false)}
          projectId={selectedProjectId}
        />
      )}

      {/* Entry Form Dialog */}
      <Dialog open={showForm} onOpenChange={(v) => { if (!v) { setShowForm(false); setEditingEntry(null); setDialogFullscreen(false); } }}>
        <DialogContent className={`overflow-hidden z-[9999] flex flex-col ${dialogFullscreen ? 'max-w-[100vw] w-[100vw] h-[100vh] max-h-[100vh] rounded-none m-0' : 'max-w-4xl max-h-[90vh] w-[95vw] sm:w-auto'}`}>
          <DialogHeader className="flex-shrink-0">
            <div className="flex items-center justify-between">
              <DialogTitle className="flex items-center gap-2">
                <MapPin className="h-5 w-5 text-primary" />
                {editingEntry ? "Edit Microplan Entry" : "New Microplan Entry"}
              </DialogTitle>
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDialogFullscreen(f => !f)}>
                {dialogFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              </Button>
            </div>
          </DialogHeader>
          <MicroplanEntryForm
            projectId={selectedProjectId}
            initialData={editingEntry || undefined}
            onSubmit={handleSubmit}
            onCancel={() => { setShowForm(false); setEditingEntry(null); setDialogFullscreen(false); }}
            isSubmitting={submitting}
          />
        </DialogContent>
      </Dialog>

      {/* User Access Manager Dialog - only for full access */}
      {!entryOnly && (
      <Dialog open={showAccessManager} onOpenChange={setShowAccessManager}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-primary" />
              Manage Microplanning Form Access
            </DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            Grant users access to view, create, and edit microplan entries. Admins with Microplanning page access already have full access.
          </p>

          {/* Currently granted users */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-foreground">Users with Access ({grantedUsers.length})</h3>
            <div className="max-h-[150px] overflow-y-auto space-y-1">
              {grantedUsers.length === 0 ? (
                <p className="text-xs text-muted-foreground py-2">No users have been granted access yet.</p>
              ) : grantedUsers.map(g => (
                <div key={g.id} className="flex items-center justify-between bg-muted/30 rounded px-2 py-1.5">
                  <div className="text-xs">
                    <span className="font-medium">{g.profile?.first_name} {g.profile?.last_name}</span>
                    <span className="text-muted-foreground ml-2">{g.profile?.email}</span>
                  </div>
                  <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => revokeAccess(g.id)}>
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          {/* Add users */}
          <div className="space-y-2 flex-1 overflow-hidden flex flex-col">
            <h3 className="text-xs font-semibold text-foreground">Add Users</h3>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={accessSearchQuery}
                onChange={e => setAccessSearchQuery(e.target.value)}
                placeholder="Search by name or email..."
                className="pl-8 h-8 text-xs"
              />
            </div>
            <div className="flex-1 overflow-y-auto space-y-1 max-h-[200px]">
              {availableUsers.slice(0, 50).map(u => (
                <div key={u.user_id} className="flex items-center justify-between rounded px-2 py-1.5 hover:bg-muted/30">
                  <div className="text-xs">
                    <span className="font-medium">{u.first_name} {u.last_name}</span>
                    <span className="text-muted-foreground ml-2">{u.email}</span>
                  </div>
                  <Button variant="outline" size="sm" className="h-6 text-[10px] px-2" onClick={() => grantAccess(u.user_id)}>
                    <Plus className="h-3 w-3 mr-0.5" /> Grant
                  </Button>
                </div>
              ))}
              {availableUsers.length === 0 && (
                <p className="text-xs text-muted-foreground py-2">No matching users found.</p>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
      )}

      {/* Hard delete confirmation (admins) — single and bulk */}
      <MicroplanDeleteConfirmDialog
        open={deleteTargetIds.length > 0}
        onOpenChange={(v) => { if (!v) setDeleteTargetIds([]); }}
        entries={entries.filter((e: any) => deleteTargetIds.includes(e.id))}
        busy={deleting}
        onConfirm={confirmDelete}
      />

      {/* Deletion request dialog (for non-admin owners of their entries) */}
      <MicroplanDeleteRequestDialog

        open={!!deleteRequestTarget}
        onClose={() => setDeleteRequestTarget(null)}
        entryId={deleteRequestTarget?.id ?? null}
        projectId={deleteRequestTarget?.projectId ?? null}
        entryLabel={deleteRequestTarget?.label}
        onSubmitted={fetchEntries}
      />

      {/* Delete requests review panel (admins see all; users see their own) */}
      <MicroplanDeleteRequestsPanel
        open={showDeleteRequestsPanel}
        onClose={() => { setShowDeleteRequestsPanel(false); fetchEntries(); }}
        isAdmin={isAdmin || isOwner}
      />

      <KoboSyncSettingsDialog
        open={showKoboSettings}
        onClose={() => setShowKoboSettings(false)}
        projectName={projects.find(p => p.id === selectedProjectId)?.name ?? null}
        projectStates={projectScope?.states ?? []}
      />
    </div>
  );
};

export default MicroplanningView;

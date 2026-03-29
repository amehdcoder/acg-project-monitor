import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/hooks/use-toast";
import { Plus, Map, List, Download, Upload, Search, Trash2, Edit, MapPin, Users, Building2, Filter, FileSpreadsheet, Maximize2, Minimize2, UserPlus, X, Pill, Activity, Navigation } from "lucide-react";
import MicroplanEntryForm, { MicroplanFormData } from "./MicroplanEntryForm";
import MicroplanMap from "./MicroplanMap";
import CoverageView from "./CoverageView";
import TravelRouteMap from "./TravelRouteMap";
import { DEMO_ENTRIES } from "./demoData";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";

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

const MicroplanningView = () => {
  const { user, isOwner, isSuperAdmin } = useAuth();
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
  const [filterAccessibility, setFilterAccessibility] = useState<string>("all");
  const [activeView, setActiveView] = useState<"map" | "list" | "medicine" | "coverage" | "routes">("map");
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Medicine Allocation state - multiple LGAs
  const [medAllocEntries, setMedAllocEntries] = useState<{ lga: string; amount: string }[]>([{ lga: "", amount: "" }]);

  // User access management state
  const [showAccessManager, setShowAccessManager] = useState(false);
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [grantedUsers, setGrantedUsers] = useState<any[]>([]);
  const [accessSearchQuery, setAccessSearchQuery] = useState("");
  const canManageAccess = isOwner || isSuperAdmin;

  const fetchProjects = useCallback(async () => {
    const { data } = await supabase.from("projects").select("id, name").order("name");
    setProjects(data || []);
    if (data && data.length > 0 && !selectedProjectId) {
      setSelectedProjectId(data[0].id);
    }
  }, [selectedProjectId]);

  const fetchEntries = useCallback(async () => {
    if (!selectedProjectId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("microplan_entries")
      .select("*")
      .eq("project_id", selectedProjectId)
      .order("state")
      .order("lga")
      .order("ward")
      .order("community_name");
    if (error) {
      toast({ title: "Error loading entries", description: error.message, variant: "destructive" });
    }
    setEntries(data || []);
    setLoading(false);
  }, [selectedProjectId]);

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

  const handleSubmit = async (formData: MicroplanFormData) => {
    if (!user?.id || !selectedProjectId) return;
    setSubmitting(true);
    try {
      const payload = {
        ...formData,
        project_id: selectedProjectId,
        created_by: user.id,
        updated_by: user.id,
      };

      if (editingEntry) {
        const { error } = await supabase.from("microplan_entries").update(payload).eq("id", editingEntry.id);
        if (error) throw error;
        toast({ title: "✅ Entry updated" });
      } else {
        const { error } = await supabase.from("microplan_entries").insert(payload);
        if (error) throw error;
        toast({ title: "✅ Entry added" });
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

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this microplan entry?")) return;
    const { error } = await supabase.from("microplan_entries").delete().eq("id", id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Entry deleted" });
      fetchEntries();
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

  // ---- EXPORT: Blank template or filled data ----
  const handleExportTemplate = (filled: boolean) => {
    const wb = XLSX.utils.book_new();

    // Title row
    const titleRow = ["NTDs MICROPLAN TEMPLATE"];
    const subtitleRow = ["Microplanning based on population of Communities, Settlement and catchment areas"];

    const rows: any[][] = [titleRow, subtitleRow, [], TEMPLATE_HEADERS];

    if (filled && entries.length > 0) {
      entries.forEach(entry => {
        const row = TEMPLATE_HEADERS.map(header => {
          const field = HEADER_TO_FIELD[header];
          if (!field) return "";
          const val = entry[field];
          if (field === "cdd_from_community") return val ? "Yes" : "No";
          return val ?? "";
        });
        rows.push(row);
      });
    }

    const ws = XLSX.utils.aoa_to_sheet(rows);

    // Set column widths
    ws["!cols"] = TEMPLATE_HEADERS.map(h => ({ wch: Math.max(h.length + 2, 18) }));

    // Merge title rows
    ws["!merges"] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: TEMPLATE_HEADERS.length - 1 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: TEMPLATE_HEADERS.length - 1 } },
    ];

    XLSX.utils.book_append_sheet(wb, ws, "Microplan");

    const fileName = filled
      ? `Microplan_Data_${selectedProjectId.slice(0, 8)}.xlsx`
      : `Microplan_Template_Blank.xlsx`;

    XLSX.writeFile(wb, fileName);
    toast({ title: filled ? "📊 Data exported" : "📋 Template downloaded", description: fileName });
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

      const headers: string[] = allRows[headerRowIdx].map((h: any) => String(h).trim());
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

  // Use demo data when no real entries exist
  const isUsingDemoData = entries.length === 0 && !loading;
  const displayEntries = isUsingDemoData ? DEMO_ENTRIES : entries;

  // Filters
  const uniqueStates = [...new Set(displayEntries.map(e => e.state))].sort();
  const filtered = displayEntries.filter(e => {
    if (filterState !== "all" && e.state !== filterState) return false;
    if (filterAccessibility !== "all" && e.accessibility !== filterAccessibility) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return [e.community_name, e.settlement_name, e.flhf_name, e.lga, e.ward].some(v => v?.toLowerCase().includes(q));
    }
    return true;
  });

  // Stats
  const totalPop = filtered.reduce((s, e) => s + (e.estimated_total_population || 0), 0);
  const geotagged = filtered.filter(e => e.community_latitude && e.community_longitude).length;
  const hardToReach = filtered.filter(e => e.accessibility === "hard_to_reach" || e.accessibility === "inaccessible").length;

  // Extended stats
  const accessStats = {
    accessible: filtered.filter(e => e.accessibility === "accessible").length,
    hard_to_reach: filtered.filter(e => e.accessibility === "hard_to_reach").length,
    inaccessible: filtered.filter(e => e.accessibility === "inaccessible").length,
    seasonal: filtered.filter(e => e.accessibility === "seasonal").length,
    unset: filtered.filter(e => !e.accessibility).length,
  };
  const securityStats = {
    cleared: filtered.filter(e => e.security_clearance === "cleared").length,
    partial: filtered.filter(e => e.security_clearance === "partial").length,
    not_cleared: filtered.filter(e => e.security_clearance === "not_cleared").length,
    unknown: filtered.filter(e => !e.security_clearance || e.security_clearance === "unknown").length,
  };
  const terrainCounts = filtered.reduce<Record<string, number>>((acc, e) => {
    const t = e.terrain_type || "unset";
    acc[t] = (acc[t] || 0) + 1;
    return acc;
  }, {});
  const uniqueFLHFs = new Set(filtered.map(e => e.flhf_name)).size;
  const avgDistKm = (() => {
    const dists = filtered.map(e => e.community_distance_to_flhf_km).filter((d): d is number => d != null && d > 0);
    return dists.length ? (dists.reduce((a, b) => a + b, 0) / dists.length).toFixed(1) : "—";
  })();

  const TERRAIN_EMOJI: Record<string, string> = { flat: "🌾", hilly: "⛰️", mountainous: "🏔️", riverine: "🌊", swampy: "🏝️", desert: "🏜️", forest: "🌲" };

  // Medicine allocation: unique LGAs from current entries
  const allLgasForMedicine = useMemo(() => [...new Set(displayEntries.map(e => e.lga))].sort(), [displayEntries]);

  const getTargetPop = (e: any) => {
    return ((e.estimated_children_5_14 || 0) + (e.estimated_adults_15_plus || 0)) || (e.estimated_total_population || 0);
  };

  // Compute proportional medicine allocation for ALL entered LGAs
  const medicineAllocationData = useMemo(() => {
    const validEntries = medAllocEntries.filter(me => me.lga && me.amount && Number(me.amount) > 0);
    if (validEntries.length === 0) return [];

    const allRows: { year: number; state: string; lga: string; ward: string; flhf: string; community: string; settlement: string; targetPop: number; medicineRequired: number; pct: number }[] = [];

    for (const me of validEntries) {
      const totalMedicine = Number(me.amount);
      const lgaEntries = displayEntries.filter(e => e.lga === me.lga);
      if (lgaEntries.length === 0) continue;

      const rows = lgaEntries.map(e => ({
        year: e.year_of_microplanning || new Date().getFullYear(),
        state: e.state,
        lga: e.lga,
        ward: e.ward,
        flhf: e.flhf_name,
        community: e.community_name,
        settlement: e.settlement_name || "—",
        targetPop: getTargetPop(e),
      }));

      const totalTargetPop = rows.reduce((s, r) => s + r.targetPop, 0);

      allRows.push(...rows.map(r => ({
        ...r,
        medicineRequired: totalTargetPop > 0 ? Math.round((r.targetPop / totalTargetPop) * totalMedicine) : 0,
        pct: totalTargetPop > 0 ? ((r.targetPop / totalTargetPop) * 100) : 0,
      })));
    }

    return allRows;
  }, [medAllocEntries, displayEntries]);

  // Medicine allocation export helpers
  const exportMedicineCSV = () => {
    if (medicineAllocationData.length === 0) return;
    const ws = XLSX.utils.json_to_sheet(medicineAllocationData.map(r => ({
      Year: r.year, State: r.state, LGA: r.lga, Ward: r.ward, FLHF: r.flhf,
      Community: r.community, Settlement: r.settlement,
      "Target Population": r.targetPop, "Medicine Required": r.medicineRequired, "% Share": r.pct.toFixed(1),
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

  const addMedAllocRow = () => setMedAllocEntries(prev => [...prev, { lga: "", amount: "" }]);
  const removeMedAllocRow = (idx: number) => setMedAllocEntries(prev => prev.filter((_, i) => i !== idx));
  const updateMedAllocRow = (idx: number, field: "lga" | "amount", value: string) => {
    setMedAllocEntries(prev => prev.map((row, i) => i === idx ? { ...row, [field]: value } : row));
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
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <MapPin className="h-5 w-5 text-primary" />
            Geo-enabled Microplanning
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">Community-level campaign planning with georeferenced data</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
            <SelectTrigger className="w-[180px] h-8 text-xs">
              <SelectValue placeholder="Select project" />
            </SelectTrigger>
            <SelectContent>
              {projects.map(p => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {canManageAccess && (
            <Button size="sm" variant="outline" onClick={openAccessManager}>
              <UserPlus className="h-3.5 w-3.5 mr-1" /> Manage User Access
            </Button>
          )}
          <Button size="sm" onClick={() => { setEditingEntry(null); setShowForm(true); }} disabled={!selectedProjectId}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Add Entry
          </Button>
        </div>
      </div>

      {/* Demo Data Banner */}
      {isUsingDemoData && (
        <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg px-4 py-2.5 flex items-center gap-3">
          <span className="text-lg">🎯</span>
          <div className="flex-1">
            <p className="text-xs font-semibold text-amber-800 dark:text-amber-200">Demo Data Preview</p>
            <p className="text-[10px] text-amber-600 dark:text-amber-400">Showing 20 sample communities across Nigeria. This data will automatically disappear when you add real entries.</p>
          </div>
          <Badge variant="outline" className="border-amber-300 text-amber-700 dark:text-amber-300 text-[10px]">DEMO</Badge>
        </div>
      )}

      {/* KPI Cards - Row 1: Core Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <Card className="border-border/50">
          <CardContent className="p-3">
            <p className="text-[10px] text-muted-foreground">Communities</p>
            <p className="text-lg font-bold flex items-center gap-1.5"><Building2 className="h-4 w-4 text-primary" />{filtered.length}</p>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="p-3">
            <p className="text-[10px] text-muted-foreground">Total Population</p>
            <p className="text-lg font-bold flex items-center gap-1.5"><Users className="h-4 w-4 text-primary" />{totalPop.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="p-3">
            <p className="text-[10px] text-muted-foreground">Geotagged</p>
            <p className="text-lg font-bold flex items-center gap-1.5"><MapPin className="h-4 w-4 text-primary" />{geotagged}<span className="text-xs font-normal text-muted-foreground">/{filtered.length}</span></p>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="p-3">
            <p className="text-[10px] text-muted-foreground">Health Facilities</p>
            <p className="text-lg font-bold">{uniqueFLHFs}</p>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="p-3">
            <p className="text-[10px] text-muted-foreground">Avg Dist. to FLHF</p>
            <p className="text-lg font-bold">{avgDistKm}<span className="text-xs font-normal text-muted-foreground"> km</span></p>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="p-3">
            <p className="text-[10px] text-muted-foreground">Hard to Reach</p>
            <p className="text-lg font-bold text-amber-600">{hardToReach}</p>
          </CardContent>
        </Card>
      </div>

      {/* KPI Cards - Row 2: Breakdown panels */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card className="border-border/50">
          <CardContent className="p-3">
            <p className="text-[11px] font-semibold text-muted-foreground mb-2">🚧 Accessibility</p>
            <div className="space-y-1.5">
              {[
                { label: "Accessible", count: accessStats.accessible, color: "bg-emerald-500" },
                { label: "Hard to Reach", count: accessStats.hard_to_reach, color: "bg-amber-500" },
                { label: "Inaccessible", count: accessStats.inaccessible, color: "bg-red-500" },
                { label: "Seasonal", count: accessStats.seasonal, color: "bg-violet-500" },
                { label: "Not Set", count: accessStats.unset, color: "bg-muted" },
              ].map(item => (
                <div key={item.label} className="flex items-center gap-2 text-xs">
                  <span className={`w-2.5 h-2.5 rounded-full ${item.color} inline-block flex-shrink-0`} />
                  <span className="flex-1">{item.label}</span>
                  <span className="font-semibold">{item.count}</span>
                  <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                    <div className={`h-full ${item.color} rounded-full`} style={{ width: `${filtered.length ? (item.count / filtered.length) * 100 : 0}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="p-3">
            <p className="text-[11px] font-semibold text-muted-foreground mb-2">🛡️ Security Clearance</p>
            <div className="space-y-1.5">
              {[
                { label: "Cleared", count: securityStats.cleared, color: "bg-emerald-500" },
                { label: "Partial", count: securityStats.partial, color: "bg-amber-500" },
                { label: "Not Cleared", count: securityStats.not_cleared, color: "bg-red-500" },
                { label: "Unknown", count: securityStats.unknown, color: "bg-muted" },
              ].map(item => (
                <div key={item.label} className="flex items-center gap-2 text-xs">
                  <span className={`w-2.5 h-2.5 rounded-full ${item.color} inline-block flex-shrink-0`} />
                  <span className="flex-1">{item.label}</span>
                  <span className="font-semibold">{item.count}</span>
                  <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                    <div className={`h-full ${item.color} rounded-full`} style={{ width: `${filtered.length ? (item.count / filtered.length) * 100 : 0}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="p-3">
            <p className="text-[11px] font-semibold text-muted-foreground mb-2">⛰️ Terrain Types</p>
            <div className="space-y-1.5">
              {Object.entries(terrainCounts).sort((a, b) => b[1] - a[1]).map(([terrain, count]) => (
                <div key={terrain} className="flex items-center gap-2 text-xs">
                  <span className="flex-shrink-0">{TERRAIN_EMOJI[terrain] || "❓"}</span>
                  <span className="flex-1 capitalize">{terrain === "unset" ? "Not Set" : terrain}</span>
                  <span className="font-semibold">{count}</span>
                  <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-primary/60 rounded-full" style={{ width: `${filtered.length ? (count / filtered.length) * 100 : 0}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters & View Toggle */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search communities, FLHF..." className="pl-8 h-8 text-xs" />
        </div>
        <Select value={filterState} onValueChange={setFilterState}>
          <SelectTrigger className="w-[130px] h-8 text-xs"><SelectValue placeholder="All States" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All States</SelectItem>
            {uniqueStates.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
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
        <div className="flex border border-border rounded-lg overflow-hidden">
          <Button variant={activeView === "map" ? "default" : "ghost"} size="sm" className="rounded-none h-8" onClick={() => setActiveView("map")}>
            <Map className="h-3.5 w-3.5" />
          </Button>
          <Button variant={activeView === "list" ? "default" : "ghost"} size="sm" className="rounded-none h-8" onClick={() => setActiveView("list")}>
            <List className="h-3.5 w-3.5" />
          </Button>
          <Button variant={activeView === "medicine" ? "default" : "ghost"} size="sm" className="rounded-none h-8 gap-1" onClick={() => setActiveView("medicine")}>
            <Pill className="h-3.5 w-3.5" />
            <span className="hidden sm:inline text-xs">Medicine</span>
          </Button>
          <Button variant={activeView === "coverage" ? "default" : "ghost"} size="sm" className="rounded-none h-8 gap-1" onClick={() => setActiveView("coverage")}>
            <Activity className="h-3.5 w-3.5" />
            <span className="hidden sm:inline text-xs">Coverage</span>
          </Button>
          <Button variant={activeView === "routes" ? "default" : "ghost"} size="sm" className="rounded-none h-8 gap-1" onClick={() => setActiveView("routes")}>
            <Navigation className="h-3.5 w-3.5" />
            <span className="hidden sm:inline text-xs">Routes</span>
          </Button>
        </div>
      </div>

      {/* Export / Import bar */}
      <div className="flex items-center gap-2 flex-wrap">
        <Button size="sm" variant="outline" onClick={() => handleExportTemplate(false)}>
          <FileSpreadsheet className="h-3.5 w-3.5 mr-1" /> Download Blank Template
        </Button>
        <Button size="sm" variant="outline" onClick={() => handleExportTemplate(true)} disabled={entries.length === 0}>
          <Download className="h-3.5 w-3.5 mr-1" /> Export Data as Template
        </Button>
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
            const entry = entries.find(e => e.id === id);
            if (entry) { setEditingEntry(entry); setShowForm(true); }
          }}
        />
      )}

      {/* List View */}
      {activeView === "list" && (
        <Card className="border-border/50">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">State</TableHead>
                    <TableHead className="text-xs">LGA</TableHead>
                    <TableHead className="text-xs">Ward</TableHead>
                    <TableHead className="text-xs">FLHF</TableHead>
                    <TableHead className="text-xs">Community</TableHead>
                    <TableHead className="text-xs">Settlement</TableHead>
                    <TableHead className="text-xs text-right">Population</TableHead>
                    <TableHead className="text-xs">Access</TableHead>
                    <TableHead className="text-xs">GPS</TableHead>
                    <TableHead className="text-xs w-[80px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                        {loading ? "Loading..." : "No entries yet. Click 'Add Entry' to start microplanning."}
                      </TableCell>
                    </TableRow>
                  ) : filtered.map(entry => (
                    <TableRow key={entry.id} className="text-xs">
                      <TableCell>{entry.state}</TableCell>
                      <TableCell>{entry.lga}</TableCell>
                      <TableCell>{entry.ward}</TableCell>
                      <TableCell>{entry.flhf_name}</TableCell>
                      <TableCell className="font-medium">{entry.community_name}</TableCell>
                      <TableCell>{entry.settlement_name || "—"}</TableCell>
                      <TableCell className="text-right">{entry.estimated_total_population?.toLocaleString() || "—"}</TableCell>
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
                        {entry.community_latitude ? (
                          <Badge variant="outline" className="text-[10px] border-blue-300 text-blue-700">
                            <MapPin className="h-2.5 w-2.5 mr-0.5" />
                            {entry.community_latitude.toFixed(2)}, {entry.community_longitude.toFixed(2)}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setEditingEntry(entry); setShowForm(true); }}>
                            <Edit className="h-3 w-3" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => handleDelete(entry.id)}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Medicine Allocation View */}
      {activeView === "medicine" && (
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
              Add one or more LGAs with their allocated medicine quantities. The system will proportionally distribute medicines across all communities/settlements based on their target populations.
            </p>

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
                  {medAllocEntries.length > 1 && (
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => removeMedAllocRow(idx)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              ))}
              <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={addMedAllocRow}>
                <Plus className="h-3 w-3" /> Add another LGA
              </Button>
            </div>

            {medicineAllocationData.length > 0 && (
              <>
                <Badge variant="secondary" className="text-xs px-3">
                  {medicineAllocationData.length} communities · Total medicine: {medicineAllocationData.reduce((s, r) => s + r.medicineRequired, 0).toLocaleString()} units
                </Badge>
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
                          <th className="px-3 py-2.5 text-right font-semibold">Medicine Required</th>
                        </tr>
                      </thead>
                      <tbody>
                        {medicineAllocationData.map((row, i) => (
                          <tr key={i} className={`border-b border-border/50 ${i % 2 === 0 ? "bg-background" : "bg-muted/20"} hover:bg-emerald-50 dark:hover:bg-emerald-950/20 transition-colors`}>
                            <td className="px-3 py-2 border-r border-border/30">{row.year}</td>
                            <td className="px-3 py-2 border-r border-border/30">{row.state}</td>
                            <td className="px-3 py-2 border-r border-border/30 font-medium">{row.lga}</td>
                            <td className="px-3 py-2 border-r border-border/30">{row.ward}</td>
                            <td className="px-3 py-2 border-r border-border/30">{row.flhf}</td>
                            <td className="px-3 py-2 border-r border-border/30 font-medium">{row.community}</td>
                            <td className="px-3 py-2 border-r border-border/30 text-muted-foreground">{row.settlement}</td>
                            <td className="px-3 py-2 text-right border-r border-border/30 tabular-nums">{row.targetPop.toLocaleString()}</td>
                            <td className="px-3 py-2 text-right tabular-nums font-bold text-emerald-700 dark:text-emerald-400">
                              {row.medicineRequired.toLocaleString()}
                              <span className="text-[9px] font-normal text-muted-foreground ml-1">({row.pct.toFixed(1)}%)</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="bg-emerald-700 text-white font-bold">
                          <td colSpan={7} className="px-3 py-2.5 border-r border-emerald-600">TOTAL</td>
                          <td className="px-3 py-2.5 text-right border-r border-emerald-600 tabular-nums">
                            {medicineAllocationData.reduce((s, r) => s + r.targetPop, 0).toLocaleString()}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums">
                            {medicineAllocationData.reduce((s, r) => s + r.medicineRequired, 0).toLocaleString()}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
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
      )}

      {/* Coverage View */}
      {activeView === "coverage" && (
        <CoverageView entries={displayEntries} onRefresh={fetchEntries} />
      )}

      {/* Travel Routes View */}
      {activeView === "routes" && (
        <TravelRouteMap entries={displayEntries} />
      )}

      {/* Entry Form Dialog */}
      <Dialog open={showForm} onOpenChange={(v) => { if (!v) { setShowForm(false); setEditingEntry(null); setDialogFullscreen(false); } }}>
        <DialogContent className={`overflow-hidden z-[9999] flex flex-col ${dialogFullscreen ? 'max-w-[100vw] w-[100vw] h-[100vh] max-h-[100vh] rounded-none m-0' : 'max-w-4xl max-h-[90vh]'}`}>
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

      {/* User Access Manager Dialog */}
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
    </div>
  );
};

export default MicroplanningView;

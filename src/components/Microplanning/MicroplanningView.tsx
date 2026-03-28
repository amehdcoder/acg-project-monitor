import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";
import { Plus, Map, List, Download, Upload, Search, Trash2, Edit, MapPin, Users, Building2, Filter, FileSpreadsheet, Maximize2, Minimize2 } from "lucide-react";
import MicroplanEntryForm, { MicroplanFormData } from "./MicroplanEntryForm";
import MicroplanMap from "./MicroplanMap";
import * as XLSX from "xlsx";

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
  "year_of_microplanning",
]);

const MicroplanningView = () => {
  const { user } = useAuth();
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
  const [activeView, setActiveView] = useState<"map" | "list">("map");
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  // Filters
  const uniqueStates = [...new Set(entries.map(e => e.state))].sort();
  const filtered = entries.filter(e => {
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
          <Button size="sm" onClick={() => { setEditingEntry(null); setShowForm(true); }} disabled={!selectedProjectId}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Add Entry
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="border-border/50">
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-primary" />
              <div>
                <p className="text-[11px] text-muted-foreground">Communities</p>
                <p className="text-lg font-bold">{filtered.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-green-600" />
              <div>
                <p className="text-[11px] text-muted-foreground">Total Population</p>
                <p className="text-lg font-bold">{totalPop.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-blue-600" />
              <div>
                <p className="text-[11px] text-muted-foreground">Geotagged</p>
                <p className="text-lg font-bold">{geotagged}/{filtered.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-amber-600" />
              <div>
                <p className="text-[11px] text-muted-foreground">Hard to Reach</p>
                <p className="text-lg font-bold">{hardToReach}</p>
              </div>
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

      {/* Entry Form Dialog - z-index above map */}
      <Dialog open={showForm} onOpenChange={(v) => { if (!v) { setShowForm(false); setEditingEntry(null); } }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden z-[9999]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5 text-primary" />
              {editingEntry ? "Edit Microplan Entry" : "New Microplan Entry"}
            </DialogTitle>
          </DialogHeader>
          <MicroplanEntryForm
            projectId={selectedProjectId}
            initialData={editingEntry || undefined}
            onSubmit={handleSubmit}
            onCancel={() => { setShowForm(false); setEditingEntry(null); }}
            isSubmitting={submitting}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MicroplanningView;

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
import { toast } from "@/hooks/use-toast";
import { Plus, Map, List, Download, Upload, Search, Trash2, Edit, MapPin, Users, Building2, FileSpreadsheet, Maximize2, Minimize2, UserPlus, X, Pill, Activity, Navigation, Home, Target, Globe, Heart } from "lucide-react";
import { useTablePagination } from "@/hooks/useTablePagination";
import TablePagination from "@/components/ui/table-pagination";
import MicroplanEntryForm, { MicroplanFormData } from "./MicroplanEntryForm";
import MicroplanMap from "./MicroplanMap";
import CoverageView from "./CoverageView";
import ReconciliationView from "./ReconciliationView";
import TravelRouteMap from "./TravelRouteMap";
import DesignationManagerDialog from "./DesignationManagerDialog";
import AllocationHistoryDialog from "./AllocationHistoryDialog";
import { useMicroplanScope } from "@/hooks/useMicroplanScope";
import { ShieldCheck, History as HistoryIcon } from "lucide-react";
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

// Paginated entry list for entry-only users
const EntryOnlyList = ({ entries, loading, onEdit, onDelete }: { entries: any[]; loading: boolean; onEdit: (entry: any) => void; onDelete: (id: string) => void }) => {
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
                    <div className="flex items-center gap-0.5">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(entry)}>
                        <Edit className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => onDelete(entry.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
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
                      <div className="flex items-center gap-0.5">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(entry)}>
                          <Edit className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => onDelete(entry.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
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
const AdminListView = ({ entries, loading, onEdit, onDelete }: { entries: any[]; loading: boolean; onEdit: (entry: any) => void; onDelete: (id: string) => void }) => {
  const pagination = useTablePagination(entries, 25);

  return (
    <Card className="border-border/50">
      <CardContent className="p-0">
        {/* Mobile card view */}
        <div className="block sm:hidden p-2 space-y-2">
          {loading ? (
            <div className="text-xs text-muted-foreground py-8 text-center">Loading...</div>
          ) : pagination.paginatedData.length === 0 ? (
            <div className="text-center text-muted-foreground py-8 text-xs">No entries yet. Click 'Add Entry' to start microplanning.</div>
          ) : pagination.paginatedData.map((entry: any) => (
            <Card key={entry.id} className="border-border/40">
              <CardContent className="p-3 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold">{entry.community_name}</span>
                  <div className="flex items-center gap-0.5">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(entry)}>
                      <Edit className="h-3 w-3" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => onDelete(entry.id)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-1 text-[11px] text-muted-foreground">
                  <span>{entry.state} / {entry.lga}</span>
                  <span>Ward: {entry.ward}</span>
                  <span>FLHF: {entry.flhf_name}</span>
                  <span>Pop: {entry.estimated_total_population?.toLocaleString() || "—"}</span>
                  {entry.accessibility && <span className="capitalize">{entry.accessibility.replace(/_/g, " ")}</span>}
                  {entry.community_latitude && <span>📍 {entry.community_latitude.toFixed(2)}, {entry.community_longitude.toFixed(2)}</span>}
                </div>
              </CardContent>
            </Card>
          ))}
          {entries.length > 25 && (
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
              {loading ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center text-muted-foreground py-8">Loading...</TableCell>
                </TableRow>
              ) : pagination.paginatedData.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                    No entries yet. Click 'Add Entry' to start microplanning.
                  </TableCell>
                </TableRow>
              ) : pagination.paginatedData.map((entry: any) => (
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
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onEdit(entry)}>
                        <Edit className="h-3 w-3" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => onDelete(entry.id)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        {entries.length > 25 && (
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
  );
};

interface MicroplanningViewProps {
  entryOnly?: boolean;
}

const MicroplanningView = ({ entryOnly = false }: MicroplanningViewProps) => {
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
  const [activeView, setActiveView] = useState<"list" | "medicine" | "coverage" | "reconciliation" | "map" | "routes">("list");
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Medicine Allocation state - multiple LGAs (in-edit buffer)
  const [medAllocEntries, setMedAllocEntries] = useState<{ id?: string; lga: string; amount: string; jrsm?: string; medicine_name?: string; year?: number }[]>([{ lga: "", amount: "", jrsm: "" }]);
  const [savedAllocations, setSavedAllocations] = useState<any[]>([]);
  const [savingAllocations, setSavingAllocations] = useState(false);

  // User access management state
  const [showAccessManager, setShowAccessManager] = useState(false);
  const [showDesignationManager, setShowDesignationManager] = useState(false);
  const [showHistoryDialog, setShowHistoryDialog] = useState(false);
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [grantedUsers, setGrantedUsers] = useState<any[]>([]);
  const [accessSearchQuery, setAccessSearchQuery] = useState("");
  const canManageAccess = isOwner || isSuperAdmin;
  const isAdmin = isOwner || isSuperAdmin;

  // Designation-based scope (admins bypass)
  const scope = useMicroplanScope(isAdmin);

  const fetchProjects = useCallback(async () => {
    const { data } = await supabase.from("projects").select("id, name").order("name");
    setProjects(data || []);
    if (data && data.length > 0 && !selectedProjectId) {
      setSelectedProjectId(data[0].id);
      // For entry-only users, auto-open the form immediately once project is set
      if (entryOnly) {
        setShowForm(true);
      }
    }
  }, [selectedProjectId, entryOnly]);

  const fetchEntries = useCallback(async () => {
    if (!selectedProjectId) return;
    setLoading(true);
    let query = supabase
      .from("microplan_entries")
      .select("*")
      .eq("project_id", selectedProjectId);
    
    // Entry-only users see only their own entries
    if (entryOnly && user?.id) {
      query = query.eq("created_by", user.id);
    }
    
    const { data, error } = await query
      .order("created_at", { ascending: false });
    if (error) {
      toast({ title: "Error loading entries", description: error.message, variant: "destructive" });
    }
    setEntries(data || []);
    setLoading(false);
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
        amount: String(d.amount ?? ""),
        medicine_name: d.medicine_name || "",
        year: d.year,
      })));
    } else {
      setMedAllocEntries([{ lga: "", amount: "" }]);
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
  const baseEntries = isUsingDemoData ? DEMO_ENTRIES : entries;
  // Designation-scope filter: admins always see all; non-admins with no
  // designation assignment also see all (legacy). Users with assignments are
  // restricted to rows that match at least one of their assignments.
  const displayEntries = useMemo(() => {
    if (isAdmin) return baseEntries;
    if (scope.loading) return baseEntries;
    if (scope.designations.length === 0) return baseEntries;
    if (scope.hasNoRestriction) return baseEntries;
    return baseEntries.filter((e: any) => scope.isInScope(e));
  }, [baseEntries, isAdmin, scope]);

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

  // ===== COMPREHENSIVE KPI ENGINE (computed from real entries) =====
  const totalPop = filtered.reduce((s, e) => s + (e.estimated_total_population || 0), 0);
  const totalChildren04 = filtered.reduce((s, e) => s + (e.estimated_children_0_4 || 0), 0);
  const totalChildren514 = filtered.reduce((s, e) => s + (e.estimated_children_5_14 || 0), 0);
  const totalAdults15 = filtered.reduce((s, e) => s + (e.estimated_adults_15_plus || 0), 0);
  const totalHouseholds = filtered.reduce((s, e) => s + (e.number_of_households || 0), 0);
  const targetPop = totalChildren514 + totalAdults15;
  const geotagged = filtered.filter(e => e.community_latitude && e.community_longitude).length;
  const geotaggedPct = filtered.length > 0 ? (geotagged / filtered.length) * 100 : 0;
  const hardToReach = filtered.filter(e => e.accessibility === "hard_to_reach" || e.accessibility === "inaccessible").length;
  const uniqueStatesCount = new Set(filtered.map(e => e.state)).size;
  const uniqueLGAsCount = new Set(filtered.map(e => e.lga)).size;
  const uniqueWardsCount = new Set(filtered.map(e => e.ward)).size;
  const uniqueFLHFs = new Set(filtered.map(e => e.flhf_name)).size;
  const uniqueSettlements = filtered.filter(e => e.settlement_name).length;
  const cddFromCommunity = filtered.filter(e => e.cdd_from_community).length;
  const cddPct = filtered.length > 0 ? (cddFromCommunity / filtered.length) * 100 : 0;
  const avgDistKm = (() => {
    const dists = filtered.map(e => e.community_distance_to_flhf_km).filter((d): d is number => d != null && d > 0);
    return dists.length ? (dists.reduce((a, b) => a + b, 0) / dists.length).toFixed(1) : "—";
  })();
  const avgHouseholdsPerCommunity = filtered.length > 0 && totalHouseholds > 0 ? Math.round(totalHouseholds / filtered.length) : 0;

  // Accessibility breakdown
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

    const allRows: { entryId: string; year: number; state: string; lga: string; ward: string; flhf: string; community: string; settlement: string; targetPop: number; medicineRequired: number; medicineUsed: number; pct: number; jrsmTarget: number; peopleToTreat: number; ratio: number; ratioStatus: "ok" | "low" | "high" | "na" }[] = [];

    for (const me of validEntries) {
      const totalMedicine = Number(me.amount);
      const jrsmTotal = Number(me.jrsm) || 0;
      const lgaEntries = displayEntries.filter(e => e.lga === me.lga);
      if (lgaEntries.length === 0) continue;

      const rows = lgaEntries.map(e => ({
        entryId: e.id,
        year: e.year_of_microplanning || new Date().getFullYear(),
        state: e.state,
        lga: e.lga,
        ward: e.ward,
        flhf: e.flhf_name,
        community: e.community_name,
        settlement: e.settlement_name || "—",
        targetPop: getTargetPop(e),
        medicineUsed: Number((e as any).medicine_used) || 0,
      }));

      const totalTargetPop = rows.reduce((s, r) => s + r.targetPop, 0);

      allRows.push(...rows.map(r => {
        const share = totalTargetPop > 0 ? r.targetPop / totalTargetPop : 0;
        const medicineRequired = Math.round(share * totalMedicine);
        const peopleToTreat = jrsmTotal > 0 ? Math.round(share * jrsmTotal) : 0;
        const ratio = peopleToTreat > 0 ? medicineRequired / peopleToTreat : 0;
        let ratioStatus: "ok" | "low" | "high" | "na" = "na";
        if (peopleToTreat > 0) {
          if (ratio < 2.5) ratioStatus = "low";
          else if (ratio > 3.0) ratioStatus = "high";
          else ratioStatus = "ok";
        }
        return {
          ...r,
          medicineRequired,
          pct: share * 100,
          jrsmTarget: peopleToTreat, // per-community share of JRSM target
          peopleToTreat,
          ratio,
          ratioStatus,
        };
      }));
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

  const addMedAllocRow = () => setMedAllocEntries(prev => [...prev, { lga: "", amount: "", jrsm: "" }]);
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
  const updateMedAllocRow = (idx: number, field: "lga" | "amount" | "jrsm", value: string) => {
    setMedAllocEntries(prev => prev.map((row, i) => i === idx ? { ...row, [field]: value } : row));
  };

  // Persist all current allocation rows (insert new, update changed)
  const saveAllocations = async () => {
    if (!selectedProjectId || !user?.id) return;
    if (!isAdmin) {
      toast({ title: "Admin only", description: "Only admins can save medicine allocations.", variant: "destructive" });
      return;
    }
    setSavingAllocations(true);
    try {
      const valid = medAllocEntries.filter(r => r.lga && r.amount && Number(r.amount) > 0);
      for (const row of valid) {
        const payload = {
          project_id: selectedProjectId,
          lga: row.lga,
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
          <Button size="sm" onClick={() => { setEditingEntry(null); setShowForm(true); }} className="shadow-sm font-semibold">
            <Plus className="h-3.5 w-3.5 mr-1" /> Add Entry
          </Button>
        </div>
      </div>

      {!entryOnly && (
        <>
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

          {/* Row 3: Breakdown panels — Accessibility, Security, Terrain, CDD */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Accessibility */}
            <Card className="border-border/40 shadow-sm">
              <CardContent className="p-3">
                <p className="text-[10px] font-bold text-muted-foreground mb-2.5 uppercase tracking-wide flex items-center gap-1.5">
                  <span className="inline-block w-2 h-2 rounded-full" style={{ background: "hsl(142, 60%, 35%)" }} />
                  Accessibility
                </p>
                <div className="space-y-2">
                  {[
                    { label: "Accessible", count: accessStats.accessible, color: "hsl(142, 60%, 35%)" },
                    { label: "Hard to Reach", count: accessStats.hard_to_reach, color: "hsl(45, 80%, 50%)" },
                    { label: "Inaccessible", count: accessStats.inaccessible, color: "hsl(0, 70%, 50%)" },
                    { label: "Seasonal", count: accessStats.seasonal, color: "hsl(262, 50%, 55%)" },
                    { label: "Not Set", count: accessStats.unset, color: "hsl(220, 10%, 70%)" },
                  ].map(item => (
                    <div key={item.label} className="flex items-center gap-2 text-xs">
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: item.color }} />
                      <span className="flex-1 text-foreground">{item.label}</span>
                      <span className="font-bold tabular-nums text-foreground">{item.count}</span>
                      <div className="w-14 h-2 bg-muted rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all" style={{ width: `${filtered.length ? (item.count / filtered.length) * 100 : 0}%`, background: item.color }} />
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Security */}
            <Card className="border-border/40 shadow-sm">
              <CardContent className="p-3">
                <p className="text-[10px] font-bold text-muted-foreground mb-2.5 uppercase tracking-wide flex items-center gap-1.5">
                  <span className="inline-block w-2 h-2 rounded-full" style={{ background: "hsl(215, 70%, 40%)" }} />
                  Security Clearance
                </p>
                <div className="space-y-2">
                  {[
                    { label: "Cleared", count: securityStats.cleared, color: "hsl(142, 60%, 35%)" },
                    { label: "Partial", count: securityStats.partial, color: "hsl(45, 80%, 50%)" },
                    { label: "Not Cleared", count: securityStats.not_cleared, color: "hsl(0, 70%, 50%)" },
                    { label: "Unknown", count: securityStats.unknown, color: "hsl(220, 10%, 70%)" },
                  ].map(item => (
                    <div key={item.label} className="flex items-center gap-2 text-xs">
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: item.color }} />
                      <span className="flex-1 text-foreground">{item.label}</span>
                      <span className="font-bold tabular-nums text-foreground">{item.count}</span>
                      <div className="w-14 h-2 bg-muted rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all" style={{ width: `${filtered.length ? (item.count / filtered.length) * 100 : 0}%`, background: item.color }} />
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Terrain */}
            <Card className="border-border/40 shadow-sm">
              <CardContent className="p-3">
                <p className="text-[10px] font-bold text-muted-foreground mb-2.5 uppercase tracking-wide flex items-center gap-1.5">
                  <span className="inline-block w-2 h-2 rounded-full" style={{ background: "hsl(25, 70%, 45%)" }} />
                  Terrain Types
                </p>
                <div className="space-y-2">
                  {Object.entries(terrainCounts).sort((a, b) => b[1] - a[1]).map(([terrain, count]) => (
                    <div key={terrain} className="flex items-center gap-2 text-xs">
                      <span className="flex-shrink-0 text-sm">{TERRAIN_EMOJI[terrain] || "❓"}</span>
                      <span className="flex-1 capitalize text-foreground">{terrain === "unset" ? "Not Set" : terrain}</span>
                      <span className="font-bold tabular-nums text-foreground">{count}</span>
                      <div className="w-14 h-2 bg-muted rounded-full overflow-hidden">
                        <div className="h-full rounded-full bg-primary/60 transition-all" style={{ width: `${filtered.length ? (count / filtered.length) * 100 : 0}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* CDD & Key Ratios */}
            <Card className="border-border/40 shadow-sm">
              <CardContent className="p-3">
                <p className="text-[10px] font-bold text-muted-foreground mb-2.5 uppercase tracking-wide flex items-center gap-1.5">
                  <span className="inline-block w-2 h-2 rounded-full" style={{ background: "hsl(262, 50%, 50%)" }} />
                  Key Ratios
                </p>
                <div className="space-y-3">
                  <div>
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
                  </div>
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-muted-foreground">Hard to Reach</span>
                      <span className="font-bold" style={{ color: "hsl(45, 80%, 45%)" }}>{hardToReach}</span>
                    </div>
                    <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${filtered.length ? (hardToReach / filtered.length) * 100 : 0}%`, background: "hsl(45, 80%, 45%)" }} />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-muted-foreground">Avg HH/Community</span>
                      <span className="font-bold text-foreground">{avgHouseholdsPerCommunity}</span>
                    </div>
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
              <Button variant={activeView === "list" ? "default" : "ghost"} size="sm" className="rounded-none h-8 gap-1" onClick={() => setActiveView("list")}>
                <List className="h-3.5 w-3.5" />
                <span className="hidden sm:inline text-xs">Planning</span>
              </Button>
              <Button variant={activeView === "medicine" ? "default" : "ghost"} size="sm" className="rounded-none h-8 gap-1" onClick={() => setActiveView("medicine")}>
                <Pill className="h-3.5 w-3.5" />
                <span className="hidden sm:inline text-xs">Medicine</span>
              </Button>
              <Button variant={activeView === "coverage" ? "default" : "ghost"} size="sm" className="rounded-none h-8 gap-1" onClick={() => setActiveView("coverage")}>
                <Activity className="h-3.5 w-3.5" />
                <span className="hidden sm:inline text-xs">Coverage</span>
              </Button>
              <Button variant={activeView === "reconciliation" ? "default" : "ghost"} size="sm" className="rounded-none h-8 gap-1" onClick={() => setActiveView("reconciliation")}>
                <Heart className="h-3.5 w-3.5" />
                <span className="hidden sm:inline text-xs">Reconciliation</span>
              </Button>
              <Button variant={activeView === "map" ? "default" : "ghost"} size="sm" className="rounded-none h-8 gap-1" onClick={() => setActiveView("map")}>
                <Map className="h-3.5 w-3.5" />
                <span className="hidden sm:inline text-xs">Map</span>
              </Button>
              <Button variant={activeView === "routes" ? "default" : "ghost"} size="sm" className="rounded-none h-8 gap-1" onClick={() => setActiveView("routes")}>
                <Navigation className="h-3.5 w-3.5" />
                <span className="hidden sm:inline text-xs">Routes</span>
              </Button>
            </div>
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
            <AdminListView
              entries={filtered}
              loading={loading}
              onEdit={(entry) => { setEditingEntry(entry); setShowForm(true); }}
              onDelete={handleDelete}
            />
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
                      <Button size="sm" className="h-7 text-xs gap-1" onClick={saveAllocations} disabled={savingAllocations}>
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

          {/* Reconciliation View — Balance of medicine + reversal destination */}
          {activeView === "reconciliation" && (
            <ReconciliationView
              entries={displayEntries as any}
              allocationRows={medicineAllocationData}
              onRefresh={fetchEntries}
            />
          )}

          {/* Travel Routes View */}
          {activeView === "routes" && (
            <TravelRouteMap entries={displayEntries} />
          )}
        </>
      )}

      {/* Entry-only users: show their own submitted entries */}
      {entryOnly && (
        <EntryOnlyList
          entries={entries}
          loading={loading}
          onEdit={(entry) => { setEditingEntry(entry); setShowForm(true); }}
          onDelete={handleDelete}
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
    </div>
  );
};

export default MicroplanningView;

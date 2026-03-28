import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";
import { Plus, Map, List, Download, Search, Trash2, Edit, MapPin, Users, Building2, Filter, BarChart3 } from "lucide-react";
import MicroplanEntryForm, { MicroplanFormData } from "./MicroplanEntryForm";
import MicroplanMap from "./MicroplanMap";

const MicroplanningView = () => {
  const { user } = useAuth();
  const [entries, setEntries] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingEntry, setEditingEntry] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterState, setFilterState] = useState<string>("all");
  const [filterAccessibility, setFilterAccessibility] = useState<string>("all");
  const [activeView, setActiveView] = useState<"map" | "list">("map");

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

  const handleExport = () => {
    if (entries.length === 0) return;
    const headers = ["State", "LGA", "Ward", "FLHF", "Community", "Settlement", "Terrain", "Accessibility", "Security", "Total Pop", "Children 0-4", "Children 5-14", "Adults 15+", "HHs", "CDD Names", "Latitude", "Longitude"];
    const rows = entries.map(e => [
      e.state, e.lga, e.ward, e.flhf_name, e.community_name, e.settlement_name || "",
      e.terrain_type || "", e.accessibility || "", e.security_clearance || "",
      e.estimated_total_population || "", e.estimated_children_0_4 || "", e.estimated_children_5_14 || "",
      e.estimated_adults_15_plus || "", e.number_of_households || "", e.cdd_names || "",
      e.community_latitude || "", e.community_longitude || "",
    ]);
    const csv = [headers.join(","), ...rows.map(r => r.map(c => `"${c}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `microplan_${selectedProjectId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
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
          <Button size="sm" variant="outline" onClick={handleExport} disabled={entries.length === 0}>
            <Download className="h-3.5 w-3.5 mr-1" /> Export
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

      {/* Entry Form Dialog */}
      <Dialog open={showForm} onOpenChange={(v) => { if (!v) { setShowForm(false); setEditingEntry(null); } }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden">
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

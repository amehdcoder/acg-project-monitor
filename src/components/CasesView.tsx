import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Search,
  MoreVertical,
  Eye,
  Edit,
  XCircle,
  RefreshCw,
  User,
  Calendar,
  Briefcase,
  Clock,
  ChevronRight,
  MapPin,
  FileText,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";
import CaseDetails from "@/components/CaseManagement/CaseDetails";
import { toast } from "@/hooks/use-toast";

interface Case {
  id: string;
  name: string;
  caseTypeName: string;
  caseTypeLabel: string;
  properties: Record<string, any>;
  status: "open" | "closed";
  openedAt: string;
  lastModifiedAt: string;
  ownerName?: string;
  projectName?: string;
  projectId: string;
  activitiesCount?: number;
}

const CasesView = () => {
  const { user, profile, isAdmin } = useAuth();
  const [cases, setCases] = useState<Case[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "open" | "closed">("open");
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [projectFilter, setProjectFilter] = useState<string>("all");

  useEffect(() => {
    if (user?.id) {
      fetchProjects();
    }
  }, [user?.id]);

  useEffect(() => {
    if (user?.id) {
      fetchCases();
    }
  }, [user?.id, statusFilter, projectFilter]);

  const fetchProjects = async () => {
    if (!user?.id) return;

    try {
      if (isAdmin) {
        const { data } = await supabase.from("projects").select("id, name").order("name");
        setProjects(data || []);
      } else {
        const { data: assignments } = await supabase
          .from("user_project_assignments")
          .select("project_id")
          .eq("user_id", user.id);

        if (assignments && assignments.length > 0) {
          const projectIds = assignments.map(a => a.project_id);
          const { data } = await supabase
            .from("projects")
            .select("id, name")
            .in("id", projectIds)
            .order("name");
          setProjects(data || []);
        }
      }
    } catch (error) {
      console.error("Error fetching projects:", error);
    }
  };

  const fetchCases = async () => {
    if (!user?.id) return;
    setLoading(true);

    try {
      // Get user's project IDs
      let projectIds: string[] = [];
      if (isAdmin) {
        const { data } = await supabase.from("projects").select("id");
        projectIds = (data || []).map(p => p.id);
      } else {
        const { data: assignments } = await supabase
          .from("user_project_assignments")
          .select("project_id")
          .eq("user_id", user.id);
        projectIds = (assignments || []).map(a => a.project_id);
      }

      if (projectIds.length === 0) {
        setCases([]);
        setLoading(false);
        return;
      }

      let query = supabase
        .from("cases")
        .select(`
          *,
          case_types!inner(name, label),
          projects!inner(name)
        `)
        .in("project_id", projectFilter !== "all" ? [projectFilter] : projectIds)
        .order("last_modified_at", { ascending: false });

      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }

      const { data, error } = await query;
      if (error) throw error;

      const formattedCases: Case[] = (data || []).map((c: any) => ({
        id: c.id,
        name: c.name,
        caseTypeName: c.case_types?.name || "",
        caseTypeLabel: c.case_types?.label || "",
        properties: c.properties || {},
        status: c.status,
        openedAt: c.opened_at,
        lastModifiedAt: c.last_modified_at,
        projectName: c.projects?.name || "",
        projectId: c.project_id,
      }));

      setCases(formattedCases);
    } catch (error) {
      console.error("Error fetching cases:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleCloseCase = async (caseId: string) => {
    try {
      const { error } = await supabase
        .from("cases")
        .update({
          status: "closed",
          closed_at: new Date().toISOString(),
          closed_by: user?.id,
          last_modified_by: user?.id,
        })
        .eq("id", caseId);

      if (error) throw error;
      toast({ title: "Case Closed" });
      fetchCases();
    } catch (error) {
      console.error("Error closing case:", error);
    }
  };

  const handleReopenCase = async (caseId: string) => {
    try {
      const { error } = await supabase
        .from("cases")
        .update({
          status: "open",
          closed_at: null,
          closed_by: null,
          last_modified_by: user?.id,
        })
        .eq("id", caseId);

      if (error) throw error;
      toast({ title: "Case Reopened" });
      fetchCases();
    } catch (error) {
      console.error("Error reopening case:", error);
    }
  };

  const filteredCases = cases.filter((c) =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.caseTypeLabel.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getTimeSince = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    if (days === 0) return "Today";
    if (days === 1) return "Yesterday";
    if (days < 7) return `${days}d ago`;
    if (days < 30) return `${Math.floor(days / 7)}w ago`;
    return `${Math.floor(days / 30)}mo ago`;
  };

  const getPropertyPreview = (props: Record<string, any>) => {
    const entries = Object.entries(props).slice(0, 3);
    return entries;
  };

  return (
    <div className="space-y-4 p-4 lg:p-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-xl font-bold text-foreground sm:text-2xl">
            Case Management
          </h1>
          <p className="text-sm text-muted-foreground">
            Track and manage longitudinal follow-up cases
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="gap-1">
            <Briefcase className="h-3 w-3" />
            {filteredCases.length} case{filteredCases.length !== 1 ? "s" : ""}
          </Badge>
          <Button variant="outline" size="sm" onClick={fetchCases}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card className="border-0 shadow-card">
        <CardContent className="p-3 sm:p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search cases by name or type..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex gap-2">
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
                <SelectTrigger className="w-[120px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="closed">Closed</SelectItem>
                </SelectContent>
              </Select>
              {projects.length > 1 && (
                <Select value={projectFilter} onValueChange={setProjectFilter}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue placeholder="Project" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Projects</SelectItem>
                    {projects.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Case Cards - Mobile-first CommCare-style list */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filteredCases.length === 0 ? (
        <Card className="border-0 shadow-card">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Briefcase className="h-16 w-16 text-muted-foreground/30 mb-4" />
            <h3 className="font-display text-lg font-semibold text-foreground">No Cases Found</h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-sm">
              Cases are automatically created when you submit registration forms.
              Fill out a form with case registration enabled to get started.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filteredCases.map((caseItem) => (
            <Card
              key={caseItem.id}
              className="border-0 shadow-card transition-all duration-200 hover:shadow-glow/10 cursor-pointer active:scale-[0.99]"
              onClick={() => setSelectedCaseId(caseItem.id)}
            >
              <CardContent className="p-3 sm:p-4">
                <div className="flex items-start gap-3">
                  {/* Avatar / Icon */}
                  <div className={`flex h-10 w-10 sm:h-12 sm:w-12 shrink-0 items-center justify-center rounded-full ${
                    caseItem.status === "open"
                      ? "bg-primary/10"
                      : "bg-muted"
                  }`}>
                    <User className={`h-5 w-5 sm:h-6 sm:w-6 ${
                      caseItem.status === "open" ? "text-primary" : "text-muted-foreground"
                    }`} />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="font-medium text-sm sm:text-base text-foreground truncate">
                          {caseItem.name}
                        </h3>
                        <div className="flex flex-wrap items-center gap-1.5 mt-1">
                          <Badge variant="outline" className="text-[10px] sm:text-xs px-1.5 py-0">
                            {caseItem.caseTypeLabel}
                          </Badge>
                          <Badge
                            variant={caseItem.status === "open" ? "default" : "secondary"}
                            className="text-[10px] sm:text-xs px-1.5 py-0"
                          >
                            {caseItem.status === "open" ? "Open" : "Closed"}
                          </Badge>
                        </div>
                      </div>

                      {/* Actions */}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={(e) => {
                            e.stopPropagation();
                            setSelectedCaseId(caseItem.id);
                          }}>
                            <Eye className="h-4 w-4 mr-2" />
                            View Details
                          </DropdownMenuItem>
                          {caseItem.status === "open" && (
                            <DropdownMenuItem onClick={(e) => {
                              e.stopPropagation();
                              handleCloseCase(caseItem.id);
                            }}>
                              <XCircle className="h-4 w-4 mr-2" />
                              Close Case
                            </DropdownMenuItem>
                          )}
                          {caseItem.status === "closed" && (
                            <DropdownMenuItem onClick={(e) => {
                              e.stopPropagation();
                              handleReopenCase(caseItem.id);
                            }}>
                              <RefreshCw className="h-4 w-4 mr-2" />
                              Reopen Case
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>

                    {/* Case Properties Preview - CommCare style */}
                    {Object.keys(caseItem.properties).length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                        {getPropertyPreview(caseItem.properties).map(([key, value]) => (
                          <span key={key} className="text-xs text-muted-foreground">
                            <span className="capitalize">{key.replace(/_/g, " ")}</span>:{" "}
                            <span className="font-medium text-foreground">{String(value)}</span>
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Footer metadata */}
                    <div className="flex items-center gap-3 mt-2 text-[10px] sm:text-xs text-muted-foreground">
                      {caseItem.projectName && (
                        <span className="flex items-center gap-1">
                          <FileText className="h-3 w-3" />
                          {caseItem.projectName}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {format(new Date(caseItem.openedAt), "MMM d, yyyy")}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {getTimeSince(caseItem.lastModifiedAt)}
                      </span>
                    </div>
                  </div>

                  <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0 hidden sm:block mt-2" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Case Details Dialog */}
      <CaseDetails
        open={!!selectedCaseId}
        onOpenChange={(open) => !open && setSelectedCaseId(null)}
        caseId={selectedCaseId || undefined}
      />
    </div>
  );
};

export default CasesView;

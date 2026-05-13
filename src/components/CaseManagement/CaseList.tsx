import { useState, useEffect, useCallback, useMemo } from "react";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";
import TablePagination from "@/components/ui/table-pagination";

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
}

interface CaseListProps {
  projectId?: string;
  onSelectCase?: (caseItem: Case) => void;
  onFillForm?: (caseItem: Case, formId: string) => void;
  selectable?: boolean;
}

/**
 * Server-paginated case list. Only the current page is fetched, so the UI
 * stays fast on mid-range Android even when the project has millions of cases.
 * - Search uses server-side ILIKE on `name`
 * - Status / case-type filters run server-side
 * - Total row count comes from Postgres `count: 'exact'`
 */
const CaseList = ({
  projectId,
  onSelectCase,
  onFillForm,
  selectable = false,
}: CaseListProps) => {
  const { profile } = useAuth();
  const [cases, setCases] = useState<Case[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [loading, setLoading] = useState(true);

  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "open" | "closed">("open");
  const [caseTypeFilter, setCaseTypeFilter] = useState<string>("all");
  const [caseTypes, setCaseTypes] = useState<{ id: string; name: string; label: string }[]>([]);

  const [page, setPage] = useState(1); // 1-indexed
  const [pageSize, setPageSize] = useState(20);

  // Debounce search input → avoids one query per keystroke
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery.trim()), 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  // Reset to page 1 whenever filters change
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, statusFilter, caseTypeFilter, projectId]);

  const fetchCaseTypes = useCallback(async () => {
    if (!projectId) return;
    try {
      const { data, error } = await supabase
        .from("case_types")
        .select("id, name, label")
        .eq("project_id", projectId);
      if (error) throw error;
      setCaseTypes(data || []);
    } catch (error) {
      console.error("Error fetching case types:", error);
    }
  }, [projectId]);

  useEffect(() => { fetchCaseTypes(); }, [fetchCaseTypes]);

  const fetchCases = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      let query = supabase
        .from("cases")
        .select(
          `*, case_types!inner(name, label)`,
          { count: "exact" }
        )
        .eq("project_id", projectId)
        .order("last_modified_at", { ascending: false })
        .range(from, to);

      if (statusFilter !== "all") query = query.eq("status", statusFilter);
      if (caseTypeFilter !== "all") query = query.eq("case_types.name", caseTypeFilter);
      if (debouncedSearch) query = query.ilike("name", `%${debouncedSearch}%`);

      const { data, error, count } = await query;
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
      }));

      setCases(formattedCases);
      setTotalItems(count ?? formattedCases.length);
    } catch (error) {
      console.error("Error fetching cases:", error);
    } finally {
      setLoading(false);
    }
  }, [projectId, page, pageSize, statusFilter, caseTypeFilter, debouncedSearch]);

  useEffect(() => { fetchCases(); }, [fetchCases]);

  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const startIndex = (page - 1) * pageSize;
  const hasPrev = page > 1;
  const hasNext = page < totalPages;

  const handleCloseCase = async (caseId: string) => {
    try {
      const { error } = await supabase
        .from("cases")
        .update({
          status: "closed",
          closed_at: new Date().toISOString(),
          closed_by: profile?.user_id,
          last_modified_by: profile?.user_id,
        })
        .eq("id", caseId);
      if (error) throw error;
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
          last_modified_by: profile?.user_id,
        })
        .eq("id", caseId);
      if (error) throw error;
      fetchCases();
    } catch (error) {
      console.error("Error reopening case:", error);
    }
  };

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Briefcase className="h-5 w-5 text-primary" />
              Case List
            </CardTitle>
            <CardDescription>
              Manage and track cases for follow-up visits
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={fetchCases}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3 mt-4">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search cases..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
            <SelectTrigger className="w-[130px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="closed">Closed</SelectItem>
            </SelectContent>
          </Select>
          <Select value={caseTypeFilter} onValueChange={setCaseTypeFilter}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Case Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {caseTypes.map((ct) => (
                <SelectItem key={ct.id} value={ct.name}>
                  {ct.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>

      <CardContent className="flex-1 overflow-hidden p-0">
        <ScrollArea className="h-full">
          {loading ? (
            <div className="flex items-center justify-center h-40">
              <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : cases.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-center p-6">
              <Briefcase className="h-12 w-12 text-muted-foreground/50 mb-3" />
              <p className="text-muted-foreground">No cases found</p>
              <p className="text-sm text-muted-foreground/70 mt-1">
                Cases will appear here when registered through forms
              </p>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Case Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Opened</TableHead>
                    <TableHead>Last Modified</TableHead>
                    <TableHead className="w-[70px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cases.map((caseItem) => (
                    <TableRow
                      key={caseItem.id}
                      className={selectable ? "cursor-pointer hover:bg-muted/50" : ""}
                      onClick={() => selectable && onSelectCase?.(caseItem)}
                    >
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-muted-foreground" />
                          {caseItem.name}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{caseItem.caseTypeLabel}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={caseItem.status === "open" ? "default" : "secondary"}
                        >
                          {caseItem.status === "open" ? "Open" : "Closed"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {format(new Date(caseItem.openedAt), "MMM d, yyyy")}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {format(new Date(caseItem.lastModifiedAt), "MMM d, yyyy")}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem>
                              <Eye className="h-4 w-4 mr-2" />
                              View Details
                            </DropdownMenuItem>
                            {caseItem.status === "open" && (
                              <>
                                <DropdownMenuItem>
                                  <Edit className="h-4 w-4 mr-2" />
                                  Follow-up
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleCloseCase(caseItem.id);
                                  }}
                                >
                                  <XCircle className="h-4 w-4 mr-2" />
                                  Close Case
                                </DropdownMenuItem>
                              </>
                            )}
                            {caseItem.status === "closed" && (
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleReopenCase(caseItem.id);
                                }}
                              >
                                <RefreshCw className="h-4 w-4 mr-2" />
                                Reopen Case
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <TablePagination
                currentPage={page}
                totalPages={totalPages}
                totalItems={totalItems}
                startIndex={startIndex}
                pageSize={pageSize}
                hasPrev={hasPrev}
                hasNext={hasNext}
                onPrev={() => setPage((p) => Math.max(1, p - 1))}
                onNext={() => setPage((p) => Math.min(totalPages, p + 1))}
                onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}
              />
            </>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
};

export default CaseList;

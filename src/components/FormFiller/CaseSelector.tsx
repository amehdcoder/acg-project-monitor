import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Search,
  User,
  Calendar,
  Clock,
  ChevronRight,
  Briefcase,
  Plus,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Json } from "@/integrations/supabase/types";

interface Case {
  id: string;
  name: string;
  status: string;
  caseTypeName: string;
  caseTypeLabel: string;
  openedAt: string;
  lastModifiedAt: string;
  properties: Record<string, unknown>;
}

interface CaseSelectorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  caseTypeId?: string;
  onSelectCase: (caseData: Case) => void;
  onCreateNewCase?: () => void;
  allowNewCase?: boolean;
}

// Helper to safely parse JSON properties
const parseProperties = (props: Json | null): Record<string, unknown> => {
  if (!props || typeof props !== "object" || Array.isArray(props)) {
    return {};
  }
  return props as Record<string, unknown>;
};

const CaseSelector = ({
  open,
  onOpenChange,
  projectId,
  caseTypeId,
  onSelectCase,
  onCreateNewCase,
  allowNewCase = false,
}: CaseSelectorProps) => {
  const [cases, setCases] = useState<Case[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (open && projectId) {
      fetchCases();
    }
  }, [open, projectId, caseTypeId]);

  const fetchCases = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from("cases")
        .select(`
          id,
          name,
          status,
          opened_at,
          last_modified_at,
          properties,
          case_types!inner (
            id,
            name,
            label
          )
        `)
        .eq("project_id", projectId)
        .eq("status", "open")
        .order("last_modified_at", { ascending: false });

      if (caseTypeId) {
        query = query.eq("case_type_id", caseTypeId);
      }

      const { data, error } = await query;

      if (error) throw error;

      setCases(
        (data || []).map((c) => {
          const caseType = c.case_types as unknown as { id: string; name: string; label: string };
          return {
            id: c.id,
            name: c.name,
            status: c.status,
            caseTypeName: caseType?.name || "",
            caseTypeLabel: caseType?.label || "",
            openedAt: c.opened_at,
            lastModifiedAt: c.last_modified_at,
            properties: parseProperties(c.properties),
          };
        })
      );
    } catch (error) {
      console.error("Error fetching cases:", error);
      toast({
        title: "Error",
        description: "Failed to load cases.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const filteredCases = cases.filter((c) =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const getTimeSince = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    if (days === 0) return "Today";
    if (days === 1) return "Yesterday";
    if (days < 7) return `${days} days ago`;
    if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
    return `${Math.floor(days / 30)} months ago`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Briefcase className="h-5 w-5 text-primary" />
            Select a Case
          </DialogTitle>
          <DialogDescription>
            Choose an existing case to follow up on
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search cases..."
              className="pl-9"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {/* New Case Button */}
          {allowNewCase && onCreateNewCase && (
            <Button
              variant="outline"
              className="w-full justify-start gap-2"
              onClick={() => {
                onCreateNewCase();
                onOpenChange(false);
              }}
            >
              <Plus className="h-4 w-4" />
              Register New Case
            </Button>
          )}

          {/* Cases List */}
          <ScrollArea className="h-[400px] pr-4">
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-20 w-full" />
                ))}
              </div>
            ) : filteredCases.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center">
                  <Briefcase className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
                  <p className="text-muted-foreground">
                    {searchQuery
                      ? "No cases match your search"
                      : "No open cases found"}
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {filteredCases.map((caseItem) => (
                  <Card
                    key={caseItem.id}
                    className="cursor-pointer transition-all hover:shadow-md hover:border-primary/50"
                    onClick={() => {
                      onSelectCase(caseItem);
                      onOpenChange(false);
                    }}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <User className="h-4 w-4 text-primary shrink-0" />
                            <span className="font-medium truncate">
                              {caseItem.name}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground">
                            <Badge variant="outline" className="text-xs">
                              {caseItem.caseTypeLabel}
                            </Badge>
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {formatDate(caseItem.openedAt)}
                            </span>
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {getTimeSince(caseItem.lastModifiedAt)}
                            </span>
                          </div>
                        </div>
                        <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CaseSelector;

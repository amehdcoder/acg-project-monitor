import { useState, useEffect } from "react";
import { ArrowLeft, BarChart3, Search } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { DashboardBuilder } from "@/components/DashboardBuilder";

interface FormInfo {
  id: string;
  name: string;
  description: string | null;
  project_id: string;
  project_name?: string;
  status: string;
}

interface AdminDashboardBuilderProps {
  onBack?: () => void;
}

const AdminDashboardBuilder = ({ onBack }: AdminDashboardBuilderProps) => {
  const [forms, setForms] = useState<FormInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedForm, setSelectedForm] = useState<FormInfo | null>(null);

  useEffect(() => {
    fetchForms();
  }, []);

  const fetchForms = async () => {
    try {
      // Fetch all forms with their project names
      const { data: formsData, error: formsError } = await supabase
        .from("forms")
        .select("id, name, description, project_id, status")
        .order("name");

      if (formsError) throw formsError;

      if (formsData && formsData.length > 0) {
        // Get unique project IDs
        const projectIds = [...new Set(formsData.map(f => f.project_id))];
        
        const { data: projectsData } = await supabase
          .from("projects")
          .select("id, name")
          .in("id", projectIds);

        const projectNameMap = new Map(projectsData?.map(p => [p.id, p.name]) || []);

        const formsWithProjects: FormInfo[] = formsData.map(form => ({
          ...form,
          project_name: projectNameMap.get(form.project_id) || "Unknown Project",
        }));

        setForms(formsWithProjects);
      }
    } catch (error) {
      console.error("Error fetching forms:", error);
    } finally {
      setLoading(false);
    }
  };

  const filteredForms = forms.filter(form =>
    form.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    form.project_name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (selectedForm) {
    return (
      <DashboardBuilder
        formId={selectedForm.id}
        formName={selectedForm.name}
        isAdmin={true}
        onBack={() => setSelectedForm(null)}
      />
    );
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          {onBack && (
            <Button variant="ghost" size="icon" onClick={onBack}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
          )}
          <div>
            <h1 className="font-display text-2xl font-bold text-foreground">
              Custom Dashboard Builder
            </h1>
            <p className="text-sm text-muted-foreground">
              Select a form to create custom analytics dashboards
            </p>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search forms or projects..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Forms Grid */}
      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader>
                <div className="h-5 bg-muted rounded w-3/4" />
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="h-4 bg-muted rounded w-1/2" />
                  <div className="h-4 bg-muted rounded w-2/3" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filteredForms.length === 0 ? (
        <Card className="p-8 text-center">
          <BarChart3 className="mx-auto h-12 w-12 text-muted-foreground/50" />
          <h3 className="mt-4 font-semibold text-foreground">No Forms Found</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            {searchQuery
              ? "No forms match your search criteria."
              : "Create forms first to build custom dashboards."}
          </p>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredForms.map((form) => (
            <Card
              key={form.id}
              className="cursor-pointer transition-all duration-200 hover:shadow-md hover:border-primary/30"
              onClick={() => setSelectedForm(form)}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base font-semibold leading-tight">
                    {form.name}
                  </CardTitle>
                  <Badge
                    variant={form.status === "active" ? "default" : "secondary"}
                    className="shrink-0"
                  >
                    {form.status}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {form.description || "No description available"}
                  </p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground/70">Project:</span>
                    <span className="truncate">{form.project_name}</span>
                  </div>
                </div>
                <div className="mt-4 flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-primary" />
                  <span className="text-sm text-primary font-medium">
                    Build Dashboard
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default AdminDashboardBuilder;

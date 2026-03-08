import { useState, useEffect, useMemo } from "react";
import { FolderOpen, ChevronDown, ChevronRight, Loader2, ChevronsUpDown } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import FormSubmissionsAccordion from "./FormSubmissionsAccordion";
import type { FormAnalytics } from "@/hooks/useDataAnalytics";

interface ProjectWithForms {
  id: string;
  name: string;
  forms: FormAnalytics[];
}

const ProjectSubmissionsBrowser = () => {
  const { user, isAdmin } = useAuth();
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<ProjectWithForms[]>([]);
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());
  const [profiles, setProfiles] = useState<Map<string, string>>(new Map());

  // Fetch all projects, their forms, and profiles
  useEffect(() => {
    if (!user) return;

    const fetchData = async () => {
      setLoading(true);
      try {
        // Fetch projects
        const { data: projectsData, error: projErr } = await supabase
          .from("projects")
          .select("id, name")
          .order("name");
        if (projErr) throw projErr;

        // Fetch all forms
        const { data: formsData, error: formsErr } = await supabase
          .from("forms")
          .select("id, name, questions, project_id")
          .order("name");
        if (formsErr) throw formsErr;

        // Fetch submission counts per form
        const formIds = (formsData || []).map((f) => f.id);
        let countMap: Record<string, number> = {};
        if (formIds.length > 0) {
          const { data: subs } = await supabase
            .from("form_submissions")
            .select("form_id")
            .in("form_id", formIds);
          (subs || []).forEach((s) => {
            countMap[s.form_id] = (countMap[s.form_id] || 0) + 1;
          });
        }

        // Fetch profiles for name resolution
        const { data: profilesData } = await supabase
          .from("profiles")
          .select("user_id, first_name, last_name");
        const profileMap = new Map<string, string>();
        (profilesData || []).forEach((p) => {
          profileMap.set(p.user_id, `${p.first_name} ${p.last_name}`.trim());
        });
        setProfiles(profileMap);

        // Build project → forms hierarchy
        const formsByProject: Record<string, FormAnalytics[]> = {};
        (formsData || []).forEach((f) => {
          if (!formsByProject[f.project_id]) formsByProject[f.project_id] = [];
          formsByProject[f.project_id].push({
            id: f.id,
            name: f.name,
            total_submissions: countMap[f.id] || 0,
            current_cycle_submissions: 0,
            questions: Array.isArray(f.questions) ? (f.questions as any[]) : [],
          });
        });

        const projectsList: ProjectWithForms[] = (projectsData || [])
          .map((p) => ({
            id: p.id,
            name: p.name,
            forms: formsByProject[p.id] || [],
          }))
          .filter((p) => p.forms.length > 0);

        setProjects(projectsList);
      } catch (err) {
        console.error("Error loading project browser:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [user, isAdmin]);

  const toggleProject = (projectId: string) => {
    setExpandedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      return next;
    });
  };

  const totalSubmissions = useMemo(
    () => projects.reduce((sum, p) => sum + p.forms.reduce((s, f) => s + f.total_submissions, 0), 0),
    [projects]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-3 text-muted-foreground">Loading projects…</span>
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        No projects with forms found.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {projects.length} project{projects.length !== 1 ? "s" : ""} · {totalSubmissions.toLocaleString()} total submissions
        </p>
      </div>

      {projects.map((project) => {
        const isExpanded = expandedProjects.has(project.id);
        const projectTotal = project.forms.reduce((s, f) => s + f.total_submissions, 0);

        return (
          <Card key={project.id} className="border shadow-sm">
            <button
              className="w-full flex items-center justify-between p-4 hover:bg-muted/30 transition-colors text-left"
              onClick={() => toggleProject(project.id)}
            >
              <div className="flex items-center gap-3">
                {isExpanded ? (
                  <ChevronDown className="h-5 w-5 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                )}
                <FolderOpen className="h-5 w-5 text-primary" />
                <span className="font-semibold text-foreground text-base">{project.name}</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">
                  {project.forms.length} form{project.forms.length !== 1 ? "s" : ""}
                </Badge>
                <Badge variant="secondary" className="text-xs">
                  {projectTotal.toLocaleString()} submissions
                </Badge>
              </div>
            </button>

            {isExpanded && (
              <CardContent className="pt-0 pb-4 space-y-3">
                {project.forms.map((form) => (
                  <FormSubmissionsAccordion
                    key={form.id}
                    form={form}
                    profiles={profiles}
                  />
                ))}
              </CardContent>
            )}
          </Card>
        );
      })}
    </div>
  );
};

export default ProjectSubmissionsBrowser;

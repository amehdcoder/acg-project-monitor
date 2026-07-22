import { useState, useMemo, forwardRef, useImperativeHandle } from "react";
import { FolderOpen, ChevronDown, ChevronRight, Loader2, ChevronsUpDown } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import FormSubmissionsAccordion from "./FormSubmissionsAccordion";
import type { FormAnalytics } from "@/hooks/useDataAnalytics";

interface ProjectWithForms {
  id: string;
  name: string;
  forms: FormAnalytics[];
}

export interface ProjectSubmissionsBrowserHandle {
  refresh: () => Promise<void>;
}

interface BrowserPayload {
  projects: ProjectWithForms[];
  profiles: Map<string, string>;
}

const ProjectSubmissionsBrowser = forwardRef<ProjectSubmissionsBrowserHandle>((_, ref) => {
  const { user, isAdmin } = useAuth();
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());

  // Single TanStack Query key — identical concurrent mounts across tabs/dashboards
  // dedupe automatically; 60s staleTime / 5min gcTime inherited from QueryClient.
  const {
    data,
    isLoading,
    refetch,
  } = useQuery<BrowserPayload>({
    queryKey: ["project-submissions-browser", user?.id ?? null, isAdmin],
    enabled: !!user,
    queryFn: async () => {
      const [{ data: projectsData, error: projErr }, { data: formsData, error: formsErr }, { data: profilesData }] =
        await Promise.all([
          supabase.from("projects").select("id, name").order("name"),
          supabase.from("forms").select("id, name, questions, project_id").order("name"),
          supabase.from("profiles").select("user_id, first_name, last_name"),
        ]);
      if (projErr) throw projErr;
      if (formsErr) throw formsErr;

      const formIds = (formsData || []).map((f) => f.id);
      const countMap: Record<string, number> = {};
      if (formIds.length > 0) {
        const { data: counts, error: countErr } = await (supabase as any).rpc(
          "visible_form_submission_counts",
          { _form_ids: formIds },
        );
        if (countErr) throw countErr;
        (counts || []).forEach((row: any) => {
          countMap[row.form_id] = Number(row.total || 0);
        });
      }

      const profileMap = new Map<string, string>();
      (profilesData || []).forEach((p: any) => {
        profileMap.set(p.user_id, `${p.first_name} ${p.last_name}`.trim());
      });

      const formsByProject: Record<string, FormAnalytics[]> = {};
      (formsData || []).forEach((f: any) => {
        if (!formsByProject[f.project_id]) formsByProject[f.project_id] = [];
        formsByProject[f.project_id].push({
          id: f.id,
          name: f.name,
          total_submissions: countMap[f.id] || 0,
          current_cycle_submissions: 0,
          questions: Array.isArray(f.questions) ? (f.questions as any[]) : [],
        });
      });

      const projects: ProjectWithForms[] = (projectsData || [])
        .map((p: any) => ({ id: p.id, name: p.name, forms: formsByProject[p.id] || [] }))
        .filter((p) => p.forms.length > 0);

      return { projects, profiles: profileMap };
    },
  });

  const projects = data?.projects ?? [];
  const profiles = data?.profiles ?? new Map<string, string>();

  useImperativeHandle(ref, () => ({ refresh: async () => { await refetch(); } }), [refetch]);

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

  if (isLoading) {
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

  const allExpanded = expandedProjects.size === projects.length;

  const toggleAll = () => {
    if (allExpanded) setExpandedProjects(new Set());
    else setExpandedProjects(new Set(projects.map((p) => p.id)));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {projects.length} project{projects.length !== 1 ? "s" : ""} · {totalSubmissions.toLocaleString()} total submissions
        </p>
        <Button variant="outline" size="sm" onClick={toggleAll} className="gap-1.5">
          <ChevronsUpDown className="h-4 w-4" />
          {allExpanded ? "Collapse All" : "Expand All"}
        </Button>
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
});

ProjectSubmissionsBrowser.displayName = "ProjectSubmissionsBrowser";

export default ProjectSubmissionsBrowser;

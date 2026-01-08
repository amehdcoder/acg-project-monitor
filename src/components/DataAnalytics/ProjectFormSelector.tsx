import { FolderOpen, FileText, ArrowRight, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface ProjectFormSelectorProps {
  projects: { id: string; name: string }[];
  forms: { id: string; name: string; total_submissions: number }[];
  selectedProjectId?: string;
  selectedFormId?: string;
  onSelectProject: (projectId: string) => void;
  onSelectForm: (formId: string) => void;
  onBack: () => void;
  loading?: boolean;
}

const ProjectFormSelector = ({
  projects,
  forms,
  selectedProjectId,
  selectedFormId,
  onSelectProject,
  onSelectForm,
  onBack,
  loading,
}: ProjectFormSelectorProps) => {
  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Show projects list
  if (!selectedProjectId) {
    return (
      <div className="space-y-4">
        <h2 className="font-display text-xl font-semibold text-foreground">
          Select a Project
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <Card
              key={project.id}
              className="cursor-pointer border-0 shadow-soft hover:shadow-card transition-all hover:-translate-y-0.5"
              onClick={() => onSelectProject(project.id)}
            >
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                    <FolderOpen className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-foreground truncate">{project.name}</h3>
                    <p className="text-sm text-muted-foreground">Click to view forms</p>
                  </div>
                  <ArrowRight className="h-5 w-5 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
        {projects.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <FolderOpen className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No projects found. Create a project first.</p>
          </div>
        )}
      </div>
    );
  }

  // Show forms list for selected project
  if (!selectedFormId) {
    const selectedProject = projects.find((p) => p.id === selectedProjectId);
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onBack}>
            ← Back to Projects
          </Button>
        </div>
        <h2 className="font-display text-xl font-semibold text-foreground">
          Forms in {selectedProject?.name || "Project"}
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {forms.map((form) => (
            <Card
              key={form.id}
              className="cursor-pointer border-0 shadow-soft hover:shadow-card transition-all hover:-translate-y-0.5"
              onClick={() => onSelectForm(form.id)}
            >
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-acg-gold/10">
                    <FileText className="h-5 w-5 text-acg-gold" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-foreground truncate">{form.name}</h3>
                    <p className="text-sm text-muted-foreground">
                      {form.total_submissions} submissions
                    </p>
                  </div>
                  <ArrowRight className="h-5 w-5 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
        {forms.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No forms found in this project.</p>
          </div>
        )}
      </div>
    );
  }

  return null;
};

export default ProjectFormSelector;

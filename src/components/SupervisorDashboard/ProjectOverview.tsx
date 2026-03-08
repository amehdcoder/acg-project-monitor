import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { FolderOpen, Users, Activity, ShieldCheck } from "lucide-react";
import { ProjectSummary } from "@/hooks/useSupervisorDashboard";

interface Props {
  projects: ProjectSummary[];
}

const ProjectOverview = ({ projects }: Props) => {
  if (projects.length === 0) {
    return (
      <Card className="border-0 shadow-card">
        <CardContent className="p-6 text-center">
          <FolderOpen className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No active projects with assigned enumerators</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-0 shadow-card">
      <CardHeader className="pb-3">
        <CardTitle className="font-display text-lg flex items-center gap-2">
          <FolderOpen className="h-5 w-5 text-primary" />
          Project Overview
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {projects.map((project) => (
            <div
              key={project.project_id}
              className="rounded-lg border border-border/50 p-4 hover:bg-muted/30 transition-colors"
            >
              <div className="flex items-start justify-between mb-3">
                <h3 className="font-medium text-foreground text-sm">{project.project_name}</h3>
                <Badge variant="outline" className="text-[10px]">
                  {project.active_today}/{project.total_enumerators} active
                </Badge>
              </div>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
                    <Users className="h-3 w-3" />
                    <span className="text-[10px] uppercase tracking-wider">Team</span>
                  </div>
                  <p className="font-display text-lg font-bold">{project.total_enumerators}</p>
                </div>
                <div>
                  <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
                    <Activity className="h-3 w-3" />
                    <span className="text-[10px] uppercase tracking-wider">Today</span>
                  </div>
                  <p className="font-display text-lg font-bold">{project.submissions_today}</p>
                </div>
                <div>
                  <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
                    <ShieldCheck className="h-3 w-3" />
                    <span className="text-[10px] uppercase tracking-wider">Compliance</span>
                  </div>
                  <p className={`font-display text-lg font-bold ${
                    project.compliance_rate >= 90 ? "text-green-600" :
                    project.compliance_rate >= 70 ? "text-amber-600" : "text-destructive"
                  }`}>
                    {project.compliance_rate}%
                  </p>
                </div>
              </div>
              <div className="mt-3">
                <Progress
                  value={(project.active_today / Math.max(project.total_enumerators, 1)) * 100}
                  className="h-1.5"
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  {Math.round((project.active_today / Math.max(project.total_enumerators, 1)) * 100)}% team active
                </p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

export default ProjectOverview;

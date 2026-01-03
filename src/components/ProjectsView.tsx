import { useState, useEffect } from "react";
import {
  FolderOpen,
  Plus,
  Users,
  FileText,
  Calendar,
  MapPin,
  MoreVertical,
  Settings,
  Trash2,
  Edit,
  ArrowRight,
  Loader2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface Project {
  id: string;
  name: string;
  description: string | null;
  status: string;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
  forms_count?: number;
  members_count?: number;
}

interface ProjectsViewProps {
  onSelectProject?: (projectId: string) => void;
}

const ProjectsView = ({ onSelectProject }: ProjectsViewProps) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newProject, setNewProject] = useState({ name: "", description: "", start_date: "", end_date: "" });
  const [creating, setCreating] = useState(false);
  const { user } = useAuth();

  useEffect(() => {
    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    try {
      setLoading(true);
      const { data: projectsData, error } = await supabase
        .from("projects")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Get forms count and members count for each project
      const projectsWithCounts = await Promise.all(
        (projectsData || []).map(async (project) => {
          const [formsResult, membersResult] = await Promise.all([
            supabase.from("forms").select("id", { count: "exact" }).eq("project_id", project.id),
            supabase.from("user_project_assignments").select("id", { count: "exact" }).eq("project_id", project.id),
          ]);
          return {
            ...project,
            forms_count: formsResult.count || 0,
            members_count: membersResult.count || 0,
          };
        })
      );

      setProjects(projectsWithCounts);
    } catch (error: any) {
      console.error("Error fetching projects:", error);
      toast({
        title: "Error loading projects",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateProject = async () => {
    if (!newProject.name.trim()) {
      toast({ title: "Project name is required", variant: "destructive" });
      return;
    }

    try {
      setCreating(true);
      const { error } = await supabase.from("projects").insert({
        name: newProject.name,
        description: newProject.description || null,
        start_date: newProject.start_date || null,
        end_date: newProject.end_date || null,
        created_by: user?.id,
      });

      if (error) throw error;

      toast({ title: "Project created successfully" });
      setShowCreateDialog(false);
      setNewProject({ name: "", description: "", start_date: "", end_date: "" });
      fetchProjects();
    } catch (error: any) {
      console.error("Error creating project:", error);
      toast({
        title: "Error creating project",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteProject = async (projectId: string) => {
    try {
      const { error } = await supabase.from("projects").delete().eq("id", projectId);
      if (error) throw error;
      toast({ title: "Project deleted successfully" });
      fetchProjects();
    } catch (error: any) {
      toast({
        title: "Error deleting project",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const filteredProjects = projects.filter((project) =>
    project.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active":
        return "bg-green-100 text-green-700";
      case "completed":
        return "bg-blue-100 text-blue-700";
      case "paused":
        return "bg-yellow-100 text-yellow-700";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  const getProjectColor = (index: number) => {
    const colors = ["bg-green-500", "bg-blue-500", "bg-acg-gold", "bg-purple-500", "bg-pink-500"];
    return colors[index % colors.length];
  };

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 lg:p-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground lg:text-3xl">
            Projects
          </h1>
          <p className="text-muted-foreground">
            Manage your monitoring and supervision projects
          </p>
        </div>
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogTrigger asChild>
            <Button variant="acg" size="lg">
              <Plus className="h-5 w-5" />
              New Project
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Project</DialogTitle>
              <DialogDescription>
                Add a new monitoring or supervision project
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">Project Name *</Label>
                <Input
                  id="name"
                  placeholder="Enter project name"
                  value={newProject.name}
                  onChange={(e) => setNewProject({ ...newProject, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  placeholder="Enter project description"
                  value={newProject.description}
                  onChange={(e) => setNewProject({ ...newProject, description: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="start_date">Start Date</Label>
                  <Input
                    id="start_date"
                    type="date"
                    value={newProject.start_date}
                    onChange={(e) => setNewProject({ ...newProject, start_date: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="end_date">End Date</Label>
                  <Input
                    id="end_date"
                    type="date"
                    value={newProject.end_date}
                    onChange={(e) => setNewProject({ ...newProject, end_date: e.target.value })}
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                Cancel
              </Button>
              <Button variant="acg" onClick={handleCreateProject} disabled={creating}>
                {creating && <Loader2 className="h-4 w-4 animate-spin" />}
                Create Project
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Input
          placeholder="Search projects..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {/* Projects Grid */}
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {filteredProjects.map((project, index) => (
          <Card
            key={project.id}
            className="group border-0 shadow-card overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-glow/10"
          >
            <div className={`h-2 ${getProjectColor(index)}`} />
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                    <FolderOpen className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="font-display text-lg line-clamp-1">
                      {project.name}
                    </CardTitle>
                    <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${getStatusColor(project.status)}`}>
                      {project.status}
                    </span>
                  </div>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => onSelectProject?.(project.id)}>
                      <ArrowRight className="mr-2 h-4 w-4" />
                      View Forms
                    </DropdownMenuItem>
                    <DropdownMenuItem>
                      <Edit className="mr-2 h-4 w-4" />
                      Edit Project
                    </DropdownMenuItem>
                    <DropdownMenuItem>
                      <Settings className="mr-2 h-4 w-4" />
                      Settings
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => handleDeleteProject(project.id)}
                      className="text-destructive"
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground line-clamp-2">
                {project.description || "No description"}
              </p>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-muted/50 p-2 text-center">
                  <FileText className="mx-auto h-4 w-4 text-primary" />
                  <p className="mt-1 text-lg font-semibold text-foreground">
                    {project.forms_count}
                  </p>
                  <p className="text-xs text-muted-foreground">Forms</p>
                </div>
                <div className="rounded-lg bg-muted/50 p-2 text-center">
                  <Users className="mx-auto h-4 w-4 text-acg-gold" />
                  <p className="mt-1 text-lg font-semibold text-foreground">
                    {project.members_count}
                  </p>
                  <p className="text-xs text-muted-foreground">Members</p>
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-border pt-3 text-xs text-muted-foreground">
                {project.start_date && (
                  <div className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {new Date(project.start_date).toLocaleDateString()}
                  </div>
                )}
                <div className="flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  Created {new Date(project.created_at).toLocaleDateString()}
                </div>
              </div>

              <Button 
                variant="outline" 
                className="w-full" 
                onClick={() => onSelectProject?.(project.id)}
              >
                <ArrowRight className="h-4 w-4" />
                Open Project
              </Button>
            </CardContent>
          </Card>
        ))}

        {/* Add Project Card */}
        <Card 
          className="flex min-h-[300px] cursor-pointer items-center justify-center border-2 border-dashed border-border bg-transparent transition-all duration-200 hover:border-acg-gold/50 hover:bg-muted/30"
          onClick={() => setShowCreateDialog(true)}
        >
          <div className="text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-muted">
              <Plus className="h-8 w-8 text-muted-foreground" />
            </div>
            <p className="mt-4 font-medium text-muted-foreground">
              Create New Project
            </p>
          </div>
        </Card>
      </div>

      {filteredProjects.length === 0 && !loading && (
        <div className="flex h-48 flex-col items-center justify-center text-center">
          <FolderOpen className="h-12 w-12 text-muted-foreground/50" />
          <h3 className="mt-4 font-display text-lg font-semibold text-foreground">
            No projects found
          </h3>
          <p className="mt-1 text-muted-foreground">
            Create your first project to get started
          </p>
        </div>
      )}
    </div>
  );
};

export default ProjectsView;

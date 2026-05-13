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
  TrendingUp,
  ClipboardList,
  MessageCircle,
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
import { useAdminSurveillance } from "@/hooks/useAdminSurveillance";
import { ProjectChatDialog } from "@/components/ProjectChat";
import { useProjectUnreadCount } from "@/hooks/useProjectChat";

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
  entries_count?: number;
  recent_entries_count?: number;
  last_submission_at?: string | null;
  location_info?: string | null;
}

// Component to show chat button with unread badge
function ProjectChatButton({ projectId, projectName, onOpenChat }: { 
  projectId: string; 
  projectName: string;
  onOpenChat: (project: { id: string; name: string }) => void;
}) {
  const unreadCount = useProjectUnreadCount(projectId);
  
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => onOpenChat({ id: projectId, name: projectName })}
      className="flex-shrink-0 relative"
      title="Project Chat"
    >
      <MessageCircle className="h-5 w-5 text-primary" />
      {unreadCount > 0 && (
        <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-destructive text-destructive-foreground text-[10px] font-medium">
          {unreadCount > 99 ? "99+" : unreadCount}
        </span>
      )}
    </Button>
  );
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
  const [chatProject, setChatProject] = useState<{ id: string; name: string } | null>(null);
  const [chatProjectForms, setChatProjectForms] = useState<Array<{ id: string; name: string }>>([]);
  const { user, role, isSuperAdmin } = useAuth();
  const { logAction } = useAdminSurveillance();

  useEffect(() => {
    fetchProjects();
  }, []);

  // Fetch forms when chat project is selected
  useEffect(() => {
    if (!chatProject) {
      setChatProjectForms([]);
      return;
    }

    const fetchForms = async () => {
      const { data } = await supabase
        .from("forms")
        .select("id, name")
        .eq("project_id", chatProject.id)
        .order("name", { ascending: true });
      setChatProjectForms(data || []);
    };

    fetchForms();
  }, [chatProject]);

  const fetchProjects = async () => {
    try {
      setLoading(true);
      
      let projectsData;
      
      // Super admins see all projects; Systems admins only see assigned projects
      if (isSuperAdmin) {
        const { data, error } = await supabase
          .from("projects")
          .select("*")
          .order("created_at", { ascending: false });
        if (error) throw error;
        projectsData = data;
      } else if (role === "systems_admin") {
        // Systems admins see only projects they are assigned to
        const { data: assignments, error: assignError } = await supabase
          .from("user_project_assignments")
          .select("project_id")
          .eq("user_id", user?.id);
        
        if (assignError) throw assignError;
        
        if (assignments && assignments.length > 0) {
          const projectIds = assignments.map(a => a.project_id);
          const { data, error } = await supabase
            .from("projects")
            .select("*")
            .in("id", projectIds)
            .order("created_at", { ascending: false });
          if (error) throw error;
          projectsData = data;
        } else {
          projectsData = [];
        }
      } else {
        // Regular users also only see assigned projects
        const { data: assignments, error: assignError } = await supabase
          .from("user_project_assignments")
          .select("project_id")
          .eq("user_id", user?.id);
        
        if (assignError) throw assignError;
        
        if (assignments && assignments.length > 0) {
          const projectIds = assignments.map(a => a.project_id);
          const { data, error } = await supabase
            .from("projects")
            .select("*")
            .in("id", projectIds)
            .order("created_at", { ascending: false });
          if (error) throw error;
          projectsData = data;
        } else {
          projectsData = [];
        }
      }

      if (!projectsData) projectsData = [];

      // Calculate date for recent submissions (last 30 days)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      // Get detailed counts for each project
      const projectsWithCounts = await Promise.all(
        (projectsData || []).map(async (project) => {
          // Get forms for this project
          const { data: formsData } = await supabase
            .from("forms")
            .select("id")
            .eq("project_id", project.id);
          
          const formIds = formsData?.map(f => f.id) || [];
          
          // Get unique members assigned to forms in this project
          let uniqueMembersCount = 0;
          if (formIds.length > 0) {
            const { data: formAssignments } = await supabase
              .from("user_form_assignments")
              .select("user_id")
              .in("form_id", formIds);
            
            const uniqueUserIds = new Set(formAssignments?.map(a => a.user_id) || []);
            uniqueMembersCount = uniqueUserIds.size;
          }

          // Get submissions count and recent submissions
          let entriesCount = 0;
          let recentEntriesCount = 0;
          let lastSubmissionAt: string | null = null;
          let locationInfo: string | null = null;

          if (formIds.length > 0) {
            // Total submissions
            const { count: totalCount } = await supabase
              .from("form_submissions")
              .select("id", { count: "exact" })
              .in("form_id", formIds)
              .eq("status", "sent");
            
            entriesCount = totalCount || 0;

            // Recent submissions (last 30 days)
            const { count: recentCount } = await supabase
              .from("form_submissions")
              .select("id", { count: "exact" })
              .in("form_id", formIds)
              .eq("status", "sent")
              .gte("submitted_at", thirtyDaysAgo.toISOString());
            
            recentEntriesCount = recentCount || 0;

            // Get most recent submission for date and location
            const { data: latestSubmissions } = await supabase
              .from("form_submissions")
              .select("submitted_at, data, location")
              .in("form_id", formIds)
              .eq("status", "sent")
              .order("submitted_at", { ascending: false })
              .limit(1);

            const latestSubmission = latestSubmissions?.[0];
            if (latestSubmission) {
              lastSubmissionAt = latestSubmission.submitted_at;
              
              // Try to extract location from form data (State, LGA, Ward)
              const formData = latestSubmission.data as Record<string, any>;
              const state = formData?.state || formData?.State;
              const lga = formData?.lga || formData?.LGA;
              const ward = formData?.ward || formData?.Ward;
              const community = formData?.community || formData?.Community || formData?.settlement || formData?.Settlement;
              
              if (state || lga || ward || community) {
                const locationParts = [state, lga, ward, community].filter(Boolean);
                locationInfo = locationParts.slice(0, 2).join(", ");
              } else if (latestSubmission.location) {
                // Fall back to GPS coordinates display
                const loc = latestSubmission.location as Record<string, any>;
                if (loc.latitude && loc.longitude) {
                  locationInfo = `${loc.latitude.toFixed(4)}, ${loc.longitude.toFixed(4)}`;
                }
              }
            }
          }

          return {
            ...project,
            forms_count: formIds.length,
            members_count: uniqueMembersCount,
            entries_count: entriesCount,
            recent_entries_count: recentEntriesCount,
            last_submission_at: lastSubmissionAt,
            location_info: locationInfo,
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
      const project = projects.find(p => p.id === projectId);
      await logAction("delete_project", `Deleted project "${project?.name || projectId}"`, "project", projectId);
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
                  <Users className="mx-auto h-4 w-4 text-acg-gold" />
                  <p className="mt-1 text-lg font-semibold text-foreground">
                    {project.members_count}
                  </p>
                  <p className="text-xs text-muted-foreground">Members</p>
                </div>
                <div className="rounded-lg bg-muted/50 p-2 text-center">
                  <ClipboardList className="mx-auto h-4 w-4 text-primary" />
                  <div className="mt-1 flex items-center justify-center gap-1">
                    <span className="text-lg font-semibold text-foreground">
                      {project.entries_count || 0}
                    </span>
                    {(project.recent_entries_count || 0) > 0 && (
                      <span className="flex items-center gap-0.5 rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] font-medium text-green-700">
                        <TrendingUp className="h-2.5 w-2.5" />
                        +{project.recent_entries_count}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">Entries</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs text-muted-foreground">
                <div className="rounded-lg bg-muted/30 p-2">
                  <div className="flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    <span className="font-medium">Location</span>
                  </div>
                  <p className="mt-1 truncate" title={project.location_info || "No data"}>
                    {project.location_info || "No data"}
                  </p>
                </div>
                <div className="rounded-lg bg-muted/30 p-2">
                  <div className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    <span className="font-medium">Last Activity</span>
                  </div>
                  <p className="mt-1">
                    {project.last_submission_at
                      ? new Date(project.last_submission_at).toLocaleDateString("en-US", {
                          month: "short",
                          year: "numeric",
                        })
                      : "No submissions"}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 border-t border-border pt-3 text-xs text-muted-foreground">
                <FileText className="h-3 w-3" />
                <span>{project.forms_count} Form{project.forms_count !== 1 ? "s" : ""}</span>
                <span className="text-border">•</span>
                <span>Created {new Date(project.created_at).toLocaleDateString()}</span>
              </div>

              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  className="flex-1" 
                  onClick={() => onSelectProject?.(project.id)}
                >
                  <ArrowRight className="h-4 w-4" />
                  Open Project
                </Button>
                <ProjectChatButton 
                  projectId={project.id} 
                  projectName={project.name}
                  onOpenChat={setChatProject}
                />
              </div>
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
          <h2 className="mt-4 font-display text-lg font-semibold text-foreground">
            No projects found
          </h2>
          <p className="mt-1 text-muted-foreground">
            Create your first project to get started
          </p>
        </div>
      )}

      {/* Project Chat Dialog */}
      {chatProject && (
        <ProjectChatDialog
          projectId={chatProject.id}
          projectName={chatProject.name}
          forms={chatProjectForms}
          open={!!chatProject}
          onOpenChange={(open) => !open && setChatProject(null)}
        />
      )}
    </div>
  );
};

export default ProjectsView;

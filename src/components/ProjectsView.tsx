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
import ProjectScopeSelector from "@/components/ProjectsView/ProjectScopeSelector";
import { EMPTY_SCOPE, fetchProjectScope, type ProjectScope } from "@/lib/projectScope";
import { withTimeout, withTimeoutFallback } from "@/lib/withTimeout";

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
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => onOpenChat({ id: projectId, name: projectName })}
      className="flex-shrink-0 relative"
      title="Project Chat"
    >
      <MessageCircle className="h-5 w-5 text-primary" />
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
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [editForm, setEditForm] = useState({ name: "", description: "", start_date: "", end_date: "" });
  const [newScope, setNewScope] = useState<ProjectScope>({ ...EMPTY_SCOPE });
  const [editScope, setEditScope] = useState<ProjectScope>({ ...EMPTY_SCOPE });
  const [savingEdit, setSavingEdit] = useState(false);
  const [settingsProject, setSettingsProject] = useState<Project | null>(null);
  const [settingsForm, setSettingsForm] = useState<{ status: string }>({ status: "active" });
  const [savingSettings, setSavingSettings] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const { user, role, isSuperAdmin, isOwnerLevel, loading: authLoading } = useAuth();
  const { logAction } = useAdminSurveillance();

  const projectCacheKey = user?.id ? `amehnities:projects:list:${user.id}` : null;

  const readProjectCache = (): Project[] => {
    if (!projectCacheKey) return [];
    try {
      const cached = JSON.parse(localStorage.getItem(projectCacheKey) || "[]");
      return Array.isArray(cached) ? cached : [];
    } catch {
      return [];
    }
  };

  const writeProjectCache = (items: Project[]) => {
    if (!projectCacheKey) return;
    try {
      localStorage.setItem(projectCacheKey, JSON.stringify(items));
    } catch {
      /* storage can be unavailable; network data still renders */
    }
  };

  // Wait for auth (role / owner status) to resolve before the first fetch and
  // re-fetch when it changes. Fetching on mount alone ran the query while
  // `role` was still null, so a Super Admin / Co-owner could be silently
  // scoped to the assigned-only branch and see an empty project list.
  useEffect(() => {
    if (authLoading) return;
    const cached = readProjectCache();
    if (cached.length > 0) {
      setProjects(cached);
      setLoading(false);
    }
    fetchProjects();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user?.id, role, isSuperAdmin, isOwnerLevel]);

  // Fetch forms when chat project is selected
  useEffect(() => {
    if (!chatProject) {
      setChatProjectForms([]);
      return;
    }

    const fetchForms = async () => {
      const { data } = await withTimeoutFallback(
        supabase
          .from("forms")
          .select("id, name")
          .eq("project_id", chatProject.id)
          .order("name", { ascending: true }),
        7000,
        { data: [] } as any,
      );
      // The Geo-enabled Microplanning Entry form is a built-in tool (not a
      // forms-table row), so add it explicitly with a sentinel id so it can be
      // linked to a chat group like any other form.
      setChatProjectForms([
        ...(data || []),
        { id: "__microplan__", name: "Geo-enabled Microplanning Entry form" },
      ]);
    };

    fetchForms();
  }, [chatProject]);

  const fetchProjects = async () => {
    try {
      setLoading(true);

      // Let backend access rules decide which projects this user can see. The
      // previous client-side role branch could run while `role` was still null
      // after a slow auth/profile refresh, incorrectly showing Super Admins an
      // empty assigned-only project list. A single guarded projects query is both
      // faster and more reliable under high activity.
      const { data: projectsData, error } = await withTimeout(
        supabase
          .from("projects")
          .select("*")
          .order("created_at", { ascending: false }),
        12000,
        "projects_timeout",
      );
      if (error) throw error;

      if (!projectsData) projectsData = [];
      const baseProjects = (projectsData || []).map((project: Project) => ({
        ...project,
        forms_count: project.forms_count ?? 0,
        members_count: project.members_count ?? 0,
        entries_count: project.entries_count ?? 0,
        recent_entries_count: project.recent_entries_count ?? 0,
      }));
      setProjects(baseProjects);
      writeProjectCache(baseProjects);
      setLoadError(null);
      setLoading(false);

      // Best-effort lightweight enrichment. The project list must remain usable
      // even if analytics/count queries are slow during heavy traffic.
      void (async () => {
        const projectIds = baseProjects.map((p) => p.id);
        if (projectIds.length === 0) return;
        const [formsRes, membersRes] = await withTimeoutFallback(
          Promise.all([
            supabase.from("forms").select("id, project_id").in("project_id", projectIds),
            supabase.from("user_project_assignments").select("project_id, user_id").in("project_id", projectIds),
          ]),
          8000,
          [{ data: [] }, { data: [] }] as any,
        );
        const formRows = (formsRes.data || []) as Array<{ id: string; project_id: string }>;
        const memberRows = (membersRes.data || []) as Array<{ project_id: string; user_id: string }>;
        const formsByProject = new Map<string, number>();
        formRows.forEach((f) => formsByProject.set(f.project_id, (formsByProject.get(f.project_id) || 0) + 1));
        const membersByProject = new Map<string, Set<string>>();
        memberRows.forEach((m) => {
          const set = membersByProject.get(m.project_id) || new Set<string>();
          set.add(m.user_id);
          membersByProject.set(m.project_id, set);
        });
        setProjects((prev) => prev.map((p) => ({
          ...p,
          forms_count: formsByProject.get(p.id) ?? p.forms_count ?? 0,
          members_count: membersByProject.get(p.id)?.size ?? p.members_count ?? 0,
        })));
      })();
    } catch (error: any) {
      console.error("Error fetching projects:", error);
      const cached = readProjectCache();
      if (cached.length > 0) {
        setProjects(cached);
      }
      setLoadError(error?.message || "Project data is temporarily unavailable");
      toast({
        title: "Error loading projects",
        description: cached.length > 0 ? "Showing the last loaded project list while reconnecting." : error.message,
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
        scope_states: newScope.states,
        scope_lgas: newScope.lgas,
        scope_wards: newScope.wards,
      });

      if (error) throw error;

      toast({ title: "Project created successfully" });
      setShowCreateDialog(false);
      setNewProject({ name: "", description: "", start_date: "", end_date: "" });
      setNewScope({ ...EMPTY_SCOPE });
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

  const openEditDialog = (project: Project) => {
    setEditingProject(project);
    setEditForm({
      name: project.name,
      description: project.description ?? "",
      start_date: project.start_date ? project.start_date.slice(0, 10) : "",
      end_date: project.end_date ? project.end_date.slice(0, 10) : "",
    });
    setEditScope({ ...EMPTY_SCOPE });
    fetchProjectScope(project.id).then(setEditScope).catch(() => {});
  };

  const handleSaveEdit = async () => {
    if (!editingProject) return;
    if (!editForm.name.trim()) {
      toast({ title: "Project name is required", variant: "destructive" });
      return;
    }
    try {
      setSavingEdit(true);
      const { error } = await supabase
        .from("projects")
        .update({
          name: editForm.name.trim(),
          description: editForm.description || null,
          start_date: editForm.start_date || null,
          end_date: editForm.end_date || null,
          scope_states: editScope.states,
          scope_lgas: editScope.lgas,
          scope_wards: editScope.wards,
        })
        .eq("id", editingProject.id);
      if (error) throw error;
      await logAction("edit_project", `Edited project "${editForm.name}"`, "project", editingProject.id);
      toast({ title: "Project updated" });
      setEditingProject(null);
      fetchProjects();
    } catch (error: any) {
      toast({ title: "Error updating project", description: error.message, variant: "destructive" });
    } finally {
      setSavingEdit(false);
    }
  };

  const openSettingsDialog = (project: Project) => {
    setSettingsProject(project);
    setSettingsForm({ status: project.status || "active" });
  };

  const handleSaveSettings = async () => {
    if (!settingsProject) return;
    try {
      setSavingSettings(true);
      const { error } = await supabase
        .from("projects")
        .update({ status: settingsForm.status })
        .eq("id", settingsProject.id);
      if (error) throw error;
      await logAction("edit_project", `Updated settings for "${settingsProject.name}"`, "project", settingsProject.id);
      toast({ title: "Project settings saved" });
      setSettingsProject(null);
      fetchProjects();
    } catch (error: any) {
      toast({ title: "Error saving settings", description: error.message, variant: "destructive" });
    } finally {
      setSavingSettings(false);
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
          <DialogContent className="max-w-2xl w-[calc(100vw-2rem)] max-h-[90vh] overflow-y-auto">
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
              <div className="space-y-2">
                <Label>Geographic Scope (State / LGA / Ward)</Label>
                <ProjectScopeSelector value={newScope} onChange={setNewScope} />
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
                    <Button variant="ghost" size="icon" className="opacity-100 md:opacity-0 md:group-hover:opacity-100 focus:opacity-100">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => onSelectProject?.(project.id)}>
                      <ArrowRight className="mr-2 h-4 w-4" />
                      View Forms
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => openEditDialog(project)}>
                      <Edit className="mr-2 h-4 w-4" />
                      Edit Project
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => openSettingsDialog(project)}>
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

      {filteredProjects.length === 0 && (
        <div className="flex h-48 flex-col items-center justify-center text-center">
          <FolderOpen className="h-12 w-12 text-muted-foreground/50" />
          <h2 className="mt-4 font-display text-lg font-semibold text-foreground">
            {loading ? "Loading projects…" : loadError ? "Reconnecting to projects…" : "No projects found"}
          </h2>
          <p className="mt-1 text-muted-foreground">
            {loading
              ? "The page is ready; project data will appear as soon as the backend responds."
              : loadError
                ? "Your projects still exist; the app is retrying instead of replacing them with an empty list."
              : "Create your first project to get started"}
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

      {/* Edit Project Dialog */}
      <Dialog open={!!editingProject} onOpenChange={(open) => !open && setEditingProject(null)}>
        <DialogContent className="max-w-2xl w-[calc(100vw-2rem)] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Project</DialogTitle>
            <DialogDescription>Update the project details.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Project Name *</Label>
              <Input id="edit-name" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-desc">Description</Label>
              <Textarea id="edit-desc" value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-start">Start Date</Label>
                <Input id="edit-start" type="date" value={editForm.start_date} onChange={(e) => setEditForm({ ...editForm, start_date: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-end">End Date</Label>
                <Input id="edit-end" type="date" value={editForm.end_date} onChange={(e) => setEditForm({ ...editForm, end_date: e.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Geographic Scope (State / LGA / Ward)</Label>
              <ProjectScopeSelector value={editScope} onChange={setEditScope} />
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setEditingProject(null)}>Cancel</Button>
            <Button variant="acg" onClick={handleSaveEdit} disabled={savingEdit}>
              {savingEdit && <Loader2 className="h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Project Settings Dialog */}
      <Dialog open={!!settingsProject} onOpenChange={(open) => !open && setSettingsProject(null)}>
        <DialogContent className="max-w-md w-[calc(100vw-2rem)]">
          <DialogHeader>
            <DialogTitle>Project Settings</DialogTitle>
            <DialogDescription>Manage status for "{settingsProject?.name}".</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="set-status">Status</Label>
              <select
                id="set-status"
                value={settingsForm.status}
                onChange={(e) => setSettingsForm({ status: e.target.value })}
                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="active">Active</option>
                <option value="paused">Paused</option>
                <option value="completed">Completed</option>
              </select>
              <p className="text-xs text-muted-foreground">
                Paused projects stop receiving new submissions. Completed projects are read-only.
              </p>
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setSettingsProject(null)}>Cancel</Button>
            <Button variant="acg" onClick={handleSaveSettings} disabled={savingSettings}>
              {savingSettings && <Loader2 className="h-4 w-4 animate-spin" />}
              Save Settings
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ProjectsView;

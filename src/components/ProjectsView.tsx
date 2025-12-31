import { useState } from "react";
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
import { toast } from "@/hooks/use-toast";

interface Project {
  id: string;
  name: string;
  description: string;
  forms: number;
  members: number;
  submissions: number;
  location: string;
  startDate: string;
  status: "active" | "completed" | "paused";
  color: string;
}

const mockProjects: Project[] = [
  {
    id: "1",
    name: "Malaria Prevention Campaign",
    description: "Community-based malaria prevention and treatment monitoring",
    forms: 5,
    members: 12,
    submissions: 1234,
    location: "Lagos State",
    startDate: "Jan 2024",
    status: "active",
    color: "bg-green-500",
  },
  {
    id: "2",
    name: "Maternal Health Initiative",
    description: "Tracking maternal health indicators across target communities",
    forms: 3,
    members: 8,
    submissions: 567,
    location: "Abuja FCT",
    startDate: "Mar 2024",
    status: "active",
    color: "bg-blue-500",
  },
  {
    id: "3",
    name: "Water & Sanitation Survey",
    description: "Assessment of water quality and sanitation facilities",
    forms: 4,
    members: 6,
    submissions: 890,
    location: "Kano State",
    startDate: "Nov 2023",
    status: "completed",
    color: "bg-acg-gold",
  },
  {
    id: "4",
    name: "Vaccination Coverage Study",
    description: "Monitoring childhood vaccination coverage rates",
    forms: 2,
    members: 10,
    submissions: 345,
    location: "Rivers State",
    startDate: "Feb 2024",
    status: "active",
    color: "bg-purple-500",
  },
];

const ProjectsView = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [projects] = useState<Project[]>(mockProjects);

  const filteredProjects = projects.filter((project) =>
    project.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleAction = (action: string, projectName: string) => {
    toast({
      title: `${action} - ${projectName}`,
      description: "This feature will be available soon.",
    });
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
        <Button variant="acg" size="lg">
          <Plus className="h-5 w-5" />
          New Project
        </Button>
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
        {filteredProjects.map((project) => (
          <Card
            key={project.id}
            className="group border-0 shadow-card overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-glow/10"
          >
            <div className={`h-2 ${project.color}`} />
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
                    <span
                      className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                        project.status === "active"
                          ? "bg-green-100 text-green-700"
                          : project.status === "completed"
                          ? "bg-blue-100 text-blue-700"
                          : "bg-yellow-100 text-yellow-700"
                      }`}
                    >
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
                    <DropdownMenuItem onClick={() => handleAction("Edit", project.name)}>
                      <Edit className="mr-2 h-4 w-4" />
                      Edit Project
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleAction("Settings", project.name)}>
                      <Settings className="mr-2 h-4 w-4" />
                      Settings
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => handleAction("Delete", project.name)}
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
                {project.description}
              </p>

              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg bg-muted/50 p-2 text-center">
                  <FileText className="mx-auto h-4 w-4 text-primary" />
                  <p className="mt-1 text-lg font-semibold text-foreground">
                    {project.forms}
                  </p>
                  <p className="text-xs text-muted-foreground">Forms</p>
                </div>
                <div className="rounded-lg bg-muted/50 p-2 text-center">
                  <Users className="mx-auto h-4 w-4 text-acg-gold" />
                  <p className="mt-1 text-lg font-semibold text-foreground">
                    {project.members}
                  </p>
                  <p className="text-xs text-muted-foreground">Members</p>
                </div>
                <div className="rounded-lg bg-muted/50 p-2 text-center">
                  <FileText className="mx-auto h-4 w-4 text-green-500" />
                  <p className="mt-1 text-lg font-semibold text-foreground">
                    {project.submissions}
                  </p>
                  <p className="text-xs text-muted-foreground">Entries</p>
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-border pt-3 text-xs text-muted-foreground">
                <div className="flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {project.location}
                </div>
                <div className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {project.startDate}
                </div>
              </div>

              <Button variant="outline" className="w-full" onClick={() => handleAction("Open", project.name)}>
                Open Project
              </Button>
            </CardContent>
          </Card>
        ))}

        {/* Add Project Card */}
        <Card className="flex min-h-[300px] cursor-pointer items-center justify-center border-2 border-dashed border-border bg-transparent transition-all duration-200 hover:border-acg-gold/50 hover:bg-muted/30">
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
    </div>
  );
};

export default ProjectsView;

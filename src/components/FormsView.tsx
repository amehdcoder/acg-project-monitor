import { useState } from "react";
import {
  FileText,
  Edit,
  Send,
  Eye,
  Download,
  Trash2,
  Plus,
  Search,
  Filter,
  MoreVertical,
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
import { FormBuilder } from "@/components/FormBuilder";

interface Form {
  id: string;
  name: string;
  description: string;
  submissions: number;
  savedDrafts: number;
  lastUpdated: string;
  status: "active" | "draft" | "archived";
}

const mockForms: Form[] = [
  {
    id: "1",
    name: "Health Facility Assessment",
    description: "Comprehensive assessment of health facility infrastructure and services",
    submissions: 45,
    savedDrafts: 3,
    lastUpdated: "2 hours ago",
    status: "active",
  },
  {
    id: "2",
    name: "Community Outreach Survey",
    description: "Survey for community health outreach program monitoring",
    submissions: 128,
    savedDrafts: 0,
    lastUpdated: "5 hours ago",
    status: "active",
  },
  {
    id: "3",
    name: "Vaccination Campaign Tracker",
    description: "Track vaccination coverage and campaign progress",
    submissions: 89,
    savedDrafts: 5,
    lastUpdated: "1 day ago",
    status: "active",
  },
  {
    id: "4",
    name: "Water Quality Monitoring",
    description: "Monitor water quality at various collection points",
    submissions: 23,
    savedDrafts: 2,
    lastUpdated: "2 days ago",
    status: "draft",
  },
  {
    id: "5",
    name: "Maternal Health Survey",
    description: "Track maternal health indicators in target communities",
    submissions: 67,
    savedDrafts: 1,
    lastUpdated: "3 days ago",
    status: "active",
  },
];

const formActions = [
  { id: "fill", label: "Fill Blank Form", icon: FileText, color: "text-primary" },
  { id: "edit", label: "Edit Saved Form", icon: Edit, color: "text-acg-gold" },
  { id: "send", label: "Send Finalized Form", icon: Send, color: "text-green-500" },
  { id: "view", label: "View Sent Form", icon: Eye, color: "text-blue-500" },
  { id: "download", label: "Get Blank Form", icon: Download, color: "text-muted-foreground" },
  { id: "delete", label: "Delete Saved Form", icon: Trash2, color: "text-destructive" },
];

const FormsView = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [forms] = useState<Form[]>(mockForms);
  const [showFormBuilder, setShowFormBuilder] = useState(false);

  const filteredForms = forms.filter((form) =>
    form.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleAction = (action: string, formName: string) => {
    toast({
      title: `${action} - ${formName}`,
      description: `This feature will be available soon.`,
    });
  };

  if (showFormBuilder) {
    return <FormBuilder onClose={() => setShowFormBuilder(false)} />;
  }

  return (
    <div className="space-y-6 p-4 lg:p-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground lg:text-3xl">
            Forms
          </h1>
          <p className="text-muted-foreground">
            Manage and collect data with your forms
          </p>
        </div>
        <Button variant="acg" size="lg" onClick={() => setShowFormBuilder(true)}>
          <Plus className="h-5 w-5" />
          Create Form
        </Button>
      </div>

      {/* Quick Actions */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {formActions.map((action) => (
          <button
            key={action.id}
            onClick={() => handleAction(action.label, "Quick Action")}
            className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card p-4 transition-all duration-200 hover:border-acg-gold/30 hover:shadow-soft"
          >
            <div className="rounded-lg bg-muted p-3">
              <action.icon className={`h-5 w-5 ${action.color}`} />
            </div>
            <span className="text-center text-sm font-medium text-foreground">
              {action.label}
            </span>
          </button>
        ))}
      </div>

      {/* Search and Filter */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search forms..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <Button variant="outline">
          <Filter className="h-4 w-4" />
          Filter
        </Button>
      </div>

      {/* Forms List */}
      <Card className="border-0 shadow-card">
        <CardHeader>
          <CardTitle className="font-display">Available Forms</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {filteredForms.map((form) => (
            <div
              key={form.id}
              className="group flex flex-col gap-4 rounded-xl border border-border bg-card p-4 transition-all duration-200 hover:border-acg-gold/30 hover:shadow-soft sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex items-start gap-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                  <FileText className="h-7 w-7 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h4 className="truncate font-medium text-foreground">
                      {form.name}
                    </h4>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                        form.status === "active"
                          ? "bg-green-100 text-green-700"
                          : form.status === "draft"
                          ? "bg-yellow-100 text-yellow-700"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {form.status}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                    {form.description}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                    <span>{form.submissions} submissions</span>
                    {form.savedDrafts > 0 && (
                      <span className="text-acg-gold">
                        {form.savedDrafts} saved drafts
                      </span>
                    )}
                    <span>Updated {form.lastUpdated}</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="acg"
                  size="sm"
                  onClick={() => handleAction("Fill Form", form.name)}
                >
                  <FileText className="h-4 w-4" />
                  Fill
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleAction("View Data", form.name)}
                >
                  <Eye className="h-4 w-4" />
                  View
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => handleAction("Edit", form.name)}>
                      <Edit className="mr-2 h-4 w-4" />
                      Edit Form
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleAction("Send", form.name)}>
                      <Send className="mr-2 h-4 w-4" />
                      Send Data
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleAction("Download", form.name)}>
                      <Download className="mr-2 h-4 w-4" />
                      Download
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => handleAction("Delete", form.name)}
                      className="text-destructive"
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
};

export default FormsView;

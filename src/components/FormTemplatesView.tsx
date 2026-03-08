import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Search,
  Plus,
  FileText,
  MoreVertical,
  Copy,
  Trash2,
  Edit,
  Eye,
  EyeOff,
  Loader2,
  LayoutTemplate,
  Sparkles,
  Clock,
  User,
  FolderOpen,
  Save,
  ChevronRight,
  Hash,
  Calendar,
  List,
  Type,
  MapPin,
  Camera,
  Mic,
  PenTool,
  QrCode,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { Json } from "@/integrations/supabase/types";

interface FormTemplate {
  id: string;
  name: string;
  description: string | null;
  category: string;
  questions: any[];
  settings: any;
  created_by: string;
  created_at: string;
  updated_at: string;
  is_published: boolean;
}

const CATEGORIES = [
  { value: "general", label: "General" },
  { value: "health", label: "Health" },
  { value: "education", label: "Education" },
  { value: "agriculture", label: "Agriculture" },
  { value: "wash", label: "WASH" },
  { value: "nutrition", label: "Nutrition" },
  { value: "survey", label: "Survey" },
  { value: "monitoring", label: "Monitoring" },
  { value: "follow_up", label: "Follow-Up" },
];

const QUESTION_TYPE_ICONS: Record<string, React.ReactNode> = {
  text: <Type className="h-3.5 w-3.5" />,
  number: <Hash className="h-3.5 w-3.5" />,
  integer: <Hash className="h-3.5 w-3.5" />,
  select_one: <List className="h-3.5 w-3.5" />,
  select_multiple: <List className="h-3.5 w-3.5" />,
  date: <Calendar className="h-3.5 w-3.5" />,
  geopoint: <MapPin className="h-3.5 w-3.5" />,
  image: <Camera className="h-3.5 w-3.5" />,
  photo: <Camera className="h-3.5 w-3.5" />,
  audio: <Mic className="h-3.5 w-3.5" />,
  signature: <PenTool className="h-3.5 w-3.5" />,
  barcode: <QrCode className="h-3.5 w-3.5" />,
  note: <FileText className="h-3.5 w-3.5" />,
};

const FormTemplatesView = () => {
  const { profile, isAdmin } = useAuth();
  const [templates, setTemplates] = useState<FormTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  // Create/Edit dialog
  const [showEditor, setShowEditor] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<FormTemplate | null>(null);
  const [editorName, setEditorName] = useState("");
  const [editorDescription, setEditorDescription] = useState("");
  const [editorCategory, setEditorCategory] = useState("general");
  const [editorPublished, setEditorPublished] = useState(false);
  const [saving, setSaving] = useState(false);

  // Preview dialog
  const [previewTemplate, setPreviewTemplate] = useState<FormTemplate | null>(null);

  // Save from existing form dialog
  const [showSaveFromForm, setShowSaveFromForm] = useState(false);
  const [existingForms, setExistingForms] = useState<{ id: string; name: string; questions: any[]; settings: any; project_name?: string }[]>([]);
  const [loadingForms, setLoadingForms] = useState(false);
  const [formSearch, setFormSearch] = useState("");

  // Usage analytics
  const [usageCounts, setUsageCounts] = useState<Map<string, number>>(new Map());

  useEffect(() => {
    fetchTemplates();
    fetchUsageCounts();
  }, []);

  const fetchTemplates = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("form_templates")
        .select("*")
        .order("updated_at", { ascending: false });

      if (error) throw error;
      setTemplates(
        (data || []).map((t: any) => ({
          ...t,
          questions: Array.isArray(t.questions) ? t.questions : [],
          settings: t.settings || {},
        }))
      );
    } catch (e) {
      console.error("Error fetching templates:", e);
    } finally {
      setLoading(false);
    }
  };

  const fetchUsageCounts = async () => {
    try {
      const { data } = await supabase
        .from("forms")
        .select("template_id")
        .not("template_id", "is", null);
      
      if (data) {
        const counts = new Map<string, number>();
        for (const row of data) {
          const tid = (row as any).template_id as string;
          if (tid) counts.set(tid, (counts.get(tid) || 0) + 1);
        }
        setUsageCounts(counts);
      }
    } catch (e) {
      console.error("Error fetching usage counts:", e);
    }
  };

  const fetchExistingForms = async () => {
    setLoadingForms(true);
    try {
      const { data } = await supabase
        .from("forms")
        .select("id, name, questions, settings, projects!inner(name)")
        .order("updated_at", { ascending: false });

      if (data) {
        setExistingForms(
          data.map((f: any) => ({
            id: f.id,
            name: f.name,
            questions: Array.isArray(f.questions) ? f.questions : [],
            settings: f.settings || {},
            project_name: f.projects?.name,
          }))
        );
      }
    } catch (e) {
      console.error("Error fetching forms:", e);
    } finally {
      setLoadingForms(false);
    }
  };

  const handleSaveFromForm = async (form: typeof existingForms[0]) => {
    if (!profile?.user_id) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("form_templates").insert({
        name: `${form.name} (Template)`,
        description: `Template created from "${form.name}"`,
        category: (form.settings as any)?.caseManagement?.enabled ? "follow_up" : "general",
        questions: form.questions as unknown as Json,
        settings: form.settings as unknown as Json,
        created_by: profile.user_id,
        is_published: false,
      });

      if (error) throw error;
      toast({ title: "Template Created", description: `Template saved from "${form.name}".` });
      setShowSaveFromForm(false);
      fetchTemplates();
    } catch (e) {
      console.error(e);
      toast({ title: "Error", description: "Failed to create template.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const openEditor = (template?: FormTemplate) => {
    if (template) {
      setEditingTemplate(template);
      setEditorName(template.name);
      setEditorDescription(template.description || "");
      setEditorCategory(template.category);
      setEditorPublished(template.is_published);
    } else {
      setEditingTemplate(null);
      setEditorName("");
      setEditorDescription("");
      setEditorCategory("general");
      setEditorPublished(false);
    }
    setShowEditor(true);
  };

  const handleSaveEditor = async () => {
    if (!editorName.trim()) {
      toast({ title: "Name Required", variant: "destructive" });
      return;
    }
    if (!profile?.user_id) return;

    setSaving(true);
    try {
      if (editingTemplate) {
        const { error } = await supabase
          .from("form_templates")
          .update({
            name: editorName,
            description: editorDescription || null,
            category: editorCategory,
            is_published: editorPublished,
          })
          .eq("id", editingTemplate.id);
        if (error) throw error;
        toast({ title: "Template Updated" });
      } else {
        const { error } = await supabase.from("form_templates").insert({
          name: editorName,
          description: editorDescription || null,
          category: editorCategory,
          questions: [] as unknown as Json,
          settings: {} as unknown as Json,
          created_by: profile.user_id,
          is_published: editorPublished,
        });
        if (error) throw error;
        toast({ title: "Template Created" });
      }
      setShowEditor(false);
      fetchTemplates();
    } catch (e) {
      console.error(e);
      toast({ title: "Error", description: "Failed to save template.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase.from("form_templates").delete().eq("id", id);
      if (error) throw error;
      toast({ title: "Template Deleted" });
      fetchTemplates();
    } catch (e) {
      toast({ title: "Error", description: "Failed to delete template.", variant: "destructive" });
    }
  };

  const handleTogglePublish = async (template: FormTemplate) => {
    try {
      const { error } = await supabase
        .from("form_templates")
        .update({ is_published: !template.is_published })
        .eq("id", template.id);
      if (error) throw error;
      toast({
        title: template.is_published ? "Template Unpublished" : "Template Published",
        description: template.is_published
          ? "Template is now hidden from non-admin users."
          : "Template is now visible to all users.",
      });
      fetchTemplates();
    } catch (e) {
      toast({ title: "Error", variant: "destructive" });
    }
  };

  const handleDuplicate = async (template: FormTemplate) => {
    if (!profile?.user_id) return;
    try {
      const { error } = await supabase.from("form_templates").insert({
        name: `${template.name} (Copy)`,
        description: template.description,
        category: template.category,
        questions: template.questions as unknown as Json,
        settings: template.settings as unknown as Json,
        created_by: profile.user_id,
        is_published: false,
      });
      if (error) throw error;
      toast({ title: "Template Duplicated" });
      fetchTemplates();
    } catch (e) {
      toast({ title: "Error", variant: "destructive" });
    }
  };

  const filteredTemplates = templates.filter((t) => {
    const matchesSearch =
      !searchQuery ||
      t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.description?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = categoryFilter === "all" || t.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  const getCategoryColor = (cat: string) => {
    const colors: Record<string, string> = {
      general: "bg-muted text-muted-foreground",
      health: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
      education: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
      agriculture: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
      wash: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400",
      nutrition: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
      survey: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
      monitoring: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
      follow_up: "bg-primary/10 text-primary",
    };
    return colors[cat] || colors.general;
  };

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground flex items-center gap-2">
            <LayoutTemplate className="h-7 w-7 text-primary" />
            Form Templates
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Reusable form templates across all projects
          </p>
        </div>
        {isAdmin && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                fetchExistingForms();
                setShowSaveFromForm(true);
              }}
              className="gap-1.5"
            >
              <Copy className="h-4 w-4" />
              Save from Form
            </Button>
            <Button size="sm" onClick={() => openEditor()} className="gap-1.5">
              <Plus className="h-4 w-4" />
              New Template
            </Button>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search templates..."
            className="pl-9"
          />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {CATEGORIES.map((c) => (
              <SelectItem key={c.value} value={c.value}>
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Template Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : filteredTemplates.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 mb-4">
            <LayoutTemplate className="h-8 w-8 text-primary/60" />
          </div>
          <h3 className="text-lg font-semibold text-foreground">No templates yet</h3>
          <p className="text-sm text-muted-foreground mt-1 max-w-sm">
            {isAdmin
              ? "Create a new template or save one from an existing form to get started."
              : "No published templates are available yet."}
          </p>
          {isAdmin && (
            <div className="flex gap-2 mt-4">
              <Button variant="outline" size="sm" onClick={() => { fetchExistingForms(); setShowSaveFromForm(true); }}>
                <Copy className="h-4 w-4 mr-1.5" />
                Save from Form
              </Button>
              <Button size="sm" onClick={() => openEditor()}>
                <Plus className="h-4 w-4 mr-1.5" />
                Create Template
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredTemplates.map((template) => (
            <Card
              key={template.id}
              className="group relative overflow-hidden border hover:shadow-md transition-all duration-200 cursor-pointer"
              onClick={() => setPreviewTemplate(template)}
            >
              {/* Top accent */}
              <div className="h-1 bg-gradient-to-r from-primary via-primary/70 to-primary/40" />
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <FileText className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-semibold text-sm truncate">{template.name}</h3>
                      {template.description && (
                        <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                          {template.description}
                        </p>
                      )}
                    </div>
                  </div>
                  {isAdmin && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                        <DropdownMenuItem onClick={() => openEditor(template)}>
                          <Edit className="h-4 w-4 mr-2" />
                          Edit Details
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleTogglePublish(template)}>
                          {template.is_published ? (
                            <><EyeOff className="h-4 w-4 mr-2" />Unpublish</>
                          ) : (
                            <><Eye className="h-4 w-4 mr-2" />Publish</>
                          )}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleDuplicate(template)}>
                          <Copy className="h-4 w-4 mr-2" />
                          Duplicate
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleDelete(template.id)}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>

                {/* Badges */}
                <div className="flex flex-wrap gap-1.5">
                  <Badge className={`text-[10px] ${getCategoryColor(template.category)}`}>
                    {CATEGORIES.find((c) => c.value === template.category)?.label || template.category}
                  </Badge>
                  <Badge variant="outline" className="text-[10px] gap-1">
                    <FileText className="h-2.5 w-2.5" />
                    {template.questions.length} questions
                  </Badge>
                  {template.is_published ? (
                    <Badge variant="secondary" className="text-[10px] gap-1 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                      <Eye className="h-2.5 w-2.5" />
                      Published
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="text-[10px] gap-1">
                      <EyeOff className="h-2.5 w-2.5" />
                      Draft
                    </Badge>
                  )}
                </div>

                {/* Footer */}
                <div className="flex items-center gap-3 text-[10px] text-muted-foreground pt-1 border-t">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {format(new Date(template.updated_at), "MMM d, yyyy")}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Preview Dialog */}
      {previewTemplate && (
        <Dialog open={!!previewTemplate} onOpenChange={() => setPreviewTemplate(null)}>
          <DialogContent className="max-w-lg max-h-[85vh] overflow-hidden p-0">
            <div className="bg-gradient-to-br from-primary via-primary/90 to-primary/70 px-6 py-5 text-primary-foreground">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(255,255,255,0.15),_transparent_60%)]" />
              <div className="relative flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20 backdrop-blur-sm">
                  <LayoutTemplate className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold">{previewTemplate.name}</h2>
                  <p className="text-sm text-primary-foreground/80">
                    {previewTemplate.questions.length} questions ·{" "}
                    {CATEGORIES.find((c) => c.value === previewTemplate.category)?.label}
                  </p>
                </div>
              </div>
            </div>
            <ScrollArea className="max-h-[calc(85vh-160px)]">
              <div className="px-6 py-4 space-y-4">
                {previewTemplate.description && (
                  <p className="text-sm text-muted-foreground">{previewTemplate.description}</p>
                )}
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">Questions</Label>
                  {previewTemplate.questions.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-4 text-center">No questions in this template.</p>
                  ) : (
                    previewTemplate.questions.map((q: any, idx: number) => (
                      <div
                        key={q.id || idx}
                        className="flex items-center gap-2 p-2.5 rounded-lg bg-muted/40 text-sm"
                      >
                        <span className="flex h-5 w-5 items-center justify-center rounded bg-primary/10 text-primary text-[10px] font-bold shrink-0">
                          {idx + 1}
                        </span>
                        <span className="flex h-5 w-5 items-center justify-center text-muted-foreground shrink-0">
                          {QUESTION_TYPE_ICONS[q.type] || <Type className="h-3.5 w-3.5" />}
                        </span>
                        <span className="font-medium truncate flex-1">
                          {q.label || "Untitled"}
                        </span>
                        {q.required && <span className="text-destructive text-xs">*</span>}
                        <Badge variant="outline" className="text-[10px] capitalize shrink-0">
                          {(q.type || "text").replace("_", " ")}
                        </Badge>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </ScrollArea>
            <div className="border-t px-6 py-3 flex justify-end">
              <Button variant="outline" size="sm" onClick={() => setPreviewTemplate(null)}>
                Close
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Editor Dialog */}
      <Dialog open={showEditor} onOpenChange={setShowEditor}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingTemplate ? "Edit Template" : "New Template"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Template Name</Label>
              <Input
                value={editorName}
                onChange={(e) => setEditorName(e.target.value)}
                placeholder="e.g. Household Survey Template"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea
                value={editorDescription}
                onChange={(e) => setEditorDescription(e.target.value)}
                placeholder="Brief description..."
                rows={3}
                className="resize-none"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={editorCategory} onValueChange={setEditorCategory}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
              <div>
                <p className="text-sm font-medium">Publish Template</p>
                <p className="text-xs text-muted-foreground">Visible to all users</p>
              </div>
              <Switch checked={editorPublished} onCheckedChange={setEditorPublished} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditor(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveEditor} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Save className="h-4 w-4 mr-1.5" />}
              {saving ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Save from Existing Form Dialog */}
      <Dialog open={showSaveFromForm} onOpenChange={setShowSaveFromForm}>
        <DialogContent className="max-w-md max-h-[80vh] p-0 overflow-hidden">
          <div className="px-6 pt-6 pb-3 space-y-3">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Copy className="h-5 w-5 text-primary" />
                Save Form as Template
              </DialogTitle>
            </DialogHeader>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={formSearch}
                onChange={(e) => setFormSearch(e.target.value)}
                placeholder="Search forms..."
                className="pl-9"
              />
            </div>
          </div>
          <ScrollArea className="max-h-[50vh] px-6 pb-6">
            <div className="space-y-1.5">
              {loadingForms ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : existingForms
                  .filter(
                    (f) =>
                      !formSearch ||
                      f.name.toLowerCase().includes(formSearch.toLowerCase()) ||
                      f.project_name?.toLowerCase().includes(formSearch.toLowerCase())
                  )
                  .length === 0 ? (
                <p className="text-center text-sm text-muted-foreground py-8">No forms found</p>
              ) : (
                existingForms
                  .filter(
                    (f) =>
                      !formSearch ||
                      f.name.toLowerCase().includes(formSearch.toLowerCase()) ||
                      f.project_name?.toLowerCase().includes(formSearch.toLowerCase())
                  )
                  .map((f) => (
                    <button
                      key={f.id}
                      onClick={() => handleSaveFromForm(f)}
                      disabled={saving}
                      className="w-full flex items-center gap-3 p-3 rounded-lg text-left hover:bg-primary/5 border border-transparent hover:border-primary/20 transition-all group"
                    >
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary group-hover:bg-primary/20 transition-colors">
                        <FileText className="h-4.5 w-4.5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{f.name}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] text-muted-foreground">
                            {f.questions.length} questions
                          </span>
                          {f.project_name && (
                            <span className="text-[10px] text-muted-foreground/60">
                              · {f.project_name}
                            </span>
                          )}
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground/30 group-hover:text-primary transition-colors" />
                    </button>
                  ))
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default FormTemplatesView;

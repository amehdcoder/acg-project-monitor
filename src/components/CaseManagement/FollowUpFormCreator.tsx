import { useState, useEffect, useCallback } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { arrayMove } from "@dnd-kit/sortable";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  ClipboardList,
  Plus,
  Trash2,
  Sparkles,
  Save,
  Send,
  ChevronRight,
  GripVertical,
  FileText,
  MapPin,
  Hash,
  Calendar,
  ToggleLeft,
  List,
  Type,
  Camera,
  Mic,
  PenTool,
  QrCode,
  Loader2,
  CheckCircle2,
  Info,
  Wand2,
  Copy,
  Search,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { Json } from "@/integrations/supabase/types";

interface CaseTypeInfo {
  id: string;
  name: string;
  label: string;
  description?: string;
  properties: { id: string; name: string; label: string }[];
  projectId: string;
  projectName?: string;
}

interface QuestionDraft {
  id: string;
  type: string;
  label: string;
  required: boolean;
  hint?: string;
  options?: { id: string; label: string; value: string }[];
  linkedProperty?: string; // maps to case property
}

const QUESTION_TYPE_ICONS: Record<string, React.ReactNode> = {
  text: <Type className="h-4 w-4" />,
  integer: <Hash className="h-4 w-4" />,
  decimal: <Hash className="h-4 w-4" />,
  select_one: <List className="h-4 w-4" />,
  select_multiple: <List className="h-4 w-4" />,
  date: <Calendar className="h-4 w-4" />,
  geopoint: <MapPin className="h-4 w-4" />,
  photo: <Camera className="h-4 w-4" />,
  audio: <Mic className="h-4 w-4" />,
  signature: <PenTool className="h-4 w-4" />,
  barcode: <QrCode className="h-4 w-4" />,
  note: <FileText className="h-4 w-4" />,
};

const QUICK_TYPES = [
  { type: "text", label: "Text" },
  { type: "integer", label: "Number" },
  { type: "select_one", label: "Single Choice" },
  { type: "select_multiple", label: "Multi Choice" },
  { type: "date", label: "Date" },
  { type: "geopoint", label: "GPS Location" },
  { type: "photo", label: "Photo" },
  { type: "note", label: "Note" },
];
// Sortable question card wrapper
const SortableQuestionCard = ({ id, children }: { id: string; children: React.ReactNode }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : undefined,
  };

  return (
    <div ref={setNodeRef} style={style} className="relative">
      <div
        {...attributes}
        {...listeners}
        className="absolute left-1.5 top-1/2 -translate-y-1/2 z-10 cursor-grab active:cursor-grabbing p-1 rounded hover:bg-muted/80 text-muted-foreground/40 hover:text-muted-foreground transition-colors"
      >
        <GripVertical className="h-3.5 w-3.5" />
      </div>
      {children}
    </div>
  );
};


interface FollowUpFormCreatorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  caseType: CaseTypeInfo;
  onFormCreated: () => void;
}

const FollowUpFormCreator = ({
  open,
  onOpenChange,
  caseType,
  onFormCreated,
}: FollowUpFormCreatorProps) => {
  const { profile } = useAuth();
  const [step, setStep] = useState<"design" | "review">("design");
  const [formName, setFormName] = useState(`${caseType.label} Follow-Up`);
  const [formDescription, setFormDescription] = useState(
    `Follow-up form for ${caseType.label} cases`
  );
  const [questions, setQuestions] = useState<QuestionDraft[]>([]);
  const [autoPublish, setAutoPublish] = useState(true);
  const [saving, setSaving] = useState(false);
  const [includeGPS, setIncludeGPS] = useState(true);

  // Template state
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [templateForms, setTemplateForms] = useState<{ id: string; name: string; description: string | null; questions: any[]; settings: any; project_name?: string }[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [templateSearch, setTemplateSearch] = useState("");

  useEffect(() => {
    if (open) {
      setStep("design");
      setFormName(`${caseType.label} Follow-Up`);
      setFormDescription(`Follow-up form for ${caseType.label} cases`);
      setQuestions([]);
      setAutoPublish(true);
      setIncludeGPS(true);
      setShowTemplatePicker(false);
      setTemplateSearch("");
    }
  }, [open, caseType]);

  const fetchTemplateForms = async () => {
    setLoadingTemplates(true);
    try {
      const { data } = await supabase
        .from("forms")
        .select("id, name, description, questions, settings, projects!inner(name)")
        .order("updated_at", { ascending: false });

      if (data) {
        setTemplateForms(
          data.map((f: any) => ({
            id: f.id,
            name: f.name,
            description: f.description,
            questions: Array.isArray(f.questions) ? f.questions : [],
            settings: f.settings || {},
            project_name: f.projects?.name,
          }))
        );
      }
    } catch (e) {
      console.error("Error fetching templates:", e);
    } finally {
      setLoadingTemplates(false);
    }
  };

  const handleUseTemplate = (template: typeof templateForms[0]) => {
    const imported: QuestionDraft[] = template.questions
      .filter((q: any) => q.type !== "geopoint")
      .map((q: any) => ({
        id: `q-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        type: q.type || "text",
        label: q.label || "",
        required: q.required || false,
        hint: q.hint,
        options: q.options,
        linkedProperty: undefined,
      }));

    setQuestions(imported);
    setFormName(`${caseType.label} Follow-Up`);
    setShowTemplatePicker(false);

    const hadGPS = template.questions.some((q: any) => q.type === "geopoint");
    setIncludeGPS(hadGPS);

    toast({
      title: "Template Applied",
      description: `${imported.length} questions imported from "${template.name}". You can now customize them.`,
    });
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setQuestions((prev) => {
      const oldIndex = prev.findIndex((q) => q.id === active.id);
      const newIndex = prev.findIndex((q) => q.id === over.id);
      return arrayMove(prev, oldIndex, newIndex);
    });
  };

  const addQuestion = (type: string) => {
    const id = `q-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const q: QuestionDraft = {
      id,
      type,
      label: "",
      required: false,
      options:
        type === "select_one" || type === "select_multiple"
          ? [
              { id: "opt-1", label: "Option 1", value: "option_1" },
              { id: "opt-2", label: "Option 2", value: "option_2" },
            ]
          : undefined,
    };
    setQuestions((prev) => [...prev, q]);
  };

  const updateQuestion = (id: string, updates: Partial<QuestionDraft>) => {
    setQuestions((prev) =>
      prev.map((q) => (q.id === id ? { ...q, ...updates } : q))
    );
  };

  const removeQuestion = (id: string) => {
    setQuestions((prev) => prev.filter((q) => q.id !== id));
  };

  const addOption = (qId: string) => {
    setQuestions((prev) =>
      prev.map((q) => {
        if (q.id !== qId || !q.options) return q;
        const idx = q.options.length + 1;
        return {
          ...q,
          options: [
            ...q.options,
            { id: `opt-${idx}`, label: `Option ${idx}`, value: `option_${idx}` },
          ],
        };
      })
    );
  };

  const updateOption = (qId: string, optIdx: number, label: string) => {
    setQuestions((prev) =>
      prev.map((q) => {
        if (q.id !== qId || !q.options) return q;
        return {
          ...q,
          options: q.options.map((o, i) =>
            i === optIdx
              ? { ...o, label, value: label.toLowerCase().replace(/\s+/g, "_") }
              : o
          ),
        };
      })
    );
  };

  const removeOption = (qId: string, optIdx: number) => {
    setQuestions((prev) =>
      prev.map((q) => {
        if (q.id !== qId || !q.options) return q;
        return { ...q, options: q.options.filter((_, i) => i !== optIdx) };
      })
    );
  };

  const generateFromProperties = () => {
    if (caseType.properties.length === 0) {
      toast({
        title: "No Properties",
        description: "This case type has no properties defined. Add questions manually.",
      });
      return;
    }

    const generated: QuestionDraft[] = caseType.properties.map((prop) => ({
      id: `q-${Date.now()}-${prop.id}`,
      type: "text",
      label: prop.label || prop.name.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase()),
      required: false,
      linkedProperty: prop.name,
    }));

    setQuestions((prev) => [...prev, ...generated]);
    toast({
      title: "Questions Generated",
      description: `${generated.length} questions generated from case properties.`,
    });
  };

  const handleSave = async () => {
    if (!formName.trim()) {
      toast({ title: "Name Required", variant: "destructive" });
      return;
    }
    if (questions.length === 0 && !includeGPS) {
      toast({
        title: "Add Questions",
        description: "Add at least one question to the form.",
        variant: "destructive",
      });
      return;
    }
    if (!profile?.user_id) return;

    setSaving(true);
    try {
      // Build questions array
      const formQuestions: any[] = [];

      // Add GPS question if enabled
      if (includeGPS) {
        formQuestions.push({
          id: `q-gps-${Date.now()}`,
          type: "geopoint",
          label: "Current Location",
          required: false,
          hint: "Capture GPS location during follow-up visit",
        });
      }

      // Add user-defined questions
      for (const q of questions) {
        const fq: any = {
          id: q.id,
          type: q.type,
          label: q.label || "Untitled Question",
          required: q.required,
        };
        if (q.hint) fq.hint = q.hint;
        if (q.options) fq.options = q.options;
        formQuestions.push(fq);
      }

      // Build property mappings
      const saveToProperties = questions
        .filter((q) => q.linkedProperty)
        .map((q) => ({
          questionId: q.id,
          propertyName: q.linkedProperty!,
        }));

      const loadFromProperties = questions
        .filter((q) => q.linkedProperty)
        .map((q) => ({
          propertyName: q.linkedProperty!,
          questionId: q.id,
        }));

      const settings = {
        requireLocation: includeGPS,
        offlineEnabled: true,
        autoSave: true,
        caseManagement: {
          enabled: true,
          action: "update" as const,
          caseType: caseType.name,
          caseTypeId: caseType.id,
          saveToProperties,
          loadFromProperties,
        },
      };

      const { error } = await supabase.from("forms").insert({
        name: formName,
        description: formDescription,
        questions: formQuestions as unknown as Json,
        settings: settings as unknown as Json,
        project_id: caseType.projectId,
        created_by: profile.user_id,
        status: autoPublish ? "active" : "draft",
      });

      if (error) throw error;

      toast({
        title: autoPublish ? "Form Published!" : "Form Saved as Draft",
        description: `"${formName}" has been ${autoPublish ? "published and is ready for use" : "saved as a draft"}.`,
      });

      onFormCreated();
      onOpenChange(false);
    } catch (error) {
      console.error("Error creating follow-up form:", error);
      toast({
        title: "Error",
        description: "Failed to create follow-up form.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] p-0 overflow-hidden">
        {/* Gradient Header */}
        <div className="relative bg-gradient-to-br from-primary via-primary/90 to-primary/70 px-6 py-5 text-primary-foreground">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(255,255,255,0.15),_transparent_60%)]" />
          <div className="relative">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20 backdrop-blur-sm">
                <ClipboardList className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold">Create Follow-Up Form</h2>
                <p className="text-sm text-primary-foreground/80">
                  for <span className="font-semibold">{caseType.label}</span> cases
                  {caseType.projectName && (
                    <span className="text-primary-foreground/60"> · {caseType.projectName}</span>
                  )}
                </p>
              </div>
            </div>

            {/* Step indicator */}
            <div className="flex items-center gap-2 mt-4">
              <button
                onClick={() => setStep("design")}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-all ${
                  step === "design"
                    ? "bg-white/25 text-white"
                    : "bg-white/10 text-white/70 hover:bg-white/15"
                }`}
              >
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/20 text-[10px] font-bold">
                  1
                </span>
                Design
              </button>
              <ChevronRight className="h-3.5 w-3.5 text-white/40" />
              <button
                onClick={() => questions.length > 0 && setStep("review")}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-all ${
                  step === "review"
                    ? "bg-white/25 text-white"
                    : "bg-white/10 text-white/70 hover:bg-white/15"
                }`}
              >
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/20 text-[10px] font-bold">
                  2
                </span>
                Review & Publish
              </button>
            </div>
          </div>
        </div>

        <ScrollArea className="max-h-[calc(90vh-200px)]">
          <div className="px-6 py-4 space-y-5">
            {step === "design" && (
              <>
                {/* Form Details */}
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium">Form Name</Label>
                    <Input
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                      placeholder="Follow-Up Form Name"
                      className="font-medium"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium">Description</Label>
                    <Textarea
                      value={formDescription}
                      onChange={(e) => setFormDescription(e.target.value)}
                      placeholder="Brief description of this follow-up form"
                      rows={2}
                      className="resize-none"
                    />
                  </div>
                </div>

                {/* Quick Settings */}
                <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-primary" />
                    <div>
                      <p className="text-sm font-medium">Include GPS Capture</p>
                      <p className="text-xs text-muted-foreground">Auto-add GPS location question</p>
                    </div>
                  </div>
                  <Switch checked={includeGPS} onCheckedChange={setIncludeGPS} />
                </div>

                {/* Auto-generate from properties */}
                {caseType.properties.length > 0 && (
                  <Button
                    variant="outline"
                    className="w-full gap-2 border-dashed border-primary/30 text-primary hover:bg-primary/5"
                    onClick={generateFromProperties}
                  >
                    <Wand2 className="h-4 w-4" />
                    Auto-Generate from Case Properties ({caseType.properties.length})
                  </Button>
                )}

                {/* Duplicate from Existing Form */}
                <Button
                  variant="outline"
                  className="w-full gap-2 border-dashed border-accent-foreground/20 hover:bg-accent/50"
                  onClick={() => {
                    fetchTemplateForms();
                    setShowTemplatePicker(true);
                  }}
                >
                  <Copy className="h-4 w-4" />
                  Duplicate from Existing Form
                </Button>

                {/* Template Picker */}
                {showTemplatePicker && (
                  <Card className="border shadow-lg overflow-hidden">
                    <div className="p-3 border-b bg-muted/40">
                      <div className="flex items-center gap-2 mb-2">
                        <Copy className="h-4 w-4 text-primary" />
                        <span className="text-sm font-semibold">Choose a Template</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="ml-auto h-6 text-xs"
                          onClick={() => setShowTemplatePicker(false)}
                        >
                          Cancel
                        </Button>
                      </div>
                      <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                        <Input
                          value={templateSearch}
                          onChange={(e) => setTemplateSearch(e.target.value)}
                          placeholder="Search forms..."
                          className="h-8 text-xs pl-8"
                        />
                      </div>
                    </div>
                    <ScrollArea className="max-h-48">
                      <div className="p-1.5 space-y-1">
                        {loadingTemplates ? (
                          <div className="flex items-center justify-center py-6">
                            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                          </div>
                        ) : templateForms
                            .filter(
                              (f) =>
                                !templateSearch ||
                                f.name.toLowerCase().includes(templateSearch.toLowerCase()) ||
                                f.project_name?.toLowerCase().includes(templateSearch.toLowerCase())
                            )
                            .length === 0 ? (
                          <p className="text-center text-xs text-muted-foreground py-6">
                            No forms found
                          </p>
                        ) : (
                          templateForms
                            .filter(
                              (f) =>
                                !templateSearch ||
                                f.name.toLowerCase().includes(templateSearch.toLowerCase()) ||
                                f.project_name?.toLowerCase().includes(templateSearch.toLowerCase())
                            )
                            .map((f) => (
                              <button
                                key={f.id}
                                onClick={() => handleUseTemplate(f)}
                                className="w-full flex items-start gap-2.5 p-2.5 rounded-lg text-left hover:bg-primary/5 transition-colors group"
                              >
                                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary group-hover:bg-primary/20 transition-colors">
                                  <FileText className="h-4 w-4" />
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
                                    {(f.settings as any)?.caseManagement?.enabled && (
                                      <Badge variant="secondary" className="text-[9px] h-4 px-1">
                                        Case Form
                                      </Badge>
                                    )}
                                  </div>
                                </div>
                                <Copy className="h-3.5 w-3.5 text-muted-foreground/40 group-hover:text-primary shrink-0 mt-1 transition-colors" />
                              </button>
                            ))
                        )}
                      </div>
                    </ScrollArea>
                  </Card>
                )}

                {/* Questions List */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium">
                      Questions ({questions.length})
                    </Label>
                  </div>

                  {questions.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-8 text-center border-2 border-dashed border-muted rounded-xl">
                      <Sparkles className="h-8 w-8 text-muted-foreground/40 mb-2" />
                      <p className="text-sm text-muted-foreground">
                        Add questions to your follow-up form
                      </p>
                      <p className="text-xs text-muted-foreground/60 mt-0.5">
                        Use quick-add buttons below or auto-generate from properties
                      </p>
                    </div>
                  )}

                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                  >
                    <SortableContext
                      items={questions.map((q) => q.id)}
                      strategy={verticalListSortingStrategy}
                    >
                  {questions.map((q, idx) => (
                    <SortableQuestionCard key={q.id} id={q.id}>
                    <Card className="border shadow-sm group relative overflow-hidden">
                      <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary/20 group-hover:bg-primary transition-colors" />
                      <CardContent className="p-3 pl-8">
                        <div className="flex items-start gap-2">
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground mt-0.5">
                            {QUESTION_TYPE_ICONS[q.type] || <Type className="h-4 w-4" />}
                          </div>
                          <div className="flex-1 space-y-2 min-w-0">
                            <div className="flex items-center gap-2">
                              <Input
                                value={q.label}
                                onChange={(e) =>
                                  updateQuestion(q.id, { label: e.target.value })
                                }
                                placeholder="Question label..."
                                className="text-sm h-8 font-medium"
                              />
                              <Badge variant="outline" className="text-[10px] shrink-0 capitalize">
                                {q.type.replace("_", " ")}
                              </Badge>
                            </div>

                            {/* Options for select types */}
                            {q.options && (
                              <div className="space-y-1 pl-1">
                                {q.options.map((opt, optIdx) => (
                                  <div key={opt.id} className="flex items-center gap-1.5">
                                    <div className="h-3 w-3 rounded-full border-2 border-muted-foreground/30 shrink-0" />
                                    <Input
                                      value={opt.label}
                                      onChange={(e) =>
                                        updateOption(q.id, optIdx, e.target.value)
                                      }
                                      className="text-xs h-7 flex-1"
                                      placeholder={`Option ${optIdx + 1}`}
                                    />
                                    {q.options!.length > 2 && (
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-6 w-6 opacity-0 group-hover:opacity-100"
                                        onClick={() => removeOption(q.id, optIdx)}
                                      >
                                        <Trash2 className="h-3 w-3 text-destructive" />
                                      </Button>
                                    )}
                                  </div>
                                ))}
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-xs h-6 gap-1 text-primary"
                                  onClick={() => addOption(q.id)}
                                >
                                  <Plus className="h-3 w-3" />
                                  Add Option
                                </Button>
                              </div>
                            )}

                            {/* Linked Property */}
                            {q.linkedProperty && (
                              <div className="flex items-center gap-1.5">
                                <Badge
                                  variant="secondary"
                                  className="text-[10px] gap-1 bg-primary/10 text-primary"
                                >
                                  <CheckCircle2 className="h-3 w-3" />
                                  Linked: {q.linkedProperty}
                                </Badge>
                              </div>
                            )}

                            {/* Bottom row */}
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                                  <Switch
                                    checked={q.required}
                                    onCheckedChange={(v) =>
                                      updateQuestion(q.id, { required: v })
                                    }
                                    className="scale-75"
                                  />
                                  Required
                                </label>
                                {caseType.properties.length > 0 && !q.linkedProperty && (
                                  <Select
                                    value={q.linkedProperty || "__none"}
                                    onValueChange={(v) =>
                                      updateQuestion(q.id, {
                                        linkedProperty: v === "__none" ? undefined : v,
                                      })
                                    }
                                  >
                                    <SelectTrigger className="h-6 text-[10px] w-auto min-w-[100px] gap-1">
                                      <SelectValue placeholder="Link to property" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="__none">No link</SelectItem>
                                      {caseType.properties.map((p) => (
                                        <SelectItem key={p.id} value={p.name}>
                                          {p.label || p.name}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                )}
                              </div>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 text-destructive/70 hover:text-destructive"
                                onClick={() => removeQuestion(q.id)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                    </SortableQuestionCard>
                  ))}
                    </SortableContext>
                  </DndContext>
                </div>

                {/* Quick Add Buttons */}
                <div className="space-y-2">
                  <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Quick Add Question
                  </Label>
                  <div className="flex flex-wrap gap-1.5">
                    {QUICK_TYPES.map((qt) => (
                      <TooltipProvider key={qt.type}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 text-xs gap-1.5 hover:border-primary/50 hover:bg-primary/5"
                              onClick={() => addQuestion(qt.type)}
                            >
                              {QUESTION_TYPE_ICONS[qt.type]}
                              {qt.label}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Add {qt.label} question</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    ))}
                  </div>
                </div>
              </>
            )}

            {step === "review" && (
              <>
                {/* Summary */}
                <div className="space-y-4">
                  <Card className="border-0 bg-gradient-to-br from-muted/50 to-muted/20">
                    <CardContent className="p-4 space-y-3">
                      <h3 className="font-semibold text-base">{formName}</h3>
                      {formDescription && (
                        <p className="text-sm text-muted-foreground">{formDescription}</p>
                      )}
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="secondary" className="text-xs gap-1">
                          <ClipboardList className="h-3 w-3" />
                          {questions.length + (includeGPS ? 1 : 0)} questions
                        </Badge>
                        <Badge variant="outline" className="text-xs gap-1">
                          <FileText className="h-3 w-3" />
                          Follow-Up · {caseType.label}
                        </Badge>
                        {includeGPS && (
                          <Badge variant="outline" className="text-xs gap-1">
                            <MapPin className="h-3 w-3" />
                            GPS Enabled
                          </Badge>
                        )}
                      </div>
                    </CardContent>
                  </Card>

                  {/* Questions Preview */}
                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium">Questions Preview</Label>
                    {includeGPS && (
                      <div className="flex items-center gap-2 p-2.5 rounded-lg bg-muted/40 text-sm">
                        <MapPin className="h-4 w-4 text-primary shrink-0" />
                        <span className="font-medium">Current Location</span>
                        <Badge variant="outline" className="text-[10px] ml-auto">GPS</Badge>
                      </div>
                    )}
                    {questions.map((q, idx) => (
                      <div
                        key={q.id}
                        className="flex items-center gap-2 p-2.5 rounded-lg bg-muted/40 text-sm"
                      >
                        <span className="flex h-5 w-5 items-center justify-center rounded bg-primary/10 text-primary text-[10px] font-bold shrink-0">
                          {idx + 1}
                        </span>
                        <span className="font-medium truncate">
                          {q.label || "Untitled"}
                        </span>
                        {q.required && (
                          <span className="text-destructive text-xs">*</span>
                        )}
                        <Badge variant="outline" className="text-[10px] ml-auto capitalize shrink-0">
                          {q.type.replace("_", " ")}
                        </Badge>
                      </div>
                    ))}
                  </div>

                  {/* Property Mappings */}
                  {questions.some((q) => q.linkedProperty) && (
                    <div className="space-y-1.5">
                      <Label className="text-sm font-medium flex items-center gap-1.5">
                        <CheckCircle2 className="h-4 w-4 text-primary" />
                        Property Mappings
                      </Label>
                      <div className="rounded-lg border bg-card p-3 space-y-1.5">
                        {questions
                          .filter((q) => q.linkedProperty)
                          .map((q) => (
                            <div
                              key={q.id}
                              className="flex items-center gap-2 text-xs text-muted-foreground"
                            >
                              <span className="font-medium text-foreground">
                                {q.label || "Untitled"}
                              </span>
                              <ChevronRight className="h-3 w-3" />
                              <Badge variant="secondary" className="text-[10px]">
                                {q.linkedProperty}
                              </Badge>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}

                  {/* Publish Option */}
                  <div className="flex items-center justify-between p-3 rounded-lg border bg-primary/5 border-primary/20">
                    <div className="flex items-center gap-2">
                      <Send className="h-4 w-4 text-primary" />
                      <div>
                        <p className="text-sm font-medium">Publish Immediately</p>
                        <p className="text-xs text-muted-foreground">
                          Make the form available for field workers right away
                        </p>
                      </div>
                    </div>
                    <Switch checked={autoPublish} onCheckedChange={setAutoPublish} />
                  </div>
                </div>
              </>
            )}
          </div>
        </ScrollArea>

        {/* Footer */}
        <div className="border-t px-6 py-3 flex items-center justify-between bg-muted/20">
          <div className="text-xs text-muted-foreground">
            {questions.length} question{questions.length !== 1 ? "s" : ""}
            {includeGPS ? " + GPS" : ""}
          </div>
          <div className="flex gap-2">
            {step === "design" ? (
              <>
                <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={() => setStep("review")}
                  disabled={questions.length === 0 && !includeGPS}
                  className="gap-1.5"
                >
                  Review
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setStep("design")}
                >
                  Back
                </Button>
                <Button
                  size="sm"
                  onClick={handleSave}
                  disabled={saving}
                  className="gap-1.5"
                >
                  {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : autoPublish ? (
                    <Send className="h-4 w-4" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  {saving
                    ? "Creating..."
                    : autoPublish
                    ? "Create & Publish"
                    : "Save as Draft"}
                </Button>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default FollowUpFormCreator;

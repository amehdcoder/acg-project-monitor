import { useState } from "react";
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragOverlay,
  DragStartEvent,
  closestCenter,
  pointerWithin,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Question, QuestionType, GeofenceArea, QUESTION_TYPES, FormGroup } from "./types";
import QuestionPalette from "./QuestionPalette";
import FormCanvas from "./FormCanvas";
import GeofenceEditor from "./GeofenceEditor";
import FormSettings from "./FormSettings";
import FormPreview from "./FormPreview";
import SkipLogicEditor from "./SkipLogicEditor";
import ValidationCriteriaEditor from "./ValidationCriteriaEditor";
import GroupSkipLogicEditor from "./GroupSkipLogicEditor";
import GroupValidationEditor from "./GroupValidationEditor";
import { CreateGroupDialog } from "./QuestionGroup";
import XLSFormImportDialog from "./XLSFormImportDialog";
import SnapToFormDialog from "./SnapToFormDialog";
import CaseManagementEditor, { CaseManagementSettings } from "./CaseManagementEditor";
import QRCodeScanner from "@/components/QRCodeScanner";
import { parseXLSForm } from "@/lib/xlsformParser";
import { ArrowLeft, Save, Eye, FileText, MapPin, Settings, LayoutGrid, Upload, FolderPlus, Briefcase, BookTemplate, Camera, MoreHorizontal, Plus, QrCode } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface FormBuilderProps {
  onClose: () => void;
  projectId?: string;
  templateId?: string;
  editForm?: {
    id: string;
    name: string;
    description: string;
    questions: Question[];
    settings: any;
    geofence?: GeofenceArea;
  };
}

const FormBuilder = ({ onClose, projectId, templateId, editForm }: FormBuilderProps) => {
  const { profile } = useAuth();
  const [questions, setQuestions] = useState<Question[]>(() => {
    if (!editForm?.questions) return [];
    return (editForm.questions as any[]).filter((q: any) => !q.questions);
  });
  const [groups, setGroups] = useState<FormGroup[]>(() => {
    if (!editForm?.questions) return [];
    return (editForm.questions as any[]).filter((q: any) => Array.isArray(q.questions));
  });
  const [activeId, setActiveId] = useState<string | null>(null);
  const [formName, setFormName] = useState(editForm?.name || "");
  const [formDescription, setFormDescription] = useState(editForm?.description || "");
  const [geofence, setGeofence] = useState<GeofenceArea | undefined>(editForm?.geofence);
  const [settings, setSettings] = useState(editForm?.settings || {
    allowAnonymous: false,
    requireLocation: false,
    offlineEnabled: true,
    autoSave: true,
    enforceGeofence: false,
    autoSaveInterval: 30,
  });
  const [showPreview, setShowPreview] = useState(false);
  const [showSkipLogic, setShowSkipLogic] = useState(false);
  const [showValidation, setShowValidation] = useState(false);
  const [showGroupSkipLogic, setShowGroupSkipLogic] = useState(false);
  const [showGroupValidation, setShowGroupValidation] = useState(false);
  const [selectedQuestion, setSelectedQuestion] = useState<Question | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<FormGroup | null>(null);
  const [showGroupDialog, setShowGroupDialog] = useState(false);
  const [showXLSFormImport, setShowXLSFormImport] = useState(false);
  const [showSnapToForm, setShowSnapToForm] = useState(false);
  const [showQrImport, setShowQrImport] = useState(false);
  const [importingFromUrl, setImportingFromUrl] = useState(false);
  const [showCaseManagement, setShowCaseManagement] = useState(false);
  const [caseManagementSettings, setCaseManagementSettings] = useState<CaseManagementSettings>(() => {
    // Load case management settings from form settings if editing
    const cms = editForm?.settings?.caseManagement;
    if (cms) {
      return {
        enabled: cms.enabled ?? false,
        action: cms.action ?? "none",
        caseType: cms.caseType,
        caseTypeId: cms.caseTypeId,
        caseNameQuestion: cms.caseNameQuestion,
        saveToProperties: cms.saveToProperties ?? [],
        closeCondition: cms.closeCondition,
        loadFromProperties: cms.loadFromProperties ?? [],
      };
    }
    return {
      enabled: false,
      action: "none",
      saveToProperties: [],
      loadFromProperties: [],
    };
  });
  const [saving, setSaving] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  // Helper: find which container (group or ungrouped) a question ID belongs to
  const findContainer = (id: string): { type: "ungrouped" } | { type: "group"; groupId: string } | null => {
    if (questions.some(q => q.id === id)) return { type: "ungrouped" };
    for (const g of groups) {
      if (g.questions.some(q => q.id === id)) return { type: "group", groupId: g.id };
    }
    // Check if it's a droppable group zone ID like "group-drop-xxx"
    if (id.toString().startsWith("group-drop-")) {
      const groupId = id.toString().replace("group-drop-", "");
      if (groups.some(g => g.id === groupId)) return { type: "group", groupId };
    }
    return null;
  };

  const findQuestion = (id: string): Question | undefined => {
    const q = questions.find(q => q.id === id);
    if (q) return q;
    for (const g of groups) {
      const gq = g.questions.find(q => q.id === id);
      if (gq) return gq;
    }
    return undefined;
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over) return;

    // Handle drop from palette
    if (active.data.current?.fromPalette) {
      const questionType = active.data.current.type as QuestionType;
      const typeInfo = QUESTION_TYPES.find((q) => q.type === questionType);

      const newQuestion: Question = {
        id: `q-${Date.now()}`,
        type: questionType,
        label: typeInfo?.label || "New Question",
        required: false,
        options:
          questionType === "select_one" ||
          questionType === "select_multiple" ||
          questionType === "rank"
            ? [
                { id: "opt-1", label: "Option 1", value: "option_1" },
                { id: "opt-2", label: "Option 2", value: "option_2" },
              ]
            : undefined,
      };

      // Check if dropped onto a group droppable
      const overContainer = findContainer(over.id as string);
      if (overContainer?.type === "group") {
        setGroups(prev => prev.map(g => g.id === overContainer.groupId
          ? { ...g, questions: [...g.questions, newQuestion] }
          : g
        ));
      } else {
        setQuestions((prev) => [...prev, newQuestion]);
      }

      toast({
        title: "Question Added",
        description: `${typeInfo?.label} question has been added.`,
      });
      return;
    }

    const activeId = active.id as string;
    const overId = over.id as string;

    if (activeId === overId) return;

    const activeContainer = findContainer(activeId);
    let overContainer = findContainer(overId);

    if (!activeContainer) return;

    // If over target is a group drop zone, treat as dropping into that group
    if (overId.startsWith("group-drop-")) {
      const targetGroupId = overId.replace("group-drop-", "");
      overContainer = { type: "group", groupId: targetGroupId };
    }

    if (!overContainer) return;

    const activeQuestion = findQuestion(activeId);
    if (!activeQuestion) return;

    // Same container: reorder
    if (
      activeContainer.type === overContainer.type &&
      (activeContainer.type === "ungrouped" ||
        (activeContainer.type === "group" && overContainer.type === "group" &&
          activeContainer.groupId === overContainer.groupId))
    ) {
      if (activeContainer.type === "ungrouped") {
        setQuestions(items => {
          const oldIndex = items.findIndex(i => i.id === activeId);
          const newIndex = items.findIndex(i => i.id === overId);
          if (oldIndex === -1 || newIndex === -1) return items;
          return arrayMove(items, oldIndex, newIndex);
        });
      } else if (activeContainer.type === "group") {
        setGroups(prev => prev.map(g => {
          if (g.id !== activeContainer.groupId) return g;
          const oldIndex = g.questions.findIndex(q => q.id === activeId);
          const newIndex = g.questions.findIndex(q => q.id === overId);
          if (oldIndex === -1 || newIndex === -1) return g;
          return { ...g, questions: arrayMove(g.questions, oldIndex, newIndex) };
        }));
      }
      return;
    }

    // Cross-container: move question from one container to another
    // Remove from source
    if (activeContainer.type === "ungrouped") {
      setQuestions(prev => prev.filter(q => q.id !== activeId));
    } else {
      setGroups(prev => prev.map(g =>
        g.id === activeContainer.groupId
          ? { ...g, questions: g.questions.filter(q => q.id !== activeId) }
          : g
      ));
    }

    // Add to target
    if (overContainer.type === "ungrouped") {
      setQuestions(prev => {
        const idx = prev.findIndex(q => q.id === overId);
        const newItems = [...prev];
        newItems.splice(idx >= 0 ? idx : newItems.length, 0, activeQuestion);
        return newItems;
      });
    } else {
      setGroups(prev => prev.map(g => {
        if (g.id !== overContainer.groupId) return g;
        const idx = g.questions.findIndex(q => q.id === overId);
        const newQs = [...g.questions];
        newQs.splice(idx >= 0 ? idx : newQs.length, 0, activeQuestion);
        return { ...g, questions: newQs };
      }));
    }
  };

  const handleAddQuestion = (type: QuestionType) => {
    const typeInfo = QUESTION_TYPES.find((q) => q.type === type);
    const newQuestion: Question = {
      id: `q-${Date.now()}`,
      type,
      label: typeInfo?.label || "New Question",
      required: false,
      options:
        type === "select_one" || type === "select_multiple" || type === "rank"
          ? [
              { id: "opt-1", label: "Option 1", value: "option_1" },
              { id: "opt-2", label: "Option 2", value: "option_2" },
            ]
          : undefined,
    };

    setQuestions((prev) => [...prev, newQuestion]);
    toast({
      title: "Question Added",
      description: `${typeInfo?.label} question has been added.`,
    });
  };

  const handleSaveForm = async () => {
    if (!formName.trim()) {
      toast({
        title: "Form Name Required",
        description: "Please enter a name for your form.",
        variant: "destructive",
      });
      return;
    }

    const totalQuestions = questions.length + groups.reduce((sum, g) => sum + g.questions.length, 0);
    if (totalQuestions === 0) {
      toast({
        title: "Add Questions",
        description: "Please add at least one question to your form.",
        variant: "destructive",
      });
      return;
    }

    if (!projectId) {
      toast({
        title: "Project Required",
        description: "Please select a project for this form.",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);

    try {
      // Merge case management settings into form settings
      const fullSettings = {
        ...settings,
        caseManagement: caseManagementSettings.enabled ? caseManagementSettings : undefined,
      };

      const formData: any = {
        name: formName,
        description: formDescription,
        questions: [...(groups.length > 0 ? groups : []), ...questions] as any,
        settings: fullSettings as any,
        geofence: geofence as any,
        project_id: projectId,
        created_by: profile?.user_id,
        status: "draft",
      };

      // Track which template this form was created from
      if (!editForm?.id && templateId) {
        formData.template_id = templateId;
      }

      if (editForm?.id) {
        const { error } = await supabase
          .from("forms")
          .update(formData)
          .eq("id", editForm.id);

        if (error) throw error;
      } else {
        const { error } = await supabase.from("forms").insert(formData);
        if (error) throw error;
      }

      toast({
        title: "Form Saved",
        description: `"${formName}" has been saved successfully.`,
      });

      onClose();
    } catch (error) {
      console.error("Error saving form:", error);
      toast({
        title: "Error",
        description: "Failed to save form. Please try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const [savingTemplate, setSavingTemplate] = useState(false);
  const [showSaveTemplateDialog, setShowSaveTemplateDialog] = useState(false);
  const [templateCategory, setTemplateCategory] = useState("general");
  const [templateName, setTemplateName] = useState("");
  const [templateDescription, setTemplateDescription] = useState("");

  const TEMPLATE_CATEGORIES = [
    { value: "general", label: "General" },
    { value: "health", label: "Health" },
    { value: "education", label: "Education" },
    { value: "agriculture", label: "Agriculture" },
    { value: "wash", label: "WASH" },
    { value: "nutrition", label: "Nutrition" },
    { value: "survey", label: "Survey" },
    { value: "registration", label: "Registration" },
    { value: "follow_up", label: "Follow-Up" },
    { value: "monitoring", label: "Monitoring" },
  ];

  const openSaveTemplateDialog = () => {
    if (!formName.trim()) {
      toast({ title: "Form Name Required", description: "Please enter a name for your form before saving as template.", variant: "destructive" });
      return;
    }
    if (questions.length === 0) {
      toast({ title: "Add Questions", description: "Please add at least one question before saving as template.", variant: "destructive" });
      return;
    }
    setTemplateName(formName);
    setTemplateDescription(formDescription);
    setTemplateCategory("general");
    setShowSaveTemplateDialog(true);
  };

  const handleSaveAsTemplate = async () => {
    if (!templateName.trim()) {
      toast({ title: "Template Name Required", description: "Please enter a name for your template.", variant: "destructive" });
      return;
    }

    setSavingTemplate(true);
    try {
      const { error } = await supabase.from("form_templates").insert({
        name: templateName,
        description: templateDescription,
        questions: [...(groups.length > 0 ? groups : []), ...questions] as any,
        settings: settings as any,
        created_by: profile?.user_id,
        is_published: false,
        category: templateCategory,
      });
      if (error) throw error;
      toast({ title: "Template Saved", description: `"${templateName}" has been saved as a reusable template.` });
      setShowSaveTemplateDialog(false);
    } catch (error) {
      console.error("Error saving template:", error);
      toast({ title: "Error", description: "Failed to save template. Please try again.", variant: "destructive" });
    } finally {
      setSavingTemplate(false);
    }
  };

  const handleOpenSkipLogic = (question: Question) => {
    setSelectedQuestion(question);
    setShowSkipLogic(true);
  };

  const handleSaveSkipLogic = (updatedQuestion: Question) => {
    setQuestions((prev) =>
      prev.map((q) => (q.id === updatedQuestion.id ? updatedQuestion : q))
    );
  };

  const handleOpenValidation = (question: Question) => {
    setSelectedQuestion(question);
    setShowValidation(true);
  };

  const handleSaveValidation = (updatedQuestion: Question) => {
    setQuestions((prev) =>
      prev.map((q) => (q.id === updatedQuestion.id ? updatedQuestion : q))
    );
  };

  const handleOpenGroupSkipLogic = (group: FormGroup) => {
    setSelectedGroup(group);
    setShowGroupSkipLogic(true);
  };

  const handleSaveGroupSkipLogic = (updatedGroup: FormGroup) => {
    setGroups((prev) =>
      prev.map((g) => (g.id === updatedGroup.id ? updatedGroup : g))
    );
  };

  const handleOpenGroupValidation = (group: FormGroup) => {
    setSelectedGroup(group);
    setShowGroupValidation(true);
  };

  const handleSaveGroupValidation = (updatedGroup: FormGroup) => {
    setGroups((prev) =>
      prev.map((g) => (g.id === updatedGroup.id ? updatedGroup : g))
    );
  };

  const handleCreateGroup = (group: FormGroup) => {
    setGroups((prev) => [...prev, group]);
    toast({
      title: "Group Created",
      description: `"${group.label}" group has been created.`,
    });
  };

  const handleXLSFormImport = (
    importedQuestions: Question[],
    importedGroups: FormGroup[],
    importedFormName?: string
  ) => {
    // Replace (not append) to avoid duplication on re-import
    // If form already has content, append; if empty, replace
    if (questions.length === 0 && groups.length === 0) {
      setQuestions(importedQuestions);
      setGroups(importedGroups);
    } else {
      // Deduplicate: filter out questions whose label already exists
      const existingLabels = new Set([
        ...questions.map(q => q.label),
        ...groups.flatMap(g => g.questions.map(q => q.label)),
      ]);
      const newQuestions = importedQuestions.filter(q => !existingLabels.has(q.label));
      const newGroups = importedGroups.map(g => ({
        ...g,
        questions: g.questions.filter(q => !existingLabels.has(q.label)),
      })).filter(g => g.questions.length > 0);
      
      setQuestions((prev) => [...prev, ...newQuestions]);
      setGroups((prev) => [...prev, ...newGroups]);
    }
    
    // Update form name if not already set
    if (importedFormName && !formName) {
      setFormName(importedFormName);
    }
  };

  if (showPreview) {
    return (
      <FormPreview
        formName={formName}
        formDescription={formDescription}
        questions={questions}
        onClose={() => setShowPreview(false)}
      />
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header */}
      <div className="border-b border-border bg-card px-2 py-2 sm:px-4 sm:py-3">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <Button variant="ghost" size="icon" onClick={onClose} className="shrink-0">
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="min-w-0">
              <h1 className="font-display text-base sm:text-xl font-bold text-foreground truncate">
                Form Builder
              </h1>
              <p className="text-xs sm:text-sm text-muted-foreground truncate">
                Create and customize your data collection form
              </p>
            </div>
          </div>

          {/* Desktop actions: full button row, horizontally scrollable on tablet */}
          <div className="hidden md:flex items-center gap-2 overflow-x-auto scrollbar-thin">
            <Button
              variant="outline"
              onClick={() => setShowSnapToForm(true)}
              className="shrink-0 bg-gradient-to-r from-primary/10 to-primary/5 border-primary/30 hover:from-primary/15 hover:to-primary/10"
            >
              <Camera className="mr-2 h-4 w-4 text-primary" />
              Snap to Form
              <Badge variant="secondary" className="ml-2 text-[10px] font-normal">AI</Badge>
            </Button>
            <Button variant="outline" onClick={() => setShowXLSFormImport(true)} className="shrink-0">
              <Upload className="mr-2 h-4 w-4" />
              Import XLSForm
            </Button>
            <Button variant="outline" onClick={() => setShowGroupDialog(true)} className="shrink-0">
              <FolderPlus className="mr-2 h-4 w-4" />
              Add Group
            </Button>
            <Button variant="outline" onClick={() => setShowPreview(true)} className="shrink-0">
              <Eye className="mr-2 h-4 w-4" />
              Preview
            </Button>
            <Button variant="outline" onClick={openSaveTemplateDialog} disabled={savingTemplate} className="shrink-0">
              <BookTemplate className="mr-2 h-4 w-4" />
              Save as Template
            </Button>
            <Button variant="acg" onClick={handleSaveForm} disabled={saving} className="shrink-0">
              <Save className="mr-2 h-4 w-4" />
              {saving ? "Saving..." : "Save Form"}
            </Button>
          </div>

          {/* Mobile actions: Save + More dropdown */}
          <div className="flex md:hidden items-center gap-2 justify-end">
            <Button variant="acg" size="sm" onClick={handleSaveForm} disabled={saving}>
              <Save className="mr-1 h-4 w-4" />
              {saving ? "Saving..." : "Save"}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem onClick={() => setShowSnapToForm(true)}>
                  <Camera className="mr-2 h-4 w-4" /> Snap to Form
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setShowXLSFormImport(true)}>
                  <Upload className="mr-2 h-4 w-4" /> Import XLSForm
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setShowGroupDialog(true)}>
                  <FolderPlus className="mr-2 h-4 w-4" /> Add Group
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setShowPreview(true)}>
                  <Eye className="mr-2 h-4 w-4" /> Preview
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={openSaveTemplateDialog} disabled={savingTemplate}>
                  <BookTemplate className="mr-2 h-4 w-4" /> Save as Template
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <Tabs defaultValue="questions" className="flex flex-1 min-h-0 flex-col">
        <div className="border-b border-border bg-card px-2 sm:px-4 overflow-x-auto scrollbar-thin">
          <TabsList className="h-12 bg-transparent w-max">
            <TabsTrigger
              value="questions"
              className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary"
            >
              <LayoutGrid className="mr-2 h-4 w-4" />
              Questions
            </TabsTrigger>
            <TabsTrigger
              value="geofencing"
              className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary"
            >
              <MapPin className="mr-2 h-4 w-4" />
              Geofencing
            </TabsTrigger>
            <TabsTrigger
              value="settings"
              className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary"
            >
              <Settings className="mr-2 h-4 w-4" />
              Settings
            </TabsTrigger>
            <TabsTrigger
              value="case-management"
              className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary"
            >
              <Briefcase className="mr-2 h-4 w-4" />
              Case Management
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="questions" className="mt-0 flex-1 min-h-0 overflow-hidden">
          <DndContext
            sensors={sensors}
            collisionDetection={pointerWithin}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            {/* Mobile: floating "Add question" button opens palette in a Sheet */}
            <div className="md:hidden absolute bottom-4 right-4 z-30">
              <Sheet>
                <SheetTrigger asChild>
                  <Button size="lg" className="rounded-full h-14 w-14 p-0 shadow-lg">
                    <Plus className="h-6 w-6" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="p-0 w-[85vw] max-w-sm">
                  <QuestionPalette onAddQuestion={handleAddQuestion} />
                </SheetContent>
              </Sheet>
            </div>

            <div className="flex h-full min-h-0 flex-col md:flex-row relative">
              {/* Desktop palette */}
              <div className="hidden md:block w-72 shrink-0 min-h-0">
                <QuestionPalette onAddQuestion={handleAddQuestion} />
              </div>
              {/* Canvas: provides BOTH vertical and horizontal scroll on small screens */}
              <div className="flex-1 min-h-0 min-w-0 overflow-auto bg-muted/30">
                <FormCanvas
                  questions={questions}
                  onQuestionsChange={setQuestions}
                  onOpenSkipLogic={handleOpenSkipLogic}
                  onOpenValidation={handleOpenValidation}
                  groups={groups}
                  onGroupsChange={setGroups}
                  onOpenGroupSkipLogic={handleOpenGroupSkipLogic}
                  onOpenGroupValidation={handleOpenGroupValidation}
                />
              </div>
            </div>
          </DndContext>
        </TabsContent>
        <TabsContent value="geofencing" className="mt-0 flex-1 overflow-auto p-6">
          <GeofenceEditor geofence={geofence} onGeofenceChange={setGeofence} />
        </TabsContent>

        <TabsContent value="settings" className="mt-0 flex-1 overflow-auto">
          <FormSettings
            formName={formName}
            formDescription={formDescription}
            settings={settings}
            onFormNameChange={setFormName}
            onFormDescriptionChange={setFormDescription}
            onSettingsChange={setSettings}
          />
        </TabsContent>

        <TabsContent value="case-management" className="mt-0 flex-1 overflow-auto p-6">
          <div className="max-w-2xl mx-auto">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-semibold">Case Management</h2>
                <p className="text-muted-foreground text-sm">Configure longitudinal follow-up for this form</p>
              </div>
              <Button onClick={() => setShowCaseManagement(true)}>
                <Settings className="mr-2 h-4 w-4" />
                Configure
              </Button>
            </div>
            {caseManagementSettings.enabled ? (
              <div className="space-y-4">
                <div className="p-4 rounded-lg border bg-card">
                  <div className="flex items-center gap-2 mb-2">
                    <Briefcase className="h-5 w-5 text-primary" />
                    <span className="font-medium">
                      {caseManagementSettings.action === "register" && "Registration Form"}
                      {caseManagementSettings.action === "update" && "Follow-up Form"}
                      {caseManagementSettings.action === "close" && "Close Case Form"}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Case Type: {caseManagementSettings.caseType || "Not selected"}
                  </p>
                </div>
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <Briefcase className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Case management is not enabled for this form.</p>
                <p className="text-sm">Click Configure to set up longitudinal tracking.</p>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Skip Logic Editor */}
      {selectedQuestion && (
        <SkipLogicEditor
          open={showSkipLogic}
          onOpenChange={setShowSkipLogic}
          question={selectedQuestion}
          allQuestions={questions}
          onSave={handleSaveSkipLogic}
        />
      )}

      {/* Validation Criteria Editor */}
      {selectedQuestion && (
        <ValidationCriteriaEditor
          open={showValidation}
          onOpenChange={setShowValidation}
          question={selectedQuestion}
          onSave={handleSaveValidation}
        />
      )}

      {/* Group Skip Logic Editor */}
      {selectedGroup && (
        <GroupSkipLogicEditor
          open={showGroupSkipLogic}
          onOpenChange={setShowGroupSkipLogic}
          group={selectedGroup}
          allQuestions={questions}
          onSave={handleSaveGroupSkipLogic}
        />
      )}

      {/* Group Validation Editor */}
      {selectedGroup && (
        <GroupValidationEditor
          open={showGroupValidation}
          onOpenChange={setShowGroupValidation}
          group={selectedGroup}
          onSave={handleSaveGroupValidation}
        />
      )}

      {/* Create Group Dialog */}
      <CreateGroupDialog
        open={showGroupDialog}
        onOpenChange={setShowGroupDialog}
        onCreate={handleCreateGroup}
      />

      {/* XLSForm Import Dialog */}
      <XLSFormImportDialog
        open={showXLSFormImport}
        onOpenChange={setShowXLSFormImport}
        onImport={handleXLSFormImport}
      />

      {/* Snap to Form Dialog */}
      <SnapToFormDialog
        open={showSnapToForm}
        onOpenChange={setShowSnapToForm}
        onImport={(importedQuestions, importedGroups, importedFormName, importedDescription) => {
          handleXLSFormImport(importedQuestions, importedGroups, importedFormName);
          if (importedDescription && !formDescription) setFormDescription(importedDescription);
        }}
      />

      {/* Case Management Editor */}
      <CaseManagementEditor
        open={showCaseManagement}
        onOpenChange={setShowCaseManagement}
        questions={questions}
        settings={caseManagementSettings}
        onSave={setCaseManagementSettings}
        projectId={projectId}
      />

      {/* Save as Template Dialog */}
      <Dialog open={showSaveTemplateDialog} onOpenChange={setShowSaveTemplateDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Save as Template</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="template-name">Template Name</Label>
              <Input
                id="template-name"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder="Enter template name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="template-description">Description</Label>
              <Textarea
                id="template-description"
                value={templateDescription}
                onChange={(e) => setTemplateDescription(e.target.value)}
                placeholder="Describe this template"
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="template-category">Category</Label>
              <Select value={templateCategory} onValueChange={setTemplateCategory}>
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {TEMPLATE_CATEGORIES.map((cat) => (
                    <SelectItem key={cat.value} value={cat.value}>
                      {cat.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground">
              {questions.length} question{questions.length !== 1 ? "s" : ""} will be included in this template.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSaveTemplateDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveAsTemplate} disabled={savingTemplate}>
              {savingTemplate ? "Saving..." : "Save Template"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default FormBuilder;

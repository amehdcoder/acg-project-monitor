import { useState } from "react";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import CaseManagementEditor, { CaseManagementSettings } from "./CaseManagementEditor";
import { ArrowLeft, Save, Eye, FileText, MapPin, Settings, LayoutGrid, Upload, FolderPlus, Briefcase, BookTemplate } from "lucide-react";
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
  const [questions, setQuestions] = useState<Question[]>(editForm?.questions || []);
  const [groups, setGroups] = useState<FormGroup[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [formName, setFormName] = useState(editForm?.name || "");
  const [formDescription, setFormDescription] = useState(editForm?.description || "");
  const [geofence, setGeofence] = useState<GeofenceArea | undefined>(editForm?.geofence);
  const [settings, setSettings] = useState(editForm?.settings || {
    allowAnonymous: false,
    requireLocation: true,
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

      setQuestions((prev) => [...prev, newQuestion]);

      toast({
        title: "Question Added",
        description: `${typeInfo?.label} question has been added to the form.`,
      });
      return;
    }

    // Handle reordering
    if (active.id !== over.id) {
      setQuestions((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
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

    if (questions.length === 0) {
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
        questions: questions as any,
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
        questions: questions as any,
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
    // Add imported questions to existing ones
    setQuestions((prev) => [...prev, ...importedQuestions]);
    setGroups((prev) => [...prev, ...importedGroups]);
    
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
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border bg-card px-4 py-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onClose}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="font-display text-xl font-bold text-foreground">
              Form Builder
            </h1>
            <p className="text-sm text-muted-foreground">
              Create and customize your data collection form
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setShowXLSFormImport(true)}>
            <Upload className="mr-2 h-4 w-4" />
            Import XLSForm
          </Button>
          <Button variant="outline" onClick={() => setShowGroupDialog(true)}>
            <FolderPlus className="mr-2 h-4 w-4" />
            Add Group
          </Button>
          <Button variant="outline" onClick={() => setShowPreview(true)}>
            <Eye className="mr-2 h-4 w-4" />
            Preview
          </Button>
          <Button variant="outline" onClick={openSaveTemplateDialog} disabled={savingTemplate}>
            <BookTemplate className="mr-2 h-4 w-4" />
            Save as Template
          </Button>
          <Button variant="acg" onClick={handleSaveForm} disabled={saving}>
            <Save className="mr-2 h-4 w-4" />
            {saving ? "Saving..." : "Save Form"}
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <Tabs defaultValue="questions" className="flex flex-1 flex-col overflow-hidden">
        <div className="border-b border-border bg-card px-4">
          <TabsList className="h-12 bg-transparent">
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

        <TabsContent value="questions" className="mt-0 flex-1 overflow-hidden">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <div className="flex h-full">
              <div className="w-72 shrink-0">
                <QuestionPalette onAddQuestion={handleAddQuestion} />
              </div>
              <div className="flex-1 bg-muted/30">
                <FormCanvas
                  questions={questions}
                  onQuestionsChange={setQuestions}
                  onOpenSkipLogic={handleOpenSkipLogic}
                  onOpenValidation={handleOpenValidation}
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

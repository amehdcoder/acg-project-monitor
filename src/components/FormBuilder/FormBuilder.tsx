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
import { Question, QuestionType, GeofenceArea, QUESTION_TYPES } from "./types";
import QuestionPalette from "./QuestionPalette";
import FormCanvas from "./FormCanvas";
import GeofenceEditor from "./GeofenceEditor";
import FormSettings from "./FormSettings";
import { ArrowLeft, Save, Eye, FileText, MapPin, Settings, LayoutGrid } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface FormBuilderProps {
  onClose: () => void;
}

const FormBuilder = ({ onClose }: FormBuilderProps) => {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [geofence, setGeofence] = useState<GeofenceArea | undefined>();
  const [settings, setSettings] = useState({
    allowAnonymous: false,
    requireLocation: true,
    offlineEnabled: true,
    autoSave: true,
  });

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

  const handleSaveForm = () => {
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

    // Save form logic would go here
    toast({
      title: "Form Saved",
      description: `"${formName}" has been saved successfully.`,
    });
  };

  const handlePreviewForm = () => {
    toast({
      title: "Preview Mode",
      description: "Form preview will be available soon.",
    });
  };

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
          <Button variant="outline" onClick={handlePreviewForm}>
            <Eye className="mr-2 h-4 w-4" />
            Preview
          </Button>
          <Button variant="acg" onClick={handleSaveForm}>
            <Save className="mr-2 h-4 w-4" />
            Save Form
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
                <QuestionPalette />
              </div>
              <div className="flex-1 bg-muted/30">
                <FormCanvas
                  questions={questions}
                  onQuestionsChange={setQuestions}
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
      </Tabs>
    </div>
  );
};

export default FormBuilder;

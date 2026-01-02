import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Type,
  Hash,
  StickyNote,
  CircleDot,
  CheckSquare,
  ArrowUpDown,
  Calendar,
  Clock,
  CalendarClock,
  MapPin,
  Route,
  Hexagon,
  Camera,
  Mic,
  Video,
  Paperclip,
  QrCode,
  Calculator,
  Sliders,
  PenTool,
  ThumbsUp,
  Table,
  GripVertical,
  Trash2,
  Settings,
  Copy,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Question, QuestionType } from "./types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useState } from "react";

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  text: Type,
  number: Hash,
  note: StickyNote,
  select_one: CircleDot,
  select_multiple: CheckSquare,
  rank: ArrowUpDown,
  date: Calendar,
  time: Clock,
  datetime: CalendarClock,
  geopoint: MapPin,
  geotrace: Route,
  geoshape: Hexagon,
  image: Camera,
  audio: Mic,
  video: Video,
  file: Paperclip,
  barcode: QrCode,
  calculate: Calculator,
  range: Sliders,
  signature: PenTool,
  acknowledge: ThumbsUp,
  matrix: Table,
};

interface SortableQuestionProps {
  question: Question;
  onUpdate: (question: Question) => void;
  onDelete: (id: string) => void;
  onDuplicate: (question: Question) => void;
  onSkipLogic?: (question: Question) => void;
}

const SortableQuestion = ({
  question,
  onUpdate,
  onDelete,
  onDuplicate,
  onSkipLogic,
}: SortableQuestionProps) => {
  const [expanded, setExpanded] = useState(false);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: question.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const Icon = iconMap[question.type] || Type;

  const handleLabelChange = (label: string) => {
    onUpdate({ ...question, label });
  };

  const handleRequiredChange = (required: boolean) => {
    onUpdate({ ...question, required });
  };

  const handleHintChange = (hint: string) => {
    onUpdate({ ...question, hint });
  };

  const addOption = () => {
    const newOption = {
      id: `opt-${Date.now()}`,
      label: `Option ${(question.options?.length || 0) + 1}`,
      value: `option_${(question.options?.length || 0) + 1}`,
    };
    onUpdate({
      ...question,
      options: [...(question.options || []), newOption],
    });
  };

  const updateOption = (optionId: string, label: string) => {
    onUpdate({
      ...question,
      options: question.options?.map((opt) =>
        opt.id === optionId ? { ...opt, label, value: label.toLowerCase().replace(/\s+/g, "_") } : opt
      ),
    });
  };

  const removeOption = (optionId: string) => {
    onUpdate({
      ...question,
      options: question.options?.filter((opt) => opt.id !== optionId),
    });
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group rounded-xl border border-border bg-card transition-all ${
        isDragging ? "shadow-lg" : "hover:border-acg-gold/30 hover:shadow-soft"
      }`}
    >
      <div className="flex items-center gap-3 p-4">
        <div
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing"
        >
          <GripVertical className="h-5 w-5 text-muted-foreground" />
        </div>

        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
          <Icon className="h-5 w-5 text-primary" />
        </div>

        <div className="flex-1">
          <Input
            value={question.label}
            onChange={(e) => handleLabelChange(e.target.value)}
            placeholder="Enter question label"
            className="border-0 bg-transparent p-0 text-base font-medium focus-visible:ring-0"
          />
          <p className="text-xs text-muted-foreground capitalize">
            {question.type.replace("_", " ")}
          </p>
        </div>

        <div className="flex items-center gap-2 opacity-0 transition-opacity group-hover:opacity-100">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setExpanded(!expanded)}
            title="Edit question"
          >
            {expanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onSkipLogic?.(question)}
            title="Skip logic"
          >
            <Settings className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onDuplicate(question)}
            title="Duplicate"
          >
            <Copy className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onDelete(question.id)}
            className="text-destructive hover:text-destructive"
            title="Delete"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border p-4">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label htmlFor={`required-${question.id}`}>Required</Label>
              <Switch
                id={`required-${question.id}`}
                checked={question.required}
                onCheckedChange={handleRequiredChange}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor={`hint-${question.id}`}>Hint Text</Label>
              <Input
                id={`hint-${question.id}`}
                value={question.hint || ""}
                onChange={(e) => handleHintChange(e.target.value)}
                placeholder="Add a hint for respondents"
              />
            </div>

            {(question.type === "select_one" ||
              question.type === "select_multiple" ||
              question.type === "rank") && (
              <div className="space-y-2">
                <Label>Options</Label>
                <div className="space-y-2">
                  {question.options?.map((option) => (
                    <div key={option.id} className="flex items-center gap-2">
                      <Input
                        value={option.label}
                        onChange={(e) => updateOption(option.id, e.target.value)}
                        placeholder="Option label"
                        className="flex-1"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeOption(option.id)}
                        className="shrink-0"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={addOption}
                    className="w-full"
                  >
                    Add Option
                  </Button>
                </div>
              </div>
            )}

            {(question.type === "number" || question.type === "range") && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Min Value</Label>
                  <Input
                    type="number"
                    value={question.validation?.min || ""}
                    onChange={(e) =>
                      onUpdate({
                        ...question,
                        validation: {
                          ...question.validation,
                          min: Number(e.target.value),
                        },
                      })
                    }
                    placeholder="Min"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Max Value</Label>
                  <Input
                    type="number"
                    value={question.validation?.max || ""}
                    onChange={(e) =>
                      onUpdate({
                        ...question,
                        validation: {
                          ...question.validation,
                          max: Number(e.target.value),
                        },
                      })
                    }
                    placeholder="Max"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

interface FormCanvasProps {
  questions: Question[];
  onQuestionsChange: (questions: Question[]) => void;
  onOpenSkipLogic?: (question: Question) => void;
}

const FormCanvas = ({ questions, onQuestionsChange, onOpenSkipLogic }: FormCanvasProps) => {
  const { setNodeRef, isOver } = useDroppable({
    id: "form-canvas",
  });

  const handleUpdate = (updatedQuestion: Question) => {
    onQuestionsChange(
      questions.map((q) => (q.id === updatedQuestion.id ? updatedQuestion : q))
    );
  };

  const handleDelete = (id: string) => {
    onQuestionsChange(questions.filter((q) => q.id !== id));
  };

  const handleDuplicate = (question: Question) => {
    const newQuestion = {
      ...question,
      id: `q-${Date.now()}`,
      label: `${question.label} (copy)`,
    };
    const index = questions.findIndex((q) => q.id === question.id);
    const newQuestions = [...questions];
    newQuestions.splice(index + 1, 0, newQuestion);
    onQuestionsChange(newQuestions);
  };

  return (
    <ScrollArea className="flex-1">
      <div
        ref={setNodeRef}
        className={`min-h-[600px] p-6 transition-colors ${
          isOver ? "bg-acg-gold/5" : ""
        }`}
      >
        {questions.length === 0 ? (
          <div className="flex h-[500px] flex-col items-center justify-center rounded-xl border-2 border-dashed border-border">
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                <Type className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="font-display text-lg font-semibold text-foreground">
                Start Building Your Form
              </h3>
              <p className="mt-2 max-w-sm text-sm text-muted-foreground">
                Drag question types from the left panel and drop them here to
                build your form
              </p>
            </div>
          </div>
        ) : (
          <SortableContext
            items={questions.map((q) => q.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-3">
              {questions.map((question) => (
                <SortableQuestion
                  key={question.id}
                  question={question}
                  onUpdate={handleUpdate}
                  onDelete={handleDelete}
                  onDuplicate={handleDuplicate}
                  onSkipLogic={onOpenSkipLogic}
                />
              ))}
            </div>
          </SortableContext>
        )}
      </div>
    </ScrollArea>
  );
};

export default FormCanvas;

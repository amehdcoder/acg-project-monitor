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
  ShieldCheck,
  GitBranch,
} from "lucide-react";
import { Question, QuestionType, QUESTION_TYPES } from "./types";
import QuestionGroupComponent from "./QuestionGroup";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Plus } from "lucide-react";
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
  onValidation?: (question: Question) => void;
}

const SortableQuestion = ({
  question,
  onUpdate,
  onDelete,
  onDuplicate,
  onSkipLogic,
  onValidation,
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

        <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
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
            className={question.relevant ? "text-primary" : ""}
          >
            <GitBranch className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onValidation?.(question)}
            title="Validation criteria"
            className={question.constraint ? "text-primary" : ""}
          >
            <ShieldCheck className="h-4 w-4" />
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
  onOpenValidation?: (question: Question) => void;
  groups?: import("./types").FormGroup[];
  onGroupsChange?: (groups: import("./types").FormGroup[]) => void;
  onOpenGroupSkipLogic?: (group: import("./types").FormGroup) => void;
  onOpenGroupValidation?: (group: import("./types").FormGroup) => void;
}

const FormCanvas = ({ questions, onQuestionsChange, onOpenSkipLogic, onOpenValidation, groups = [], onGroupsChange, onOpenGroupSkipLogic, onOpenGroupValidation }: FormCanvasProps) => {
  const { setNodeRef, isOver } = useDroppable({
    id: "form-canvas",
  });

  const handleUpdate = (updatedQuestion: Question) => {
    // Check if question is in a group
    const groupIdx = groups.findIndex(g => g.questions.some(q => q.id === updatedQuestion.id));
    if (groupIdx >= 0 && onGroupsChange) {
      const updatedGroups = groups.map((g, i) => i === groupIdx ? {
        ...g,
        questions: g.questions.map(q => q.id === updatedQuestion.id ? updatedQuestion : q),
      } : g);
      onGroupsChange(updatedGroups);
    } else {
      onQuestionsChange(
        questions.map((q) => (q.id === updatedQuestion.id ? updatedQuestion : q))
      );
    }
  };

  const handleDelete = (id: string) => {
    // Check if question is in a group
    const groupIdx = groups.findIndex(g => g.questions.some(q => q.id === id));
    if (groupIdx >= 0 && onGroupsChange) {
      const updatedGroups = groups.map((g, i) => i === groupIdx ? {
        ...g,
        questions: g.questions.filter(q => q.id !== id),
      } : g);
      onGroupsChange(updatedGroups);
    } else {
      onQuestionsChange(questions.filter((q) => q.id !== id));
    }
  };

  const handleDuplicate = (question: Question) => {
    const newQuestion = {
      ...question,
      id: `q-${Date.now()}`,
      label: `${question.label} (copy)`,
    };
    // Check if in a group
    const groupIdx = groups.findIndex(g => g.questions.some(q => q.id === question.id));
    if (groupIdx >= 0 && onGroupsChange) {
      const g = groups[groupIdx];
      const qIdx = g.questions.findIndex(q => q.id === question.id);
      const newQs = [...g.questions];
      newQs.splice(qIdx + 1, 0, newQuestion);
      const updatedGroups = groups.map((gr, i) => i === groupIdx ? { ...gr, questions: newQs } : gr);
      onGroupsChange(updatedGroups);
    } else {
      const index = questions.findIndex((q) => q.id === question.id);
      const newQuestions = [...questions];
      newQuestions.splice(index + 1, 0, newQuestion);
      onQuestionsChange(newQuestions);
    }
  };

  const handleMoveToGroup = (questionId: string, groupId: string) => {
    if (!onGroupsChange) return;
    const question = questions.find(q => q.id === questionId);
    if (!question) return;
    // Remove from ungrouped
    onQuestionsChange(questions.filter(q => q.id !== questionId));
    // Add to group
    const updatedGroups = groups.map(g => g.id === groupId ? {
      ...g,
      questions: [...g.questions, question],
    } : g);
    onGroupsChange(updatedGroups);
  };

  const handleRemoveFromGroup = (questionId: string, groupId: string) => {
    if (!onGroupsChange) return;
    const group = groups.find(g => g.id === groupId);
    if (!group) return;
    const question = group.questions.find(q => q.id === questionId);
    if (!question) return;
    // Remove from group
    const updatedGroups = groups.map(g => g.id === groupId ? {
      ...g,
      questions: g.questions.filter(q => q.id !== questionId),
    } : g);
    onGroupsChange(updatedGroups);
    // Add to ungrouped
    onQuestionsChange([...questions, question]);
  };

  const handleDeleteGroup = (groupId: string) => {
    if (!onGroupsChange) return;
    const group = groups.find(g => g.id === groupId);
    if (!group) return;
    // Move all questions back to ungrouped
    onQuestionsChange([...questions, ...group.questions]);
    onGroupsChange(groups.filter(g => g.id !== groupId));
  };

  const handleUpdateGroup = (updatedGroup: import("./types").FormGroup) => {
    if (!onGroupsChange) return;
    onGroupsChange(groups.map(g => g.id === updatedGroup.id ? updatedGroup : g));
  };

  const handleAddQuestionToGroup = (groupId: string, type: QuestionType) => {
    if (!onGroupsChange) return;
    const typeInfo = QUESTION_TYPES.find(qt => qt.type === type);
    const newQuestion: Question = {
      id: `q-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type,
      label: `New ${typeInfo?.label || type} Question`,
      required: false,
      options: (type === "select_one" || type === "select_multiple" || type === "rank")
        ? [
            { id: `opt-${Date.now()}-1`, label: "Option 1", value: "option_1" },
            { id: `opt-${Date.now()}-2`, label: "Option 2", value: "option_2" },
          ]
        : undefined,
    };
    const updatedGroups = groups.map(g =>
      g.id === groupId ? { ...g, questions: [...g.questions, newQuestion] } : g
    );
    onGroupsChange(updatedGroups);
  };

  const hasContent = questions.length > 0 || groups.length > 0;

  return (
    <ScrollArea className="flex-1">
      <div
        ref={setNodeRef}
        className={`min-h-[600px] p-6 transition-colors ${
          isOver ? "bg-acg-gold/5" : ""
        }`}
      >
        {!hasContent ? (
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
          <div className="space-y-4">
            {/* Render Groups */}
            {groups.map((group) => (
              <QuestionGroupComponent
                key={group.id}
                group={group}
                onUpdate={handleUpdateGroup}
                onDelete={handleDeleteGroup}
                onSkipLogic={onOpenGroupSkipLogic}
                onValidation={onOpenGroupValidation}
              >
                <GroupDropZone groupId={group.id}>
                  {group.questions.length === 0 ? (
                    <div className="rounded-lg border-2 border-dashed border-border/50 p-6 text-center">
                      <p className="text-sm text-muted-foreground">
                        No questions yet. Drag questions here or add below.
                      </p>
                    </div>
                  ) : (
                    <SortableContext
                      items={group.questions.map(q => q.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      <div className="space-y-3">
                        {group.questions.map((question) => (
                          <div key={question.id} className="relative">
                            <SortableQuestion
                              question={question}
                              onUpdate={handleUpdate}
                              onDelete={handleDelete}
                              onDuplicate={handleDuplicate}
                              onSkipLogic={onOpenSkipLogic}
                              onValidation={onOpenValidation}
                            />
                            <button
                              onClick={() => handleRemoveFromGroup(question.id, group.id)}
                              className="absolute -right-2 -top-2 z-10 h-6 w-6 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center text-xs hover:bg-destructive/90 shadow-sm"
                              title="Remove from group"
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                      </div>
                    </SortableContext>
                  )}
                </GroupDropZone>

                {/* Add Question to Group button */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="w-full mt-2 border-dashed border-primary/40 text-primary hover:bg-primary/5 gap-2">
                      <Plus className="h-4 w-4" />
                      Add Question to Group
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-56 max-h-[400px] overflow-y-auto" align="center">
                    {(() => {
                      const categories = [...new Set(QUESTION_TYPES.map(qt => qt.category))];
                      return categories.map((cat) => (
                        <div key={cat}>
                          <DropdownMenuLabel className="text-xs text-muted-foreground">{cat}</DropdownMenuLabel>
                          {QUESTION_TYPES.filter(qt => qt.category === cat).map(qt => {
                            const Icon = iconMap[qt.type] || Type;
                            return (
                              <DropdownMenuItem
                                key={qt.type}
                                onClick={() => handleAddQuestionToGroup(group.id, qt.type)}
                                className="gap-2 cursor-pointer"
                              >
                                <Icon className="h-4 w-4 text-primary" />
                                {qt.label}
                              </DropdownMenuItem>
                            );
                          })}
                          <DropdownMenuSeparator />
                        </div>
                      ));
                    })()}
                  </DropdownMenuContent>
                </DropdownMenu>
              </QuestionGroupComponent>
            ))}

            {/* Ungrouped Questions */}
            {questions.length > 0 && (
              <>
                {groups.length > 0 && (
                  <div className="flex items-center gap-2 pt-2">
                    <div className="h-px flex-1 bg-border" />
                    <span className="text-xs text-muted-foreground font-medium">Ungrouped Questions</span>
                    <div className="h-px flex-1 bg-border" />
                  </div>
                )}
                <SortableContext
                  items={questions.map((q) => q.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-3">
                    {questions.map((question) => (
                      <div key={question.id} className="relative">
                        <SortableQuestion
                          question={question}
                          onUpdate={handleUpdate}
                          onDelete={handleDelete}
                          onDuplicate={handleDuplicate}
                          onSkipLogic={onOpenSkipLogic}
                          onValidation={onOpenValidation}
                        />
                        {groups.length > 0 && (
                          <div className="mt-1 flex gap-1 flex-wrap">
                            {groups.map(g => (
                              <button
                                key={g.id}
                                onClick={() => handleMoveToGroup(question.id, g.id)}
                                className="text-[10px] px-2 py-0.5 rounded-full border border-primary/30 text-primary hover:bg-primary/10 transition-colors"
                              >
                                → {g.label}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </SortableContext>
              </>
            )}
          </div>
        )}
      </div>
    </ScrollArea>
  );
};

export default FormCanvas;

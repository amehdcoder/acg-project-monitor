import { useDraggable } from "@dnd-kit/core";
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
} from "lucide-react";
import { QUESTION_TYPES, QuestionType } from "./types";
import { ScrollArea } from "@/components/ui/scroll-area";

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
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
};

interface DraggableQuestionProps {
  type: QuestionType;
  label: string;
  icon: string;
  onAdd?: () => void;
}

const DraggableQuestion = ({ type, label, icon, onAdd }: DraggableQuestionProps) => {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `palette-${type}`,
    data: { type, fromPalette: true },
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.5 : 1,
  };

  const Icon = iconMap[icon] || Type;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      onClick={onAdd}
      className="flex cursor-grab items-center gap-2 rounded-lg border border-border bg-card p-2 transition-all hover:border-acg-gold/50 hover:shadow-soft active:cursor-grabbing"
    >
      <GripVertical className="h-4 w-4 text-muted-foreground" />
      <Icon className="h-4 w-4 text-primary" />
      <span className="text-sm font-medium text-foreground">{label}</span>
    </div>
  );
};

interface QuestionPaletteProps {
  onAddQuestion?: (type: QuestionType) => void;
}

const QuestionPalette = ({ onAddQuestion }: QuestionPaletteProps) => {
  const categories = [...new Set(QUESTION_TYPES.map((q) => q.category))];

  return (
    <div className="flex h-full flex-col border-r border-border bg-card">
      <div className="border-b border-border p-4">
        <h3 className="font-display text-lg font-semibold text-foreground">
          Question Types
        </h3>
        <p className="text-sm text-muted-foreground">
          Drag or click to add
        </p>
      </div>

      <ScrollArea className="flex-1 p-4">
        <div className="space-y-6">
          {categories.map((category) => (
            <div key={category}>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {category}
              </h4>
              <div className="space-y-2">
                {QUESTION_TYPES.filter((q) => q.category === category).map((question) => (
                  <DraggableQuestion
                    key={question.type}
                    type={question.type}
                    label={question.label}
                    icon={question.icon}
                    onAdd={() => onAddQuestion?.(question.type)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
};

export default QuestionPalette;

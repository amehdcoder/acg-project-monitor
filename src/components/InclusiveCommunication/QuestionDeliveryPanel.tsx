import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CommunicationMode, QuestionChunk, getQuestionIconHint, InclusiveQuestion } from "@/hooks/useInclusiveCommunication";
import {
  Calendar, Hash, List, CheckSquare, MapPin, Camera, Video, Mic, ScanLine,
  ThumbsUp, SlidersHorizontal, PenTool, MessageCircle, Pencil, Clock,
  RefreshCw, Eye, Type, Image, HandMetal, HelpCircle,
} from "lucide-react";

const iconMap: Record<string, React.ElementType> = {
  calendar: Calendar, hash: Hash, list: List, "check-square": CheckSquare,
  "map-pin": MapPin, camera: Camera, video: Video, mic: Mic, scan: ScanLine,
  "thumbs-up": ThumbsUp, sliders: SlidersHorizontal, "pen-tool": PenTool,
  "message-circle": MessageCircle, pencil: Pencil, clock: Clock,
  "calendar-clock": Calendar,
};

interface Props {
  question: InclusiveQuestion;
  chunks: QuestionChunk[];
  mode: CommunicationMode;
  isSimplified: boolean;
  questionNumber: number;
  totalQuestions: number;
  onReady: () => void;
  onSimplify: () => void;
  onModeChange: (mode: CommunicationMode) => void;
}

const QuestionDeliveryPanel = ({
  question, chunks, mode, isSimplified, questionNumber, totalQuestions,
  onReady, onSimplify, onModeChange,
}: Props) => {
  const TypeIcon = iconMap[getQuestionIconHint(question.type)] || MessageCircle;

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Mode switcher */}
      <div className="flex gap-1.5 justify-center">
        {([
          { id: "text" as const, icon: Type, label: "Text" },
          { id: "icon" as const, icon: Image, label: "Icons" },
          { id: "sign" as const, icon: HandMetal, label: "Sign" },
          { id: "assisted" as const, icon: Eye, label: "Assisted" },
        ]).map(m => (
          <Button
            key={m.id}
            variant={mode === m.id ? "default" : "outline"}
            size="sm"
            className="gap-1.5 text-xs"
            onClick={() => onModeChange(m.id)}
          >
            <m.icon className="h-3.5 w-3.5" />
            {m.label}
          </Button>
        ))}
      </div>

      {/* Question number & type badge */}
      <div className="flex items-center gap-2 justify-center flex-wrap">
        <Badge variant="secondary" className="text-sm px-3 py-1">
          Question {questionNumber} of {totalQuestions}
        </Badge>
        <Badge variant="outline" className="gap-1">
          <TypeIcon className="h-3 w-3" />
          {question.type.replace("_", " ")}
        </Badge>
        {question.required && (
          <Badge className="bg-destructive/10 text-destructive border-destructive/20 text-[10px]">
            Required
          </Badge>
        )}
      </div>

      {/* Question chunks — large, clear text */}
      <div className="space-y-3">
        {chunks.map((chunk, i) => (
          <div
            key={i}
            className={`rounded-2xl p-5 text-center transition-all ${
              chunk.isOptions
                ? "bg-accent/50 border border-accent"
                : "bg-primary/5 border border-primary/10"
            }`}
          >
            {mode === "icon" && chunk.iconHint && (
              <div className="flex justify-center mb-2">
                {(() => {
                  const ChunkIcon = iconMap[chunk.iconHint] || MessageCircle;
                  return <ChunkIcon className="h-10 w-10 text-primary/60" />;
                })()}
              </div>
            )}
            <p className={`font-semibold leading-relaxed ${
              mode === "icon" ? "text-xl" : "text-lg sm:text-xl"
            } text-foreground`}>
              {chunk.text}
            </p>
          </div>
        ))}
      </div>

      {/* Hint */}
      {question.hint && (
        <p className="text-sm text-muted-foreground text-center italic bg-muted/30 rounded-xl p-3">
          💡 {question.hint}
        </p>
      )}

      {/* Assisted mode instruction */}
      {mode === "assisted" && (
        <div className="bg-accent/30 border border-accent rounded-xl p-4 text-center">
          <Eye className="h-6 w-6 mx-auto mb-2 text-primary" />
          <p className="font-medium text-sm text-foreground">Show this screen to the respondent</p>
          <p className="text-xs text-muted-foreground mt-1">Point to the answer options together</p>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-2 justify-center flex-wrap">
        <Button onClick={onReady} size="lg" className="min-h-[52px] text-base px-8">
          I'm Ready to Answer
        </Button>
        <Button onClick={onSimplify} variant="outline" size="lg" className="min-h-[52px] gap-2">
          <HelpCircle className="h-5 w-5" />
          {isSimplified ? "Show Original" : "Explain Simpler"}
        </Button>
        <Button onClick={onReady} variant="ghost" size="lg" className="min-h-[52px] gap-2">
          <RefreshCw className="h-5 w-5" />
          Replay
        </Button>
      </div>
    </div>
  );
};

export default QuestionDeliveryPanel;

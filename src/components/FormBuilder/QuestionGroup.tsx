import { useState } from "react";
import { Question, FormGroup } from "./types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { 
  ChevronDown, 
  ChevronUp, 
  Folder, 
  Trash2, 
  GripVertical, 
  Repeat,
  GitBranch,
  ShieldCheck,
  ArrowUp,
  ArrowDown,
} from "lucide-react";

interface QuestionGroupProps {
  group: FormGroup;
  onUpdate: (group: FormGroup) => void;
  onDelete: (groupId: string) => void;
  onSkipLogic?: (group: FormGroup) => void;
  onValidation?: (group: FormGroup) => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  isFirst?: boolean;
  isLast?: boolean;
  children: React.ReactNode;
}

const QuestionGroupComponent = ({
  group,
  onUpdate,
  onDelete,
  onSkipLogic,
  onValidation,
  onMoveUp,
  onMoveDown,
  isFirst = false,
  isLast = false,
  children,
}: QuestionGroupProps) => {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div className="rounded-xl border border-primary/30 bg-primary/5 overflow-hidden">
        <CollapsibleTrigger asChild>
          <div className="flex items-center justify-between p-4 cursor-pointer hover:bg-primary/10 transition-colors">
            <div className="flex items-center gap-3">
              <GripVertical className="h-5 w-5 text-muted-foreground cursor-grab" />
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/20">
                <Folder className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="font-medium text-foreground">{group.label}</h3>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{group.questions.length} questions</span>
                  {group.repeat && (
                    <span className="flex items-center gap-1 text-primary">
                      <Repeat className="h-3 w-3" />
                      Repeat group{group.repeatCount ? ` (×${group.repeatCount})` : ""}
                    </span>
                  )}
                  {group.relevant && (
                    <span className="flex items-center gap-1 text-blue-600">
                      <GitBranch className="h-3 w-3" />
                      Skip logic
                    </span>
                  )}
                  {group.constraint && (
                    <span className="flex items-center gap-1 text-green-600">
                      <ShieldCheck className="h-3 w-3" />
                      Validation
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {/* Move Up/Down buttons */}
              <Button
                variant="ghost"
                size="icon"
                onClick={(e) => {
                  e.stopPropagation();
                  onMoveUp?.();
                }}
                disabled={isFirst}
                className="h-8 w-8"
                title="Move group up"
              >
                <ArrowUp className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={(e) => {
                  e.stopPropagation();
                  onMoveDown?.();
                }}
                disabled={isLast}
                className="h-8 w-8"
                title="Move group down"
              >
                <ArrowDown className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={(e) => {
                  e.stopPropagation();
                  onSkipLogic?.(group);
                }}
                className={`h-8 w-8 ${group.relevant ? "text-primary" : ""}`}
                title="Skip logic"
              >
                <GitBranch className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={(e) => {
                  e.stopPropagation();
                  onValidation?.(group);
                }}
                className={`h-8 w-8 ${group.constraint ? "text-primary" : ""}`}
                title="Validation criteria"
              >
                <ShieldCheck className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(group.id);
                }}
                className="h-8 w-8 text-destructive hover:text-destructive"
                title="Delete group"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
              {isOpen ? (
                <ChevronUp className="h-5 w-5 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-5 w-5 text-muted-foreground" />
              )}
            </div>
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="border-t border-primary/20 p-4 space-y-3">
            {children}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
};

export default QuestionGroupComponent;

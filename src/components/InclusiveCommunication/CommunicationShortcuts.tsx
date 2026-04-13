import { Button } from "@/components/ui/button";
import { RefreshCw, HelpCircle, ListChecks, CheckSquare, Hand, CheckCircle } from "lucide-react";

interface Props {
  onRepeat: () => void;
  onDontUnderstand: () => void;
  onChooseOne: () => void;
  onChooseMany: () => void;
  onWait: () => void;
  onFinished: () => void;
}

const shortcuts = [
  { key: "repeat", icon: RefreshCw, label: "Please Repeat", color: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/30" },
  { key: "dont_understand", icon: HelpCircle, label: "I Don't Understand", color: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30" },
  { key: "choose_one", icon: ListChecks, label: "Choose One", color: "bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/30" },
  { key: "choose_many", icon: CheckSquare, label: "Choose Many", color: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border-indigo-500/30" },
  { key: "wait", icon: Hand, label: "Wait", color: "bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/30" },
  { key: "finished", icon: CheckCircle, label: "Finished", color: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30" },
];

const CommunicationShortcuts = ({ onRepeat, onDontUnderstand, onChooseOne, onChooseMany, onWait, onFinished }: Props) => {
  const handlers: Record<string, () => void> = {
    repeat: onRepeat,
    dont_understand: onDontUnderstand,
    choose_one: onChooseOne,
    choose_many: onChooseMany,
    wait: onWait,
    finished: onFinished,
  };

  return (
    <div className="flex gap-1.5 overflow-x-auto pb-1 px-2 scrollbar-thin">
      {shortcuts.map(s => (
        <Button
          key={s.key}
          variant="outline"
          size="sm"
          className={`shrink-0 gap-1.5 text-xs ${s.color} border rounded-full px-3 h-8`}
          onClick={handlers[s.key]}
        >
          <s.icon className="h-3.5 w-3.5" />
          {s.label}
        </Button>
      ))}
    </div>
  );
};

export default CommunicationShortcuts;

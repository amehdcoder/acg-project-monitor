import { Brain, BookOpenCheck, ClipboardList, Layers, GraduationCap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type MajorTab = "records" | "report" | "assessments" | "brain" | "guide";

export default function WorkspaceMajorTabs({ selected, canReport, canBrain, canRecords = canBrain, canGuide = canBrain, canAssessments = false, onSelect }: {
  selected: MajorTab;
  canReport: boolean;
  canBrain: boolean;
  canRecords?: boolean;
  canGuide?: boolean;
  canAssessments?: boolean;
  onSelect: (tab: MajorTab) => void;
}) {
  const tabs = [
    { key: "records", label: "Beneficiary records", icon: Layers, show: canRecords },
    { key: "report", label: "Programme report", icon: ClipboardList, show: canReport },
    { key: "assessments", label: "Quizzes & assessments", icon: GraduationCap, show: canAssessments },
    { key: "brain", label: "Record quality brain", icon: Brain, show: canBrain },
    { key: "guide", label: "Field guide", icon: BookOpenCheck, show: canGuide },
  ] as const;
  return (
    <div role="tablist" aria-label="Cases workspace" className="flex flex-wrap gap-x-5 gap-y-1 border-b border-border">
      {tabs.filter((tab) => tab.show).map(({ key, label, icon: Icon }) => (
        <Button key={key} role="tab" aria-selected={selected === key} variant="ghost" onClick={() => onSelect(key)}
          className={cn("min-h-[52px] max-w-full gap-2 whitespace-normal rounded-none border-b-2 px-2 text-left text-sm", selected === key ? "border-health-teal bg-health-teal/5 text-health-teal" : "border-transparent text-muted-foreground hover:text-foreground")}>
          <Icon className="h-4 w-4 shrink-0" />{label}
        </Button>
      ))}
    </div>
  );
}
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import ConfigFieldRenderer, { AnswerMap, isRelevant } from "./ConfigFieldRenderer";
import { SERVICE_EXPERIENCE_SECTIONS } from "@/lib/programmeModule/standardSections";

interface Props {
  answers: AnswerMap;
  onChange: (name: string, value: unknown) => void;
  /** Sections to skip (e.g. a form that already asks the same thing). */
  skip?: string[];
}

/**
 * The cross-cutting experience block asked at every service contact:
 * participation, quality, accessibility, outcome, feedback and safeguarding.
 * Collapsed by default so routine clinical capture stays fast.
 */
const ServiceExperienceSections = ({ answers, onChange, skip = [] }: Props) => {
  const sections = SERVICE_EXPERIENCE_SECTIONS.filter((s) => !skip.includes(s.id));
  const answered = (names: string[]) =>
    names.filter((n) => {
      const v = answers[n];
      return Array.isArray(v) ? v.length > 0 : v !== undefined && v !== null && String(v) !== "";
    }).length;

  return (
    <Accordion type="multiple" className="rounded-lg border border-border">
      {sections.map((section) => {
        const names = section.questions.map((q) => q.name as string);
        const count = answered(names);
        return (
          <AccordionItem key={section.id} value={section.id} className="px-3 last:border-b-0">
            <AccordionTrigger className="py-3 text-left text-sm font-medium">
              <span className="flex-1 pr-2">{section.label}</span>
              <span className="mr-2 shrink-0 rounded-full border border-border px-2 py-0.5 text-[11px] font-normal text-muted-foreground">
                {count}/{names.length}
              </span>
            </AccordionTrigger>
            <AccordionContent className="space-y-4 pb-4">
              {section.hint && (
                <p className="text-xs text-muted-foreground">{section.hint}</p>
              )}
              {section.questions
                .filter((q) => isRelevant(q.relevant, answers))
                .map((q) => (
                  <ConfigFieldRenderer
                    key={q.id}
                    question={q}
                    value={q.name ? answers[q.name] : ""}
                    answers={answers}
                    onChange={(v) => q.name && onChange(q.name, v)}
                  />
                ))}
            </AccordionContent>
          </AccordionItem>
        );
      })}
    </Accordion>
  );
};

export default ServiceExperienceSections;

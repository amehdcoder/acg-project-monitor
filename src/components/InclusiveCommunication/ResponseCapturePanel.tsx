import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { InclusiveQuestion, CommunicationMode } from "@/hooks/useInclusiveCommunication";
import { Check, X, Plus, Minus, ThumbsUp, ThumbsDown, HelpCircle, Type } from "lucide-react";

interface Props {
  question: InclusiveQuestion;
  mode: CommunicationMode;
  onSubmitResponse: (value: any, displayValue: string) => void;
  onSkip: () => void;
}

const ResponseCapturePanel = ({ question, mode, onSubmitResponse, onSkip }: Props) => {
  const [textValue, setTextValue] = useState("");
  const [numberValue, setNumberValue] = useState(0);
  const [selectedOptions, setSelectedOptions] = useState<string[]>([]);

  const isMulti = question.type === "select_multiple";
  const isSelect = question.type === "select_one" || isMulti;
  const isNumber = question.type === "number" || question.type === "integer" || question.type === "decimal";
  const isYesNo = isSelect && question.options?.length === 2 &&
    question.options.some(o => o.value.toLowerCase() === "yes") &&
    question.options.some(o => o.value.toLowerCase() === "no");
  const isAcknowledge = question.type === "acknowledge";
  const isDate = question.type === "date" || question.type === "time" || question.type === "dateTime";
  const isRange = question.type === "range";

  // Yes/No/Don't Know quick response
  if (isYesNo) {
    return (
      <div className="p-4 space-y-4">
        <p className="text-center text-sm text-muted-foreground font-medium">Tap the answer:</p>
        <div className="grid grid-cols-3 gap-3">
          <Button
            onClick={() => onSubmitResponse("yes", "Yes ✓")}
            className="min-h-[80px] text-lg font-bold bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border-2 border-emerald-500/30 hover:border-emerald-500/50 flex-col gap-2"
            variant="outline"
          >
            <ThumbsUp className="h-8 w-8" />
            Yes
          </Button>
          <Button
            onClick={() => onSubmitResponse("no", "No ✗")}
            className="min-h-[80px] text-lg font-bold bg-red-500/10 hover:bg-red-500/20 text-red-700 dark:text-red-400 border-2 border-red-500/30 hover:border-red-500/50 flex-col gap-2"
            variant="outline"
          >
            <ThumbsDown className="h-8 w-8" />
            No
          </Button>
          <Button
            onClick={() => onSubmitResponse("dont_know", "Don't Know")}
            className="min-h-[80px] text-lg font-bold bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-400 border-2 border-amber-500/30 hover:border-amber-500/50 flex-col gap-2"
            variant="outline"
          >
            <HelpCircle className="h-8 w-8" />
            Don't Know
          </Button>
        </div>
      </div>
    );
  }

  // Acknowledge
  if (isAcknowledge) {
    return (
      <div className="p-4 flex flex-col items-center gap-4">
        <Button
          onClick={() => onSubmitResponse(true, "Acknowledged ✓")}
          size="lg"
          className="min-h-[72px] text-lg px-10 gap-3"
        >
          <ThumbsUp className="h-6 w-6" />
          I Understand
        </Button>
      </div>
    );
  }

  // Number input with large +/- buttons
  if (isNumber) {
    return (
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-center gap-4">
          <Button
            variant="outline"
            className="h-16 w-16 text-2xl rounded-full border-2"
            onClick={() => setNumberValue(prev => Math.max(0, prev - 1))}
          >
            <Minus className="h-7 w-7" />
          </Button>
          <div className="text-5xl font-bold text-foreground min-w-[100px] text-center tabular-nums">
            {numberValue}
          </div>
          <Button
            variant="outline"
            className="h-16 w-16 text-2xl rounded-full border-2"
            onClick={() => setNumberValue(prev => prev + 1)}
          >
            <Plus className="h-7 w-7" />
          </Button>
        </div>
        {/* Quick number pad */}
        <div className="grid grid-cols-5 gap-2 max-w-xs mx-auto">
          {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => (
            <Button
              key={n}
              variant="outline"
              className="h-12 text-lg font-semibold"
              onClick={() => setNumberValue(prev => prev * 10 + n)}
            >
              {n}
            </Button>
          ))}
        </div>
        <div className="flex gap-2 justify-center">
          <Button variant="ghost" size="sm" onClick={() => setNumberValue(0)}>Clear</Button>
          <Button
            size="lg"
            className="min-h-[48px] px-8"
            onClick={() => onSubmitResponse(numberValue, String(numberValue))}
          >
            <Check className="h-5 w-5 mr-2" /> Confirm {numberValue}
          </Button>
        </div>
      </div>
    );
  }

  // Select options — large visual grid
  if (isSelect && question.options) {
    const toggleOption = (value: string, label: string) => {
      if (isMulti) {
        setSelectedOptions(prev => {
          const next = prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value];
          return next;
        });
      } else {
        onSubmitResponse(value, label);
      }
    };

    return (
      <div className="p-4 space-y-4">
        <p className="text-center text-sm text-muted-foreground font-medium">
          {isMulti ? "Tap all that apply:" : "Tap one:"}
        </p>
        <div className={`grid gap-3 ${
          question.options.length <= 4 ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-3"
        }`}>
          {question.options.map((opt) => {
            const isSelected = selectedOptions.includes(opt.value);
            return (
              <Button
                key={opt.value}
                variant="outline"
                className={`min-h-[64px] text-base font-medium p-3 whitespace-normal leading-tight transition-all ${
                  isSelected
                    ? "bg-primary/10 border-primary/50 text-primary ring-2 ring-primary/30"
                    : "hover:bg-accent/50"
                }`}
                onClick={() => toggleOption(opt.value, opt.label)}
              >
                {isSelected && <Check className="h-5 w-5 shrink-0 mr-1" />}
                {opt.label}
              </Button>
            );
          })}
        </div>
        {isMulti && (
          <div className="flex gap-2 justify-center">
            {selectedOptions.length > 0 && (
              <Badge variant="secondary" className="text-sm">
                {selectedOptions.length} selected
              </Badge>
            )}
            <Button
              onClick={() => {
                const labels = question.options!.filter(o => selectedOptions.includes(o.value)).map(o => o.label);
                onSubmitResponse(selectedOptions, labels.join(", "));
              }}
              size="lg"
              className="min-h-[48px] px-8"
              disabled={selectedOptions.length === 0}
            >
              <Check className="h-5 w-5 mr-2" /> Done
            </Button>
          </div>
        )}
      </div>
    );
  }

  // Text / date / other fallback — simple keyboard input
  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-2 justify-center text-muted-foreground mb-2">
        <Type className="h-4 w-4" />
        <span className="text-sm">Type your answer below:</span>
      </div>
      <Input
        value={textValue}
        onChange={e => setTextValue(e.target.value)}
        placeholder={isDate ? "Enter date..." : "Type here..."}
        className="text-lg h-14 text-center"
        type={isDate ? "date" : "text"}
        autoFocus
      />
      <div className="flex gap-2 justify-center">
        <Button
          onClick={() => onSubmitResponse(textValue, textValue)}
          size="lg"
          className="min-h-[48px] px-8"
          disabled={!textValue.trim()}
        >
          <Check className="h-5 w-5 mr-2" /> Confirm
        </Button>
        {!question.required && (
          <Button variant="ghost" onClick={onSkip} size="lg" className="min-h-[48px]">
            Skip
          </Button>
        )}
      </div>
    </div>
  );
};

export default ResponseCapturePanel;

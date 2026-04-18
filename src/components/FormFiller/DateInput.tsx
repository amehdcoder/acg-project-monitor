/**
 * Flexible date input that lets a form designer pick the on-screen format
 * (DD/MM/YYYY, MM/DD/YYYY, YYYY-MM-DD, DD-MMM-YYYY, etc.) while always
 * persisting the value in canonical ISO 8601 (YYYY-MM-DD or YYYY-MM-DDTHH:mm)
 * for storage, sorting, and DHIS2 / Sheets export compatibility.
 *
 * Two modes:
 *  - Native (default): renders <input type="date|datetime-local"> when the
 *    chosen format matches what browsers natively support, so users still get
 *    the OS date picker.
 *  - Custom: renders a text input + popover calendar for any custom format
 *    (e.g. DD/MM/YYYY, DD-MMM-YYYY). Free-typing is parsed liberally so users
 *    can paste dates from spreadsheets or scribble "5 jan 2024".
 */

import { useEffect, useMemo, useState } from "react";
import { format, parse, isValid } from "date-fns";
import { Calendar as CalendarIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type DateFormatOption =
  | "DD/MM/YYYY"
  | "MM/DD/YYYY"
  | "YYYY-MM-DD"
  | "DD-MM-YYYY"
  | "DD.MM.YYYY"
  | "DD MMM YYYY"
  | "MMM DD, YYYY"
  | "DD MMMM YYYY"
  | "MMMM DD, YYYY";

export const DATE_FORMAT_OPTIONS: { value: DateFormatOption; label: string; example: string }[] = [
  { value: "DD/MM/YYYY", label: "DD/MM/YYYY (day first)", example: "31/12/2025" },
  { value: "MM/DD/YYYY", label: "MM/DD/YYYY (US)", example: "12/31/2025" },
  { value: "YYYY-MM-DD", label: "YYYY-MM-DD (ISO)", example: "2025-12-31" },
  { value: "DD-MM-YYYY", label: "DD-MM-YYYY", example: "31-12-2025" },
  { value: "DD.MM.YYYY", label: "DD.MM.YYYY (EU)", example: "31.12.2025" },
  { value: "DD MMM YYYY", label: "DD MMM YYYY", example: "31 Dec 2025" },
  { value: "MMM DD, YYYY", label: "MMM DD, YYYY", example: "Dec 31, 2025" },
  { value: "DD MMMM YYYY", label: "DD MMMM YYYY", example: "31 December 2025" },
  { value: "MMMM DD, YYYY", label: "MMMM DD, YYYY", example: "December 31, 2025" },
];

// date-fns uses lowercase tokens (dd/MM/yyyy). Map our display-friendly tokens.
function toDateFnsFormat(f: DateFormatOption, withTime: boolean): string {
  const map: Record<DateFormatOption, string> = {
    "DD/MM/YYYY": "dd/MM/yyyy",
    "MM/DD/YYYY": "MM/dd/yyyy",
    "YYYY-MM-DD": "yyyy-MM-dd",
    "DD-MM-YYYY": "dd-MM-yyyy",
    "DD.MM.YYYY": "dd.MM.yyyy",
    "DD MMM YYYY": "dd MMM yyyy",
    "MMM DD, YYYY": "MMM dd, yyyy",
    "DD MMMM YYYY": "dd MMMM yyyy",
    "MMMM DD, YYYY": "MMMM dd, yyyy",
  };
  const base = map[f] ?? "yyyy-MM-dd";
  return withTime ? `${base} HH:mm` : base;
}

/** Parse free-typed text against the chosen format, with sensible fallbacks. */
function parseLoose(input: string, primary: string, withTime: boolean): Date | null {
  if (!input) return null;
  const fallbacks = withTime
    ? [primary, "yyyy-MM-dd HH:mm", "yyyy-MM-dd'T'HH:mm", "dd/MM/yyyy HH:mm", "MM/dd/yyyy HH:mm"]
    : [primary, "yyyy-MM-dd", "dd/MM/yyyy", "MM/dd/yyyy", "dd-MM-yyyy", "dd MMM yyyy", "dd MMMM yyyy"];
  for (const f of fallbacks) {
    const d = parse(input.trim(), f, new Date());
    if (isValid(d)) return d;
  }
  // last resort: ISO / Date constructor
  const d = new Date(input);
  return isValid(d) ? d : null;
}

interface DateInputProps {
  /** Stored value — always canonical ISO (YYYY-MM-DD or YYYY-MM-DDTHH:mm) */
  value: string | null | undefined;
  onChange: (isoValue: string) => void;
  withTime?: boolean;
  dateFormat?: DateFormatOption;
  className?: string;
  disabled?: boolean;
  placeholder?: string;
  hasError?: boolean;
}

const DateInput = ({
  value,
  onChange,
  withTime = false,
  dateFormat = "YYYY-MM-DD",
  className,
  disabled,
  placeholder,
  hasError,
}: DateInputProps) => {
  // ISO format → native HTML input is fine and offers the best UX.
  const useNative = dateFormat === "YYYY-MM-DD";
  const dfFormat = toDateFnsFormat(dateFormat, withTime);

  // Local text state so users can type freely without each keystroke being
  // rejected. We commit to onChange only when the typed value parses cleanly.
  const [text, setText] = useState<string>("");
  const [open, setOpen] = useState(false);

  // Hydrate display text whenever the canonical value (or format) changes.
  useEffect(() => {
    if (!value) {
      setText("");
      return;
    }
    try {
      const d = withTime ? new Date(value) : parse(value, "yyyy-MM-dd", new Date());
      if (isValid(d)) setText(format(d, dfFormat));
      else setText(value);
    } catch {
      setText(value);
    }
  }, [value, dfFormat, withTime]);

  const selectedDate = useMemo(() => {
    if (!value) return undefined;
    const d = withTime ? new Date(value) : parse(value, "yyyy-MM-dd", new Date());
    return isValid(d) ? d : undefined;
  }, [value, withTime]);

  // ---- Native path ----
  if (useNative) {
    return (
      <Input
        type={withTime ? "datetime-local" : "date"}
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className={cn(hasError && "border-destructive", className)}
      />
    );
  }

  // ---- Custom-format path ----
  const commitText = (raw: string) => {
    setText(raw);
    if (!raw.trim()) {
      onChange("");
      return;
    }
    const d = parseLoose(raw, dfFormat, withTime);
    if (d) {
      onChange(withTime ? format(d, "yyyy-MM-dd'T'HH:mm") : format(d, "yyyy-MM-dd"));
    }
  };

  const handleBlur = () => {
    // On blur, if the text parsed cleanly, normalise it to the canonical display.
    if (selectedDate) setText(format(selectedDate, dfFormat));
  };

  return (
    <div className={cn("flex gap-2", className)}>
      <Input
        value={text}
        onChange={(e) => commitText(e.target.value)}
        onBlur={handleBlur}
        placeholder={placeholder ?? dateFormat}
        disabled={disabled}
        className={cn("flex-1", hasError && "border-destructive")}
        inputMode={withTime ? "text" : "numeric"}
        autoComplete="off"
      />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="icon"
            disabled={disabled}
            className="shrink-0"
            aria-label="Open calendar"
          >
            <CalendarIcon className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-auto p-0">
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={(d) => {
              if (!d) return;
              const iso = withTime
                ? format(d, "yyyy-MM-dd'T'HH:mm")
                : format(d, "yyyy-MM-dd");
              onChange(iso);
              setText(format(d, dfFormat));
              setOpen(false);
            }}
            initialFocus
            className="pointer-events-auto"
          />
        </PopoverContent>
      </Popover>
    </div>
  );
};

export default DateInput;

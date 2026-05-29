import { ArrowLeft, FileText, Clock, CheckCircle2, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatDistanceToNow, format } from "date-fns";
import type { SavedFormEntry } from "@/lib/savedForms";
import type { Question } from "@/components/FormBuilder/types";

interface SentFormViewerProps {
  entry: SavedFormEntry;
  onClose: () => void;
}

const formatValue = (q: Question, value: any): string => {
  if (value === undefined || value === null || value === "") return "—";
  // Resolve option labels for choice questions.
  if (q.options && q.options.length > 0) {
    const map = new Map(q.options.map((o) => [o.id, o.label]));
    if (Array.isArray(value)) {
      return value.map((v) => map.get(v) || String(v)).join(", ");
    }
    return map.get(value) || String(value);
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return "—";
    return value.map((v) => (typeof v === "object" ? JSON.stringify(v) : String(v))).join(", ");
  }
  if (typeof value === "object") {
    if ("lat" in value && "lng" in value) {
      return `${value.lat}, ${value.lng}`;
    }
    return JSON.stringify(value);
  }
  return String(value);
};

const isMedia = (q: Question) =>
  ["image", "audio", "video", "file", "signature"].includes(q.type as string);

const SentFormViewer = ({ entry, onClose }: SentFormViewerProps) => {
  const visibleQuestions = (entry.questions || []).filter(
    (q) => q.type !== "note" && q.type !== "calculate",
  );

  return (
    <div className="flex min-h-full flex-col bg-background">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-border bg-card px-4 py-3 sticky top-0 z-20">
        <Button variant="ghost" size="icon" onClick={onClose}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex h-10 w-10 items-center justify-center rounded-xl text-white shrink-0 bg-[#7C5CFF]">
          <FileText className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-lg font-bold text-foreground leading-tight truncate">
            {entry.formName}
          </h1>
          <p className="text-xs text-muted-foreground truncate">Read-only · Sent submission</p>
        </div>
        <Badge variant="outline" className="border-[#7C5CFF] text-[#7C5CFF] shrink-0">
          <CheckCircle2 className="mr-1 h-3 w-3" />
          Sent
        </Badge>
      </div>

      {/* Meta */}
      <div className="bg-card/60 px-4 py-2.5 border-b border-border/60 flex items-center gap-3 flex-wrap text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {entry.sentAt
            ? `Sent ${formatDistanceToNow(new Date(entry.sentAt), { addSuffix: true })}`
            : "Sent"}
        </span>
        {entry.sentAt && (
          <span className="opacity-70">{format(new Date(entry.sentAt), "PPpp")}</span>
        )}
        {entry.offline && (
          <Badge variant="outline" className="text-[9px] h-4 px-1 border-amber-400 text-amber-600">
            queued
          </Badge>
        )}
        {entry.submissionLocation && (
          <span className="inline-flex items-center gap-1">
            <MapPin className="h-3 w-3" />
            {entry.submissionLocation.lat.toFixed(5)}, {entry.submissionLocation.lng.toFixed(5)}
          </span>
        )}
      </div>

      {/* Answers (read-only) */}
      <ScrollArea className="flex-1">
        <div className="p-3 space-y-2.5 pb-24">
          {entry.formDescription && (
            <p className="text-sm text-muted-foreground px-1 pb-1">{entry.formDescription}</p>
          )}
          {visibleQuestions.length === 0 ? (
            <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
              No answer fields to display.
            </div>
          ) : (
            visibleQuestions.map((q, idx) => {
              const value = (entry.responses || {})[q.id];
              const display = formatValue(q, value);
              return (
                <div
                  key={q.id}
                  className="rounded-xl border border-border/60 bg-card p-3.5 shadow-sm"
                >
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5 text-[11px] font-semibold text-muted-foreground tabular-nums">
                      {idx + 1}.
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-foreground">{q.label}</p>
                      {isMedia(q) && value ? (
                        <p className="mt-1.5 text-sm text-foreground break-words">
                          {Array.isArray(value)
                            ? `${value.length} file(s) attached`
                            : "File attached"}
                        </p>
                      ) : (
                        <p
                          className={`mt-1.5 text-sm break-words ${
                            display === "—" ? "text-muted-foreground italic" : "text-foreground"
                          }`}
                        >
                          {display}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </ScrollArea>
    </div>
  );
};

export default SentFormViewer;

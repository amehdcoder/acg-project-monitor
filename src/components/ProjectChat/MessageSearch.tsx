import { useState, useEffect, useRef } from "react";
import { Search, X, ArrowUp, ArrowDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import type { ChatMessage } from "@/hooks/useProjectChat";

interface MessageSearchProps {
  messages: ChatMessage[];
  isOpen: boolean;
  onClose: () => void;
  onNavigateToMessage: (messageId: string) => void;
}

export function MessageSearch({
  messages,
  isOpen,
  onClose,
  onNavigateToMessage,
}: MessageSearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ChatMessage[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setCurrentIndex(0);
      return;
    }

    const lowerQuery = query.toLowerCase();
    const matches = messages.filter(
      (msg) =>
        msg.content.toLowerCase().includes(lowerQuery) ||
        msg.sender?.first_name?.toLowerCase().includes(lowerQuery) ||
        msg.sender?.last_name?.toLowerCase().includes(lowerQuery)
    );
    setResults(matches);
    setCurrentIndex(0);
  }, [query, messages]);

  const handleNavigate = (direction: "prev" | "next") => {
    if (results.length === 0) return;
    
    let newIndex: number;
    if (direction === "prev") {
      newIndex = currentIndex > 0 ? currentIndex - 1 : results.length - 1;
    } else {
      newIndex = currentIndex < results.length - 1 ? currentIndex + 1 : 0;
    }
    setCurrentIndex(newIndex);
    onNavigateToMessage(results[newIndex].id);
  };

  const handleSelectResult = (index: number) => {
    setCurrentIndex(index);
    onNavigateToMessage(results[index].id);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (results.length > 0) {
        onNavigateToMessage(results[currentIndex].id);
      }
    } else if (e.key === "Escape") {
      onClose();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      handleNavigate("prev");
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      handleNavigate("next");
    }
  };

  if (!isOpen) return null;

  return (
    <div className="absolute top-0 left-0 right-0 z-50 bg-background border-b border-border shadow-lg">
      <div className="flex items-center gap-2 p-2 sm:p-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            ref={inputRef}
            placeholder="Search messages..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            className="pl-9 pr-20"
          />
          {results.length > 0 && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
              {currentIndex + 1} of {results.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => handleNavigate("prev")}
            disabled={results.length === 0}
          >
            <ArrowUp className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => handleNavigate("next")}
            disabled={results.length === 0}
          >
            <ArrowDown className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {query.trim() && (
        <ScrollArea className="max-h-64">
          {results.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              No messages found
            </div>
          ) : (
            <div className="divide-y divide-border">
              {results.map((msg, index) => (
                <div
                  key={msg.id}
                  onClick={() => handleSelectResult(index)}
                  className={cn(
                    "px-4 py-2 cursor-pointer hover:bg-muted/50 transition-colors",
                    index === currentIndex && "bg-muted"
                  )}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-sm text-foreground">
                      {msg.sender?.first_name} {msg.sender?.last_name}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(msg.created_at), "MMM d, h:mm a")}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground line-clamp-1">
                    {msg.content}
                  </p>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      )}
    </div>
  );
}

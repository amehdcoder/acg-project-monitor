import { useState, useRef, useEffect } from "react";
import { Send, Smile, Paperclip, Mic } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface ChatInputProps {
  onSend: (content: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function ChatInput({ onSend, disabled, placeholder = "Type a message..." }: ChatInputProps) {
  const [message, setMessage] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = () => {
    if (!message.trim() || disabled) return;
    onSend(message);
    setMessage("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [message]);

  return (
    <div className="border-t border-border bg-background p-2 sm:p-3">
      <div className="flex items-end gap-2">
        <Button
          variant="ghost"
          size="icon"
          className="hidden sm:flex h-10 w-10 flex-shrink-0 text-muted-foreground hover:text-foreground"
        >
          <Smile className="h-5 w-5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="hidden sm:flex h-10 w-10 flex-shrink-0 text-muted-foreground hover:text-foreground"
        >
          <Paperclip className="h-5 w-5" />
        </Button>

        <div className="flex-1 relative">
          <Textarea
            ref={textareaRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled}
            className={cn(
              "min-h-[40px] max-h-[120px] resize-none rounded-2xl pr-12 py-2.5",
              "bg-muted/50 border-0 focus-visible:ring-1 focus-visible:ring-primary"
            )}
            rows={1}
          />
        </div>

        {message.trim() ? (
          <Button
            onClick={handleSend}
            disabled={disabled || !message.trim()}
            size="icon"
            className="h-10 w-10 flex-shrink-0 rounded-full bg-primary hover:bg-primary/90"
          >
            <Send className="h-5 w-5" />
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10 flex-shrink-0 text-muted-foreground hover:text-foreground"
          >
            <Mic className="h-5 w-5" />
          </Button>
        )}
      </div>
    </div>
  );
}

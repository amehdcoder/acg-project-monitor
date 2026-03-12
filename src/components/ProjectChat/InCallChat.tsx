import { useState, useRef, useEffect } from "react";
import { MessageSquare, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

export interface InCallChatMessage {
  id: string;
  from: string;
  fromName: string;
  content: string;
  timestamp: number;
}

interface InCallChatProps {
  messages: InCallChatMessage[];
  onSend: (content: string) => void;
  onClose: () => void;
  currentUserId: string;
}

export function InCallChat({ messages, onSend, onClose, currentUserId }: InCallChatProps) {
  const [text, setText] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText("");
  };

  return (
    <div className="w-64 sm:w-72 border-l border-border bg-card flex flex-col shrink-0 animate-in slide-in-from-right-4 duration-200">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <MessageSquare className="h-4 w-4" />
          In-Call Chat
        </h3>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-3 space-y-3">
          {messages.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-8">No messages yet. Start chatting!</p>
          )}
          {messages.map((msg) => {
            const isOwn = msg.from === currentUserId;
            return (
              <div key={msg.id} className={cn("flex flex-col gap-0.5", isOwn ? "items-end" : "items-start")}>
                {!isOwn && (
                  <span className="text-[10px] text-muted-foreground font-medium">{msg.fromName}</span>
                )}
                <div
                  className={cn(
                    "max-w-[85%] rounded-xl px-3 py-1.5 text-xs",
                    isOwn
                      ? "bg-primary text-primary-foreground rounded-br-sm"
                      : "bg-muted text-foreground rounded-bl-sm"
                  )}
                >
                  {msg.content}
                </div>
                <span className="text-[9px] text-muted-foreground">
                  {new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
            );
          })}
          <div ref={endRef} />
        </div>
      </ScrollArea>

      <div className="p-2 border-t border-border">
        <form
          className="flex gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
        >
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Type a message..."
            className="h-8 text-xs"
          />
          <Button type="submit" size="icon" className="h-8 w-8 shrink-0" disabled={!text.trim()}>
            <Send className="h-3.5 w-3.5" />
          </Button>
        </form>
      </div>
    </div>
  );
}

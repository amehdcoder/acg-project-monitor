import { format } from "date-fns";
import { Check, CheckCheck } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import type { ChatMessage as ChatMessageType } from "@/hooks/useProjectChat";

interface ChatMessageProps {
  message: ChatMessageType;
  isOwn: boolean;
  showAvatar?: boolean;
}

export function ChatMessage({ message, isOwn, showAvatar = true }: ChatMessageProps) {
  const senderName = message.sender
    ? `${message.sender.first_name} ${message.sender.last_name}`
    : "Unknown User";
  
  const initials = message.sender
    ? `${message.sender.first_name?.[0] || ""}${message.sender.last_name?.[0] || ""}`
    : "??";

  return (
    <div
      className={cn(
        "flex gap-2 px-2 sm:px-4 py-1 group",
        isOwn ? "flex-row-reverse" : "flex-row"
      )}
    >
      {showAvatar && !isOwn && (
        <Avatar className="h-8 w-8 flex-shrink-0">
          <AvatarImage src={message.sender?.avatar_url || undefined} />
          <AvatarFallback className="bg-primary/10 text-primary text-xs">
            {initials}
          </AvatarFallback>
        </Avatar>
      )}
      {showAvatar && isOwn && <div className="w-8" />}

      <div
        className={cn(
          "max-w-[75%] sm:max-w-[65%] rounded-2xl px-3 py-2 shadow-sm",
          isOwn
            ? "bg-primary text-primary-foreground rounded-br-md"
            : "bg-muted rounded-bl-md"
        )}
      >
        {!isOwn && (
          <p className="text-xs font-medium mb-1 opacity-80">{senderName}</p>
        )}
        <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>
        <div
          className={cn(
            "flex items-center gap-1 mt-1",
            isOwn ? "justify-end" : "justify-start"
          )}
        >
          <span className="text-[10px] opacity-60">
            {format(new Date(message.created_at), "HH:mm")}
          </span>
          {isOwn && (
            <CheckCheck className="h-3 w-3 opacity-60" />
          )}
          {message.is_edited && (
            <span className="text-[10px] opacity-50 italic">edited</span>
          )}
        </div>
      </div>
    </div>
  );
}

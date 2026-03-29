import { format } from "date-fns";
import { Check, CheckCheck, Image as ImageIcon, FileText, Download, Reply, MoreHorizontal } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { ChatMessage as ChatMessageType } from "@/hooks/useProjectChat";
import { MessageReactions } from "./MessageReactions";

interface ChatMessageProps {
  message: ChatMessageType;
  isOwn: boolean;
  showAvatar?: boolean;
  members?: Array<{ user_id: string; first_name: string; last_name: string }>;
  currentUserId?: string;
  onReply?: () => void;
}

export function ChatMessage({ message, isOwn, showAvatar = true, members = [], currentUserId, onReply }: ChatMessageProps) {
  const senderName = message.sender
    ? `${message.sender.first_name} ${message.sender.last_name}`
    : "Unknown User";
  
  const initials = message.sender
    ? `${message.sender.first_name?.[0] || ""}${message.sender.last_name?.[0] || ""}`
    : "??";

  const isSystemMessage = message.message_type === "system";

  // Parse mentions and highlight them
  const renderContent = (content: string) => {
    const mentionRegex = /@\[([^\]]+)\]\(([^)]+)\)/g;
    const parts: (string | JSX.Element)[] = [];
    let lastIndex = 0;
    let match;

    while ((match = mentionRegex.exec(content)) !== null) {
      if (match.index > lastIndex) {
        parts.push(content.slice(lastIndex, match.index));
      }
      
      const mentionName = match[1];
      const mentionUserId = match[2];
      parts.push(
        <span 
          key={`${mentionUserId}-${match.index}`}
          className={cn(
            "font-medium rounded px-1",
            isOwn 
              ? "bg-primary-foreground/20 text-primary-foreground" 
              : "bg-primary/10 text-primary"
          )}
        >
          @{mentionName}
        </span>
      );
      
      lastIndex = match.index + match[0].length;
    }
    
    if (lastIndex < content.length) {
      parts.push(content.slice(lastIndex));
    }
    
    return parts.length > 0 ? parts : content;
  };

  const renderAttachment = () => {
    if (!message.attachment_url) return null;
    
    const isImage = message.attachment_type?.startsWith("image/");
    
    if (isImage) {
      return (
        <a 
          href={message.attachment_url} 
          target="_blank" 
          rel="noopener noreferrer"
          className="block mt-2"
        >
          <img 
            src={message.attachment_url} 
            alt={message.attachment_name || "Image"} 
            className="max-w-full max-h-60 rounded-lg object-cover shadow-sm"
            loading="lazy"
          />
        </a>
      );
    }
    
    return (
      <a 
        href={message.attachment_url}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          "flex items-center gap-2 mt-2 p-2.5 rounded-lg transition-colors",
          isOwn 
            ? "bg-primary-foreground/10 hover:bg-primary-foreground/20" 
            : "bg-muted/50 hover:bg-muted"
        )}
      >
        <FileText className="h-5 w-5 flex-shrink-0" />
        <span className="text-sm truncate flex-1">{message.attachment_name || "File"}</span>
        <Download className="h-4 w-4 flex-shrink-0 opacity-60" />
      </a>
    );
  };

  // System messages (meeting summaries, attendance, etc.)
  if (isSystemMessage) {
    return (
      <div className="flex justify-center px-4 py-2">
        <div className="max-w-[85%] bg-muted/60 rounded-xl px-4 py-3 border border-border/50 shadow-sm">
          <p className="text-xs text-muted-foreground whitespace-pre-wrap font-mono leading-relaxed">
            {message.content}
          </p>
          <div className="flex items-center gap-1 mt-2 justify-end">
            <span className="text-[10px] text-muted-foreground/60">
              {format(new Date(message.created_at), "HH:mm")}
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex gap-2 px-2 sm:px-4 py-0.5 group hover:bg-muted/10 transition-colors",
        isOwn ? "flex-row-reverse" : "flex-row"
      )}
    >
      {showAvatar && !isOwn && (
        <Avatar className="h-8 w-8 flex-shrink-0 mt-1">
          <AvatarImage src={message.sender?.avatar_url || undefined} />
          <AvatarFallback className="bg-primary/10 text-primary text-xs font-medium">
            {initials}
          </AvatarFallback>
        </Avatar>
      )}
      {!showAvatar && !isOwn && <div className="w-8 shrink-0" />}
      {showAvatar && isOwn && <div className="w-8 shrink-0" />}

      <div className="relative max-w-[75%] sm:max-w-[65%]">
        <div
          className={cn(
            "rounded-2xl px-3 py-2 shadow-sm relative",
            isOwn
              ? "bg-primary text-primary-foreground rounded-br-sm"
              : "bg-card border border-border/50 rounded-bl-sm"
          )}
        >
          {!isOwn && showAvatar && (
            <p className="text-xs font-semibold mb-0.5 text-primary">{senderName}</p>
          )}
          {message.content && (
            <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">
              {renderContent(message.content)}
            </p>
          )}
          {renderAttachment()}
          <div
            className={cn(
              "flex items-center gap-1 mt-1",
              isOwn ? "justify-end" : "justify-start"
            )}
          >
            <span className={cn("text-[10px]", isOwn ? "text-primary-foreground/60" : "text-muted-foreground/60")}>
              {format(new Date(message.created_at), "HH:mm")}
            </span>
            {isOwn && (
              <CheckCheck className="h-3 w-3 text-primary-foreground/60" />
            )}
            {message.is_edited && (
              <span className={cn("text-[10px] italic", isOwn ? "text-primary-foreground/50" : "text-muted-foreground/50")}>edited</span>
            )}
          </div>
        </div>

        {/* Action buttons on hover */}
        <div className={cn(
          "absolute top-0 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5",
          isOwn ? "left-0 -translate-x-full pr-1" : "right-0 translate-x-full pl-1"
        )}>
          {onReply && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 rounded-full bg-background shadow-sm border border-border/50"
              onClick={onReply}
              title="Reply"
            >
              <Reply className="h-3 w-3" />
            </Button>
          )}
        </div>

        {currentUserId && (
          <MessageReactions
            messageId={message.id}
            currentUserId={currentUserId}
            isOwn={isOwn}
          />
        )}
      </div>
    </div>
  );
}

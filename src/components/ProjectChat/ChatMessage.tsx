import { format } from "date-fns";
import { Check, CheckCheck, Image as ImageIcon, FileText, Download } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import type { ChatMessage as ChatMessageType } from "@/hooks/useProjectChat";
import { MessageReactions } from "./MessageReactions";

interface ChatMessageProps {
  message: ChatMessageType;
  isOwn: boolean;
  showAvatar?: boolean;
  members?: Array<{ user_id: string; first_name: string; last_name: string }>;
  currentUserId?: string;
}

export function ChatMessage({ message, isOwn, showAvatar = true, members = [], currentUserId }: ChatMessageProps) {
  const senderName = message.sender
    ? `${message.sender.first_name} ${message.sender.last_name}`
    : "Unknown User";
  
  const initials = message.sender
    ? `${message.sender.first_name?.[0] || ""}${message.sender.last_name?.[0] || ""}`
    : "??";

  // Parse mentions and highlight them
  const renderContent = (content: string) => {
    // Replace mention syntax with styled spans
    const mentionRegex = /@\[([^\]]+)\]\(([^)]+)\)/g;
    const parts: (string | JSX.Element)[] = [];
    let lastIndex = 0;
    let match;

    while ((match = mentionRegex.exec(content)) !== null) {
      // Add text before mention
      if (match.index > lastIndex) {
        parts.push(content.slice(lastIndex, match.index));
      }
      
      // Add highlighted mention
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
    
    // Add remaining text
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
            className="max-w-full max-h-60 rounded-lg object-cover"
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
          "flex items-center gap-2 mt-2 p-2 rounded-lg transition-colors",
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
        {message.content && (
          <p className="text-sm whitespace-pre-wrap break-words">
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

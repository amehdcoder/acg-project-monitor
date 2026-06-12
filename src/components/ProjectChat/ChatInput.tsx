import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { Send, Smile, Paperclip, Mic, X, Image, FileText, Loader2, Music, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { ComposerActionsMenu } from "./ComposerActionsMenu";
import type { PollPayload, LocationPayload, EventPayload } from "./specialMessages";

interface MentionUser {
  user_id: string;
  first_name: string;
  last_name: string;
}

interface ChatInputProps {
  onSend: (content: string, attachment?: { url: string; type: string; name: string }) => void;
  onUpload: (file: File) => Promise<{ url: string; type: string; name: string } | null>;
  onSendSpecial?: (
    messageType: "poll" | "location" | "event",
    payload: PollPayload | LocationPayload | EventPayload,
  ) => void;
  disabled?: boolean;
  placeholder?: string;
  members?: MentionUser[];
  onTyping?: () => void;
}

const EMOJI_QUICK_PICKS = ["👍", "❤️", "😂", "🔥", "👏", "🎉", "💯", "🙏"];

export function ChatInput({ 
  onSend, 
  onUpload,
  onSendSpecial,
  disabled, 
  placeholder = "Type a message...",
  members = [],
  onTyping,
}: ChatInputProps) {
  const [message, setMessage] = useState("");
  const [attachment, setAttachment] = useState<{ url: string; type: string; name: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [showMentions, setShowMentions] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [mentionSearch, setMentionSearch] = useState("");
  const [mentionIndex, setMentionIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const filteredMembers = useMemo(() => {
    if (!mentionSearch) return members;
    const search = mentionSearch.toLowerCase();
    return members.filter(m => 
      `${m.first_name} ${m.last_name}`.toLowerCase().includes(search)
    );
  }, [members, mentionSearch]);

  const handleSend = useCallback(() => {
    if ((!message.trim() && !attachment) || disabled) return;
    onSend(message, attachment || undefined);
    setMessage("");
    setAttachment(null);
    setShowEmoji(false);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [message, attachment, disabled, onSend]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (showMentions) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMentionIndex(prev => Math.min(prev + 1, filteredMembers.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setMentionIndex(prev => Math.max(prev - 1, 0));
      } else if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        if (filteredMembers[mentionIndex]) {
          insertMention(filteredMembers[mentionIndex]);
        }
      } else if (e.key === "Escape") {
        setShowMentions(false);
      }
    } else if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setMessage(value);
    onTyping?.();
    
    // Check for @ mention trigger
    const cursorPos = e.target.selectionStart;
    const textBeforeCursor = value.slice(0, cursorPos);
    const atMatch = textBeforeCursor.match(/@(\w*)$/);
    
    if (atMatch) {
      setShowMentions(true);
      setMentionSearch(atMatch[1]);
      setMentionIndex(0);
    } else {
      setShowMentions(false);
      setMentionSearch("");
    }
  };

  const insertMention = (member: MentionUser) => {
    if (!textareaRef.current) return;
    
    const cursorPos = textareaRef.current.selectionStart;
    const textBeforeCursor = message.slice(0, cursorPos);
    const textAfterCursor = message.slice(cursorPos);
    
    const atMatch = textBeforeCursor.match(/@(\w*)$/);
    if (!atMatch) return;
    
    const atPosition = cursorPos - atMatch[0].length;
    const newText = 
      message.slice(0, atPosition) + 
      `@[${member.first_name} ${member.last_name}](${member.user_id}) ` +
      textAfterCursor;
    
    setMessage(newText);
    setShowMentions(false);
    setMentionSearch("");
    textareaRef.current.focus();
  };

  const insertEmoji = (emoji: string) => {
    setMessage(prev => prev + emoji);
    setShowEmoji(false);
    textareaRef.current?.focus();
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const isMedia = file.type.startsWith("audio/") || file.type.startsWith("video/");
    const maxSize = isMedia ? 50 * 1024 * 1024 : 10 * 1024 * 1024;
    if (file.size > maxSize) {
      alert(`File size must be less than ${isMedia ? "50MB" : "10MB"}`);
      return;
    }
    
    setUploading(true);
    try {
      const result = await onUpload(file);
      if (result) {
        setAttachment(result);
      }
    } catch (err) {
      console.error("Upload error:", err);
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const getAttachmentIcon = (type: string) => {
    if (type.startsWith("image/")) return <Image className="h-4 w-4" />;
    if (type.startsWith("audio/")) return <Music className="h-4 w-4" />;
    if (type.startsWith("video/")) return <Video className="h-4 w-4" />;
    return <FileText className="h-4 w-4" />;
  };

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [message]);

  return (
    <div className="border-t border-border bg-background">
      {/* Attachment preview */}
      {attachment && (
        <div className="px-3 pt-3">
          <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/50 border border-border max-w-xs">
            {getAttachmentIcon(attachment.type)}
            <span className="text-sm truncate flex-1">{attachment.name}</span>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 flex-shrink-0"
              onClick={() => setAttachment(null)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      <div className="p-2 sm:p-3">
        <div className="flex items-end gap-2 relative">
          {/* Mention suggestions dropdown */}
          {showMentions && filteredMembers.length > 0 && (
            <div className="absolute bottom-full left-0 mb-2 w-64 max-h-48 overflow-y-auto bg-popover border border-border rounded-xl shadow-lg z-50">
              {filteredMembers.map((member, idx) => (
                <button
                  key={member.user_id}
                  className={cn(
                    "w-full px-3 py-2 text-left text-sm hover:bg-muted flex items-center gap-2 transition-colors",
                    idx === mentionIndex && "bg-muted",
                    idx === 0 && "rounded-t-xl",
                    idx === filteredMembers.length - 1 && "rounded-b-xl"
                  )}
                  onClick={() => insertMention(member)}
                >
                  <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium text-primary shrink-0">
                    {member.first_name?.[0]}{member.last_name?.[0]}
                  </div>
                  <span className="truncate">{member.first_name} {member.last_name}</span>
                </button>
              ))}
            </div>
          )}

          {/* Emoji quick picker */}
          {showEmoji && (
            <div className="absolute bottom-full left-0 mb-2 bg-popover border border-border rounded-xl shadow-lg z-50 p-2">
              <div className="flex gap-1">
                {EMOJI_QUICK_PICKS.map(emoji => (
                  <button
                    key={emoji}
                    className="h-9 w-9 flex items-center justify-center hover:bg-muted rounded-lg text-lg transition-colors"
                    onClick={() => insertEmoji(emoji)}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          )}

          <Button
            variant="ghost"
            size="icon"
            className="hidden sm:flex h-10 w-10 flex-shrink-0 text-muted-foreground hover:text-foreground"
            onClick={() => { setShowEmoji(!showEmoji); setShowMentions(false); }}
          >
            <Smile className="h-5 w-5" />
          </Button>
          
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept="image/*,audio/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.zip"
            onChange={handleFileSelect}
          />
          <Button
            variant="ghost"
            size="icon"
            className="hidden sm:flex h-10 w-10 flex-shrink-0 text-muted-foreground hover:text-foreground"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Paperclip className="h-5 w-5" />
            )}
          </Button>

          <div className="flex-1 relative">
            <Textarea
              ref={textareaRef}
              value={message}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              onFocus={() => setShowEmoji(false)}
              placeholder={placeholder}
              disabled={disabled}
              className={cn(
                "min-h-[40px] max-h-[200px] resize-none rounded-2xl pr-12 py-2.5 overflow-y-auto",
                "bg-muted/50 border-0 focus-visible:ring-1 focus-visible:ring-primary"
              )}
              rows={1}
            />
            <button
              className="absolute right-3 bottom-2.5 text-xs text-muted-foreground hover:text-primary transition-colors"
              onClick={() => {
                setMessage(prev => prev + "@");
                textareaRef.current?.focus();
              }}
              type="button"
            >
              @
            </button>
          </div>

          {(message.trim() || attachment) ? (
            <Button
              onClick={handleSend}
              disabled={disabled || (!message.trim() && !attachment)}
              size="icon"
              className="h-10 w-10 flex-shrink-0 rounded-full bg-primary hover:bg-primary/90 shadow-sm"
            >
              <Send className="h-5 w-5" />
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10 flex-shrink-0 text-muted-foreground hover:text-foreground sm:hidden"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Paperclip className="h-5 w-5" />}
            </Button>
          )}
        </div>
        
        {/* Mobile actions */}
        <div className="flex sm:hidden gap-2 mt-2">
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={() => { setShowEmoji(!showEmoji); }}
          >
            <Smile className="h-4 w-4 mr-2" />
            Emoji
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Paperclip className="h-4 w-4 mr-2" />
            )}
            Attach
          </Button>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import {
  CheckCheck,
  FileText,
  Download,
  Reply,
  MoreVertical,
  Copy,
  Info,
  Pin,
  PinOff,
  Trash2,
  Loader2,
  ScrollText,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import type { ChatMessage as ChatMessageType } from "@/hooks/useProjectChat";
import { MessageReactions } from "./MessageReactions";
import { parseSpecial } from "./specialMessages";
import { PollMessage } from "./PollMessage";
import { LocationMessage } from "./LocationMessage";
import { EventMessage } from "./EventMessage";

interface ChatMessageProps {
  message: ChatMessageType;
  isOwn: boolean;
  showAvatar?: boolean;
  members?: Array<{ user_id: string; first_name: string; last_name: string }>;
  currentUserId?: string;
  isAdmin?: boolean;
  onReply?: () => void;
  onDelete?: () => void;
  onTogglePin?: () => void;
}

interface ReactionRow {
  id: string;
  emoji: string;
  user_id: string;
  created_at: string;
}

export function ChatMessage({
  message,
  isOwn,
  showAvatar = true,
  members = [],
  currentUserId,
  isAdmin = false,
  onReply,
  onDelete,
  onTogglePin,
}: ChatMessageProps) {
  const senderName = message.sender
    ? `${message.sender.first_name} ${message.sender.last_name}`
    : "Unknown User";

  const initials = message.sender
    ? `${message.sender.first_name?.[0] || ""}${message.sender.last_name?.[0] || ""}`
    : "??";

  const [transcription, setTranscription] = useState<string | null>(message.transcription || null);
  const [transcribing, setTranscribing] = useState(false);
  const [selected, setSelected] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const nameFor = (uid: string) => {
    if (uid === currentUserId) return "You";
    const m = members.find((mm) => mm.user_id === uid);
    return m ? `${m.first_name} ${m.last_name}`.trim() : "Member";
  };

  const handleTranscribe = async () => {
    if (transcribing) return;
    setTranscribing(true);
    try {
      const { data, error } = await supabase.functions.invoke("transcribe-chat-media", {
        body: { messageId: message.id },
      });
      if (error) throw error;
      if (data?.transcription) {
        setTranscription(data.transcription as string);
      } else {
        toast({ title: data?.error || "No speech detected in this file." });
      }
    } catch {
      toast({ title: "Transcription failed", description: "Please try again.", variant: "destructive" });
    } finally {
      setTranscribing(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content || "");
      toast({ title: "Copied to clipboard" });
    } catch {
      toast({ title: "Couldn't copy", variant: "destructive" });
    }
  };

  // ── Long-press to highlight & open the WhatsApp-style action menu ──
  const startLongPress = () => {
    longPressTimer.current = setTimeout(() => {
      setSelected(true);
      setMenuOpen(true);
    }, 450);
  };
  const cancelLongPress = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const canDelete = isOwn || isAdmin;
  const canPin = isAdmin;

  const isSystemMessage = message.message_type === "system";
  const special = parseSpecial(message.message_type, message.content);

  const renderContent = (content: string) => {
    const mentionRegex = /@\[([^\]]+)\]\(([^)]+)\)/g;
    const parts: (string | JSX.Element)[] = [];
    let lastIndex = 0;
    let match;
    while ((match = mentionRegex.exec(content)) !== null) {
      if (match.index > lastIndex) parts.push(content.slice(lastIndex, match.index));
      const mentionName = match[1];
      const mentionUserId = match[2];
      parts.push(
        <span
          key={`${mentionUserId}-${match.index}`}
          className={cn(
            "font-medium rounded px-1",
            isOwn ? "bg-primary-foreground/20 text-primary-foreground" : "bg-primary/10 text-primary",
          )}
        >
          @{mentionName}
        </span>,
      );
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < content.length) parts.push(content.slice(lastIndex));
    return parts.length > 0 ? parts : content;
  };

  const renderTranscribeBlock = () => {
    const isAudio = message.attachment_type?.startsWith("audio/");
    const isVideo = message.attachment_type?.startsWith("video/");
    if (!isAudio && !isVideo) return null;
    return (
      <div className="mt-2">
        {transcription ? (
          <div className="rounded-lg p-2.5 bg-background/70 border border-border/60">
            <div className="flex items-center gap-1.5 mb-1 text-[11px] font-semibold opacity-70">
              <ScrollText className="h-3.5 w-3.5" /> Transcript
            </div>
            <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">{transcription}</p>
          </div>
        ) : (
          <Button
            variant="secondary"
            size="sm"
            className="h-7 gap-1.5 text-xs"
            onClick={handleTranscribe}
            disabled={transcribing}
          >
            {transcribing ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Transcribing…
              </>
            ) : (
              <>
                <ScrollText className="h-3.5 w-3.5" /> Transcribe
              </>
            )}
          </Button>
        )}
      </div>
    );
  };

  const renderAttachment = () => {
    if (!message.attachment_url) return null;
    const isImage = message.attachment_type?.startsWith("image/");
    const isAudio = message.attachment_type?.startsWith("audio/");
    const isVideo = message.attachment_type?.startsWith("video/");

    if (isImage) {
      return (
        <a href={message.attachment_url} target="_blank" rel="noopener noreferrer" className="block mt-2">
          <img
            src={message.attachment_url}
            alt={message.attachment_name || "Image"}
            className="max-w-full max-h-60 rounded-lg object-cover shadow-sm"
            loading="lazy"
          />
        </a>
      );
    }
    if (isAudio) {
      return (
        <div className="mt-2">
          <audio src={message.attachment_url} controls className="w-full max-w-[260px]" preload="metadata" />
          {renderTranscribeBlock()}
        </div>
      );
    }
    if (isVideo) {
      return (
        <div className="mt-2">
          <video src={message.attachment_url} controls className="w-full max-h-60 rounded-lg" preload="metadata" />
          {renderTranscribeBlock()}
        </div>
      );
    }
    return (
      <a
        href={message.attachment_url}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          "flex items-center gap-2 mt-2 p-2.5 rounded-lg transition-colors",
          isOwn ? "bg-primary-foreground/10 hover:bg-primary-foreground/20" : "bg-muted/50 hover:bg-muted",
        )}
      >
        <FileText className="h-5 w-5 flex-shrink-0" />
        <span className="text-sm truncate flex-1">{message.attachment_name || "File"}</span>
        <Download className="h-4 w-4 flex-shrink-0 opacity-60" />
      </a>
    );
  };

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

  const ActionMenu = (
    <DropdownMenu open={menuOpen} onOpenChange={(o) => { setMenuOpen(o); if (!o) setSelected(false); }}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Message options"
          onClick={() => setSelected(true)}
          className="flex h-6 w-6 items-center justify-center rounded-full bg-background/90 shadow-sm border border-border/50 text-muted-foreground hover:text-foreground hover:bg-background transition-colors"
        >
          <MoreVertical className="h-3.5 w-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={isOwn ? "end" : "start"} className="w-48 rounded-xl">
        {onReply && (
          <DropdownMenuItem onClick={onReply} className="gap-2.5">
            <Reply className="h-4 w-4" /> Reply
          </DropdownMenuItem>
        )}
        {message.content && (
          <DropdownMenuItem onClick={handleCopy} className="gap-2.5">
            <Copy className="h-4 w-4" /> Copy
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={() => setInfoOpen(true)} className="gap-2.5">
          <Info className="h-4 w-4" /> Info
        </DropdownMenuItem>
        {canPin && (
          <DropdownMenuItem onClick={onTogglePin} className="gap-2.5">
            {message.is_pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
            {message.is_pinned ? "Unpin" : "Pin"}
          </DropdownMenuItem>
        )}
        {canDelete && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={onDelete}
              className="gap-2.5 text-destructive focus:text-destructive"
            >
              <Trash2 className="h-4 w-4" /> Delete
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <>
      <div
        className={cn(
          "flex gap-2 px-2 sm:px-4 py-0.5 group transition-colors rounded-lg",
          selected ? "bg-primary/10 ring-1 ring-primary/30" : "hover:bg-muted/10",
          isOwn ? "flex-row-reverse" : "flex-row",
        )}
      >
        {showAvatar && !isOwn && (
          <Avatar className="h-8 w-8 flex-shrink-0 mt-1">
            <AvatarImage src={message.sender?.avatar_url || undefined} />
            <AvatarFallback className="bg-primary/10 text-primary text-xs font-medium">{initials}</AvatarFallback>
          </Avatar>
        )}
        {!showAvatar && !isOwn && <div className="w-8 shrink-0" />}
        {showAvatar && isOwn && <div className="w-8 shrink-0" />}

        <div className="relative max-w-[78%] sm:max-w-[65%]">
          <div
            className={cn("rounded-lg px-2.5 py-1.5 shadow-sm relative", isOwn ? "rounded-tr-none" : "rounded-tl-none")}
            style={{
              backgroundColor: isOwn ? "hsl(var(--wa-bubble-out))" : "hsl(var(--wa-bubble-in))",
              color: "hsl(var(--wa-bubble-foreground))",
            }}
            onTouchStart={startLongPress}
            onTouchEnd={cancelLongPress}
            onTouchMove={cancelLongPress}
            onContextMenu={(e) => {
              e.preventDefault();
              setSelected(true);
              setMenuOpen(true);
            }}
          >
            {message.is_pinned && (
              <span
                className="absolute -top-2 left-2 flex items-center gap-1 rounded-full bg-[hsl(var(--wa-accent))] px-1.5 py-0.5 text-[9px] font-semibold text-white shadow"
              >
                <Pin className="h-2.5 w-2.5" /> Pinned
              </span>
            )}
            {!isOwn && showAvatar && (
              <p className="text-xs font-semibold mb-0.5" style={{ color: "hsl(var(--wa-accent))" }}>
                {senderName}
              </p>
            )}
            {special?.kind === "poll" && (
              <PollMessage
                messageId={message.id}
                poll={special}
                currentUserId={currentUserId}
                isOwn={isOwn}
                nameFor={nameFor}
              />
            )}
            {special?.kind === "location" && <LocationMessage location={special} />}
            {special?.kind === "event" && (
              <EventMessage
                messageId={message.id}
                event={special}
                currentUserId={currentUserId}
                nameFor={nameFor}
              />
            )}
            {!special && message.content && (
              <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">
                {renderContent(message.content)}
              </p>
            )}
            {renderAttachment()}
            <div className={cn("flex items-center gap-1 mt-1", isOwn ? "justify-end" : "justify-start")}>
              <span className="text-[10px]" style={{ color: "hsl(var(--wa-secondary-text))" }}>
                {format(new Date(message.created_at), "HH:mm")}
              </span>
              {isOwn && <CheckCheck className="h-3.5 w-3.5" style={{ color: "hsl(var(--wa-tick))" }} />}
              {message.is_edited && (
                <span className="text-[10px] italic" style={{ color: "hsl(var(--wa-secondary-text))" }}>
                  edited
                </span>
              )}
            </div>
          </div>

          {/* Hover actions: quick reply + ellipsis menu */}
          <div
            className={cn(
              "absolute top-0 flex items-center gap-0.5 transition-opacity",
              selected || menuOpen ? "opacity-100" : "opacity-0 group-hover:opacity-100",
              isOwn ? "left-0 -translate-x-full pr-1" : "right-0 translate-x-full pl-1",
            )}
          >
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
            {ActionMenu}
          </div>

          {currentUserId && (
            <MessageReactions messageId={message.id} currentUserId={currentUserId} isOwn={isOwn} nameFor={nameFor} />
          )}
        </div>
      </div>

      <MessageInfoDialog
        open={infoOpen}
        onOpenChange={setInfoOpen}
        message={message}
        senderName={isOwn ? "You" : senderName}
        nameFor={nameFor}
      />
    </>
  );
}

/** WhatsApp-style "Message info": shows delivery time, who read it, and who
 *  reacted (grouped by emoji), mirroring attachment 3. */
function MessageInfoDialog({
  open,
  onOpenChange,
  message,
  senderName,
  nameFor,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  message: ChatMessageType;
  senderName: string;
  nameFor: (uid: string) => string;
}) {
  const [reactions, setReactions] = useState<ReactionRow[]>([]);
  const [readers, setReaders] = useState<Array<{ user_id: string; read_at: string }>>([]);

  useEffect(() => {
    if (!open) return;
    let active = true;
    (async () => {
      const [rx, rr] = await Promise.all([
        supabase.from("message_reactions").select("id, emoji, user_id, created_at").eq("message_id", message.id),
        supabase.from("message_read_receipts").select("user_id, read_at").eq("message_id", message.id),
      ]);
      if (!active) return;
      setReactions((rx.data as ReactionRow[]) || []);
      setReaders((rr.data as any[]) || []);
    })();
    return () => {
      active = false;
    };
  }, [open, message.id]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm rounded-2xl">
        <DialogHeader>
          <DialogTitle>Message info</DialogTitle>
        </DialogHeader>

        <div className="rounded-xl border border-border/50 bg-muted/30 p-3">
          <p className="text-xs font-semibold text-primary mb-1">{senderName}</p>
          {message.content && (
            <p className="text-sm whitespace-pre-wrap break-words leading-relaxed line-clamp-4">{message.content}</p>
          )}
          <p className="mt-2 text-[11px] text-muted-foreground">
            {format(new Date(message.created_at), "EEE, d MMM yyyy 'at' HH:mm")}
          </p>
        </div>

        <Section title={`Reactions${reactions.length ? ` · ${reactions.length}` : ""}`}>
          {reactions.length === 0 ? (
            <Empty>No reactions yet</Empty>
          ) : (
            <ul className="space-y-1.5">
              {reactions.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-2">
                  <span className="text-sm">{nameFor(r.user_id)}</span>
                  <span className="text-lg leading-none">{r.emoji}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title={`Read by${readers.length ? ` · ${readers.length}` : ""}`}>
          {readers.length === 0 ? (
            <Empty>Not read yet</Empty>
          ) : (
            <ul className="space-y-1.5">
              {readers.map((r) => (
                <li key={r.user_id} className="flex items-center justify-between gap-2">
                  <span className="text-sm">{nameFor(r.user_id)}</span>
                  <span className="text-[11px] text-muted-foreground">{format(new Date(r.read_at), "HH:mm")}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </DialogContent>
    </Dialog>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-1">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">{title}</p>
      {children}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted-foreground/70 italic">{children}</p>;
}

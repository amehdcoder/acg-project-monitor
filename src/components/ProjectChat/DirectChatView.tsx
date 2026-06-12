import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Send, MoreVertical, Archive, Trash2, MapPin, Check, CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/useAuth";
import { useDirectThread, type DirectChat } from "@/hooks/useDirectChats";
import { ComposerActionsMenu } from "./ComposerActionsMenu";
import { MessageReactions } from "./MessageReactions";
import { PollMessage } from "./PollMessage";
import { LocationMessage } from "./LocationMessage";
import { EventMessage } from "./EventMessage";
import { parseSpecial } from "./specialMessages";

interface DirectChatViewProps {
  chat: DirectChat;
  onBack: () => void;
  onArchive: () => void;
  onDelete: () => void;
}

const Tick = ({ m }: { m: { delivered_at: string | null; read_at: string | null } }) => {
  if (m.read_at) return <CheckCheck className="h-3.5 w-3.5" style={{ color: "hsl(var(--wa-tick))" }} />;
  if (m.delivered_at) return <CheckCheck className="h-3.5 w-3.5 opacity-60" />;
  return <Check className="h-3.5 w-3.5 opacity-60" />;
};

export function DirectChatView({ chat, onBack, onArchive, onDelete }: DirectChatViewProps) {
  const { user } = useAuth();
  const { messages, otherTyping, sending, notifyTyping, sendMessage, sendSpecial } = useDirectThread(chat);
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, otherTyping]);

  const handleSend = async () => {
    const text = draft;
    if (!text.trim()) return;
    setDraft("");
    await sendMessage(text);
  };

  // Resolve a display name for poll/event/reaction participants (only two people
  // are ever in a direct conversation).
  const nameFor = (uid: string) => {
    if (uid === user?.id) return "You";
    return chat.other_name || "Member";
  };

  const initial = (chat.other_name || "U").charAt(0).toUpperCase();

  const grouped = messages.reduce((acc, m) => {
    const d = new Date(m.created_at).toLocaleDateString();
    (acc[d] = acc[d] || []).push(m);
    return acc;
  }, {} as Record<string, typeof messages>);

  return (
    <div className="flex-1 flex flex-col min-w-0 h-full">
      {/* Header */}
      <div
        className="flex items-center gap-3 px-3 py-2.5 flex-shrink-0"
        style={{ backgroundColor: "hsl(var(--wa-header))", color: "hsl(var(--wa-header-foreground))" }}
      >
        <Button variant="ghost" size="icon" className="h-8 w-8 lg:hidden text-current hover:bg-white/10" onClick={onBack}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <Avatar className="h-10 w-10">
          <AvatarFallback className="bg-white/20 text-current font-semibold">{initial}</AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm truncate leading-tight">{chat.other_name}</p>
          <p className="text-[11px] opacity-90 flex items-center gap-1">
            {otherTyping ? "typing…" : (
              <>
                <MapPin className="h-3 w-3" /> Direct chat
              </>
            )}
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-current hover:bg-white/10">
              <MoreVertical className="h-5 w-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onArchive}>
              <Archive className="h-4 w-4 mr-2" />
              {chat.archived ? "Unarchive chat" : "Archive chat"}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
              <Trash2 className="h-4 w-4 mr-2" /> Delete chat
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Messages */}
      <ScrollArea
        className="flex-1"
        style={{
          backgroundColor: "hsl(var(--wa-chat-bg))",
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80' viewBox='0 0 80 80'%3E%3Cg fill='%23000000' fill-opacity='0.025'%3E%3Cpath d='M14 16h12v2H14zM44 30h10v2H44zM20 48h14v2H20zM52 60h12v2H52zM8 64h8v2H8z'/%3E%3Ccircle cx='62' cy='14' r='3'/%3E%3Ccircle cx='30' cy='40' r='3'/%3E%3C/g%3E%3C/svg%3E\")",
        }}
      >
        <div className="py-4 px-3">
          {messages.length === 0 && (
            <p className="text-center text-xs text-muted-foreground py-10">
              No messages yet. Say hello 👋
            </p>
          )}
          {Object.entries(grouped).map(([date, msgs]) => (
            <div key={date}>
              <div className="flex justify-center my-3">
                <span
                  className="px-3 py-1 rounded-lg text-xs font-medium shadow-sm"
                  style={{ backgroundColor: "hsl(var(--wa-panel))", color: "hsl(var(--wa-secondary-text))" }}
                >
                  {date === new Date().toLocaleDateString() ? "Today" : date}
                </span>
              </div>
              {msgs.map((m) => {
                const mine = m.sender_id === user?.id;
                return (
                  <div key={m.id} className={`flex mb-1.5 ${mine ? "justify-end" : "justify-start"}`}>
                    <div
                      className="max-w-[75%] rounded-lg px-2.5 py-1.5 shadow-sm"
                      style={{
                        backgroundColor: mine ? "hsl(var(--wa-bubble-out))" : "hsl(var(--wa-bubble-in))",
                        color: "hsl(var(--wa-bubble-foreground))",
                      }}
                    >
                      <p className="text-sm whitespace-pre-wrap break-words">{m.body}</p>
                      <span className="flex items-center gap-1 justify-end text-[10px] mt-0.5" style={{ color: "hsl(var(--wa-secondary-text))" }}>
                        {new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        {mine && <Tick m={m} />}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
          {otherTyping && (
            <div className="flex justify-start">
              <div className="rounded-lg px-3 py-2 shadow-sm" style={{ backgroundColor: "hsl(var(--wa-bubble-in))" }}>
                <span className="flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:-0.2s]" />
                  <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:-0.1s]" />
                  <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-bounce" />
                </span>
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>
      </ScrollArea>

      {/* Input */}
      <div className="p-2 flex items-center gap-2 flex-shrink-0" style={{ backgroundColor: "hsl(var(--wa-panel))" }}>
        <Input
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            notifyTyping();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder="Type a message"
          className="flex-1 rounded-full bg-background border-0"
        />
        <Button
          size="icon"
          className="rounded-full h-10 w-10 flex-shrink-0"
          style={{ backgroundColor: "hsl(var(--wa-accent))" }}
          onClick={handleSend}
          disabled={sending || !draft.trim()}
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

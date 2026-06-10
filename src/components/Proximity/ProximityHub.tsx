import React, { useEffect, useRef, useState } from "react";
import { useProximity } from "@/hooks/useProximity";
import { useAuth } from "@/hooks/useAuth";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Users,
  MapPin,
  MessageCircle,
  Send,
  X,
  Radar,
  Sparkles,
  Check,
  CheckCheck,
} from "lucide-react";

const TickMark: React.FC<{ message: { delivered_at: string | null; read_at: string | null } }> = ({ message }) => {
  if (message.read_at) {
    return <CheckCheck className="h-3.5 w-3.5 text-sky-400" aria-label="Read" />;
  }
  if (message.delivered_at) {
    return <CheckCheck className="h-3.5 w-3.5 text-primary-foreground/70" aria-label="Delivered" />;
  }
  return <Check className="h-3.5 w-3.5 text-primary-foreground/70" aria-label="Sent" />;
};

const fmtDistance = (km: number) =>
  km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;

const ChatDialog: React.FC = () => {
  const { activeChat, messages, otherTyping, notifyTyping, sendMessage, endChat, closeChatWindow } =
    useProximity();
  const { user } = useAuth();
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, otherTyping]);

  if (!activeChat) return null;

  const handleSend = async () => {
    const text = draft;
    setDraft("");
    await sendMessage(text);
  };

  return (
    <Dialog open={!!activeChat} onOpenChange={(o) => !o && closeChatWindow()}>
      <DialogContent className="max-w-md p-0 overflow-hidden gap-0">
        <DialogHeader className="p-4 bg-gradient-to-r from-primary to-primary/70 text-primary-foreground">
          <DialogTitle className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-foreground/20 font-semibold">
              {activeChat.otherName.charAt(0).toUpperCase()}
            </span>
            <div className="flex flex-col items-start">
              <span className="text-sm font-semibold leading-tight">
                {activeChat.otherName}
              </span>
              {activeChat.distanceKm != null && (
                <span className="text-[11px] font-normal opacity-90 flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {fmtDistance(activeChat.distanceKm)} away
                </span>
              )}
            </div>
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="h-72 px-4 py-3 bg-muted/30">
          <div className="flex flex-col gap-2">
            {messages.length === 0 && (
              <p className="text-center text-xs text-muted-foreground py-8">
                Say hello to start the conversation 👋
              </p>
            )}
            {messages.map((m) => {
              const mine = m.sender_id === user?.id;
              return (
                <div
                  key={m.id}
                  className={`flex ${mine ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm shadow-sm ${
                      mine
                        ? "bg-primary text-primary-foreground rounded-br-sm"
                        : "bg-card text-card-foreground border rounded-bl-sm"
                    }`}
                  >
                    <p className="whitespace-pre-wrap break-words">{m.body}</p>
                    <span
                      className={`flex items-center gap-1 text-[10px] mt-1 ${
                        mine ? "text-primary-foreground/70 justify-end" : "text-muted-foreground"
                      }`}
                    >
                      {new Date(m.created_at).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                      {mine && <TickMark message={m} />}
                    </span>
                  </div>
                </div>
              );
            })}
            {otherTyping && (
              <div className="flex justify-start">
                <div className="bg-card text-card-foreground border rounded-2xl rounded-bl-sm px-3 py-2 shadow-sm">
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

        {activeChat.ended ? (
          <div className="p-4 border-t bg-background text-center">
            <p className="text-sm text-muted-foreground">This chat has ended.</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={closeChatWindow}
            >
              Close
            </Button>
          </div>
        ) : (
          <div className="p-3 border-t bg-background flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <Input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="Type a message…"
                className="flex-1"
              />
              <Button size="icon" onClick={handleSend} disabled={!draft.trim()}>
                <Send className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex justify-between">
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={endChat}
              >
                <X className="h-3.5 w-3.5 mr-1" /> End chat
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

const NearbyPanel: React.FC = () => {
  const { nearby, openChat, enabled, setEnabled } = useProximity();
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          aria-label="Nearby users"
          className="fixed bottom-20 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary/70 text-primary-foreground shadow-lg shadow-primary/30 transition-transform hover:scale-105 active:scale-95 md:bottom-6"
        >
          <Radar className="h-6 w-6" />
          {enabled && nearby.length > 0 && (
            <Badge className="absolute -top-1 -right-1 h-5 min-w-5 justify-center rounded-full bg-destructive px-1 text-[11px]">
              {nearby.length}
            </Badge>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        side="top"
        className="w-80 p-0 overflow-hidden"
      >
        <div className="bg-gradient-to-r from-primary to-primary/70 p-4 text-primary-foreground">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            <h3 className="font-semibold text-sm">People Nearby</h3>
            <Sparkles className="h-4 w-4 ml-auto opacity-80" />
          </div>
          <p className="text-[11px] opacity-90 mt-1">
            Field workers within 10 km of you
          </p>
        </div>

        <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/40">
          <div>
            <p className="text-sm font-medium">Proximity discovery</p>
            <p className="text-[11px] text-muted-foreground">
              {enabled ? "You are visible to peers" : "You are hidden"}
            </p>
          </div>
          <Switch checked={enabled} onCheckedChange={setEnabled} />
        </div>

        <ScrollArea className="max-h-72">
          {!enabled ? (
            <p className="text-center text-xs text-muted-foreground py-8 px-4">
              Turn on proximity discovery to see who is nearby and start chatting.
            </p>
          ) : nearby.length === 0 ? (
            <p className="text-center text-xs text-muted-foreground py-8 px-4">
              No one within 10 km right now. We'll let you know when someone
              appears.
            </p>
          ) : (
            <div className="divide-y">
              {nearby.map((u) => (
                <div
                  key={u.user_id}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-accent to-accent/60 text-accent-foreground text-sm font-semibold">
                    {u.name.charAt(0).toUpperCase()}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{u.name}</p>
                    <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {fmtDistance(u.distanceKm)} away
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setOpen(false);
                      openChat({
                        user_id: u.user_id,
                        name: u.name,
                        distanceKm: u.distanceKm,
                      });
                    }}
                  >
                    <MessageCircle className="h-3.5 w-3.5 mr-1" /> Chat
                  </Button>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
};

const ProximityHub: React.FC = () => {
  const { user } = useAuth();
  if (!user) return null;
  return (
    <>
      <NearbyPanel />
      <ChatDialog />
    </>
  );
};

export default ProximityHub;

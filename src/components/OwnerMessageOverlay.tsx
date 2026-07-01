/**
 * OwnerMessageOverlay — centered, beautiful incoming-message experience.
 *
 * Mounted globally (in the Header) for EVERY signed-in user. Whenever the Owner
 * or a Co-owner sends a direct (1:1) message, the recipient instantly sees a
 * polished modal card at the center of their screen — regardless of whether
 * they were "active now" when the message was sent. This mirrors the intent of
 * the Active-now roster: a message from leadership should never be missed.
 *
 * Regular peer-to-peer messages keep the lightweight toast (handled in
 * useDirectUnread) so this centered treatment stays reserved for leadership.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Crown, MessageCircleHeart, Reply, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { parseSpecial } from "@/components/ProjectChat/specialMessages";

interface IncomingOwnerMessage {
  id: string;
  senderId: string;
  senderName: string;
  senderAvatar: string | null;
  isOwner: boolean;
  body: string;
  messageType: string;
  createdAt: string;
}

interface SenderMeta {
  name: string;
  avatar: string | null;
  ownerLevel: boolean;
}

const OWNER_EMAIL = "amehjoey1@gmail.com";

function previewFor(body: string, messageType: string): string {
  if (messageType && messageType !== "text") {
    try {
      const special = parseSpecial(messageType, body);
      if (special?.kind === "poll") return "📊 Sent you a poll";
      if (special?.kind === "location") return "📍 Shared a location";
      if (special?.kind === "event") return "📅 Shared an event";
    } catch {
      /* fall through */
    }
    return `Sent a ${messageType}`;
  }
  return body || "";
}

export default function OwnerMessageOverlay() {
  const { user } = useAuth();
  const [queue, setQueue] = useState<IncomingOwnerMessage[]>([]);
  const metaCache = useRef<Record<string, SenderMeta>>({});

  const resolveSender = useCallback(async (senderId: string): Promise<SenderMeta> => {
    if (metaCache.current[senderId]) return metaCache.current[senderId];
    const { data } = await supabase
      .from("profiles")
      .select("first_name, last_name, email, avatar_url, is_owner, is_co_owner")
      .eq("user_id", senderId)
      .maybeSingle();
    const name =
      [data?.first_name, data?.last_name].filter(Boolean).join(" ").trim() ||
      data?.email ||
      "The Owner";
    const ownerLevel =
      !!data?.is_owner || !!data?.is_co_owner || data?.email === OWNER_EMAIL;
    const meta: SenderMeta = { name, avatar: data?.avatar_url ?? null, ownerLevel };
    metaCache.current[senderId] = meta;
    return meta;
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`owner-message-overlay-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "proximity_messages",
          filter: `recipient_id=eq.${user.id}`,
        },
        async (payload) => {
          const msg = payload.new as {
            id: string;
            sender_id: string;
            body: string;
            message_type?: string;
            created_at: string;
          };
          if (msg.sender_id === user.id) return;
          const meta = await resolveSender(msg.sender_id);
          // Reserve the centered treatment for leadership messages.
          if (!meta.ownerLevel) return;
          // Acknowledge delivery so the sender sees the ticks advance.
          supabase
            .from("proximity_messages")
            .update({ delivered_at: new Date().toISOString() })
            .eq("id", msg.id);
          setQueue((prev) =>
            prev.some((m) => m.id === msg.id)
              ? prev
              : [
                  ...prev,
                  {
                    id: msg.id,
                    senderId: msg.sender_id,
                    senderName: meta.name,
                    senderAvatar: meta.avatar,
                    isOwner: meta.ownerLevel,
                    body: msg.body,
                    messageType: msg.message_type || "text",
                    createdAt: msg.created_at,
                  },
                ],
          );
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, resolveSender]);

  const current = queue[0];
  if (!current) return null;

  const dismiss = () => setQueue((prev) => prev.slice(1));

  const markReadOnServer = () => {
    const nowIso = new Date().toISOString();
    supabase
      .from("proximity_messages")
      .update({ delivered_at: nowIso, read_at: nowIso })
      .eq("id", current.id);
  };

  const reply = () => {
    markReadOnServer();
    window.dispatchEvent(
      new CustomEvent("amehnities:open-direct-chat", {
        detail: { userId: current.senderId, userName: current.senderName },
      }),
    );
    dismiss();
  };

  const initial = (current.senderName || "O").charAt(0).toUpperCase();
  const preview = previewFor(current.body, current.messageType);

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-background/70 p-4 backdrop-blur-sm animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-label={`New message from ${current.senderName}`}
    >
      <div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-border bg-card shadow-2xl animate-in zoom-in-95 slide-in-from-bottom-2 duration-300">
        {/* Header band */}
        <div
          className="relative px-6 pt-7 pb-16 text-white"
          style={{
            background:
              "linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(var(--chart-accent)) 100%)",
          }}
        >
          <button
            type="button"
            onClick={() => {
              markReadOnServer();
              dismiss();
            }}
            aria-label="Dismiss message"
            className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-white/15 text-white transition-colors hover:bg-white/25"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-white/90">
            <MessageCircleHeart className="h-4 w-4" />
            New message
          </div>
          <p className="mt-1 text-sm text-white/80">
            {current.isOwner ? "From your project leadership" : "You have a new message"}
          </p>
        </div>

        {/* Avatar overlapping the band */}
        <div className="-mt-12 flex flex-col items-center px-6">
          <div className="relative">
            <Avatar className="h-24 w-24 ring-4 ring-card shadow-lg">
              {current.senderAvatar ? (
                <AvatarImage src={current.senderAvatar} alt={current.senderName} className="object-cover" />
              ) : null}
              <AvatarFallback className="bg-primary/10 text-3xl font-bold text-primary">
                {initial}
              </AvatarFallback>
            </Avatar>
            {current.isOwner && (
              <span className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full bg-amber-400 text-amber-950 ring-2 ring-card shadow">
                <Crown className="h-4 w-4" />
              </span>
            )}
          </div>
          <h2 className="mt-3 text-lg font-bold text-foreground">{current.senderName}</h2>
          {current.isOwner && (
            <span className="mt-1 rounded-full bg-amber-100 px-3 py-0.5 text-xs font-semibold text-amber-700 dark:bg-amber-950 dark:text-amber-300">
              Owner
            </span>
          )}
        </div>

        {/* Message body */}
        <div className="px-6 py-5">
          <div className="max-h-56 overflow-y-auto rounded-2xl bg-muted/60 px-4 py-3">
            <p className="whitespace-pre-wrap break-words text-center text-base leading-relaxed text-foreground">
              {preview || "…"}
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 border-t border-border px-6 py-4">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => {
              markReadOnServer();
              dismiss();
            }}
          >
            Dismiss
          </Button>
          <Button className="flex-1 gap-2" onClick={reply}>
            <Reply className="h-4 w-4" />
            Reply
          </Button>
        </div>

        {queue.length > 1 && (
          <div className="pb-4 text-center text-xs font-medium text-muted-foreground">
            +{queue.length - 1} more message{queue.length - 1 === 1 ? "" : "s"}
          </div>
        )}
      </div>
    </div>
  );
}

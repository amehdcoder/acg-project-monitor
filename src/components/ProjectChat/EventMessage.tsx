import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { Calendar, MapPin, Clock, Check, X, HelpCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import type { EventPayload } from "./specialMessages";

interface Rsvp {
  user_id: string;
  status: string;
}

interface EventMessageProps {
  messageId: string;
  event: EventPayload;
  currentUserId?: string;
  nameFor: (uid: string) => string;
}

const RSVP_OPTIONS: { value: string; label: string; icon: typeof Check }[] = [
  { value: "going", label: "Going", icon: Check },
  { value: "maybe", label: "Maybe", icon: HelpCircle },
  { value: "no", label: "Can't go", icon: X },
];

export function EventMessage({
  messageId,
  event,
  currentUserId,
  nameFor,
}: EventMessageProps) {
  const [rsvps, setRsvps] = useState<Rsvp[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("chat_event_rsvps")
      .select("user_id, status")
      .eq("message_id", messageId);
    setRsvps((data as Rsvp[]) || []);
  }, [messageId]);

  useEffect(() => {
    load();
    const channel = supabase
      .channel(`event-${messageId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "chat_event_rsvps",
          filter: `message_id=eq.${messageId}`,
        },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [messageId, load]);

  const myStatus = currentUserId
    ? rsvps.find((r) => r.user_id === currentUserId)?.status
    : undefined;

  const setRsvp = async (status: string) => {
    if (!currentUserId || busy) return;
    setBusy(true);
    try {
      if (myStatus === status) {
        await supabase
          .from("chat_event_rsvps")
          .delete()
          .eq("message_id", messageId)
          .eq("user_id", currentUserId);
      } else {
        await supabase
          .from("chat_event_rsvps")
          .upsert(
            { message_id: messageId, user_id: currentUserId, status },
            { onConflict: "message_id,user_id" },
          );
      }
      await load();
    } finally {
      setBusy(false);
    }
  };

  const goingCount = rsvps.filter((r) => r.status === "going").length;
  const start = new Date(event.startsAt);

  return (
    <div className="w-[250px] sm:w-[280px]">
      <div className="flex items-center gap-2">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[hsl(var(--wa-accent))]/15">
          <Calendar className="h-5 w-5 text-[hsl(var(--wa-accent))]" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold leading-snug break-words">
            {event.name}
          </p>
          <p className="text-[11px] opacity-60">Event</p>
        </div>
      </div>

      {event.description && (
        <p className="mt-2 text-sm break-words opacity-90">{event.description}</p>
      )}

      <div className="mt-2 space-y-1 text-xs opacity-80">
        <div className="flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5 shrink-0" />
          <span>
            {format(start, "EEE, d MMM yyyy 'at' HH:mm")}
            {event.endsAt
              ? ` – ${format(new Date(event.endsAt), "HH:mm")}`
              : ""}
          </span>
        </div>
        {event.location && (
          <div className="flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5 shrink-0" />
            <span className="break-words">{event.location}</span>
          </div>
        )}
        {event.reminder && (
          <div className="flex items-center gap-1.5">
            <span className="opacity-70">Reminder: {event.reminder}</span>
          </div>
        )}
      </div>

      <div className="mt-3 grid grid-cols-3 gap-1.5">
        {RSVP_OPTIONS.map((opt) => {
          const Icon = opt.icon;
          const active = myStatus === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              disabled={busy}
              onClick={() => setRsvp(opt.value)}
              className={cn(
                "flex flex-col items-center gap-0.5 rounded-lg border py-1.5 text-[11px] font-medium transition-colors",
                active
                  ? "border-[hsl(var(--wa-accent))] bg-[hsl(var(--wa-accent))] text-white"
                  : "border-black/10 hover:bg-black/5",
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {opt.label}
            </button>
          );
        })}
      </div>

      {goingCount > 0 && (
        <p className="mt-2 text-[11px] opacity-70">
          {goingCount} going
          {rsvps.filter((r) => r.status === "going").length <= 4 && (
            <>
              {": "}
              {rsvps
                .filter((r) => r.status === "going")
                .map((r) => nameFor(r.user_id))
                .join(", ")}
            </>
          )}
        </p>
      )}
    </div>
  );
}

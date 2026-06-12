import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { MapPin, Check, X, HelpCircle, CalendarDays } from "lucide-react";
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
  /** Event-RSVP table to use. Defaults to group-chat RSVPs. */
  rsvpsTable?: string;
}

const RSVP_OPTIONS: { value: string; label: string; icon: typeof Check }[] = [
  { value: "going", label: "Going", icon: Check },
  { value: "maybe", label: "Maybe", icon: HelpCircle },
  { value: "no", label: "Can't go", icon: X },
];

/** Tuku-Tiket inspired event card (purple accent, badge, progress, stats). */
export function EventMessage({
  messageId,
  event,
  currentUserId,
  nameFor,
  rsvpsTable = "chat_event_rsvps",
}: EventMessageProps) {
  const [rsvps, setRsvps] = useState<Rsvp[]>([]);
  const [busy, setBusy] = useState(false);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const load = useCallback(async () => {
    const { data } = await db
      .from(rsvpsTable)
      .select("user_id, status")
      .eq("message_id", messageId);
    setRsvps((data as Rsvp[]) || []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messageId, rsvpsTable]);

  useEffect(() => {
    load();
    const channel = supabase
      .channel(`event-${rsvpsTable}-${messageId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: rsvpsTable,
          filter: `message_id=eq.${messageId}`,
        },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [messageId, load, rsvpsTable]);

  const myStatus = currentUserId
    ? rsvps.find((r) => r.user_id === currentUserId)?.status
    : undefined;

  const setRsvp = async (status: string) => {
    if (!currentUserId || busy) return;
    setBusy(true);
    try {
      if (myStatus === status) {
        await db
          .from(rsvpsTable)
          .delete()
          .eq("message_id", messageId)
          .eq("user_id", currentUserId);
      } else {
        await db
          .from(rsvpsTable)
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
  const maybeCount = rsvps.filter((r) => r.status === "maybe").length;
  const totalResponses = rsvps.length;
  const goingPct =
    totalResponses > 0 ? Math.round((goingCount / totalResponses) * 100) : 0;
  const start = new Date(event.startsAt);

  return (
    <div className="w-[260px] sm:w-[290px] overflow-hidden rounded-2xl border border-black/5 bg-white text-[#1a1a2e] shadow-sm">
      {/* Banner header */}
      <div className="relative flex h-24 items-end bg-gradient-to-br from-[#6c5ce7] via-[#7d6cf0] to-[#a29bfe] p-3">
        <span className="absolute right-2.5 top-2.5 rounded-md bg-[#b6f5c1] px-2 py-0.5 text-[10px] font-bold text-[#1c7a36]">
          Event
        </span>
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/20 backdrop-blur-sm">
          <CalendarDays className="h-7 w-7 text-white" strokeWidth={2.2} />
        </div>
      </div>

      <div className="p-3">
        <p className="text-[11px] font-semibold text-[#6c5ce7]">
          {format(start, "MMMM d, yyyy")}
          {event.endsAt ? ` · ${format(start, "HH:mm")}–${format(new Date(event.endsAt), "HH:mm")}` : ` · ${format(start, "HH:mm")}`}
        </p>
        <h4 className="mt-0.5 text-[15px] font-extrabold leading-snug break-words">
          {event.name}
        </h4>

        {event.location && (
          <div className="mt-1.5 flex items-center gap-1.5 text-[12px] text-[#6b7280]">
            <MapPin className="h-3.5 w-3.5 shrink-0" />
            <span className="break-words">{event.location}</span>
          </div>
        )}

        {event.description && (
          <p className="mt-1.5 text-[12px] leading-snug text-[#4b5563] break-words">
            {event.description}
          </p>
        )}

        {/* Progress bar */}
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-[#ede9fe]">
          <div
            className="h-full rounded-full bg-gradient-to-r from-[#6c5ce7] to-[#a29bfe] transition-all"
            style={{ width: `${goingPct}%` }}
          />
        </div>

        {/* Stats row */}
        <div className="mt-2 flex items-center justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-wide text-[#9ca3af]">
              Going
            </p>
            <p className="text-[15px] font-bold leading-none">{goingCount}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-wide text-[#9ca3af]">
              Maybe
            </p>
            <p className="text-[15px] font-bold leading-none">{maybeCount}</p>
          </div>
        </div>

        {/* RSVP buttons */}
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
                  "flex flex-col items-center gap-0.5 rounded-lg border py-1.5 text-[11px] font-semibold transition-colors",
                  active
                    ? "border-transparent bg-[#6c5ce7] text-white"
                    : "border-black/10 text-[#4b5563] hover:bg-black/5",
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {opt.label}
              </button>
            );
          })}
        </div>

        {goingCount > 0 && goingCount <= 4 && (
          <p className="mt-2 text-[11px] text-[#6b7280]">
            {rsvps
              .filter((r) => r.status === "going")
              .map((r) => nameFor(r.user_id))
              .join(", ")}{" "}
            going
          </p>
        )}
      </div>
    </div>
  );
}

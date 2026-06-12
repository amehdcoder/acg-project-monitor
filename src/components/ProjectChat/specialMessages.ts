// Structured chat message payloads (Poll, Location, Event) stored as JSON in
// chat_messages.content with the matching message_type. Mirrors WhatsApp.

export interface PollPayload {
  kind: "poll";
  question: string;
  options: string[];
  allowMultiple: boolean;
}

export interface LocationPayload {
  kind: "location";
  lat: number;
  lng: number;
  label?: string;
  address?: string;
  accuracy?: number; // horizontal accuracy in metres
}

export interface EventPayload {
  kind: "event";
  name: string;
  description?: string;
  startsAt: string; // ISO
  endsAt?: string | null; // ISO
  location?: string;
  reminder?: string; // e.g. "1 hour before"
  allowGuests?: boolean;
}

export type SpecialPayload = PollPayload | LocationPayload | EventPayload;

export function parseSpecial(
  type: string,
  content: string,
): SpecialPayload | null {
  if (type !== "poll" && type !== "location" && type !== "event") return null;
  try {
    const data = JSON.parse(content);
    if (data && typeof data === "object" && data.kind === type) {
      return data as SpecialPayload;
    }
  } catch {
    /* not valid JSON */
  }
  return null;
}

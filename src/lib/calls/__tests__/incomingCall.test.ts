import { describe, it, expect } from "vitest";
import {
  CALL_OVERLAY_Z_INDEX,
  shouldRingForCall,
  enqueueIncoming,
  dequeueIncoming,
  normalizeCallType,
  type IncomingCallItem,
  type RawCallRow,
} from "../incomingCall";

const ME = "user-me";
const OTHER = "user-other";

function ctx(overrides: Partial<Parameters<typeof shouldRingForCall>[1]> = {}) {
  return {
    currentUserId: ME,
    prompted: new Set<string>(),
    dismissed: new Set<string>(),
    now: 1_000_000,
    ...overrides,
  };
}

function call(overrides: Partial<RawCallRow> = {}): RawCallRow {
  return {
    id: "call-1",
    chat_group_id: "group-1",
    started_by: OTHER,
    call_type: "video",
    started_at: new Date(1_000_000).toISOString(),
    is_active: true,
    ...overrides,
  };
}

function item(id: string): IncomingCallItem {
  return {
    id,
    chatGroupId: "g",
    callType: "voice",
    callerName: "A",
    callerAvatar: null,
    groupName: "G",
  };
}

describe("incoming call overlay decision", () => {
  it("rings for a fresh incoming call from another user", () => {
    expect(shouldRingForCall(call(), ctx())).toBe(true);
  });

  it("never rings for the user's own call", () => {
    expect(shouldRingForCall(call({ started_by: ME }), ctx())).toBe(false);
  });

  it("does not ring for ended calls", () => {
    expect(shouldRingForCall(call({ is_active: false }), ctx())).toBe(false);
  });

  it("does not ring twice (already prompted)", () => {
    expect(
      shouldRingForCall(call(), ctx({ prompted: new Set(["call-1"]) })),
    ).toBe(false);
  });

  it("does not ring for a declined call", () => {
    expect(
      shouldRingForCall(call(), ctx({ dismissed: new Set(["call-1"]) })),
    ).toBe(false);
  });

  it("ignores stale calls beyond the max age window", () => {
    const stale = call({ started_at: new Date(0).toISOString() });
    expect(shouldRingForCall(stale, ctx({ now: CALL_OVERLAY_Z_INDEX }))).toBe(false);
    expect(
      shouldRingForCall(stale, ctx({ now: 20 * 60 * 1000 })),
    ).toBe(false);
  });

  it("requires a current user and a call id", () => {
    expect(shouldRingForCall(call(), ctx({ currentUserId: null }))).toBe(false);
    expect(shouldRingForCall(call({ id: null }), ctx())).toBe(false);
    expect(shouldRingForCall(null, ctx())).toBe(false);
  });
});

describe("overlay stacking", () => {
  it("uses a z-index above dialogs, nav and toasts so it covers any route", () => {
    // Tailwind z-50 (dialogs/toasts) === 50; nav bars use small z-indices.
    expect(CALL_OVERLAY_Z_INDEX).toBeGreaterThan(50);
    expect(CALL_OVERLAY_Z_INDEX).toBeGreaterThan(9999);
  });
});

describe("accept / reject queue transitions", () => {
  it("enqueues without duplicates", () => {
    let q: IncomingCallItem[] = [];
    q = enqueueIncoming(q, item("a"));
    q = enqueueIncoming(q, item("a"));
    q = enqueueIncoming(q, item("b"));
    expect(q.map((c) => c.id)).toEqual(["a", "b"]);
  });

  it("accepting removes the answered call and preserves the rest", () => {
    let q = [item("a"), item("b")];
    q = dequeueIncoming(q, "a");
    expect(q.map((c) => c.id)).toEqual(["b"]);
  });

  it("rejecting removes the declined call", () => {
    let q = [item("a"), item("b")];
    q = dequeueIncoming(q, "b");
    expect(q.map((c) => c.id)).toEqual(["a"]);
  });

  it("a rejected call stays out even if the same row is re-observed", () => {
    const dismissed = new Set<string>();
    // user declines call-1
    dismissed.add("call-1");
    // realtime/polling re-delivers the same still-active row
    expect(shouldRingForCall(call(), ctx({ dismissed }))).toBe(false);
  });
});

describe("normalizeCallType", () => {
  it("maps video and everything else", () => {
    expect(normalizeCallType("video")).toBe("video");
    expect(normalizeCallType("voice")).toBe("voice");
    expect(normalizeCallType(undefined)).toBe("voice");
    expect(normalizeCallType("weird")).toBe("voice");
  });
});

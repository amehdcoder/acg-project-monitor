import { describe, it, expect } from "vitest";
import {
  deriveCallOutcome,
  callDurationSeconds,
  formatCallDuration,
  formatRelativeTime,
  sortCallsNewestFirst,
  type CallHistoryRow,
} from "../callHistory";

const ME = "me";
const OTHER = "other";
const NOW = 10_000_000;

function row(overrides: Partial<CallHistoryRow> = {}): CallHistoryRow {
  return {
    id: "c1",
    chat_group_id: "g1",
    started_by: OTHER,
    call_type: "voice",
    started_at: new Date(NOW - 60_000).toISOString(),
    ended_at: null,
    is_active: true,
    ...overrides,
  };
}

describe("deriveCallOutcome", () => {
  it("marks a live call from another user as missed and rejoinable", () => {
    const o = deriveCallOutcome(row(), ME, NOW);
    expect(o.tone).toBe("missed");
    expect(o.canRejoin).toBe(true);
  });

  it("marks a live call I started as ongoing", () => {
    const o = deriveCallOutcome(row({ started_by: ME }), ME, NOW);
    expect(o.tone).toBe("ongoing");
    expect(o.canRejoin).toBe(true);
  });

  it("marks an ended call as completed and not rejoinable", () => {
    const o = deriveCallOutcome(
      row({ is_active: false, ended_at: new Date(NOW).toISOString() }),
      ME,
      NOW,
    );
    expect(o.tone).toBe("completed");
    expect(o.canRejoin).toBe(false);
  });

  it("treats a stale active row as ended", () => {
    const o = deriveCallOutcome(
      row({ started_at: new Date(NOW - 60 * 60_000).toISOString() }),
      ME,
      NOW,
    );
    expect(o.tone).toBe("completed");
    expect(o.canRejoin).toBe(false);
  });
});

describe("callDurationSeconds", () => {
  it("computes duration for ended calls", () => {
    const r = row({
      is_active: false,
      started_at: new Date(NOW - 125_000).toISOString(),
      ended_at: new Date(NOW).toISOString(),
    });
    expect(callDurationSeconds(r, NOW)).toBe(125);
  });

  it("uses now for still-active calls", () => {
    const r = row({ started_at: new Date(NOW - 30_000).toISOString() });
    expect(callDurationSeconds(r, NOW)).toBe(30);
  });

  it("never returns negative", () => {
    const r = row({
      is_active: false,
      started_at: new Date(NOW).toISOString(),
      ended_at: new Date(NOW - 5000).toISOString(),
    });
    expect(callDurationSeconds(r, NOW)).toBe(0);
  });
});

describe("formatCallDuration", () => {
  it("formats seconds, minutes and hours", () => {
    expect(formatCallDuration(0)).toBe("0s");
    expect(formatCallDuration(45)).toBe("45s");
    expect(formatCallDuration(200)).toBe("3m 20s");
    expect(formatCallDuration(3900)).toBe("1h 5m");
  });
});

describe("formatRelativeTime", () => {
  it("formats recent times", () => {
    expect(formatRelativeTime(new Date(NOW).toISOString(), NOW)).toBe("just now");
    expect(formatRelativeTime(new Date(NOW - 5 * 60_000).toISOString(), NOW)).toBe("5m ago");
    expect(formatRelativeTime(new Date(NOW - 3 * 3_600_000).toISOString(), NOW)).toBe("3h ago");
    expect(formatRelativeTime(new Date(NOW - 2 * 86_400_000).toISOString(), NOW)).toBe("2d ago");
  });
});

describe("sortCallsNewestFirst", () => {
  it("sorts by started_at descending", () => {
    const a = row({ id: "a", started_at: new Date(NOW - 1000).toISOString() });
    const b = row({ id: "b", started_at: new Date(NOW - 5000).toISOString() });
    const c = row({ id: "c", started_at: new Date(NOW).toISOString() });
    expect(sortCallsNewestFirst([a, b, c]).map((r) => r.id)).toEqual(["c", "a", "b"]);
  });
});

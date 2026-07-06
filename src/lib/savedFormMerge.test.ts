import { describe, it, expect } from "vitest";
import {
  mergeSavedEntries,
  detectConflict,
  dominantEntry,
} from "@/lib/savedFormMerge";
import type { SavedFormEntry } from "@/lib/savedForms";

const base = (over: Partial<SavedFormEntry> = {}): SavedFormEntry => ({
  id: "rec-1",
  userId: "u1",
  formId: "f1",
  formName: "HH Survey",
  formDescription: "",
  projectId: "p1",
  questions: [],
  groups: [],
  geofence: null,
  settings: {},
  responses: {},
  gps: null,
  status: "draft",
  createdAt: "2026-07-06T10:00:00.000Z",
  updatedAt: "2026-07-06T10:00:00.000Z",
  deviceId: "devA",
  rev: 1,
  ...over,
});

describe("savedFormMerge — conflict detection", () => {
  it("reports no conflict for identical copies", () => {
    expect(detectConflict(base(), base())).toBe(false);
  });

  it("detects divergent responses on different devices", () => {
    const a = base({ deviceId: "devA", responses: { q1: "yes" } });
    const b = base({ deviceId: "devB", responses: { q1: "no" } });
    expect(detectConflict(a, b)).toBe(true);
  });

  it("treats same-device revision bumps as fast-forward, not conflict", () => {
    const a = base({ deviceId: "devA", rev: 1, responses: { q1: "yes" } });
    const b = base({ deviceId: "devA", rev: 2, responses: { q1: "yes", q2: "x" } });
    expect(detectConflict(a, b)).toBe(false);
  });
});

describe("savedFormMerge — deterministic merge", () => {
  it("is commutative: merge(a,b) === merge(b,a)", () => {
    const a = base({ deviceId: "devA", updatedAt: "2026-07-06T11:00:00.000Z", responses: { q1: "a", q2: "keepA" } });
    const b = base({ deviceId: "devB", updatedAt: "2026-07-06T10:30:00.000Z", responses: { q1: "b", q3: "keepB" } });
    const ab = mergeSavedEntries(a, b).merged;
    const ba = mergeSavedEntries(b, a).merged;
    expect(JSON.stringify(ab)).toEqual(JSON.stringify(ba));
  });

  it("unions non-conflicting fields from both devices", () => {
    const a = base({ deviceId: "devA", responses: { q1: "a", q2: "onlyA" } });
    const b = base({ deviceId: "devB", responses: { q1: "a", q3: "onlyB" } });
    const { merged, report } = mergeSavedEntries(a, b);
    expect(merged.responses).toEqual({ q1: "a", q2: "onlyA", q3: "onlyB" });
    expect(report.hadConflict).toBe(false);
  });

  it("resolves conflicting fields by newer update, deterministically", () => {
    const a = base({ deviceId: "devA", updatedAt: "2026-07-06T12:00:00.000Z", responses: { q1: "newer" } });
    const b = base({ deviceId: "devB", updatedAt: "2026-07-06T10:00:00.000Z", responses: { q1: "older" } });
    const { merged, report } = mergeSavedEntries(a, b);
    expect(merged.responses.q1).toBe("newer");
    expect(report.hadConflict).toBe(true);
  });

  it("prefers a real answer over an empty one regardless of recency", () => {
    const a = base({ deviceId: "devA", updatedAt: "2026-07-06T12:00:00.000Z", responses: { q1: "" } });
    const b = base({ deviceId: "devB", updatedAt: "2026-07-06T10:00:00.000Z", responses: { q1: "real" } });
    expect(mergeSavedEntries(a, b).merged.responses.q1).toBe("real");
  });

  it("never demotes a finalized/sent record back to draft", () => {
    const draft = base({ deviceId: "devA", status: "draft", updatedAt: "2026-07-06T13:00:00.000Z" });
    const finalized = base({ deviceId: "devB", status: "finalized", updatedAt: "2026-07-06T10:00:00.000Z" });
    expect(mergeSavedEntries(draft, finalized).merged.status).toBe("finalized");
    expect(dominantEntry(draft, finalized).status).toBe("finalized");
  });

  it("converges: merging the merged result again is stable", () => {
    const a = base({ deviceId: "devA", updatedAt: "2026-07-06T11:00:00.000Z", responses: { q1: "a", q2: "x" } });
    const b = base({ deviceId: "devB", updatedAt: "2026-07-06T10:30:00.000Z", responses: { q1: "b", q3: "y" } });
    const once = mergeSavedEntries(a, b).merged;
    const twice = mergeSavedEntries(once, b).merged;
    expect(twice.responses).toEqual(once.responses);
    expect(twice.status).toBe(once.status);
  });

  it("bumps revision beyond both inputs so subsequent merges stay ordered", () => {
    const a = base({ deviceId: "devA", rev: 3, responses: { q1: "a" } });
    const b = base({ deviceId: "devB", rev: 5, responses: { q1: "b" } });
    expect(mergeSavedEntries(a, b).merged.rev).toBe(6);
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// A fake Supabase realtime channel that lets the test emit postgres_changes
// payloads exactly as the client would when a submission is saved/edited.
type Handler = (payload: unknown) => void;

const emitters: Record<string, Handler> = {};
const removed: unknown[] = [];

vi.mock("@/integrations/supabase/client", () => {
  const channelApi = {
    on: (_event: string, _cfg: unknown, handler: Handler) => {
      emitters.current = handler;
      return channelApi;
    },
    subscribe: () => channelApi,
  };
  return {
    supabase: {
      channel: () => channelApi,
      removeChannel: (c: unknown) => {
        removed.push(c);
      },
    },
  };
});

import { subscribeToFormSubmissionChanges } from "./dashboardSync";

describe("dashboardSync — linked dashboards react to saved submission changes", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    delete (emitters as Record<string, Handler>).current;
    removed.length = 0;
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("fires the reload callback when a submission is UPDATED (admin/owner edit)", () => {
    const onChange = vi.fn();
    subscribeToFormSubmissionChanges({ formId: "form-1", onChange, debounceMs: 800 });

    // Simulate an admin saving an edit to an existing submission.
    emitters.current({ eventType: "UPDATE", new: { form_id: "form-1" } });

    // Debounced: nothing yet.
    expect(onChange).not.toHaveBeenCalled();

    vi.advanceTimersByTime(800);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({ eventType: "UPDATE", formId: "form-1" });
  });

  it("coalesces a burst of changes into a single reload", () => {
    const onChange = vi.fn();
    subscribeToFormSubmissionChanges({ formId: "form-1", onChange, debounceMs: 500 });

    emitters.current({ eventType: "INSERT", new: { form_id: "form-1" } });
    emitters.current({ eventType: "UPDATE", new: { form_id: "form-1" } });
    emitters.current({ eventType: "UPDATE", new: { form_id: "form-1" } });

    vi.advanceTimersByTime(500);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("propagates DELETE events so dashboards drop removed submissions", () => {
    const onChange = vi.fn();
    subscribeToFormSubmissionChanges({ formId: null, onChange, debounceMs: 100 });

    emitters.current({ eventType: "DELETE", old: { form_id: "form-9" } });
    vi.advanceTimersByTime(100);

    expect(onChange).toHaveBeenCalledWith({ eventType: "DELETE", formId: "form-9" });
  });

  it("unsubscribes cleanly, cancelling pending reloads", () => {
    const onChange = vi.fn();
    const unsub = subscribeToFormSubmissionChanges({ formId: "form-1", onChange, debounceMs: 300 });

    emitters.current({ eventType: "UPDATE", new: { form_id: "form-1" } });
    unsub();
    vi.advanceTimersByTime(300);

    expect(onChange).not.toHaveBeenCalled();
    expect(removed.length).toBe(1);
  });
});

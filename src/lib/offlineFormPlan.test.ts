import { describe, expect, it } from "vitest";
import {
  normalizeOfflineForm,
  offlineFormContentChanged,
  planOfflineFormChanges,
} from "./offlineFormPlan";
import { offlineFormKey, ownedOfflineForm } from "./offlineFormAccess";

const form = (id = "form-1", name = "Household survey") => ({
  id,
  name,
  description: "Field form",
  status: "active",
  project_id: "project-1",
  created_at: "2026-11-01T00:00:00.000Z",
  updated_at: "2026-11-02T00:00:00.000Z",
  questions: [{ id: "q1", type: "text", label: "Community", required: true }],
  settings: { offlineEnabled: true },
  geofence: null,
});

const cached = (raw = form(), userId = "user-1") => ownedOfflineForm({
  ...normalizeOfflineForm(raw),
  downloaded_at: "2026-11-03T00:00:00.000Z",
}, userId);

describe("offline form incremental download plan", () => {
  it("downloads every authorized form on the first login", () => {
    const plan = planOfflineFormChanges([], [form("one"), form("two", "Follow-up")], "user-1", { now: "2026-11-26T00:00:00.000Z" });
    expect(plan.puts).toHaveLength(2);
    expect(plan.addedForms.map((f) => f.id)).toEqual(["one", "two"]);
    expect(plan.updatedForms).toHaveLength(0);
    expect(plan.unchangedForms).toHaveLength(0);
    expect(plan.puts[0].id).toBe(offlineFormKey("user-1", "one"));
  });

  it("does not rewrite an unchanged form", () => {
    const plan = planOfflineFormChanges([cached()], [form()], "user-1");
    expect(plan.puts).toHaveLength(0);
    expect(plan.unchangedForms.map((f) => f.id)).toEqual(["form-1"]);
    expect(offlineFormContentChanged(cached(), form())).toBe(false);
  });

  it("redownloads changed questions even if a legacy edit kept the same timestamp", () => {
    const changed = { ...form(), questions: [{ id: "q1", type: "integer", label: "Number of households", required: true }] };
    const plan = planOfflineFormChanges([cached()], [changed], "user-1");
    expect(plan.puts).toHaveLength(1);
    expect(plan.updatedForms.map((f) => f.id)).toEqual(["form-1"]);
    expect(plan.puts[0].questions[0].label).toBe("Number of households");
  });

  it("ignores submission-count metadata so new submissions do not redownload the definition", () => {
    const plan = planOfflineFormChanges([cached()], [{ ...form(), submissions_count: 99 }], "user-1");
    expect(plan.puts).toHaveLength(0);
    expect(plan.unchangedForms).toHaveLength(1);
  });

  it("does not alternate updates when the Forms page adds derived groups", () => {
    const fromFormsPage = { ...form(), groups: [{ id: "g1", title: "Derived", questions: [] }] };
    const first = planOfflineFormChanges([], [fromFormsPage], "user-1");
    const second = planOfflineFormChanges(first.puts, [form()], "user-1");
    expect(second.puts).toHaveLength(0);
    expect(second.unchangedForms).toHaveLength(1);
  });

  it("prunes only revoked forms belonging to the active account", () => {
    const revoked = cached(form("revoked", "Old form"));
    const otherAccount = cached(form("other", "Another account"), "user-2");
    const plan = planOfflineFormChanges([cached(), revoked, otherAccount], [form()], "user-1", { prune: true });
    expect(plan.removeKeys).toEqual([offlineFormKey("user-1", "revoked")]);
    expect(plan.removeKeys).not.toContain(offlineFormKey("user-2", "other"));
  });

  it("never prunes other projects when caching a partial visible list", () => {
    const otherProject = cached({ ...form("other-project"), project_id: "project-2" });
    const plan = planOfflineFormChanges([otherProject], [form()], "user-1");
    expect(plan.removeKeys).toHaveLength(0);
  });
});

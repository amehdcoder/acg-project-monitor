import { describe, expect, it } from "vitest";
import { buildFormDownloadItems, downloadableFormIds, getFormDownloadStatus } from "./offlineFormDownload";
import { normalizeOfflineForm } from "./offlineFormPlan";
import { ownedOfflineForm } from "./offlineFormAccess";

const form = (id: string, name: string, project_id = "project-1") => ({
  id,
  name,
  description: "Field collection",
  project_id,
  status: "active",
  questions: [{ id: "q1", type: "text", label: "Community" }],
  settings: {},
  geofence: null,
  created_at: "2026-11-01T00:00:00.000Z",
  updated_at: "2026-11-02T00:00:00.000Z",
});

const cached = (raw = form("form-1", "Household survey")) => ownedOfflineForm({
  ...normalizeOfflineForm(raw),
  downloaded_at: "2026-11-03T00:00:00.000Z",
}, "user-1");

describe("user-controlled form downloads", () => {
  it("marks a form not saved on this device as new", () => {
    expect(getFormDownloadStatus(form("form-1", "Household survey"))).toBe("new");
  });

  it("marks a changed definition as an update even when its timestamp did not change", () => {
    const original = form("form-1", "Household survey");
    const changed = { ...original, questions: [{ id: "q1", type: "text", label: "Village" }] };
    expect(getFormDownloadStatus(changed, cached(original))).toBe("update");
  });

  it("does not offer an unchanged downloaded form as an update", () => {
    const original = form("form-1", "Household survey");
    expect(getFormDownloadStatus(original, cached(original))).toBe("current");
  });

  it("includes authorized forms from every project, not only the selected project", () => {
    const items = buildFormDownloadItems(
      [form("form-1", "Household survey"), form("form-2", "Follow-up", "project-2")],
      [],
      [{ id: "project-1", name: "Accelerate" }, { id: "project-2", name: "BMZ" }],
    );
    expect(items.map((item) => item.form.id)).toEqual(["form-1", "form-2"]);
    expect(items.map((item) => item.projectName)).toEqual(["Accelerate", "BMZ"]);
  });

  it("selects only new forms and updates, leaving current forms untouched", () => {
    const unchanged = form("form-1", "Household survey");
    const items = buildFormDownloadItems(
      [unchanged, form("form-2", "Follow-up")],
      [cached(unchanged)],
      [{ id: "project-1", name: "Accelerate" }],
    );
    expect(downloadableFormIds(items)).toEqual(["form-2"]);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import { writeFormsMemberProjects } from "./formsProjectMembership";
import { canOpenOfflineForm, ownedOfflineForm, visibleOfflineForms, writeOfflineFormGrants, writeSpecialFormGrants } from "./offlineFormAccess";

describe("offline form authorization", () => {
  const form = { id: "form-a", project_id: "project-a" };
  beforeEach(() => {
    localStorage.clear();
    writeFormsMemberProjects("alice", [{ id: "project-a", name: "A" }]);
    writeOfflineFormGrants("alice", ["form-a"]);
  });
  it("only opens verified forms in member projects", () => {
    expect(canOpenOfflineForm("alice", "form-a", "project-a")).toBe(true);
    expect(canOpenOfflineForm("alice", "unassigned", "project-a")).toBe(false);
    expect(canOpenOfflineForm("alice", "form-a", "other-project")).toBe(false);
  });
  it("does not reveal another account's form even in the same project", () => {
    writeFormsMemberProjects("bob", [{ id: "project-a", name: "A" }]);
    writeOfflineFormGrants("bob", ["form-a"]);
    const stored = ownedOfflineForm(form, "alice");
    expect(visibleOfflineForms([stored], "alice")[0]?.id).toBe("form-a");
    expect(visibleOfflineForms([stored], "bob")).toEqual([]);
    expect(visibleOfflineForms([stored], null)).toEqual([]);
  });
  it("never adopts ownerless legacy forms", () => {
    expect(visibleOfflineForms([form], "alice")).toEqual([]);
  });
  it("hides saved definitions when verified form access is removed", () => {
    const stored = ownedOfflineForm(form, "alice");
    writeOfflineFormGrants("alice", []);
    expect(visibleOfflineForms([stored], "alice")).toEqual([]);
  });
  it("hides saved definitions when project membership is removed", () => {
    writeFormsMemberProjects("alice", []);
    expect(visibleOfflineForms([ownedOfflineForm(form, "alice")], "alice")).toEqual([]);
  });
  it("retains verified special-form access when the regular server list refreshes", () => {
    const special = { id: "special:project-a:seeclear_form", project_id: "project-a" };
    writeSpecialFormGrants("alice", [special.id]);
    writeOfflineFormGrants("alice", ["form-a"]);
    expect(visibleOfflineForms([ownedOfflineForm(special, "alice")], "alice")[0]?.id).toBe(special.id);
    writeSpecialFormGrants("alice", []);
    expect(visibleOfflineForms([ownedOfflineForm(special, "alice")], "alice")).toEqual([]);
  });
});
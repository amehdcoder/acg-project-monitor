import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: vi.fn() } }));
import { supabase } from "@/integrations/supabase/client";
import { fetchFormsMemberProjects, memberProjectRows, readFormsMemberProjects, writeFormsMemberProjects } from "./formsProjectMembership";

const rows = [{ id: "member", name: "Member project" }, { id: "other", name: "Other project" }];
describe("Forms project memberships", () => {
  beforeEach(() => { localStorage.clear(); vi.clearAllMocks(); });
  it("shows only member projects, without an administrator bypass", () => {
    expect(memberProjectRows(rows, [{ project_id: "member" }])).toEqual([rows[0]]);
  });
  it("retains only the same user's verified memberships offline", () => {
    writeFormsMemberProjects("alice", [rows[0]]);
    expect(readFormsMemberProjects("alice")).toEqual([rows[0]]);
    expect(readFormsMemberProjects("bob")).toEqual([]);
    expect(readFormsMemberProjects(null)).toEqual([]);
  });
  it("never trusts old broad project caches", () => {
    localStorage.setItem("amehnities:forms:projects:alice", JSON.stringify(rows));
    localStorage.setItem("amehnities:projects:list:alice", JSON.stringify(rows));
    expect(readFormsMemberProjects("alice")).toEqual([]);
  });
  it("replaces the offline list when membership is removed, including the last membership", () => {
    writeFormsMemberProjects("alice", rows);
    writeFormsMemberProjects("alice", [rows[0]]);
    expect(readFormsMemberProjects("alice")).toEqual([rows[0]]);
    writeFormsMemberProjects("alice", []);
    expect(readFormsMemberProjects("alice")).toEqual([]);
  });
  it("queries the caller's assignments and bounds project reads to those IDs", async () => {
    const eq = vi.fn().mockResolvedValue({ data: [{ project_id: "member" }], error: null });
    const order = vi.fn().mockResolvedValue({ data: rows, error: null });
    const within = vi.fn().mockReturnValue({ order });
    vi.mocked(supabase.from).mockImplementation(((table: string) => ({
      select: () => table === "user_project_assignments" ? { eq } : { in: within },
    })) as any);
    expect(await fetchFormsMemberProjects("alice")).toEqual([rows[0]]);
    expect(eq).toHaveBeenCalledWith("user_id", "alice");
    expect(within).toHaveBeenCalledWith("id", ["member"]);
  });
  it("fails closed when membership lookup fails", async () => {
    vi.mocked(supabase.from).mockReturnValue({ select: () => ({ eq: async () => ({ data: null, error: new Error("unavailable") }) }) } as any);
    await expect(fetchFormsMemberProjects("alice")).rejects.toThrow("unavailable");
    expect(readFormsMemberProjects("alice")).toEqual([]);
  });
});
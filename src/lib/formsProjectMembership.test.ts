import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));
import { supabase } from "@/integrations/supabase/client";
import { fetchFormsMemberProjects, memberProjectRows, readFormsMemberProjects, writeFormsMemberProjects } from "./formsProjectMembership";

const rows = [{ id: "member", name: "Member project" }, { id: "other", name: "Other project" }];
describe("Forms project memberships", () => {
  beforeEach(() => {
    localStorage.clear(); vi.clearAllMocks();
    vi.mocked(supabase.rpc).mockResolvedValue({ data: false, error: null } as any);
  });
  it("shows only member projects for non-administrators", () => {
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
  it("lists all server-accessible projects for a verified administrator without assignments", async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: true, error: null } as any);
    const order = vi.fn().mockResolvedValue({ data: rows, error: null });
    vi.mocked(supabase.from).mockReturnValue({ select: () => ({ order }) } as any);
    expect(await fetchFormsMemberProjects("admin")).toEqual(rows);
    expect(supabase.rpc).toHaveBeenCalledWith("is_admin", { _user_id: "admin" });
    expect(supabase.from).toHaveBeenCalledTimes(1);
    expect(supabase.from).toHaveBeenCalledWith("projects");
  });
  it("retains only the limited project list returned for an administrator", async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: true, error: null } as any);
    vi.mocked(supabase.from).mockReturnValue({ select: () => ({ order: async () => ({ data: [rows[0]], error: null }) }) } as any);
    const projects = await fetchFormsMemberProjects("limited-admin");
    expect(projects).toEqual([rows[0]]);
    writeFormsMemberProjects("limited-admin", projects);
    expect(readFormsMemberProjects("limited-admin")).toEqual([rows[0]]);
    expect(readFormsMemberProjects("other-admin")).toEqual([]);
  });
  it("does not widen access when server role verification fails", async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: new Error("role unavailable") } as any);
    await expect(fetchFormsMemberProjects("admin")).rejects.toThrow("role unavailable");
    expect(supabase.from).not.toHaveBeenCalled();
  });
  it.each([
    { account: "limited-admin", admin: true, allowed: [rows[0]] },
    { account: "all-admin", admin: true, allowed: rows },
    { account: "limited-member", admin: false, allowed: [rows[1]] },
    { account: "all-member", admin: false, allowed: rows },
  ])("keeps $account's verified list during an offline outage without widening it", async ({ account, admin, allowed }) => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: admin, error: null } as any);
    const assignments = allowed.map(p => ({ project_id: p.id }));
    vi.mocked(supabase.from).mockImplementation(((table: string) => ({
      select: () => table === "user_project_assignments"
        ? { eq: async () => ({ data: assignments, error: null }) }
        : { order: async () => ({ data: allowed, error: null }),
            in: () => ({ order: async () => ({ data: rows, error: null }) }) },
    })) as any);
    const verified = await fetchFormsMemberProjects(account);
    expect(verified).toEqual(allowed);
    writeFormsMemberProjects(account, verified);
    writeFormsMemberProjects("different-account", rows);
    localStorage.setItem(`amehnities:projects:list:${account}`, JSON.stringify(rows));
    vi.mocked(supabase.rpc).mockRejectedValue(new Error("offline"));
    await expect(fetchFormsMemberProjects(account)).rejects.toThrow("offline");
    expect(readFormsMemberProjects(account)).toEqual(allowed);
    expect(readFormsMemberProjects("unprepared-account")).toEqual([]);
    writeFormsMemberProjects(account, []);
    expect(readFormsMemberProjects(account)).toEqual([]);
  });
});
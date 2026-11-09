import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@supabase/supabase-js";

vi.mock("@/lib/deviceCrypto", () => ({ sealRecord: async (record: unknown) => record, unsealRecord: async (record: unknown) => record }));
vi.mock("@/lib/offlineAuthCrypto", () => ({ hashOfflinePassword: async () => ({ passwordHash: "test-hash", salt: "test-salt" }), verifyOfflinePassword: vi.fn() }));
vi.mock("@/lib/offlineAuditLog", () => ({ logOfflineAuditEvent: vi.fn() }));
import { saveOfflineCredential, getOfflineCredential } from "./offlineAuthCache";

const args = { email: "field@example.org", password: "test-only", user: { id: "field-user", email: "field@example.org" } as User, profile: null, role: "user" };
describe("offline credential durability", () => {
  beforeEach(() => { vi.restoreAllMocks(); localStorage.clear(); });
  it("reports failure when neither device store can save credentials", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("storage full"); });
    await expect(saveOfflineCredential(args)).rejects.toThrow("could not be written");
  });
  it("retains a usable fallback when IndexedDB is unavailable", async () => {
    await saveOfflineCredential(args);
    const cached = await getOfflineCredential(" FIELD@example.org ");
    expect(cached?.user_id).toBe("field-user");
    expect(cached?.passwordHash).toBe("test-hash");
  });
});
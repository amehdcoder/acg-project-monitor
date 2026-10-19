import { describe, it, expect } from "vitest";
import { generateApiKey, generateWebhookSecret, sha256Hex, hasScope, API_SCOPES } from "./apiKeys";

describe("API key helpers", () => {
  it("generates keys with the amk_ prefix and 48 hex chars", () => {
    const { raw, prefix } = generateApiKey();
    expect(raw).toMatch(/^amk_[0-9a-f]{48}$/);
    expect(prefix).toBe(raw.slice(0, 12));
    expect(prefix.startsWith("amk_")).toBe(true);
  });

  it("generates unique keys", () => {
    expect(generateApiKey().raw).not.toBe(generateApiKey().raw);
  });

  it("generates webhook secrets with the whs_ prefix", () => {
    expect(generateWebhookSecret()).toMatch(/^whs_[0-9a-f]{48}$/);
  });

  it("hashes deterministically to 64 hex chars", async () => {
    const h1 = await sha256Hex("amk_test");
    const h2 = await sha256Hex("amk_test");
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
    expect(await sha256Hex("amk_other")).not.toBe(h1);
  });

  it("enforces scopes exactly, with * as wildcard", () => {
    expect(hasScope(["records:read"], "records:read")).toBe(true);
    expect(hasScope(["records:read"], "reports:read")).toBe(false);
    expect(hasScope(["*"], "reports:read")).toBe(true);
    expect(hasScope([], "records:read")).toBe(false);
  });

  it("exposes the three supported scopes", () => {
    expect(API_SCOPES).toEqual(["records:read", "aggregates:read", "reports:read"]);
  });
});

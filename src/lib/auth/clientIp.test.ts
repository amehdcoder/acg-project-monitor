import { afterEach, describe, expect, it, vi } from "vitest";
import { lookupClientIp } from "./clientIp";

afterEach(() => vi.unstubAllGlobals());

describe("public client IP lookup", () => {
  it("uses only the public key and a bounded request, not a user's session", async () => {
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ip: "203.0.113.10" })));
    vi.stubGlobal("fetch", request);
    expect(await lookupClientIp()).toBe("203.0.113.10");
    expect(request).toHaveBeenCalledWith(`${String(import.meta.env.VITE_SUPABASE_URL).replace(/\/+$/, "")}/functions/v1/get-client-ip`, expect.objectContaining({
      headers: expect.objectContaining({ Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` }),
      signal: expect.any(AbortSignal),
    }));
  });
  it("does not make a request offline", async () => {
    vi.stubGlobal("navigator", { onLine: false });
    const request = vi.fn();
    vi.stubGlobal("fetch", request);
    expect(await lookupClientIp()).toBeNull();
    expect(request).not.toHaveBeenCalled();
  });
  it("contains authentication, network and malformed-response failures", async () => {
    const request = vi.fn()
      .mockResolvedValueOnce(new Response("{}", { status: 401 }))
      .mockRejectedValueOnce(new Error("timeout"))
      .mockResolvedValueOnce(new Response("not json"))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ip: "unknown" })));
    vi.stubGlobal("fetch", request);
    for (let i = 0; i < 4; i++) expect(await lookupClientIp()).toBeNull();
  });
});
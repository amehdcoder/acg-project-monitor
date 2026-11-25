import { describe, expect, it } from "vitest";
import { bearerRole, shouldBlock } from "./liveSessionGuard";

const B = String(import.meta.env.VITE_SUPABASE_URL).replace(/\/+$/, "");
const jwt = (role: string) => `Bearer x.${btoa(JSON.stringify({ role }))}.y`;

describe("live session guard", () => {
  it("reads the token role", () => {
    expect(bearerRole(jwt("anon"))).toBe("anon");
    expect(bearerRole(jwt("authenticated"))).toBe("authenticated");
  });
  it("blocks signed-in data reads sent as a signed-out visitor", () => {
    expect(shouldBlock(`${B}/rest/v1/projects`, jwt("anon"), "u1")).toBe(true);
  });
  it("allows the public IP lookup during session recovery", () => {
    expect(shouldBlock(`${B}/functions/v1/get-client-ip`, jwt("anon"), "u1")).toBe(false);
    expect(shouldBlock(`${B}/functions/v1/get-client-ip?probe=1`, jwt("anon"), "u1")).toBe(false);
  });
  it("keeps private functions and similarly named routes protected", () => {
    for (const path of ["external-api", "health-exchange", "get-client-ip-private", "get-client-ip/records"]) {
      expect(shouldBlock(`${B}/functions/v1/${path}`, jwt("anon"), "u1")).toBe(true);
    }
  });
  it("allows real sessions, signed-out visitors and sign-in calls", () => {
    expect(shouldBlock(`${B}/rest/v1/projects`, jwt("authenticated"), "u1")).toBe(false);
    expect(shouldBlock(`${B}/rest/v1/projects`, jwt("anon"), null)).toBe(false);
    expect(shouldBlock(`${B}/auth/v1/token`, jwt("anon"), "u1")).toBe(false);
    expect(shouldBlock(`${B}/functions/v1/auth-precheck`, jwt("anon"), "u1")).toBe(false);
  });
});

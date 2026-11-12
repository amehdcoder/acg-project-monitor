import { describe, expect, it } from "vitest";
import { resolveMicroplanAccess, MicroplanAccessInput } from "../microplanAccessLevel";

const base: MicroplanAccessInput = {
  isOwner: false,
  isOwnerLevel: false,
  hasUserPageGrant: false,
  hasFormAccess: false,
  lensEnabled: false,
  isAdmin: false,
  grantedPages: [],
  minimalAccess: false,
  isFieldDesignation: false,
  entryProjectIds: [],
};

describe("resolveMicroplanAccess", () => {
  it("gives the owner and co-owners the full dashboard", () => {
    expect(resolveMicroplanAccess({ ...base, isOwner: true })).toBe("dashboard");
    expect(resolveMicroplanAccess({ ...base, isOwnerLevel: true })).toBe("dashboard");
  });

  it("gives admins with an explicit page grant the full dashboard", () => {
    expect(
      resolveMicroplanAccess({ ...base, isAdmin: true, grantedPages: ["microplanning"] }),
    ).toBe("dashboard");
  });

  it("does not give an admin without a page grant the dashboard", () => {
    expect(resolveMicroplanAccess({ ...base, isAdmin: true })).toBe("none");
  });

  it("gives Tier-2 form-access and lens users the full dashboard", () => {
    expect(resolveMicroplanAccess({ ...base, hasFormAccess: true })).toBe("dashboard");
    expect(resolveMicroplanAccess({ ...base, lensEnabled: true })).toBe("dashboard");
    expect(resolveMicroplanAccess({ ...base, hasUserPageGrant: true })).toBe("dashboard");
  });

  it("gives project members the entry form only", () => {
    expect(resolveMicroplanAccess({ ...base, entryProjectIds: ["p1"] })).toBe("entry");
  });

  it("gives field designations the entry form only", () => {
    expect(resolveMicroplanAccess({ ...base, isFieldDesignation: true })).toBe("entry");
  });

  it("never lets entry access become dashboard access", () => {
    expect(
      resolveMicroplanAccess({ ...base, entryProjectIds: ["p1", "p2"], isFieldDesignation: true }),
    ).toBe("entry");
  });

  it("minimal-access lock blocks entry access for non-admins", () => {
    expect(
      resolveMicroplanAccess({ ...base, minimalAccess: true, entryProjectIds: ["p1"] }),
    ).toBe("none");
    expect(
      resolveMicroplanAccess({ ...base, minimalAccess: true, isFieldDesignation: true }),
    ).toBe("none");
  });

  it("denies users with no membership, designation or grant", () => {
    expect(resolveMicroplanAccess(base)).toBe("none");
  });
});

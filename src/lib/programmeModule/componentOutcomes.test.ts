import { describe, expect, it } from "vitest";
import { PRIORITY_LIVELIHOOD_SERVICES, servicesForComponent } from "./componentOutcomes";

describe("livelihood service priority", () => {
  it("offers all 11 Graduation services before configured and existing services", () => {
    const services = servicesForComponent({
      key: "economic_empowerment",
      services: ["Project-specific support", PRIORITY_LIVELIHOOD_SERVICES[4]],
    });
    expect(PRIORITY_LIVELIHOOD_SERVICES).toHaveLength(11);
    expect(services.slice(0, 11)).toEqual(PRIORITY_LIVELIHOOD_SERVICES);
    expect(services.indexOf("Project-specific support")).toBeGreaterThanOrEqual(11);
    expect(services.indexOf("Vulnerability assessment")).toBeGreaterThanOrEqual(11);
    expect(services.filter((s) => s === PRIORITY_LIVELIHOOD_SERVICES[4])).toHaveLength(1);
  });

  it("keeps other components' services unchanged", () => {
    const services = servicesForComponent({ key: "eye", services: ["Local eye service"] });
    expect(services[0]).toBe("Local eye service");
    expect(services.some((s) => PRIORITY_LIVELIHOOD_SERVICES.includes(s))).toBe(false);
  });
});
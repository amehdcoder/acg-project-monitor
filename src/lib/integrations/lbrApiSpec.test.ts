import { describe, expect, it } from "vitest";
import { buildLbrApiSpec } from "./lbrApiSpec";
import { specToText } from "./lbrApiExport";
import { CISKULA_PRESET } from "@/lib/programmeModule/defaults";

const spec = buildLbrApiSpec({ config: CISKULA_PRESET, moduleName: "CiSKuLA 2", projectName: "Test", supabaseUrl: "https://x.supabase.co/", now: new Date("2026-11-25T00:00:00Z") });

describe("LBR integration spec", () => {
  it("documents every live API route under the external-api base", () => {
    expect(spec.baseUrl).toBe("https://x.supabase.co/functions/v1/external-api/v1");
    expect(spec.endpoints.map((e) => e.path)).toEqual(["/projects", "/beneficiaries", "/beneficiaries/{case_id}", "/services", "/components", "/beneficiaries", "/services", "/aggregates", "/reports"]);
  });
  it("lists every webhook event the platform emits", () => {
    expect(spec.webhook.events.map((e) => e.id)).toEqual(expect.arrayContaining(["beneficiary.created", "beneficiary.updated", "service.recorded", "home_visit.reported", "feedback.submitted", "programme_report.submitted", "programme_report.monthly_sync"]));
  });
  it("includes the module's components and profile fields", () => {
    expect(spec.components.map((c) => c.key)).toContain("eye_health");
    expect(spec.profileFields.map((f) => f.key)).toEqual(expect.arrayContaining(["full_name", "consent_obtained", "gps"]));
    expect(specToText(spec)).toContain("X-Amehnities-Signature");
  });
  it("documents only the selected components and their service filter", () => {
    const one = buildLbrApiSpec({ config: CISKULA_PRESET, moduleName: "M", projectName: "T", supabaseUrl: "https://x.supabase.co", components: ["eye_health"] });
    expect(one.selection.mode).toBe("single");
    expect(one.components.map((c) => c.key)).toEqual(["eye_health"]);
    expect(one.endpointsForSelection.some((e) => e.url.endsWith("/services?component_key=eye_health"))).toBe(true);
    expect(specToText(one)).not.toMatch(/owner/i);
  });
  it("offers push endpoints that need records:write", () => {
    expect(spec.endpoints.filter((e) => e.method === "POST").every((e) => e.scope === "records:write")).toBe(true);
  });
  it("includes a JSON Schema limited to the selected components", () => {
    const one = buildLbrApiSpec({ config: CISKULA_PRESET, moduleName: "M", projectName: "T", supabaseUrl: "https://x.supabase.co", components: ["eye_health"] });
    const defs = one.schema.jsonSchema.$defs as Record<string, { required?: string[] }>;
    expect(one.schema.jsonSchema.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
    expect(Object.keys(defs).filter((k) => k.startsWith("ServiceData_"))).toEqual(["ServiceData_eye_health"]);
    expect(defs.Beneficiary.required).toContain("case_id");
    expect(specToText(one)).toContain("SCHEMA: SERVICE");
  });
});

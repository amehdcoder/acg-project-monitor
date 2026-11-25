import { describe, it, expect } from "vitest";
import { buildLbrSchema } from "./lbrApiSchema";

const f = (key: string, type = "text", required = false) => ({ key, label: key, type, required });
const schema = buildLbrSchema({ baseUrl: "https://x", core: [f("id", "uuid", true), f("case_id", "text", true)], profile: [f("sex")],
  service: [f("id", "uuid", true), f("beneficiary_id", "uuid", true), f("component_key", "enum", true)],
  components: [{ key: "eye_health", label: "Eye Health", services: [], extraFields: [f("va_left")] }] });

describe("ER diagram source", () => {
  it("links only the selected components with crow's-foot cardinalities", () => {
    const m = schema.mermaid!;
    expect(m).toContain("Beneficiary ||--o{ Service");
    expect(m).toContain("Service ||--o| ServiceData_eye_health");
    expect(m).not.toContain("mental_health");
  });
  it("marks primary and foreign keys", () => {
    expect(schema.mermaid).toContain("string_uuid id PK");
    expect(schema.mermaid).toContain("string_uuid beneficiary_id FK");
  });
});

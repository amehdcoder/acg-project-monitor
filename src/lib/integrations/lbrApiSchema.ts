// Builds the data schema (entity model + JSON Schema 2020-12 / OpenAPI 3.1 compatible)
// for the components selected in the LBR integration specification.
import type { SpecField } from "./lbrApiSpec";
import { schemaToMermaid } from "./lbrApiDiagram";

export type SchemaProp = { name: string; type: string; format?: string; required: boolean; description: string; enum?: string[] };
export type SchemaEntity = { id: string; title: string; accent: "navy" | "teal" | "gold"; description: string; props: SchemaProp[] };
export type LbrSchema = {
  standard: string;
  entities: SchemaEntity[];
  relations: { from: string; to: string; cardinality: string; via: string }[];
  jsonSchema: Record<string, unknown>;
  /** Mermaid erDiagram source of the same model. */
  mermaid?: string;
};

const ENUM_IN = /:\s*([a-z_]+(?:\s*\|\s*[a-z_]+)+)/i;
export function toProp(f: SpecField): SchemaProp {
  const t = f.type.toLowerCase();
  const enumFromLabel = f.label.match(ENUM_IN)?.[1].split("|").map((x) => x.trim());
  const pick = (type: string, format?: string): SchemaProp => ({ name: f.key, type, format, required: f.required, description: f.label.replace(ENUM_IN, "").trim() || f.key, enum: f.options || enumFromLabel });
  if (t === "uuid") return pick("string", "uuid");
  if (t === "timestamp" || t === "datetime") return pick("string", "date-time");
  if (t === "date") return pick("string", "date");
  if (t === "integer") return pick("integer");
  if (["number", "decimal", "calculate"].includes(t)) return pick("number");
  if (t === "boolean" || t === "checkbox" || t === "yes_no") return pick("boolean");
  if (t === "object") return pick("object");
  if (["multiselect", "select_multiple", "checkbox_group"].includes(t)) return pick("array");
  if (t === "enum" || t === "select" || t === "select_one" || t === "radio") return pick("string");
  return pick("string");
}

function propSchema(p: SchemaProp): Record<string, unknown> {
  const o: Record<string, unknown> = { type: p.type, description: p.description };
  if (p.format) o.format = p.format;
  if (p.enum?.length) { if (p.type === "array") o.items = { type: "string", enum: p.enum }; else o.enum = p.enum; }
  else if (p.type === "array") o.items = { type: "string" };
  return o;
}
const objectSchema = (title: string, description: string, props: SchemaProp[], extra: Record<string, unknown> = {}) => ({
  type: "object", title, description,
  properties: Object.fromEntries(props.map((p) => [p.name, propSchema(p)])),
  required: props.filter((p) => p.required).map((p) => p.name),
  ...extra,
});

export function buildLbrSchema(input: {
  baseUrl: string; core: SpecField[]; profile: SpecField[]; service: SpecField[];
  components: { key: string; label: string; services: string[]; extraFields: SpecField[] }[];
}): LbrSchema {
  const core = input.core.map(toProp), profile = input.profile.map(toProp), service = input.service.map(toProp);
  const keys = input.components.map((c) => c.key);
  const entities: SchemaEntity[] = [
    { id: "Beneficiary", title: "Beneficiary", accent: "navy", description: "One longitudinal record per person, keyed by case_id.", props: core },
    { id: "BeneficiaryProfile", title: "Beneficiary.profile", accent: "teal", description: "Registration answers held inside beneficiary.profile.", props: profile },
    { id: "Service", title: "Service", accent: "navy", description: "A service delivered under one programme component.", props: service.map((p) => p.name === "component_key" ? { ...p, enum: keys } : p) },
    ...input.components.map((c): SchemaEntity => ({ id: `ServiceData_${c.key}`, title: `Service.data — ${c.label}`, accent: "gold", description: `component_key = "${c.key}". Services: ${c.services.join(", ") || "—"}.`, props: c.extraFields.map(toProp) })),
    { id: "WebhookEnvelope", title: "WebhookEnvelope", accent: "teal", description: "Body of every signed webhook delivery.", props: [
      { name: "id", type: "string", format: "uuid", required: true, description: "Delivery ID (idempotency key)" },
      { name: "event", type: "string", required: true, description: "Event name", enum: ["beneficiary.created", "beneficiary.updated", "service.recorded", "home_visit.reported", "feedback.submitted", "programme_report.submitted", "programme_report.monthly_sync", "test.ping"] },
      { name: "project_id", type: "string", format: "uuid", required: true, description: "Project the event belongs to" },
      { name: "created_at", type: "string", format: "date-time", required: true, description: "Event time (UTC)" },
      { name: "data", type: "object", required: true, description: "Event payload (Section 8.1)" },
    ] },
  ];
  const relations = [
    { from: "Beneficiary", to: "Beneficiary.profile", cardinality: "1 — 1", via: "embedded object profile" },
    { from: "Beneficiary", to: "Service", cardinality: "1 — 0..n", via: "service.beneficiary_id references beneficiary.id" },
    ...input.components.map((c) => ({ from: "Service", to: `Service.data — ${c.label}`, cardinality: "1 — 0..1", via: `embedded data when component_key = "${c.key}"` })),
    { from: "WebhookEnvelope", to: "Beneficiary / Service", cardinality: "1 — 1", via: "data carries the changed record" },
  ];
  const id = (e: string) => `#/$defs/${e}`;
  const defs: Record<string, unknown> = {
    BeneficiaryProfile: objectSchema("Beneficiary profile", entities[1].description, profile, { additionalProperties: true }),
    Beneficiary: objectSchema("Beneficiary", entities[0].description, core),
    Service: objectSchema("Service", entities[2].description, entities[2].props),
    WebhookEnvelope: objectSchema("Webhook envelope", "Body of every signed webhook delivery.", entities[entities.length - 1].props),
  };
  (defs.Beneficiary as { properties: Record<string, unknown> }).properties.profile = { $ref: id("BeneficiaryProfile") };
  (defs.Beneficiary as { properties: Record<string, unknown> }).properties.case_id = { type: "string", maxLength: 64, description: "Unique Case ID" };
  for (const c of input.components) defs[`ServiceData_${c.key}`] = objectSchema(`Service data — ${c.label}`, `component_key = ${c.key}`, c.extraFields.map(toProp), { additionalProperties: true });
  (defs.Service as Record<string, unknown>).allOf = input.components.map((c) => ({
    if: { properties: { component_key: { const: c.key } } },
    then: { properties: { data: { $ref: id(`ServiceData_${c.key}`) } } },
  }));
  const out: LbrSchema = {
    standard: "JSON Schema Draft 2020-12 · OpenAPI 3.1 compatible · ISO 8601 dates · RFC 4122 UUIDs",
    entities, relations,
    jsonSchema: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $id: `${input.baseUrl}/schema/lbr.json`,
      title: "Amehnities Longitudinal Beneficiary Records",
      $defs: defs,
    },
  };
  out.mermaid = schemaToMermaid(out);
  return out;
}

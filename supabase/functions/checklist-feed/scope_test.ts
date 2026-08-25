// Edge-function scope tests: every response the Checklist feed returns must be
// filtered to the caller's granted State(s), with disallowed States dropped.
import { assertEquals, assertFalse } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { isGrantActive, norm, readState, scopeRows } from "./scope.ts";

const row = (state: unknown, extra: Record<string, unknown> = {}) => ({
  _id: Math.random(),
  ...extra,
  ...(state === undefined ? {} : { "group_intro/mda_state": state }),
});

const KANO = row("Kano");
const KANO_SUFFIX = row("Kano State");
const KANO_CASE = row("  kANO  ");
const JIGAWA = row("Jigawa");
const PLATEAU = row("Plateau");
const NO_STATE = row(undefined, { community: "Nayinawa" });

Deno.test("norm collapses case, padding and the 'State' suffix", () => {
  assertEquals(norm("Kano"), "kano");
  assertEquals(norm("  KANO State "), "kano");
  assertEquals(norm(null), "");
});

Deno.test("readState finds the State across Kobo naming conventions", () => {
  assertEquals(readState({ "grp/mda_state": "Kano" }), "Kano");
  assertEquals(readState({ state_label: "Jigawa" }), "Jigawa");
  assertEquals(readState({ sel_state_name: "Plateau" }), "Plateau");
  assertEquals(readState({ q_state: "Kano" }), "Kano");
  // Not a State field — must not be mistaken for one.
  assertEquals(readState({ facility_state_of_repair: "Good" }), "");
  assertEquals(readState({ community: "Nayinawa" }), "");
});

Deno.test("positive: a scoped grantee receives only their State's rows", () => {
  const out = scopeRows([KANO, JIGAWA, PLATEAU], ["Kano"]);
  assertEquals(out.length, 1);
  assertEquals(out[0], KANO);
});

Deno.test("positive: scoping is tolerant of case and the 'State' suffix", () => {
  const out = scopeRows([KANO, KANO_SUFFIX, KANO_CASE, JIGAWA], ["kano state"]);
  assertEquals(out.length, 3);
});

Deno.test("positive: a multi-State grant receives each granted State", () => {
  const out = scopeRows([KANO, JIGAWA, PLATEAU], ["Kano", "Jigawa"]);
  assertEquals(out.length, 2);
  assertFalse(out.includes(PLATEAU));
});

Deno.test("negative: disallowed States never appear in the response", () => {
  const out = scopeRows([KANO, JIGAWA, PLATEAU], ["Jigawa"]);
  assertEquals(out.map((r) => readState(r)), ["Jigawa"]);
  assertFalse(out.includes(KANO));
  assertFalse(out.includes(PLATEAU));
});

Deno.test("negative: a grant for a State with no data returns nothing", () => {
  assertEquals(scopeRows([KANO, JIGAWA], ["Sokoto"]).length, 0);
});

Deno.test("negative: rows with no readable State fail closed for scoped users", () => {
  assertEquals(scopeRows([NO_STATE], ["Kano"]).length, 0);
  // …but remain visible to unscoped callers.
  assertEquals(scopeRows([NO_STATE], []).length, 1);
});

Deno.test("negative: blank/whitespace scope entries do not widen access", () => {
  const out = scopeRows([KANO, JIGAWA], ["Kano", "", "   "]);
  assertEquals(out.length, 1);
  assertEquals(readState(out[0]), "Kano");
});

Deno.test("admins and unscoped grants see every row", () => {
  assertEquals(scopeRows([KANO, JIGAWA, PLATEAU], ["Kano"], true).length, 3);
  assertEquals(scopeRows([KANO, JIGAWA, PLATEAU], []).length, 3);
});

Deno.test("expired or not-yet-started grants are inactive (scope becomes empty)", () => {
  const now = Date.parse("2026-01-15T00:00:00Z");
  assertEquals(isGrantActive({ starts_at: null, expires_at: null }, now), true);
  assertEquals(isGrantActive({ expires_at: "2026-01-14T00:00:00Z" }, now), false);
  assertEquals(isGrantActive({ starts_at: "2026-02-01T00:00:00Z" }, now), false);
  assertEquals(isGrantActive({ starts_at: "2026-01-01T00:00:00Z", expires_at: "2026-02-01T00:00:00Z" }, now), true);
  assertEquals(isGrantActive(null, now), false);
});

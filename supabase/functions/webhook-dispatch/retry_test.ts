import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { retryEvent } from "./retry.ts";
Deno.test("report retry preserves complete indicator payload and original event id", () => {
  const payload = { report_id: "report-1", entries: [{ indicator_code: "1.1", value: 12, disaggregation: { Male: 5, Female: 7 } }] };
  const result = retryEvent({ event_id: "event-1", event: "programme_report.submitted" }, { payload }, "project-1");
  assertEquals(result?.id, "event-1");
  assertEquals(result?.payload, payload);
});
Deno.test("missing original report is not replaced with an empty retry marker", () => {
  assertEquals(retryEvent({ event_id: "event-1", event: "programme_report.submitted" }, null, "project-1"), null);
});
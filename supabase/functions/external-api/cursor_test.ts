import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { parseCursor } from "./cursor.ts";
Deno.test("API cursors preserve timestamp precision and UUID", () => {
  const timestamp = "2026-10-20T04:27:00.123456+00:00", id = "488d516f-6ec2-4d1f-919a-25dbe845c9c6";
  assertEquals(parseCursor(`${timestamp}|${id}`), { timestamp, id });
});
Deno.test("API cursors reject injected filters and extra segments", () => {
  for (const raw of ["2026-10-20T04:27:00Z|x),project_id.neq.x", "2026-10-20T04:27:00Z|488d516f-6ec2-4d1f-919a-25dbe845c9c6|extra", "bad|488d516f-6ec2-4d1f-919a-25dbe845c9c6"]) assertEquals(parseCursor(raw), null);
});
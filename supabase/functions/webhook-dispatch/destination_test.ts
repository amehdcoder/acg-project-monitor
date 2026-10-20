import { assert, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { validateDestination, isPublicIpv4 } from "./destination.ts";
Deno.test("webhooks allow public HTTPS URLs but reject local URLs and credentials", () => {
  assert(validateDestination("https://example.org/reports").hostname === "example.org");
  for (const url of ["http://example.org", "https://127.0.0.1", "https://[::1]", "https://localhost", "https://server.internal", "https://user:pass@example.org", "https://example.org:444"]) assertThrows(() => validateDestination(url));
});
Deno.test("webhooks reject private and metadata addresses returned by DNS", () => {
  for (const ip of ["10.0.0.1", "127.0.0.1", "169.254.169.254", "172.16.0.1", "192.168.0.1", "100.64.0.1", "0.0.0.0", "224.0.0.1"]) assert(!isPublicIpv4(ip));
  assert(isPublicIpv4("8.8.8.8"));
});
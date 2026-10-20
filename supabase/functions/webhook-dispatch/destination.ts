/** Reject internal destinations before resolving DNS or sending signed data. */
export function validateDestination(value: string): URL {
  const url = new URL(value);
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) throw new Error("Use a public HTTPS destination without credentials");
  if (!host.includes(".") || host.startsWith("[") || /^(\d+\.){3}\d+$/.test(host) || /(^|\.)(localhost|local|internal|lan|home|test|invalid)$/.test(host)) throw new Error("Internal webhook destinations are not allowed");
  return url;
}
export function isPublicIpv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  const [a, b] = parts;
  return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && [0, 168].includes(b)) || (a === 100 && b >= 64 && b <= 127) || (a === 198 && [18, 19].includes(b)));
}
export async function publicDestination(value: string): Promise<URL> {
  const url = validateDestination(value);
  // Fail closed if DNS cannot be checked; redirects are separately disabled.
  const addresses = await Deno.resolveDns(url.hostname, "A");
  if (!addresses.length || addresses.some(ip => !isPublicIpv4(ip))) throw new Error("Webhook destination must resolve to a public address");
  const ipv6 = await Deno.resolveDns(url.hostname, "AAAA").catch(() => []);
  if (ipv6.some(ip => !/^[23][0-9a-f]{3}:/i.test(ip))) throw new Error("Webhook destination resolves to an internal address");
  return url;
}
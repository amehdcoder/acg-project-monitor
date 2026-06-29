// Geo tools: forward geocoding, reverse geocoding, and IP geolocation.
// - Geocoding / reverse geocoding use OpenStreetMap Nominatim (free, real data).
// - IP geolocation uses ipfind.com with the IPFIND_API_KEY secret.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { guardRequest } from "../_shared/authGuard.ts";

const NOMINATIM = "https://nominatim.openstreetmap.org";
const UA = "Amehnities-GeoTools/1.0 (https://www.amehnities.org)";

async function geocode(address: string) {
  const url = `${NOMINATIM}/search?format=jsonv2&addressdetails=1&limit=1&q=${encodeURIComponent(address)}`;
  const res = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "en" } });
  if (!res.ok) throw new Error(`Nominatim ${res.status}`);
  const data = await res.json();
  if (!Array.isArray(data) || data.length === 0) {
    return { found: false };
  }
  const r = data[0];
  return {
    found: true,
    lat: Number(r.lat),
    lng: Number(r.lon),
    display_name: r.display_name,
    type: r.type,
    importance: r.importance,
    source: "OpenStreetMap (Nominatim)",
    address: r.address ?? null,
  };
}

async function reverse(lat: number, lng: number) {
  const url = `${NOMINATIM}/reverse?format=jsonv2&addressdetails=1&lat=${lat}&lon=${lng}`;
  const res = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "en" } });
  if (!res.ok) throw new Error(`Nominatim ${res.status}`);
  const r = await res.json();
  if (!r || r.error) return { found: false };
  return {
    found: true,
    display_name: r.display_name,
    address: r.address ?? null,
    source: "OpenStreetMap (Nominatim)",
  };
}

async function ipLookup(ip?: string) {
  const key = Deno.env.get("IPFIND_API_KEY");
  if (!key) throw new Error("IPFIND_API_KEY is not configured");
  const params = new URLSearchParams({ auth: key });
  if (ip) params.set("ip", ip);
  const res = await fetch(`https://ipfind.co/?${params.toString()}`);
  const text = await res.text();
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("IP lookup service returned an unexpected response");
  }
  if (data?.error) throw new Error(data.error);
  if (!res.ok) throw new Error(`ipfind ${res.status}`);
  return data;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const guard = await guardRequest(req, corsHeaders, { requireAdmin: false });
  if (guard.response) return guard.response;
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const { action, address, lat, lng, ip } = await req.json();

    if (action === "geocode") {
      if (!address || typeof address !== "string") return json({ error: "address required" }, 400);
      return json(await geocode(address.trim()));
    }
    if (action === "reverse") {
      const la = Number(lat), lo = Number(lng);
      if (!isFinite(la) || !isFinite(lo)) return json({ error: "valid lat/lng required" }, 400);
      return json(await reverse(la, lo));
    }
    if (action === "ip") {
      return json(await ipLookup(typeof ip === "string" && ip.trim() ? ip.trim() : undefined));
    }
    return json({ error: "Unknown action" }, 400);
  } catch (err) {
    console.error("geo-tools error:", err);
    return json({ error: (err as Error).message }, 500);
  }
});

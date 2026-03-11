import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Try multiple headers in priority order for client IP detection
  const headerNames = [
    "x-forwarded-for",
    "x-real-ip",
    "cf-connecting-ip",
    "true-client-ip",
    "x-client-ip",
    "x-cluster-client-ip",
    "fastly-client-ip",
    "x-envoy-external-address",
  ];

  let ip = "unknown";

  for (const header of headerNames) {
    const value = req.headers.get(header);
    if (value) {
      // x-forwarded-for can contain multiple IPs; take the first (original client)
      const candidate = value.split(",")[0]?.trim();
      if (candidate && candidate !== "unknown" && candidate !== "127.0.0.1" && candidate !== "::1") {
        ip = candidate;
        break;
      }
    }
  }

  // Log for debugging
  console.log("Detected IP:", ip, "| Headers checked:", headerNames.map(h => `${h}=${req.headers.get(h) || "null"}`).join(", "));

  return new Response(JSON.stringify({ ip }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});

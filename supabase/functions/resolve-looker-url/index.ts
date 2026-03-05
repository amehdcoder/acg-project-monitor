import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const toEmbedCompatibleUrl = (url: string) => {
  const normalized = url.trim().replace("datastudio.google.com", "lookerstudio.google.com");

  if (normalized.includes("/embed/")) return normalized;
  if (normalized.includes("/reporting/")) {
    return normalized.replace("/reporting/", "/embed/reporting/");
  }

  return normalized;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { url } = await req.json();

    if (!url || typeof url !== "string") {
      return new Response(JSON.stringify({ error: "A valid URL is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const normalizedUrl = url.trim().replace("datastudio.google.com", "lookerstudio.google.com");

    // For non-short links, return immediately.
    if (!normalizedUrl.includes("/s/")) {
      return new Response(
        JSON.stringify({
          normalizedUrl,
          resolvedUrl: normalizedUrl,
          embedUrl: toEmbedCompatibleUrl(normalizedUrl),
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Resolve short links server-side (avoids browser CORS limitations).
    const response = await fetch(normalizedUrl, {
      method: "GET",
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0",
      },
    });

    const resolvedUrl = response.url || normalizedUrl;

    return new Response(
      JSON.stringify({
        normalizedUrl,
        resolvedUrl,
        embedUrl: toEmbedCompatibleUrl(resolvedUrl),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

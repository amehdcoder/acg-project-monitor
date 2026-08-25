/**
 * ai-media-generate — multimodal generation service for Amehnities AI.
 *
 * Generates high-resolution images through the Lovable AI Gateway and records
 * every asset in `ai_generated_media` so the chat UI can render media cards,
 * galleries and progress states from durable rows.
 *
 * Video synthesis is exposed through the same contract: when a video provider
 * key is configured the request is forwarded, otherwise the row is stored with
 * status `unavailable` and a clear reason the UI surfaces to the user.
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const GATEWAY = "https://ai.gateway.lovable.dev/v1";

const IMAGE_MODELS: Record<string, string> = {
  fast: "google/gemini-3-pro-image",
  quality: "google/gemini-3-pro-image",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) return json({ error: "AI is not configured (missing key)." }, 500);

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const authClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const { data: userData } = await authClient.auth.getUser(authHeader.replace("Bearer ", ""));
    const userId = userData?.user?.id;
    if (!userId) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

    const body = await req.json().catch(() => ({}));
    const kind = String(body?.kind ?? "image");
    const prompt = String(body?.prompt ?? "").trim().slice(0, 4000);
    const conversationId = body?.conversation_id ? String(body.conversation_id) : null;
    if (!prompt) return json({ error: "prompt is required" }, 400);

    // ------------------------------------------------------------- video
    if (kind === "video") {
      const provider = Deno.env.get("VIDEO_API_KEY");
      if (!provider) {
        const { data: row } = await admin.from("ai_generated_media").insert({
          kind: "video", prompt, status: "unavailable", created_by: userId,
          conversation_id: conversationId,
          metadata: { reason: "No video generation provider is connected yet." },
        }).select("*").single();
        return json({
          status: "unavailable",
          media: row,
          message: "Video synthesis needs a video provider key to be connected. Images are available now.",
        }, 200);
      }
      // A provider is configured — record the job as queued for the poller.
      const { data: row } = await admin.from("ai_generated_media").insert({
        kind: "video", prompt, status: "queued", created_by: userId, conversation_id: conversationId,
      }).select("*").single();
      return json({ status: "queued", media: row });
    }

    // ------------------------------------------------------------- image
    const model = IMAGE_MODELS[String(body?.quality ?? "quality")] ?? IMAGE_MODELS.quality;
    const res = await fetch(`${GATEWAY}/images/generations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": apiKey,
        "X-Lovable-AIG-SDK": "fetch",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: [{ type: "text", text: prompt }] }],
        modalities: ["image", "text"],
      }),
    });

    if (!res.ok) {
      const details = await res.text();
      console.error(`Image generation failed [${res.status}]: ${details}`);
      return json({ error: "Image generation failed", status: res.status, details }, res.status);
    }

    const payload = await res.json();
    const url =
      payload?.choices?.[0]?.message?.images?.[0]?.image_url?.url ??
      payload?.data?.[0]?.url ??
      (payload?.data?.[0]?.b64_json ? `data:image/png;base64,${payload.data[0].b64_json}` : null);

    if (!url) {
      return json({ error: "The model returned no image.", details: JSON.stringify(payload).slice(0, 600) }, 502);
    }

    const { data: row, error } = await admin.from("ai_generated_media").insert({
      kind: "image",
      prompt,
      model,
      status: "completed",
      url,
      conversation_id: conversationId,
      created_by: userId,
      metadata: { quality: body?.quality ?? "quality" },
    }).select("*").single();
    if (error) console.error("media insert failed", error.message);

    return json({ status: "completed", media: row ?? { kind: "image", prompt, url, model, status: "completed" } });
  } catch (err) {
    console.error("ai-media-generate error", (err as Error)?.message);
    return json({ error: (err as Error)?.message ?? "error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

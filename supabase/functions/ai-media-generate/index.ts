/**
 * ai-media-generate — multimodal generation service for Amehnities AI.
 *
 * Images are generated through the Lovable AI Gateway chat/completions endpoint
 * with `modalities: ["image","text"]` (the shape the image models actually
 * accept) and video through the gateway's asynchronous `/v1/videos` job API.
 * Every asset is recorded in `ai_generated_media` so the chat UI can render
 * durable media cards, galleries and progress states.
 *
 * Actions
 *   { kind: "image" | "video", prompt }   start a generation
 *   { action: "status", id }              poll a queued video job
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
const VIDEO_MODELS: Record<string, string> = {
  fast: "google/veo-3.1-fast",
  quality: "google/veo-3.1",
};

/** Turn a gateway failure into a message the UI can show verbatim. */
async function gatewayError(res: Response) {
  const raw = await res.text();
  let message = raw.slice(0, 400);
  try {
    const parsed = JSON.parse(raw);
    message = parsed?.message || parsed?.error?.message || parsed?.details || message;
  } catch { /* plain text */ }
  if (res.status === 429) message = message || "The AI service is rate limited. Try again shortly.";
  if (res.status === 402) message = message || "AI credits are exhausted for this workspace.";
  return { status: res.status, message };
}

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

    /* --------------------------------------------------------- status poll */
    if (String(body?.action ?? "") === "status") {
      const rowId = String(body?.id ?? "");
      if (!rowId) return json({ error: "id is required" }, 400);
      const { data: row } = await admin
        .from("ai_generated_media").select("*").eq("id", rowId).eq("created_by", userId).maybeSingle();
      if (!row) return json({ error: "Not found" }, 404);
      if (row.status !== "queued") return json({ status: row.status, media: row });

      const jobId = (row.metadata as Record<string, unknown> | null)?.job_id as string | undefined;
      if (!jobId) return json({ status: row.status, media: row });

      const poll = await fetch(`${GATEWAY}/videos/${jobId}`, {
        headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "fetch" },
      });
      if (!poll.ok) {
        const e = await gatewayError(poll);
        const { data: failed } = await admin.from("ai_generated_media")
          .update({ status: "failed", metadata: { ...(row.metadata as object ?? {}), error: e.message } })
          .eq("id", rowId).select("*").single();
        return json({ status: "failed", media: failed ?? row, message: e.message });
      }
      const job = await poll.json();
      if (job?.status !== "completed") {
        return json({
          status: "queued",
          progress: Number(job?.progress ?? 0),
          media: { ...row, metadata: { ...(row.metadata as object ?? {}), progress: job?.progress ?? 0 } },
        });
      }

      // Completed — resolve the durable content URL and persist it.
      const url = await resolveVideoUrl(jobId, apiKey);
      if (!url) return json({ status: "queued", progress: 99, media: row });
      const { data: done } = await admin.from("ai_generated_media")
        .update({ status: "completed", url, metadata: { ...(row.metadata as object ?? {}), progress: 100 } })
        .eq("id", rowId).select("*").single();
      return json({ status: "completed", media: done ?? { ...row, status: "completed", url } });
    }

    /* ------------------------------------------------------------ generate */
    const kind = String(body?.kind ?? "image");
    const prompt = String(body?.prompt ?? "").trim().slice(0, 4000);
    const quality = String(body?.quality ?? "quality");
    const conversationId = body?.conversation_id ? String(body.conversation_id) : null;
    if (!prompt) return json({ error: "prompt is required" }, 400);

    if (kind === "video") {
      const model = VIDEO_MODELS[quality] ?? VIDEO_MODELS.quality;
      const res = await fetch(`${GATEWAY}/videos`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "fetch" },
        body: JSON.stringify({ model, prompt }),
      });
      if (!res.ok) {
        const e = await gatewayError(res);
        console.error(`Video generation failed [${e.status}]: ${e.message}`);
        return json({ error: e.message || "Video generation failed", status: e.status }, e.status);
      }
      const job = await res.json();
      const { data: row } = await admin.from("ai_generated_media").insert({
        kind: "video", prompt, model, status: "queued", created_by: userId,
        conversation_id: conversationId,
        metadata: { job_id: job?.id ?? null, progress: job?.progress ?? 0, quality },
      }).select("*").single();
      return json({ status: "queued", media: row, message: "Video job started. It usually takes 1–3 minutes." });
    }

    // ------------------------------------------------------------- image
    const model = IMAGE_MODELS[quality] ?? IMAGE_MODELS.quality;
    const res = await fetch(`${GATEWAY}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "fetch" },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        modalities: ["image", "text"],
      }),
    });

    if (!res.ok) {
      const e = await gatewayError(res);
      console.error(`Image generation failed [${e.status}]: ${e.message}`);
      return json({ error: e.message || "Image generation failed", status: e.status }, e.status);
    }

    const payload = await res.json();
    const url =
      payload?.choices?.[0]?.message?.images?.[0]?.image_url?.url ??
      payload?.data?.[0]?.url ??
      (payload?.data?.[0]?.b64_json ? `data:image/png;base64,${payload.data[0].b64_json}` : null);

    if (!url) return json({ error: "The model returned no image. Try rephrasing the prompt." }, 502);

    const { data: row, error } = await admin.from("ai_generated_media").insert({
      kind: "image", prompt, model, status: "completed", url,
      conversation_id: conversationId, created_by: userId,
      metadata: { quality, text: payload?.choices?.[0]?.message?.content ?? null },
    }).select("*").single();
    if (error) console.error("media insert failed", error.message);

    return json({ status: "completed", media: row ?? { kind: "image", prompt, url, model, status: "completed" } });
  } catch (err) {
    console.error("ai-media-generate error", (err as Error)?.message);
    return json({ error: (err as Error)?.message ?? "error" }, 500);
  }
});

/** The gateway serves finished video bytes behind a redirect to a signed URL. */
async function resolveVideoUrl(jobId: string, apiKey: string): Promise<string | null> {
  const res = await fetch(`${GATEWAY}/videos/${jobId}/content`, {
    headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "fetch" },
    redirect: "manual",
  });
  const location = res.headers.get("location");
  if (location) return location;
  if (res.ok) {
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.byteLength && buf.byteLength < 6_000_000) {
      let bin = "";
      for (let i = 0; i < buf.length; i += 8192) bin += String.fromCharCode(...buf.subarray(i, i + 8192));
      return `data:video/mp4;base64,${btoa(bin)}`;
    }
  }
  return null;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

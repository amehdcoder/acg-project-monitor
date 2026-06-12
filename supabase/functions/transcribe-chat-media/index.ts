// Transcribe a chat voice note or video using ElevenLabs Scribe (verbatim,
// multi-language, robust to Nigerian accents). Falls back gracefully and never
// throws an opaque error back to the user.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status,
    });

  try {
    if (!ELEVENLABS_API_KEY) {
      return json({ error: "Transcription service is not configured." }, 400);
    }

    // --- Authenticate the caller ---
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");
    if (!token) return json({ error: "Not authenticated." }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userData?.user) {
      return json({ error: "Not authenticated." }, 401);
    }
    const userId = userData.user.id;

    const body = await req.json().catch(() => ({}));
    const messageId: string | undefined = body?.messageId;
    if (!messageId || typeof messageId !== "string") {
      return json({ error: "messageId is required." }, 400);
    }

    // --- Load the message and verify access ---
    const { data: message, error: msgErr } = await admin
      .from("chat_messages")
      .select("id, chat_group_id, attachment_url, attachment_type, attachment_name, transcription")
      .eq("id", messageId)
      .maybeSingle();

    if (msgErr || !message) {
      return json({ error: "Message not found." }, 404);
    }

    // Already transcribed → return cached result.
    if (message.transcription && message.transcription.trim()) {
      return json({ transcription: message.transcription, cached: true });
    }

    // Membership / admin check.
    const [{ data: membership }, { data: isAdmin }] = await Promise.all([
      admin
        .from("chat_group_members")
        .select("user_id")
        .eq("chat_group_id", message.chat_group_id)
        .eq("user_id", userId)
        .maybeSingle(),
      admin.rpc("is_admin", { _user_id: userId }),
    ]);
    if (!membership && !isAdmin) {
      return json({ error: "You don't have access to this chat." }, 403);
    }

    if (!message.attachment_url) {
      return json({ error: "This message has no media to transcribe." }, 400);
    }

    // --- Download the media from storage (private bucket) ---
    const marker = "/chat-attachments/";
    const idx = message.attachment_url.indexOf(marker);
    if (idx === -1) {
      return json({ error: "Unsupported media location." }, 400);
    }
    const storagePath = decodeURIComponent(
      message.attachment_url.substring(idx + marker.length)
    );

    const { data: fileData, error: dlErr } = await admin.storage
      .from("chat-attachments")
      .download(storagePath);

    if (dlErr || !fileData) {
      return json({ error: "Could not read the media file." }, 400);
    }

    // --- Send to ElevenLabs Scribe ---
    const fileName = message.attachment_name || storagePath.split("/").pop() || "audio";
    const contentType = message.attachment_type || fileData.type || "application/octet-stream";
    const upload = new File([await fileData.arrayBuffer()], fileName, { type: contentType });

    const form = new FormData();
    form.append("file", upload);
    form.append("model_id", "scribe_v1");
    form.append("tag_audio_events", "false");
    form.append("diarize", "false");
    // No language_code → auto-detect (handles Nigerian languages + accents).

    const resp = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
      method: "POST",
      headers: { "xi-api-key": ELEVENLABS_API_KEY },
      body: form,
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error("ElevenLabs error", resp.status, errText);
      return json(
        { error: "We couldn't transcribe this file. Please try again." },
        502
      );
    }

    const result = await resp.json();
    const transcription = (result?.text ?? "").trim();

    if (!transcription) {
      return json({ error: "No speech was detected in this file." }, 200);
    }

    // --- Persist for reuse ---
    await admin
      .from("chat_messages")
      .update({ transcription })
      .eq("id", messageId);

    return json({ transcription, language: result?.language_code ?? null });
  } catch (e) {
    console.error("transcribe-chat-media fatal", e);
    return json({ error: "Unexpected error during transcription." }, 500);
  }
});

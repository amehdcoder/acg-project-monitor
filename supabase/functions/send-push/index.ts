import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import webpush from "npm:web-push@3.6.7";

const VAPID_PUBLIC_KEY =
  "BKYN8xNQ6kIcm1Jg_7J9j7TFBFf4A7um_Yegz2ZkVPllgZCD1XrCBaHACeaeBgg3yFm3TuYVQkimGR2hVXd7Cao";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!;

webpush.setVapidDetails(
  "mailto:support@amehnities.org",
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY,
);

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false },
});

function displayName(p: any): string {
  if (!p) return "Someone";
  const full = `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim();
  return full || p.email || "Someone";
}

async function sendToUsers(
  userIds: string[],
  payload: Record<string, unknown>,
) {
  if (userIds.length === 0) return;
  const { data: subs } = await admin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .in("user_id", userIds);

  if (!subs || subs.length === 0) return;

  const body = JSON.stringify(payload);
  await Promise.all(
    subs.map(async (s: any) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          body,
        );
      } catch (err: any) {
        const code = err?.statusCode;
        // Subscription gone — clean it up.
        if (code === 404 || code === 410) {
          await admin.from("push_subscriptions").delete().eq("id", s.id);
        } else {
          console.error("push error", code, err?.message);
        }
      }
    }),
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { type, message_id } = await req.json();
    if (!message_id || !["group", "direct"].includes(type)) {
      return new Response(JSON.stringify({ error: "bad request" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (type === "group") {
      const { data: msg } = await admin
        .from("chat_messages")
        .select("id, chat_group_id, sender_id, content, attachment_type")
        .eq("id", message_id)
        .single();
      if (!msg) return ok();

      const { data: group } = await admin
        .from("chat_groups")
        .select("name")
        .eq("id", msg.chat_group_id)
        .single();

      const { data: sender } = await admin
        .from("profiles")
        .select("first_name, last_name, email")
        .eq("user_id", msg.sender_id)
        .single();

      const { data: membersData } = await admin
        .from("chat_group_members")
        .select("user_id")
        .eq("chat_group_id", msg.chat_group_id)
        .neq("user_id", msg.sender_id);

      const recipients = (membersData ?? []).map((m: any) => m.user_id);
      const preview = msg.content?.trim()
        ? msg.content.trim()
        : msg.attachment_type
        ? "📎 Attachment"
        : "New message";

      await sendToUsers(recipients, {
        title: group?.name ?? "New message",
        body: `${displayName(sender)}: ${preview}`,
        tag: `group-${msg.chat_group_id}`,
        url: `/?tab=project-chat`,
      });
      return ok();
    }

    // direct (proximity)
    const { data: msg } = await admin
      .from("proximity_messages")
      .select("id, sender_id, recipient_id, body")
      .eq("id", message_id)
      .single();
    if (!msg || !msg.recipient_id) return ok();

    const { data: sender } = await admin
      .from("profiles")
      .select("first_name, last_name, email")
      .eq("user_id", msg.sender_id)
      .single();

    await sendToUsers([msg.recipient_id], {
      title: displayName(sender),
      body: msg.body?.trim() || "New message",
      tag: `direct-${msg.sender_id}`,
      url: `/?tab=project-chat`,
    });
    return ok();
  } catch (err: any) {
    console.error("send-push error", err?.message);
    return new Response(JSON.stringify({ error: err?.message ?? "error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function ok() {
  return new Response(JSON.stringify({ ok: true }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

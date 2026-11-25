// Calls send-email-smtp (info@amehnities.org) from another function using the
// shared worker secret, which its guard accepts for server-to-server calls.
export async function invokeSmtp(opts: { body: Record<string, unknown> }): Promise<{ data: unknown; error: { message: string } | null }> {
  const res = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-email-smtp`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-worker-secret": Deno.env.get("CRON_SECRET") ?? "" },
    body: JSON.stringify(opts.body),
  });
  const text = await res.text();
  let data: unknown = null;
  try { data = JSON.parse(text); } catch { data = text; }
  return { data, error: res.ok ? null : { message: `send-email-smtp ${res.status}: ${text.slice(0, 300)}` } };
}

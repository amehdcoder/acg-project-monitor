import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const GATEWAY = "https://connector-gateway.lovable.dev";

interface Body {
  formId?: string;
  formName?: string;
  spreadsheetId?: string | null;
  lookerStudioUrl?: string | null;
  notifyEmail?: string | null;
}

function flattenQuestions(questions: unknown): Array<{ id: string; label: string; name?: string }> {
  const out: Array<{ id: string; label: string; name?: string }> = [];
  if (Array.isArray(questions)) {
    for (const g of questions) {
      const qs = (g as { questions?: unknown[] })?.questions;
      if (Array.isArray(qs)) {
        for (const q of qs) {
          const qq = q as { id: string; label?: string; name?: string };
          out.push({ id: qq.id, label: qq.label || qq.name || qq.id, name: qq.name });
        }
      }
    }
  }
  return out;
}

function b64url(s: string): string {
  return btoa(unescape(encodeURIComponent(s))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify the caller is authenticated.
    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await authClient.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = (await req.json()) as Body;
    if (!body.formId) {
      return new Response(JSON.stringify({ error: "formId is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: form } = await admin
      .from("forms")
      .select("id,name,questions")
      .eq("id", body.formId)
      .maybeSingle();
    if (!form) {
      return new Response(JSON.stringify({ error: "Form not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: subs } = await admin
      .from("form_submissions")
      .select("id,data,submitted_at,created_at")
      .eq("form_id", body.formId)
      .order("created_at", { ascending: true })
      .limit(5000);

    const cols = flattenQuestions((form as { questions: unknown }).questions);
    const header = ["Submission ID", "Submitted at", ...cols.map((c) => c.label)];
    const rows = (subs || []).map((s) => {
      const data = (s.data || {}) as Record<string, unknown>;
      return [
        s.id,
        s.submitted_at || s.created_at,
        ...cols.map((c) => {
          const v = data[c.id];
          if (v == null) return "";
          return Array.isArray(v) ? v.join(", ") : String(v);
        }),
      ];
    });

    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    const sheetsKey = Deno.env.get("GOOGLE_SHEETS_API_KEY");
    const gmailKey = Deno.env.get("GOOGLE_MAIL_API_KEY");

    let sheetRows: number | null = null;
    let emailed = false;
    const notes: string[] = [];

    // ---- Push to Google Sheets ----
    if (body.spreadsheetId) {
      if (!lovableKey || !sheetsKey) {
        notes.push("Google Sheets connection not linked — skipped sheet sync.");
      } else {
        const range = "Sheet1!A1";
        const url = `${GATEWAY}/google_sheets/v4/spreadsheets/${body.spreadsheetId}/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=OVERWRITE`;
        // Clear then append header + rows for an authoritative snapshot.
        const clearUrl = `${GATEWAY}/google_sheets/v4/spreadsheets/${body.spreadsheetId}/values/Sheet1!A1:ZZ100000:clear`;
        await fetch(clearUrl, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${lovableKey}`,
            "X-Connection-Api-Key": sheetsKey,
            "Content-Type": "application/json",
          },
        });
        const resp = await fetch(url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${lovableKey}`,
            "X-Connection-Api-Key": sheetsKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ values: [header, ...rows] }),
        });
        if (!resp.ok) {
          const t = await resp.text();
          notes.push(`Sheets sync failed (${resp.status}): ${t.slice(0, 200)}`);
        } else {
          sheetRows = rows.length;
        }
      }
    }

    // ---- Email Looker Studio link via Gmail ----
    if (body.notifyEmail) {
      if (!lovableKey || !gmailKey) {
        notes.push("Gmail connection not linked — skipped email.");
      } else {
        const subject = `[${body.formName || form.name}] Dashboard update — ${rows.length} submissions`;
        const lookerLine = body.lookerStudioUrl
          ? `\n\nOpen the live Looker Studio dashboard:\n${body.lookerStudioUrl}`
          : "";
        const sheetLine = body.spreadsheetId
          ? `\n\nGoogle Sheet data source:\nhttps://docs.google.com/spreadsheets/d/${body.spreadsheetId}/edit`
          : "";
        const text = `Hello,\n\nThe "${body.formName || form.name}" special form now has ${rows.length} submission(s).${sheetLine}${lookerLine}\n\n— Amehnities`;
        const raw = b64url(
          [
            `To: ${body.notifyEmail}`,
            `Subject: ${subject}`,
            'Content-Type: text/plain; charset="UTF-8"',
            "",
            text,
          ].join("\r\n"),
        );
        const resp = await fetch(`${GATEWAY}/google_mail/gmail/v1/users/me/messages/send`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${lovableKey}`,
            "X-Connection-Api-Key": gmailKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ raw }),
        });
        if (!resp.ok) {
          const t = await resp.text();
          notes.push(`Email failed (${resp.status}): ${t.slice(0, 200)}`);
        } else {
          emailed = true;
        }
      }
    }

    const message =
      notes.length > 0
        ? notes.join(" ")
        : `Synced ${sheetRows ?? 0} rows${emailed ? " and sent the email" : ""}.`;

    return new Response(JSON.stringify({ sheetRows, emailed, message }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// Public, no-login submission endpoint for the Community-based Complaints and
// Feedback Form (CCFF). Validates the payload, confirms the project exists,
// generates a human-readable reference, and inserts via the service role so
// no account or session is required.

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders as baseCors } from "npm:@supabase/supabase-js@2/cors";

const corsHeaders = {
  ...baseCors,
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

const CATEGORIES = new Set([
  "service_quality",
  "staff_conduct",
  "medicine_supply",
  "exclusion_inclusion",
  "safety_dignity",
  "corruption_diversion",
  "data_privacy",
  "appreciation",
  "suggestion",
  "other",
]);

const SEVERITIES = new Set(["standard", "serious", "sensitive"]);

const clean = (v: unknown, max = 500): string | null => {
  if (typeof v !== "string") return null;
  const t = v.trim().slice(0, max);
  return t.length ? t : null;
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid request body" }, 400);
  }

  const projectId = clean(body.project_id, 64);
  const category = clean(body.category, 40);
  const message = clean(body.message, 4000);
  if (!projectId || !category || !message) {
    return json({ error: "Project, category and message are required" }, 400);
  }
  if (!CATEGORIES.has(category)) return json({ error: "Unknown category" }, 400);
  if (message.length < 10) return json({ error: "Please provide a little more detail" }, 400);

  const severity = SEVERITIES.has(String(body.severity)) ? String(body.severity) : "standard";
  const isAnonymous = body.is_anonymous === true;
  const consent = body.consent_given === true;
  if (!consent) return json({ error: "Consent is required" }, 400);

  // Confirm the project exists before accepting a report for it.
  const { data: project, error: pErr } = await supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .maybeSingle();
  if (pErr || !project) return json({ error: "Unknown project" }, 404);

  const reference = `CCFF-${Date.now().toString(36).toUpperCase()}-${Math.random()
    .toString(36)
    .slice(2, 6)
    .toUpperCase()}`;

  const { error } = await supabase.from("project_feedback").insert({
    project_id: projectId,
    reference,
    category,
    severity,
    message,
    community: clean(body.community, 120),
    ward: clean(body.ward, 120),
    lga: clean(body.lga, 120),
    state: clean(body.state, 120),
    is_anonymous: isAnonymous,
    reporter_name: isAnonymous ? null : clean(body.reporter_name, 120),
    reporter_phone: isAnonymous ? null : clean(body.reporter_phone, 40),
    reporter_email: isAnonymous ? null : clean(body.reporter_email, 160),
    preferred_contact: isAnonymous ? null : clean(body.preferred_contact, 40),
    consent_given: true,
  });

  if (error) {
    console.error("feedback insert failed", error);
    return json({ error: "Could not save your report. Please try again." }, 500);
  }

  return json({ ok: true, reference });
});

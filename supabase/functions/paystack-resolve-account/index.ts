// Resolves a Nigerian bank account name via Paystack's Resolve Account API.
// Called from the UPRP form once a valid 10-digit NUBAN + bank code are present.
// Returns the official account name so the field worker can confirm the payee
// before proceeding. No data is stored here — this is a read-only lookup.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const PAYSTACK_SECRET_KEY = Deno.env.get("PAYSTACK_SECRET_KEY");
    if (!PAYSTACK_SECRET_KEY) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "Account verification is not configured. Please contact an administrator.",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { account_number, bank_code } = await req.json();

    const acct = String(account_number || "").replace(/\D/g, "");
    const code = String(bank_code || "").trim();

    if (acct.length !== 10) {
      return new Response(
        JSON.stringify({ ok: false, error: "A valid 10-digit account number is required." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (!code) {
      return new Response(
        JSON.stringify({ ok: false, error: "A bank code is required to verify the account." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const url = `https://api.paystack.co/bank/resolve?account_number=${encodeURIComponent(acct)}&bank_code=${encodeURIComponent(code)}`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
    });

    const body = await res.json().catch(() => null);

    if (!res.ok || !body?.status) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: body?.message || "Could not verify this account. Check the number and bank, then try again.",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({
        ok: true,
        account_name: body.data?.account_name ?? "",
        account_number: body.data?.account_number ?? acct,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: (e as Error).message || "Unexpected error verifying account." }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

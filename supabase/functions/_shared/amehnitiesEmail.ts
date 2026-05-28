// Branded HTML email layout for Amehnities. Used by welcome + follow-up emails.

const BRAND = "Amehnities";
const PRIMARY = "#0F766E"; // teal
const ACCENT = "#B45309"; // amber
const BG = "#ffffff";
const TEXT = "#1f2937";
const MUTED = "#6b7280";
const SITE_URL = "https://www.amehnities.org";
const SIGNATURE_URL = "https://www.amehnities.org/ceo-signature.png";

export function renderBrandEmail(opts: {
  heading: string;
  intro: string;
  body: string; // raw HTML allowed
  ctaLabel?: string;
  ctaUrl?: string;
  closing?: string;
}): string {
  const { heading, intro, body, ctaLabel, ctaUrl, closing } = opts;
  const cta = ctaLabel && ctaUrl
    ? `<tr><td align="left" style="padding: 8px 0 24px;">
        <a href="${ctaUrl}" style="background:${PRIMARY};color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;display:inline-block;font-weight:600;font-family:Arial,sans-serif;">${ctaLabel}</a>
      </td></tr>`
    : "";

  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:${BG};color:${TEXT};font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BG};">
    <tr><td align="center" style="padding:24px 12px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
        <tr><td style="background:linear-gradient(90deg, ${PRIMARY}, ${ACCENT});padding:18px 24px;color:#ffffff;">
          <div style="font-size:20px;font-weight:700;letter-spacing:.3px;">${BRAND}</div>
          <div style="font-size:12px;opacity:.9;">Public Health Monitoring &amp; Field Intelligence</div>
        </td></tr>
        <tr><td style="padding:28px 28px 8px;">
          <h1 style="margin:0 0 8px;font-size:22px;color:${TEXT};">${heading}</h1>
          <p style="margin:0 0 16px;font-size:15px;color:${MUTED};line-height:1.5;">${intro}</p>
        </td></tr>
        <tr><td style="padding:0 28px 8px;font-size:15px;color:${TEXT};line-height:1.6;">${body}</td></tr>
        ${cta}
        <tr><td style="padding:8px 28px 4px;font-size:15px;color:${TEXT};line-height:1.6;">
          ${closing ?? "Welcome aboard, and thank you for the work you do."}
        </td></tr>
        <tr><td style="padding:4px 28px 24px;">
          <div style="margin-top:8px;font-size:14px;color:${TEXT};">With appreciation,</div>
          <img src="${SIGNATURE_URL}" alt="Signature" width="150" style="display:block;margin:6px 0;border:0;outline:none;text-decoration:none;height:auto;" />
          <div style="font-size:14px;color:${TEXT};font-weight:700;">Ameh Ojoh Joseph</div>
          <div style="font-size:13px;color:${MUTED};">Chief Executive Officer, ${BRAND}</div>
        </td></tr>
        <tr><td style="background:#f9fafb;padding:14px 24px;font-size:11px;color:${MUTED};text-align:center;border-top:1px solid #e5e7eb;">
          &copy; ${new Date().getFullYear()} ${BRAND} &middot; <a href="${SITE_URL}" style="color:${MUTED};">${SITE_URL.replace("https://", "")}</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

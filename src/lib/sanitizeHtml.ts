import DOMPurify from "dompurify";

/**
 * Sanitize admin-authored HTML (form labels, hints, group/section titles)
 * before rendering with dangerouslySetInnerHTML. Prevents stored XSS from
 * malicious or compromised form content.
 */
export function sanitizeHtml(input: unknown): string {
  if (input == null) return "";
  return DOMPurify.sanitize(String(input), {
    USE_PROFILES: { html: true },
  });
}

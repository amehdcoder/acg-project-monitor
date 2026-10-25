/** Extract enrollment details without navigating to an untrusted QR URL. */
export function parseProjectQr(text: string): { code: string; pin?: string } | null {
  const value = text.trim();
  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol) || url.pathname !== '/join') return null;
    const code = url.searchParams.get('code')?.trim().toUpperCase();
    if (!code || !/^[A-Z0-9-]{4,64}$/.test(code)) return null;
    return { code, pin: url.searchParams.get('pin') || undefined };
  } catch {
    return /^[A-Z0-9-]{4,64}$/i.test(value) ? { code: value.toUpperCase() } : null;
  }
}
// Minimal, robust SMTP-over-TLS client using Deno native APIs.
//
// We deliberately do NOT use denomailer: on the Supabase edge runtime its
// 1.6.0 DATA-mode handling throws an uncatchable event-loop error
// ("invalid cmd" / "connection not recoverable") that crashes the isolate and
// surfaces to callers as an opaque non-2xx response. This implementation speaks
// SMTP directly so every failure is a catchable Error with a clear message.

export interface SmtpMessage {
  from: string; // "Name <addr@domain>" or "addr@domain"
  fromAddress: string; // bare address used in MAIL FROM
  to: string; // bare recipient address
  subject: string;
  html?: string;
  text?: string;
}

export interface SmtpConfig {
  hostname: string;
  port: number;
  username: string;
  password: string;
  timeoutMs?: number;
}

function b64(s: string): string {
  return btoa(unescape(encodeURIComponent(s)));
}

function encodeHeaderWord(s: string): string {
  // RFC 2047 encode non-ASCII header values (e.g. subjects / display names).
  // eslint-disable-next-line no-control-regex
  if (/^[\x00-\x7F]*$/.test(s)) return s;
  return `=?UTF-8?B?${b64(s)}?=`;
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`SMTP timeout (${label}) after ${ms}ms`)), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

export async function sendMailRaw(cfg: SmtpConfig, msg: SmtpMessage): Promise<void> {
  const timeoutMs = cfg.timeoutMs ?? 20_000;
  const enc = new TextEncoder();
  const dec = new TextDecoder();

  const conn = await withTimeout(
    Deno.connectTls({ hostname: cfg.hostname, port: cfg.port }),
    timeoutMs,
    "connect",
  );

  let buffer = "";
  const readBuf = new Uint8Array(4096);

  async function readResponse(expected: number): Promise<string> {
    // SMTP multi-line replies use "250-" continuation and "250 " final line.
    while (true) {
      const idx = buffer.indexOf("\n");
      if (idx >= 0) {
        // Try to detect a complete reply (last line has a space after the code).
        const lines = buffer.split(/\r?\n/).filter((l) => l.length > 0);
        const last = lines[lines.length - 1];
        if (last && /^\d{3} /.test(last)) {
          const code = parseInt(last.slice(0, 3), 10);
          const full = buffer;
          buffer = "";
          if (code !== expected) {
            throw new Error(`SMTP expected ${expected} but got: ${full.trim()}`);
          }
          return full;
        }
      }
      const n = await withTimeout(conn.read(readBuf), timeoutMs, "read");
      if (n === null) throw new Error("SMTP connection closed unexpectedly");
      buffer += dec.decode(readBuf.subarray(0, n));
    }
  }

  async function write(cmd: string): Promise<void> {
    await withTimeout(conn.write(enc.encode(cmd)), timeoutMs, "write");
  }

  try {
    await readResponse(220); // greeting
    await write(`EHLO amehnities.org\r\n`);
    await readResponse(250);

    await write(`AUTH LOGIN\r\n`);
    await readResponse(334);
    await write(`${b64(cfg.username)}\r\n`);
    await readResponse(334);
    await write(`${b64(cfg.password)}\r\n`);
    await readResponse(235); // auth success

    await write(`MAIL FROM:<${msg.fromAddress}>\r\n`);
    await readResponse(250);
    await write(`RCPT TO:<${msg.to}>\r\n`);
    await readResponse(250);
    await write(`DATA\r\n`);
    await readResponse(354);

    const date = new Date().toUTCString();
    const boundary = `=_amh_${crypto.randomUUID().replace(/-/g, "")}`;
    const headers = [
      `From: ${msg.from}`,
      `To: <${msg.to}>`,
      `Subject: ${encodeHeaderWord(msg.subject)}`,
      `Date: ${date}`,
      `MIME-Version: 1.0`,
    ];

    let body: string;
    if (msg.html && msg.text) {
      headers.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
      body =
        `--${boundary}\r\n` +
        `Content-Type: text/plain; charset=UTF-8\r\n` +
        `Content-Transfer-Encoding: 8bit\r\n\r\n${msg.text}\r\n` +
        `--${boundary}\r\n` +
        `Content-Type: text/html; charset=UTF-8\r\n` +
        `Content-Transfer-Encoding: 8bit\r\n\r\n${msg.html}\r\n` +
        `--${boundary}--`;
    } else if (msg.html) {
      headers.push(`Content-Type: text/html; charset=UTF-8`);
      headers.push(`Content-Transfer-Encoding: 8bit`);
      body = msg.html;
    } else {
      headers.push(`Content-Type: text/plain; charset=UTF-8`);
      headers.push(`Content-Transfer-Encoding: 8bit`);
      body = msg.text ?? "";
    }

    // Dot-stuffing: lines beginning with "." must be escaped as "..".
    const normalizedBody = body.replace(/\r?\n/g, "\r\n").replace(/^\./gm, "..");
    const payload = `${headers.join("\r\n")}\r\n\r\n${normalizedBody}\r\n.\r\n`;
    await write(payload);
    await readResponse(250); // message accepted

    try {
      await write(`QUIT\r\n`);
      await readResponse(221);
    } catch (_) { /* QUIT response is best-effort */ }
  } finally {
    try { conn.close(); } catch (_) { /* ignore */ }
  }
}

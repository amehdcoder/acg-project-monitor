/**
 * Satellite Packet Encoder
 * 
 * Compresses form submissions into ~140-300 byte packets suitable for
 * Direct-to-Cell (Starlink/AST SpaceMobile) low-bandwidth transmission.
 * 
 * Strategy:
 * 1. Replace question IDs with short numeric indices from form schema
 * 2. Drop null/empty values
 * 3. Quantize numbers (lat/lng to 5 decimal places)
 * 4. Truncate long text (preserve first 80 chars)
 * 5. Pack as compact JSON, then base64 + URL-safe
 * 
 * Strip media (images/audio/video) — these are too large for satellite.
 * They sync separately when the device gets full network connectivity.
 */

import type { Question } from "@/components/FormBuilder/types";

export interface SatPacket {
  v: number;          // protocol version
  s: string;          // submission id (short - last 12 chars of UUID)
  f: string;          // form id (short - last 12 chars)
  u: string;          // user id (short - last 12 chars)
  t: number;          // timestamp (unix seconds)
  l?: [number, number]; // [lat, lng] quantized
  g?: 1 | 0;          // within geofence
  d: Record<string, any>; // data with field-id keys (q0, q1, q2...)
  m?: string[];       // hash references for media (synced separately)
}

const MEDIA_TYPES = new Set(["image", "audio", "video", "signature", "photo"]);
const MAX_TEXT_LEN = 80;

/**
 * Build a field-ID map: question.id -> "q0", "q1", "q2"...
 */
export function buildFieldMap(questions: Question[]): Record<string, string> {
  const map: Record<string, string> = {};
  questions.forEach((q, idx) => {
    map[q.id] = `q${idx}`;
  });
  return map;
}

/**
 * Reverse map: short id -> full question id
 */
export function reverseFieldMap(questions: Question[]): Record<string, string> {
  const map: Record<string, string> = {};
  questions.forEach((q, idx) => {
    map[`q${idx}`] = q.id;
  });
  return map;
}

/**
 * Quantize a number to N decimal places (saves bytes)
 */
function quantize(n: number, decimals = 5): number {
  const f = Math.pow(10, decimals);
  return Math.round(n * f) / f;
}

/**
 * Encode submission into a satellite packet
 */
export function encodeSatPacket(
  submission: {
    id: string;
    form_id: string;
    user_id: string;
    data: Record<string, any>;
    location: { lat: number; lng: number } | null;
    within_geofence: boolean | null;
    created_at: string;
  },
  questions: Question[]
): { packet: SatPacket; mediaRefs: string[]; bytes: number } {
  const fieldMap = buildFieldMap(questions);
  const compactData: Record<string, any> = {};
  const mediaRefs: string[] = [];

  // Build a question type lookup
  const typeMap = new Map<string, string>();
  questions.forEach((q) => typeMap.set(q.id, q.type));

  for (const [key, value] of Object.entries(submission.data || {})) {
    if (value === null || value === undefined || value === "") continue;

    const shortKey = fieldMap[key] || key.substring(0, 4);
    const qType = typeMap.get(key) || "text";

    // Strip media — track refs only
    if (MEDIA_TYPES.has(qType)) {
      const ref = typeof value === "string" ? value.substring(0, 16) : "media";
      mediaRefs.push(`${shortKey}:${ref}`);
      continue;
    }

    // Truncate long strings
    if (typeof value === "string" && value.length > MAX_TEXT_LEN) {
      compactData[shortKey] = value.substring(0, MAX_TEXT_LEN);
      continue;
    }

    // Quantize numbers
    if (typeof value === "number") {
      compactData[shortKey] = quantize(value, 4);
      continue;
    }

    compactData[shortKey] = value;
  }

  const packet: SatPacket = {
    v: 1,
    s: submission.id.replace(/-/g, "").substring(0, 12),
    f: submission.form_id.replace(/-/g, "").substring(0, 12),
    u: submission.user_id.replace(/-/g, "").substring(0, 12),
    t: Math.floor(new Date(submission.created_at).getTime() / 1000),
    d: compactData,
  };

  if (submission.location) {
    packet.l = [quantize(submission.location.lat), quantize(submission.location.lng)];
  }
  if (submission.within_geofence !== null) {
    packet.g = submission.within_geofence ? 1 : 0;
  }
  if (mediaRefs.length > 0) {
    packet.m = mediaRefs;
  }

  const json = JSON.stringify(packet);
  const bytes = new TextEncoder().encode(json).length;

  return { packet, mediaRefs, bytes };
}

/**
 * Encode multiple packets into a single batched transmission.
 * Format: base64(JSON array of packets) — small enough for SMS-class payload.
 */
export function encodeBatch(packets: SatPacket[]): { payload: string; bytes: number } {
  const json = JSON.stringify(packets);
  const payload = btoa(unescape(encodeURIComponent(json)));
  const bytes = new TextEncoder().encode(payload).length;
  return { payload, bytes };
}

/**
 * Decode a batch (used server-side and for verification)
 */
export function decodeBatch(payload: string): SatPacket[] {
  const json = decodeURIComponent(escape(atob(payload)));
  return JSON.parse(json);
}

/**
 * Estimate byte savings vs full submission
 */
export function estimateSavings(
  submission: { data: Record<string, any>; location: any; within_geofence: any },
  packetBytes: number
): { originalBytes: number; savedBytes: number; reduction: number } {
  const originalBytes = new TextEncoder().encode(JSON.stringify(submission)).length;
  const savedBytes = Math.max(0, originalBytes - packetBytes);
  const reduction = originalBytes > 0 ? Math.round((savedBytes / originalBytes) * 100) : 0;
  return { originalBytes, savedBytes, reduction };
}

/**
 * Detect if device is on a low-bandwidth / satellite-class connection.
 */
export function detectLowBandwidth(): {
  isLowBandwidth: boolean;
  effectiveType: string;
  signalLabel: string;
} {
  const conn =
    (navigator as any).connection ||
    (navigator as any).mozConnection ||
    (navigator as any).webkitConnection;

  if (!conn) {
    return { isLowBandwidth: false, effectiveType: "unknown", signalLabel: "Unknown" };
  }

  const eff = conn.effectiveType || "unknown";
  // 'slow-2g' / '2g' = candidate for satellite/low-band routing
  const isLow = eff === "slow-2g" || eff === "2g" || conn.downlink < 0.1;
  const labels: Record<string, string> = {
    "slow-2g": "Critical (Satellite)",
    "2g": "Very Weak (2G/Satellite)",
    "3g": "Weak (3G)",
    "4g": "Strong (4G/LTE)",
    "5g": "Excellent (5G)",
  };

  return {
    isLowBandwidth: isLow,
    effectiveType: eff,
    signalLabel: labels[eff] || "Unknown",
  };
}

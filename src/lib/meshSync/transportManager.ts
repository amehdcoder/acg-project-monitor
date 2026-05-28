/**
 * Mesh Sync Transport Manager
 *
 * Picks the best transport for a given payload + network condition.
 *
 *   1. WiFi-Direct + WebRTC LAN  – default for >5KB, peer-to-peer.
 *   2. Server relay              – when ConnectivityManager sees any internet.
 *   3. BLE beacon                – only for records < 5KB (tiny status/header).
 */

export type Transport = "webrtc_lan" | "server_relay" | "ble_beacon";

export interface NetworkState {
  online: boolean;            // navigator.onLine
  lanPeers: number;           // peers visible via WebRTC/WiFi-Direct discovery
  blePeers: number;           // BLE peers in range
  preferred?: Transport;      // user override
}

export const BLE_MAX_BYTES = 5 * 1024;          // 5 KB
export const RELAY_CHUNK_BYTES = 256 * 1024;    // 256 KB

export function pickTransport(payloadBytes: number, net: NetworkState): Transport {
  if (net.preferred) return net.preferred;

  // Tiny records can ride BLE if peers are nearby (no internet needed)
  if (payloadBytes <= BLE_MAX_BYTES && net.blePeers > 0 && !net.online) {
    return "ble_beacon";
  }

  // LAN peers available -> WebRTC (works without internet)
  if (net.lanPeers > 0) return "webrtc_lan";

  // Fall back to server relay when online
  if (net.online) return "server_relay";

  // Best-effort: try BLE for small payloads, otherwise queue (caller waits)
  if (payloadBytes <= BLE_MAX_BYTES && net.blePeers > 0) return "ble_beacon";

  // Nothing available; caller should queue
  return "server_relay";
}

export function estimateBytes(obj: unknown): number {
  try {
    return new Blob([JSON.stringify(obj)]).size;
  } catch {
    return Number.MAX_SAFE_INTEGER;
  }
}

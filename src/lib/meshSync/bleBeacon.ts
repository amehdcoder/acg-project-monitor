/**
 * BLE beacon transport — Web Bluetooth.
 *
 * Used ONLY for tiny payloads (< 5 KB), typically heartbeats and tiny
 * status records. Most browsers (especially iOS) do not allow real
 * advertising; we use the request/scan pattern that is broadly available.
 *
 * Falls back gracefully where Web Bluetooth is unavailable.
 */

export type BleStatus = "unsupported" | "idle" | "scanning" | "connected" | "error";

export interface BleBeaconState {
  status: BleStatus;
  lastSeen?: { id: string; rssi?: number; at: number };
  error?: string;
}

export function bleSupported(): boolean {
  return typeof navigator !== "undefined" && "bluetooth" in navigator;
}

/** A tiny 20-byte beacon record. */
export interface BeaconRecord {
  recordId: string;   // 16 bytes (UUID without dashes is fine; we hash to short)
  status: number;     // 0..255
}

const SERVICE_UUID = "0000fe2c-0000-1000-8000-00805f9b34fb"; // Google's "Eddystone-like" placeholder

export async function scanForPeers(onPeer: (b: BeaconRecord) => void): Promise<() => void> {
  if (!bleSupported()) throw new Error("Web Bluetooth not supported on this device.");
  // Request a single device the user explicitly picks. Continuous background
  // scanning is not generally available in browsers without flags.
  const device = await (navigator as any).bluetooth.requestDevice({
    acceptAllDevices: true,
    optionalServices: [SERVICE_UUID],
  });
  const server = await device.gatt?.connect();
  if (!server) throw new Error("Could not connect to peer GATT server.");

  try {
    const svc = await server.getPrimaryService(SERVICE_UUID);
    const ch = await svc.getCharacteristic(SERVICE_UUID);
    await ch.startNotifications();
    const handler = (ev: any) => {
      const v = ev.target.value as DataView;
      const bytes = new Uint8Array(v.buffer);
      const id = Array.from(bytes.slice(0, 16))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      const status = bytes[16] ?? 0;
      onPeer({ recordId: id, status });
    };
    ch.addEventListener("characteristicvaluechanged", handler);
    return () => {
      ch.removeEventListener("characteristicvaluechanged", handler);
      device.gatt?.disconnect();
    };
  } catch (e) {
    device.gatt?.disconnect();
    throw e;
  }
}

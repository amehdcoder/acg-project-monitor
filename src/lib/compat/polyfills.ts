// Cross-device compatibility polyfills.
//
// Some Android WebViews / older in-app browsers (e.g. on Infinix, Tecno and
// other budget devices that ship an outdated System WebView) do not implement
// newer browser APIs. When the app calls one of these during render — most
// commonly `crypto.randomUUID()` inside a `useRef` initialiser — the missing
// API throws synchronously and React unmounts the whole tree, producing the
// "Something went wrong" recovery screen for that user only.
//
// This module installs minimal, spec-compatible fallbacks. It must run BEFORE
// any application/React code executes, so it is imported first in main.tsx.

function installRandomUUID() {
  const g: any = globalThis as any;
  // Ensure a crypto object exists at all (very old / non-secure contexts).
  if (!g.crypto) {
    g.crypto = {};
  }
  const cryptoObj = g.crypto;

  // Provide getRandomValues if missing (needed by the UUID fallback below).
  if (typeof cryptoObj.getRandomValues !== "function") {
    cryptoObj.getRandomValues = (arr: any) => {
      for (let i = 0; i < arr.length; i++) {
        arr[i] = Math.floor(Math.random() * 256);
      }
      return arr;
    };
  }

  if (typeof cryptoObj.randomUUID !== "function") {
    cryptoObj.randomUUID = (): string => {
      // RFC 4122 v4 UUID built from getRandomValues (or the Math.random
      // fallback installed above).
      const bytes = new Uint8Array(16);
      cryptoObj.getRandomValues(bytes);
      // Per spec: set version (4) and variant (10xx) bits.
      bytes[6] = (bytes[6] & 0x0f) | 0x40;
      bytes[8] = (bytes[8] & 0x3f) | 0x80;
      const hex: string[] = [];
      for (let i = 0; i < 256; i++) {
        hex.push((i + 0x100).toString(16).slice(1));
      }
      return (
        hex[bytes[0]] + hex[bytes[1]] + hex[bytes[2]] + hex[bytes[3]] + "-" +
        hex[bytes[4]] + hex[bytes[5]] + "-" +
        hex[bytes[6]] + hex[bytes[7]] + "-" +
        hex[bytes[8]] + hex[bytes[9]] + "-" +
        hex[bytes[10]] + hex[bytes[11]] + hex[bytes[12]] + hex[bytes[13]] + hex[bytes[14]] + hex[bytes[15]]
      );
    };
  }
}

export function installCompatPolyfills() {
  try {
    installRandomUUID();
  } catch {
    /* never let a polyfill failure break boot */
  }
}

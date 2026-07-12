import { createContext, useCallback, useContext, useEffect, useState } from "react";

// Local, per-device toggle: "Bypass Strict Microplan Filtering".
// When ON, reference-location pickers expose the full master index of adjacent
// LGAs / communities cached on the device, letting a supervisor capture data
// for unassigned regions instantly while offline. Persisted so the choice
// survives reloads; never leaves the device.

const STORAGE_KEY = "amehnities_bypass_strict_filtering";

function read(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function write(v: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, v ? "1" : "0");
  } catch {
    /* ignore */
  }
  // notify same-tab listeners (storage event only fires cross-tab)
  window.dispatchEvent(new CustomEvent("amehnities:bypass-filtering", { detail: v }));
}

/**
 * Reactive hook for the strict-filtering bypass toggle. Any component reading
 * this stays in sync when the toggle flips anywhere in the app.
 */
export function useBypassStrictFiltering(): [boolean, (v: boolean) => void] {
  const [value, setValue] = useState<boolean>(read);

  useEffect(() => {
    const onChange = () => setValue(read());
    window.addEventListener("amehnities:bypass-filtering", onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener("amehnities:bypass-filtering", onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);

  const set = useCallback((v: boolean) => {
    write(v);
    setValue(v);
  }, []);

  return [value, set];
}

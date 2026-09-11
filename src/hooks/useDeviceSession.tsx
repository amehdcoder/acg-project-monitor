import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  clearDeviceSession,
  enrolDevice,
  readDeviceSession,
  refreshDeviceBundle,
  requestDurableStorage,
  type DeviceSession,
  type EnrolInput,
} from "@/lib/deviceSession";

interface DeviceSessionContextValue {
  session: DeviceSession | null;
  isDeviceMode: boolean;
  join: (input: EnrolInput) => Promise<DeviceSession>;
  leave: () => void;
  refresh: () => Promise<void>;
}

const DeviceSessionContext = createContext<DeviceSessionContextValue>({
  session: null,
  isDeviceMode: false,
  join: async () => {
    throw new Error("not_ready");
  },
  leave: () => {},
  refresh: async () => {},
});

export const DeviceSessionProvider = ({ children }: { children: React.ReactNode }) => {
  // Read synchronously so an offline cold boot never flashes a loading state.
  const [session, setSession] = useState<DeviceSession | null>(() => readDeviceSession());

  const refresh = useCallback(async () => {
    const current = readDeviceSession();
    if (!current) {
      setSession(null);
      return;
    }
    const next = await refreshDeviceBundle(current);
    setSession(next ?? (readDeviceSession() ? current : null));
  }, []);

  // Best-effort background refresh — never blocks the UI.
  useEffect(() => {
    if (!session) return;
    void refresh();
    const onOnline = () => void refresh();
    window.addEventListener("online", onOnline);
    const timer = window.setInterval(() => void refresh(), 15 * 60_000);
    return () => {
      window.removeEventListener("online", onOnline);
      window.clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.token]);

  const join = useCallback(async (input: EnrolInput) => {
    const next = await enrolDevice(input);
    setSession(next);
    return next;
  }, []);

  const leave = useCallback(() => {
    clearDeviceSession();
    setSession(null);
  }, []);

  const value = useMemo(
    () => ({ session, isDeviceMode: !!session, join, leave, refresh }),
    [session, join, leave, refresh],
  );

  return <DeviceSessionContext.Provider value={value}>{children}</DeviceSessionContext.Provider>;
};

export const useDeviceSession = () => useContext(DeviceSessionContext);

import { useEffect } from "react";
import { Navigate } from "react-router-dom";
import { useDeviceSession } from "@/hooks/useDeviceSession";
import DeviceCollectShell from "./DeviceCollectShell";
import DeviceMicroplanShell from "./DeviceMicroplanShell";

/** Shows the collector workspace, or sends the device to enrolment. */
const DeviceCollectRoute = () => {
  const { session, refresh } = useDeviceSession();
  // Pick up project setting changes (e.g. Geo Microplanning just enabled) immediately.
  useEffect(() => { void refresh(); }, [refresh]);
  if (!session) return <Navigate to="/join" replace />;
  // Microplanning projects are form-only: never fall back to the general workspace.
  if (session.allowMicroplanning || session.bundle?.microplanning) return <DeviceMicroplanShell />;
  return <DeviceCollectShell />;
};

export default DeviceCollectRoute;

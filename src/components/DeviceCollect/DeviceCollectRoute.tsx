import { Navigate } from "react-router-dom";
import { useDeviceSession } from "@/hooks/useDeviceSession";
import DeviceCollectShell from "./DeviceCollectShell";

/** Shows the collector workspace, or sends the device to enrolment. */
const DeviceCollectRoute = () => {
  const { session } = useDeviceSession();
  if (!session) return <Navigate to="/join" replace />;
  return <DeviceCollectShell />;
};

export default DeviceCollectRoute;

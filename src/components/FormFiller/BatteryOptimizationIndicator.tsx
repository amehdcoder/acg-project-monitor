import { useStationaryGeofence, StationaryGeofenceState } from "@/hooks/useStationaryGeofence";
import { Badge } from "@/components/ui/badge";
import { Battery, BatteryCharging, Zap, ZapOff } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface Props {
  state: StationaryGeofenceState;
}

const BatteryOptimizationIndicator = ({ state }: Props) => {
  const estimatedSavings = state.isStationary ? 85 : state.isHighPowerGPS ? 0 : 60;
  const gpsMode = state.isStationary ? "Low-Power" : state.isHighPowerGPS ? "High-Power" : "Standby";

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-muted/50 border border-border text-xs">
            {state.isStationary ? (
              <ZapOff className="h-3.5 w-3.5 text-green-500" />
            ) : (
              <Zap className="h-3.5 w-3.5 text-amber-500" />
            )}
            <span className="font-medium">
              {state.isStationary ? "Stationary" : "Moving"}
            </span>
            {state.batteryLevel !== null && (
              <Badge variant="outline" className="text-[10px] px-1 py-0 h-4">
                {state.batteryLevel > 20 ? (
                  <Battery className="h-3 w-3 mr-0.5 text-green-500" />
                ) : (
                  <BatteryCharging className="h-3 w-3 mr-0.5 text-red-500" />
                )}
                {state.batteryLevel}%
              </Badge>
            )}
            <Badge 
              variant={estimatedSavings > 50 ? "default" : "secondary"} 
              className="text-[10px] px-1 py-0 h-4"
            >
              ~{estimatedSavings}% saved
            </Badge>
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-[250px]">
          <div className="space-y-1 text-xs">
            <p className="font-semibold">GPS Battery Optimization</p>
            <p>Mode: <span className="font-medium">{gpsMode}</span></p>
            <p>GPS Interval: {state.isStationary ? "60s (low-power)" : state.isHighPowerGPS ? "5s (high-accuracy)" : "Paused"}</p>
            <p>Accelerometer: {state.accelerometerAvailable ? "Active" : "Unavailable"}</p>
            {state.lastMotionTime && (
              <p>Last motion: {new Date(state.lastMotionTime).toLocaleTimeString()}</p>
            )}
            <p className="text-muted-foreground pt-1">
              High-power GPS only activates when the accelerometer detects device movement, saving significant battery.
            </p>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

export default BatteryOptimizationIndicator;

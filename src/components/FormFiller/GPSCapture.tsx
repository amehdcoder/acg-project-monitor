import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  MapPin,
  Loader2,
  CheckCircle,
  XCircle,
  RefreshCw,
} from "lucide-react";
import useGeolocation, { GeolocationPosition } from "@/hooks/useGeolocation";
import { GeofenceValidationResult } from "@/hooks/useGeofenceValidation";

interface GPSCaptureProps {
  value: GeolocationPosition | null;
  onChange: (position: GeolocationPosition | null) => void;
  geofenceValidation?: GeofenceValidationResult | null;
  disabled?: boolean;
  required?: boolean;
  autoTrigger?: boolean;
}

const GPSCapture = ({
  value,
  onChange,
  geofenceValidation,
  disabled,
  autoTrigger,
}: GPSCaptureProps) => {
  const { position, error, isLoading, getCurrentPosition } = useGeolocation();
  const startedRef = useRef(false);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Update parent when position changes
  useEffect(() => {
    if (position && !value) {
      onChange(position);
    }
  }, [position, value, onChange]);

  // Auto-capture as soon as the question is mounted — no manual tap required.
  useEffect(() => {
    if (startedRef.current) return;
    if (value) return;
    startedRef.current = true;
    getCurrentPosition();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Voice command re-trigger
  useEffect(() => {
    if (autoTrigger && !value && !isLoading) {
      getCurrentPosition();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoTrigger]);

  // Silent retry: if acquisition surfaces an error, transparently retry every
  // 5s up to a few times instead of showing a scary "Locator Error" banner.
  useEffect(() => {
    if (!error || value || isLoading) {
      if (retryRef.current) {
        clearTimeout(retryRef.current);
        retryRef.current = null;
      }
      return;
    }
    retryRef.current = setTimeout(() => {
      getCurrentPosition();
    }, 5000);
    return () => {
      if (retryRef.current) {
        clearTimeout(retryRef.current);
        retryRef.current = null;
      }
    };
  }, [error, value, isLoading, getCurrentPosition]);

  const handleRefresh = () => {
    onChange(null);
    getCurrentPosition();
  };

  const formatAccuracy = (accuracy: number) => {
    if (accuracy < 10) return "Excellent";
    if (accuracy < 30) return "Good";
    if (accuracy < 100) return "Fair";
    return "Poor";
  };

  return (
    <Card className="border-border">
      <CardContent className="p-4 space-y-3">
        {value ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                  <MapPin className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium">Location Captured</p>
                  <p className="text-xs text-muted-foreground">
                    Accuracy: ±{Math.round(value.accuracy)}m ({formatAccuracy(value.accuracy)})
                  </p>
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={handleRefresh}
                disabled={disabled || isLoading}
              >
                <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-2 rounded-lg bg-muted/50 p-3">
              <div>
                <p className="text-xs text-muted-foreground">Latitude</p>
                <p className="text-sm font-mono">{value.lat.toFixed(6)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Longitude</p>
                <p className="text-sm font-mono">{value.lng.toFixed(6)}</p>
              </div>
              {value.altitude !== null && (
                <div className="col-span-2">
                  <p className="text-xs text-muted-foreground">Altitude</p>
                  <p className="text-sm font-mono">{Math.round(value.altitude)}m</p>
                </div>
              )}
            </div>

            {geofenceValidation && (
              <div
                className={`flex items-center gap-2 rounded-lg p-3 ${
                  geofenceValidation.isWithinGeofence
                    ? "bg-green-500/10"
                    : "bg-destructive/10"
                }`}
              >
                {geofenceValidation.isWithinGeofence ? (
                  <CheckCircle className="h-5 w-5 text-green-600" />
                ) : (
                  <XCircle className="h-5 w-5 text-destructive" />
                )}
                <div className="flex-1">
                  <p
                    className={`text-sm font-medium ${
                      geofenceValidation.isWithinGeofence
                        ? "text-green-700"
                        : "text-destructive"
                    }`}
                  >
                    {geofenceValidation.isWithinGeofence
                      ? "Within Geofence"
                      : "Outside Geofence"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {geofenceValidation.message}
                  </p>
                </div>
                {!geofenceValidation.isWithinGeofence && (
                  <Badge variant="destructive" className="text-xs">
                    {geofenceValidation.distance}m away
                  </Badge>
                )}
              </div>
            )}
          </div>
        ) : (
          // No value yet — show a calm "acquiring" state. We never surface the
          // raw geolocation error; the hook silently retries in the background.
          <div className="flex flex-col items-center justify-center py-6">
            <Loader2 className="h-10 w-10 text-primary animate-spin mb-3" />
            <p className="text-sm font-medium">Capturing location…</p>
            <p className="text-xs text-muted-foreground text-center">
              Hold steady — your GPS coordinates will appear automatically.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default GPSCapture;

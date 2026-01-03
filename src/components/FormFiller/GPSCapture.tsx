import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  MapPin,
  Navigation,
  Loader2,
  AlertCircle,
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
}

const GPSCapture = ({
  value,
  onChange,
  geofenceValidation,
  disabled,
  required,
}: GPSCaptureProps) => {
  const { position, error, isLoading, getCurrentPosition } = useGeolocation();

  // Update parent when position changes
  useEffect(() => {
    if (position && !value) {
      onChange(position);
    }
  }, [position, value, onChange]);

  const handleCapture = () => {
    getCurrentPosition();
  };

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
        {/* Location Status */}
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

            {/* Coordinates Display */}
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

            {/* Geofence Validation */}
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
          <div className="flex flex-col items-center justify-center py-6">
            {isLoading ? (
              <>
                <Loader2 className="h-10 w-10 text-primary animate-spin mb-3" />
                <p className="text-sm font-medium">Acquiring location...</p>
                <p className="text-xs text-muted-foreground">
                  Please wait while we get your GPS coordinates
                </p>
              </>
            ) : error ? (
              <>
                <AlertCircle className="h-10 w-10 text-destructive mb-3" />
                <p className="text-sm font-medium text-destructive">
                  Location Error
                </p>
                <p className="text-xs text-muted-foreground text-center mb-3">
                  {error}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleCapture}
                  disabled={disabled}
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Try Again
                </Button>
              </>
            ) : (
              <>
                <Navigation className="h-10 w-10 text-muted-foreground mb-3" />
                <p className="text-sm font-medium">GPS Location Required</p>
                <p className="text-xs text-muted-foreground text-center mb-3">
                  {required
                    ? "This form requires your current location"
                    : "Capture your current GPS coordinates"}
                </p>
                <Button
                  type="button"
                  variant="default"
                  onClick={handleCapture}
                  disabled={disabled}
                >
                  <MapPin className="h-4 w-4 mr-2" />
                  Get Location
                </Button>
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default GPSCapture;

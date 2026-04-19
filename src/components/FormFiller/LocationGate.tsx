/**
 * Full-screen gate shown while the device location prerequisites are not met.
 * Renders over the entire form; re-checks every 5s automatically (handled by
 * the useLocationEnforcement hook). Includes "Open settings" instructions and
 * a manual "I've enabled it — re-check now" button.
 */

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { MapPinOff, Loader2, AlertTriangle, ShieldAlert, Settings, RefreshCw } from "lucide-react";
import type { GateStatus } from "@/hooks/useLocationEnforcement";

interface LocationGateProps {
  status: GateStatus;
  attempts: number;
  onRetry: () => void;
  onCancel: () => void;
}

const SETTINGS_HELP: Record<string, string[]> = {
  ios: ["Open Settings → Privacy & Security → Location Services", "Enable Location Services", "Find this app and choose 'While Using the App'", "Set Precise Location to ON"],
  android: ["Open Settings → Location", "Toggle 'Use Location' ON", "Open this app's permissions", "Allow Location and enable 'Use precise location'"],
  desktop: ["Click the lock icon in your browser address bar", "Set Location to 'Allow'", "Reload this page"],
};

const detectPlatform = (): "ios" | "android" | "desktop" => {
  if (typeof navigator === "undefined") return "desktop";
  const ua = navigator.userAgent || "";
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  if (/Android/i.test(ua)) return "android";
  return "desktop";
};

const LocationGate = ({ status, attempts, onRetry, onCancel }: LocationGateProps) => {
  const platform = detectPlatform();
  const tips = SETTINGS_HELP[platform];

  if (status === "ready") return null;

  const isFailure = status === "failed";
  const isChecking = status === "checking" || status === "capturing";

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/95 backdrop-blur-sm p-4">
      <Card className="w-full max-w-lg border-2 border-destructive/40 shadow-2xl">
        <CardContent className="p-6 space-y-5">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10 shrink-0">
              {isChecking ? (
                <Loader2 className="h-7 w-7 text-primary animate-spin" />
              ) : isFailure ? (
                <ShieldAlert className="h-7 w-7 text-destructive" />
              ) : (
                <MapPinOff className="h-7 w-7 text-destructive" />
              )}
            </div>
            <div className="flex-1">
              <h2 className="text-xl font-bold">
                {isChecking
                  ? "Securing your location…"
                  : isFailure
                  ? "GPS unavailable"
                  : status === "stale"
                  ? "Location was disabled"
                  : "Device location required"}
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                {isChecking
                  ? "Please wait while we acquire a precise GPS fix. This usually takes a few seconds."
                  : isFailure
                  ? `We tried ${attempts} times to get a precise fix and failed. Please move to an open outdoor area and try again — submissions without GPS are not allowed.`
                  : status === "stale"
                  ? "You disabled location services while filling this form. Re-enable it before continuing."
                  : "Device location must be enabled to open this form. We use your GPS to verify where the data was collected and prevent location misclassification on dashboards."}
              </p>
            </div>
          </div>

          {!isChecking && (
            <div className="rounded-lg bg-muted/40 p-4 space-y-2">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Settings className="h-4 w-4" />
                How to enable on {platform === "ios" ? "iPhone" : platform === "android" ? "Android" : "Desktop"}
              </div>
              <ol className="list-decimal pl-5 text-sm space-y-1 text-muted-foreground">
                {tips.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ol>
              <p className="text-xs text-muted-foreground pt-1 flex items-center gap-1.5">
                <RefreshCw className="h-3 w-3" />
                Re-checking automatically every 5 seconds…
              </p>
            </div>
          )}

          <div className="flex items-center gap-2 rounded-lg bg-amber-500/10 border border-amber-500/30 p-3">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
            <p className="text-xs text-amber-700">
              All forms in this app require precise device GPS. No data can be submitted without it.
            </p>
          </div>

          <div className="flex flex-col-reverse sm:flex-row gap-2">
            <Button variant="outline" className="flex-1" onClick={onCancel}>
              Close form
            </Button>
            <Button className="flex-1" onClick={onRetry} disabled={isChecking}>
              {isChecking ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              {isChecking ? "Checking…" : "I've enabled it — re-check now"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default LocationGate;

import { useEffect, useRef, useState } from "react";
import { Crosshair, Loader2, MapPin, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { gpsFromPosition, type EyeGps } from "@/lib/eyeReport/gps";

export default function EyeGpsCapture({ value, onChange }: { value: EyeGps | null; onChange: (gps: EyeGps | null) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const request = useRef(0);
  useEffect(() => () => { request.current++; }, []);
  const capture = () => {
    if (!navigator.geolocation) { setError("Location is unavailable on this device. You can still save your report."); return; }
    const id = ++request.current;
    setBusy(true); setError("");
    navigator.geolocation.getCurrentPosition((position) => {
      if (id !== request.current) return;
      const gps = gpsFromPosition(position);
      if (gps) onChange(gps); else setError("The device returned an invalid location. Please try again.");
      setBusy(false);
    }, (failure) => {
      if (id !== request.current) return;
      setBusy(false);
      setError(failure.code === 1 ? "Location permission was denied. Allow location access in your device settings, then retry. You can still save without GPS." : "No GPS fix yet. Move near a window or outdoors and retry. You can still save without GPS.");
    }, { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 });
  };
  return <section className="space-y-3 rounded-lg border border-eye-blue/20 bg-eye-mint p-4 md:col-span-2" aria-label="Report GPS location">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h3 className="flex items-center gap-2 text-sm font-bold text-eye-deep"><MapPin className="h-5 w-5 text-eye-teal" /> Reporting GPS location</h3>
      <div className="flex gap-2">
        <Button type="button" onClick={capture} disabled={busy} className="min-h-12 bg-eye-blue text-primary-foreground hover:bg-eye-deep">{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Crosshair className="mr-2 h-4 w-4" />}{busy ? "Capturing…" : value ? "Recapture GPS" : "Capture GPS"}</Button>
        {value && <Button type="button" variant="outline" size="icon" className="h-12 w-12" aria-label="Remove GPS location" onClick={() => { request.current++; setBusy(false); onChange(null); }}><Trash2 className="h-4 w-4" /></Button>}
      </div>
    </div>
    {value ? <div className="grid gap-2 text-sm sm:grid-cols-3" aria-live="polite">
      <div><p className="text-xs text-muted-foreground">Latitude / Longitude</p><p className="font-mono font-semibold">{value.lat.toFixed(6)}, {value.lng.toFixed(6)}</p></div>
      <div><p className="text-xs text-muted-foreground">GPS accuracy</p><p className="font-semibold">± {Math.round(value.accuracy)} m</p></div>
      <div><p className="text-xs text-muted-foreground">Captured</p><p className="font-semibold">{new Date(value.captured_at).toLocaleString()}</p></div>
      {value.accuracy > 100 && <p className="text-xs text-eye-orange sm:col-span-3">Low GPS precision — recapture outdoors if possible.</p>}
    </div> : <p className="text-xs text-muted-foreground">No GPS captured</p>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </section>;
}
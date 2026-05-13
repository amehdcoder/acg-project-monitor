import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Camera, MapPin, Square, Save, Info } from "lucide-react";
import { useCESCapture } from "@/hooks/useCESCapture";

interface CESCaptureDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  formId?: string | null;
  onSaved?: (sessionId: string) => void;
}

const CESCaptureDialog = ({ open, onOpenChange, projectId, formId, onSaved }: CESCaptureDialogProps) => {
  const { session, isCapturing, stream, videoRef, diagnostics, startCapture, stopCapture, saveSession } = useCESCapture(
    projectId,
    formId
  );
  const [name, setName] = useState("");
  const [areaName, setAreaName] = useState("");
  const [state, setState] = useState("");
  const [lga, setLga] = useState("");
  const [ward, setWard] = useState("");
  const [campaignType, setCampaignType] = useState("");
  const [saving, setSaving] = useState(false);

  // Wire stream to video element when both ready
  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream, videoRef]);

  const handleStart = async () => {
    if (!name.trim()) return;
    await startCapture(name.trim());
  };

  const handleStop = async () => {
    await stopCapture({ closeLoop: diagnostics.isLoopClosable });
  };

  const handleCloseLoop = async () => {
    await stopCapture({ closeLoop: true });
  };

  const handleSave = async () => {
    setSaving(true);
    const id = await saveSession({ areaName, state, lga, ward, campaignType });
    setSaving(false);
    if (id) {
      onSaved?.(id);
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Camera className="h-5 w-5 text-primary" />
            Capture Village Perimeter (CES 3D Mapping)
          </DialogTitle>
          <DialogDescription>
            Walk the village perimeter once with your camera pointed at the buildings. The app will
            capture geotagged keyframes every ~3 seconds and build a tappable 3D map you can use to
            mark missed households during Coverage Evaluation.
          </DialogDescription>
        </DialogHeader>

        {!isCapturing && !session && (
          <>
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                <strong>Honest accuracy:</strong> This is photogrammetry-lite — not true NeRF.
                It produces a reliable 2.5D map with extruded roofs from your GPS trail and camera
                keyframes. Works fully offline on any phone.
              </AlertDescription>
            </Alert>

            <div className="grid gap-3">
              <div>
                <Label>Capture Name *</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Gidan Mado — South Quadrant"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Area / Settlement</Label>
                  <Input value={areaName} onChange={(e) => setAreaName(e.target.value)} />
                </div>
                <div>
                  <Label>Campaign Type</Label>
                  <Input
                    value={campaignType}
                    onChange={(e) => setCampaignType(e.target.value)}
                    placeholder="MDA, ITN, Immunization…"
                  />
                </div>
                <div>
                  <Label>State</Label>
                  <Input value={state} onChange={(e) => setState(e.target.value)} />
                </div>
                <div>
                  <Label>LGA</Label>
                  <Input value={lga} onChange={(e) => setLga(e.target.value)} />
                </div>
                <div className="col-span-2">
                  <Label>Ward</Label>
                  <Input value={ward} onChange={(e) => setWard(e.target.value)} />
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={handleStart} disabled={!name.trim()}>
                <Camera className="h-4 w-4 mr-2" />
                Start Walking
              </Button>
            </DialogFooter>
          </>
        )}

        {isCapturing && (
          <>
            <div className="relative bg-black rounded-lg overflow-hidden aspect-video">
              <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
              <div className="absolute top-3 left-3 flex gap-2">
                <Badge variant="destructive" className="animate-pulse">● RECORDING</Badge>
                <Badge variant="secondary" className="gap-1">
                  <MapPin className="h-3 w-3" /> {session?.perimeter.length ?? 0} vertices · {session?.keyframes.length ?? 0} photos
                </Badge>
              </div>
              <div className="absolute bottom-3 left-3 right-3 text-xs text-primary-foreground bg-foreground/70 p-2 rounded">
                Walk slowly around the perimeter — point camera at buildings. Auto-captures every ~3s
                or every 5m moved.
              </div>
            </div>

            <div className="rounded-md border bg-muted/40 p-3 text-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold">Live GPS Diagnostics</span>
                <Badge
                  variant={
                    diagnostics.watchStatus === "watching"
                      ? "default"
                      : diagnostics.watchStatus === "error"
                      ? "destructive"
                      : "secondary"
                  }
                >
                  {diagnostics.watchStatus === "watching"
                    ? "● Watching"
                    : diagnostics.watchStatus === "error"
                    ? "Error"
                    : "Idle"}
                </Badge>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <DiagStat label="Updates" value={diagnostics.updateCount} />
                <DiagStat
                  label="Last update"
                  value={
                    diagnostics.msSinceLastUpdate == null
                      ? "—"
                      : `${(diagnostics.msSinceLastUpdate / 1000).toFixed(1)}s ago`
                  }
                />
                <DiagStat
                  label="Accuracy"
                  value={diagnostics.lastAccuracy == null ? "—" : `±${diagnostics.lastAccuracy.toFixed(1)} m`}
                />
                <DiagStat
                  label="Speed"
                  value={
                    diagnostics.lastSpeed == null
                      ? "—"
                      : `${(diagnostics.lastSpeed * 3.6).toFixed(1)} km/h`
                  }
                />
                <DiagStat
                  label="Last move"
                  value={diagnostics.lastMovedM == null ? "—" : `${diagnostics.lastMovedM.toFixed(1)} m`}
                />
                <DiagStat
                  label="Vertex threshold"
                  value={`${diagnostics.vertexThresholdM} m`}
                />
                <DiagStat label="Vertices" value={diagnostics.vertexCount} />
                <DiagStat label="Photos" value={diagnostics.keyframeCount} />
                <DiagStat
                  label="Distance walked"
                  value={`${diagnostics.totalDistanceM.toFixed(0)} m`}
                />
                <DiagStat
                  label="Area enclosed"
                  value={
                    diagnostics.polygonAreaM2 < 10000
                      ? `${diagnostics.polygonAreaM2.toFixed(0)} m²`
                      : `${(diagnostics.polygonAreaM2 / 10000).toFixed(2)} ha`
                  }
                />
                <DiagStat
                  label="Loop closure"
                  value={
                    diagnostics.distanceFromStartM == null
                      ? "—"
                      : `${diagnostics.distanceFromStartM.toFixed(1)} m to start`
                  }
                />
                <DiagStat
                  label="WHO accuracy"
                  value={
                    diagnostics.accuracyGrade === "excellent"
                      ? "✓ Excellent (≤5m)"
                      : diagnostics.accuracyGrade === "acceptable"
                      ? "○ Acceptable (≤10m)"
                      : diagnostics.accuracyGrade === "poor"
                      ? "✗ Poor (>10m)"
                      : "—"
                  }
                />
              </div>
              {diagnostics.watchError && (
                <p className="text-destructive">GPS error: {diagnostics.watchError}</p>
              )}
              {diagnostics.accuracyGrade === "poor" && (
                <p className="text-amber-600">
                  GPS accuracy is below WHO CES recommendation (≤10m). Move to open sky for reliable perimeter.
                </p>
              )}
              {diagnostics.isLoopClosable && (
                <p className="text-emerald-600 font-semibold">
                  ✓ You're back near the start — tap "Close Perimeter & Stop" to seal the polygon.
                </p>
              )}
              {diagnostics.msSinceLastUpdate != null && diagnostics.msSinceLastUpdate > 5000 && (
                <p className="text-amber-600">No GPS update in {(diagnostics.msSinceLastUpdate / 1000).toFixed(0)}s — check signal / move outside.</p>
              )}
            </div>
            <DialogFooter className="flex-col sm:flex-row gap-2">
              {diagnostics.isLoopClosable && (
                <Button variant="default" onClick={handleCloseLoop}>
                  <Square className="h-4 w-4 mr-2" />
                  Close Perimeter & Stop
                </Button>
              )}
              <Button variant="destructive" onClick={handleStop}>
                <Square className="h-4 w-4 mr-2" />
                Stop Capture
              </Button>
            </DialogFooter>
          </>
        )}

        {!isCapturing && session && session.keyframes.length > 0 && (
          <>
            <Alert>
              <MapPin className="h-4 w-4" />
              <AlertDescription>
                Captured <strong>{session.keyframes.length} keyframes</strong> covering{" "}
                <strong>{session.perimeter.length} GPS points</strong>. Save to build the 3D map.
              </AlertDescription>
            </Alert>
            <div className="grid grid-cols-3 gap-2 max-h-48 overflow-y-auto">
              {session.keyframes.slice(0, 12).map((kf) => (
                <img
                  key={kf.id}
                  src={kf.thumbnailDataUrl}
                  alt="keyframe"
                  className="rounded border border-border w-full h-20 object-cover"
                />
              ))}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
                Discard
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                <Save className="h-4 w-4 mr-2" />
                {saving ? "Saving…" : "Save & Build 3D Map"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

const DiagStat = ({ label, value }: { label: string; value: string | number }) => (
  <div className="rounded bg-background border p-1.5">
    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
    <div className="font-semibold tabular-nums">{value}</div>
  </div>
);

export default CESCaptureDialog;

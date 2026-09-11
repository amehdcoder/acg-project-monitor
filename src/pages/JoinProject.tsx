import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { Html5Qrcode } from "html5-qrcode";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { QrCode, Camera, Keyboard, Loader2, ArrowLeft, WifiOff } from "lucide-react";
import { toast } from "sonner";
import { useDeviceSession } from "@/hooks/useDeviceSession";

const ERRORS: Record<string, string> = {
  invalid_code: "That project code was not recognised.",
  invalid_pin: "That PIN is not correct for this project.",
  code_expired: "This project code has expired. Ask your supervisor for a new one.",
  too_many_attempts: "Too many attempts. Please wait a few minutes and try again.",
  invalid_input: "Please enter the project code and a name for this device.",
};

/** Account-free enrolment: scan the project QR code or type the code by hand. */
const JoinProject = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { join, session } = useDeviceSession();

  const [code, setCode] = useState((params.get("code") ?? "").toUpperCase());
  const [pin, setPin] = useState(params.get("pin") ?? "");
  const [label, setLabel] = useState("");
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const containerId = useRef(`join-scan-${Math.random().toString(36).slice(2, 9)}`);

  useEffect(() => {
    if (session) navigate("/collect", { replace: true });
  }, [session, navigate]);

  const stopScanner = async () => {
    try {
      await scannerRef.current?.stop();
      scannerRef.current?.clear();
    } catch {
      /* already stopped */
    }
    scannerRef.current = null;
    setScanning(false);
  };

  useEffect(() => () => void stopScanner(), []);

  const applyScanned = (text: string) => {
    // Accepts a raw code or a full join link: https://…/join?code=ABC123&pin=1234
    try {
      const url = new URL(text);
      const c = url.searchParams.get("code");
      const p = url.searchParams.get("pin");
      if (c) setCode(c.toUpperCase());
      if (p) setPin(p);
      if (c) return;
    } catch {
      /* not a URL — treat as a plain code */
    }
    setCode(text.trim().toUpperCase());
  };

  const startScanner = async () => {
    setScanning(true);
    try {
      const scanner = new Html5Qrcode(containerId.current);
      scannerRef.current = scanner;
      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 240, height: 240 } },
        (decoded) => {
          applyScanned(decoded);
          void stopScanner();
          toast.success("Project code scanned");
        },
        () => {},
      );
    } catch {
      setScanning(false);
      toast.error("Camera unavailable — enter the code by hand instead.");
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || !label.trim()) {
      toast.error("Enter the project code and a name for this device.");
      return;
    }
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      toast.error("Joining a project needs a connection once. After that the app works offline.");
      return;
    }
    setBusy(true);
    try {
      await stopScanner();
      const next = await join({ code: code.trim(), pin: pin.trim() || undefined, label: label.trim() });
      toast.success(`Joined ${next.projectName}`);
      navigate("/collect", { replace: true });
    } catch (err: any) {
      toast.error(ERRORS[err?.message] ?? "Could not join this project. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-hero flex items-center justify-center p-4">
      <Card className="w-full max-w-md border-0 shadow-card bg-card/90 backdrop-blur-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
            <QrCode className="h-7 w-7 text-primary" />
          </div>
          <CardTitle className="font-display text-2xl">Join a project</CardTitle>
          <CardDescription>
            Scan the project QR code or enter the code your supervisor gave you. No account needed.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div id={containerId.current} className={scanning ? "rounded-xl overflow-hidden" : "hidden"} />

          {!scanning && (
            <Button type="button" variant="secondary" className="w-full" onClick={startScanner}>
              <Camera className="mr-2 h-4 w-4" /> Scan QR code
            </Button>
          )}
          {scanning && (
            <Button type="button" variant="outline" className="w-full" onClick={() => void stopScanner()}>
              Stop camera
            </Button>
          )}

          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="code" className="flex items-center gap-2">
                <Keyboard className="h-3.5 w-3.5" /> Project code
              </Label>
              <Input
                id="code"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="e.g. K7M2QP"
                autoCapitalize="characters"
                className="tracking-[0.3em] text-center font-mono text-lg"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pin">PIN (if your supervisor set one)</Label>
              <Input
                id="pin"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                inputMode="numeric"
                placeholder="Optional"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="label">Collector / device name</Label>
              <Input
                id="label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. Aisha — Kaugama 3"
              />
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Join project
            </Button>
          </form>

          <p className="flex items-start gap-2 text-xs text-muted-foreground">
            <WifiOff className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            You only need a connection for this one step. Afterwards the app opens, fills and saves
            records with no network at all.
          </p>

          <Link to="/auth" className="block text-center text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="inline h-3.5 w-3.5 mr-1" /> Back to sign in
          </Link>
        </CardContent>
      </Card>
    </div>
  );
};

export default JoinProject;

import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { Html5Qrcode } from "html5-qrcode";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { QrCode, Camera, Keyboard, Loader2, ArrowLeft, WifiOff, ShieldCheck, CheckCircle2 } from "lucide-react";
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
    <div className="collector-shell min-h-[100dvh] bg-background text-foreground">
      <header className="border-b border-primary/15 bg-primary text-primary-foreground">
        <div className="mx-auto flex max-w-md items-center justify-between px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary-foreground/10">
              <QrCode className="h-5 w-5" />
            </div>
            <div>
              <p className="collector-title text-lg font-bold leading-tight">Amehnities Collect</p>
              <p className="text-xs text-primary-foreground/70">Secure field workspace</p>
            </div>
          </div>
          <ShieldCheck className="h-5 w-5 text-accent" aria-hidden="true" />
        </div>
      </header>

      <main className="mx-auto w-full max-w-md px-5 pb-8 pt-8">
        <div className="mb-7">
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-primary">Account-free collection</p>
          <h1 className="collector-title text-3xl font-bold leading-tight">Join your project</h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Scan the project QR code or enter the details from your supervisor.
          </p>
        </div>

        <Card className="border-primary/15 bg-card shadow-card">
          <CardHeader className="pb-3">
            <CardTitle className="collector-title text-lg">Project access</CardTitle>
            <CardDescription>No username or password is required.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div id={containerId.current} className={scanning ? "overflow-hidden rounded-md border border-primary/20" : "hidden"} />

            {!scanning && (
              <Button type="button" variant="secondary" size="lg" className="w-full border border-primary/15" onClick={startScanner}>
                <Camera className="mr-2 h-5 w-5" /> Scan project QR code
              </Button>
            )}
            {scanning && (
              <Button type="button" variant="outline" size="lg" className="w-full" onClick={() => void stopScanner()}>
                Stop camera
              </Button>
            )}

            <div className="flex items-center gap-3" aria-hidden="true">
              <div className="h-px flex-1 bg-border" />
              <span className="text-xs font-medium uppercase text-muted-foreground">or enter details</span>
              <div className="h-px flex-1 bg-border" />
            </div>

            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="code" className="flex items-center gap-2 font-semibold">
                  <Keyboard className="h-4 w-4 text-primary" /> Project code
                </Label>
                <Input id="code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="e.g. K7M2QP" autoCapitalize="characters"
                  className="h-12 border-primary/20 text-center font-mono text-lg uppercase tracking-[0.3em]" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pin" className="font-semibold">Project PIN <span className="font-normal text-muted-foreground">(optional)</span></Label>
                <Input id="pin" value={pin} onChange={(e) => setPin(e.target.value)} inputMode="numeric"
                  placeholder="Enter PIN if provided" className="h-12 border-primary/20" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="label" className="font-semibold">Collector or device name</Label>
                <Input id="label" value={label} onChange={(e) => setLabel(e.target.value)}
                  placeholder="e.g. Aisha — Kaugama 3" className="h-12 border-primary/20" />
              </div>
              <Button type="submit" size="lg" className="w-full" disabled={busy}>
                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                Open project workspace
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="mt-5 flex items-start gap-3 rounded-md border border-primary/10 bg-secondary/70 p-4">
          <WifiOff className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <p className="text-xs leading-5 text-muted-foreground">
            A connection is only needed to join once. Your forms, cases and saved records remain available offline.
          </p>
        </div>

        <Link to="/auth" className="mt-7 flex items-center justify-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-primary">
          <ArrowLeft className="h-4 w-4" /> Back to account sign in
        </Link>
      </main>
    </div>
  );
};

export default JoinProject;

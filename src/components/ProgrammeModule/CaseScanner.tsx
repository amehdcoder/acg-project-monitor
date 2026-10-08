import { useCallback, useEffect, useRef, useState } from "react";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Camera, CheckCircle2, Flashlight, Keyboard, Loader2, RefreshCw, ScanLine, ShieldCheck, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { caseIdFromScan } from "@/lib/programmeModule/dedupe";
import { cameraErrorMessage, preferredCamera } from "@/lib/programmeModule/scannerCamera";
import type { BeneficiaryRow } from "@/lib/programmeModule/types";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  beneficiaries: BeneficiaryRow[];
  onFound: (b: BeneficiaryRow) => void;
}
const FORMATS = [Html5QrcodeSupportedFormats.QR_CODE, Html5QrcodeSupportedFormats.CODE_128,
  Html5QrcodeSupportedFormats.CODE_39, Html5QrcodeSupportedFormats.DATA_MATRIX];

const CaseScanner = ({ open, onOpenChange, beneficiaries, onFound }: Props) => {
  const regionId = useRef(`case-scan-${Math.random().toString(36).slice(2)}`);
  const scanner = useRef<Html5Qrcode | null>(null);
  const session = useRef(0);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const handled = useRef(false);
  const lookupBusy = useRef(false);
  const [status, setStatus] = useState<"starting" | "scanning" | "looking" | "error">("starting");
  const [message, setMessage] = useState("");
  const [manual, setManual] = useState("");
  const [torch, setTorch] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchBusy, setTorchBusy] = useState(false);
  const callbacks = useRef({ beneficiaries, onFound, onOpenChange });
  callbacks.current = { beneficiaries, onFound, onOpenChange };

  const stop = useCallback(async () => {
    const s = scanner.current;
    scanner.current = null;
    if (!s) return;
    try { if (s.isScanning) await s.stop(); } catch { /* track may already be ended */ }
    try { s.clear(); } catch { /* dialog may have unmounted */ }
  }, []);

  const lookup = useCallback(async (raw: string) => {
    const id = caseIdFromScan(raw).trim();
    if (!id || lookupBusy.current) return;
    const token = session.current;
    lookupBusy.current = true;
    handled.current = true;
    setStatus("looking"); setMessage("");
    try {
      let hit = callbacks.current.beneficiaries.find((b) => (b.case_id || "").toLowerCase() === id.toLowerCase());
      if (!hit) {
        // Escape pattern characters: scanned IDs are exact IDs, not search patterns.
        const exact = id.replace(/[\\%_]/g, (c) => `\\${c}`);
        const { data, error } = await supabase.from("beneficiaries").select("*").ilike("case_id", exact).limit(1).maybeSingle();
        if (error) throw error;
        if (data) hit = data as unknown as BeneficiaryRow;
      }
      if (token !== session.current) return;
      if (hit) {
        session.current += 1;
        queue.current = queue.current.catch(() => {}).then(stop);
        await queue.current;
        try { navigator.vibrate?.(60); } catch { /* optional device feedback */ }
        callbacks.current.onOpenChange(false);
        callbacks.current.onFound(hit);
        return;
      }
      setMessage(`No accessible beneficiary record found for ${id}.`);
    } catch {
      if (token === session.current) setMessage("Could not check this Case ID. Check your connection and try again; loaded records remain available.");
    } finally {
      lookupBusy.current = false;
      if (token === session.current) {
        setStatus(scanner.current?.isScanning ? "scanning" : "error");
        // Avoid repeated requests for a card that remains in the viewfinder.
        window.setTimeout(() => { if (token === session.current) handled.current = false; }, 1800);
      }
    }
  }, [stop]);

  const start = useCallback(() => {
    const token = ++session.current;
    setStatus("starting"); setMessage(""); setTorch(false); setTorchSupported(false);
    handled.current = false;
    queue.current = queue.current.catch(() => {}).then(async () => {
      await stop();
      if (token !== session.current) return;
      try {
        if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
          throw new DOMException("Camera requires a secure supported browser", "SecurityError");
        }
        // Enumeration requests device permission and confirms a physical camera exists.
        const cameras = await Html5Qrcode.getCameras();
        if (token !== session.current) return;
        if (!cameras.length) throw new DOMException("No camera", "NotFoundError");
        const s = new Html5Qrcode(regionId.current, { formatsToSupport: FORMATS, verbose: false,
          experimentalFeatures: { useBarCodeDetectorIfSupported: true } });
        scanner.current = s;
        await s.start(preferredCamera(cameras) ?? { facingMode: "environment" },
          { fps: 12, qrbox: (w, h) => ({ width: Math.round(w * 0.82), height: Math.round(Math.min(h * 0.65, w * 0.65)) }) },
          (text) => { if (token === session.current && !handled.current) void lookup(text); }, () => {});
        if (token !== session.current) { await stop(); return; }
        try { setTorchSupported(s.getRunningTrackCameraCapabilities().torchFeature().isSupported()); } catch { setTorchSupported(false); }
        setStatus("scanning");
      } catch (error) {
        await stop();
        if (token === session.current) { setStatus("error"); setMessage(cameraErrorMessage(error)); }
      }
    });
  }, [lookup, stop]);

  useEffect(() => {
    if (open) start();
    return () => {
      session.current += 1;
      queue.current = queue.current.catch(() => {}).then(stop);
    };
  }, [open, start, stop]);

  const toggleTorch = async () => {
    const s = scanner.current;
    if (!s?.isScanning || !torchSupported || torchBusy) return;
    setTorchBusy(true);
    const token = session.current;
    try {
      const feature = s.getRunningTrackCameraCapabilities().torchFeature();
      await feature.apply(!torch);
      if (token === session.current) setTorch(feature.value() ?? !torch);
    } catch { if (token === session.current) setMessage("The device could not change its torch. Try again or improve the lighting around the card."); }
    finally { setTorchBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[96dvh] w-[calc(100%-1rem)] max-w-lg gap-0 overflow-y-auto rounded-lg p-0 [&>button]:hidden">
        <div className="flex items-center justify-between border-b bg-primary p-4 text-primary-foreground">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-primary-foreground/15 p-3"><ScanLine className="h-6 w-6" /></div>
            <div><DialogTitle className="text-lg text-primary-foreground">Scan Hand Card</DialogTitle>
              <DialogDescription className="mt-1 text-sm text-primary-foreground/80">Beneficiary Case ID lookup</DialogDescription></div>
          </div>
          <Button aria-label="Close scanner" size="icon" variant="ghost" className="h-[52px] w-[52px] text-primary-foreground hover:bg-primary-foreground/15" onClick={() => onOpenChange(false)}><X /></Button>
        </div>
        <div className="flex flex-wrap items-center gap-3 border-b bg-status-success/10 px-4 py-3 text-sm">
          {status === "scanning" ? <CheckCircle2 className="h-5 w-5 text-status-success" /> : <ShieldCheck className="h-5 w-5 text-primary" />}
          <span>{status === "scanning" ? "Camera ready · Access granted" : status === "starting" ? "Checking camera and permission…" : status === "looking" ? "Finding beneficiary…" : "Camera needs attention"}</span>
        </div>
        <div className="relative overflow-hidden bg-foreground">
          <div id={regionId.current} className="h-[min(46dvh,420px)] min-h-[220px] w-full [&_video]:h-full [&_video]:w-full [&_video]:object-cover" />
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="h-[65%] w-[82%] rounded-lg border-2 border-status-success">
              <div className="mx-3 mt-3 h-1 w-8 rounded bg-accent" />
            </div>
          </div>
          {(status === "starting" || status === "looking") && <div className="absolute inset-0 flex items-center justify-center bg-foreground/70 text-primary-foreground"><Loader2 className="mr-2 h-6 w-6 animate-spin motion-reduce:animate-none" />{status === "starting" ? "Starting camera…" : "Opening record…"}</div>}
          {status === "error" && <div className="absolute inset-0 flex items-center justify-center text-primary-foreground"><Camera className="h-12 w-12" /></div>}
        </div>
        <div className="space-y-3 p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">Align the QR code or barcode inside the frame.</p>
            <Button aria-label={torch ? "Turn torch off" : "Turn torch on"} aria-pressed={torch} title={torchSupported ? "Camera torch" : "Torch unavailable on this camera"}
              variant={torch ? "default" : "outline"} className="h-[52px] shrink-0 gap-2" onClick={toggleTorch} disabled={!torchSupported || torchBusy || status !== "scanning"}>
              <Flashlight className="h-5 w-5" />{torch ? "On" : "Torch"}
            </Button>
          </div>
          {!torchSupported && status === "scanning" && <p className="text-xs text-muted-foreground">This camera does not provide a controllable torch.</p>}
          {message && <p role="alert" className="rounded-lg border border-status-warning/30 bg-status-warning/10 p-3 text-sm text-foreground">{message}</p>}
          {status === "error" && <Button variant="outline" className="h-[52px] w-full gap-2" onClick={start}><RefreshCw className="h-4 w-4" />Retry camera</Button>}
          <div className="flex gap-2 border-t pt-3">
            <div className="relative min-w-0 flex-1">
              <Keyboard className="absolute left-3 top-[18px] h-4 w-4 text-muted-foreground" />
              <Input aria-label="Case ID" className="h-[52px] pl-9 font-mono" placeholder="Enter Case ID" value={manual} onChange={(e) => setManual(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void lookup(manual); } }} />
            </div>
            <Button className="h-[52px]" onClick={() => void lookup(manual)} disabled={!manual.trim() || status === "looking" || status === "starting"}>Open</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
export default CaseScanner;

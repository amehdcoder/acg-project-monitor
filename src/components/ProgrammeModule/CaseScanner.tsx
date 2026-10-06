import { useCallback, useEffect, useRef, useState } from "react";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Flashlight, Keyboard, Loader2, RefreshCw, ScanLine, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { caseIdFromScan } from "@/lib/programmeModule/dedupe";
import type { BeneficiaryRow } from "@/lib/programmeModule/types";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  beneficiaries: BeneficiaryRow[];
  onFound: (b: BeneficiaryRow) => void;
}

const FORMATS = [
  Html5QrcodeSupportedFormats.QR_CODE,
  Html5QrcodeSupportedFormats.CODE_128,
  Html5QrcodeSupportedFormats.CODE_39,
  Html5QrcodeSupportedFormats.DATA_MATRIX,
];

/** Full-screen camera scanner for Hand Card QR codes and barcodes. */
const CaseScanner = ({ open, onOpenChange, beneficiaries, onFound }: Props) => {
  const regionId = useRef(`case-scan-${Math.random().toString(36).slice(2)}`);
  const scanner = useRef<Html5Qrcode | null>(null);
  const handled = useRef(false);
  const [status, setStatus] = useState<"starting" | "scanning" | "looking" | "error">("starting");
  const [message, setMessage] = useState("");
  const [manual, setManual] = useState("");
  const [torch, setTorch] = useState(false);

  const stop = useCallback(async () => {
    const s = scanner.current; scanner.current = null;
    if (s) { try { if (s.isScanning) await s.stop(); s.clear(); } catch { /* ignore */ } }
  }, []);

  const lookup = useCallback(async (raw: string) => {
    const id = caseIdFromScan(raw).trim();
    if (!id) return;
    const local = beneficiaries.find((b) => (b.case_id || "").toLowerCase() === id.toLowerCase());
    if (local) { await stop(); onOpenChange(false); onFound(local); return; }
    setStatus("looking");
    const { data } = await supabase.from("beneficiaries").select("*").ilike("case_id", id).limit(1).maybeSingle();
    if (data) { await stop(); onOpenChange(false); onFound(data as unknown as BeneficiaryRow); return; }
    setMessage(`No beneficiary found for ${id}.`);
    setStatus("scanning");
    handled.current = false;
  }, [beneficiaries, onFound, onOpenChange, stop]);

  const start = useCallback(async () => {
    await stop();
    handled.current = false; setMessage(""); setStatus("starting");
    try {
      const s = new Html5Qrcode(regionId.current, { formatsToSupport: FORMATS, verbose: false, experimentalFeatures: { useBarCodeDetectorIfSupported: true } });
      scanner.current = s;
      await s.start(
        { facingMode: "environment" },
        { fps: 15, qrbox: (w, h) => { const m = Math.min(w, h); return { width: Math.round(m * 0.85), height: Math.round(m * 0.6) }; } },
        (text) => {
          if (handled.current) return;
          handled.current = true;
          try { navigator.vibrate?.(60); } catch { /* ignore */ }
          void lookup(text);
        },
        () => {},
      );
      setStatus("scanning");
    } catch {
      setStatus("error");
      setMessage("Camera unavailable. Allow camera access, or type the Case ID below.");
    }
  }, [lookup, stop]);

  useEffect(() => {
    if (!open) { void stop(); return; }
    const t = setTimeout(() => void start(), 50);
    return () => { clearTimeout(t); void stop(); };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleTorch = async () => {
    try {
      await scanner.current?.applyVideoConstraints({ advanced: [{ torch: !torch } as MediaTrackConstraintSet] });
      setTorch(!torch);
    } catch { setMessage("This device has no torch."); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg gap-0 overflow-hidden p-0">
        <div className="relative bg-foreground">
          <div id={regionId.current} className="aspect-[3/4] w-full [&_video]:h-full [&_video]:w-full [&_video]:object-cover" />
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="relative h-[55%] w-[80%] rounded-2xl border-2 border-primary-foreground/80 shadow-[0_0_0_9999px_hsl(var(--foreground)/0.45)]">
              <div className="absolute inset-x-4 top-1/2 h-0.5 animate-pulse bg-primary" />
            </div>
          </div>
          <div className="absolute inset-x-0 top-0 flex items-center justify-between p-3 text-primary-foreground">
            <div className="flex items-center gap-2 text-sm font-semibold"><ScanLine className="h-4 w-4" /> Scan Hand Card</div>
            <div className="flex gap-1">
              <Button size="icon" variant="ghost" className="h-8 w-8 text-primary-foreground hover:bg-primary-foreground/10" onClick={toggleTorch}><Flashlight className="h-4 w-4" /></Button>
              <Button size="icon" variant="ghost" className="h-8 w-8 text-primary-foreground hover:bg-primary-foreground/10" onClick={() => onOpenChange(false)}><X className="h-4 w-4" /></Button>
            </div>
          </div>
          <div className="absolute inset-x-0 bottom-0 p-3 text-center text-sm text-primary-foreground">
            {status === "starting" && <span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Starting camera…</span>}
            {status === "scanning" && "Point at the QR code or barcode on the card"}
            {status === "looking" && <span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Opening record…</span>}
          </div>
        </div>
        <div className="space-y-2 p-4">
          {message && <p className="rounded-md bg-destructive/10 p-2 text-sm text-destructive">{message}</p>}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Keyboard className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input className="pl-8 font-mono" placeholder="Or type Case ID" value={manual} onChange={(e) => setManual(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void lookup(manual)} />
            </div>
            <Button onClick={() => void lookup(manual)} disabled={!manual.trim()}>Open</Button>
            {status === "error" && <Button variant="outline" size="icon" onClick={() => void start()}><RefreshCw className="h-4 w-4" /></Button>}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CaseScanner;

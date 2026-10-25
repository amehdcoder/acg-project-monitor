import { useEffect, useId, useRef, useState } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { Camera, ImagePlus, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { parseProjectQr } from '@/lib/microplanning/projectQr';

export default function ProjectQrScanner({ onScan }: { onScan: (details: {code: string; pin?: string}) => void }) {
  const id = `project-camera-${useId().replace(/:/g, '')}`;
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;
  // Each camera session owns its scanner. Stop waits for start to settle, even
  // when permission is granted after closing or navigating away.
  const pending = useRef<Promise<void>>(Promise.resolve());
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    let accepted = false;
    const scanner = new Html5Qrcode(id, { formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE], verbose: false });
    const previous = pending.current;
    const start = previous.then(async () => {
      if (cancelled) return;
      try {
        await scanner.start({ facingMode: 'environment' }, {
          fps: 12,
          qrbox: (width, height) => { const side = Math.floor(Math.min(width, height) * .75); return {width: side, height: side}; },
          aspectRatio: 1,
        }, decoded => {
          if (cancelled || accepted) return;
          const result = parseProjectQr(decoded);
          if (!result) { setError('This is not a project QR code.'); return; }
          accepted = true;
          onScanRef.current(result);
          setOpen(false);
        }, () => {});
        if (!cancelled) setReady(true);
      } catch (cause) {
        if (!cancelled) {
          const message = String(cause);
          setError(/NotAllowed|Permission|denied/i.test(message)
            ? 'Camera permission was denied. Allow camera access in your browser settings, or choose a QR image.'
            : 'Camera could not start. Close other camera apps, retry, or choose a QR image.');
        }
      }
    });
    pending.current = start;
    return () => {
      cancelled = true;
      pending.current = start.then(async () => {
        try { if (scanner.isScanning) await scanner.stop(); } catch { /* track already ended */ }
        try { scanner.clear(); } catch { /* container unmounted */ }
      });
    };
  }, [open, id]);
  const scanFile = async (file: File) => {
    setError('');
    await pending.current;
    const scanner = new Html5Qrcode(`${id}-image`, {formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE], verbose: false});
    try {
      const result = parseProjectQr(await scanner.scanFile(file, false));
      if (!result) throw new Error('invalid');
      onScanRef.current(result);
    } catch { setError('No project QR code found in this image. Choose a clearer image or enter the code.'); }
    finally { scanner.clear(); }
  };
  return <div className="space-y-3">
    <div id={id} className={open ? 'project-qr-camera rounded-md border border-primary/20 overflow-hidden' : 'hidden'} />
    <div id={`${id}-image`} className="hidden" />
    {open && !ready && !error && <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Opening camera…</p>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <Button type="button" variant="secondary" size="lg" className="w-full" onClick={() => {setError('');setReady(false);setOpen(!open);}}>
      {open ? <X className="mr-2 h-5 w-5" /> : <Camera className="mr-2 h-5 w-5" />}{open ? 'Stop camera' : 'Scan project QR code'}
    </Button>
    <Button type="button" variant="outline" className="w-full" disabled={open} onClick={() => fileRef.current?.click()}><ImagePlus className="mr-2 h-4 w-4" />Choose QR image</Button>
    <input ref={fileRef} type="file" accept="image/*" className="hidden" aria-label="Project QR image" onChange={e => {const file=e.target.files?.[0];if(file) void scanFile(file);e.target.value='';}} />
  </div>;
}
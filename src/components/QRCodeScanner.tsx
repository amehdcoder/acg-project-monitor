import { useState, useRef, useCallback, useEffect } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { QrCode, Camera, X, ScanLine, Loader2, CheckCircle, AlertCircle, Settings } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";

interface QRCodeScannerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onFormReady: (form: any) => void;
  /** Called when scanner detects an external XLSForm URL (ODK/Kobo/CommCare or raw .xls/.xlsx). */
  onExternalXlsform?: (url: string, source: "kobo" | "commcare" | "odk" | "xlsform") => void;
}

function detectExternalXlsform(rawUrl: string): { source: "kobo" | "commcare" | "odk" | "xlsform"; url: string } | null {
  try {
    const u = new URL(rawUrl);
    const host = u.hostname.toLowerCase();
    const path = u.pathname.toLowerCase();
    if (host.includes("kobotoolbox.org") || host.includes("kf.kobotoolbox") || host.includes("kc.kobotoolbox")) {
      return { source: "kobo", url: rawUrl };
    }
    if (host.includes("commcarehq.org") || host.includes("commcare")) {
      return { source: "commcare", url: rawUrl };
    }
    if (path.endsWith(".xlsx") || path.endsWith(".xls")) {
      return { source: "xlsform", url: rawUrl };
    }
    if (host.includes("opendatakit") || path.includes("/odk/") || path.endsWith(".xml")) {
      return { source: "odk", url: rawUrl };
    }
    return null;
  } catch {
    return null;
  }
}

const QRCodeScanner = ({ open, onOpenChange, onFormReady, onExternalXlsform }: QRCodeScannerProps) => {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);
  const containerId = useRef(`qr-scanner-${Math.random().toString(36).substr(2, 9)}`);
  const { user } = useAuth();

  const stopScanning = useCallback(async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
        await scannerRef.current.clear();
      } catch (err) {
        console.error("Error stopping scanner:", err);
      }
      scannerRef.current = null;
    }
    setIsScanning(false);
  }, []);

  const handleScan = useCallback(async (decodedText: string) => {
    await stopScanning();
    setIsProcessing(true);

    try {
      const url = new URL(decodedText);
      const formId = url.searchParams.get("formId");
      const action = url.searchParams.get("action");

      // External XLSForm sources (Kobo / CommCare / ODK / raw .xls(x))
      if (!formId || action !== "fill") {
        const external = detectExternalXlsform(decodedText);
        if (external && onExternalXlsform) {
          setResult({
            success: true,
            message: `${external.source.toUpperCase()} form detected. Importing into form builder…`,
          });
          toast({ title: "External form detected", description: `Source: ${external.source}` });
          setTimeout(() => {
            onExternalXlsform(external.url, external.source);
            onOpenChange(false);
            setResult(null);
          }, 800);
          setIsProcessing(false);
          return;
        }
        setResult({ success: false, message: "Invalid QR code. This doesn't appear to be a form QR code." });
        setIsProcessing(false);
        return;
      }

      const { data: existing } = await supabase
        .from("user_form_assignments")
        .select("id")
        .eq("user_id", user?.id)
        .eq("form_id", formId)
        .maybeSingle();

      if (!existing && user) {
        const { error: assignError } = await supabase
          .from("user_form_assignments")
          .insert({
            user_id: user.id,
            form_id: formId,
            assigned_by: user.id,
          });

        if (assignError) {
          console.warn("Could not auto-assign form:", assignError);
        }
      }

      const { data: form, error: formError } = await supabase
        .from("forms")
        .select("*")
        .eq("id", formId)
        .maybeSingle();

      if (formError || !form) {
        setResult({ success: false, message: "Form not found. It may have been deleted or you don't have access." });
        setIsProcessing(false);
        return;
      }

      if (form.status !== "active") {
        setResult({ success: false, message: `This form is currently "${form.status}" and not accepting submissions.` });
        setIsProcessing(false);
        return;
      }

      setResult({ success: true, message: `Form "${form.name}" is ready to fill!` });
      toast({ title: "Form Found", description: `"${form.name}" assigned and ready.` });

      setTimeout(() => {
        onFormReady(form);
        onOpenChange(false);
        setResult(null);
      }, 1200);
    } catch (err) {
      setResult({ success: false, message: "Invalid QR code format. Please scan a valid form QR code." });
    } finally {
      setIsProcessing(false);
    }
  }, [user, stopScanning, onFormReady, onOpenChange, onExternalXlsform]);

  const requestCameraAndStart = useCallback(async () => {
    setResult(null);
    setPermissionDenied(false);

    // CRITICAL: getUserMedia called directly in click handler for browser security
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      // Stop the test stream immediately — html5-qrcode will open its own
      stream.getTracks().forEach((t) => t.stop());
    } catch (err: any) {
      console.error("Camera permission error:", err);
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        setPermissionDenied(true);
        return;
      }
      if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
        toast({
          title: "No Camera Found",
          description: "This device does not have a camera. Please use a device with a camera.",
          variant: "destructive",
        });
        return;
      }
      toast({
        title: "Camera Error",
        description: "Unable to access camera. Please check your device settings.",
        variant: "destructive",
      });
      return;
    }

    // Now start the html5-qrcode scanner (camera already granted)
    try {
      const html5QrCode = new Html5Qrcode(containerId.current);
      scannerRef.current = html5QrCode;

      await html5QrCode.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 }, aspectRatio: 1 },
        (decodedText) => handleScan(decodedText),
        () => {}
      );
      setIsScanning(true);
    } catch (err) {
      console.error("Scanner error:", err);
      toast({
        title: "Scanner Error",
        description: "Unable to start QR scanner. Please try again.",
        variant: "destructive",
      });
    }
  }, [handleScan]);

  // Cleanup on close
  useEffect(() => {
    if (!open) {
      stopScanning();
      setResult(null);
      setPermissionDenied(false);
    }
  }, [open, stopScanning]);

  useEffect(() => {
    return () => {
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {});
      }
    };
  }, []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <QrCode className="h-5 w-5 text-primary" />
            Scan Form QR Code
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {isProcessing ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="h-10 w-10 animate-spin text-primary mb-4" />
              <p className="text-sm text-muted-foreground">Processing QR code...</p>
            </div>
          ) : result ? (
            <div className="flex flex-col items-center justify-center py-8">
              {result.success ? (
                <CheckCircle className="h-12 w-12 text-green-600 mb-3" />
              ) : (
                <AlertCircle className="h-12 w-12 text-destructive mb-3" />
              )}
              <p className={`text-sm text-center font-medium ${result.success ? "text-green-700" : "text-destructive"}`}>
                {result.message}
              </p>
              {!result.success && (
                <Button variant="outline" size="sm" className="mt-4" onClick={requestCameraAndStart}>
                  Try Again
                </Button>
              )}
            </div>
          ) : permissionDenied ? (
            <div className="flex flex-col items-center justify-center py-8 px-2">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10 mb-4">
                <Camera className="h-8 w-8 text-destructive" />
              </div>
              <p className="text-sm font-semibold text-foreground mb-1">Camera Access Required</p>
              <p className="text-xs text-muted-foreground text-center mb-4 max-w-[260px]">
                Camera permission was denied. To scan QR codes, please grant camera access in your browser or device settings:
              </p>
              <div className="rounded-lg bg-muted p-3 text-xs text-muted-foreground space-y-1.5 w-full mb-4">
                <p className="font-medium text-foreground">How to enable:</p>
                <p>• <strong>Chrome:</strong> Tap the lock icon in the address bar → Site Settings → Camera → Allow</p>
                <p>• <strong>Safari:</strong> Settings → Safari → Camera → Allow</p>
                <p>• <strong>Android:</strong> Settings → Apps → Browser → Permissions → Camera</p>
              </div>
              <div className="flex gap-2 w-full">
                <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                <Button variant="acg" className="flex-1 gap-1.5" onClick={requestCameraAndStart}>
                  <Camera className="h-4 w-4" />
                  Retry
                </Button>
              </div>
            </div>
          ) : isScanning ? (
            <div className="space-y-3">
              <div className="relative rounded-lg overflow-hidden bg-black">
                <div id={containerId.current} className="w-full aspect-square" />
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                  <div className="w-56 h-56 border-2 border-primary/50 rounded-lg relative">
                    <ScanLine className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-8 w-8 text-primary animate-pulse" />
                  </div>
                </div>
              </div>
              <p className="text-center text-xs text-muted-foreground">
                Point camera at the form QR code
              </p>
              <Button variant="outline" className="w-full" onClick={stopScanning}>
                <X className="h-4 w-4 mr-2" />
                Cancel
              </Button>
            </div>
          ) : (
            <div className="flex flex-col items-center py-8">
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/10 mb-4">
                <QrCode className="h-10 w-10 text-primary" />
              </div>
              <p className="text-sm font-medium mb-1">Scan to Get Your Form</p>
              <p className="text-xs text-muted-foreground text-center mb-6">
                Scan the QR code provided by your supervisor to get assigned a form and start collecting data.
              </p>
              <Button variant="acg" className="w-full" onClick={requestCameraAndStart}>
                <Camera className="h-4 w-4 mr-2" />
                Start Scanning
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default QRCodeScanner;

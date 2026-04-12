import { useRef, useState, useCallback, useEffect } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  QrCode,
  Camera,
  X,
  Check,
  Keyboard,
  ScanLine,
  RefreshCw,
} from "lucide-react";

interface BarcodeScannerProps {
  value: string | null;
  onChange: (code: string | null) => void;
  disabled?: boolean;
  acceptedFormats?: string[];
  autoTrigger?: boolean;
}

const BarcodeScanner = ({
  value,
  onChange,
  disabled,
  autoTrigger,
}: BarcodeScannerProps) => {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [showManualInput, setShowManualInput] = useState(false);
  const [manualValue, setManualValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const scannerContainerId = useRef(`scanner-${Math.random().toString(36).substr(2, 9)}`);

  const startScanning = useCallback(async () => {
    setError(null);

    try {
      const html5QrCode = new Html5Qrcode(scannerContainerId.current);
      scannerRef.current = html5QrCode;

      await html5QrCode.start(
        { facingMode: "environment" },
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1,
        },
        (decodedText) => {
          // On successful scan
          onChange(decodedText);
          stopScanning();
        },
        () => {
          // Ignore scan errors (no code found in frame)
        }
      );

      setIsScanning(true);
    } catch (err) {
      console.error("Error starting scanner:", err);
      setError("Unable to access camera. Please check permissions or use manual entry.");
      setIsScanning(false);
    }
  }, [onChange]);

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

  const handleManualSubmit = useCallback(() => {
    if (manualValue.trim()) {
      onChange(manualValue.trim());
      setManualValue("");
      setShowManualInput(false);
    }
  }, [manualValue, onChange]);

  const clearValue = useCallback(() => {
    onChange(null);
  }, [onChange]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (scannerRef.current) {
        scannerRef.current.stop().catch(console.error);
      }
    };
  }, []);

  if (value) {
    return (
      <Card className="border-border">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                <QrCode className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium">Code Scanned</p>
                <p className="text-xs text-muted-foreground font-mono break-all max-w-[200px]">
                  {value}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 rounded-full bg-primary/10 px-2 py-1 text-xs text-primary">
                <Check className="h-3 w-3" />
                Captured
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={clearValue}
                disabled={disabled}
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border">
      <CardContent className="p-4">
        {isScanning ? (
          <div className="space-y-3">
            <div className="relative rounded-lg overflow-hidden bg-black">
              <div
                id={scannerContainerId.current}
                className="w-full aspect-square"
              />
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                <div className="w-64 h-64 border-2 border-primary/50 rounded-lg relative">
                  <ScanLine className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-8 w-8 text-primary animate-pulse" />
                </div>
              </div>
            </div>
            <p className="text-center text-sm text-muted-foreground">
              Point camera at barcode or QR code
            </p>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={stopScanning}
            >
              <X className="h-4 w-4 mr-2" />
              Cancel
            </Button>
          </div>
        ) : showManualInput ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Input
                value={manualValue}
                onChange={(e) => setManualValue(e.target.value)}
                placeholder="Enter barcode value"
                onKeyDown={(e) => e.key === "Enter" && handleManualSubmit()}
              />
              <Button type="button" onClick={handleManualSubmit}>
                <Check className="h-4 w-4" />
              </Button>
            </div>
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={() => setShowManualInput(false)}
            >
              <Camera className="h-4 w-4 mr-2" />
              Use Camera Instead
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {error && (
              <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}

            <div className="flex flex-col items-center justify-center py-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                <QrCode className="h-8 w-8 text-muted-foreground" />
              </div>
              <p className="mt-3 text-sm font-medium">Scan Barcode or QR Code</p>
              <p className="text-xs text-muted-foreground">
                Use camera or enter manually
              </p>
            </div>

            <div className="flex gap-2">
              <Button
                type="button"
                variant="default"
                className="flex-1"
                onClick={startScanning}
                disabled={disabled}
              >
                <Camera className="h-4 w-4 mr-2" />
                Scan
              </Button>
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => setShowManualInput(true)}
                disabled={disabled}
              >
                <Keyboard className="h-4 w-4 mr-2" />
                Manual
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default BarcodeScanner;

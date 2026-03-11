import { useState, useRef } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, QrCode, Copy, Check } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface FormQRCodeProps {
  formId: string;
  formName: string;
  projectName?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const FormQRCode = ({ formId, formName, projectName, open, onOpenChange }: FormQRCodeProps) => {
  const [copied, setCopied] = useState(false);
  const qrRef = useRef<HTMLDivElement>(null);

  // Build a deep link URL that opens the form filler directly
  const baseUrl = window.location.origin;
  const formUrl = `${baseUrl}/?action=fill&formId=${formId}`;

  const handleDownloadPNG = () => {
    if (!qrRef.current) return;
    const svg = qrRef.current.querySelector("svg");
    if (!svg) return;

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const size = 1024;
    canvas.width = size;
    canvas.height = size + 120; // extra space for label

    // White background
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw QR code
    const svgData = new XMLSerializer().serializeToString(svg);
    const img = new Image();
    img.onload = () => {
      const padding = 64;
      ctx.drawImage(img, padding, padding, size - padding * 2, size - padding * 2);

      // Draw label
      ctx.fillStyle = "#1a1a2e";
      ctx.font = "bold 28px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(formName, size / 2, size + 40);

      if (projectName) {
        ctx.fillStyle = "#666";
        ctx.font = "20px sans-serif";
        ctx.fillText(projectName, size / 2, size + 75);
      }

      // Download
      const link = document.createElement("a");
      link.download = `QR-${formName.replace(/[^a-zA-Z0-9]/g, "_")}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();

      toast({ title: "QR Code Downloaded", description: `PNG saved for "${formName}"` });
    };
    img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgData)));
  };

  const handleCopyUrl = async () => {
    await navigator.clipboard.writeText(formUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ title: "Link Copied", description: "Form link copied to clipboard." });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <QrCode className="h-5 w-5 text-primary" />
            Form QR Code
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4 py-4">
          <div ref={qrRef} className="rounded-xl border border-border bg-white p-6">
            <QRCodeSVG
              value={formUrl}
              size={220}
              level="H"
              includeMargin={false}
              fgColor="#1a1a2e"
            />
          </div>

          <div className="text-center">
            <p className="font-medium text-foreground text-sm">{formName}</p>
            {projectName && (
              <p className="text-xs text-muted-foreground mt-0.5">{projectName}</p>
            )}
          </div>

          <div className="w-full rounded-lg bg-muted/50 px-3 py-2">
            <p className="text-xs text-muted-foreground break-all font-mono">{formUrl}</p>
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" className="flex-1" onClick={handleCopyUrl}>
            {copied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
            {copied ? "Copied!" : "Copy Link"}
          </Button>
          <Button variant="acg" className="flex-1" onClick={handleDownloadPNG}>
            <Download className="mr-2 h-4 w-4" />
            Download PNG
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default FormQRCode;

import { useRef } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Copy, Download, MessageSquareHeart, QrCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import handsEmblem from "@/assets/hands-emblem.png";

interface Props {
  projectId: string;
  projectName: string;
}

/** Public CCFF link + downloadable QR poster for a project. */
const FeedbackQrCard = ({ projectId, projectName }: Props) => {
  const { toast } = useToast();
  const posterRef = useRef<HTMLDivElement>(null);
  const url = `${window.location.origin}/feedback/${projectId}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: "Link copied", description: "Share it with the community." });
    } catch {
      toast({ title: "Could not copy", description: url, variant: "destructive" });
    }
  };

  const download = () => {
    const svg = posterRef.current?.querySelector("svg");
    if (!svg) return;
    const xml = new XMLSerializer().serializeToString(svg);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const scale = 4;
      canvas.width = 240 * scale;
      canvas.height = 240 * scale;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const a = document.createElement("a");
      a.href = canvas.toDataURL("image/png");
      a.download = `CCFF-QR-${projectName.replace(/[^a-z0-9]+/gi, "-")}.png`;
      a.click();
    };
    img.src = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(xml)))}`;
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50">
          <QrCode className="h-5 w-5 text-teal-600" />
        </div>
        <div>
          <h3 className="font-semibold text-slate-900">Community feedback QR code</h3>
          <p className="mt-0.5 text-sm text-slate-500">
            Anyone can scan this with any phone camera — no login needed — to open the
            Community-based Complaints and Feedback Form for <span className="font-medium text-slate-700">{projectName}</span>.
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-col items-center gap-4 sm:flex-row">
        <div ref={posterRef} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_10px_30px_-18px_rgba(15,23,42,0.35)]">
          <QRCodeSVG value={url} size={180} level="H" fgColor="#0f172a" imageSettings={{ src: handsEmblem, height: 34, width: 34, excavate: true }} />
        </div>
        <div className="flex-1 space-y-3">
          <div className="rounded-xl bg-slate-50 px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Public form link</p>
            <p className="mt-0.5 break-all font-mono text-xs text-slate-700">{url}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={copy} className="rounded-lg">
              <Copy className="mr-1.5 h-3.5 w-3.5" /> Copy link
            </Button>
            <Button size="sm" onClick={download} className="rounded-lg bg-teal-600 hover:bg-teal-700">
              <Download className="mr-1.5 h-3.5 w-3.5" /> Download QR poster
            </Button>
          </div>
          <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-slate-400">
            <MessageSquareHeart className="mt-0.5 h-3 w-3 shrink-0" />
            Print and display at facilities, distribution points and community meetings so people can
            share complaints, suggestions or appreciation at any time.
          </p>
        </div>
      </div>
    </div>
  );
};

export default FeedbackQrCard;

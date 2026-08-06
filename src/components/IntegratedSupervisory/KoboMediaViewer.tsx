/**
 * Professional image viewer for KoboToolbox attachments.
 * - `KoboThumb`: lazy authenticated thumbnail used inside data tables.
 * - `KoboLightbox`: full-screen viewer with zoom, rotate, download and paging.
 */
import { useCallback, useEffect, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ChevronLeft, ChevronRight, Download, ImageOff, Loader2, RotateCw, ZoomIn, ZoomOut,
} from "lucide-react";
import { loadAttachment, type GalleryItem, type KoboAttachment } from "./koboMedia";
import type { KoboConfig } from "./koboClient";

export function useAttachmentSrc(cfg: KoboConfig | null, url: string | undefined, enabled = true) {
  const [src, setSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    if (!enabled || !url) { setSrc(null); return; }
    setLoading(true); setFailed(false);
    loadAttachment(cfg, url).then((d) => {
      if (!alive) return;
      setSrc(d);
      setFailed(!d);
      setLoading(false);
    });
    return () => { alive = false; };
  }, [cfg, url, enabled]);

  return { src, loading, failed };
}

export function KoboThumb({
  cfg, attachment, label, onOpen, size = 40,
}: {
  cfg: KoboConfig | null;
  attachment: KoboAttachment;
  label?: string;
  onOpen?: () => void;
  size?: number;
}) {
  const { src, loading, failed } = useAttachmentSrc(cfg, attachment.smallUrl || attachment.downloadUrl);
  return (
    <button
      type="button"
      onClick={onOpen}
      title={label || attachment.basename}
      className="group relative overflow-hidden rounded-md border border-border bg-muted hover:ring-2 hover:ring-primary/50 transition"
      style={{ width: size, height: size }}
    >
      {src ? (
        <img src={src} alt={label || attachment.basename} loading="lazy" className="h-full w-full object-cover" />
      ) : (
        <span className="flex h-full w-full items-center justify-center text-muted-foreground">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageOff className="h-4 w-4" />}
        </span>
      )}
      {failed && <span className="absolute inset-0 bg-destructive/10" />}
    </button>
  );
}

export function KoboLightbox({
  cfg, items, index, onIndexChange, onClose,
}: {
  cfg: KoboConfig | null;
  items: GalleryItem[] | KoboAttachment[];
  index: number;
  onIndexChange: (i: number) => void;
  onClose: () => void;
}) {
  const open = index >= 0 && index < items.length;
  const item = open ? (items[index] as GalleryItem) : null;
  const { src, loading } = useAttachmentSrc(cfg, item?.downloadUrl, open);
  const [zoom, setZoom] = useState(1);
  const [rot, setRot] = useState(0);

  useEffect(() => { setZoom(1); setRot(0); }, [index]);

  const step = useCallback((d: number) => {
    const next = index + d;
    if (next >= 0 && next < items.length) onIndexChange(next);
  }, [index, items.length, onIndexChange]);

  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") step(1);
      if (e.key === "ArrowLeft") step(-1);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, step]);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-5xl p-0 overflow-hidden">
        <div className="flex items-center justify-between gap-2 border-b bg-muted/40 px-4 py-2">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">{item?.basename ?? "Attachment"}</div>
            <div className="text-[11px] text-muted-foreground truncate">
              {item?.questionXpath ? `${item.questionXpath} · ` : ""}
              {item?.submittedAt ? new Date(item.submittedAt).toLocaleString() : ""}
              {item?.submissionId ? ` · #${item.submissionId}` : ""}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Badge variant="outline" className="text-[10px]">{index + 1} / {items.length}</Badge>
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setZoom((z) => Math.max(0.25, z - 0.25))}><ZoomOut className="h-4 w-4" /></Button>
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setZoom((z) => Math.min(5, z + 0.25))}><ZoomIn className="h-4 w-4" /></Button>
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setRot((r) => (r + 90) % 360)}><RotateCw className="h-4 w-4" /></Button>
            {src && (
              <a href={src} download={item?.basename || "kobo-attachment.jpg"}>
                <Button size="icon" variant="ghost" className="h-8 w-8"><Download className="h-4 w-4" /></Button>
              </a>
            )}
          </div>
        </div>

        <div className="relative flex h-[70vh] items-center justify-center overflow-auto bg-black/90">
          {loading && <Loader2 className="h-8 w-8 animate-spin text-white/70" />}
          {!loading && src && (
            <img
              src={src}
              alt={item?.basename ?? ""}
              className="max-h-full max-w-full transition-transform"
              style={{ transform: `scale(${zoom}) rotate(${rot}deg)` }}
            />
          )}
          {!loading && !src && (
            <div className="text-center text-sm text-white/70">
              <ImageOff className="mx-auto mb-2 h-8 w-8" />
              This attachment could not be loaded. Check the Kobo token in Sync Settings.
            </div>
          )}
          {items.length > 1 && (
            <>
              <Button size="icon" variant="secondary" className="absolute left-3 top-1/2 h-9 w-9 -translate-y-1/2 opacity-80" onClick={() => step(-1)} disabled={index === 0}>
                <ChevronLeft className="h-5 w-5" />
              </Button>
              <Button size="icon" variant="secondary" className="absolute right-3 top-1/2 h-9 w-9 -translate-y-1/2 opacity-80" onClick={() => step(1)} disabled={index >= items.length - 1}>
                <ChevronRight className="h-5 w-5" />
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

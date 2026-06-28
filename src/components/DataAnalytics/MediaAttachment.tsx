import { useMemo, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Image as ImageIcon, Video as VideoIcon, Music, FileText, PenTool,
  Download, Eye, Paperclip,
} from "lucide-react";

/**
 * MediaAttachment — universal, professional viewer for media captured inside
 * form submissions (photos, videos, audio, signatures & documents). Field
 * values are stored as base64 data URLs (and occasionally http(s) URLs), either
 * as a single string or an array of strings. This component renders inline
 * previews, a fullscreen lightbox and a one-tap download for every kind.
 *
 * It is intentionally tolerant: it sniffs the MIME from the data-URL header or
 * the file extension, so it works regardless of which question type produced
 * the value.
 */

export type MediaKind = "image" | "video" | "audio" | "signature" | "file";

const IMG_EXT = /\.(png|jpe?g|gif|webp|bmp|svg|heic|heif)(\?|$)/i;
const VID_EXT = /\.(mp4|webm|mov|m4v|avi|mkv|3gp)(\?|$)/i;
const AUD_EXT = /\.(mp3|wav|ogg|m4a|aac|webm|oga)(\?|$)/i;

/** Is this string a renderable media reference (data URL or http media URL)? */
export function isMediaString(v: unknown): v is string {
  if (typeof v !== "string") return false;
  const s = v.trim();
  if (s.startsWith("data:")) {
    return /^data:(image|video|audio|application\/pdf|application\/octet-stream)/i.test(s);
  }
  if (/^https?:\/\//i.test(s)) {
    return IMG_EXT.test(s) || VID_EXT.test(s) || AUD_EXT.test(s) || /\.(pdf|docx?|xlsx?|csv|txt)(\?|$)/i.test(s);
  }
  return false;
}

/** True when a submission value contains one or more media references. */
export function isMediaValue(v: unknown): boolean {
  if (isMediaString(v)) return true;
  if (Array.isArray(v)) return v.some(isMediaString);
  return false;
}

function detectKind(src: string, questionType?: string): MediaKind {
  if (questionType === "signature") return "signature";
  const header = src.startsWith("data:") ? src.slice(5, src.indexOf(";")) : "";
  const mime = header.toLowerCase();
  if (mime.startsWith("image/") || IMG_EXT.test(src)) {
    // A PNG produced by a signature pad is still best shown as a signature.
    return questionType === "signature" ? "signature" : "image";
  }
  if (mime.startsWith("video/") || VID_EXT.test(src)) return "video";
  if (mime.startsWith("audio/") || AUD_EXT.test(src)) return "audio";
  return "file";
}

function guessFilename(src: string, kind: MediaKind, index: number): string {
  if (/^https?:\/\//i.test(src)) {
    try {
      const u = new URL(src);
      const base = u.pathname.split("/").pop();
      if (base) return decodeURIComponent(base);
    } catch { /* ignore */ }
  }
  const ext =
    kind === "image" || kind === "signature" ? "png"
      : kind === "video" ? "mp4"
        : kind === "audio" ? "webm"
          : src.startsWith("data:application/pdf") ? "pdf" : "bin";
  return `attachment-${index + 1}.${ext}`;
}

function downloadMedia(src: string, filename: string) {
  const a = document.createElement("a");
  a.href = src;
  a.download = filename;
  a.rel = "noopener";
  // Data URLs and same-origin URLs download directly; cross-origin opens.
  if (/^https?:\/\//i.test(src)) a.target = "_blank";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

const KindIcon = ({ kind, className }: { kind: MediaKind; className?: string }) => {
  switch (kind) {
    case "image": return <ImageIcon className={className} />;
    case "video": return <VideoIcon className={className} />;
    case "audio": return <Music className={className} />;
    case "signature": return <PenTool className={className} />;
    default: return <FileText className={className} />;
  }
};

interface MediaAttachmentProps {
  value: unknown;
  /** Original form question type, helps disambiguate signatures. */
  questionType?: string;
  /** Compact mode renders a small chip suited for dense tables. */
  compact?: boolean;
  label?: string;
}

const MediaAttachment = ({ value, questionType, compact, label }: MediaAttachmentProps) => {
  const items = useMemo(() => {
    const raw = Array.isArray(value) ? value : [value];
    return raw
      .filter(isMediaString)
      .map((src, index) => {
        const kind = detectKind(src, questionType);
        return { src, kind, filename: guessFilename(src, kind, index) };
      });
  }, [value, questionType]);

  const [lightbox, setLightbox] = useState<{ src: string; kind: MediaKind; filename: string } | null>(null);

  if (items.length === 0) {
    return <span className="text-xs italic text-muted-foreground">—</span>;
  }

  if (compact) {
    return (
      <>
        <div className="flex flex-wrap items-center gap-1.5">
          {items.map((item, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setLightbox(item)}
              className="group relative inline-flex items-center gap-1 overflow-hidden rounded-md border border-border bg-muted/40 px-1.5 py-1 text-[11px] text-foreground transition hover:border-primary/50 hover:bg-primary/5"
              title={item.filename}
            >
              {item.kind === "image" || item.kind === "signature" ? (
                <img src={item.src} alt={item.filename} className="h-6 w-6 rounded object-cover" loading="lazy" />
              ) : (
                <KindIcon kind={item.kind} className="h-3.5 w-3.5 text-primary" />
              )}
              <Eye className="h-3 w-3 opacity-50 group-hover:opacity-100" />
            </button>
          ))}
        </div>
        {lightbox && (
          <MediaLightbox item={lightbox} onClose={() => setLightbox(null)} onDownload={downloadMedia} />
        )}
      </>
    );
  }

  return (
    <>
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2.5">
          {items.map((item, i) => (
            <div
              key={i}
              className="group relative w-32 overflow-hidden rounded-xl border border-border bg-card shadow-sm"
            >
              <button
                type="button"
                onClick={() => setLightbox(item)}
                className="block w-full"
                title={`Open ${item.filename}`}
              >
                {item.kind === "image" || item.kind === "signature" ? (
                  <img
                    src={item.src}
                    alt={item.filename}
                    className={`h-24 w-full object-cover ${item.kind === "signature" ? "bg-white object-contain p-1" : ""}`}
                    loading="lazy"
                  />
                ) : item.kind === "video" ? (
                  <div className="relative h-24 w-full bg-black">
                    <video src={item.src} className="h-full w-full object-cover" muted preload="metadata" />
                    <span className="absolute inset-0 flex items-center justify-center">
                      <VideoIcon className="h-7 w-7 text-white/90 drop-shadow" />
                    </span>
                  </div>
                ) : (
                  <div className="flex h-24 w-full flex-col items-center justify-center gap-1 bg-muted/50">
                    <KindIcon kind={item.kind} className="h-7 w-7 text-primary" />
                    <span className="px-1 text-center text-[10px] text-muted-foreground line-clamp-1">{item.filename}</span>
                  </div>
                )}
              </button>
              <div className="flex items-center justify-between gap-1 border-t border-border/60 px-2 py-1.5">
                <span className="inline-flex items-center gap-1 text-[10px] capitalize text-muted-foreground">
                  <KindIcon kind={item.kind} className="h-3 w-3" /> {item.kind}
                </span>
                <button
                  type="button"
                  onClick={() => downloadMedia(item.src, item.filename)}
                  className="rounded p-1 text-muted-foreground transition hover:bg-primary/10 hover:text-primary"
                  title="Download"
                >
                  <Download className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
        {label && (
          <p className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
            <Paperclip className="h-3 w-3" /> {items.length} {label}
          </p>
        )}
      </div>
      {lightbox && (
        <MediaLightbox item={lightbox} onClose={() => setLightbox(null)} onDownload={downloadMedia} />
      )}
    </>
  );
};

function MediaLightbox({
  item, onClose, onDownload,
}: {
  item: { src: string; kind: MediaKind; filename: string };
  onClose: () => void;
  onDownload: (src: string, filename: string) => void;
}) {
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl overflow-hidden p-0">
        <DialogHeader className="flex flex-row items-center justify-between gap-2 border-b px-4 py-3">
          <DialogTitle className="flex items-center gap-2 truncate text-sm">
            <KindIcon kind={item.kind} className="h-4 w-4 text-primary" />
            <span className="truncate">{item.filename}</span>
          </DialogTitle>
          <Button size="sm" variant="outline" className="mr-6 shrink-0 gap-1.5" onClick={() => onDownload(item.src, item.filename)}>
            <Download className="h-4 w-4" /> Download
          </Button>
        </DialogHeader>
        <div className="flex max-h-[75vh] items-center justify-center overflow-auto bg-muted/30 p-4">
          {item.kind === "image" || item.kind === "signature" ? (
            <img
              src={item.src}
              alt={item.filename}
              className={`max-h-[70vh] w-auto max-w-full rounded-lg object-contain ${item.kind === "signature" ? "bg-white p-2" : ""}`}
            />
          ) : item.kind === "video" ? (
            <video src={item.src} controls autoPlay className="max-h-[70vh] w-full rounded-lg bg-black" />
          ) : item.kind === "audio" ? (
            <div className="w-full max-w-md space-y-4 py-8 text-center">
              <Music className="mx-auto h-12 w-12 text-primary" />
              <audio src={item.src} controls autoPlay className="w-full" />
            </div>
          ) : item.src.startsWith("data:application/pdf") || /\.pdf(\?|$)/i.test(item.src) ? (
            <iframe src={item.src} title={item.filename} className="h-[70vh] w-full rounded-lg border-0 bg-white" />
          ) : (
            <div className="w-full max-w-sm space-y-4 py-10 text-center">
              <FileText className="mx-auto h-12 w-12 text-primary" />
              <p className="text-sm text-muted-foreground">This document can't be previewed inline.</p>
              <Button onClick={() => onDownload(item.src, item.filename)} className="gap-1.5">
                <Download className="h-4 w-4" /> Download to view
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default MediaAttachment;

// Multiple-file attachment field for beneficiary documents, pictures, videos
// and audio clips.
//
// Files upload straight into the private beneficiary media store when there is
// a connection and stay on the device otherwise, so a field officer can attach
// evidence with no network and still keep everything.

import { useRef, useState } from "react";
import {
  CloudOff, FileText, Film, Image as ImageIcon, Loader2, Music, Paperclip, Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { fileToDataUrl, uploadBeneficiaryMedia } from "@/lib/programmeModule/media";

export interface Attachment {
  /** Storage path when uploaded, or a data URL when kept on the device. */
  ref: string;
  name: string;
  mime: string;
  size: number;
  kind: "image" | "video" | "audio" | "document";
  pending?: boolean;
  captured_at: string;
}

interface Props {
  label: string;
  hint?: string;
  accept?: string;
  value: Attachment[];
  projectId: string;
  beneficiaryId: string;
  onChange: (next: Attachment[]) => void;
}

export const kindOf = (mime: string): Attachment["kind"] =>
  mime.startsWith("image/") ? "image"
    : mime.startsWith("video/") ? "video"
      : mime.startsWith("audio/") ? "audio" : "document";

const ICONS = { image: ImageIcon, video: Film, audio: Music, document: FileText };

const prettySize = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

const AttachmentsField = ({
  label, hint, accept, value, projectId, beneficiaryId, onChange,
}: Props) => {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const add = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    const added: Attachment[] = [];
    for (const file of Array.from(files)) {
      try {
        const mime = file.type || "application/octet-stream";
        const base = {
          name: file.name || "attachment",
          mime,
          size: file.size,
          kind: kindOf(mime),
          captured_at: new Date().toISOString(),
        };
        if (navigator.onLine) {
          try {
            const path = await uploadBeneficiaryMedia(file, projectId, beneficiaryId);
            added.push({ ...base, ref: path });
            continue;
          } catch {
            /* fall through to on-device storage */
          }
        }
        added.push({ ...base, ref: await fileToDataUrl(file), pending: true });
      } catch (e) {
        toast({
          title: `Could not attach ${file.name}`,
          description: (e as Error).message,
          variant: "destructive",
        });
      }
    }
    if (added.length) onChange([...value, ...added]);
    if (added.some((a) => a.pending)) {
      toast({ title: "Kept on this device", description: "Attachments upload with the record." });
    }
    setBusy(false);
  };

  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium">{label}</Label>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={accept}
        className="hidden"
        onChange={(e) => { void add(e.target.files); e.target.value = ""; }}
      />
      <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => inputRef.current?.click()}>
        {busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Paperclip className="mr-1 h-3.5 w-3.5" />}
        Add files
      </Button>

      {value.length > 0 && (
        <ul className="space-y-1.5">
          {value.map((a, i) => {
            const Icon = ICONS[a.kind];
            return (
              <li
                key={`${a.ref.slice(0, 24)}-${i}`}
                className="flex items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-2"
              >
                <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-foreground">{a.name}</span>
                  <span className="block text-xs text-muted-foreground">
                    {prettySize(a.size)}
                    {a.pending && (
                      <span className="ml-1 inline-flex items-center gap-1 text-amber-600">
                        <CloudOff className="h-3 w-3" /> on this device
                      </span>
                    )}
                  </span>
                </span>
                <Button
                  type="button" variant="ghost" size="sm"
                  onClick={() => onChange(value.filter((_, idx) => idx !== i))}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
};

export default AttachmentsField;

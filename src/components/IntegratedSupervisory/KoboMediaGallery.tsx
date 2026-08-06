/**
 * Photo & signature gallery for a linked KoboToolbox form.
 * Renders every image attachment across submissions with geography filters and
 * a full-screen lightbox.
 */
import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Camera, Search } from "lucide-react";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { buildGallery, type GalleryItem } from "./koboMedia";
import { KoboLightbox, KoboThumb } from "./KoboMediaViewer";
import type { KoboCache, KoboConfig } from "./koboClient";

const val = (r: any, leaf: string) => {
  for (const [k, v] of Object.entries(r ?? {})) {
    if (k.split("/").pop() === leaf && v != null && v !== "") return String(v);
  }
  return "";
};

export default function KoboMediaGallery({
  cache, cfg, title = "Photos & signatures",
}: { cache: KoboCache | null; cfg: KoboConfig | null; title?: string }) {
  const [q, setQ] = useState("");
  const dq = useDebouncedValue(q, 300);
  const [state, setState] = useState("__all");
  const [lga, setLga] = useState("__all");
  const [idx, setIdx] = useState(-1);

  const items = useMemo(() => buildGallery(cache?.results ?? []), [cache]);

  const stateOpts = useMemo(
    () => Array.from(new Set(items.map((i) => val(i.record, "State")).filter(Boolean))).sort(),
    [items],
  );
  const lgaOpts = useMemo(
    () => Array.from(new Set(items.map((i) => val(i.record, "LGA")).filter(Boolean))).sort(),
    [items],
  );

  const filtered = useMemo(() => {
    const needle = dq.trim().toLowerCase();
    return items.filter((i) => {
      if (state !== "__all" && val(i.record, "State") !== state) return false;
      if (lga !== "__all" && val(i.record, "LGA") !== lga) return false;
      if (needle) {
        const hay = `${i.basename} ${i.questionXpath ?? ""} ${val(i.record, "State")} ${val(i.record, "LGA")} ${val(i.record, "Ward")}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [items, dq, state, lga]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-background p-3">
        <div className="mr-auto">
          <div className="flex items-center gap-2 text-sm font-semibold"><Camera className="h-4 w-4 text-primary" /> {title}</div>
          <div className="text-[11px] text-muted-foreground">Images stream securely through the backend — the Kobo token never reaches the browser.</div>
        </div>
        <Badge variant="outline">{filtered.length.toLocaleString()} images</Badge>
        <Select value={state} onValueChange={setState}>
          <SelectTrigger className="h-9 w-40"><SelectValue placeholder="All States" /></SelectTrigger>
          <SelectContent className="max-h-72">
            <SelectItem value="__all">All States</SelectItem>
            {stateOpts.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={lga} onValueChange={setLga}>
          <SelectTrigger className="h-9 w-40"><SelectValue placeholder="All LGAs" /></SelectTrigger>
          <SelectContent className="max-h-72">
            <SelectItem value="__all">All LGAs</SelectItem>
            {lgaOpts.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search file, question or place..." className="h-9 pl-8" />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-lg border bg-background py-12 text-center text-sm text-muted-foreground">
          No image attachments in the synced submissions.
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6 xl:grid-cols-8">
          {filtered.map((item: GalleryItem, i) => (
            <figure key={`${item.submissionId}-${item.basename}-${i}`} className="overflow-hidden rounded-lg border bg-background">
              <div className="flex items-center justify-center bg-muted p-1">
                <KoboThumb cfg={cfg} attachment={item} size={104} onOpen={() => setIdx(i)} />
              </div>
              <figcaption className="space-y-0.5 px-2 py-1.5">
                <div className="truncate text-[11px] font-medium" title={item.questionXpath || item.basename}>
                  {item.questionXpath?.split("/").pop() || item.basename}
                </div>
                <div className="truncate text-[10px] text-muted-foreground">
                  {[val(item.record, "State"), val(item.record, "LGA")].filter(Boolean).join(" · ") || `#${item.submissionId}`}
                </div>
              </figcaption>
            </figure>
          ))}
        </div>
      )}

      <KoboLightbox cfg={cfg} items={filtered} index={idx} onIndexChange={setIdx} onClose={() => setIdx(-1)} />
    </div>
  );
}

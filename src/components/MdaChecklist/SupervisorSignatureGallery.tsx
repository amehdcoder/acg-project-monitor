import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { PenLine, Search, Download, MapPin, CalendarClock, User2, ZoomIn, ChevronDown } from "lucide-react";

const stripTags = (s?: string) => String(s || "").replace(/<[^>]*>/g, "").trim();

const isSignatureImage = (v: unknown): v is string =>
  typeof v === "string" && /^data:image\//i.test(v.trim());

interface MdaSubmission {
  id: string;
  state?: string | null; lga?: string | null; ward?: string | null;
  submitter?: string | null; submittedAt?: string | null;
  data?: Record<string, any>;
}

interface SignatureEntry {
  id: string;
  src: string;
  supervisor: string;
  state: string;
  lga: string;
  community: string;
  submittedAt: string | null;
}

/**
 * Recursively collect any signature image (data URL) stored under a key that
 * looks like a signature, across the (possibly nested) submission data object.
 */
function collectSignatures(data: Record<string, any> | undefined): string[] {
  const out: string[] = [];
  const walk = (obj: any, keyHint = "") => {
    if (!obj) return;
    if (isSignatureImage(obj)) {
      if (/sign|signature/i.test(keyHint)) out.push(obj.trim());
      return;
    }
    if (Array.isArray(obj)) { obj.forEach((v) => walk(v, keyHint)); return; }
    if (typeof obj === "object") {
      for (const [k, v] of Object.entries(obj)) walk(v, k);
    }
  };
  walk(data);
  return out;
}

function pickGeo(s: MdaSubmission, kind: "state" | "lga" | "community"): string {
  const d = s.data || {};
  if (kind === "state") return stripTags(s.state || d.state || d.state_name) || "";
  if (kind === "lga") return stripTags(s.lga || d.lga || d.LGA || d.local_government || d.local_government_area) || "";
  return stripTags(d.community || d.community_name || d.settlement_name || d.settlement) || "";
}

interface Props {
  submissions: MdaSubmission[];
}

/**
 * SupervisorSignatureGallery — a beautiful, searchable register of every
 * supervisor signature captured against the Integrated MDA Supervisory
 * Checklist. Each card shows the supervisor, their geography, the capture date
 * and the actual ink signature, with a zoom dialog and one-tap download.
 */
export default function SupervisorSignatureGallery({ submissions }: Props) {
  const [search, setSearch] = useState("");
  const [zoom, setZoom] = useState<SignatureEntry | null>(null);

  const entries = useMemo<SignatureEntry[]>(() => {
    const list: SignatureEntry[] = [];
    for (const s of submissions) {
      const sigs = collectSignatures(s.data);
      if (sigs.length === 0) continue;
      const supervisor = stripTags(s.submitter || s.data?.supervisor_name || s.data?.supervisor) || "Unknown supervisor";
      sigs.forEach((src, i) => {
        list.push({
          id: `${s.id}-${i}`,
          src,
          supervisor,
          state: pickGeo(s, "state"),
          lga: pickGeo(s, "lga"),
          community: pickGeo(s, "community"),
          submittedAt: s.submittedAt || null,
        });
      });
    }
    // Deduplicate: keep one signature per supervisor + community + image, newest first.
    const seen = new Set<string>();
    const deduped: SignatureEntry[] = [];
    for (const e of list.sort((a, b) => (b.submittedAt || "").localeCompare(a.submittedAt || ""))) {
      const k = [e.supervisor, e.state, e.lga, e.community, e.src].join("|").toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      deduped.push(e);
    }
    return deduped;
  }, [submissions]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((e) =>
      [e.supervisor, e.state, e.lga, e.community].join(" ").toLowerCase().includes(q),
    );
  }, [entries, search]);

  const download = (e: SignatureEntry) => {
    const a = document.createElement("a");
    a.href = e.src;
    a.download = `signature-${e.supervisor.replace(/\s+/g, "_")}-${e.id.slice(0, 8)}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const [open, setOpen] = useState(true);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card className="overflow-hidden">
        <CollapsibleTrigger asChild>
          <button type="button" className="flex w-full items-center gap-2 px-4 py-3 text-left transition-colors hover:bg-muted/50">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <PenLine className="h-4 w-4" />
            </span>
            <span className="text-sm font-semibold text-foreground">Supervisor Signatures</span>
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">{entries.length}</span>
            <ChevronDown className={`ml-auto h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
      <CardContent>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] text-muted-foreground">
            Authenticated ink signatures captured at the point of supervision (duplicates removed). Tap a card to enlarge or download.
          </p>
          {entries.length > 0 && (
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search supervisor or location…"
                className="h-8 w-56 pl-8 text-xs"
              />
            </div>
          )}
        </div>
        {entries.length === 0 ? (
          <p className="py-8 text-center text-xs text-muted-foreground">
            No supervisor signatures captured yet. They appear here automatically as supervisors sign and submit the checklist.
          </p>
        ) : filtered.length === 0 ? (
          <p className="py-8 text-center text-xs text-muted-foreground">No signatures match “{search}”.</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filtered.map((e) => (
              <div
                key={e.id}
                className="group flex flex-col overflow-hidden rounded-lg border border-border bg-card shadow-sm transition-shadow hover:shadow-card"
              >
                <button
                  type="button"
                  onClick={() => setZoom(e)}
                  className="relative flex h-28 items-center justify-center border-b border-border/60 bg-white p-2"
                  aria-label={`Enlarge signature by ${e.supervisor}`}
                >
                  <img src={e.src} alt={`Signature of ${e.supervisor}`} className="max-h-full max-w-full object-contain" />
                  <span className="absolute right-1.5 top-1.5 rounded-md bg-black/55 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100">
                    <ZoomIn className="h-3.5 w-3.5" />
                  </span>
                </button>
                <div className="flex flex-1 flex-col gap-1 p-2.5 text-[11px]">
                  <p className="flex items-center gap-1.5 font-semibold text-foreground">
                    <User2 className="h-3.5 w-3.5 shrink-0 text-primary" />
                    <span className="truncate">{e.supervisor}</span>
                  </p>
                  {(e.community || e.lga || e.state) && (
                    <p className="flex items-center gap-1.5 text-muted-foreground">
                      <MapPin className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">
                        {[e.community, e.lga, e.state].filter(Boolean).join(" · ") || "Location not recorded"}
                      </span>
                    </p>
                  )}
                  {e.submittedAt && (
                    <p className="flex items-center gap-1.5 text-muted-foreground">
                      <CalendarClock className="h-3.5 w-3.5 shrink-0" />
                      {new Date(e.submittedAt).toLocaleString()}
                    </p>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-auto h-7 w-full text-[11px]"
                    onClick={() => download(e)}
                  >
                    <Download className="mr-1.5 h-3 w-3" /> Download
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
        </CollapsibleContent>

      <Dialog open={!!zoom} onOpenChange={(o) => !o && setZoom(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm">
              <PenLine className="h-4 w-4 text-primary" />
              {zoom?.supervisor}
            </DialogTitle>
          </DialogHeader>
          {zoom && (
            <div className="space-y-3">
              <div className="flex items-center justify-center rounded-lg border border-border bg-white p-4">
                <img src={zoom.src} alt={`Signature of ${zoom.supervisor}`} className="max-h-[55vh] max-w-full object-contain" />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
                <span>{[zoom.community, zoom.lga, zoom.state].filter(Boolean).join(" · ")}</span>
                {zoom.submittedAt && <span>{new Date(zoom.submittedAt).toLocaleString()}</span>}
              </div>
              <Button size="sm" variant="outline" className="w-full" onClick={() => download(zoom)}>
                <Download className="mr-1.5 h-3.5 w-3.5" /> Download signature
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
      </Card>
    </Collapsible>
  );
}

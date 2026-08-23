/**
 * Drill-down for a single GRID3 coordinate-accuracy exception.
 *
 * Shows every supervisor submission behind the flagged row: captured
 * coordinates, submission / capture timestamps, the monitor, the full
 * verdict provenance (registry record, match method, lookup time) and any
 * evidence attachments (photos, audio, signatures) carried by the record.
 */
import { useMemo } from "react";
import {
  Camera, Clock, Compass, ExternalLink, FileText, MapPin, Paperclip, ShieldAlert, User,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { resolveChecklistLabel, resolveChecklistValue } from "./checklistSchema";

type Row = Record<string, unknown>;

export interface Grid3DrillSpec {
  title: string;
  verdictLabel: string;
  verdictNote: string;
  accent: string;
  radiusKm: number;
  distanceM: number | null;
  provenance: {
    settlement: string;
    ward: string;
    lga: string;
    state: string;
    lat: number;
    lng: number;
    method: string;
    lookupAt: string;
    source: string;
  } | null;
  rows: Row[];
}

const s = (v: unknown) => String(v ?? "").trim();

interface Attachment { name: string; url: string; kind: "image" | "audio" | "file" }

function attachmentsOf(row: Row): Attachment[] {
  const out: Attachment[] = [];
  const raw = row._attachments;
  if (Array.isArray(raw)) {
    for (const a of raw as Record<string, unknown>[]) {
      const url = s(a.download_url ?? a.download_medium_url ?? a.url);
      if (!url) continue;
      const name = s(a.filename ?? a.media_file_basename ?? url).split("/").pop() || "attachment";
      const mime = s(a.mimetype);
      out.push({
        name,
        url,
        kind: /^image/.test(mime) || /\.(jpe?g|png|webp|gif)$/i.test(name)
          ? "image"
          : /^audio/.test(mime) || /\.(mp3|m4a|ogg|wav|amr)$/i.test(name)
            ? "audio"
            : "file",
      });
    }
  }
  // media referenced directly on fields but not exposed through _attachments
  for (const [k, v] of Object.entries(row)) {
    if (k.startsWith("_") || typeof v !== "string") continue;
    if (!/^https?:\/\//.test(v)) continue;
    if (!/\.(jpe?g|png|webp|gif|mp3|m4a|ogg|wav|amr|pdf)$/i.test(v)) continue;
    if (out.some((a) => a.url === v)) continue;
    out.push({
      name: v.split("/").pop() || k,
      url: v,
      kind: /\.(jpe?g|png|webp|gif)$/i.test(v) ? "image" : /\.(mp3|m4a|ogg|wav|amr)$/i.test(v) ? "audio" : "file",
    });
  }
  return out;
}

const KEY_FIELDS = [
  "State", "LGA", "Ward", "FLHF", "COMMUNITIES", "Designation",
  "Independent_Monitor_s_Name", "Name_of_Supervisor", "MDA_Campaign_Type",
  "has_treatment_commenced", "Status_of_MDA", "Any_SAE_Complain",
];

const fmtTime = (v: unknown) => {
  const t = s(v);
  if (!t) return "—";
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? t : d.toLocaleString();
};

export default function Grid3MismatchDetailDialog({
  spec, onClose,
}: { spec: Grid3DrillSpec | null; onClose: () => void }) {
  const rows = useMemo(() => spec?.rows ?? [], [spec]);
  if (!spec) return null;

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[88vh] max-w-4xl overflow-hidden p-0">
        <DialogHeader className="border-b p-4" style={{ background: `${spec.accent}12` }}>
          <DialogTitle className="flex flex-wrap items-center gap-2 text-sm">
            <ShieldAlert className="h-4 w-4" style={{ color: spec.accent }} />
            {spec.title}
            <Badge variant="outline" className="text-[10px]" style={{ borderColor: spec.accent, color: spec.accent }}>
              {spec.verdictLabel}
            </Badge>
            <Badge variant="outline" className="text-[10px]">
              {rows.length} submission{rows.length === 1 ? "" : "s"}
            </Badge>
          </DialogTitle>
          <DialogDescription className="text-[11px] leading-relaxed">
            {spec.verdictNote} Threshold in force: {spec.radiusKm} km.
            {spec.distanceM != null && ` Measured separation: ${
              spec.distanceM >= 1000 ? `${(spec.distanceM / 1000).toFixed(2)} km` : `${Math.round(spec.distanceM)} m`
            }.`}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[70vh]">
          <div className="space-y-3 p-4">
            {/* provenance */}
            {spec.provenance && (
              <div className="rounded-lg border bg-muted/40 p-3">
                <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide">
                  <Compass className="h-3.5 w-3.5" /> Audit provenance — source of truth
                </p>
                <div className="grid gap-2 text-[11px] sm:grid-cols-2 lg:grid-cols-3">
                  <div><span className="text-muted-foreground">Registry settlement</span><p className="font-medium">{spec.provenance.settlement}</p></div>
                  <div><span className="text-muted-foreground">Registry ward / LGA</span><p className="font-medium">{spec.provenance.ward} · {spec.provenance.lga}</p></div>
                  <div><span className="text-muted-foreground">Registry state</span><p className="font-medium">{spec.provenance.state}</p></div>
                  <div>
                    <span className="text-muted-foreground">Registry coordinate</span>
                    <p className="font-mono text-[10.5px]">{spec.provenance.lat.toFixed(5)}, {spec.provenance.lng.toFixed(5)}</p>
                  </div>
                  <div><span className="text-muted-foreground">Match method</span><p className="font-medium">{spec.provenance.method}</p></div>
                  <div><span className="text-muted-foreground">Lookup timestamp</span><p className="font-medium">{fmtTime(spec.provenance.lookupAt)}</p></div>
                  <div className="sm:col-span-2 lg:col-span-3">
                    <span className="text-muted-foreground">Source dataset</span>
                    <p className="font-medium">{spec.provenance.source}</p>
                  </div>
                </div>
              </div>
            )}

            {/* submissions */}
            {rows.map((r, i) => {
              const files = attachmentsOf(r);
              const lat = Number((r as any).__lat);
              const lng = Number((r as any).__lng);
              return (
                <div key={`${s(r._id) || i}`} className="overflow-hidden rounded-lg border">
                  <div className="flex flex-wrap items-center gap-2 border-b bg-muted/30 px-3 py-2 text-[11px]">
                    <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="font-semibold">Submission #{s(r._id) || i + 1}</span>
                    <span className="inline-flex items-center gap-1 text-muted-foreground">
                      <User className="h-3 w-3" />
                      {s(r.Independent_Monitor_s_Name) || s(r.Name_of_Supervisor) || "Unspecified"}
                    </span>
                    <span className="inline-flex items-center gap-1 text-muted-foreground">
                      <Clock className="h-3 w-3" /> submitted {fmtTime(r._submission_time)}
                    </span>
                    {!!s(r.start) && (
                      <span className="text-muted-foreground">· started {fmtTime(r.start)}</span>
                    )}
                    {!!s(r.end) && (
                      <span className="text-muted-foreground">· ended {fmtTime(r.end)}</span>
                    )}
                  </div>

                  <div className="grid gap-3 p-3 md:grid-cols-2">
                    <div className="space-y-1.5">
                      <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        <MapPin className="h-3 w-3" /> Captured coordinate
                      </p>
                      <p className="font-mono text-[11px]">
                        {Number.isFinite(lat) && Number.isFinite(lng)
                          ? `${lat.toFixed(6)}, ${lng.toFixed(6)}`
                          : s(r.GPS) || "—"}
                      </p>
                      {Number.isFinite(lat) && Number.isFinite(lng) && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-[10.5px]"
                          onClick={() =>
                            window.open(`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`, "_blank", "noopener")
                          }
                        >
                          <ExternalLink className="mr-1 h-3 w-3" /> Open captured point
                        </Button>
                      )}
                    </div>

                    <div className="space-y-1">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Checklist identity
                      </p>
                      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[10.5px]">
                        {KEY_FIELDS.filter((f) => s(r[f])).map((f) => (
                          <div key={f}>
                            <span className="text-muted-foreground">{resolveChecklistLabel(f)}: </span>
                            <span className="font-medium">{s(resolveChecklistValue(f, r[f])) || s(r[f])}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="border-t px-3 py-2">
                    <p className="mb-1.5 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      <Paperclip className="h-3 w-3" /> Evidence attachments ({files.length})
                    </p>
                    {files.length ? (
                      <div className="flex flex-wrap gap-2">
                        {files.map((f) => (
                          <a
                            key={f.url}
                            href={f.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="group flex items-center gap-2 rounded-md border p-1.5 text-[10.5px] hover:bg-muted"
                          >
                            {f.kind === "image" ? (
                              <img src={f.url} alt={f.name} loading="lazy" className="h-12 w-12 rounded object-cover" />
                            ) : (
                              <span className="flex h-12 w-12 items-center justify-center rounded bg-muted">
                                <Camera className="h-4 w-4 text-muted-foreground" />
                              </span>
                            )}
                            <span className="max-w-[140px] truncate group-hover:underline">{f.name}</span>
                          </a>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[10.5px] italic text-muted-foreground">
                        No photo, audio or file evidence was attached to this submission.
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Enketo-style slide-over preview for a single Kobo submission.
 * Groups questions by their parent path and renders resolved labels + values.
 */
import { useMemo } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { MapPin, Camera, X } from "lucide-react";
import type { KoboLabelResolver } from "./koboLabelResolver";
import type { KoboColumn } from "./koboSchema";

interface Props {
  open: boolean;
  onClose: () => void;
  record: Record<string, unknown> | null;
  columns: KoboColumn[];
  resolver: KoboLabelResolver | null;
}

const groupOf = (key: string): string => {
  const parts = key.split(".");
  if (parts.length <= 1) return "Response";
  return parts.slice(0, -1).join(" › ").replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
};

export default function RecordPreviewDrawer({ open, onClose, record, columns, resolver }: Props) {
  const grouped = useMemo(() => {
    if (!record) return [] as { group: string; items: { col: KoboColumn; value: string; raw: unknown }[] }[];
    const map = new Map<string, { col: KoboColumn; value: string; raw: unknown }[]>();
    for (const col of columns) {
      const raw = record[col.key];
      const value = resolver ? resolver.resolveValue(col.key, raw) : (raw == null ? "" : String(raw));
      const g = col.system ? "System metadata" : groupOf(col.key);
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push({ col, value, raw });
    }
    // Move System group to the end.
    return [...map.entries()]
      .sort(([a], [b]) => (a === "System metadata" ? 1 : b === "System metadata" ? -1 : a.localeCompare(b)))
      .map(([group, items]) => ({ group, items }));
  }, [record, columns, resolver]);

  const geo = Array.isArray(record?._geolocation) ? (record!._geolocation as any[]) : null;
  const attachments = Array.isArray(record?._attachments) ? (record!._attachments as any[]) : [];
  const id = String(record?._id ?? (record as any)?.["meta/instanceID"] ?? "");

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-2xl p-0 flex flex-col bg-slate-50 overflow-hidden">
        <SheetHeader className="p-5 border-b border-slate-800 bg-slate-900 text-white flex-row items-start justify-between space-y-0">
          <div>
            <SheetTitle className="text-white text-lg font-bold">Submission Preview</SheetTitle>
            <p className="text-[11px] text-slate-400 mt-1 font-mono">ID: {id || "—"}</p>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              {geo && geo[0] != null && (
                <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-400/30 hover:bg-emerald-500/20">
                  <MapPin className="h-3 w-3 mr-1" /> {Number(geo[0]).toFixed(4)}, {Number(geo[1]).toFixed(4)}
                </Badge>
              )}
              {attachments.length > 0 && (
                <Badge className="bg-violet-500/20 text-violet-300 border-violet-400/30 hover:bg-violet-500/20">
                  <Camera className="h-3 w-3 mr-1" /> {attachments.length} attachment{attachments.length === 1 ? "" : "s"}
                </Badge>
              )}
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition p-1"><X className="h-5 w-5" /></button>
        </SheetHeader>

        <div className="p-5 overflow-y-auto flex-1 space-y-5">
          {attachments.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {attachments.slice(0, 6).map((a: any, i: number) =>
                String(a?.mimetype || "").startsWith("image/") ? (
                  <a key={i} href={a.download_url} target="_blank" rel="noreferrer" className="block rounded-lg overflow-hidden border border-slate-200 shadow-sm">
                    <img src={a.download_url} alt={a.filename} className="w-full h-24 object-cover" />
                  </a>
                ) : (
                  <a key={i} href={a.download_url} target="_blank" rel="noreferrer" className="block p-2 rounded-lg border border-slate-200 bg-white text-[11px] truncate">{a.filename}</a>
                ),
              )}
            </div>
          )}

          {grouped.map(({ group, items }) => (
            <div key={group} className="space-y-2">
              <div className="text-[10px] uppercase tracking-widest font-bold text-slate-500 border-b border-slate-200 pb-1">{group}</div>
              {items.map(({ col, value, raw }) => (
                <div key={col.key} className="bg-white rounded-lg border border-slate-200 shadow-sm p-4">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide block mb-1.5">
                    {resolver?.resolveHeader(col.key) || col.label}
                  </label>
                  {value ? (
                    Array.isArray(raw) ? (
                      <div className="flex flex-wrap gap-1.5">
                        {(raw as unknown[]).map((v, i) => (
                          <Badge key={i} variant="secondary" className="bg-slate-100 text-slate-800 font-medium border-slate-200">
                            {resolver ? resolver.resolveValue(col.key, v) : String(v)}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <div className="text-sm font-semibold text-slate-900 bg-slate-50 rounded border border-slate-100 px-3 py-2 whitespace-pre-wrap break-words">
                        {value}
                      </div>
                    )
                  ) : (
                    <div className="text-sm italic text-slate-400 font-normal">No Response</div>
                  )}

                </div>
              ))}
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}

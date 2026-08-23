/**
 * Per-location discrepancy history + admin review.
 *
 * Shows how a location's verdict changed over time (Kobo point moved, community
 * name edited, basemap refreshed) and lets administrators mark borderline
 * matches as verified / corrected / rejected.
 */
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { History, ShieldCheck, PencilLine, Ban, Trash2 } from "lucide-react";
import { STATUS_META, OVERRIDE_META, type GpsOverride, type OverrideDecision, type VerifyResult, type VerifyStatus } from "@/lib/isc/gpsVerification";
import type { GpsHistoryRow } from "@/hooks/useGpsVerificationReview";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  point: {
    locKey: string; id: string; lat: number; lng: number;
    community: string; ward?: string; lga?: string; state?: string; verify?: VerifyResult;
  } | null;
  history: GpsHistoryRow[];
  override?: GpsOverride | null;
  isAdmin: boolean;
  onSave: (p: { locKey: string; submissionId?: string; community: string; lat: number; lng: number; decision: OverrideDecision; correctedName?: string; note?: string }) => Promise<boolean>;
  onClear: (locKey: string) => Promise<void>;
}

const fmt = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

export default function GpsDiscrepancyHistoryDialog({
  open, onOpenChange, point, history, override, isAdmin, onSave, onClear,
}: Props) {
  const [decision, setDecision] = useState<OverrideDecision>("verified");
  const [correctedName, setCorrectedName] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  if (!point) return null;

  const submit = async () => {
    setSaving(true);
    const ok = await onSave({
      locKey: point.locKey, submissionId: point.id, community: point.community,
      lat: point.lat, lng: point.lng, decision,
      correctedName: decision === "corrected" ? correctedName.trim() : "",
      note: note.trim(),
    });
    setSaving(false);
    if (ok) { setNote(""); setCorrectedName(""); }
  };

  const changes = history.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] w-[96vw] max-w-2xl overflow-y-auto">
        <DialogHeader className="text-left">
          <DialogTitle className="flex items-center gap-2 text-base">
            <History className="h-4 w-4 text-primary" /> Discrepancy history — {point.community}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {[point.ward, point.lga, point.state].filter(Boolean).join(" · ")} · {point.lat.toFixed(5)}, {point.lng.toFixed(5)}
            {" · "}{changes} recorded verdict{changes === 1 ? "" : "s"}
          </DialogDescription>
        </DialogHeader>

        {override && (
          <div className="rounded-lg border border-border p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge style={{ background: OVERRIDE_META[override.decision].color }} className="text-white">
                {OVERRIDE_META[override.decision].label}
              </Badge>
              {override.corrected_name && <Badge variant="secondary">→ {override.corrected_name}</Badge>}
              <span className="text-[11px] text-muted-foreground">
                {override.reviewed_at ? fmt(override.reviewed_at) : ""}
              </span>
              {isAdmin && (
                <Button size="sm" variant="ghost" className="ml-auto h-7 px-2 text-[11px]" onClick={() => void onClear(point.locKey)}>
                  <Trash2 className="mr-1 h-3 w-3" /> Remove override
                </Button>
              )}
            </div>
            {override.note && <p className="mt-1 text-xs text-muted-foreground">{override.note}</p>}
          </div>
        )}

        {point.verify && (
          <div className="rounded-lg border border-border p-3">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Confidence breakdown — {point.verify.confidence}% overall
            </div>
            <ConfidenceBars verify={point.verify} />
          </div>
        )}


        {/* Timeline */}
        <div className="rounded-lg border border-border">
          <div className="border-b border-border bg-muted/50 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Verdict timeline
          </div>
          {changes === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">
              No history yet — the first verdict is recorded once verification runs.
            </p>
          ) : (
            <ol className="max-h-64 space-y-0 overflow-auto p-3">
              {history.map((h, i) => {
                const meta = STATUS_META[(h.status as VerifyStatus)] ?? STATUS_META.unknown;
                const prev = history[i - 1];
                const delta = prev ? h.score - prev.score : 0;
                return (
                  <li key={h.id} className="relative border-l-2 pl-4 pb-3" style={{ borderColor: meta.color }}>
                    <span className="absolute -left-[7px] top-1 h-3 w-3 rounded-full border-2 border-background" style={{ background: meta.color }} />
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[11px] font-bold" style={{ color: meta.color }}>{meta.label}</span>
                      <span className="font-mono text-[11px]">{h.score}%</span>
                      {prev && delta !== 0 && (
                        <span className={`text-[10px] font-semibold ${delta > 0 ? "text-emerald-600" : "text-rose-600"}`}>
                          {delta > 0 ? "▲" : "▼"} {Math.abs(delta)} pts
                        </span>
                      )}
                      <span className="text-[10px] text-muted-foreground">{fmt(h.created_at)}</span>
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      Kobo name “{h.community}” · basemap “{h.matched_name || "—"}”
                    </div>
                    {prev && prev.community !== h.community && (
                      <div className="text-[10px] font-medium text-amber-600">Community name changed from “{prev.community}”</div>
                    )}
                    {prev && (prev.lat !== h.lat || prev.lng !== h.lng) && (
                      <div className="text-[10px] font-medium text-amber-600">GPS point was updated</div>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </div>

        {/* Admin review */}
        {isAdmin ? (
          <div className="space-y-2 rounded-lg border border-border p-3">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Admin review</div>
            <div className="flex flex-wrap gap-2">
              {([
                { k: "verified" as const, icon: ShieldCheck },
                { k: "corrected" as const, icon: PencilLine },
                { k: "rejected" as const, icon: Ban },
              ]).map(({ k, icon: Icon }) => (
                <Button
                  key={k}
                  size="sm"
                  variant={decision === k ? "default" : "outline"}
                  className="h-9"
                  onClick={() => setDecision(k)}
                  style={decision === k ? { background: OVERRIDE_META[k].color } : undefined}
                >
                  <Icon className="mr-1.5 h-3.5 w-3.5" /> {OVERRIDE_META[k].label}
                </Button>
              ))}
            </div>
            {decision === "corrected" && (
              <Input
                value={correctedName}
                onChange={(e) => setCorrectedName(e.target.value)}
                placeholder="Correct settlement name at this GPS point"
                className="h-9 text-sm"
              />
            )}
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Reviewer note (optional) — what did you confirm on the imagery?"
              className="min-h-[64px] text-sm"
            />
            <Button className="h-10 w-full" onClick={() => void submit()} disabled={saving || (decision === "corrected" && !correctedName.trim())}>
              {saving ? "Saving…" : "Save review decision"}
            </Button>
          </div>
        ) : (
          <p className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
            Only administrators can mark a borderline match as verified or corrected.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}

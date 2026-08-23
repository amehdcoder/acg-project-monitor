/**
 * Explainable confidence breakdown for a GPS ⇄ community-name verdict.
 *
 * Shows every component that produced the verdict — name similarity, distance
 * to the matched feature, richness of the reverse-geocode evidence, and
 * administrative agreement — each with a plain-language explanation.
 */
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Info } from "lucide-react";
import { STATUS_META, DISTANCE_THRESHOLDS, type VerifyResult } from "@/lib/isc/gpsVerification";

const fmtDistance = (m: number | null) =>
  m === null ? "not measurable" : m < 1000 ? `${m} m` : `${(m / 1000).toFixed(2)} km`;

export function ConfidenceBars({ verify }: { verify: VerifyResult }) {
  return (
    <div className="space-y-2">
      {verify.factors.map((f) => (
        <div key={f.label} className="space-y-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[11px] font-semibold">{f.label}</span>
            <span className="text-[10px] font-bold" style={{ color: f.color }}>
              {f.verdict} · {f.value}%
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full transition-all" style={{ width: `${f.value}%`, background: f.color }} />
          </div>
          <p className="text-[10px] leading-snug text-muted-foreground">{f.detail}</p>
          {f.weight > 0 && (
            <p className="text-[9px] uppercase tracking-wide text-muted-foreground/70">
              Weight in overall confidence: {Math.round(f.weight * 100)}%
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

export default function GpsConfidenceBreakdown({ verify, community }: { verify: VerifyResult; community: string }) {
  const meta = STATUS_META[verify.status];
  const tone = verify.confidence >= 80 ? "#16a34a" : verify.confidence >= 55 ? "#2563eb" : verify.confidence >= 30 ? "#f59e0b" : "#dc2626";

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-bold transition hover:bg-muted"
          style={{ color: tone, borderColor: tone }}
          title="Why this verdict?"
        >
          <Info className="h-3 w-3" /> {verify.confidence}%
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 max-w-[92vw] p-3" onClick={(e) => e.stopPropagation()}>
        <div className="mb-2">
          <p className="text-xs font-bold">Why “{meta.label}” for {community}?</p>
          <p className="text-[10px] text-muted-foreground">
            Overall confidence <span className="font-bold" style={{ color: tone }}>{verify.confidence}%</span> — a
            weighted blend of the four checks below. Distance is measured against the feature the basemap returned
            (≤{DISTANCE_THRESHOLDS.exact} m = same place, ≤{DISTANCE_THRESHOLDS.close} m = same settlement,
            &gt;{DISTANCE_THRESHOLDS.loose} m = out of tolerance); this point is {fmtDistance(verify.distanceM)} away.
          </p>
        </div>
        <ConfidenceBars verify={verify} />
        <p className="mt-2 border-t pt-2 text-[10px] text-muted-foreground">{verify.reason}</p>
      </PopoverContent>
    </Popover>
  );
}

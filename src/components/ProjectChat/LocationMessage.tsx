import { useState } from "react";
import { MapPin, Navigation, Share2, Copy, Check, Crosshair } from "lucide-react";
import type { LocationPayload } from "./specialMessages";

interface LocationMessageProps {
  location: LocationPayload;
}

/** Live Nigerian Location inspired card (green theme, live badge, info grid). */
export function LocationMessage({ location }: LocationMessageProps) {
  const { lat, lng, label, address, accuracy } = location;
  const [copied, setCopied] = useState(false);

  const delta = 0.004;
  const bbox = [lng - delta, lat - delta, lng + delta, lat + delta].join("%2C");
  const embedSrc = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat}%2C${lng}`;
  // Turn-by-turn directions deep link — opens Google Maps app on mobile,
  // maps.google.com on desktop.
  const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${lat}%2C${lng}`;
  const latHem = lat >= 0 ? "N" : "S";
  const lngHem = lng >= 0 ? "E" : "W";
  const coords = `${Math.abs(lat).toFixed(5)}° ${latHem}, ${Math.abs(lng).toFixed(5)}° ${lngHem}`;

  const accQuality =
    accuracy == null
      ? { text: "Good", cls: "bg-[#7dffb8]/30 text-[#0a6b4f]" }
      : accuracy <= 15
        ? { text: "Excellent", cls: "bg-[#7dffb8]/30 text-[#0a6b4f]" }
        : accuracy <= 50
          ? { text: "Good", cls: "bg-[#7dffb8]/30 text-[#0a6b4f]" }
          : accuracy <= 150
            ? { text: "Fair", cls: "bg-amber-400/30 text-amber-700" }
            : { text: "Approx.", cls: "bg-amber-400/30 text-amber-700" };


  const copyCoords = async () => {
    try {
      await navigator.clipboard.writeText(`${lat}, ${lng}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  const share = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: label || "Shared location",
          text: address || coords,
          url: directionsUrl,
        });
      } catch {
        /* cancelled */
      }
    } else {
      copyCoords();
    }
  };

  return (
    <div className="w-[260px] sm:w-[290px] overflow-hidden rounded-2xl border border-[#0a6b4f]/15 bg-white text-[#0f2e23] shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between bg-[#0a6b4f] px-3 py-2">
        <div className="flex items-center gap-1.5">
          <MapPin className="h-3.5 w-3.5 text-white" />
          <span className="text-[12px] font-bold text-white">Live Location</span>
        </div>
        <span className="flex items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-bold text-white">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#7dffb8]" />
          LIVE
        </span>
      </div>

      {/* Map */}
      <div className="relative h-28 w-full overflow-hidden">
        <iframe
          title="Shared location"
          src={embedSrc}
          className="h-full w-full pointer-events-none"
          loading="lazy"
        />
      </div>

      <div className="p-3">
        {/* Current location card */}
        <div className="flex items-start gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#0a6b4f]">
            <MapPin className="h-5 w-5 text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-medium uppercase tracking-wide text-[#6b7280]">
              Current location
            </p>
            <p className="text-[14px] font-bold leading-snug break-words">
              {label || "Shared location"}
            </p>
            {address && (
              <p className="text-[11px] text-[#6b7280] break-words">{address}</p>
            )}
          </div>
        </div>

        {/* Info grid */}
        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="rounded-lg bg-[#0a6b4f]/5 p-2">
            <p className="text-[9px] font-medium uppercase tracking-wide text-[#6b7280]">
              Coordinates
            </p>
            <div className="flex items-center gap-1">
              <p className="text-[11px] font-semibold tabular-nums">{coords}</p>
              <button
                type="button"
                onClick={copyCoords}
                className="ml-auto text-[#0a6b4f]"
                aria-label="Copy coordinates"
              >
                {copied ? (
                  <Check className="h-3.5 w-3.5" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
          </div>
          <div className="rounded-lg bg-[#0a6b4f]/5 p-2">
            <p className="text-[9px] font-medium uppercase tracking-wide text-[#6b7280]">
              GPS Accuracy
            </p>
            <div className="flex items-center gap-1">
              <Crosshair className="h-3 w-3 text-[#0a6b4f]" />
              <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${accQuality.cls}`}>
                {accuracy != null ? `±${Math.round(accuracy)}m` : accQuality.text}
              </span>
            </div>
          </div>

        </div>

        {/* Actions */}
        <div className="mt-3 grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={share}
            className="flex items-center justify-center gap-1.5 rounded-lg border border-[#0a6b4f]/20 py-1.5 text-[12px] font-semibold text-[#0a6b4f] hover:bg-[#0a6b4f]/5"
          >
            <Share2 className="h-3.5 w-3.5" /> Share
          </button>
          <a
            href={directionsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-1.5 rounded-lg bg-[#0a6b4f] py-1.5 text-[12px] font-semibold text-white hover:bg-[#0a6b4f]/90"
          >
            <Navigation className="h-3.5 w-3.5" /> Navigate
          </a>
        </div>
      </div>
    </div>
  );
}

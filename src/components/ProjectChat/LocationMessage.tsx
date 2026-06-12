import { MapPin, Navigation } from "lucide-react";
import type { LocationPayload } from "./specialMessages";

interface LocationMessageProps {
  location: LocationPayload;
}

export function LocationMessage({ location }: LocationMessageProps) {
  const { lat, lng, label, address } = location;
  const delta = 0.004;
  const bbox = [lng - delta, lat - delta, lng + delta, lat + delta].join("%2C");
  const embedSrc = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat}%2C${lng}`;
  const directionsUrl = `https://www.google.com/maps/search/?api=1&query=${lat}%2C${lng}`;

  return (
    <div className="w-[240px] sm:w-[260px]">
      <div className="relative overflow-hidden rounded-lg border border-black/10">
        <iframe
          title="Shared location"
          src={embedSrc}
          className="h-32 w-full pointer-events-none"
          loading="lazy"
        />
      </div>
      <div className="mt-2 flex items-start gap-2">
        <MapPin className="h-4 w-4 mt-0.5 shrink-0 text-[hsl(var(--wa-accent))]" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium leading-snug break-words">
            {label || "Shared location"}
          </p>
          {address ? (
            <p className="text-xs opacity-70 break-words">{address}</p>
          ) : (
            <p className="text-xs opacity-70">
              {lat.toFixed(5)}, {lng.toFixed(5)}
            </p>
          )}
        </div>
      </div>
      <a
        href={directionsUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-2 flex items-center justify-center gap-1.5 rounded-lg bg-[hsl(var(--wa-accent))] py-1.5 text-xs font-semibold text-white"
      >
        <Navigation className="h-3.5 w-3.5" /> Directions
      </a>
    </div>
  );
}

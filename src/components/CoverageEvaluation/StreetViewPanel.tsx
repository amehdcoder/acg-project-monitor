import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Eye, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lat: number | null;
  lng: number | null;
}

/**
 * Mapillary street-level imagery embed.
 * Free, no API key required for the public viewer. Coverage depends on
 * community uploads — sparse in many rural Nigerian communities. Where
 * Mapillary has no nearby imagery, the embed shows a "no imagery here"
 * placeholder; users can fall back to the satellite map.
 */
export default function StreetViewPanel({ open, onOpenChange, lat, lng }: Props) {
  const hasCoords = Number.isFinite(lat) && Number.isFinite(lng);
  // Mapillary embed centered on coordinate, photo viewer mode
  const src = hasCoords
    ? `https://www.mapillary.com/embed?map_style=Mapillary+streets&x=${lng}&y=${lat}&z=17&style=photo`
    : "";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl p-0 flex flex-col">
        <SheetHeader className="p-4 border-b">
          <SheetTitle className="flex items-center gap-2">
            <Eye className="h-4 w-4" /> Street-level View
          </SheetTitle>
          <SheetDescription className="text-xs">
            Community-contributed street imagery via Mapillary. Pan/zoom to inspect buildings,
            landmarks, and people captured on recent walks.
            {hasCoords && (
              <> Centered at {lat!.toFixed(5)}, {lng!.toFixed(5)}.</>
            )}
          </SheetDescription>
        </SheetHeader>
        <div className="flex-1 min-h-0">
          {hasCoords ? (
            <iframe
              title="Mapillary street view"
              src={src}
              className="w-full h-full border-0"
              allow="geolocation; fullscreen"
            />
          ) : (
            <div className="p-6 text-sm text-muted-foreground text-center">
              Lock GPS first to view street-level imagery for your location.
            </div>
          )}
        </div>
        {hasCoords && (
          <div className="p-3 border-t flex justify-end">
            <Button asChild size="sm" variant="outline" className="h-8 text-xs gap-1">
              <a
                href={`https://www.mapillary.com/app/?lat=${lat}&lng=${lng}&z=17`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink className="h-3 w-3" /> Open in Mapillary
              </a>
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

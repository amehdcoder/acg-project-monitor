import { MapMarker } from "./types";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { MapPin, Calendar, User, FileText, Building, Home } from "lucide-react";
import { format } from "date-fns";

interface MarkerPopupProps {
  marker: MapMarker;
}

const MarkerPopup = ({ marker }: MarkerPopupProps) => {
  const formatDate = (dateString?: string) => {
    if (!dateString) return null;
    try {
      return format(new Date(dateString), "MMM d, yyyy 'at' h:mm a");
    } catch {
      return dateString;
    }
  };

  return (
    <div className="min-w-[220px] max-w-[280px] p-1">
      <div className="space-y-2">
        {/* Title */}
        <div className="font-medium text-foreground">{marker.title}</div>

        {/* Location Hierarchy */}
        <div className="space-y-1">
          {marker.state && (
            <div className="flex items-center gap-2 text-sm">
              <MapPin className="h-3.5 w-3.5 text-primary shrink-0" />
              <span className="text-muted-foreground">State:</span>
              <span className="font-medium">{marker.state}</span>
            </div>
          )}
          {marker.lga && (
            <div className="flex items-center gap-2 text-sm">
              <Building className="h-3.5 w-3.5 text-primary shrink-0" />
              <span className="text-muted-foreground">LGA:</span>
              <span className="font-medium">{marker.lga}</span>
            </div>
          )}
          {marker.ward && (
            <div className="flex items-center gap-2 text-sm">
              <Home className="h-3.5 w-3.5 text-primary shrink-0" />
              <span className="text-muted-foreground">Ward:</span>
              <span className="font-medium">{marker.ward}</span>
            </div>
          )}
          {marker.community && (
            <div className="flex items-center gap-2 text-sm">
              <Home className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="text-muted-foreground">Community:</span>
              <span className="font-medium">{marker.community}</span>
            </div>
          )}
          {marker.facility && (
            <div className="flex items-center gap-2 text-sm">
              <Building className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="text-muted-foreground">Facility:</span>
              <span className="font-medium">{marker.facility}</span>
            </div>
          )}
        </div>

        {(marker.submitterName || marker.formName || marker.submittedAt) && (
          <>
            <Separator className="my-2" />
            <div className="space-y-1">
              {marker.formName && (
                <div className="flex items-center gap-2 text-sm">
                  <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="truncate">{marker.formName}</span>
                </div>
              )}
              {marker.submitterName && (
                <div className="flex items-center gap-2 text-sm">
                  <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="truncate">{marker.submitterName}</span>
                </div>
              )}
              {marker.submittedAt && (
                <div className="flex items-center gap-2 text-sm">
                  <Calendar className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span>{formatDate(marker.submittedAt)}</span>
                </div>
              )}
            </div>
          </>
        )}

        {/* Coordinates */}
        <div className="pt-1">
          <Badge variant="outline" className="text-xs font-mono">
            {marker.lat.toFixed(4)}, {marker.lng.toFixed(4)}
          </Badge>
        </div>
      </div>
    </div>
  );
};

export default MarkerPopup;

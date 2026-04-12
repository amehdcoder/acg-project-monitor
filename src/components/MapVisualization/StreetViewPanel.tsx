import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { X, Maximize2, Minimize2 } from "lucide-react";

interface StreetViewPanelProps {
  lat: number;
  lng: number;
  onClose: () => void;
}

const StreetViewPanel = ({ lat, lng, onClose }: StreetViewPanelProps) => {
  const [isFullscreen, setIsFullscreen] = useState(false);

  const streetViewUrl = `https://www.google.com/maps/embed?pb=!4v${Date.now()}!6m8!1m7!1s!2m2!1d${lat}!2d${lng}!3f0!4f0!5f0.7820865974627469`;
  
  // Use Google Street View Static API as embedded view
  const embedUrl = `https://www.google.com/maps/@${lat},${lng},3a,75y,90t/data=!3m7!1e1!3m5!1s!2e0!6shttps:%2F%2F!7i16384!8i8192?entry=ttu`;

  return (
    <div
      className={`${
        isFullscreen
          ? "fixed inset-0 z-[9999] bg-black"
          : "absolute bottom-0 left-0 right-0 z-[2000] h-[300px] sm:h-[350px]"
      } flex flex-col transition-all duration-300`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-black/80 backdrop-blur-sm text-white">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-yellow-400 flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="8" r="4" fill="#333" />
              <path d="M12 14c-4 0-6 2-6 4v2h12v-2c0-2-2-4-6-4z" fill="#333" />
            </svg>
          </div>
          <span className="text-sm font-medium">Street View</span>
          <span className="text-xs text-white/60">
            {lat.toFixed(5)}, {lng.toFixed(5)}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-white hover:bg-white/20"
            onClick={() => setIsFullscreen(!isFullscreen)}
          >
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-white hover:bg-white/20"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Street View iframe */}
      <div className="flex-1 relative bg-black">
        <iframe
          src={`https://www.google.com/maps/embed/v1/streetview?key=AIzaSyBFw0Qbyq9zTFTd-tUY6dZWTgaQzuU17R8&location=${lat},${lng}&heading=0&pitch=0&fov=90`}
          className="w-full h-full border-0"
          allowFullScreen
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          title="Google Street View"
        />
        
        {/* Fallback message */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="bg-black/60 backdrop-blur-sm rounded-xl p-4 text-center text-white/80 hidden" id="sv-fallback">
            <p className="text-sm">Street View not available here</p>
            <p className="text-xs mt-1">Try another location</p>
          </div>
        </div>
      </div>

      {/* Open in Google Maps link */}
      <div className="px-3 py-2 bg-black/80 backdrop-blur-sm">
        <a
          href={`https://www.google.com/maps/@${lat},${lng},3a,75y,90t/data=!3m4!1e1!3m2!1s!2e0`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-blue-400 hover:text-blue-300 underline"
        >
          Open full Street View in Google Maps →
        </a>
      </div>
    </div>
  );
};

export default StreetViewPanel;

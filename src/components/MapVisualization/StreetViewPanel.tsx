import { useState } from "react";
import { X, Maximize2, Minimize2 } from "lucide-react";

interface StreetViewPanelProps {
  lat: number;
  lng: number;
  onClose: () => void;
}

const StreetViewPanel = ({ lat, lng, onClose }: StreetViewPanelProps) => {
  const [isFullscreen, setIsFullscreen] = useState(false);

  return (
    <div
      className={`${
        isFullscreen
          ? "fixed inset-0 z-[9999] bg-background"
          : "absolute bottom-0 left-0 right-0 z-[2000] h-[300px] sm:h-[350px]"
      } flex flex-col transition-all duration-300`}
    >
      <div className="flex items-center justify-between px-3 py-2 bg-foreground/90 backdrop-blur-sm text-background">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-yellow-400 flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="8" r="4" fill="#333" />
              <path d="M12 14c-4 0-6 2-6 4v2h12v-2c0-2-2-4-6-4z" fill="#333" />
            </svg>
          </div>
          <span className="text-sm font-medium">Street View</span>
          <span className="text-xs opacity-60">
            {lat.toFixed(5)}, {lng.toFixed(5)}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            className="h-7 w-7 rounded-md flex items-center justify-center hover:bg-background/20 transition-colors"
            onClick={() => setIsFullscreen(!isFullscreen)}
          >
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
          <button
            className="h-7 w-7 rounded-md flex items-center justify-center hover:bg-background/20 transition-colors"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 relative bg-muted">
        <iframe
          src={`https://www.google.com/maps/embed/v1/streetview?key=AIzaSyBFw0Qbyq9zTFTd-tUY6dZWTgaQzuU17R8&location=${lat},${lng}&heading=0&pitch=0&fov=90`}
          className="w-full h-full border-0"
          allowFullScreen
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          title="Google Street View"
        />
      </div>

      <div className="px-3 py-2 bg-foreground/90 backdrop-blur-sm">
        <a
          href={`https://www.google.com/maps/@${lat},${lng},3a,75y,90t/data=!3m4!1e1!3m2!1s!2e0`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-primary hover:underline"
        >
          Open full Street View in Google Maps →
        </a>
      </div>
    </div>
  );
};

export default StreetViewPanel;

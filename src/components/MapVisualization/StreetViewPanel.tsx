import { useState, useRef, useEffect, useCallback } from "react";
import { X, Maximize2, Minimize2, RotateCcw, Compass, Move } from "lucide-react";

interface StreetViewPanelProps {
  lat: number;
  lng: number;
  onClose: () => void;
}

// Load Google Maps JS API once
let googleMapsPromise: Promise<void> | null = null;
const GOOGLE_MAPS_API_KEY = "AIzaSyBFw0Qbyq9zTFTd-tUY6dZWTgaQzuU17R8";

const loadGoogleMaps = (): Promise<void> => {
  if (googleMapsPromise) return googleMapsPromise;

  googleMapsPromise = new Promise((resolve, reject) => {
    if (window.google?.maps?.StreetViewPanorama) {
      resolve();
      return;
    }

    // Check if script already exists
    const existing = document.querySelector(
      `script[src*="maps.googleapis.com/maps/api/js"]`
    );
    if (existing) {
      existing.addEventListener("load", () => resolve());
      return;
    }

    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&libraries=streetview&v=weekly`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => {
      googleMapsPromise = null;
      reject(new Error("Failed to load Google Maps"));
    };
    document.head.appendChild(script);
  });

  return googleMapsPromise;
};

const StreetViewPanel = ({ lat, lng, onClose }: StreetViewPanelProps) => {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [heading, setHeading] = useState(0);
  const streetViewRef = useRef<HTMLDivElement>(null);
  const panoramaRef = useRef<google.maps.StreetViewPanorama | null>(null);

  const initStreetView = useCallback(async () => {
    if (!streetViewRef.current) return;
    setIsLoading(true);
    setError(null);

    try {
      await loadGoogleMaps();

      const panorama = new google.maps.StreetViewPanorama(streetViewRef.current, {
        position: { lat, lng },
        pov: { heading: 0, pitch: 0 },
        zoom: 1,
        // Enable all Google Maps Street View features
        addressControl: true,
        addressControlOptions: {
          position: google.maps.ControlPosition.BOTTOM_CENTER,
        },
        enableCloseButton: false,
        fullscreenControl: false,
        imageDateControl: true,
        linksControl: true,        // Navigation arrows on the ground
        motionTracking: true,      // Gyroscope on mobile
        motionTrackingControl: true,
        panControl: true,          // Pan compass
        panControlOptions: {
          position: google.maps.ControlPosition.RIGHT_CENTER,
        },
        scrollwheel: true,         // Zoom with scroll
        zoomControl: true,
        zoomControlOptions: {
          position: google.maps.ControlPosition.RIGHT_CENTER,
        },
        visible: true,
        showRoadLabels: true,
      });

      panoramaRef.current = panorama;

      // Listen for position changes to update coordinates display
      panorama.addListener("pov_changed", () => {
        const pov = panorama.getPov();
        setHeading(Math.round(pov.heading));
      });

      // Check if Street View is available at this location
      const sv = new google.maps.StreetViewService();
      sv.getPanorama(
        {
          location: { lat, lng },
          radius: 100, // Search within 100m
          source: google.maps.StreetViewSource.DEFAULT,
        },
        (data, status) => {
          setIsLoading(false);
          if (status !== google.maps.StreetViewStatus.OK) {
            setError("No Street View imagery available at this location. Try a location near a road.");
          }
        }
      );
    } catch (err) {
      setIsLoading(false);
      setError("Failed to load Google Street View. Check your internet connection.");
      console.error("Street View init error:", err);
    }
  }, [lat, lng]);

  useEffect(() => {
    initStreetView();

    return () => {
      if (panoramaRef.current) {
        google.maps.event.clearInstanceListeners(panoramaRef.current);
        panoramaRef.current = null;
      }
    };
  }, [initStreetView]);

  // Re-trigger resize when fullscreen toggles
  useEffect(() => {
    if (panoramaRef.current && window.google?.maps) {
      setTimeout(() => {
        google.maps.event.trigger(panoramaRef.current!, "resize");
      }, 350);
    }
  }, [isFullscreen]);

  const resetView = () => {
    if (panoramaRef.current) {
      panoramaRef.current.setPov({ heading: 0, pitch: 0 });
      panoramaRef.current.setZoom(1);
    }
  };

  return (
    <div
      className={`${
        isFullscreen
          ? "fixed inset-0 z-[9999] bg-background"
          : "absolute bottom-0 left-0 right-0 z-[2000] h-[350px] sm:h-[400px] lg:h-[450px]"
      } flex flex-col transition-all duration-300`}
    >
      {/* Header bar */}
      <div className="flex items-center justify-between px-3 py-2 bg-[#1a1a1a] text-white shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-[#FBBC05] flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="8" r="4" fill="#333" />
              <path d="M12 14c-4 0-6 2-6 4v2h12v-2c0-2-2-4-6-4z" fill="#333" />
            </svg>
          </div>
          <span className="text-sm font-medium">Street View</span>
          <span className="text-xs text-white/50 hidden sm:inline">
            {lat.toFixed(5)}, {lng.toFixed(5)}
          </span>
          <div className="flex items-center gap-1 text-xs text-white/40 ml-2">
            <Compass className="h-3 w-3" />
            <span>{heading}°</span>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            className="h-7 w-7 rounded-md flex items-center justify-center hover:bg-white/10 transition-colors"
            onClick={resetView}
            title="Reset view"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
          <button
            className="h-7 w-7 rounded-md flex items-center justify-center hover:bg-white/10 transition-colors"
            onClick={() => setIsFullscreen(!isFullscreen)}
            title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
          >
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
          <button
            className="h-7 w-7 rounded-md flex items-center justify-center hover:bg-white/10 transition-colors"
            onClick={onClose}
            title="Close Street View"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Street View Container */}
      <div className="flex-1 relative bg-[#202124]">
        <div ref={streetViewRef} className="w-full h-full" />

        {/* Loading overlay */}
        {isLoading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#202124] text-white gap-3">
            <div className="w-10 h-10 border-3 border-white/20 border-t-[#FBBC05] rounded-full animate-spin" />
            <p className="text-sm text-white/60">Loading Street View...</p>
            <p className="text-xs text-white/30">
              <Move className="h-3 w-3 inline mr-1" />
              Drag to look around • Scroll to zoom • Click arrows to move
            </p>
          </div>
        )}

        {/* Error overlay */}
        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#202124] text-white gap-3 p-6 text-center">
            <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="8" r="4" fill="#FBBC05" />
                <path d="M12 14c-4 0-6 2-6 4v2h12v-2c0-2-2-4-6-4z" fill="#FBBC05" />
                <line x1="4" y1="4" x2="20" y2="20" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round" />
              </svg>
            </div>
            <p className="text-sm text-white/80">{error}</p>
            <a
              href={`https://www.google.com/maps/@${lat},${lng},3a,75y,0h,90t/data=!3m4!1e1!3m2!1s!2e0`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-[#FBBC05] hover:underline mt-1"
            >
              Try opening in Google Maps →
            </a>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-3 py-1.5 bg-[#1a1a1a] flex items-center justify-between shrink-0">
        <a
          href={`https://www.google.com/maps/@${lat},${lng},3a,75y,${heading}h,90t/data=!3m4!1e1!3m2!1s!2e0`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-[#8ab4f8] hover:underline"
        >
          Open in Google Maps →
        </a>
        <span className="text-[10px] text-white/30">
          Imagery ©{new Date().getFullYear()} Google
        </span>
      </div>
    </div>
  );
};

export default StreetViewPanel;

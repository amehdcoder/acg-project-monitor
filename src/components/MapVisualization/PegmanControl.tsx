import { useRef, useState, useCallback, useEffect } from "react";
import { toast } from "@/hooks/use-toast";

interface PegmanControlProps {
  onActivate: (coords?: { lat: number; lng: number }) => void;
  isActive: boolean;
  position?: "topright" | "bottomright";
  mapContainerRef?: React.RefObject<HTMLDivElement>;
  getLatLngFromPoint?: (x: number, y: number) => { lat: number; lng: number } | null;
}

const PegmanControl = ({
  onActivate,
  isActive,
  position = "bottomright",
  mapContainerRef,
  getLatLngFromPoint,
}: PegmanControlProps) => {
  const pegmanRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);

  const posClass = position === "topright" ? "top-4 right-4" : "bottom-24 right-3";

  // Handle drag start
  const handleDragStart = useCallback((clientX: number, clientY: number) => {
    if (!mapContainerRef?.current || !getLatLngFromPoint) {
      // Fallback: click mode
      onActivate();
      if (!isActive) {
        toast({
          title: "Street View Mode",
          description: "Click any location on the map to open Street View.",
        });
      }
      return;
    }
    setIsDragging(true);
    dragStartRef.current = { x: clientX, y: clientY };
    setDragPos({ x: clientX, y: clientY });
  }, [mapContainerRef, getLatLngFromPoint, onActivate, isActive]);

  // Handle drag move
  const handleDragMove = useCallback((clientX: number, clientY: number) => {
    if (!isDragging) return;
    setDragPos({ x: clientX, y: clientY });
  }, [isDragging]);

  // Handle drag end — drop onto map
  const handleDragEnd = useCallback((clientX: number, clientY: number) => {
    if (!isDragging) return;
    setIsDragging(false);
    setDragPos(null);
    dragStartRef.current = null;

    if (!mapContainerRef?.current || !getLatLngFromPoint) return;

    const rect = mapContainerRef.current.getBoundingClientRect();
    const isOverMap =
      clientX >= rect.left && clientX <= rect.right &&
      clientY >= rect.top && clientY <= rect.bottom;

    if (isOverMap) {
      const relX = clientX - rect.left;
      const relY = clientY - rect.top;
      const coords = getLatLngFromPoint(relX, relY);
      if (coords) {
        onActivate(coords);
      }
    }
  }, [isDragging, mapContainerRef, getLatLngFromPoint, onActivate]);

  // Mouse events
  useEffect(() => {
    if (!isDragging) return;

    const onMouseMove = (e: MouseEvent) => {
      e.preventDefault();
      handleDragMove(e.clientX, e.clientY);
    };
    const onMouseUp = (e: MouseEvent) => {
      handleDragEnd(e.clientX, e.clientY);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [isDragging, handleDragMove, handleDragEnd]);

  // Touch events
  useEffect(() => {
    if (!isDragging) return;

    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      const touch = e.touches[0];
      handleDragMove(touch.clientX, touch.clientY);
    };
    const onTouchEnd = (e: TouchEvent) => {
      const touch = e.changedTouches[0];
      handleDragEnd(touch.clientX, touch.clientY);
    };

    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onTouchEnd);
    return () => {
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
    };
  }, [isDragging, handleDragMove, handleDragEnd]);

  const hasDragSupport = !!mapContainerRef?.current && !!getLatLngFromPoint;

  return (
    <>
      {/* Pegman resting position */}
      <div
        ref={pegmanRef}
        className={`absolute ${posClass} z-[1000] select-none`}
        style={{ opacity: isDragging ? 0.3 : 1 }}
      >
        <button
          onMouseDown={(e) => {
            e.preventDefault();
            if (hasDragSupport) {
              handleDragStart(e.clientX, e.clientY);
            } else {
              onActivate();
              if (!isActive) {
                toast({
                  title: "Street View Mode",
                  description: "Click any location on the map to open Street View.",
                });
              }
            }
          }}
          onTouchStart={(e) => {
            if (hasDragSupport) {
              const touch = e.touches[0];
              handleDragStart(touch.clientX, touch.clientY);
            }
          }}
          className={`w-11 h-11 rounded-full shadow-lg flex items-center justify-center transition-all cursor-grab active:cursor-grabbing ${
            isActive
              ? "bg-yellow-400 ring-2 ring-yellow-500 scale-110"
              : "bg-background hover:bg-muted hover:scale-105"
          }`}
          title={
            hasDragSupport
              ? "Drag onto the map to open Street View"
              : isActive
              ? "Exit Street View mode"
              : "Enter Street View mode (click on map)"
          }
        >
          {/* Pegman SVG */}
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="5" r="2.5" fill={isActive ? "#333" : "#FBBC05"} />
            <path
              d="M8 11c0-2.2 1.8-4 4-4s4 1.8 4 4v3H8v-3z"
              fill={isActive ? "#333" : "#FBBC05"}
            />
            <rect x="9" y="14" width="2" height="5" rx="1" fill={isActive ? "#333" : "#FBBC05"} />
            <rect x="13" y="14" width="2" height="5" rx="1" fill={isActive ? "#333" : "#FBBC05"} />
            <rect x="7" y="9" width="2" height="4" rx="1" fill={isActive ? "#333" : "#FBBC05"} transform="rotate(-15 7 9)" />
            <rect x="15" y="9" width="2" height="4" rx="1" fill={isActive ? "#333" : "#FBBC05"} transform="rotate(15 15 9)" />
          </svg>
        </button>
        {hasDragSupport && !isActive && (
          <p className="text-[8px] text-muted-foreground text-center mt-0.5 leading-tight whitespace-nowrap">
            Drag me
          </p>
        )}
      </div>

      {/* Dragging ghost that follows the cursor */}
      {isDragging && dragPos && (
        <div
          className="fixed z-[9999] pointer-events-none"
          style={{
            left: dragPos.x - 22,
            top: dragPos.y - 40,
          }}
        >
          <svg width="44" height="56" viewBox="0 0 44 56" fill="none">
            {/* Drop shadow */}
            <ellipse cx="22" cy="52" rx="10" ry="3" fill="rgba(0,0,0,0.25)" />
            {/* Pegman body */}
            <circle cx="22" cy="10" r="6" fill="#FBBC05" stroke="#E8A000" strokeWidth="1.5" />
            <path
              d="M14 22c0-4.4 3.6-8 8-8s8 3.6 8 8v6H14v-6z"
              fill="#FBBC05"
              stroke="#E8A000"
              strokeWidth="1.5"
            />
            <rect x="16" y="28" width="5" height="12" rx="2.5" fill="#FBBC05" stroke="#E8A000" strokeWidth="1" />
            <rect x="23" y="28" width="5" height="12" rx="2.5" fill="#FBBC05" stroke="#E8A000" strokeWidth="1" />
            {/* Arms */}
            <rect x="10" y="18" width="4" height="10" rx="2" fill="#FBBC05" stroke="#E8A000" strokeWidth="1" transform="rotate(-20 10 18)" />
            <rect x="30" y="18" width="4" height="10" rx="2" fill="#FBBC05" stroke="#E8A000" strokeWidth="1" transform="rotate(20 30 18)" />
          </svg>
        </div>
      )}

      {/* Map overlay highlight when dragging over map */}
      {isDragging && mapContainerRef?.current && (
        <div
          className="fixed z-[1001] pointer-events-none border-2 border-dashed border-yellow-400 bg-yellow-400/10 rounded-lg transition-opacity"
          style={{
            left: mapContainerRef.current.getBoundingClientRect().left,
            top: mapContainerRef.current.getBoundingClientRect().top,
            width: mapContainerRef.current.getBoundingClientRect().width,
            height: mapContainerRef.current.getBoundingClientRect().height,
          }}
        />
      )}
    </>
  );
};

export default PegmanControl;

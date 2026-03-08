import { useEffect, useRef } from "react";

interface UseSwipeGestureOptions {
  onSwipeRight?: () => void;
  onSwipeLeft?: () => void;
  threshold?: number;
  edgeWidth?: number;
}

export function useSwipeGesture({
  onSwipeRight,
  onSwipeLeft,
  threshold = 60,
  edgeWidth = 30,
}: UseSwipeGestureOptions) {
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const startedFromEdge = useRef(false);

  useEffect(() => {
    const handleTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0];
      touchStart.current = { x: touch.clientX, y: touch.clientY };
      startedFromEdge.current = touch.clientX <= edgeWidth;
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (!touchStart.current) return;
      const touch = e.changedTouches[0];
      const dx = touch.clientX - touchStart.current.x;
      const dy = touch.clientY - touchStart.current.y;

      // Only count horizontal swipes (not vertical scrolls)
      if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > threshold) {
        if (dx > 0 && startedFromEdge.current) {
          onSwipeRight?.();
        } else if (dx < 0) {
          onSwipeLeft?.();
        }
      }
      touchStart.current = null;
      startedFromEdge.current = false;
    };

    document.addEventListener("touchstart", handleTouchStart, { passive: true });
    document.addEventListener("touchend", handleTouchEnd, { passive: true });
    return () => {
      document.removeEventListener("touchstart", handleTouchStart);
      document.removeEventListener("touchend", handleTouchEnd);
    };
  }, [onSwipeRight, onSwipeLeft, threshold, edgeWidth]);
}

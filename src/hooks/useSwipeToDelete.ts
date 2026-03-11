import { useRef, useState, useCallback } from "react";

interface UseSwipeToDeleteOptions {
  threshold?: number;
  onDelete: (id: string) => void;
}

export function useSwipeToDelete({ threshold = 100, onDelete }: UseSwipeToDeleteOptions) {
  const [swipeStates, setSwipeStates] = useState<Record<string, number>>({});
  const touchStartRef = useRef<{ x: number; y: number; id: string } | null>(null);
  const isSwipingRef = useRef(false);

  const handleTouchStart = useCallback((id: string, e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY, id };
    isSwipingRef.current = false;
  }, []);

  const handleTouchMove = useCallback((id: string, e: React.TouchEvent) => {
    if (!touchStartRef.current || touchStartRef.current.id !== id) return;
    const touch = e.touches[0];
    const dx = touch.clientX - touchStartRef.current.x;
    const dy = touch.clientY - touchStartRef.current.y;

    // Only register horizontal swipe
    if (!isSwipingRef.current && Math.abs(dy) > Math.abs(dx)) {
      touchStartRef.current = null;
      return;
    }
    
    if (Math.abs(dx) > 10) isSwipingRef.current = true;

    // Only allow left swipe (negative dx)
    const offset = Math.min(0, dx);
    setSwipeStates(prev => ({ ...prev, [id]: offset }));
  }, []);

  const handleTouchEnd = useCallback((id: string) => {
    const offset = swipeStates[id] || 0;
    if (Math.abs(offset) > threshold) {
      // Haptic feedback
      if (navigator.vibrate) navigator.vibrate(20);
      // Animate out then delete
      setSwipeStates(prev => ({ ...prev, [id]: -window.innerWidth }));
      setTimeout(() => {
        onDelete(id);
        setSwipeStates(prev => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
      }, 250);
    } else {
      // Spring back
      setSwipeStates(prev => ({ ...prev, [id]: 0 }));
    }
    touchStartRef.current = null;
    isSwipingRef.current = false;
  }, [swipeStates, threshold, onDelete]);

  const getSwipeProps = useCallback((id: string) => ({
    onTouchStart: (e: React.TouchEvent) => handleTouchStart(id, e),
    onTouchMove: (e: React.TouchEvent) => handleTouchMove(id, e),
    onTouchEnd: () => handleTouchEnd(id),
    style: {
      transform: `translateX(${swipeStates[id] || 0}px)`,
      transition: (swipeStates[id] || 0) === 0 || Math.abs(swipeStates[id] || 0) > threshold
        ? "transform 0.25s ease-out"
        : "none",
    } as React.CSSProperties,
  }), [handleTouchStart, handleTouchMove, handleTouchEnd, swipeStates, threshold]);

  const getDeleteRevealStyle = useCallback((id: string): React.CSSProperties => {
    const offset = swipeStates[id] || 0;
    return {
      opacity: Math.min(Math.abs(offset) / threshold, 1),
      width: Math.abs(offset),
    };
  }, [swipeStates, threshold]);

  return { getSwipeProps, getDeleteRevealStyle, swipeStates };
}

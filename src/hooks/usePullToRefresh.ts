import { useEffect, useRef, useState, useCallback } from "react";

interface UsePullToRefreshOptions {
  onRefresh: () => Promise<void> | void;
  threshold?: number;   // px to pull before triggering
  resistance?: number;  // higher = harder to pull
  disabled?: boolean;
  containerRef?: React.RefObject<HTMLElement>;
}

interface UsePullToRefreshReturn {
  pullDistance: number;
  pullProgress: number; // 0-1
  isRefreshing: boolean;
  isTriggered: boolean;
}

export function usePullToRefresh({
  onRefresh,
  threshold = 72,
  resistance = 2.5,
  disabled = false,
  containerRef,
}: UsePullToRefreshOptions): UsePullToRefreshReturn {
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isTriggered, setIsTriggered] = useState(false);

  const startYRef = useRef<number | null>(null);
  const isPullingRef = useRef(false);

  const getScrollTop = useCallback(() => {
    if (containerRef?.current) return containerRef.current.scrollTop;
    return window.scrollY || document.documentElement.scrollTop;
  }, [containerRef]);

  useEffect(() => {
    if (disabled) return;

    const handleTouchStart = (e: TouchEvent) => {
      // Only begin pull when at the very top of the scroll container
      if (getScrollTop() > 2) return;
      startYRef.current = e.touches[0].clientY;
      isPullingRef.current = false;
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (startYRef.current === null || isRefreshing) return;
      const dy = e.touches[0].clientY - startYRef.current;
      if (dy <= 0) {
        setPullDistance(0);
        isPullingRef.current = false;
        return;
      }
      isPullingRef.current = true;
      const distance = Math.min(dy / resistance, threshold * 1.5);
      setPullDistance(distance);
      setIsTriggered(distance >= threshold);
    };

    const handleTouchEnd = async () => {
      if (!isPullingRef.current) {
        startYRef.current = null;
        return;
      }
      if (isTriggered && !isRefreshing) {
        setIsRefreshing(true);
        setPullDistance(threshold * 0.6); // settle indicator
        try {
          await onRefresh();
        } finally {
          setIsRefreshing(false);
        }
      }
      setPullDistance(0);
      setIsTriggered(false);
      startYRef.current = null;
      isPullingRef.current = false;
    };

    const target = containerRef?.current ?? document;
    target.addEventListener("touchstart", handleTouchStart as EventListener, { passive: true });
    target.addEventListener("touchmove", handleTouchMove as EventListener, { passive: true });
    target.addEventListener("touchend", handleTouchEnd as EventListener, { passive: true });
    return () => {
      target.removeEventListener("touchstart", handleTouchStart as EventListener);
      target.removeEventListener("touchmove", handleTouchMove as EventListener);
      target.removeEventListener("touchend", handleTouchEnd as EventListener);
    };
  }, [disabled, isRefreshing, isTriggered, threshold, resistance, onRefresh, getScrollTop, containerRef]);

  return {
    pullDistance,
    pullProgress: Math.min(pullDistance / threshold, 1),
    isRefreshing,
    isTriggered,
  };
}

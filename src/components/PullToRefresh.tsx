import { useRef } from "react";
import { RefreshCw } from "lucide-react";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

interface PullToRefreshProps {
  onRefresh: () => Promise<void> | void;
  children: React.ReactNode;
  className?: string;
  threshold?: number;
}

const PullToRefresh = ({ onRefresh, children, className, threshold = 72 }: PullToRefreshProps) => {
  const isMobile = useIsMobile();
  const containerRef = useRef<HTMLDivElement>(null);

  const { pullDistance, pullProgress, isRefreshing, isTriggered } = usePullToRefresh({
    onRefresh,
    threshold,
    disabled: !isMobile,
    containerRef,
  });

  const indicatorSize = 36;
  // Translate the indicator down into view as user pulls
  const translateY = isRefreshing
    ? threshold * 0.5
    : pullDistance > 0
    ? Math.max(pullDistance - indicatorSize / 2, 0)
    : -indicatorSize;

  return (
    <div ref={containerRef} className={cn("relative overflow-y-auto", className)}>
      {/* Pull indicator */}
      {isMobile && (
        <div
          className="pointer-events-none absolute left-0 right-0 top-0 z-20 flex justify-center"
          style={{
            transform: `translateY(${translateY}px)`,
            transition: isRefreshing ? "transform 0.2s ease" : "none",
          }}
        >
          <div
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-full shadow-card transition-colors duration-150",
              isTriggered || isRefreshing
                ? "bg-primary text-primary-foreground"
                : "bg-card text-muted-foreground border border-border"
            )}
          >
            <RefreshCw
              className="h-4 w-4"
              style={{
                transform: `rotate(${isRefreshing ? 0 : pullProgress * 360}deg)`,
                animation: isRefreshing ? "spin 0.8s linear infinite" : "none",
              }}
            />
          </div>
        </div>
      )}

      {/* Content shifted down while pulling */}
      <div
        style={{
          transform: pullDistance > 0 && !isRefreshing ? `translateY(${Math.min(pullDistance * 0.4, 48)}px)` : undefined,
          transition: pullDistance === 0 ? "transform 0.3s ease" : "none",
        }}
      >
        {children}
      </div>
    </div>
  );
};

export default PullToRefresh;

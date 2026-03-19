import { useState, useEffect, useRef, useCallback } from "react";

export interface BehavioralMetrics {
  typingSpeed: number; // chars per minute
  avgKeyInterval: number; // ms between keystrokes
  touchPressure: number; // average if available
  scrollPatterns: number; // scroll events count
  pauseCount: number; // pauses > 3s
  totalInteractionTime: number; // ms
  deviceMotion: boolean; // device in motion
  inputConsistency: number; // 0-100 score
}

interface KeyEvent {
  time: number;
  key: string;
}

export const useBehavioralMonitoring = (enabled: boolean = false) => {
  const [metrics, setMetrics] = useState<BehavioralMetrics>({
    typingSpeed: 0,
    avgKeyInterval: 0,
    touchPressure: 0,
    scrollPatterns: 0,
    pauseCount: 0,
    totalInteractionTime: 0,
    deviceMotion: false,
    inputConsistency: 100,
  });

  const keyEventsRef = useRef<KeyEvent[]>([]);
  const scrollCountRef = useRef(0);
  const startTimeRef = useRef(Date.now());
  const lastActivityRef = useRef(Date.now());
  const pauseCountRef = useRef(0);
  const touchPressuresRef = useRef<number[]>([]);

  // Track typing patterns
  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const now = Date.now();
      keyEventsRef.current.push({ time: now, key: e.key });
      
      // Detect pauses > 3 seconds
      if (now - lastActivityRef.current > 3000) {
        pauseCountRef.current++;
      }
      lastActivityRef.current = now;

      // Keep last 200 events
      if (keyEventsRef.current.length > 200) {
        keyEventsRef.current = keyEventsRef.current.slice(-200);
      }
    };

    const handleScroll = () => {
      scrollCountRef.current++;
      lastActivityRef.current = Date.now();
    };

    const handleTouch = (e: TouchEvent) => {
      lastActivityRef.current = Date.now();
      // Touch force if available (iOS)
      if (e.touches[0] && "force" in e.touches[0]) {
        touchPressuresRef.current.push((e.touches[0] as any).force);
        if (touchPressuresRef.current.length > 100) {
          touchPressuresRef.current = touchPressuresRef.current.slice(-100);
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("scroll", handleScroll, true);
    document.addEventListener("touchstart", handleTouch, { passive: true });

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("scroll", handleScroll, true);
      document.removeEventListener("touchstart", handleTouch);
    };
  }, [enabled]);

  // Device motion detection
  useEffect(() => {
    if (!enabled) return;

    let motionDetected = false;
    const handleMotion = (e: DeviceMotionEvent) => {
      const acc = e.accelerationIncludingGravity;
      if (acc && (Math.abs(acc.x || 0) > 2 || Math.abs(acc.y || 0) > 2)) {
        motionDetected = true;
      }
    };

    window.addEventListener("devicemotion", handleMotion);
    const interval = setInterval(() => {
      setMetrics(prev => ({ ...prev, deviceMotion: motionDetected }));
      motionDetected = false;
    }, 5000);

    return () => {
      window.removeEventListener("devicemotion", handleMotion);
      clearInterval(interval);
    };
  }, [enabled]);

  // Compute metrics periodically
  useEffect(() => {
    if (!enabled) return;

    const interval = setInterval(() => {
      const events = keyEventsRef.current;
      const totalTime = Date.now() - startTimeRef.current;

      // Typing speed (chars per minute)
      const charEvents = events.filter(e => e.key.length === 1);
      const typingSpeed = charEvents.length > 0
        ? Math.round(charEvents.length / (totalTime / 60000))
        : 0;

      // Average key interval
      let avgInterval = 0;
      if (events.length > 1) {
        const intervals = events.slice(1).map((e, i) => e.time - events[i].time);
        avgInterval = Math.round(intervals.reduce((a, b) => a + b, 0) / intervals.length);
      }

      // Touch pressure average
      const pressures = touchPressuresRef.current;
      const avgPressure = pressures.length > 0
        ? pressures.reduce((a, b) => a + b, 0) / pressures.length
        : 0;

      // Input consistency: variation coefficient of key intervals
      let consistency = 100;
      if (events.length > 5) {
        const intervals = events.slice(1).map((e, i) => e.time - events[i].time).filter(i => i < 2000);
        if (intervals.length > 3) {
          const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length;
          const variance = intervals.reduce((sum, i) => sum + (i - mean) ** 2, 0) / intervals.length;
          const cv = Math.sqrt(variance) / mean;
          consistency = Math.max(0, Math.min(100, Math.round(100 - cv * 50)));
        }
      }

      setMetrics({
        typingSpeed,
        avgKeyInterval: avgInterval,
        touchPressure: Math.round(avgPressure * 100) / 100,
        scrollPatterns: scrollCountRef.current,
        pauseCount: pauseCountRef.current,
        totalInteractionTime: totalTime,
        deviceMotion: false, // Set by motion handler
        inputConsistency: consistency,
      });
    }, 5000);

    return () => clearInterval(interval);
  }, [enabled]);

  const reset = useCallback(() => {
    keyEventsRef.current = [];
    scrollCountRef.current = 0;
    pauseCountRef.current = 0;
    touchPressuresRef.current = [];
    startTimeRef.current = Date.now();
    lastActivityRef.current = Date.now();
  }, []);

  return { metrics, reset, isMonitoring: enabled };
};

export default useBehavioralMonitoring;

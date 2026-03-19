import { useState, useEffect, useRef, useCallback } from "react";

export interface SecurityPosture {
  isLocked: boolean;
  lockReason: string | null;
  confidenceScore: number; // 0-100
  typingRhythmMatch: number; // 0-100
  touchPressureMatch: number; // 0-100
  swipeSpeedMatch: number; // 0-100
  isSecureNetwork: boolean;
  isRootedDevice: boolean;
}

interface BiometricProfile {
  avgKeyInterval: number;
  keyIntervalStdDev: number;
  avgTouchPressure: number;
  avgSwipeSpeed: number;
  swipeSpeedStdDev: number;
}

const PROFILE_KEY = "continuous_auth_profile";
const MIN_SAMPLES = 20;
const LOCK_THRESHOLD = 30;

export const useContinuousAuth = (enabled: boolean = false) => {
  const [posture, setPosture] = useState<SecurityPosture>({
    isLocked: false,
    lockReason: null,
    confidenceScore: 100,
    typingRhythmMatch: 100,
    touchPressureMatch: 100,
    swipeSpeedMatch: 100,
    isSecureNetwork: true,
    isRootedDevice: false,
  });

  const keyTimesRef = useRef<number[]>([]);
  const touchPressuresRef = useRef<number[]>([]);
  const swipeSpeedsRef = useRef<number[]>([]);
  const profileRef = useRef<BiometricProfile | null>(null);
  const samplesRef = useRef(0);

  // Load saved profile
  useEffect(() => {
    if (!enabled) return;
    try {
      const saved = localStorage.getItem(PROFILE_KEY);
      if (saved) profileRef.current = JSON.parse(saved);
    } catch {}
  }, [enabled]);

  const saveProfile = useCallback((profile: BiometricProfile) => {
    profileRef.current = profile;
    try {
      localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    } catch {}
  }, []);

  const calcStdDev = (arr: number[], mean: number) => {
    if (arr.length < 2) return 0;
    const variance = arr.reduce((sum, v) => sum + (v - mean) ** 2, 0) / arr.length;
    return Math.sqrt(variance);
  };

  const compareRhythm = useCallback((currentIntervals: number[]): number => {
    const profile = profileRef.current;
    if (!profile || currentIntervals.length < 5) return 100;
    const currentMean = currentIntervals.reduce((a, b) => a + b, 0) / currentIntervals.length;
    const deviation = Math.abs(currentMean - profile.avgKeyInterval);
    const normalizedDev = deviation / Math.max(profile.keyIntervalStdDev, 30);
    return Math.max(0, Math.min(100, Math.round(100 - normalizedDev * 25)));
  }, []);

  const comparePressure = useCallback((currentPressures: number[]): number => {
    const profile = profileRef.current;
    if (!profile || currentPressures.length < 3 || profile.avgTouchPressure === 0) return 100;
    const currentMean = currentPressures.reduce((a, b) => a + b, 0) / currentPressures.length;
    const deviation = Math.abs(currentMean - profile.avgTouchPressure);
    return Math.max(0, Math.min(100, Math.round(100 - deviation * 200)));
  }, []);

  const compareSwipe = useCallback((currentSpeeds: number[]): number => {
    const profile = profileRef.current;
    if (!profile || currentSpeeds.length < 3 || profile.avgSwipeSpeed === 0) return 100;
    const currentMean = currentSpeeds.reduce((a, b) => a + b, 0) / currentSpeeds.length;
    const deviation = Math.abs(currentMean - profile.avgSwipeSpeed);
    const normalizedDev = deviation / Math.max(profile.swipeSpeedStdDev, 50);
    return Math.max(0, Math.min(100, Math.round(100 - normalizedDev * 25)));
  }, []);

  // Track typing
  useEffect(() => {
    if (!enabled) return;
    let lastKeyTime = 0;

    const handleKeyDown = () => {
      const now = Date.now();
      if (lastKeyTime > 0) {
        const interval = now - lastKeyTime;
        if (interval > 10 && interval < 3000) {
          keyTimesRef.current.push(interval);
          if (keyTimesRef.current.length > 100) keyTimesRef.current = keyTimesRef.current.slice(-100);
          samplesRef.current++;
        }
      }
      lastKeyTime = now;
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [enabled]);

  // Track touch pressure & swipe speed
  useEffect(() => {
    if (!enabled) return;
    let touchStart: { x: number; y: number; time: number } | null = null;

    const handleTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0];
      if (!touch) return;
      touchStart = { x: touch.clientX, y: touch.clientY, time: Date.now() };
      if ("force" in touch && (touch as any).force > 0) {
        touchPressuresRef.current.push((touch as any).force);
        if (touchPressuresRef.current.length > 50) touchPressuresRef.current = touchPressuresRef.current.slice(-50);
        samplesRef.current++;
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (!touchStart) return;
      const touch = e.changedTouches[0];
      if (!touch) return;
      const dx = touch.clientX - touchStart.x;
      const dy = touch.clientY - touchStart.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const time = Date.now() - touchStart.time;
      if (distance > 30 && time > 0) {
        const speed = distance / time; // px/ms
        swipeSpeedsRef.current.push(speed);
        if (swipeSpeedsRef.current.length > 50) swipeSpeedsRef.current = swipeSpeedsRef.current.slice(-50);
        samplesRef.current++;
      }
      touchStart = null;
    };

    document.addEventListener("touchstart", handleTouchStart, { passive: true });
    document.addEventListener("touchend", handleTouchEnd, { passive: true });
    return () => {
      document.removeEventListener("touchstart", handleTouchStart);
      document.removeEventListener("touchend", handleTouchEnd);
    };
  }, [enabled]);

  // Check security posture
  useEffect(() => {
    if (!enabled) return;

    const checkSecurity = () => {
      let isRooted = false;
      // Simple root/jailbreak detection heuristics
      try {
        const ua = navigator.userAgent.toLowerCase();
        if (ua.includes("cydia") || ua.includes("substrate")) isRooted = true;
        // Check for debugging tools
        if ((window as any).__REACT_DEVTOOLS_GLOBAL_HOOK__?.isDisabled === false) {
          // Dev tools detected but not necessarily rooted
        }
      } catch {}

      // Check network security (basic heuristic)
      const connection = (navigator as any).connection;
      const isSecure = window.location.protocol === "https:" || window.location.hostname === "localhost";
      const isWifi = connection?.type === "wifi";
      // We can't truly detect unsecure Wi-Fi from browser, but we flag non-HTTPS
      const isSecureNetwork = isSecure;

      setPosture(prev => ({
        ...prev,
        isRootedDevice: isRooted,
        isSecureNetwork,
      }));

      // Auto-lock on rooted device
      if (isRooted) {
        setPosture(prev => ({
          ...prev,
          isLocked: true,
          lockReason: "Compromised device detected. Please contact your administrator.",
        }));
      }

      // Auto-lock on insecure connection
      if (!isSecure && window.location.hostname !== "localhost") {
        setPosture(prev => ({
          ...prev,
          isLocked: true,
          lockReason: "Insecure network connection detected. Please switch to a secure network.",
        }));
      }
    };

    checkSecurity();
    const interval = setInterval(checkSecurity, 30000);
    return () => clearInterval(interval);
  }, [enabled]);

  // Periodic biometric comparison
  useEffect(() => {
    if (!enabled) return;

    const analyze = () => {
      const keys = keyTimesRef.current;
      const pressures = touchPressuresRef.current;
      const swipes = swipeSpeedsRef.current;

      // Build or update profile when enough samples collected
      if (samplesRef.current >= MIN_SAMPLES && !profileRef.current) {
        const keyMean = keys.length > 0 ? keys.reduce((a, b) => a + b, 0) / keys.length : 200;
        const pressureMean = pressures.length > 0 ? pressures.reduce((a, b) => a + b, 0) / pressures.length : 0;
        const swipeMean = swipes.length > 0 ? swipes.reduce((a, b) => a + b, 0) / swipes.length : 0;

        saveProfile({
          avgKeyInterval: keyMean,
          keyIntervalStdDev: calcStdDev(keys, keyMean),
          avgTouchPressure: pressureMean,
          avgSwipeSpeed: swipeMean,
          swipeSpeedStdDev: calcStdDev(swipes, swipeMean),
        });
        return;
      }

      if (!profileRef.current) return;

      const typingMatch = compareRhythm(keys.slice(-20));
      const pressureMatch = comparePressure(pressures.slice(-10));
      const swipeMatch = compareSwipe(swipes.slice(-10));

      // Weighted confidence
      const hasTyping = keys.length >= 5;
      const hasPressure = pressures.length >= 3;
      const hasSwipe = swipes.length >= 3;
      const totalWeight = (hasTyping ? 50 : 0) + (hasPressure ? 25 : 0) + (hasSwipe ? 25 : 0);

      let confidence = 100;
      if (totalWeight > 0) {
        confidence = Math.round(
          ((hasTyping ? typingMatch * 50 : 0) +
            (hasPressure ? pressureMatch * 25 : 0) +
            (hasSwipe ? swipeMatch * 25 : 0)) / totalWeight
        );
      }

      setPosture(prev => {
        const shouldLock = confidence < LOCK_THRESHOLD && !prev.isLocked;
        return {
          ...prev,
          confidenceScore: confidence,
          typingRhythmMatch: typingMatch,
          touchPressureMatch: pressureMatch,
          swipeSpeedMatch: swipeMatch,
          isLocked: prev.isLocked || shouldLock,
          lockReason: shouldLock
            ? "Behavioral pattern mismatch detected. Please re-authenticate."
            : prev.lockReason,
        };
      });
    };

    const interval = setInterval(analyze, 10000);
    return () => clearInterval(interval);
  }, [enabled, compareRhythm, comparePressure, compareSwipe, saveProfile]);

  const unlock = useCallback(() => {
    setPosture(prev => ({ ...prev, isLocked: false, lockReason: null, confidenceScore: 100 }));
  }, []);

  const resetProfile = useCallback(() => {
    profileRef.current = null;
    keyTimesRef.current = [];
    touchPressuresRef.current = [];
    swipeSpeedsRef.current = [];
    samplesRef.current = 0;
    localStorage.removeItem(PROFILE_KEY);
  }, []);

  return { posture, unlock, resetProfile };
};

export default useContinuousAuth;

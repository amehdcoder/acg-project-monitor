import { useState, useEffect, useRef, useCallback } from "react";

export interface StationaryGeofenceState {
  isStationary: boolean;
  isHighPowerGPS: boolean;
  motionDetected: boolean;
  lastMotionTime: number | null;
  batteryLevel: number | null;
  accelerometerAvailable: boolean;
}

interface Options {
  enabled?: boolean;
  motionThreshold?: number; // m/s² - acceleration needed to consider "moving"
  stationaryTimeout?: number; // ms - time without motion to consider stationary
  lowPowerInterval?: number; // ms - GPS interval when stationary
  highPowerInterval?: number; // ms - GPS interval when moving
  onLocationUpdate?: (lat: number, lng: number, accuracy: number, isHighPower: boolean) => void;
}

export const useStationaryGeofence = ({
  enabled = false,
  motionThreshold = 1.5,
  stationaryTimeout = 30000,
  lowPowerInterval = 60000,
  highPowerInterval = 5000,
  onLocationUpdate,
}: Options = {}) => {
  const [state, setState] = useState<StationaryGeofenceState>({
    isStationary: true,
    isHighPowerGPS: false,
    motionDetected: false,
    lastMotionTime: null,
    batteryLevel: null,
    accelerometerAvailable: false,
  });

  const lastMotionRef = useRef<number>(0);
  const gpsIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const stationaryCheckRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const checkMotion = useCallback((event: DeviceMotionEvent) => {
    const acc = event.accelerationIncludingGravity;
    if (!acc) return;

    // Calculate net acceleration minus gravity (~9.8)
    const magnitude = Math.sqrt(
      (acc.x || 0) ** 2 + (acc.y || 0) ** 2 + (acc.z || 0) ** 2
    );
    const netAcceleration = Math.abs(magnitude - 9.81);

    if (netAcceleration > motionThreshold) {
      lastMotionRef.current = Date.now();
      setState(prev => ({
        ...prev,
        motionDetected: true,
        isStationary: false,
        lastMotionTime: Date.now(),
      }));
    }
  }, [motionThreshold]);

  const getLocation = useCallback((highAccuracy: boolean) => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        onLocationUpdate?.(
          pos.coords.latitude,
          pos.coords.longitude,
          pos.coords.accuracy,
          highAccuracy
        );
      },
      () => {},
      {
        enableHighAccuracy: highAccuracy,
        timeout: highAccuracy ? 15000 : 30000,
        maximumAge: highAccuracy ? 0 : 60000,
      }
    );
  }, [onLocationUpdate]);

  // Start/stop high-power GPS based on motion
  const updateGPSMode = useCallback(() => {
    const now = Date.now();
    const timeSinceMotion = now - lastMotionRef.current;
    const isNowStationary = timeSinceMotion > stationaryTimeout;

    if (gpsIntervalRef.current) clearInterval(gpsIntervalRef.current);

    if (isNowStationary) {
      // Low-power mode: infrequent GPS checks
      setState(prev => ({ ...prev, isStationary: true, isHighPowerGPS: false, motionDetected: false }));
      gpsIntervalRef.current = setInterval(() => getLocation(false), lowPowerInterval);
    } else {
      // High-power mode: frequent GPS checks
      setState(prev => ({ ...prev, isStationary: false, isHighPowerGPS: true }));
      gpsIntervalRef.current = setInterval(() => getLocation(true), highPowerInterval);
      getLocation(true); // Immediate first fix
    }
  }, [stationaryTimeout, lowPowerInterval, highPowerInterval, getLocation]);

  // Check battery level
  useEffect(() => {
    if (!enabled) return;
    if ('getBattery' in navigator) {
      (navigator as any).getBattery().then((battery: any) => {
        setState(prev => ({ ...prev, batteryLevel: Math.round(battery.level * 100) }));
        battery.addEventListener('levelchange', () => {
          setState(prev => ({ ...prev, batteryLevel: Math.round(battery.level * 100) }));
        });
      });
    }
  }, [enabled]);

  // Set up accelerometer listening
  useEffect(() => {
    if (!enabled) return;

    const hasMotionAPI = 'DeviceMotionEvent' in window;
    setState(prev => ({ ...prev, accelerometerAvailable: hasMotionAPI }));

    if (!hasMotionAPI) {
      // Fallback: just use timed GPS
      gpsIntervalRef.current = setInterval(() => getLocation(false), lowPowerInterval);
      return;
    }

    window.addEventListener('devicemotion', checkMotion);

    // Periodically check stationary status
    stationaryCheckRef.current = setInterval(updateGPSMode, 5000);

    // Start with low-power GPS
    gpsIntervalRef.current = setInterval(() => getLocation(false), lowPowerInterval);

    return () => {
      window.removeEventListener('devicemotion', checkMotion);
      if (gpsIntervalRef.current) clearInterval(gpsIntervalRef.current);
      if (stationaryCheckRef.current) clearInterval(stationaryCheckRef.current);
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
    };
  }, [enabled, checkMotion, updateGPSMode, getLocation, lowPowerInterval]);

  return state;
};

export default useStationaryGeofence;

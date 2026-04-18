import { useState, useCallback, useEffect } from "react";

export interface GeolocationPosition {
  lat: number;
  lng: number;
  accuracy: number;
  altitude: number | null;
  timestamp: number;
}

export interface GeolocationState {
  position: GeolocationPosition | null;
  error: string | null;
  isLoading: boolean;
  isWatching: boolean;
}

export const useGeolocation = (options?: PositionOptions) => {
  const [state, setState] = useState<GeolocationState>({
    position: null,
    error: null,
    isLoading: false,
    isWatching: false,
  });

  const defaultOptions: PositionOptions = {
    enableHighAccuracy: true,
    timeout: 30000,
    maximumAge: 0,
    ...options,
  };

  const handleSuccess = useCallback((nativePosition: globalThis.GeolocationPosition) => {
    setState((prev) => ({
      ...prev,
      position: {
        lat: nativePosition.coords.latitude,
        lng: nativePosition.coords.longitude,
        accuracy: nativePosition.coords.accuracy,
        altitude: nativePosition.coords.altitude,
        timestamp: nativePosition.timestamp,
      },
      error: null,
      isLoading: false,
    }));
  }, []);

  const handleError = useCallback((error: GeolocationPositionError) => {
    let errorMessage = "Unable to retrieve location";
    
    switch (error.code) {
      case error.PERMISSION_DENIED:
        errorMessage = "Location permission denied. Please enable location access.";
        break;
      case error.POSITION_UNAVAILABLE:
        errorMessage = "Location information is unavailable.";
        break;
      case error.TIMEOUT:
        errorMessage = "Location request timed out.";
        break;
    }

    setState((prev) => ({
      ...prev,
      error: errorMessage,
      isLoading: false,
    }));
  }, []);

  const getCurrentPosition = useCallback(() => {
    if (!navigator.geolocation) {
      setState((prev) => ({
        ...prev,
        error: "Geolocation is not supported by your browser",
        isLoading: false,
      }));
      return;
    }

    setState((prev) => ({ ...prev, isLoading: true, error: null }));
    navigator.geolocation.getCurrentPosition(
      handleSuccess as any,
      handleError,
      defaultOptions
    );
  }, [handleSuccess, handleError]);

  const watchId = { current: null as number | null };

  const startWatching = useCallback(() => {
    if (!navigator.geolocation) {
      setState((prev) => ({
        ...prev,
        error: "Geolocation is not supported by your browser",
      }));
      return;
    }

    setState((prev) => ({ ...prev, isWatching: true, error: null }));
    watchId.current = navigator.geolocation.watchPosition(
      handleSuccess as any,
      handleError,
      defaultOptions
    );
  }, [handleSuccess, handleError]);

  const stopWatching = useCallback(() => {
    if (watchId.current !== null) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    }
    setState((prev) => ({ ...prev, isWatching: false }));
  }, []);

  useEffect(() => {
    return () => {
      if (watchId.current !== null) {
        navigator.geolocation.clearWatch(watchId.current);
      }
    };
  }, []);

  return {
    ...state,
    getCurrentPosition,
    startWatching,
    stopWatching,
  };
};

export default useGeolocation;

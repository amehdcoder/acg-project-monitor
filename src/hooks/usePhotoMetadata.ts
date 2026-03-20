import { useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Automatically captures and logs metadata (date, time, GPS) from photos/videos.
 * Since browser cameras don't produce EXIF, we bake in device metadata at capture time.
 */
export const usePhotoMetadata = (formId: string, userId: string) => {
  const captureMetadata = useCallback(async (
    questionId: string,
    mediaType: "photo" | "video",
    submissionId?: string
  ) => {
    const metadata: Record<string, unknown> = {
      captured_at: new Date().toISOString(),
      capture_date: new Date().toLocaleDateString(),
      capture_time: new Date().toLocaleTimeString(),
      media_type: mediaType,
      question_id: questionId,
      device: {
        user_agent: navigator.userAgent,
        screen: `${screen.width}x${screen.height}`,
        pixel_ratio: window.devicePixelRatio,
      },
    };

    // Try to capture GPS
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 5000,
          maximumAge: 60000,
        });
      });

      metadata.gps = {
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        altitude: pos.coords.altitude,
        accuracy: pos.coords.accuracy,
        timestamp: pos.timestamp,
      };
    } catch {
      metadata.gps = null;
      metadata.gps_error = "Location unavailable";
    }

    // Log to form_tracking_events
    await supabase.from("form_tracking_events" as any).insert({
      form_id: formId,
      submission_id: submissionId || null,
      user_id: userId,
      event_type: "photo_metadata",
      event_data: metadata,
    });

    return metadata;
  }, [formId, userId]);

  return { captureMetadata };
};

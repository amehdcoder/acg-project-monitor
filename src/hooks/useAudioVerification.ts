import { useState, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface AudioVerificationOptions {
  formId: string;
  userId: string;
  maxDurationSeconds?: number;
  /** User's display name for clip identification */
  userName?: string;
  /** Administrative unit (state/LGA/ward) for clip identification */
  adminUnit?: string;
  /** Form name for identification */
  formName?: string;
}

export const useAudioVerification = ({
  formId,
  userId,
  maxDurationSeconds = 30,
  userName,
  adminUnit,
  formName,
}: AudioVerificationOptions) => {
  const [isRecording, setIsRecording] = useState(false);
  const [audioClipUrl, setAudioClipUrl] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });

      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });

        if (blob.size === 0) {
          setAudioClipUrl(null);
          return;
        }

        // Fetch user profile for name and admin unit if not passed
        let resolvedName = userName || "";
        let resolvedAdminUnit = adminUnit || "";
        if (!resolvedName || !resolvedAdminUnit) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("first_name, last_name, state, lga, ward")
            .eq("user_id", userId)
            .single();
          if (profile) {
            if (!resolvedName) {
              resolvedName = `${profile.first_name || ""} ${profile.last_name || ""}`.trim();
            }
            if (!resolvedAdminUnit) {
              resolvedAdminUnit = [profile.state, profile.lga, profile.ward]
                .filter(Boolean)
                .join(" / ");
            }
          }
        }

        const fileName = `${userId}/${formId}_${Date.now()}.webm`;
        const { data, error } = await supabase.storage
          .from("audio-verification")
          .upload(fileName, blob, { contentType: "audio/webm" });

        if (!error && data) {
          setAudioClipUrl(data.path);
          // Log the event with user identification metadata
          await supabase.from("form_tracking_events" as any).insert({
            form_id: formId,
            user_id: userId,
            event_type: "audio_verification",
            event_data: {
              file_path: data.path,
              duration_seconds: maxDurationSeconds,
              recorded_at: new Date().toISOString(),
              user_name: resolvedName,
              admin_unit: resolvedAdminUnit,
              form_name: formName || formId,
            },
          });
        }
      };

      recorder.start(1000);
      mediaRecorderRef.current = recorder;
      setIsRecording(true);

      // Auto-stop after max duration
      timeoutRef.current = setTimeout(() => {
        stopRecording();
      }, maxDurationSeconds * 1000);
    } catch (err) {
      console.error("Audio recording failed:", err);
      toast({
        title: "Audio Capture",
        description: "Could not access microphone. Please grant permission.",
        variant: "destructive",
      });
    }
  }, [formId, userId, maxDurationSeconds, userName, adminUnit, formName]);

  const stopRecording = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  }, []);

  return {
    isRecording,
    audioClipUrl,
    startRecording,
    stopRecording,
  };
};

import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Video, Square, Trash2, SwitchCamera, AlertCircle } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface VideoCaptureProps {
  value?: string;
  onChange: (value: string | null) => void;
  maxDuration?: number;
  maxSize?: number;
  autoTrigger?: boolean;
}

const VideoCapture = ({ value, onChange, maxDuration = 120, maxSize = 50, autoTrigger }: VideoCaptureProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const previewRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [isRecording, setIsRecording] = useState(false);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(value || null);
  const [isPreviewing, setIsPreviewing] = useState(!!value);
  const [duration, setDuration] = useState(0);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const [cameraError, setCameraError] = useState<string | null>(null);

  // Auto-trigger recording from voice command
  useEffect(() => {
    if (autoTrigger && !value && !isRecording && !recordedUrl) {
      startRecording();
    }
  }, [autoTrigger]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopAllTracks();
      if (timerRef.current) clearInterval(timerRef.current);
      if (recordedUrl && !value) URL.revokeObjectURL(recordedUrl);
    };
  }, []);

  const stopAllTracks = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const getSupportedMimeType = () => {
    const types = [
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm",
      "video/mp4",
    ];
    return types.find(t => MediaRecorder.isTypeSupported(t)) || "video/webm";
  };

  const startRecording = useCallback(async () => {
    setCameraError(null);
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError("Camera API not available. Use HTTPS or a supported browser.");
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: true,
      });
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.muted = true;
        await videoRef.current.play().catch(() => {});
      }

      const mimeType = getSupportedMimeType();
      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        stopAllTracks();
        const blob = new Blob(chunksRef.current, { type: mimeType });

        if (blob.size > maxSize * 1024 * 1024) {
          toast({ title: "Video too large", description: `Maximum size is ${maxSize}MB. Try a shorter recording.`, variant: "destructive" });
          return;
        }
        if (blob.size === 0) {
          toast({ title: "Recording failed", description: "No video data captured. Please try again.", variant: "destructive" });
          return;
        }

        const url = URL.createObjectURL(blob);
        if (recordedUrl) URL.revokeObjectURL(recordedUrl);
        setRecordedUrl(url);
        setIsPreviewing(true);

        const reader = new FileReader();
        reader.onloadend = () => onChange(reader.result as string);
        reader.onerror = () => toast({ title: "Processing error", description: "Failed to process video.", variant: "destructive" });
        reader.readAsDataURL(blob);
      };

      recorder.onerror = () => {
        toast({ title: "Recording error", description: "An error occurred during recording.", variant: "destructive" });
        stopRecording();
      };

      recorder.start(1000);
      setIsRecording(true);
      setIsPreviewing(false);
      setDuration(0);

      timerRef.current = setInterval(() => {
        setDuration(prev => {
          if (prev >= maxDuration - 1) {
            stopRecording();
            return prev;
          }
          return prev + 1;
        });
      }, 1000);
    } catch (err: any) {
      const msg = err.name === "NotAllowedError"
        ? "Camera permission denied. Please allow camera access in your browser settings."
        : err.name === "NotFoundError"
          ? "No camera found. Connect a camera and try again."
          : `Could not access camera: ${err.message}`;
      setCameraError(msg);
      toast({ title: "Camera Error", description: msg, variant: "destructive" });
    }
  }, [facingMode, maxDuration, maxSize, onChange, recordedUrl, stopAllTracks]);

  const stopRecording = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    } else {
      stopAllTracks();
    }
    setIsRecording(false);
  }, [stopAllTracks]);

  const deleteRecording = useCallback(() => {
    if (recordedUrl) URL.revokeObjectURL(recordedUrl);
    setRecordedUrl(null);
    setIsPreviewing(false);
    setDuration(0);
    onChange(null);
  }, [recordedUrl, onChange]);

  const switchCamera = useCallback(() => {
    const next = facingMode === "environment" ? "user" : "environment";
    setFacingMode(next);
    if (isRecording) {
      stopRecording();
      setTimeout(() => startRecording(), 300);
    }
  }, [facingMode, isRecording, stopRecording, startRecording]);

  const formatTime = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;

  return (
    <div className="space-y-3">
      <div className="relative rounded-lg overflow-hidden bg-black/90 border border-border" style={{ minHeight: 200 }}>
        {/* Recording view */}
        {isRecording && (
          <>
            <video ref={videoRef} className="w-full" style={{ maxHeight: 320 }} autoPlay muted playsInline />
            <div className="absolute top-3 left-3 flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
              <span className="text-white text-sm font-mono bg-black/60 px-2 py-0.5 rounded">
                {formatTime(duration)} / {formatTime(maxDuration)}
              </span>
            </div>
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/20">
              <div className="h-full bg-red-500 transition-all" style={{ width: `${(duration / maxDuration) * 100}%` }} />
            </div>
          </>
        )}

        {/* Preview view */}
        {isPreviewing && recordedUrl && !isRecording && (
          <video ref={previewRef} src={recordedUrl} className="w-full" style={{ maxHeight: 320 }} controls playsInline />
        )}

        {/* Empty state */}
        {!isRecording && !isPreviewing && (
          <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
            {cameraError ? (
              <>
                <AlertCircle className="h-10 w-10 mb-2 text-destructive opacity-70" />
                <p className="text-sm text-destructive text-center px-4">{cameraError}</p>
              </>
            ) : (
              <>
                <Video className="h-10 w-10 mb-2 opacity-50" />
                <p className="text-sm">No video recorded</p>
                <p className="text-xs">Max {maxDuration}s · {maxSize}MB</p>
              </>
            )}
          </div>
        )}
      </div>

      <div className="flex gap-2">
        {!isRecording && !isPreviewing && (
          <Button onClick={startRecording} variant="default" className="gap-2 flex-1">
            <Video className="h-4 w-4" />Record Video
          </Button>
        )}
        {isRecording && (
          <>
            <Button onClick={stopRecording} variant="destructive" className="gap-2 flex-1">
              <Square className="h-4 w-4" />Stop
            </Button>
            <Button onClick={switchCamera} variant="outline" size="icon">
              <SwitchCamera className="h-4 w-4" />
            </Button>
          </>
        )}
        {isPreviewing && (
          <>
            <Button onClick={deleteRecording} variant="outline" className="gap-2">
              <Trash2 className="h-4 w-4" />Delete
            </Button>
            <Button onClick={() => { deleteRecording(); setTimeout(startRecording, 100); }} variant="default" className="gap-2 flex-1">
              <Video className="h-4 w-4" />Re-record
            </Button>
          </>
        )}
      </div>
    </div>
  );
};

export default VideoCapture;

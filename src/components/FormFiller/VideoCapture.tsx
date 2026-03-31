import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Video, Square, Trash2, Camera, RotateCcw, Loader2, CheckCircle } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface VideoCaptureProps {
  value?: string;
  onChange: (value: string | null) => void;
  maxDuration?: number;
  maxSize?: number;
}

const VideoCapture = ({ value, onChange, maxDuration = 120, maxSize = 50 }: VideoCaptureProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const previewVideoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [fileSize, setFileSize] = useState<number>(0);

  // Initialize with existing value
  useEffect(() => {
    if (value && !recordedUrl) {
      setRecordedUrl(value);
      setIsPreviewing(true);
    }
  }, [value]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopAllTracks();
      if (timerRef.current) clearInterval(timerRef.current);
      if (recordedUrl && recordedUrl.startsWith("blob:")) URL.revokeObjectURL(recordedUrl);
    };
  }, []);

  const stopAllTracks = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const startRecording = useCallback(async () => {
    try {
      stopAllTracks();

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

      const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
        ? "video/webm;codecs=vp9,opus"
        : MediaRecorder.isTypeSupported("video/webm;codecs=vp8,opus")
          ? "video/webm;codecs=vp8,opus"
          : MediaRecorder.isTypeSupported("video/webm")
            ? "video/webm"
            : "video/mp4";

      const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 2500000 });
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        setIsProcessing(true);
        const blob = new Blob(chunksRef.current, { type: mimeType });
        const sizeMB = blob.size / (1024 * 1024);
        setFileSize(sizeMB);

        if (sizeMB > maxSize) {
          toast({ title: "Video too large", description: `Recording is ${sizeMB.toFixed(1)}MB. Max is ${maxSize}MB. Try a shorter recording.`, variant: "destructive" });
          setIsProcessing(false);
          return;
        }

        if (recordedUrl && recordedUrl.startsWith("blob:")) URL.revokeObjectURL(recordedUrl);
        const url = URL.createObjectURL(blob);
        setRecordedUrl(url);
        setIsPreviewing(true);

        const reader = new FileReader();
        reader.onloadend = () => {
          onChange(reader.result as string);
          setIsProcessing(false);
          toast({ title: "✅ Video Captured", description: `${sizeMB.toFixed(1)}MB · ${formatTime(duration)}` });
        };
        reader.onerror = () => {
          toast({ title: "Processing Error", description: "Failed to process video. Please try again.", variant: "destructive" });
          setIsProcessing(false);
        };
        reader.readAsDataURL(blob);
      };

      recorder.onerror = () => {
        toast({ title: "Recording Error", description: "An error occurred during recording.", variant: "destructive" });
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
          ? "No camera found. Please connect a camera and try again."
          : "Could not access camera/microphone. Please check permissions.";
      toast({ title: "Camera Error", description: msg, variant: "destructive" });
    }
  }, [facingMode, maxDuration, maxSize, onChange, stopAllTracks, recordedUrl]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    stopAllTracks();
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setIsRecording(false);
  }, [stopAllTracks]);

  const deleteRecording = useCallback(() => {
    if (recordedUrl && recordedUrl.startsWith("blob:")) URL.revokeObjectURL(recordedUrl);
    setRecordedUrl(null);
    setIsPreviewing(false);
    setDuration(0);
    setFileSize(0);
    onChange(null);
  }, [recordedUrl, onChange]);

  const switchCamera = useCallback(() => {
    setFacingMode(prev => prev === "environment" ? "user" : "environment");
    if (isRecording) {
      stopRecording();
      setTimeout(() => startRecording(), 300);
    }
  }, [isRecording, stopRecording, startRecording]);

  const formatTime = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
  const progressPct = (duration / maxDuration) * 100;

  return (
    <div className="space-y-3">
      {/* Video viewport */}
      <div className="relative rounded-xl overflow-hidden bg-card border-2 border-border/60 shadow-inner" style={{ minHeight: 220 }}>
        {/* Recording state */}
        {isRecording && (
          <>
            <video ref={videoRef} className="w-full object-cover" style={{ maxHeight: 340 }} autoPlay muted playsInline />
            {/* Recording HUD */}
            <div className="absolute top-3 left-3 right-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 bg-destructive text-destructive-foreground rounded-full px-2.5 py-1 text-xs font-bold shadow-lg">
                  <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
                  REC
                </div>
                <span className="text-white text-sm font-mono bg-black/60 px-2 py-0.5 rounded-md backdrop-blur-sm">
                  {formatTime(duration)} / {formatTime(maxDuration)}
                </span>
              </div>
              <Button size="icon" variant="ghost" className="h-8 w-8 bg-black/40 text-white backdrop-blur-sm hover:bg-black/60" onClick={switchCamera}>
                <RotateCcw className="h-4 w-4" />
              </Button>
            </div>
            {/* Progress bar */}
            <div className="absolute bottom-0 left-0 right-0">
              <Progress value={progressPct} className="h-1.5 rounded-none" />
            </div>
          </>
        )}

        {/* Processing state */}
        {isProcessing && (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="h-8 w-8 text-primary animate-spin mb-3" />
            <p className="text-sm text-muted-foreground">Processing video...</p>
          </div>
        )}

        {/* Preview state */}
        {isPreviewing && recordedUrl && !isRecording && !isProcessing && (
          <div className="relative">
            <video
              ref={previewVideoRef}
              src={recordedUrl}
              className="w-full object-cover"
              style={{ maxHeight: 340 }}
              controls
              playsInline
              preload="auto"
              onError={() => {
                toast({ title: "Playback Error", description: "Could not play the recorded video.", variant: "destructive" });
              }}
            />
            {fileSize > 0 && (
              <div className="absolute top-3 right-3">
                <Badge variant="secondary" className="bg-black/50 text-white backdrop-blur-sm text-[10px]">
                  <CheckCircle className="h-3 w-3 mr-1" />
                  {fileSize.toFixed(1)}MB · {formatTime(duration)}
                </Badge>
              </div>
            )}
          </div>
        )}

        {/* Empty state */}
        {!isRecording && !isPreviewing && !isProcessing && (
          <div className="flex flex-col items-center justify-center py-12 px-4">
            <div className="p-4 rounded-2xl bg-muted/40 mb-3">
              <Video className="h-10 w-10 text-muted-foreground/60" />
            </div>
            <p className="text-sm font-medium text-foreground mb-1">No video recorded</p>
            <p className="text-xs text-muted-foreground text-center">
              Tap record to capture video · Max {formatTime(maxDuration)} · {maxSize}MB limit
            </p>
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex gap-2">
        {!isRecording && !isPreviewing && !isProcessing && (
          <Button onClick={startRecording} variant="default" className="gap-2 flex-1 h-12 text-base font-semibold shadow-sm">
            <Camera className="h-5 w-5" />Record Video
          </Button>
        )}
        {isRecording && (
          <Button onClick={stopRecording} variant="destructive" className="gap-2 flex-1 h-12 text-base font-semibold shadow-sm">
            <Square className="h-5 w-5" />Stop Recording
          </Button>
        )}
        {isPreviewing && !isProcessing && (
          <>
            <Button onClick={deleteRecording} variant="outline" className="gap-2 h-12">
              <Trash2 className="h-4 w-4" />Delete
            </Button>
            <Button onClick={() => { deleteRecording(); setTimeout(startRecording, 200); }} variant="default" className="gap-2 flex-1 h-12 text-base font-semibold">
              <RotateCcw className="h-5 w-5" />Re-record
            </Button>
          </>
        )}
      </div>
    </div>
  );
};

export default VideoCapture;

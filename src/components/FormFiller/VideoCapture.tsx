import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Video, Square, Play, Trash2, Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface VideoCaptureProps {
  value?: string;
  onChange: (value: string | null) => void;
  maxDuration?: number; // seconds
  maxSize?: number; // MB
}

const VideoCapture = ({ value, onChange, maxDuration = 120, maxSize = 50 }: VideoCaptureProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(value || null);
  const [duration, setDuration] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: true,
      });
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.muted = true;
        videoRef.current.play();
      }

      const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
        ? "video/webm;codecs=vp9,opus"
        : MediaRecorder.isTypeSupported("video/webm")
          ? "video/webm"
          : "video/mp4";

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        if (blob.size > maxSize * 1024 * 1024) {
          toast({ title: "Video too large", description: `Max size is ${maxSize}MB`, variant: "destructive" });
          return;
        }
        const url = URL.createObjectURL(blob);
        setRecordedUrl(url);
        setIsPreviewing(true);

        // Convert to base64 for storage
        const reader = new FileReader();
        reader.onloadend = () => {
          onChange(reader.result as string);
        };
        reader.readAsDataURL(blob);
      };

      recorder.start(1000);
      setIsRecording(true);
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
    } catch (err) {
      toast({ title: "Camera Error", description: "Could not access camera/microphone", variant: "destructive" });
    }
  }, [maxDuration, maxSize, onChange]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    streamRef.current?.getTracks().forEach(t => t.stop());
    if (timerRef.current) clearInterval(timerRef.current);
    setIsRecording(false);
  }, []);

  const deleteRecording = useCallback(() => {
    if (recordedUrl) URL.revokeObjectURL(recordedUrl);
    setRecordedUrl(null);
    setIsPreviewing(false);
    setDuration(0);
    onChange(null);
  }, [recordedUrl, onChange]);

  const formatTime = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;

  return (
    <div className="space-y-3">
      <div className="relative rounded-lg overflow-hidden bg-black/90 border border-border" style={{ minHeight: 200 }}>
        {isRecording && (
          <>
            <video ref={videoRef} className="w-full" style={{ maxHeight: 300 }} autoPlay muted playsInline />
            <div className="absolute top-3 left-3 flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
              <span className="text-white text-sm font-mono bg-black/60 px-2 py-0.5 rounded">
                {formatTime(duration)} / {formatTime(maxDuration)}
              </span>
            </div>
            {/* Progress bar */}
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/20">
              <div
                className="h-full bg-red-500 transition-all"
                style={{ width: `${(duration / maxDuration) * 100}%` }}
              />
            </div>
          </>
        )}

        {isPreviewing && recordedUrl && !isRecording && (
          <video src={recordedUrl} className="w-full" style={{ maxHeight: 300 }} controls playsInline />
        )}

        {!isRecording && !isPreviewing && (
          <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
            <Video className="h-10 w-10 mb-2 opacity-50" />
            <p className="text-sm">No video recorded</p>
            <p className="text-xs">Max {maxDuration}s, {maxSize}MB</p>
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
          <Button onClick={stopRecording} variant="destructive" className="gap-2 flex-1">
            <Square className="h-4 w-4" />Stop Recording
          </Button>
        )}
        {isPreviewing && (
          <>
            <Button onClick={deleteRecording} variant="outline" className="gap-2">
              <Trash2 className="h-4 w-4" />Delete
            </Button>
            <Button onClick={() => { deleteRecording(); startRecording(); }} variant="default" className="gap-2 flex-1">
              <Video className="h-4 w-4" />Re-record
            </Button>
          </>
        )}
      </div>
    </div>
  );
};

export default VideoCapture;

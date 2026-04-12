import { useRef, useState, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Mic, Square, Play, Pause, Trash2, Check } from "lucide-react";
import { Progress } from "@/components/ui/progress";

interface AudioCaptureProps {
  value: string | null;
  onChange: (audio: string | null) => void;
  disabled?: boolean;
  maxDuration?: number; // in seconds
  autoTrigger?: boolean;
}

const AudioCapture = ({
  value,
  onChange,
  disabled,
  maxDuration = 300, // 5 minutes default
  autoTrigger,
}: AudioCaptureProps) => {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioDuration, setAudioDuration] = useState(0);
  const [playbackTime, setPlaybackTime] = useState(0);

  // Auto-trigger recording from voice command
  useEffect(() => {
    if (autoTrigger && !value && !isRecording) {
      startRecording();
    }
  }, [autoTrigger]);

  // Format time as MM:SS
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  // Start recording
  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: "audio/webm;codecs=opus",
      });

      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = reader.result as string;
          onChange(dataUrl);
        };
        reader.readAsDataURL(audioBlob);

        // Stop all tracks
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start(100); // Collect data every 100ms
      setIsRecording(true);
      setRecordingTime(0);

      // Start timer
      timerRef.current = setInterval(() => {
        setRecordingTime((prev) => {
          if (prev >= maxDuration - 1) {
            stopRecording();
            return prev;
          }
          return prev + 1;
        });
      }, 1000);
    } catch (error) {
      console.error("Error starting recording:", error);
    }
  }, [maxDuration, onChange]);

  // Stop recording
  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);

      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  }, [isRecording]);

  // Play/pause audio
  const togglePlayback = useCallback(() => {
    if (!audioRef.current || !value) return;

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play();
      setIsPlaying(true);
    }
  }, [isPlaying, value]);

  // Delete recording
  const deleteRecording = useCallback(() => {
    onChange(null);
    setPlaybackTime(0);
    setAudioDuration(0);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setIsPlaying(false);
  }, [onChange]);

  // Set up audio element when value changes
  useEffect(() => {
    if (value && !audioRef.current) {
      audioRef.current = new Audio(value);

      audioRef.current.onloadedmetadata = () => {
        setAudioDuration(audioRef.current?.duration || 0);
      };

      audioRef.current.ontimeupdate = () => {
        setPlaybackTime(audioRef.current?.currentTime || 0);
      };

      audioRef.current.onended = () => {
        setIsPlaying(false);
        setPlaybackTime(0);
      };
    } else if (value && audioRef.current) {
      audioRef.current.src = value;
    } else if (!value) {
      audioRef.current = null;
    }

    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
      }
    };
  }, [value]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      if (mediaRecorderRef.current && isRecording) {
        mediaRecorderRef.current.stop();
      }
    };
  }, [isRecording]);

  return (
    <Card className="border-border">
      <CardContent className="p-4">
        {value ? (
          // Playback UI
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                  <Mic className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium">Audio Recorded</p>
                  <p className="text-xs text-muted-foreground">
                    {formatTime(audioDuration)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={togglePlayback}
                  disabled={disabled}
                >
                  {isPlaying ? (
                    <Pause className="h-4 w-4" />
                  ) : (
                    <Play className="h-4 w-4" />
                  )}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={deleteRecording}
                  disabled={disabled}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </div>

            {/* Playback progress */}
            <div className="space-y-1">
              <Progress
                value={audioDuration > 0 ? (playbackTime / audioDuration) * 100 : 0}
                className="h-2"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{formatTime(playbackTime)}</span>
                <span>{formatTime(audioDuration)}</span>
              </div>
            </div>

            <div className="flex items-center gap-1 rounded-full bg-primary/10 px-2 py-1 text-xs text-primary w-fit">
              <Check className="h-3 w-3" />
              Recorded
            </div>
          </div>
        ) : isRecording ? (
          // Recording UI
          <div className="space-y-4">
            <div className="flex flex-col items-center justify-center py-4">
              <div className="relative">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10 animate-pulse">
                  <Mic className="h-8 w-8 text-destructive" />
                </div>
                <div className="absolute -inset-2 rounded-full border-2 border-destructive/30 animate-ping" />
              </div>
              <p className="mt-4 text-2xl font-mono font-bold text-foreground">
                {formatTime(recordingTime)}
              </p>
              <p className="text-sm text-muted-foreground">Recording...</p>
            </div>

            {/* Recording progress */}
            <Progress
              value={(recordingTime / maxDuration) * 100}
              className="h-1"
            />

            <Button
              type="button"
              variant="destructive"
              className="w-full"
              onClick={stopRecording}
            >
              <Square className="h-4 w-4 mr-2" />
              Stop Recording
            </Button>
          </div>
        ) : (
          // Initial state
          <div className="flex flex-col items-center justify-center py-6">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
              <Mic className="h-8 w-8 text-muted-foreground" />
            </div>
            <p className="mt-3 text-sm font-medium">Record Audio</p>
            <p className="text-xs text-muted-foreground mb-4">
              Max duration: {formatTime(maxDuration)}
            </p>
            <Button
              type="button"
              variant="default"
              onClick={startRecording}
              disabled={disabled}
            >
              <Mic className="h-4 w-4 mr-2" />
              Start Recording
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default AudioCapture;

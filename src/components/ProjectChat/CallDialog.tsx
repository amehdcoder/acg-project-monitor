import { useState, useEffect, useRef } from "react";
import {
  Phone,
  PhoneOff,
  Video,
  VideoOff,
  Mic,
  MicOff,
  Users,
  X,
  Volume2,
  VolumeX,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { ChatGroup, ChatGroupMember } from "@/hooks/useProjectChat";
import { toast } from "@/hooks/use-toast";

interface CallDialogProps {
  type: "voice" | "video";
  group: ChatGroup;
  members: ChatGroupMember[];
  isOpen: boolean;
  onClose: () => void;
}

export function CallDialog({
  type,
  group,
  members,
  isOpen,
  onClose,
}: CallDialogProps) {
  const [callState, setCallState] = useState<"connecting" | "active" | "ended">("connecting");
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [isSpeakerOff, setIsSpeakerOff] = useState(false);
  const [duration, setDuration] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setCallState("connecting");
      setDuration(0);
      setIsMuted(false);
      setIsVideoOff(false);
      return;
    }

    // Simulate connection
    const connectTimer = setTimeout(() => {
      setCallState("active");
    }, 2000);

    return () => clearTimeout(connectTimer);
  }, [isOpen]);

  useEffect(() => {
    if (callState !== "active") return;

    const timer = setInterval(() => {
      setDuration((d) => d + 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [callState]);

  useEffect(() => {
    const startMedia = async () => {
      if (!isOpen || type !== "video") return;

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (error) {
        console.error("Error accessing media devices:", error);
        toast({
          title: "Camera access denied",
          description: "Please allow camera access to use video calls",
          variant: "destructive",
        });
      }
    };

    startMedia();

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
    };
  }, [isOpen, type]);

  const handleEndCall = () => {
    setCallState("ended");
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setTimeout(() => {
      onClose();
    }, 500);
  };

  const toggleMute = () => {
    setIsMuted(!isMuted);
    if (streamRef.current) {
      streamRef.current.getAudioTracks().forEach((track) => {
        track.enabled = isMuted;
      });
    }
  };

  const toggleVideo = () => {
    setIsVideoOff(!isVideoOff);
    if (streamRef.current) {
      streamRef.current.getVideoTracks().forEach((track) => {
        track.enabled = isVideoOff;
      });
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <Dialog open={isOpen} onOpenChange={() => handleEndCall()}>
      <DialogContent className="max-w-md sm:max-w-lg p-0 overflow-hidden">
        <div
          className={cn(
            "relative min-h-[400px] flex flex-col",
            type === "video" ? "bg-black" : "bg-gradient-to-b from-primary/20 to-primary/5"
          )}
        >
          {/* Header */}
          <DialogHeader className="absolute top-0 left-0 right-0 z-10 p-4">
            <DialogTitle className={cn("text-center", type === "video" && "text-white")}>
              {group.name}
            </DialogTitle>
          </DialogHeader>

          {/* Video/Avatar Area */}
          <div className="flex-1 flex items-center justify-center p-8">
            {type === "video" && !isVideoOff ? (
              <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                className="w-full h-full object-cover rounded-lg"
              />
            ) : (
              <div className="flex flex-col items-center gap-4">
                <Avatar className="h-24 w-24 sm:h-32 sm:w-32">
                  <AvatarFallback className="bg-primary/20 text-primary text-2xl sm:text-3xl">
                    <Users className="h-12 w-12 sm:h-16 sm:w-16" />
                  </AvatarFallback>
                </Avatar>
                <div className="text-center">
                  <p className={cn("text-lg font-medium", type === "video" && "text-white")}>
                    {members.length} participant{members.length !== 1 ? "s" : ""}
                  </p>
                  <p
                    className={cn(
                      "text-sm",
                      type === "video" ? "text-white/70" : "text-muted-foreground"
                    )}
                  >
                    {callState === "connecting" && "Connecting..."}
                    {callState === "active" && formatDuration(duration)}
                    {callState === "ended" && "Call ended"}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Connecting Animation */}
          {callState === "connecting" && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/20">
              <div className="flex gap-2">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="w-3 h-3 rounded-full bg-primary animate-bounce"
                    style={{ animationDelay: `${i * 0.15}s` }}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Controls */}
          <div className="absolute bottom-0 left-0 right-0 p-4 sm:p-6">
            <div className="flex items-center justify-center gap-3 sm:gap-4">
              <Button
                variant={isSpeakerOff ? "destructive" : "secondary"}
                size="icon"
                className="h-12 w-12 sm:h-14 sm:w-14 rounded-full"
                onClick={() => setIsSpeakerOff(!isSpeakerOff)}
              >
                {isSpeakerOff ? (
                  <VolumeX className="h-5 w-5 sm:h-6 sm:w-6" />
                ) : (
                  <Volume2 className="h-5 w-5 sm:h-6 sm:w-6" />
                )}
              </Button>

              <Button
                variant={isMuted ? "destructive" : "secondary"}
                size="icon"
                className="h-12 w-12 sm:h-14 sm:w-14 rounded-full"
                onClick={toggleMute}
              >
                {isMuted ? (
                  <MicOff className="h-5 w-5 sm:h-6 sm:w-6" />
                ) : (
                  <Mic className="h-5 w-5 sm:h-6 sm:w-6" />
                )}
              </Button>

              {type === "video" && (
                <Button
                  variant={isVideoOff ? "destructive" : "secondary"}
                  size="icon"
                  className="h-12 w-12 sm:h-14 sm:w-14 rounded-full"
                  onClick={toggleVideo}
                >
                  {isVideoOff ? (
                    <VideoOff className="h-5 w-5 sm:h-6 sm:w-6" />
                  ) : (
                    <Video className="h-5 w-5 sm:h-6 sm:w-6" />
                  )}
                </Button>
              )}

              <Button
                variant="destructive"
                size="icon"
                className="h-14 w-14 sm:h-16 sm:w-16 rounded-full"
                onClick={handleEndCall}
              >
                <PhoneOff className="h-6 w-6 sm:h-7 sm:w-7" />
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

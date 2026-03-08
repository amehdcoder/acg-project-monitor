import { useState, useEffect, useCallback } from "react";
import {
  Phone,
  PhoneOff,
  Video,
  VideoOff,
  Mic,
  MicOff,
  Users,
  Volume2,
  VolumeX,
  Monitor,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { ChatGroup, ChatGroupMember } from "@/hooks/useProjectChat";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  LiveKitRoom,
  VideoTrack,
  AudioTrack,
  useParticipants,
  useTracks,
  useLocalParticipant,
  useRoomContext,
  TrackToggle,
  RoomAudioRenderer,
  GridLayout,
  ParticipantTile,
} from "@livekit/components-react";
import { Track } from "livekit-client";

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
  const [token, setToken] = useState<string | null>(null);
  const [serverUrl, setServerUrl] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchToken = useCallback(async () => {
    setConnecting(true);
    setError(null);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        throw new Error("Not authenticated");
      }

      const roomName = `chat-${group.id}`;

      const response = await supabase.functions.invoke("livekit-token", {
        body: { roomName, callType: type },
      });

      if (response.error) {
        throw new Error(response.error.message || "Failed to get call token");
      }

      setToken(response.data.token);
      setServerUrl(response.data.url);
    } catch (err: any) {
      console.error("Error joining call:", err);
      setError(err.message || "Failed to connect to call");
      toast({
        title: "Call Failed",
        description: err.message || "Could not connect to the call. Please try again.",
        variant: "destructive",
      });
    } finally {
      setConnecting(false);
    }
  }, [group.id, type]);

  useEffect(() => {
    if (isOpen && !token) {
      fetchToken();
    }
    if (!isOpen) {
      setToken(null);
      setServerUrl(null);
      setError(null);
    }
  }, [isOpen, fetchToken, token]);

  const handleDisconnect = useCallback(() => {
    setToken(null);
    setServerUrl(null);
    onClose();
  }, [onClose]);

  return (
    <Dialog open={isOpen} onOpenChange={() => handleDisconnect()}>
      <DialogContent className="max-w-4xl w-[95vw] h-[80vh] max-h-[700px] p-0 overflow-hidden">
        <div className="relative h-full flex flex-col bg-black">
          {/* Header */}
          <DialogHeader className="p-4 bg-black/80 z-10">
            <DialogTitle className="text-white text-center">
              {group.name} — {type === "video" ? "Video" : "Voice"} Call
            </DialogTitle>
          </DialogHeader>

          {/* Main content */}
          <div className="flex-1 overflow-hidden">
            {connecting && (
              <div className="flex flex-col items-center justify-center h-full gap-4">
                <Loader2 className="h-12 w-12 text-primary animate-spin" />
                <p className="text-white text-lg">Connecting to call...</p>
              </div>
            )}

            {error && (
              <div className="flex flex-col items-center justify-center h-full gap-4">
                <PhoneOff className="h-12 w-12 text-destructive" />
                <p className="text-white text-lg">Failed to connect</p>
                <p className="text-white/60 text-sm">{error}</p>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={handleDisconnect}>
                    Close
                  </Button>
                  <Button onClick={fetchToken}>
                    Retry
                  </Button>
                </div>
              </div>
            )}

            {token && serverUrl && (
              <LiveKitRoom
                serverUrl={serverUrl}
                token={token}
                connect={true}
                video={type === "video"}
                audio={true}
                onDisconnected={handleDisconnect}
                onError={(err) => {
                  console.error("LiveKit room error:", err);
                  toast({
                    title: "Call Error",
                    description: "Connection issue. Attempting to reconnect...",
                    variant: "destructive",
                  });
                }}
                options={{
                  adaptiveStream: true,
                  dynacast: true,
                  publishDefaults: {
                    simulcast: true,
                    videoCodec: "vp8",
                  },
                  reconnectPolicy: {
                    maxRetries: 10,
                    nextRetryDelayInMs: (context) => {
                      // Exponential backoff: 300ms, 600ms, 1200ms... up to 10s
                      return Math.min(300 * Math.pow(2, context.retryCount), 10000);
                    },
                  },
                }}
                className="h-full flex flex-col"
              >
                <RoomContent type={type} onLeave={handleDisconnect} />
                <RoomAudioRenderer />
              </LiveKitRoom>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function RoomContent({ type, onLeave }: { type: "voice" | "video"; onLeave: () => void }) {
  const participants = useParticipants();
  const { localParticipant } = useLocalParticipant();
  const room = useRoomContext();
  const [duration, setDuration] = useState(0);
  const [isSpeakerOff, setIsSpeakerOff] = useState(false);

  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false }
  );

  useEffect(() => {
    const timer = setInterval(() => setDuration((d) => d + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const toggleSpeaker = () => {
    const newState = !isSpeakerOff;
    setIsSpeakerOff(newState);
    // Mute/unmute all remote audio by adjusting volume on audio elements
    const audioElements = document.querySelectorAll('audio');
    audioElements.forEach((el) => {
      el.muted = newState;
    });
  };

  const toggleScreenShare = async () => {
    try {
      const enabled = localParticipant.isScreenShareEnabled;
      await localParticipant.setScreenShareEnabled(!enabled);
    } catch (err) {
      console.error("Screen share error:", err);
      toast({
        title: "Screen Share",
        description: "Could not start screen sharing.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Video / Participant Grid */}
      <div className="flex-1 overflow-hidden p-2">
        {type === "video" ? (
          <GridLayout tracks={tracks} className="h-full">
            <ParticipantTile />
          </GridLayout>
        ) : (
          /* Voice call: show avatars */
          <div className="flex flex-wrap items-center justify-center gap-6 h-full">
            {participants.map((p) => (
              <div key={p.identity} className="flex flex-col items-center gap-2">
                <Avatar className="h-20 w-20 sm:h-24 sm:w-24">
                  <AvatarFallback className="bg-primary/20 text-primary text-xl">
                    {(p.name || p.identity || "?").slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <p className="text-white text-sm font-medium truncate max-w-[120px]">
                  {p.name || p.identity}
                </p>
                {p.isSpeaking && (
                  <div className="flex gap-1">
                    {[0, 1, 2].map((i) => (
                      <div
                        key={i}
                        className="w-1.5 h-3 bg-green-400 rounded-full animate-pulse"
                        style={{ animationDelay: `${i * 0.15}s` }}
                      />
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Status bar */}
      <div className="text-center py-1">
        <span className="text-white/70 text-xs">
          {participants.length} participant{participants.length !== 1 ? "s" : ""} · {formatDuration(duration)}
        </span>
      </div>

      {/* Controls */}
      <div className="p-4 sm:p-6 bg-black/60">
        <div className="flex items-center justify-center gap-3 sm:gap-4">
          <Button
            variant={isSpeakerOff ? "destructive" : "secondary"}
            size="icon"
            className="h-12 w-12 sm:h-14 sm:w-14 rounded-full"
            onClick={toggleSpeaker}
          >
            {isSpeakerOff ? (
              <VolumeX className="h-5 w-5 sm:h-6 sm:w-6" />
            ) : (
              <Volume2 className="h-5 w-5 sm:h-6 sm:w-6" />
            )}
          </Button>

          <TrackToggle
            source={Track.Source.Microphone}
            className="h-12 w-12 sm:h-14 sm:w-14 rounded-full inline-flex items-center justify-center bg-secondary text-secondary-foreground hover:bg-secondary/80 data-[lk-muted=true]:bg-destructive data-[lk-muted=true]:text-destructive-foreground"
          />

          {type === "video" && (
            <TrackToggle
              source={Track.Source.Camera}
              className="h-12 w-12 sm:h-14 sm:w-14 rounded-full inline-flex items-center justify-center bg-secondary text-secondary-foreground hover:bg-secondary/80 data-[lk-muted=true]:bg-destructive data-[lk-muted=true]:text-destructive-foreground"
            />
          )}

          {type === "video" && (
            <Button
              variant={localParticipant.isScreenShareEnabled ? "destructive" : "secondary"}
              size="icon"
              className="h-12 w-12 sm:h-14 sm:w-14 rounded-full"
              onClick={toggleScreenShare}
            >
              <Monitor className="h-5 w-5 sm:h-6 sm:w-6" />
            </Button>
          )}

          <Button
            variant="destructive"
            size="icon"
            className="h-14 w-14 sm:h-16 sm:w-16 rounded-full"
            onClick={onLeave}
          >
            <PhoneOff className="h-6 w-6 sm:h-7 sm:w-7" />
          </Button>
        </div>
      </div>
    </div>
  );
}

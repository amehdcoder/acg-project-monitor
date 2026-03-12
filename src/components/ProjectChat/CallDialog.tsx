import { useState, useEffect, useRef, useCallback } from "react";
import {
  PhoneOff,
  Mic,
  MicOff,
  Video,
  VideoOff,
  Volume2,
  VolumeX,
  Monitor,
  MonitorOff,
  Loader2,
  Phone,
  UserX,
  ShieldAlert,
  ImageIcon,
  Maximize,
  Minimize,
  Share2,
  Lock,
  Users,
  Crown,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ChatGroup, ChatGroupMember } from "@/hooks/useProjectChat";
import { useWebRTCCall, type Participant } from "@/hooks/useWebRTCCall";
import { useVirtualBackground } from "@/hooks/useVirtualBackground";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { VirtualBackgroundPicker } from "./VirtualBackgroundPicker";

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
  const roomId = `call-${group.id}`;
  const { user, isAdmin } = useAuth();
  const [showEndForAll, setShowEndForAll] = useState(false);
  const [isHost, setIsHost] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showParticipants, setShowParticipants] = useState(false);
  const dialogContainerRef = useRef<HTMLDivElement>(null);

  const {
    localStream,
    participants,
    isMuted,
    isVideoOff,
    isSpeakerOff,
    isScreenSharing,
    screenShareAllowed,
    connectionState,
    error,
    mediaWarning,
    duration,
    userName,
    toggleMute,
    toggleVideo,
    toggleSpeaker,
    toggleScreenShare,
    replaceVideoTrack,
    setScreenSharePermission,
  } = useWebRTCCall(roomId, type, isOpen);

  const [vbEnabled, setVbEnabled] = useState(false);

  const {
    outputStream: vbStream,
    isProcessing: vbProcessing,
    mode: vbMode,
    setBlurMode,
    loadBackgroundImage,
    disableBackground,
  } = useVirtualBackground({
    cameraStream: localStream,
    enabled: vbEnabled && type === "video",
  });

  // When virtual background stream changes, replace the video track sent to peers
  useEffect(() => {
    if (!vbStream) return;
    const vbVideoTrack = vbStream.getVideoTracks()[0];
    if (vbVideoTrack) {
      replaceVideoTrack(vbVideoTrack);
    }
  }, [vbStream, replaceVideoTrack]);

  const displayStream = vbStream || localStream;

  // Check if current user is the host (started the call) or admin
  useEffect(() => {
    if (!isOpen || !user) return;
    const checkHost = async () => {
      const { data } = await supabase
        .from("active_calls" as any)
        .select("started_by")
        .eq("chat_group_id", group.id)
        .eq("is_active", true)
        .maybeSingle();
      if (data) {
        setIsHost((data as any).started_by === user.id || isAdmin);
      }
    };
    checkHost();
  }, [isOpen, user, group.id, isAdmin]);

  // Listen for fullscreen change events (e.g. user presses Escape)
  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  const toggleFullscreen = useCallback(async () => {
    try {
      if (!document.fullscreenElement) {
        const el = dialogContainerRef.current?.closest("[role='dialog']") as HTMLElement | null;
        if (el) {
          await el.requestFullscreen();
        }
      } else {
        await document.exitFullscreen();
      }
    } catch (err) {
      console.warn("Fullscreen toggle failed:", err);
    }
  }, []);

  const handleEndForAll = useCallback(async () => {
    try {
      await supabase
        .from("active_calls" as any)
        .update({ is_active: false, ended_at: new Date().toISOString() })
        .eq("chat_group_id", group.id)
        .eq("is_active", true);

      toast({ title: "Call Ended", description: "The call has been ended for all participants." });
      setShowEndForAll(false);
      onClose();
    } catch (err) {
      console.error("Error ending call for all:", err);
      toast({ title: "Error", description: "Could not end the call.", variant: "destructive" });
    }
  }, [group.id, onClose]);

  const handleGrantScreenShare = useCallback((participantId: string, participantName: string) => {
    setScreenSharePermission(participantId, true);
    toast({ title: "Permission Granted", description: `${participantName} can now share their screen.` });
  }, [setScreenSharePermission]);

  const handleRevokeScreenShare = useCallback((participantId: string, participantName: string) => {
    setScreenSharePermission(participantId, false);
    toast({ title: "Permission Revoked", description: `${participantName} can no longer share their screen.` });
  }, [setScreenSharePermission]);

  const formatDuration = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hrs > 0) {
      return `${hrs.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
    }
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const participantCount = participants.size + 1;

  return (
    <>
      <Dialog open={isOpen} onOpenChange={() => onClose()}>
        <DialogContent className={`${isFullscreen ? "max-w-full w-full h-full max-h-full rounded-none" : "max-w-4xl w-[95vw] h-[80vh] max-h-[700px]"} p-0 overflow-hidden`}>
          <div ref={dialogContainerRef} className="relative h-full flex flex-col bg-background">
            {/* Header */}
            <DialogHeader className="p-4 bg-card border-b border-border z-10">
              <div className="flex items-center justify-between">
                <div className="w-10" />
                <DialogTitle className="text-foreground text-center flex-1">
                  {group.name} — {type === "video" ? "Video" : "Voice"} Call
                </DialogTitle>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={toggleFullscreen}
                  title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
                >
                  {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
                </Button>
              </div>
            </DialogHeader>

            {/* Main content */}
            <div className="flex-1 overflow-hidden bg-background/95 flex flex-col">
              {connectionState === "connecting" && (
                <div className="flex flex-col items-center justify-center h-full gap-4">
                  <Loader2 className="h-12 w-12 text-primary animate-spin" />
                  <p className="text-foreground text-lg">Starting call...</p>
                  <p className="text-muted-foreground text-sm">Setting up your microphone{type === "video" ? " and camera" : ""}</p>
                </div>
              )}

              {connectionState === "failed" && (
                <div className="flex flex-col items-center justify-center h-full gap-4 px-4">
                  <PhoneOff className="h-12 w-12 text-destructive" />
                  <p className="text-foreground text-lg">Failed to start call</p>
                  <p className="text-muted-foreground text-sm text-center max-w-md">{error}</p>
                  <Button variant="outline" onClick={onClose}>Close</Button>
                </div>
              )}

              {(connectionState === "connected" || connectionState === "connecting") && (
                <>
                  {mediaWarning && (
                    <div className="flex items-center gap-2 px-4 py-2 bg-accent border-b border-border">
                      <MicOff className="h-4 w-4 text-muted-foreground shrink-0" />
                      <p className="text-xs text-muted-foreground">{mediaWarning}</p>
                    </div>
                  )}

                  {!screenShareAllowed && (
                    <div className="flex items-center gap-2 px-4 py-1.5 bg-muted border-b border-border">
                      <Lock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <p className="text-xs text-muted-foreground">Screen sharing is restricted by the host.</p>
                    </div>
                  )}

                  {/* Participant grid + sidebar */}
                  <div className="flex-1 overflow-hidden flex">
                    <div className="flex-1 overflow-auto p-3">
                      {type === "video" ? (
                        <VideoGrid
                          localStream={displayStream}
                          participants={participants}
                          userName={userName}
                          isMuted={isMuted}
                          isVideoOff={isVideoOff}
                          isHost={isHost}
                          onGrantScreenShare={handleGrantScreenShare}
                          onRevokeScreenShare={handleRevokeScreenShare}
                        />
                      ) : (
                        <VoiceGrid
                          participants={participants}
                          userName={userName}
                          isMuted={isMuted}
                          isHost={isHost}
                          onGrantScreenShare={handleGrantScreenShare}
                          onRevokeScreenShare={handleRevokeScreenShare}
                        />
                      )}
                    </div>

                    {/* Participant sidebar */}
                    {showParticipants && (
                      <ParticipantSidebar
                        participants={participants}
                        userName={userName}
                        isMuted={isMuted}
                        isHost={isHost}
                        members={members}
                        onClose={() => setShowParticipants(false)}
                        onGrantScreenShare={handleGrantScreenShare}
                        onRevokeScreenShare={handleRevokeScreenShare}
                      />
                    )}
                  </div>

                  {/* Status bar */}
                  <div className="text-center py-1">
                    <span className="text-muted-foreground text-xs">
                      {participantCount} participant{participantCount !== 1 ? "s" : ""} · {formatDuration(duration)}
                    </span>
                  </div>

                  {/* Controls */}
                  <div className="p-4 sm:p-6 bg-card border-t border-border">
                    <div className="flex items-center justify-center gap-3 sm:gap-4 flex-wrap">
                      <Button
                        variant={isSpeakerOff ? "destructive" : "secondary"}
                        size="icon"
                        className="h-12 w-12 sm:h-14 sm:w-14 rounded-full"
                        onClick={toggleSpeaker}
                        title={isSpeakerOff ? "Unmute speaker" : "Mute speaker"}
                      >
                        {isSpeakerOff ? <VolumeX className="h-5 w-5 sm:h-6 sm:w-6" /> : <Volume2 className="h-5 w-5 sm:h-6 sm:w-6" />}
                      </Button>

                      <Button
                        variant={isMuted ? "destructive" : "secondary"}
                        size="icon"
                        className="h-12 w-12 sm:h-14 sm:w-14 rounded-full"
                        onClick={toggleMute}
                        title={isMuted ? "Unmute" : "Mute"}
                      >
                        {isMuted ? <MicOff className="h-5 w-5 sm:h-6 sm:w-6" /> : <Mic className="h-5 w-5 sm:h-6 sm:w-6" />}
                      </Button>

                      {type === "video" && (
                        <Button
                          variant={isVideoOff ? "destructive" : "secondary"}
                          size="icon"
                          className="h-12 w-12 sm:h-14 sm:w-14 rounded-full"
                          onClick={toggleVideo}
                          title={isVideoOff ? "Turn on camera" : "Turn off camera"}
                        >
                          {isVideoOff ? <VideoOff className="h-5 w-5 sm:h-6 sm:w-6" /> : <Video className="h-5 w-5 sm:h-6 sm:w-6" />}
                        </Button>
                      )}

                      {type === "video" && (
                        <VirtualBackgroundPicker
                          mode={vbMode}
                          isProcessing={vbProcessing}
                          onBlur={() => { setVbEnabled(true); setBlurMode(); }}
                          onImage={(url) => { setVbEnabled(true); loadBackgroundImage(url); }}
                          onDisable={() => { setVbEnabled(false); disableBackground(); }}
                        >
                          <Button
                            variant={vbMode !== "none" ? "default" : "secondary"}
                            size="icon"
                            className="h-12 w-12 sm:h-14 sm:w-14 rounded-full"
                            title="Virtual background"
                          >
                            <ImageIcon className="h-5 w-5 sm:h-6 sm:w-6" />
                          </Button>
                        </VirtualBackgroundPicker>
                      )}

                      <Button
                        variant={isScreenSharing ? "destructive" : "secondary"}
                        size="icon"
                        className="h-12 w-12 sm:h-14 sm:w-14 rounded-full"
                        onClick={() => {
                          if (!screenShareAllowed && !isHost) {
                            toast({ title: "Restricted", description: "The host has not granted you screen sharing permission.", variant: "destructive" });
                            return;
                          }
                          toggleScreenShare();
                        }}
                        title={!screenShareAllowed && !isHost ? "Screen sharing restricted" : isScreenSharing ? "Stop sharing" : "Share screen"}
                      >
                        {isScreenSharing ? <MonitorOff className="h-5 w-5 sm:h-6 sm:w-6" /> : <Monitor className="h-5 w-5 sm:h-6 sm:w-6" />}
                      </Button>

                      {/* Fullscreen */}
                      <Button
                        variant="secondary"
                        size="icon"
                        className="h-12 w-12 sm:h-14 sm:w-14 rounded-full"
                        onClick={toggleFullscreen}
                        title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
                      >
                        {isFullscreen ? <Minimize className="h-5 w-5 sm:h-6 sm:w-6" /> : <Maximize className="h-5 w-5 sm:h-6 sm:w-6" />}
                      </Button>

                      {/* Leave call */}
                      <Button
                        variant="destructive"
                        size="icon"
                        className="h-14 w-14 sm:h-16 sm:w-16 rounded-full"
                        onClick={onClose}
                        title="Leave call"
                      >
                        <PhoneOff className="h-6 w-6 sm:h-7 sm:w-7" />
                      </Button>

                      {/* End call for all (host/admin only) */}
                      {isHost && participants.size > 0 && (
                        <Button
                          variant="destructive"
                          size="icon"
                          className="h-12 w-12 sm:h-14 sm:w-14 rounded-full bg-red-700 hover:bg-red-800"
                          onClick={() => setShowEndForAll(true)}
                          title="End call for everyone"
                        >
                          <UserX className="h-5 w-5 sm:h-6 sm:w-6" />
                        </Button>
                      )}
                    </div>
                    {isHost && participants.size > 0 && (
                      <p className="text-center text-[10px] text-muted-foreground mt-2">
                        You are the host. Right-click participant tiles to manage screen sharing permissions.
                      </p>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* End for All Confirmation */}
      <AlertDialog open={showEndForAll} onOpenChange={setShowEndForAll}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-destructive" />
              End Call for Everyone?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will immediately disconnect all {participantCount} participants from the call. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleEndForAll} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              End for Everyone
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/** Participant permission dropdown for host */
function ParticipantActions({
  participant,
  isHost,
  onGrant,
  onRevoke,
  children,
}: {
  participant: Participant;
  isHost: boolean;
  onGrant: (id: string, name: string) => void;
  onRevoke: (id: string, name: string) => void;
  children: React.ReactNode;
}) {
  if (!isHost) return <>{children}</>;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <div className="cursor-pointer">{children}</div>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="center" className="w-48">
        <DropdownMenuItem onClick={() => onGrant(participant.id, participant.name)} className="gap-2">
          <Share2 className="h-4 w-4" />
          Grant Screen Share
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onRevoke(participant.id, participant.name)} className="gap-2 text-destructive">
          <Lock className="h-4 w-4" />
          Revoke Screen Share
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Video grid with local + remote participants */
function VideoGrid({
  localStream,
  participants,
  userName,
  isMuted,
  isVideoOff,
  isHost,
  onGrantScreenShare,
  onRevokeScreenShare,
}: {
  localStream: MediaStream | null;
  participants: Map<string, Participant>;
  userName: string;
  isMuted: boolean;
  isVideoOff: boolean;
  isHost: boolean;
  onGrantScreenShare: (id: string, name: string) => void;
  onRevokeScreenShare: (id: string, name: string) => void;
}) {
  const totalParticipants = participants.size + 1;
  const gridCols = totalParticipants <= 1 ? 1 : totalParticipants <= 4 ? 2 : totalParticipants <= 9 ? 3 : 4;

  return (
    <div
      className="grid gap-2 h-full"
      style={{
        gridTemplateColumns: `repeat(${gridCols}, 1fr)`,
        gridAutoRows: "1fr",
      }}
    >
      {/* Local video */}
      <div className="relative rounded-lg overflow-hidden bg-muted border border-border">
        {localStream && !isVideoOff ? (
          <LocalVideo stream={localStream} />
        ) : (
          <div className="flex items-center justify-center h-full">
            <Avatar className="h-20 w-20">
              <AvatarFallback className="bg-primary/20 text-primary text-xl">
                {userName.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
          </div>
        )}
        <div className="absolute bottom-2 left-2 flex items-center gap-1 bg-background/80 rounded-md px-2 py-1">
          <span className="text-xs text-foreground font-medium truncate max-w-[100px]">You</span>
          {isMuted && <MicOff className="h-3 w-3 text-destructive" />}
        </div>
      </div>

      {/* Remote participants */}
      {Array.from(participants.values()).map((p) => (
        <ParticipantActions
          key={p.id}
          participant={p}
          isHost={isHost}
          onGrant={onGrantScreenShare}
          onRevoke={onRevokeScreenShare}
        >
          <div className="relative rounded-lg overflow-hidden bg-muted border border-border">
            {p.stream && !p.isVideoOff ? (
              <RemoteVideo stream={p.stream} />
            ) : (
              <div className="flex items-center justify-center h-full">
                <Avatar className="h-20 w-20">
                  <AvatarFallback className="bg-primary/20 text-primary text-xl">
                    {p.name.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              </div>
            )}
            <div className="absolute bottom-2 left-2 flex items-center gap-1 bg-background/80 rounded-md px-2 py-1">
              <span className="text-xs text-foreground font-medium truncate max-w-[100px]">{p.name}</span>
              {p.isMuted && <MicOff className="h-3 w-3 text-destructive" />}
            </div>
            {p.isSpeaking && (
              <div className="absolute inset-0 border-2 border-primary rounded-lg pointer-events-none" />
            )}
          </div>
        </ParticipantActions>
      ))}
    </div>
  );
}

/** Voice-only grid with avatar circles */
function VoiceGrid({
  participants,
  userName,
  isMuted,
  isHost,
  onGrantScreenShare,
  onRevokeScreenShare,
}: {
  participants: Map<string, Participant>;
  userName: string;
  isMuted: boolean;
  isHost: boolean;
  onGrantScreenShare: (id: string, name: string) => void;
  onRevokeScreenShare: (id: string, name: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-6 h-full">
      {/* Self */}
      <div className="flex flex-col items-center gap-2">
        <div className="relative">
          <Avatar className="h-20 w-20 sm:h-24 sm:w-24">
            <AvatarFallback className="bg-primary/20 text-primary text-xl">
              {userName.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          {isMuted && (
            <div className="absolute -bottom-1 -right-1 bg-destructive rounded-full p-1">
              <MicOff className="h-3 w-3 text-destructive-foreground" />
            </div>
          )}
        </div>
        <p className="text-foreground text-sm font-medium">You</p>
      </div>

      {/* Remote */}
      {Array.from(participants.values()).map((p) => (
        <ParticipantActions
          key={p.id}
          participant={p}
          isHost={isHost}
          onGrant={onGrantScreenShare}
          onRevoke={onRevokeScreenShare}
        >
          <div className="flex flex-col items-center gap-2">
            <div className="relative">
              <Avatar className={`h-20 w-20 sm:h-24 sm:w-24 ${p.isSpeaking ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : ""}`}>
                <AvatarFallback className="bg-primary/20 text-primary text-xl">
                  {p.name.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              {p.isMuted && (
                <div className="absolute -bottom-1 -right-1 bg-destructive rounded-full p-1">
                  <MicOff className="h-3 w-3 text-destructive-foreground" />
                </div>
              )}
            </div>
            <p className="text-foreground text-sm font-medium truncate max-w-[120px]">{p.name}</p>
            {p.isSpeaking && (
              <div className="flex gap-1">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="w-1.5 h-3 bg-primary rounded-full animate-pulse" style={{ animationDelay: `${i * 0.15}s` }} />
                ))}
              </div>
            )}
            {p.stream && <RemoteAudio stream={p.stream} />}
          </div>
        </ParticipantActions>
      ))}
    </div>
  );
}

/** Local video element (muted to avoid echo) */
function LocalVideo({ stream }: { stream: MediaStream }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      muted
      className="w-full h-full object-cover"
      style={{ transform: "scaleX(-1)" }}
    />
  );
}

/** Remote video/audio element */
function RemoteVideo({ stream }: { stream: MediaStream }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      className="w-full h-full object-cover"
    />
  );
}

/** Audio-only element for voice calls */
function RemoteAudio({ stream }: { stream: MediaStream }) {
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    if (audioRef.current && stream) {
      audioRef.current.srcObject = stream;
    }
  }, [stream]);

  return <audio ref={audioRef} autoPlay playsInline />;
}

/** Active call banner shown inside chat when someone else starts a call */
export function ActiveCallBanner({
  groupId,
  onJoin,
}: {
  groupId: string;
  onJoin: (callType: "voice" | "video") => void;
}) {
  const { user } = useAuth();
  const [activeCall, setActiveCall] = useState<any>(null);
  const [callerName, setCallerName] = useState("");

  useEffect(() => {
    if (!groupId) return;

    const fetchActiveCall = async () => {
      const { data } = await supabase
        .from("active_calls" as any)
        .select("*")
        .eq("chat_group_id", groupId)
        .eq("is_active", true)
        .maybeSingle();

      if (data) {
        setActiveCall(data);
        const { data: profile } = await supabase
          .from("profiles")
          .select("first_name, last_name")
          .eq("user_id", (data as any).started_by)
          .single();
        if (profile) setCallerName(`${profile.first_name} ${profile.last_name}`.trim());
      } else {
        setActiveCall(null);
      }
    };

    fetchActiveCall();

    const channel = supabase
      .channel(`active-calls-${groupId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "active_calls", filter: `chat_group_id=eq.${groupId}` }, () => {
        fetchActiveCall();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [groupId]);

  if (!activeCall || (activeCall as any).started_by === user?.id) return null;

  const callType = (activeCall as any).call_type as "voice" | "video";

  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-primary/10 border-b border-primary/20 animate-in slide-in-from-top">
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <div className="relative">
          <Phone className="h-4 w-4 text-primary" />
          <span className="absolute -top-0.5 -right-0.5 h-2 w-2 bg-green-500 rounded-full animate-pulse" />
        </div>
        <p className="text-sm text-foreground truncate">
          <span className="font-medium">{callerName || "Someone"}</span>
          {" started a "}
          <span className="font-medium">{callType} call</span>
        </p>
      </div>
      <Button size="sm" variant="default" className="shrink-0 gap-1.5" onClick={() => onJoin(callType)}>
        <Phone className="h-3.5 w-3.5" />
        Join
      </Button>
    </div>
  );
}

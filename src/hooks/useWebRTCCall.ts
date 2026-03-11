import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
    { urls: "stun:stun3.l.google.com:19302" },
    { urls: "stun:stun4.l.google.com:19302" },
  ],
};

export interface Participant {
  id: string;
  name: string;
  stream: MediaStream | null;
  isSpeaking: boolean;
  isMuted: boolean;
  isVideoOff: boolean;
}

interface SignalPayload {
  type: "offer" | "answer" | "ice-candidate" | "join" | "leave" | "media-state";
  from: string;
  fromName: string;
  to?: string;
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
  callType?: "voice" | "video";
  isMuted?: boolean;
  isVideoOff?: boolean;
}

export function useWebRTCCall(
  roomId: string,
  callType: "voice" | "video",
  isActive: boolean
) {
  const { user } = useAuth();
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [participants, setParticipants] = useState<Map<string, Participant>>(new Map());
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(callType === "voice");
  const [isSpeakerOff, setIsSpeakerOff] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [connectionState, setConnectionState] = useState<"connecting" | "connected" | "failed" | "disconnected">("connecting");
  const [error, setError] = useState<string | null>(null);
  const [mediaWarning, setMediaWarning] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [userName, setUserName] = useState("You");

  const peerConnections = useRef<Map<string, RTCPeerConnection>>(new Map());
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const durationTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const pendingCandidates = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const audioAnalyserRef = useRef<Map<string, { analyser: AnalyserNode; ctx: AudioContext }>>(new Map());
  const forceEndRef = useRef(false);

  // Get user profile name
  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("first_name, last_name")
      .eq("user_id", user.id)
      .single()
      .then(({ data }) => {
        if (data) setUserName(`${data.first_name} ${data.last_name}`.trim());
      });
  }, [user]);

  // Duration timer
  useEffect(() => {
    if (connectionState === "connected") {
      durationTimer.current = setInterval(() => setDuration((d) => d + 1), 1000);
    }
    return () => {
      if (durationTimer.current) clearInterval(durationTimer.current);
    };
  }, [connectionState]);

  const createPeerConnection = useCallback(
    (peerId: string, peerName: string): RTCPeerConnection => {
      const pc = new RTCPeerConnection(ICE_SERVERS);

      // Add local tracks
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => {
          pc.addTrack(track, localStreamRef.current!);
        });
      }

      // Handle ICE candidates
      pc.onicecandidate = (event) => {
        if (event.candidate && channelRef.current) {
          channelRef.current.send({
            type: "broadcast",
            event: "signal",
            payload: {
              type: "ice-candidate",
              from: user!.id,
              fromName: userName,
              to: peerId,
              candidate: event.candidate.toJSON(),
            } as SignalPayload,
          });
        }
      };

      // Handle remote stream
      pc.ontrack = (event) => {
        const remoteStream = event.streams[0];
        if (remoteStream) {
          setParticipants((prev) => {
            const next = new Map(prev);
            const existing = next.get(peerId);
            next.set(peerId, {
              id: peerId,
              name: peerName,
              stream: remoteStream,
              isSpeaking: false,
              isMuted: existing?.isMuted ?? false,
              isVideoOff: existing?.isVideoOff ?? false,
            });
            return next;
          });

          // Set up audio analysis for speaking detection
          try {
            const audioCtx = new AudioContext();
            const source = audioCtx.createMediaStreamSource(remoteStream);
            const analyser = audioCtx.createAnalyser();
            analyser.fftSize = 256;
            source.connect(analyser);
            audioAnalyserRef.current.set(peerId, { analyser, ctx: audioCtx });
          } catch (e) {
            // Audio analysis optional
          }
        }
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "connected") {
          setConnectionState("connected");
        } else if (pc.connectionState === "failed") {
          console.warn(`Peer connection to ${peerId} failed`);
        }
      };

      peerConnections.current.set(peerId, pc);
      return pc;
    },
    [user, userName]
  );

  const handleSignal = useCallback(
    async (payload: SignalPayload) => {
      if (!user || payload.from === user.id) return;
      if (payload.to && payload.to !== user.id) return;

      const peerId = payload.from;
      const peerName = payload.fromName || "User";

      switch (payload.type) {
        case "join": {
          // New peer joined - create offer
          const pc = createPeerConnection(peerId, peerName);
          try {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            channelRef.current?.send({
              type: "broadcast",
              event: "signal",
              payload: {
                type: "offer",
                from: user.id,
                fromName: userName,
                to: peerId,
                sdp: pc.localDescription!,
              } as SignalPayload,
            });
          } catch (err) {
            console.error("Error creating offer:", err);
          }
          break;
        }

        case "offer": {
          let pc = peerConnections.current.get(peerId);
          if (!pc) pc = createPeerConnection(peerId, peerName);
          try {
            await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp!));
            // Flush pending ICE candidates
            const pending = pendingCandidates.current.get(peerId) || [];
            for (const c of pending) {
              await pc.addIceCandidate(new RTCIceCandidate(c));
            }
            pendingCandidates.current.delete(peerId);

            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            channelRef.current?.send({
              type: "broadcast",
              event: "signal",
              payload: {
                type: "answer",
                from: user.id,
                fromName: userName,
                to: peerId,
                sdp: pc.localDescription!,
              } as SignalPayload,
            });
          } catch (err) {
            console.error("Error handling offer:", err);
          }
          break;
        }

        case "answer": {
          const pc = peerConnections.current.get(peerId);
          if (pc && pc.signalingState === "have-local-offer") {
            try {
              await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp!));
              // Flush pending ICE candidates
              const pending = pendingCandidates.current.get(peerId) || [];
              for (const c of pending) {
                await pc.addIceCandidate(new RTCIceCandidate(c));
              }
              pendingCandidates.current.delete(peerId);
            } catch (err) {
              console.error("Error handling answer:", err);
            }
          }
          break;
        }

        case "ice-candidate": {
          const pc = peerConnections.current.get(peerId);
          if (pc && pc.remoteDescription) {
            try {
              await pc.addIceCandidate(new RTCIceCandidate(payload.candidate!));
            } catch (err) {
              console.error("Error adding ICE candidate:", err);
            }
          } else {
            // Buffer candidates until remote description is set
            const pending = pendingCandidates.current.get(peerId) || [];
            pending.push(payload.candidate!);
            pendingCandidates.current.set(peerId, pending);
          }
          break;
        }

        case "leave": {
          const pc = peerConnections.current.get(peerId);
          if (pc) {
            pc.close();
            peerConnections.current.delete(peerId);
          }
          const audio = audioAnalyserRef.current.get(peerId);
          if (audio) {
            audio.ctx.close();
            audioAnalyserRef.current.delete(peerId);
          }
          setParticipants((prev) => {
            const next = new Map(prev);
            next.delete(peerId);
            return next;
          });
          break;
        }

        case "media-state": {
          setParticipants((prev) => {
            const next = new Map(prev);
            const existing = next.get(peerId);
            if (existing) {
              next.set(peerId, {
                ...existing,
                isMuted: payload.isMuted ?? existing.isMuted,
                isVideoOff: payload.isVideoOff ?? existing.isVideoOff,
              });
            }
            return next;
          });
          break;
        }
      }
    },
    [user, userName, createPeerConnection]
  );

  // Speaking detection loop
  useEffect(() => {
    const interval = setInterval(() => {
      audioAnalyserRef.current.forEach((val, peerId) => {
        const data = new Uint8Array(val.analyser.frequencyBinCount);
        val.analyser.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length;
        const speaking = avg > 20;
        setParticipants((prev) => {
          const existing = prev.get(peerId);
          if (existing && existing.isSpeaking !== speaking) {
            const next = new Map(prev);
            next.set(peerId, { ...existing, isSpeaking: speaking });
            return next;
          }
          return prev;
        });
      });
    }, 200);
    return () => clearInterval(interval);
  }, []);

  // Initialize call
  useEffect(() => {
    if (!isActive || !user) return;

    let mounted = true;

    const init = async () => {
      try {
        setConnectionState("connecting");
        setError(null);

        // Try to get local media, but don't fail the call if denied
        let stream: MediaStream | null = null;
        let mediaError: string | null = null;

        // First, try requesting both audio and video (for video calls)
        const constraints: MediaStreamConstraints = {
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
          video: callType === "video" ? { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" } : false,
        };

        try {
          stream = await navigator.mediaDevices.getUserMedia(constraints);
        } catch (mediaErr: any) {
          console.warn("Full media request failed:", mediaErr.name);

          // If video call failed, try audio-only
          if (callType === "video") {
            try {
              stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
              mediaError = "Camera access denied. Joining with audio only.";
              setIsVideoOff(true);
            } catch (audioErr: any) {
              console.warn("Audio-only also failed:", audioErr.name);
            }
          }

          // If still no stream, try video-only (unlikely but handle it)
          if (!stream && callType === "video") {
            try {
              stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: true });
              mediaError = "Microphone access denied. Joining with video only.";
              setIsMuted(true);
            } catch (videoErr: any) {
              console.warn("Video-only also failed:", videoErr.name);
            }
          }

          // If all media requests failed, continue with no stream
          if (!stream) {
            stream = new MediaStream(); // empty stream
            if (mediaErr.name === "NotAllowedError" || mediaErr.name === "PermissionDeniedError") {
              mediaError = "Microphone/camera access denied. You can listen but not speak. Grant access in browser settings and rejoin to participate fully.";
            } else if (mediaErr.name === "NotFoundError" || mediaErr.name === "DevicesNotFoundError") {
              mediaError = "No microphone or camera found. You can still listen to others.";
            } else {
              mediaError = "Could not access media devices. You can still listen to others.";
            }
            setIsMuted(true);
            if (callType === "video") setIsVideoOff(true);
          }
        }

        if (!mounted) {
          stream?.getTracks().forEach((t) => t.stop());
          return;
        }

        // Show media warning but don't block the call
        if (mediaError) {
          setMediaWarning(mediaError);
        }

        localStreamRef.current = stream;
        setLocalStream(stream);

        // Join signaling channel
        const channelName = `webrtc-call-${roomId}`;
        const channel = supabase.channel(channelName, {
          config: { broadcast: { self: false } },
        });

        channel.on("broadcast", { event: "signal" }, ({ payload }) => {
          handleSignal(payload as SignalPayload);
        });

        await channel.subscribe();
        channelRef.current = channel;

        // Announce join
        channel.send({
          type: "broadcast",
          event: "signal",
          payload: {
            type: "join",
            from: user.id,
            fromName: userName,
            callType,
          } as SignalPayload,
        });

        setConnectionState("connected");
      } catch (err: any) {
        console.error("Call init error:", err);
        if (!mounted) return;
        setError(err.message || "Failed to start call");
        setConnectionState("failed");
      }
    };

    init();

    // Register active call in DB
    const registerCall = async () => {
      try {
        const groupId = roomId.replace("call-", "");
        const { data: existing } = await supabase
          .from("active_calls" as any)
          .select("id")
          .eq("chat_group_id", groupId)
          .eq("is_active", true)
          .maybeSingle();

        if (!existing) {
          await supabase.from("active_calls" as any).insert({
            chat_group_id: groupId,
            started_by: user.id,
            call_type: callType,
            room_name: roomId,
          });
        }
      } catch (e) {
        console.warn("Could not register active call:", e);
      }
    };
    registerCall();

    // Listen for host ending the call for everyone
    const groupId = roomId.replace("call-", "");
    const callEndChannel = supabase
      .channel(`call-end-${groupId}`)
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "active_calls",
        filter: `chat_group_id=eq.${groupId}`,
      }, (payload: any) => {
        if (payload.new && payload.new.is_active === false && mounted) {
          // Host ended the call — force disconnect
          setConnectionState("disconnected");
          setError("The host has ended this call.");
          // Trigger cleanup by setting a flag
          forceEndRef.current = true;
        }
      })
      .subscribe();

    return () => {
      mounted = false;
      // Announce leave
      channelRef.current?.send({
        type: "broadcast",
        event: "signal",
        payload: {
          type: "leave",
          from: user.id,
          fromName: userName,
        } as SignalPayload,
      });

      // Cleanup
      setTimeout(() => {
        // Close all peer connections
        peerConnections.current.forEach((pc) => pc.close());
        peerConnections.current.clear();

        // Close audio contexts
        audioAnalyserRef.current.forEach((val) => val.ctx.close());
        audioAnalyserRef.current.clear();

        // Stop local stream
        localStreamRef.current?.getTracks().forEach((t) => t.stop());
        localStreamRef.current = null;

        // Stop screen share
        screenStreamRef.current?.getTracks().forEach((t) => t.stop());
        screenStreamRef.current = null;

        // Leave channel
        if (channelRef.current) {
          supabase.removeChannel(channelRef.current);
          channelRef.current = null;
        }

        pendingCandidates.current.clear();
        setParticipants(new Map());
        setLocalStream(null);
        setDuration(0);
        setConnectionState("disconnected");

        // End active call in DB
        const groupId = roomId.replace("call-", "");
        supabase
          .from("active_calls" as any)
          .update({ is_active: false, ended_at: new Date().toISOString() })
          .eq("chat_group_id", groupId)
          .eq("started_by", user.id)
          .then(() => {});
      }, 100);
    };
  }, [isActive, roomId, callType]); // eslint-disable-line react-hooks/exhaustive-deps

  const broadcastMediaState = useCallback((muted?: boolean, videoOff?: boolean) => {
    if (!user) return;
    channelRef.current?.send({
      type: "broadcast",
      event: "signal",
      payload: {
        type: "media-state",
        from: user.id,
        fromName: userName,
        ...(muted !== undefined && { isMuted: muted }),
        ...(videoOff !== undefined && { isVideoOff: videoOff }),
      } as SignalPayload,
    });
  }, [user, userName]);

  const addTrackToPeers = useCallback((track: MediaStreamTrack) => {
    if (!localStreamRef.current) return;
    peerConnections.current.forEach((pc) => {
      const existingSender = pc.getSenders().find((s) => s.track?.kind === track.kind);
      if (existingSender) {
        existingSender.replaceTrack(track);
      } else {
        pc.addTrack(track, localStreamRef.current!);
      }
    });
  }, []);

  const toggleMute = useCallback(async () => {
    if (!localStreamRef.current) return;
    const audioTrack = localStreamRef.current.getAudioTracks()[0];

    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      setIsMuted(!audioTrack.enabled);
      broadcastMediaState(!audioTrack.enabled, undefined);
    } else {
      // No audio track yet — request mic permission now
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
        const newTrack = stream.getAudioTracks()[0];
        localStreamRef.current.addTrack(newTrack);
        addTrackToPeers(newTrack);
        setLocalStream(new MediaStream(localStreamRef.current.getTracks()));
        setIsMuted(false);
        setMediaWarning(null);
        broadcastMediaState(false, undefined);
      } catch (err) {
        console.warn("Could not acquire microphone:", err);
      }
    }
  }, [broadcastMediaState, addTrackToPeers]);

  const toggleVideo = useCallback(async () => {
    if (!localStreamRef.current) return;
    const videoTrack = localStreamRef.current.getVideoTracks()[0];

    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled;
      setIsVideoOff(!videoTrack.enabled);
      broadcastMediaState(undefined, !videoTrack.enabled);
    } else {
      // No video track yet — request camera permission now
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
        });
        const newTrack = stream.getVideoTracks()[0];
        localStreamRef.current.addTrack(newTrack);
        addTrackToPeers(newTrack);
        setLocalStream(new MediaStream(localStreamRef.current.getTracks()));
        setIsVideoOff(false);
        setMediaWarning(null);
        broadcastMediaState(undefined, false);
      } catch (err) {
        console.warn("Could not acquire camera:", err);
      }
    }
  }, [broadcastMediaState, addTrackToPeers]);

  const toggleSpeaker = useCallback(() => {
    setIsSpeakerOff((prev) => {
      const newState = !prev;
      document.querySelectorAll("audio, video").forEach((el) => {
        (el as HTMLMediaElement).muted = newState;
      });
      return newState;
    });
  }, []);

  const toggleScreenShare = useCallback(async () => {
    if (!user) return;

    if (isScreenSharing) {
      // Stop screen share, restore camera
      screenStreamRef.current?.getTracks().forEach((t) => t.stop());
      screenStreamRef.current = null;
      setIsScreenSharing(false);

      // Replace video track back to camera
      if (localStreamRef.current && callType === "video") {
        try {
          const camStream = await navigator.mediaDevices.getUserMedia({ video: true });
          const camTrack = camStream.getVideoTracks()[0];
          const oldTrack = localStreamRef.current.getVideoTracks()[0];
          if (oldTrack) localStreamRef.current.removeTrack(oldTrack);
          localStreamRef.current.addTrack(camTrack);

          // Replace in all peer connections
          peerConnections.current.forEach((pc) => {
            const sender = pc.getSenders().find((s) => s.track?.kind === "video");
            if (sender) sender.replaceTrack(camTrack);
          });

          setLocalStream(new MediaStream(localStreamRef.current.getTracks()));
        } catch (e) {
          console.warn("Could not restore camera:", e);
        }
      }
    } else {
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: false,
        });
        screenStreamRef.current = screenStream;
        setIsScreenSharing(true);

        const screenTrack = screenStream.getVideoTracks()[0];

        // Replace video track in local stream and all peers
        if (localStreamRef.current) {
          const oldTrack = localStreamRef.current.getVideoTracks()[0];
          if (oldTrack) localStreamRef.current.removeTrack(oldTrack);
          localStreamRef.current.addTrack(screenTrack);

          peerConnections.current.forEach((pc) => {
            const sender = pc.getSenders().find((s) => s.track?.kind === "video");
            if (sender) sender.replaceTrack(screenTrack);
          });

          setLocalStream(new MediaStream(localStreamRef.current.getTracks()));
        }

        // Handle user stopping screen share via browser UI
        screenTrack.onended = () => {
          setIsScreenSharing(false);
          screenStreamRef.current = null;
        };
      } catch (e: any) {
        if (e.name !== "AbortError") {
          console.error("Screen share error:", e);
        }
      }
    }
  }, [isScreenSharing, user, callType]);

  return {
    localStream,
    participants,
    isMuted,
    isVideoOff,
    isSpeakerOff,
    isScreenSharing,
    connectionState,
    error,
    mediaWarning,
    duration,
    userName,
    toggleMute,
    toggleVideo,
    toggleSpeaker,
    toggleScreenShare,
  };
}

/**
 * Lightweight WebRTC LAN transport.
 *
 * Signaling uses the `mesh_signaling` table over Supabase Realtime. Once
 * peers exchange offer/answer/ICE, data flows entirely peer-to-peer over
 * the LAN — internet to the server is only needed for the handshake
 * (and even that is brief; subsequent transfers do not touch the server).
 */

import { supabase } from "@/integrations/supabase/client";

export interface LanPeer {
  peerId: string;
  pc: RTCPeerConnection;
  dc?: RTCDataChannel;
}

const STUN: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];

export function randomPeerId(): string {
  return crypto.randomUUID();
}

export class WebRTCLan {
  readonly roomId: string;
  readonly peerId: string;
  private peers = new Map<string, LanPeer>();
  private channel: ReturnType<typeof supabase.channel> | null = null;
  private onData?: (peerId: string, data: unknown) => void;

  constructor(roomId: string, peerId = randomPeerId()) {
    this.roomId = roomId;
    this.peerId = peerId;
  }

  onMessage(cb: (peerId: string, data: unknown) => void) {
    this.onData = cb;
  }

  peerCount() {
    return this.peers.size;
  }

  async start() {
    // Subscribe to realtime signaling
    this.channel = supabase
      .channel(`mesh-${this.roomId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "mesh_signaling", filter: `room_id=eq.${this.roomId}` },
        (payload) => this.handleSignal(payload.new as any),
      )
      .subscribe();

    // Announce presence
    await this.send("hello", null, null);
  }

  async stop() {
    await this.send("bye", null, null).catch(() => {});
    this.peers.forEach((p) => p.pc.close());
    this.peers.clear();
    if (this.channel) supabase.removeChannel(this.channel);
    this.channel = null;
  }

  /** Send a payload to all connected peers via data channels. */
  broadcast(payload: unknown) {
    const data = typeof payload === "string" ? payload : JSON.stringify(payload);
    this.peers.forEach((p) => {
      if (p.dc?.readyState === "open") {
        try { p.dc.send(data); } catch {/* noop */}
      }
    });
  }

  private async send(kind: string, to: string | null, payload: unknown) {
    await supabase.from("mesh_signaling").insert({
      room_id: this.roomId,
      from_peer: this.peerId,
      to_peer: to,
      kind,
      payload: payload as any,
    });
  }

  private async handleSignal(row: any) {
    if (row.from_peer === this.peerId) return;
    if (row.to_peer && row.to_peer !== this.peerId) return;

    switch (row.kind) {
      case "hello":
        await this.dial(row.from_peer);
        break;
      case "offer":
        await this.onOffer(row.from_peer, row.payload);
        break;
      case "answer":
        await this.onAnswer(row.from_peer, row.payload);
        break;
      case "ice":
        await this.onIce(row.from_peer, row.payload);
        break;
      case "bye":
        this.dropPeer(row.from_peer);
        break;
    }
  }

  private ensurePeer(peerId: string): LanPeer {
    let p = this.peers.get(peerId);
    if (p) return p;
    const pc = new RTCPeerConnection({ iceServers: STUN });
    pc.onicecandidate = (ev) => {
      if (ev.candidate) this.send("ice", peerId, ev.candidate.toJSON());
    };
    pc.ondatachannel = (ev) => this.wireDC(peerId, ev.channel);
    p = { peerId, pc };
    this.peers.set(peerId, p);
    return p;
  }

  private wireDC(peerId: string, dc: RTCDataChannel) {
    const p = this.ensurePeer(peerId);
    p.dc = dc;
    dc.onmessage = (ev) => {
      let data: unknown = ev.data;
      try { data = JSON.parse(ev.data); } catch {/* keep raw */}
      this.onData?.(peerId, data);
    };
  }

  private async dial(peerId: string) {
    if (this.peers.has(peerId)) return;
    // Only the lexicographically smaller peerId creates the offer to avoid glare
    if (this.peerId > peerId) return;
    const p = this.ensurePeer(peerId);
    const dc = p.pc.createDataChannel("mesh", { ordered: true });
    this.wireDC(peerId, dc);
    const offer = await p.pc.createOffer();
    await p.pc.setLocalDescription(offer);
    await this.send("offer", peerId, offer);
  }

  private async onOffer(peerId: string, offer: RTCSessionDescriptionInit) {
    const p = this.ensurePeer(peerId);
    await p.pc.setRemoteDescription(offer);
    const answer = await p.pc.createAnswer();
    await p.pc.setLocalDescription(answer);
    await this.send("answer", peerId, answer);
  }

  private async onAnswer(peerId: string, answer: RTCSessionDescriptionInit) {
    const p = this.ensurePeer(peerId);
    if (p.pc.signalingState === "have-local-offer") {
      await p.pc.setRemoteDescription(answer);
    }
  }

  private async onIce(peerId: string, ice: RTCIceCandidateInit) {
    const p = this.ensurePeer(peerId);
    try { await p.pc.addIceCandidate(ice); } catch {/* race */}
  }

  private dropPeer(peerId: string) {
    const p = this.peers.get(peerId);
    if (!p) return;
    p.pc.close();
    this.peers.delete(peerId);
  }
}

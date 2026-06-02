/**
 * 100% offline WebRTC transport using MANUAL signaling.
 *
 * Unlike webrtcLan.ts (which uses Supabase Realtime to exchange SDP and
 * therefore needs a brief internet connection for the handshake), this
 * transport never touches any server. The offer/answer SDP — including all
 * ICE candidates — is gathered to completion and serialized into a single
 * compact string that the two devices exchange by hand (QR code or
 * copy/paste). Once exchanged, data flows entirely peer-to-peer over the
 * local WiFi / hotspot link.
 *
 * Flow:
 *   Device A (Sender)   -> createOffer()  -> share OFFER blob
 *   Device B (Receiver) -> acceptOffer()  -> share ANSWER blob
 *   Device A            -> acceptAnswer() -> connection established
 *   Either side         -> sendJson() / onData()
 */

// Local hotspot/WiFi works without STUN, but including a STUN server lets the
// same code also traverse when the two phones are on the same router subnet.
const ICE: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];

export type SignalKind = "offer" | "answer";

export interface SignalBlob {
  v: 1;
  kind: SignalKind;
  sdp: RTCSessionDescriptionInit;
}

export function encodeSignal(blob: SignalBlob): string {
  // base64 of JSON keeps it copy/paste-safe and QR-friendly.
  return btoa(unescape(encodeURIComponent(JSON.stringify(blob))));
}

export function decodeSignal(text: string): SignalBlob {
  const raw = text.trim();
  let json: string;
  try {
    json = decodeURIComponent(escape(atob(raw)));
  } catch {
    // Allow raw JSON paste as a fallback.
    json = raw;
  }
  const parsed = JSON.parse(json);
  if (!parsed || (parsed.kind !== "offer" && parsed.kind !== "answer")) {
    throw new Error("Invalid connection code");
  }
  return parsed as SignalBlob;
}

export type ConnState = "new" | "connecting" | "connected" | "disconnected" | "failed";

export class ManualPeer {
  private pc: RTCPeerConnection;
  private dc: RTCDataChannel | null = null;
  private onDataCb?: (data: unknown) => void;
  private onStateCb?: (state: ConnState) => void;
  private onProgressCb?: (sent: number, total: number) => void;

  constructor() {
    this.pc = new RTCPeerConnection({ iceServers: ICE });
    this.pc.onconnectionstatechange = () => {
      const s = this.pc.connectionState as ConnState;
      this.onStateCb?.(s);
    };
  }

  onData(cb: (data: unknown) => void) { this.onDataCb = cb; }
  onState(cb: (state: ConnState) => void) { this.onStateCb = cb; }
  onProgress(cb: (sent: number, total: number) => void) { this.onProgressCb = cb; }

  get connected() {
    return this.dc?.readyState === "open";
  }

  /** Wait until ICE gathering completes so the SDP carries every candidate. */
  private waitForIce(): Promise<void> {
    return new Promise((resolve) => {
      if (this.pc.iceGatheringState === "complete") return resolve();
      const check = () => {
        if (this.pc.iceGatheringState === "complete") {
          this.pc.removeEventListener("icegatheringstatechange", check);
          resolve();
        }
      };
      this.pc.addEventListener("icegatheringstatechange", check);
      // Safety timeout — some hosts never report "complete".
      setTimeout(resolve, 3000);
    });
  }

  private wireChannel(dc: RTCDataChannel) {
    this.dc = dc;
    dc.binaryType = "arraybuffer";
    dc.onopen = () => this.onStateCb?.("connected");
    dc.onclose = () => this.onStateCb?.("disconnected");
    dc.onmessage = (ev) => {
      let data: unknown = ev.data;
      try { data = JSON.parse(ev.data); } catch { /* keep raw */ }
      this.onDataCb?.(data);
    };
  }

  /** Sender: create the initial offer blob to share. */
  async createOffer(): Promise<string> {
    const dc = this.pc.createDataChannel("forms", { ordered: true });
    this.wireChannel(dc);
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    await this.waitForIce();
    return encodeSignal({ v: 1, kind: "offer", sdp: this.pc.localDescription! });
  }

  /** Receiver: accept the offer blob and produce an answer blob to share back. */
  async acceptOffer(offerText: string): Promise<string> {
    const blob = decodeSignal(offerText);
    if (blob.kind !== "offer") throw new Error("Expected an offer code");
    this.pc.ondatachannel = (ev) => this.wireChannel(ev.channel);
    await this.pc.setRemoteDescription(blob.sdp);
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    await this.waitForIce();
    return encodeSignal({ v: 1, kind: "answer", sdp: this.pc.localDescription! });
  }

  /** Sender: finalize the connection using the receiver's answer blob. */
  async acceptAnswer(answerText: string): Promise<void> {
    const blob = decodeSignal(answerText);
    if (blob.kind !== "answer") throw new Error("Expected an answer code");
    await this.pc.setRemoteDescription(blob.sdp);
  }

  /** Send a JSON-serializable payload over the data channel. */
  sendJson(payload: unknown) {
    if (this.dc?.readyState !== "open") throw new Error("Connection not open");
    this.dc.send(JSON.stringify(payload));
  }

  /**
   * Send a large array of records in sequence, reporting progress. Uses
   * buffered-amount backpressure so big batches don't overflow the channel.
   */
  async sendBatch(records: unknown[], meta: Record<string, unknown> = {}) {
    if (this.dc?.readyState !== "open") throw new Error("Connection not open");
    const dc = this.dc;
    this.sendJson({ __type: "batch-start", count: records.length, ...meta });
    for (let i = 0; i < records.length; i++) {
      // Backpressure: wait if the buffer is getting full.
      while (dc.bufferedAmount > 1_000_000) {
        await new Promise((r) => setTimeout(r, 40));
      }
      this.sendJson({ __type: "record", index: i, payload: records[i] });
      this.onProgressCb?.(i + 1, records.length);
    }
    this.sendJson({ __type: "batch-end", count: records.length });
  }

  close() {
    try { this.dc?.close(); } catch { /* noop */ }
    try { this.pc.close(); } catch { /* noop */ }
  }
}

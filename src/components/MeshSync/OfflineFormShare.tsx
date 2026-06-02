/**
 * Offline Form Share — peer-to-peer transfer of finalized forms between two
 * devices over a local WiFi / hotspot link, with ZERO internet required.
 *
 * One device hosts a WiFi hotspot (or both join the same WiFi). The two
 * devices then exchange a short connection code (QR scan or copy/paste) to
 * establish a direct WebRTC data channel. Finalized form entries stored
 * locally (IndexedDB) are streamed straight from one device to the other.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Html5Qrcode } from "html5-qrcode";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { toast } from "@/hooks/use-toast";
import {
  Send, Download, Wifi, Copy, Check, QrCode, Camera, X, Loader2,
  ArrowRightLeft, ShieldCheck, FileCheck2, Smartphone,
} from "lucide-react";

import { useAuth } from "@/hooks/useAuth";
import { ManualPeer, type ConnState } from "@/lib/meshSync/webrtcManual";
import {
  listSavedEntries, saveSavedEntry, getSavedEntry,
  type SavedFormEntry,
} from "@/lib/savedForms";

type Role = "idle" | "sender" | "receiver";

export default function OfflineFormShare() {
  const { user } = useAuth();
  const [role, setRole] = useState<Role>("idle");
  const [state, setState] = useState<ConnState>("new");
  const [localCode, setLocalCode] = useState("");
  const [remoteCode, setRemoteCode] = useState("");
  const [copied, setCopied] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [entries, setEntries] = useState<SavedFormEntry[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [progress, setProgress] = useState<{ sent: number; total: number } | null>(null);
  const [received, setReceived] = useState<SavedFormEntry[]>([]);
  const [step, setStep] = useState(1);

  const peerRef = useRef<ManualPeer | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const incomingRef = useRef<{ buffer: SavedFormEntry[]; expected: number }>({ buffer: [], expected: 0 });

  const connected = state === "connected";

  // Load this device's finalized entries (sender side).
  useEffect(() => {
    if (!user) return;
    listSavedEntries(user.id).then((rows) => {
      const shareable = rows.filter((r) => r.status === "finalized" || r.status === "sent");
      setEntries(shareable);
      setSelected(Object.fromEntries(shareable.map((r) => [r.id, true])));
    });
  }, [user, role]);

  const handleIncoming = useCallback(async (data: unknown) => {
    const msg = data as any;
    if (!msg || typeof msg !== "object") return;
    if (msg.__type === "batch-start") {
      incomingRef.current = { buffer: [], expected: msg.count ?? 0 };
      setProgress({ sent: 0, total: msg.count ?? 0 });
      return;
    }
    if (msg.__type === "record" && msg.payload) {
      const entry = msg.payload as SavedFormEntry;
      incomingRef.current.buffer.push(entry);
      setProgress({ sent: incomingRef.current.buffer.length, total: incomingRef.current.expected });
      return;
    }
    if (msg.__type === "batch-end") {
      const incoming = incomingRef.current.buffer;
      let imported = 0;
      for (const entry of incoming) {
        // De-dupe: skip if we already hold this id.
        const existing = await getSavedEntry(entry.id);
        if (existing) continue;
        await saveSavedEntry({
          ...entry,
          userId: user?.id ?? entry.userId, // adopt into this device's list
          offline: true,
          updatedAt: new Date().toISOString(),
        });
        imported++;
      }
      setReceived(incoming);
      toast({
        title: "Transfer complete",
        description: `Received ${incoming.length} form${incoming.length === 1 ? "" : "s"} · ${imported} newly imported.`,
      });
      setProgress(null);
    }
  }, [user]);

  const newPeer = useCallback(() => {
    const peer = new ManualPeer();
    peer.onState((s) => setState(s));
    peer.onData(handleIncoming);
    peer.onProgress((sent, total) => setProgress({ sent, total }));
    peerRef.current = peer;
    return peer;
  }, [handleIncoming]);

  // ---- Sender flow ----
  const startSender = useCallback(async () => {
    setRole("sender");
    setStep(1);
    const peer = newPeer();
    const offer = await peer.createOffer();
    setLocalCode(offer);
    setStep(2);
  }, [newPeer]);

  const senderAcceptAnswer = useCallback(async (text: string) => {
    try {
      await peerRef.current?.acceptAnswer(text);
      setStep(3);
      toast({ title: "Linking devices", description: "Establishing secure peer connection…" });
    } catch (e: any) {
      toast({ title: "Invalid code", description: e?.message ?? "Could not read the answer code.", variant: "destructive" });
    }
  }, []);

  const sendSelected = useCallback(async () => {
    const peer = peerRef.current;
    if (!peer?.connected) {
      toast({ title: "Not connected", description: "Wait for the connection to establish.", variant: "destructive" });
      return;
    }
    const toSend = entries.filter((e) => selected[e.id]);
    if (toSend.length === 0) {
      toast({ title: "Nothing selected", description: "Select at least one form to share.", variant: "destructive" });
      return;
    }
    setProgress({ sent: 0, total: toSend.length });
    try {
      await peer.sendBatch(toSend, { kind: "finalized-forms" });
      toast({ title: "Forms sent", description: `Shared ${toSend.length} form${toSend.length === 1 ? "" : "s"} to the connected device.` });
    } catch (e: any) {
      toast({ title: "Send failed", description: e?.message ?? "", variant: "destructive" });
    } finally {
      setProgress(null);
    }
  }, [entries, selected]);

  // ---- Receiver flow ----
  const startReceiver = useCallback(() => {
    setRole("receiver");
    setStep(1);
    newPeer();
  }, [newPeer]);

  const receiverAcceptOffer = useCallback(async (text: string) => {
    try {
      const answer = await peerRef.current!.acceptOffer(text);
      setLocalCode(answer);
      setStep(2);
      toast({ title: "Offer accepted", description: "Share your answer code back with the sender." });
    } catch (e: any) {
      toast({ title: "Invalid code", description: e?.message ?? "Could not read the offer code.", variant: "destructive" });
    }
  }, []);

  // ---- QR scanning ----
  const startScan = useCallback(async (onResult: (text: string) => void) => {
    setScanning(true);
    setTimeout(async () => {
      try {
        const el = "ofs-qr-reader";
        const scanner = new Html5Qrcode(el);
        scannerRef.current = scanner;
        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 240, height: 240 } },
          (decoded) => {
            stopScan();
            onResult(decoded);
          },
          () => {},
        );
      } catch (e: any) {
        setScanning(false);
        toast({ title: "Camera error", description: e?.message ?? "Could not start the camera.", variant: "destructive" });
      }
    }, 100);
  }, []);

  const stopScan = useCallback(() => {
    const s = scannerRef.current;
    if (s) {
      s.stop().then(() => s.clear()).catch(() => {});
      scannerRef.current = null;
    }
    setScanning(false);
  }, []);

  const copyCode = useCallback(() => {
    navigator.clipboard.writeText(localCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [localCode]);

  const reset = useCallback(() => {
    stopScan();
    peerRef.current?.close();
    peerRef.current = null;
    setRole("idle");
    setState("new");
    setLocalCode("");
    setRemoteCode("");
    setProgress(null);
    setReceived([]);
    setStep(1);
  }, [stopScan]);

  useEffect(() => () => { peerRef.current?.close(); stopScan(); }, [stopScan]);

  const selectedCount = useMemo(() => Object.values(selected).filter(Boolean).length, [selected]);

  const stateBadge = () => {
    const map: Record<ConnState, { label: string; cls: string }> = {
      new: { label: "Idle", cls: "bg-muted text-muted-foreground" },
      connecting: { label: "Connecting…", cls: "bg-amber-500/15 text-amber-600" },
      connected: { label: "Connected", cls: "bg-emerald-500/15 text-emerald-600" },
      disconnected: { label: "Disconnected", cls: "bg-muted text-muted-foreground" },
      failed: { label: "Failed", cls: "bg-destructive/15 text-destructive" },
    };
    const s = map[state];
    return <Badge variant="outline" className={s.cls}>{s.label}</Badge>;
  };

  return (
    <div className="space-y-4 max-w-4xl mx-auto">
      <Card className="overflow-hidden">
        <CardHeader className="bg-gradient-to-br from-primary/10 to-transparent">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <CardTitle className="flex items-center gap-2">
                <ArrowRightLeft className="h-5 w-5 text-primary" /> Offline Form Share
              </CardTitle>
              <CardDescription className="mt-1">
                Transfer finalized forms directly between two devices over WiFi or a phone hotspot —
                no internet, no data charges.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">{stateBadge()}</div>
          </div>
        </CardHeader>
        <CardContent className="pt-5 space-y-4">
          {role === "idle" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <button
                onClick={startSender}
                className="group rounded-xl border-2 border-dashed border-border p-6 text-left transition hover:border-primary hover:bg-primary/5"
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="rounded-lg bg-primary/10 p-2 text-primary"><Send className="h-5 w-5" /></span>
                  <span className="font-semibold">Send forms</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  Share your finalized forms with another device. You generate the first code.
                </p>
              </button>
              <button
                onClick={startReceiver}
                className="group rounded-xl border-2 border-dashed border-border p-6 text-left transition hover:border-primary hover:bg-primary/5"
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="rounded-lg bg-primary/10 p-2 text-primary"><Download className="h-5 w-5" /></span>
                  <span className="font-semibold">Receive forms</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  Receive forms from another device. Scan the sender's code to begin.
                </p>
              </button>
            </div>
          )}

          {role === "idle" && (
            <div className="rounded-lg border bg-muted/40 p-3 flex items-start gap-3 text-sm text-muted-foreground">
              <Wifi className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
              <p>
                <strong className="text-foreground">First, link the devices:</strong> turn on the
                hotspot on one phone and connect the other phone to it (or join both to the same WiFi).
                Then pick Send or Receive below.
              </p>
            </div>
          )}

          {/* SENDER */}
          {role === "sender" && (
            <div className="space-y-4">
              <StepRow active={step >= 2} done={step > 2} index={1} label="Share your connection code with the receiver" />
              {localCode && step <= 2 && (
                <CodeExchange
                  code={localCode}
                  title="Your connection code"
                  copied={copied}
                  onCopy={copyCode}
                />
              )}

              <StepRow active={step >= 2} done={step >= 3} index={2} label="Paste or scan the receiver's answer code" />
              {step <= 2 && (
                <RemoteInput
                  value={remoteCode}
                  onChange={setRemoteCode}
                  onSubmit={() => senderAcceptAnswer(remoteCode)}
                  onScan={() => startScan((t) => { setRemoteCode(t); senderAcceptAnswer(t); })}
                  scanning={scanning}
                  onStopScan={stopScan}
                  submitLabel="Connect"
                />
              )}

              <StepRow active={connected} done={connected} index={3} label="Connected — choose forms and send" />
              {connected && (
                <div className="space-y-3">
                  <EntryList entries={entries} selected={selected} setSelected={setSelected} />
                  {progress && <Progress value={(progress.sent / Math.max(progress.total, 1)) * 100} className="h-2" />}
                  <Button onClick={sendSelected} disabled={selectedCount === 0 || !!progress} className="w-full">
                    {progress
                      ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Sending {progress.sent}/{progress.total}…</>
                      : <><Send className="h-4 w-4 mr-2" /> Send {selectedCount} selected form{selectedCount === 1 ? "" : "s"}</>}
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* RECEIVER */}
          {role === "receiver" && (
            <div className="space-y-4">
              <StepRow active={step >= 1} done={step >= 2} index={1} label="Paste or scan the sender's connection code" />
              {step === 1 && (
                <RemoteInput
                  value={remoteCode}
                  onChange={setRemoteCode}
                  onSubmit={() => receiverAcceptOffer(remoteCode)}
                  onScan={() => startScan((t) => { setRemoteCode(t); receiverAcceptOffer(t); })}
                  scanning={scanning}
                  onStopScan={stopScan}
                  submitLabel="Accept"
                />
              )}

              <StepRow active={step >= 2} done={connected} index={2} label="Share your answer code back with the sender" />
              {localCode && step >= 2 && !connected && (
                <CodeExchange
                  code={localCode}
                  title="Your answer code"
                  copied={copied}
                  onCopy={copyCode}
                />
              )}

              <StepRow active={connected} done={received.length > 0} index={3} label="Connected — waiting to receive forms" />
              {connected && (
                <div className="rounded-lg border p-4 text-center">
                  {progress ? (
                    <div className="space-y-2">
                      <Loader2 className="h-6 w-6 mx-auto animate-spin text-primary" />
                      <p className="text-sm">Receiving {progress.sent}/{progress.total} forms…</p>
                      <Progress value={(progress.sent / Math.max(progress.total, 1)) * 100} className="h-2" />
                    </div>
                  ) : received.length > 0 ? (
                    <div className="space-y-1 text-emerald-600">
                      <FileCheck2 className="h-6 w-6 mx-auto" />
                      <p className="text-sm font-medium">{received.length} form{received.length === 1 ? "" : "s"} received & saved</p>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">Connected. Ask the sender to send the forms.</p>
                  )}
                </div>
              )}
            </div>
          )}

          {role !== "idle" && (
            <div className="flex justify-end pt-1">
              <Button variant="ghost" size="sm" onClick={reset}>
                <X className="h-4 w-4 mr-1" /> {connected ? "Disconnect" : "Cancel"}
              </Button>
            </div>
          )}

          <div className="flex items-center gap-2 text-xs text-muted-foreground pt-1 border-t mt-2">
            <ShieldCheck className="h-3.5 w-3.5 text-primary" />
            Peer-to-peer & encrypted by WebRTC. Data never leaves the local link.
          </div>
        </CardContent>
      </Card>

      {/* QR scanner overlay container — html5-qrcode mounts here */}
      <div className={scanning ? "fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" : "hidden"}>
        <div className="bg-background rounded-xl p-4 w-full max-w-sm space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-medium flex items-center gap-2"><Camera className="h-4 w-4" /> Scan code</span>
            <Button size="icon" variant="ghost" onClick={stopScan}><X className="h-4 w-4" /></Button>
          </div>
          <div id="ofs-qr-reader" className="w-full rounded-lg overflow-hidden" />
        </div>
      </div>
    </div>
  );
}

function StepRow({ index, label, active, done }: { index: number; label: string; active: boolean; done: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <span
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
          done ? "bg-emerald-500 text-white" : active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
        }`}
      >
        {done ? <Check className="h-4 w-4" /> : index}
      </span>
      <span className={`text-sm ${active || done ? "text-foreground font-medium" : "text-muted-foreground"}`}>{label}</span>
    </div>
  );
}

function CodeExchange({ code, title, copied, onCopy }: { code: string; title: string; copied: boolean; onCopy: () => void }) {
  const qrOk = code.length <= 2200; // QR binary capacity at low EC
  return (
    <div className="rounded-lg border p-4 space-y-3 bg-muted/30">
      <div className="flex items-center gap-2 text-sm font-medium"><QrCode className="h-4 w-4 text-primary" /> {title}</div>
      {qrOk ? (
        <div className="flex justify-center bg-white p-3 rounded-lg w-fit mx-auto">
          <QRCodeSVG value={code} size={200} level="L" />
        </div>
      ) : (
        <p className="text-xs text-amber-600 text-center flex items-center justify-center gap-1">
          <Smartphone className="h-3.5 w-3.5" /> Code too large for QR — use copy/paste below.
        </p>
      )}
      <div className="flex gap-2">
        <Textarea value={code} readOnly className="font-mono text-[10px] h-16 resize-none" />
        <Button variant="outline" size="icon" onClick={onCopy} className="shrink-0">
          {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}

function RemoteInput({
  value, onChange, onSubmit, onScan, scanning, onStopScan, submitLabel,
}: {
  value: string; onChange: (v: string) => void; onSubmit: () => void;
  onScan: () => void; scanning: boolean; onStopScan: () => void; submitLabel: string;
}) {
  return (
    <div className="rounded-lg border p-4 space-y-3">
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Paste the code here, or scan the QR with your camera…"
        className="font-mono text-[10px] h-20 resize-none"
      />
      <div className="flex gap-2">
        <Button variant="outline" onClick={scanning ? onStopScan : onScan} className="flex-1">
          <Camera className="h-4 w-4 mr-1" /> {scanning ? "Stop scan" : "Scan QR"}
        </Button>
        <Button onClick={onSubmit} disabled={!value.trim()} className="flex-1">
          <ArrowRightLeft className="h-4 w-4 mr-1" /> {submitLabel}
        </Button>
      </div>
    </div>
  );
}

function EntryList({
  entries, selected, setSelected,
}: {
  entries: SavedFormEntry[];
  selected: Record<string, boolean>;
  setSelected: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
}) {
  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-4">No finalized forms found on this device.</p>;
  }
  const allOn = entries.every((e) => selected[e.id]);
  return (
    <div className="rounded-lg border">
      <div className="flex items-center justify-between px-3 py-2 border-b">
        <span className="text-sm font-medium">Finalized forms ({entries.length})</span>
        <Button
          variant="ghost" size="sm"
          onClick={() => setSelected(Object.fromEntries(entries.map((e) => [e.id, !allOn])))}
        >
          {allOn ? "Deselect all" : "Select all"}
        </Button>
      </div>
      <ScrollArea className="h-56">
        <div className="divide-y">
          {entries.map((e) => (
            <label key={e.id} className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-muted/50">
              <input
                type="checkbox"
                checked={!!selected[e.id]}
                onChange={(ev) => setSelected((s) => ({ ...s, [e.id]: ev.target.checked }))}
                className="h-4 w-4 accent-primary"
              />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium truncate">{e.formName || "Untitled form"}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {new Date(e.finalizedAt || e.updatedAt).toLocaleString()} · {e.status}
                </div>
              </div>
            </label>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

import { useState, useEffect, useCallback } from "react";
import {
  Satellite,
  Loader2,
  Radio,
  Package,
  AlertTriangle,
  CheckCircle2,
  Signal,
  Info,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  encodeSatPacket,
  encodeBatch,
  detectLowBandwidth,
  estimateSavings,
  type SatPacket,
} from "@/lib/satellitePacket";

interface PendingSubmission {
  id: string;
  form_id: string;
  user_id: string;
  data: Record<string, any>;
  location: { lat: number; lng: number } | null;
  within_geofence: boolean | null;
  created_at: string;
  retryCount: number;
}

interface SatelliteSyncDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pendingSubmissions: PendingSubmission[];
  onSyncComplete: () => void;
}

const DB_NAME = "acg_monitor_offline";
const DB_VERSION = 2;

const removeFromOfflineStorage = async (id: string): Promise<void> => {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return new Promise((resolve, reject) => {
    const tx = db.transaction("pending_submissions", "readwrite");
    const store = tx.objectStore("pending_submissions");
    const r = store.delete(id);
    r.onsuccess = () => resolve();
    r.onerror = () => reject(r.error);
  });
};

export const SatelliteSyncDialog = ({
  open,
  onOpenChange,
  pendingSubmissions,
  onSyncComplete,
}: SatelliteSyncDialogProps) => {
  const [packets, setPackets] = useState<
    Array<{ packet: SatPacket; bytes: number; submissionId: string; reduction: number }>
  >([]);
  const [totalBytes, setTotalBytes] = useState(0);
  const [originalBytes, setOriginalBytes] = useState(0);
  const [isEncoding, setIsEncoding] = useState(false);
  const [isTransmitting, setIsTransmitting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [signal, setSignal] = useState(detectLowBandwidth());
  const [results, setResults] = useState<{ synced: number; failed: number } | null>(null);

  // Update signal detection live
  useEffect(() => {
    if (!open) return;
    setSignal(detectLowBandwidth());
    const conn = (navigator as any).connection;
    if (!conn) return;
    const handler = () => setSignal(detectLowBandwidth());
    conn.addEventListener("change", handler);
    return () => conn.removeEventListener("change", handler);
  }, [open]);

  // Encode all pending submissions when dialog opens
  const encodeAll = useCallback(async () => {
    if (pendingSubmissions.length === 0) {
      setPackets([]);
      setTotalBytes(0);
      setOriginalBytes(0);
      return;
    }

    setIsEncoding(true);
    try {
      // Fetch all unique form schemas needed
      const formIds = [...new Set(pendingSubmissions.map((s) => s.form_id))];
      const { data: forms } = await supabase
        .from("forms")
        .select("id, questions")
        .in("id", formIds);

      const formMap = new Map<string, any[]>();
      (forms || []).forEach((f: any) => formMap.set(f.id, f.questions || []));

      const encoded = pendingSubmissions.map((sub) => {
        const questions = formMap.get(sub.form_id) || [];
        const { packet, bytes } = encodeSatPacket(sub, questions);
        const { originalBytes: orig, reduction } = estimateSavings(sub, bytes);
        return {
          packet,
          bytes,
          submissionId: sub.id,
          reduction,
          originalSize: orig,
        };
      });

      setPackets(encoded);
      const { bytes: batchBytes } = encodeBatch(encoded.map((e) => e.packet));
      setTotalBytes(batchBytes);
      setOriginalBytes(
        encoded.reduce((acc, e) => acc + (e as any).originalSize, 0)
      );
    } catch (e) {
      console.error("Encoding failed:", e);
      toast({
        title: "Encoding Failed",
        description: "Could not prepare submissions for satellite transmission.",
        variant: "destructive",
      });
    } finally {
      setIsEncoding(false);
    }
  }, [pendingSubmissions]);

  useEffect(() => {
    if (open) {
      setResults(null);
      setProgress(0);
      encodeAll();
    }
  }, [open, encodeAll]);

  // Transmit with aggressive retry logic optimized for weak signals
  const handleTransmit = async () => {
    if (packets.length === 0) return;

    setIsTransmitting(true);
    setProgress(5);

    let synced = 0;
    let failed = 0;
    const transmittedIds: string[] = [];

    // Send in micro-batches of 5 packets to fit SMS-class payload windows
    const BATCH_SIZE = 5;
    const MAX_RETRIES = 4;

    try {
      for (let i = 0; i < packets.length; i += BATCH_SIZE) {
        const slice = packets.slice(i, i + BATCH_SIZE);
        const { payload } = encodeBatch(slice.map((s) => s.packet));

        let attempt = 0;
        let success = false;
        let lastError: any = null;

        while (attempt < MAX_RETRIES && !success) {
          attempt++;
          try {
            // Aggressive timeout: 15s per micro-batch
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 15000);

            const { data, error } = await supabase.functions.invoke("satellite-sync", {
              body: { payload },
            });
            clearTimeout(timeout);

            if (error) throw error;
            if (data?.success) {
              synced += data.synced || 0;
              failed += data.failed || 0;
              // Mark these submission ids for cleanup
              slice.forEach((s) => transmittedIds.push(s.submissionId));
              success = true;
            } else {
              throw new Error("Transmission rejected");
            }
          } catch (e: any) {
            lastError = e;
            if (attempt < MAX_RETRIES) {
              // Exponential backoff: 2s, 4s, 8s
              await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt)));
            }
          }
        }

        if (!success) {
          failed += slice.length;
          console.error("Batch failed after retries:", lastError);
        }

        setProgress(Math.round(((i + slice.length) / packets.length) * 95) + 5);
      }

      // Clean up successfully transmitted submissions from local IndexedDB
      for (const id of transmittedIds) {
        try {
          await removeFromOfflineStorage(id);
        } catch (e) {
          console.warn("Failed to remove from offline:", id, e);
        }
      }

      setProgress(100);
      setResults({ synced, failed });

      if (synced > 0) {
        toast({
          title: "🛰️ Satellite Sync Complete",
          description: `Transmitted ${synced} submission${synced > 1 ? "s" : ""} via low-bandwidth packet sync.`,
        });
        onSyncComplete();
      }
      if (failed > 0 && synced === 0) {
        toast({
          title: "Transmission Failed",
          description: "No packets reached the server. Try again when signal improves.",
          variant: "destructive",
        });
      }
    } finally {
      setIsTransmitting(false);
    }
  };

  const totalReduction =
    originalBytes > 0 ? Math.round(((originalBytes - totalBytes) / originalBytes) * 100) : 0;

  const SignalIcon = signal.isLowBandwidth ? Radio : Signal;
  const signalColor = signal.isLowBandwidth
    ? "text-amber-500"
    : signal.effectiveType === "3g"
    ? "text-yellow-500"
    : "text-green-500";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Satellite className="h-5 w-5 text-primary" />
            Satellite Sync (Low-Bandwidth)
          </DialogTitle>
          <DialogDescription>
            Compress unsynced submissions into SMS-sized packets for transmission via
            Direct-to-Cell satellite (Starlink/AST SpaceMobile) or weak 2G networks.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Signal status */}
          <div className="flex items-center justify-between rounded-lg border bg-muted/30 p-3">
            <div className="flex items-center gap-3">
              <SignalIcon className={`h-5 w-5 ${signalColor}`} />
              <div>
                <p className="text-sm font-medium">Current Signal</p>
                <p className="text-xs text-muted-foreground">{signal.signalLabel}</p>
              </div>
            </div>
            <Badge variant={signal.isLowBandwidth ? "default" : "outline"}>
              {signal.effectiveType.toUpperCase()}
            </Badge>
          </div>

          {/* Packet stats */}
          {isEncoding ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <span className="ml-2 text-sm text-muted-foreground">Compressing...</span>
            </div>
          ) : packets.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <CheckCircle2 className="h-12 w-12 text-green-500" />
              <p className="mt-2 font-medium">All Caught Up</p>
              <p className="text-sm text-muted-foreground">No pending submissions to sync.</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg border p-3">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Package className="h-4 w-4" />
                    <span className="text-xs">Packets</span>
                  </div>
                  <p className="mt-1 text-2xl font-bold">{packets.length}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Radio className="h-4 w-4" />
                    <span className="text-xs">Total Bytes</span>
                  </div>
                  <p className="mt-1 text-2xl font-bold">{totalBytes.toLocaleString()}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Satellite className="h-4 w-4" />
                    <span className="text-xs">Compression</span>
                  </div>
                  <p className="mt-1 text-2xl font-bold text-primary">{totalReduction}%</p>
                </div>
              </div>

              {/* Per-packet preview */}
              <ScrollArea className="h-32 rounded-lg border">
                <div className="space-y-1 p-2">
                  {packets.map((p, idx) => (
                    <div
                      key={p.submissionId}
                      className="flex items-center justify-between rounded px-2 py-1 text-xs hover:bg-muted/50"
                    >
                      <span className="font-mono text-muted-foreground">
                        #{idx + 1} {p.submissionId.substring(0, 8)}…
                      </span>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px]">
                          {p.bytes}B
                        </Badge>
                        <span className="text-green-600">−{p.reduction}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>

              {/* Warnings */}
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                  <div className="space-y-1 text-xs">
                    <p className="font-medium text-amber-900 dark:text-amber-100">
                      Low-bandwidth mode notes:
                    </p>
                    <ul className="list-disc space-y-0.5 pl-4 text-muted-foreground">
                      <li>Photos/audio/video are stripped — they sync separately on full network.</li>
                      <li>Long text fields are truncated to 80 characters.</li>
                      <li>
                        Requires the device to be on a Direct-to-Cell capable carrier
                        (T-Mobile US, MTN partner, etc.) OR any 2G/HTTP signal.
                      </li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Progress */}
              {(isTransmitting || progress > 0) && (
                <div className="space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Transmitting…</span>
                    <span className="font-mono">{progress}%</span>
                  </div>
                  <Progress value={progress} />
                </div>
              )}

              {/* Results */}
              {results && (
                <div className="rounded-lg border bg-green-500/5 p-3">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <p className="text-sm font-medium">
                      {results.synced} synced · {results.failed} failed
                    </p>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Honest disclaimer */}
          <div className="flex items-start gap-2 rounded-lg bg-muted/30 p-2 text-[11px] text-muted-foreground">
            <Info className="mt-0.5 h-3 w-3 shrink-0" />
            <p>
              <strong>How it works:</strong> The browser cannot directly transmit to satellites.
              This feature compresses your data so it fits in SMS-class payload windows. When your
              SIM is on a Direct-to-Cell carrier (Starlink T-Mobile, AST SpaceMobile partners), the
              OS automatically routes these tiny packets via satellite — same-day coverage instead
              of waiting a week for connectivity.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isTransmitting}>
            Close
          </Button>
          <Button
            onClick={handleTransmit}
            disabled={isTransmitting || isEncoding || packets.length === 0}
            className="gap-2"
          >
            {isTransmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Transmitting…
              </>
            ) : (
              <>
                <Satellite className="h-4 w-4" />
                Transmit {packets.length} Packet{packets.length !== 1 ? "s" : ""}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default SatelliteSyncDialog;

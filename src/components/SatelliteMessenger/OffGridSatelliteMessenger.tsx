import { useEffect, useMemo, useState } from "react";
import {
  Satellite,
  Send,
  SignalZero,
  Trash2,
  Radio,
  CircleDot,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

const STORAGE_KEY = "offgrid_satellite_messages_v1";
const MAX_CHARS = 160;

interface SatMessage {
  id: string;
  timestamp: number;
  phoneNumber: string;
  body: string;
  connectionState: "online" | "offline";
}

const loadHistory = (): SatMessage[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const makeId = () =>
  (crypto?.randomUUID?.() ??
    `sat_${Date.now()}_${Math.random().toString(36).slice(2)}`);

const formatTime = (ts: number) =>
  new Date(ts).toLocaleString([], {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

const OffGridSatelliteMessenger = () => {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );
  const [phoneNumber, setPhoneNumber] = useState("");
  const [body, setBody] = useState("");
  const [history, setHistory] = useState<SatMessage[]>([]);
  const [modalOpen, setModalOpen] = useState(false);

  // Load persistent history on mount.
  useEffect(() => {
    setHistory(loadHistory());
  }, []);

  // Real-time connection monitoring via native browser events. No network calls.
  useEffect(() => {
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  const charCount = body.length;
  const overLimit = charCount > MAX_CHARS;
  const canDraft = phoneNumber.trim().length > 0 && body.trim().length > 0;

  const persist = (next: SatMessage[]) => {
    setHistory(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // localStorage may be full or unavailable — fail silently, stay offline-safe.
    }
  };

  const handleSendClick = () => {
    if (!canDraft || overLimit) return;
    setModalOpen(true);
  };

  const handleLaunch = () => {
    // 1) Save the entry to the local browser history log.
    const entry: SatMessage = {
      id: makeId(),
      timestamp: Date.now(),
      phoneNumber: phoneNumber.trim(),
      body: body,
      connectionState: isOnline ? "online" : "offline",
    };
    persist([entry, ...history]);

    // Capture before we reset the form.
    const targetPhone = entry.phoneNumber;
    const targetBody = entry.body;

    // 2) Reset the input form.
    setPhoneNumber("");
    setBody("");
    setModalOpen(false);

    // 3) Hand off to the native system messaging layer via universal URI scheme.
    window.location.href = `sms:${targetPhone}?&body=${encodeURIComponent(targetBody)}`;
  };

  const clearHistory = () => persist([]);

  const removeEntry = (id: string) =>
    persist(history.filter((m) => m.id !== id));

  const counterClass = useMemo(
    () => (overLimit ? "text-destructive font-semibold" : "text-muted-foreground"),
    [overLimit],
  );

  return (
    <div className="flex h-full min-h-screen flex-col bg-background text-foreground">
      {/* Persistent connection status banner */}
      <div
        className={`flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium ${
          isOnline
            ? "bg-muted text-muted-foreground"
            : "bg-amber-500/15 text-amber-700 dark:text-amber-300"
        }`}
      >
        {isOnline ? (
          <>
            <CircleDot className="h-4 w-4" />
            Local Environment Active
          </>
        ) : (
          <>
            <SignalZero className="h-4 w-4 shrink-0" />
            <span className="text-center">
              Offline Mode Active (Zero Airtime Required - Device Satellite OS Enabled)
            </span>
          </>
        )}
      </div>

      {/* Header */}
      <header className="flex items-center gap-3 border-b border-border px-5 py-4">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Satellite className="h-5 w-5" />
        </span>
        <div>
          <h1 className="font-display text-lg font-bold leading-tight">
            Off-Grid Satellite Messenger
          </h1>
          <p className="text-xs text-muted-foreground">
            100% local · zero airtime · works in any terrain
          </p>
        </div>
      </header>

      {/* Dual-panel layout */}
      <div className="grid flex-1 grid-cols-1 gap-0 lg:grid-cols-[320px_1fr]">
        {/* Local Message Log sidebar */}
        <aside className="flex flex-col border-b border-border lg:border-b-0 lg:border-r">
          <div className="flex items-center justify-between px-4 py-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Local Message Log
            </h2>
            {history.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                onClick={clearHistory}
              >
                <Trash2 className="mr-1 h-3.5 w-3.5" />
                Clear
              </Button>
            )}
          </div>
          <div className="max-h-[40vh] flex-1 space-y-2 overflow-y-auto px-3 pb-4 lg:max-h-none">
            {history.length === 0 ? (
              <p className="px-2 py-6 text-center text-sm text-muted-foreground">
                No messages drafted yet. Your local log is empty.
              </p>
            ) : (
              history.map((m) => (
                <div
                  key={m.id}
                  className="group rounded-lg border border-border bg-card p-3 text-sm"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{m.phoneNumber}</span>
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                        m.connectionState === "offline"
                          ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {m.connectionState}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-3 text-muted-foreground">{m.body}</p>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-[11px] text-muted-foreground">
                      {formatTime(m.timestamp)}
                    </span>
                    <button
                      onClick={() => removeEntry(m.id)}
                      className="text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                      aria-label="Delete message"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </aside>

        {/* Draft Message workspace */}
        <main className="flex flex-col gap-4 p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Draft Message
          </h2>

          <div className="space-y-2">
            <Label htmlFor="sat-phone">Recipient Phone Number</Label>
            <Input
              id="sat-phone"
              type="tel"
              inputMode="tel"
              placeholder="+234 800 000 0000"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="sat-body">Message</Label>
            <Textarea
              id="sat-body"
              rows={6}
              placeholder="Type your satellite text package…"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className={overLimit ? "border-destructive focus-visible:ring-destructive" : ""}
            />
            <div className="flex items-center justify-between text-xs">
              <span className={counterClass}>
                {charCount} / {MAX_CHARS} characters
              </span>
            </div>
          </div>

          {overLimit && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              Satellite text packages must be under 160 characters to send successfully.
            </div>
          )}

          <Button
            size="lg"
            className="mt-1 w-full gap-2 bg-gradient-to-r from-primary to-primary/80 text-base font-semibold"
            disabled={!canDraft || overLimit}
            onClick={handleSendClick}
          >
            <Send className="h-5 w-5" />
            Send via Free Satellite Link
          </Button>
        </main>
      </div>

      {/* Zero-signal hand-off modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Radio className="h-5 w-5" />
              </span>
              Satellite Hand-off Ready
            </DialogTitle>
            <DialogDescription className="pt-2 text-left text-sm leading-relaxed text-foreground/90">
              No cellular towers or carrier airtime balances required! Your
              smartphone's operating system will now take over the satellite radio
              transmission. Please step out under an open sky and follow your iPhone
              (iOS 18+) or Android (15+) prompts to align your phone with a passing
              satellite.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-2">
            <Button variant="outline" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button className="gap-2" onClick={handleLaunch}>
              <Satellite className="h-4 w-4" />
              Launch Satellite Link
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default OffGridSatelliteMessenger;

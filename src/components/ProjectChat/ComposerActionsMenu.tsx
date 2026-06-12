import { useState } from "react";
import {
  Plus,
  BarChart3,
  MapPin,
  CalendarPlus,
  X,
  Loader2,
  Check,
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/hooks/use-toast";
import type {
  PollPayload,
  LocationPayload,
  EventPayload,
} from "./specialMessages";

interface ComposerActionsMenuProps {
  onSendPoll: (payload: PollPayload) => void;
  onSendLocation: (payload: LocationPayload) => void;
  onSendEvent: (payload: EventPayload) => void;
  disabled?: boolean;
}

export function ComposerActionsMenu({
  onSendPoll,
  onSendLocation,
  onSendEvent,
  disabled,
}: ComposerActionsMenuProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [pollOpen, setPollOpen] = useState(false);
  const [locationOpen, setLocationOpen] = useState(false);
  const [eventOpen, setEventOpen] = useState(false);

  const open = (which: "poll" | "location" | "event") => {
    setMenuOpen(false);
    if (which === "poll") setPollOpen(true);
    if (which === "location") setLocationOpen(true);
    if (which === "event") setEventOpen(true);
  };

  const items = [
    {
      key: "location" as const,
      label: "Location",
      icon: MapPin,
      color: "text-emerald-500 bg-emerald-500/10",
    },
    {
      key: "poll" as const,
      label: "Poll",
      icon: BarChart3,
      color: "text-amber-500 bg-amber-500/10",
    },
    {
      key: "event" as const,
      label: "Event",
      icon: CalendarPlus,
      color: "text-rose-500 bg-rose-500/10",
    },
  ];

  return (
    <>
      <Popover open={menuOpen} onOpenChange={setMenuOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10 flex-shrink-0 text-muted-foreground hover:text-foreground"
            disabled={disabled}
          >
            <Plus className="h-5 w-5" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          side="top"
          align="start"
          className="w-auto rounded-2xl p-3"
        >
          <div className="grid grid-cols-3 gap-3">
            {items.map((it) => {
              const Icon = it.icon;
              return (
                <button
                  key={it.key}
                  type="button"
                  onClick={() => open(it.key)}
                  className="flex flex-col items-center gap-1.5 w-16"
                >
                  <span
                    className={`flex h-12 w-12 items-center justify-center rounded-full ${it.color}`}
                  >
                    <Icon className="h-6 w-6" />
                  </span>
                  <span className="text-xs text-foreground">{it.label}</span>
                </button>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>

      <PollDialog
        open={pollOpen}
        onOpenChange={setPollOpen}
        onSubmit={onSendPoll}
      />
      <LocationDialog
        open={locationOpen}
        onOpenChange={setLocationOpen}
        onSubmit={onSendLocation}
      />
      <EventDialog
        open={eventOpen}
        onOpenChange={setEventOpen}
        onSubmit={onSendEvent}
      />
    </>
  );
}

/* ───────────────────────── Poll ───────────────────────── */
function PollDialog({
  open,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSubmit: (p: PollPayload) => void;
}) {
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState<string[]>(["", ""]);
  const [allowMultiple, setAllowMultiple] = useState(false);

  const reset = () => {
    setQuestion("");
    setOptions(["", ""]);
    setAllowMultiple(false);
  };

  const setOption = (i: number, v: string) =>
    setOptions((prev) => prev.map((o, idx) => (idx === i ? v : o)));

  const addOption = () => setOptions((prev) => [...prev, ""]);
  const removeOption = (i: number) =>
    setOptions((prev) => prev.filter((_, idx) => idx !== i));

  const submit = () => {
    const clean = options.map((o) => o.trim()).filter(Boolean);
    if (!question.trim()) {
      toast({ title: "Add a question", variant: "destructive" });
      return;
    }
    if (clean.length < 2) {
      toast({ title: "Add at least two options", variant: "destructive" });
      return;
    }
    onSubmit({
      kind: "poll",
      question: question.trim(),
      options: clean,
      allowMultiple,
    });
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      <DialogContent className="max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle>Create poll</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Question</Label>
            <Input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Ask question"
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label>Options</Label>
            {options.map((opt, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  value={opt}
                  onChange={(e) => setOption(i, e.target.value)}
                  placeholder={`Option ${i + 1}`}
                />
                {options.length > 2 && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 shrink-0"
                    onClick={() => removeOption(i)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
            {options.length < 12 && (
              <Button variant="outline" size="sm" onClick={addOption} className="w-full">
                <Plus className="h-4 w-4 mr-1" /> Add option
              </Button>
            )}
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="poll-multi">Allow multiple answers</Label>
            <Switch
              id="poll-multi"
              checked={allowMultiple}
              onCheckedChange={setAllowMultiple}
            />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={submit} className="w-full sm:w-auto">
            <Check className="h-4 w-4 mr-1" /> Send poll
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ───────────────────────── Location ───────────────────────── */
function LocationDialog({
  open,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSubmit: (p: LocationPayload) => void;
}) {
  const [coords, setCoords] = useState<
    { lat: number; lng: number; accuracy: number } | null
  >(null);
  const [loading, setLoading] = useState(false);
  const [refining, setRefining] = useState(false);
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const watchRef = useState<{ id: number | null }>(() => ({ id: null }))[0];

  const stopWatch = () => {
    if (watchRef.id !== null) {
      navigator.geolocation.clearWatch(watchRef.id);
      watchRef.id = null;
    }
  };

  const capture = () => {
    setLoading(true);
    setRefining(false);
    setError(null);
    if (!navigator.geolocation) {
      setError("Geolocation is not supported on this device.");
      setLoading(false);
      return;
    }

    const friendly = (err: GeolocationPositionError) => {
      if (err.code === err.PERMISSION_DENIED)
        return "Location permission denied. Please allow location access in your browser/OS settings, then try again.";
      if (err.code === err.POSITION_UNAVAILABLE)
        return "Location unavailable. Move near a window or outdoors and try again.";
      return "Couldn't get a precise fix — try again, ideally outdoors or on a mobile device.";
    };

    let best: { lat: number; lng: number; accuracy: number } | null = null;
    let gotAny = false;
    stopWatch();

    // watchPosition streams progressively better fixes as the GPS warms up.
    // We keep the most accurate reading and stop once it is good enough or
    // after a hard timeout, instead of trusting a single (often coarse) read.
    watchRef.id = navigator.geolocation.watchPosition(
      (pos) => {
        gotAny = true;
        const acc = pos.coords.accuracy ?? 9999;
        if (!best || acc < best.accuracy) {
          best = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: acc,
          };
          setCoords(best);
        }
        setLoading(false);
        setRefining(true);
        // Good enough — a typical phone GPS fix. Lock it in.
        if (acc <= 20) {
          stopWatch();
          setRefining(false);
        }
      },
      (err) => {
        if (!gotAny) {
          stopWatch();
          setError(friendly(err));
          setLoading(false);
          setRefining(false);
        }
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
    );

    // Hard stop after 18s — keep whatever best fix we accumulated.
    window.setTimeout(() => {
      stopWatch();
      setRefining(false);
      if (!gotAny) {
        // Last-chance coarse fix for desktops without GPS hardware.
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            setCoords({
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              accuracy: pos.coords.accuracy ?? 9999,
            });
            setLoading(false);
          },
          (err) => {
            setError(friendly(err));
            setLoading(false);
          },
          { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
        );
      }
    }, 18000);
  };

  const reset = () => {
    stopWatch();
    setCoords(null);
    setLabel("");
    setError(null);
    setLoading(false);
    setRefining(false);
  };

  const submit = () => {
    if (!coords) return;
    stopWatch();
    onSubmit({
      kind: "location",
      lat: coords.lat,
      lng: coords.lng,
      accuracy: Math.round(coords.accuracy),
      label: label.trim() || undefined,
    });
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      <DialogContent className="max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle>Send location</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {!coords ? (
            <div className="flex flex-col items-center justify-center py-6 text-center">
              <MapPin className="h-10 w-10 text-emerald-500 mb-3" />
              <p className="text-sm text-muted-foreground mb-4">
                Share your current location with the group.
              </p>
              <Button onClick={capture} disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" /> Locating…
                  </>
                ) : (
                  <>
                    <MapPin className="h-4 w-4 mr-1" /> Use current location
                  </>
                )}
              </Button>
              {error && (
                <p className="text-xs text-destructive mt-3">{error}</p>
              )}
            </div>
          ) : (
            <>
              <div className="overflow-hidden rounded-lg border border-border">
                <iframe
                  title="Location preview"
                  src={`https://www.openstreetmap.org/export/embed.html?bbox=${coords.lng - 0.004}%2C${coords.lat - 0.004}%2C${coords.lng + 0.004}%2C${coords.lat + 0.004}&layer=mapnik&marker=${coords.lat}%2C${coords.lng}`}
                  className="h-40 w-full"
                />
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground tabular-nums">
                  {coords.lat.toFixed(6)}, {coords.lng.toFixed(6)}
                </span>
                <span
                  className={`flex items-center gap-1 font-medium ${
                    refining
                      ? "text-amber-600"
                      : coords.accuracy <= 30
                        ? "text-emerald-600"
                        : "text-muted-foreground"
                  }`}
                >
                  {refining ? (
                    <>
                      <Loader2 className="h-3 w-3 animate-spin" /> Refining… ±
                      {Math.round(coords.accuracy)}m
                    </>
                  ) : (
                    <>±{Math.round(coords.accuracy)}m accuracy</>
                  )}
                </span>
              </div>
              <div className="space-y-1.5">
                <Label>Label (optional)</Label>
                <Input
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="e.g. Field site, Clinic entrance"
                />
              </div>
            </>
          )}
        </div>
        {coords && (
          <DialogFooter>
            <Button variant="outline" onClick={() => setCoords(null)}>
              Retry
            </Button>
            <Button onClick={submit}>
              <Check className="h-4 w-4 mr-1" /> Send location
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ───────────────────────── Event ───────────────────────── */
function EventDialog({
  open,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSubmit: (p: EventPayload) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [location, setLocation] = useState("");
  const [reminder, setReminder] = useState("1 hour before");
  const [allowGuests, setAllowGuests] = useState(false);

  const reset = () => {
    setName("");
    setDescription("");
    setDate("");
    setTime("");
    setEndTime("");
    setLocation("");
    setReminder("1 hour before");
    setAllowGuests(false);
  };

  const submit = () => {
    if (!name.trim()) {
      toast({ title: "Add an event name", variant: "destructive" });
      return;
    }
    if (!date || !time) {
      toast({ title: "Set a date and time", variant: "destructive" });
      return;
    }
    const startsAt = new Date(`${date}T${time}`).toISOString();
    const endsAt = endTime ? new Date(`${date}T${endTime}`).toISOString() : null;
    onSubmit({
      kind: "event",
      name: name.trim(),
      description: description.trim() || undefined,
      startsAt,
      endsAt,
      location: location.trim() || undefined,
      reminder: reminder || undefined,
      allowGuests,
    });
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      <DialogContent className="max-w-md rounded-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create event</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Event name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Event name"
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label>Description (optional)</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Description"
              rows={2}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Start time</Label>
              <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>End time (optional)</Label>
            <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Location (optional)</Label>
            <Input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Add location"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Reminder</Label>
            <select
              value={reminder}
              onChange={(e) => setReminder(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option>None</option>
              <option>10 minutes before</option>
              <option>30 minutes before</option>
              <option>1 hour before</option>
              <option>1 day before</option>
            </select>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="event-guests">Allow guests</Label>
              <p className="text-xs text-muted-foreground">
                Allow people to bring one additional guest
              </p>
            </div>
            <Switch
              id="event-guests"
              checked={allowGuests}
              onCheckedChange={setAllowGuests}
            />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={submit} className="w-full sm:w-auto">
            <Check className="h-4 w-4 mr-1" /> Send event
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

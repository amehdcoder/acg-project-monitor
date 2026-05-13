import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { MapPin, CheckCircle2, ShieldCheck, Loader2, Clock, AlertTriangle } from "lucide-react";
import { toast } from "@/hooks/use-toast";

function makeChallenge() {
  const a = Math.floor(Math.random() * 8) + 2;
  const b = Math.floor(Math.random() * 8) + 1;
  return { a, b, answer: a + b };
}

export default function CESWitnessForm() {
  const { surveyId, hhId } = useParams();
  const [gps, setGps] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState<{ at: Date } | null>(null);
  const [duplicate, setDuplicate] = useState<{ previousAt: Date; windowHours: number } | null>(null);
  const [rateLimited, setRateLimited] = useState(false);

  // Lightweight CAPTCHA + honeypot + min-time-on-page guard
  const challenge = useMemo(makeChallenge, []);
  const [captchaInput, setCaptchaInput] = useState("");
  const honeypotRef = useRef<HTMLInputElement>(null);
  const mountedAtRef = useRef<number>(Date.now());

  useEffect(() => {
    navigator.geolocation.getCurrentPosition(
      (pos) => setGps({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }),
      () => toast({ title: "GPS Required", description: "Please enable location services to verify.", variant: "destructive" }),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, []);

  const handleSubmit = async () => {
    if (!gps) {
      toast({ title: "Waiting for GPS", variant: "destructive" });
      return;
    }
    // Honeypot — bots fill hidden fields
    if (honeypotRef.current?.value) {
      setSubmitted({ at: new Date() }); // silently "succeed" to bots
      return;
    }
    // Min time on page — defeats instant scripted submits
    if (Date.now() - mountedAtRef.current < 2500) {
      toast({ title: "Please wait a moment", description: "Take a second to confirm before submitting.", variant: "destructive" });
      return;
    }
    // CAPTCHA
    if (parseInt(captchaInput, 10) !== challenge.answer) {
      toast({ title: "Verification check failed", description: "Please answer the math question correctly.", variant: "destructive" });
      return;
    }

    setLoading(true);
    setDuplicate(null);
    setRateLimited(false);
    try {
      const rawHash = `${navigator.userAgent}-${navigator.language}-${window.screen.width}x${window.screen.height}-${Intl.DateTimeFormat().resolvedOptions().timeZone}`;
      const hashBuffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(rawHash));
      const deviceHash = Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, "0")).join("");

      const { data, error } = await supabase.rpc("submit_witness_verification" as any, {
        _survey_id: surveyId,
        _household_id: hhId,
        _device_hash: deviceHash,
        _lat: gps.lat,
        _lng: gps.lng,
        _window_hours: 24,
      });

      if (error) throw error;
      const result = data as any;

      if (result?.duplicate) {
        setDuplicate({ previousAt: new Date(result.previous_at), windowHours: result.window_hours ?? 24 });
        return;
      }
      if (result?.rate_limited) {
        setRateLimited(true);
        return;
      }
      if (result?.ok) {
        setSubmitted({ at: new Date(result.at) });
        toast({ title: "Verification Successful!" });
      }
    } catch (e: any) {
      toast({ title: "Error submitting", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md text-center">
          <CardContent className="pt-6 pb-8 space-y-4">
            <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
              <CheckCircle2 className="h-8 w-8 text-green-600" />
            </div>
            <h1 className="text-xl font-bold">Verification Submitted</h1>
            <p className="text-sm text-muted-foreground">
              Thank you for helping verify this community coverage interview. Your submission has been securely recorded.
            </p>
            <div className="rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground inline-flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              Recorded {submitted.at.toLocaleString()}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <h1 className="sr-only">Community Witness Verification</h1>
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-2">
            <ShieldCheck className="h-6 w-6 text-primary" />
          </div>
          <CardTitle>Community Witness System</CardTitle>
          <CardDescription>Verify the surveyor's visit to this household.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert>
            <MapPin className="h-4 w-4" />
            <AlertTitle>Location Access</AlertTitle>
            <AlertDescription className="text-xs">
              {gps ? `GPS locked (±${Math.round(gps.accuracy)}m)` : "Locating your device..."}
            </AlertDescription>
          </Alert>

          {duplicate && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Already Verified</AlertTitle>
              <AlertDescription className="text-xs">
                This household was already verified from this device on{" "}
                {duplicate.previousAt.toLocaleString()}. You can verify again after {duplicate.windowHours} hours.
              </AlertDescription>
            </Alert>
          )}

          {rateLimited && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Too Many Submissions</AlertTitle>
              <AlertDescription className="text-xs">
                Please wait a few minutes before submitting another verification from this device.
              </AlertDescription>
            </Alert>
          )}

          {/* Honeypot — hidden from real users, bots will fill it */}
          <input
            ref={honeypotRef}
            type="text"
            name="website"
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
            style={{ position: "absolute", left: "-9999px", width: 1, height: 1, opacity: 0 }}
          />

          <div className="space-y-1.5">
            <Label htmlFor="captcha" className="text-xs">
              Quick check: what is {challenge.a} + {challenge.b}?
            </Label>
            <Input
              id="captcha"
              inputMode="numeric"
              pattern="[0-9]*"
              value={captchaInput}
              onChange={(e) => setCaptchaInput(e.target.value.replace(/\D/g, "").slice(0, 3))}
              placeholder="Enter the answer"
              className="h-11"
            />
          </div>

          <Button
            className="w-full h-12 text-base"
            onClick={handleSubmit}
            disabled={!gps || loading || captchaInput.length === 0}
          >
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            I Verify This Interview
          </Button>
          <p className="text-[10px] text-center text-muted-foreground">
            This action anonymously logs your current GPS coordinates to verify the interviewer is present at the
            community location. Duplicate submissions from the same device are blocked for 24 hours.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

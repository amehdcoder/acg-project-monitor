import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { MapPin, CheckCircle2, ShieldCheck, Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";

export default function CESWitnessForm() {
  const { surveyId, hhId } = useParams();
  const [gps, setGps] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    navigator.geolocation.getCurrentPosition(
      (pos) => setGps({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }),
      (err) => toast({ title: "GPS Required", description: "Please enable location services to verify.", variant: "destructive" }),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, []);

  const handleSubmit = async () => {
    if (!gps) {
      toast({ title: "Waiting for GPS", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const ts = new Date().toISOString();
      // Generate anonymous device hash
      const rawHash = `${navigator.userAgent}-${navigator.language}-${window.screen.width}x${window.screen.height}`;
      const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(rawHash));
      const deviceHash = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');

      await supabase.from("ces_witness_logs" as any).insert({
        survey_id: surveyId,
        household_id: hhId,
        witness_device_hash: deviceHash,
        witness_lat: gps.lat,
        witness_long: gps.lng,
        witness_timestamp: ts
      });

      setSubmitted(true);
      toast({ title: "Verification Successful!" });
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
            <h2 className="text-xl font-bold">Verification Submitted</h2>
            <p className="text-sm text-muted-foreground">Thank you for helping verify this community coverage interview.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
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
          
          <Button 
            className="w-full h-12 text-base" 
            onClick={handleSubmit} 
            disabled={!gps || loading}
          >
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            I Verify This Interview
          </Button>
          <p className="text-[10px] text-center text-muted-foreground">
            This action anonymously logs your current GPS coordinates to verify the interviewer is present at the community location.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

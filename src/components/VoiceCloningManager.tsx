import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Mic, MicOff, Trash2, Check, X, AudioLines, Volume2, UserCheck, AlertTriangle } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import {
  useVoiceRecorder,
  submitVoiceConsent,
  speakWithProfile,
  type VoiceFeatures,
} from "@/hooks/useVoiceCloning";

interface VoiceProfileRow {
  id: string;
  donor_user_id: string;
  donor_name: string;
  donor_email: string;
  consent_status: "pending" | "approved" | "declined" | "revoked";
  is_active: boolean;
  sample_path: string | null;
  voice_features: VoiceFeatures | null;
  requested_at: string;
}

interface UserOption {
  user_id: string;
  email: string;
  first_name: string;
  last_name: string;
}

const STATUS_BADGE: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; label: string }> = {
  pending: { variant: "outline", label: "Awaiting Consent" },
  approved: { variant: "default", label: "Consented" },
  declined: { variant: "destructive", label: "Declined" },
  revoked: { variant: "destructive", label: "Revoked" },
};

const VoiceCloningManager = () => {
  const { user, profile } = useAuth();
  const isOwner = !!profile?.is_owner;
  const [profiles, setProfiles] = useState<VoiceProfileRow[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [enrollingId, setEnrollingId] = useState<string | null>(null);
  const { isRecording, secondsLeft, record, cancel } = useVoiceRecorder(3);

  const fetchAll = async () => {
    setLoading(true);
    const [{ data: vp }, { data: us }] = await Promise.all([
      supabase.from("voice_profiles" as any).select("*").order("requested_at", { ascending: false }),
      supabase.from("profiles").select("user_id, email, first_name, last_name").eq("is_active", true).eq("approval_status", "approved").order("first_name"),
    ]);
    setProfiles((vp as any) || []);
    setUsers((us as any) || []);
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  // Realtime updates
  useEffect(() => {
    const ch = supabase
      .channel("voice-profiles-manager")
      .on("postgres_changes", { event: "*", schema: "public", table: "voice_profiles" }, fetchAll)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const handleRequest = async () => {
    if (!selectedUserId || !user) return;
    const target = users.find(u => u.user_id === selectedUserId);
    if (!target) return;
    setCreating(true);
    const { error } = await supabase.from("voice_profiles" as any).insert({
      donor_user_id: target.user_id,
      donor_name: `${target.first_name} ${target.last_name}`.trim(),
      donor_email: target.email,
      requested_by: user.id,
      consent_status: "pending",
    } as any);
    setCreating(false);
    if (error) {
      toast({ title: "Request failed", description: error.message, variant: "destructive" });
      return;
    }
    // Notify the donor
    await supabase.from("notifications").insert({
      user_id: target.user_id,
      title: "🎙️ Voice cloning request",
      message: `The owner has requested to use your voice as the app's TTS voice. Open Settings to consent and record a 3-second sample.`,
      type: "info",
      category: "voice_cloning",
    });
    toast({ title: "Request sent", description: `${target.first_name} will be notified to consent.` });
    setSelectedUserId("");
  };

  const handleEnroll = async (p: VoiceProfileRow) => {
    if (!user || user.id !== p.donor_user_id) {
      toast({ title: "Only the donor can record their voice", variant: "destructive" });
      return;
    }
    setEnrollingId(p.id);
    try {
      const blob = await record();
      await submitVoiceConsent(p.id, blob, user.id);
      fetchAll();
    } catch (e: any) {
      toast({ title: "Recording failed", description: e?.message || "Try again", variant: "destructive" });
    } finally {
      setEnrollingId(null);
    }
  };

  const handleDecline = async (p: VoiceProfileRow) => {
    await supabase.from("voice_profiles" as any).update({
      consent_status: "declined",
      is_active: false,
    }).eq("id", p.id);
    fetchAll();
  };

  const handleRevoke = async (p: VoiceProfileRow) => {
    await supabase.from("voice_profiles" as any).update({
      consent_status: "revoked",
      is_active: false,
    }).eq("id", p.id);
    fetchAll();
  };

  const handleActivate = async (p: VoiceProfileRow) => {
    if (!isOwner) return;
    // Deactivate all others, then activate this one
    await supabase.from("voice_profiles" as any).update({ is_active: false }).neq("id", p.id);
    await supabase.from("voice_profiles" as any).update({ is_active: true }).eq("id", p.id);
    toast({ title: "Voice activated", description: `${p.donor_name} is now the app TTS voice.` });
    fetchAll();
  };

  const handleDeactivate = async (p: VoiceProfileRow) => {
    await supabase.from("voice_profiles" as any).update({ is_active: false }).eq("id", p.id);
    fetchAll();
  };

  const handleDelete = async (p: VoiceProfileRow) => {
    if (p.sample_path) {
      await supabase.storage.from("voice-samples").remove([p.sample_path]);
    }
    await supabase.from("voice_profiles" as any).delete().eq("id", p.id);
    fetchAll();
  };

  const handlePreview = (p: VoiceProfileRow) => {
    if (!p.voice_features) return;
    speakWithProfile(
      `Hello, this is ${p.donor_name}. This is a preview of my cloned voice for the app's text to speech.`,
      { id: p.id, donorName: p.donor_name, donorEmail: p.donor_email, features: p.voice_features as VoiceFeatures }
    );
  };

  const myPendingProfile = profiles.find(p => p.donor_user_id === user?.id && p.consent_status === "pending");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <AudioLines className="h-5 w-5 text-primary" />
          Neural Voice Cloning
        </CardTitle>
        <CardDescription>
          Record a 3-second voice sample from any user (with their consent) and use it as the app's text-to-speech voice.
          Runs fully in-browser — no AI credits required.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Honest disclaimer */}
        <div className="flex gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs">
          <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-medium text-foreground">Honest accuracy note</p>
            <p className="text-muted-foreground">
              This uses browser-native voice character matching (pitch, rate, brightness) — not server-grade neural cloning.
              Output sounds like the donor's vocal style, but isn't photorealistic. True neural cloning (XTTS-v2) requires GPU servers.
            </p>
          </div>
        </div>

        {/* Donor self-enrollment if they have a pending request */}
        {myPendingProfile && (
          <div className="rounded-lg border-2 border-primary/40 bg-primary/5 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <UserCheck className="h-5 w-5 text-primary" />
              <p className="font-medium text-foreground">You've been asked to donate your voice</p>
            </div>
            <p className="text-sm text-muted-foreground">
              By recording, you consent to your voice being used as the TTS voice across the app's Form Filler & Voice Form Mode.
              You can revoke consent anytime.
            </p>
            <div className="flex flex-wrap gap-2">
              {!isRecording ? (
                <>
                  <Button onClick={() => handleEnroll(myPendingProfile)} disabled={enrollingId === myPendingProfile.id} className="gap-2">
                    <Mic className="h-4 w-4" /> Record 3-Second Sample
                  </Button>
                  <Button variant="outline" onClick={() => handleDecline(myPendingProfile)} className="gap-2">
                    <X className="h-4 w-4" /> Decline
                  </Button>
                </>
              ) : (
                <Button variant="destructive" onClick={cancel} className="gap-2">
                  <MicOff className="h-4 w-4 animate-pulse" /> Recording… {secondsLeft}s left (tap to cancel)
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Owner: request a new donor */}
        {isOwner && (
          <div className="rounded-lg border bg-card p-4 space-y-3">
            <Label className="text-sm font-medium">Request a new voice donor</Label>
            <div className="flex flex-col sm:flex-row gap-2">
              <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Choose any user (Super Admin, Systems Admin, or User)" />
                </SelectTrigger>
                <SelectContent>
                  {users
                    .filter(u => !profiles.some(p => p.donor_user_id === u.user_id && ["pending", "approved"].includes(p.consent_status)))
                    .map(u => (
                      <SelectItem key={u.user_id} value={u.user_id}>
                        {u.first_name} {u.last_name} — {u.email}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <Button onClick={handleRequest} disabled={!selectedUserId || creating}>
                {creating ? "Sending…" : "Request Consent"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              The donor will receive an in-app notification and must record their own voice — you cannot record on their behalf.
            </p>
          </div>
        )}

        {/* All profiles list */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">Voice profiles ({profiles.length})</Label>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : profiles.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">No voice profiles yet.</p>
          ) : (
            <div className="space-y-2">
              {profiles.map(p => {
                const status = STATUS_BADGE[p.consent_status];
                return (
                  <div key={p.id} className="rounded-lg border bg-card p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div className="flex-1 min-w-[200px]">
                        <p className="font-medium text-sm text-foreground">{p.donor_name}</p>
                        <p className="text-xs text-muted-foreground">{p.donor_email}</p>
                      </div>
                      <div className="flex gap-1.5 items-center">
                        {p.is_active && (
                          <Badge className="bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/30 gap-1">
                            <Volume2 className="h-3 w-3" /> Active
                          </Badge>
                        )}
                        <Badge variant={status.variant}>{status.label}</Badge>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {p.consent_status === "approved" && p.voice_features && (
                        <Button variant="outline" size="sm" onClick={() => handlePreview(p)} className="gap-1.5">
                          <Volume2 className="h-3.5 w-3.5" /> Preview
                        </Button>
                      )}
                      {isOwner && p.consent_status === "approved" && !p.is_active && (
                        <Button size="sm" onClick={() => handleActivate(p)} className="gap-1.5">
                          <Check className="h-3.5 w-3.5" /> Set as App Voice
                        </Button>
                      )}
                      {isOwner && p.is_active && (
                        <Button variant="outline" size="sm" onClick={() => handleDeactivate(p)} className="gap-1.5">
                          <X className="h-3.5 w-3.5" /> Deactivate
                        </Button>
                      )}
                      {p.donor_user_id === user?.id && p.consent_status === "approved" && (
                        <Button variant="outline" size="sm" onClick={() => handleRevoke(p)} className="gap-1.5">
                          Revoke My Consent
                        </Button>
                      )}
                      {(isOwner || p.donor_user_id === user?.id) && (
                        <Button variant="ghost" size="sm" onClick={() => handleDelete(p)} className="gap-1.5 text-destructive hover:text-destructive">
                          <Trash2 className="h-3.5 w-3.5" /> Delete
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default VoiceCloningManager;

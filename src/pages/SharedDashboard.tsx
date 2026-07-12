import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Loader2, ShieldAlert, Mail, Lock, Eye, KeyRound } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  PublicShare, ResolveStatus, clearStoredSession, requestShareOtp, resolveShare, verifyShareOtp,
} from "@/lib/dashboardShare";
import { rememberDeepLink } from "@/lib/deepLinkIntent";
import SharedDashboardRenderer from "@/components/dashboard/SharedDashboardRenderer";

type Stage = "loading" | "gated" | "granted" | "error";

const Shell = ({ children }: { children: React.ReactNode }) => (
  <div className="min-h-[100dvh] bg-gradient-to-b from-slate-50 to-slate-100 flex items-center justify-center p-4">
    {children}
  </div>
);

export default function SharedDashboard() {
  const { token = "" } = useParams();
  const [stage, setStage] = useState<Stage>("loading");
  const [status, setStatus] = useState<ResolveStatus | null>(null);
  const [share, setShare] = useState<PublicShare | null>(null);

  // OTP flow
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const resolve = useCallback(async () => {
    setStage("loading");
    try {
      const res = await resolveShare(token);
      setStatus(res.status);
      setShare(res.share ?? null);
      if (res.status === "granted") setStage("granted");
      else if (["not_found", "revoked", "forbidden"].includes(res.status)) setStage("error");
      else setStage("gated");
    } catch {
      setStatus("not_found");
      setStage("error");
    }
  }, [token]);

  useEffect(() => { void resolve(); }, [resolve]);

  const sendOtp = async () => {
    if (!email.trim()) { toast.error("Enter your email"); return; }
    setBusy(true);
    try {
      await requestShareOtp(token, email.trim());
      setOtpSent(true);
      toast.success("If your email is authorized, a code is on its way.");
    } catch {
      toast.error("Could not send the code. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const verifyOtp = async () => {
    if (!/^\d{6}$/.test(code.trim())) { toast.error("Enter the 6-digit code"); return; }
    setBusy(true);
    try {
      const res = await verifyShareOtp(token, email.trim(), code.trim());
      if (res.status === "granted") {
        setShare(res.share ?? share);
        setStage("granted");
      } else if (res.status === "expired") toast.error("That code has expired. Request a new one.");
      else if (res.status === "too_many_attempts") toast.error("Too many attempts. Request a new code.");
      else toast.error("Invalid code. Please check and try again.");
    } catch {
      toast.error("Verification failed. Try again.");
    } finally {
      setBusy(false);
    }
  };

  // ---- render states ----
  if (stage === "loading") {
    return (
      <Shell>
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="h-7 w-7 animate-spin" />
          <p className="text-sm">Opening shared dashboard…</p>
        </div>
      </Shell>
    );
  }

  if (stage === "error") {
    const map: Record<string, { title: string; msg: string }> = {
      not_found: { title: "Link not found", msg: "This share link doesn't exist or was removed." },
      revoked: { title: "Access revoked", msg: "This share link has been disabled or has expired." },
      forbidden: { title: "Not authorized", msg: "Your account role isn't permitted to view this dashboard." },
    };
    const info = map[status ?? "not_found"] ?? map.not_found;
    return (
      <Shell>
        <Card className="w-full max-w-md border-0 shadow-lg">
          <CardHeader className="text-center pt-8">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
              <ShieldAlert className="h-7 w-7 text-destructive" />
            </div>
            <CardTitle>{info.title}</CardTitle>
            <CardDescription>{info.msg}</CardDescription>
          </CardHeader>
          <CardContent className="pb-8">
            {status === "revoked" && (
              <Button variant="outline" className="w-full" onClick={() => { clearStoredSession(token); void resolve(); }}>
                Try again
              </Button>
            )}
          </CardContent>
        </Card>
      </Shell>
    );
  }

  if (stage === "gated") {
    if (status === "needs_login") {
      const returnTo = encodeURIComponent(`/shared/dashboard/${token}`);
      return (
        <Shell>
          <Card className="w-full max-w-md border-0 shadow-lg">
            <CardHeader className="text-center pt-8">
              <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
                <Lock className="h-7 w-7 text-primary" />
              </div>
              <CardTitle>Sign in required</CardTitle>
              <CardDescription>
                {share?.label ?? "This dashboard"} is shared with internal team members. Sign in to continue.
              </CardDescription>
            </CardHeader>
            <CardContent className="pb-8">
              <Button className="w-full" onClick={() => { window.location.href = `/auth?returnTo=${returnTo}`; }}>
                Sign in
              </Button>
            </CardContent>
          </Card>
        </Shell>
      );
    }

    // needs_otp
    return (
      <Shell>
        <Card className="w-full max-w-md border-0 shadow-lg">
          <CardHeader className="text-center pt-8">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
              {otpSent ? <KeyRound className="h-7 w-7 text-primary" /> : <Mail className="h-7 w-7 text-primary" />}
            </div>
            <CardTitle>{otpSent ? "Enter your code" : "Verify your email"}</CardTitle>
            <CardDescription>
              {otpSent
                ? `We sent a 6-digit code to ${email}. It expires in 10 minutes.`
                : `${share?.label ?? "This dashboard"} is shared with specific people. Enter your email to receive a one-time code.`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pb-8">
            {!otpSent ? (
              <>
                <div className="space-y-1.5">
                  <Label>Email address</Label>
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && sendOtp()}
                    placeholder="you@example.org"
                  />
                </div>
                <Button className="w-full" onClick={sendOtp} disabled={busy}>
                  {busy && <Loader2 className="h-4 w-4 animate-spin mr-1" />} Send code
                </Button>
              </>
            ) : (
              <>
                <div className="space-y-1.5">
                  <Label>6-digit code</Label>
                  <Input
                    inputMode="numeric"
                    maxLength={6}
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                    onKeyDown={(e) => e.key === "Enter" && verifyOtp()}
                    placeholder="••••••"
                    className="text-center text-2xl tracking-[0.5em]"
                  />
                </div>
                <Button className="w-full" onClick={verifyOtp} disabled={busy}>
                  {busy && <Loader2 className="h-4 w-4 animate-spin mr-1" />} Verify &amp; open
                </Button>
                <Button variant="ghost" className="w-full" onClick={() => { setOtpSent(false); setCode(""); }}>
                  Use a different email
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </Shell>
    );
  }

  // granted
  return (
    <div className="min-h-[100dvh] bg-background">
      <div className="sticky top-0 z-50 flex items-center justify-between gap-2 bg-gradient-to-r from-[#0c2340] to-[#1a4a6e] px-4 py-2 text-white shadow">
        <div className="flex items-center gap-2 min-w-0">
          <Eye className="h-4 w-4 shrink-0" />
          <span className="text-sm font-medium truncate">
            {share?.label ?? "Shared dashboard"} · Read-only view
          </span>
        </div>
        <span className="text-[11px] text-blue-200 hidden sm:inline">Amehnities · Program Intelligence</span>
      </div>
      {share && <SharedDashboardRenderer share={share} />}
    </div>
  );
}

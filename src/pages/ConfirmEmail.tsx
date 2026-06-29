import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { Loader2, CheckCircle, AlertTriangle, MailCheck } from "lucide-react";
import acgLogo from "@/assets/acg-logo.png";

type Phase = "verifying" | "success" | "error";

const ConfirmEmail = () => {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>("verifying");
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [resendEmail, setResendEmail] = useState("");
  const [resending, setResending] = useState(false);
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;

    const run = async () => {
      const url = new URL(window.location.href);
      const hash = window.location.hash.startsWith("#")
        ? new URLSearchParams(window.location.hash.slice(1))
        : new URLSearchParams();

      // 1) Surface any explicit error coming back from the auth server.
      const errCode = url.searchParams.get("error_code") || url.searchParams.get("error") ||
        hash.get("error_code") || hash.get("error");
      const errDesc = url.searchParams.get("error_description") || hash.get("error_description");
      if (errCode) {
        setErrorMsg(
          errDesc
            ? decodeURIComponent(errDesc.replace(/\+/g, " "))
            : "This confirmation link is invalid or has expired.",
        );
        setPhase("error");
        window.history.replaceState(null, "", window.location.pathname);
        return;
      }

      try {
        // 2) Modern verification flow: ?token_hash=...&type=signup|email
        const tokenHash = url.searchParams.get("token_hash");
        const type = (url.searchParams.get("type") || "signup") as
          | "signup" | "email" | "recovery" | "invite" | "email_change";
        if (tokenHash) {
          const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
          if (error) throw error;
          finishSuccess();
          return;
        }

        // 3) PKCE flow: ?code=...
        const code = url.searchParams.get("code");
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
          finishSuccess();
          return;
        }

        // 4) Implicit flow: tokens already in the URL hash; the client picks
        // them up automatically. Give it a brief moment, then check.
        if (hash.get("access_token")) {
          await new Promise((r) => setTimeout(r, 400));
        }
        const { data } = await supabase.auth.getSession();
        if (data.session) {
          finishSuccess();
          return;
        }

        throw new Error(
          "We couldn't read a valid confirmation token from this link. It may have already been used or expired.",
        );
      } catch (e) {
        setErrorMsg((e as Error).message || "Email confirmation failed.");
        setPhase("error");
        window.history.replaceState(null, "", window.location.pathname);
      }
    };

    const finishSuccess = () => {
      setPhase("success");
      window.history.replaceState(null, "", window.location.pathname);
      toast({
        title: "Email confirmed!",
        description: "Your email has been verified successfully.",
      });
      setTimeout(() => navigate("/"), 1800);
    };

    void run();
  }, [navigate]);

  const handleResend = async () => {
    const email = resendEmail.trim();
    if (!email) {
      toast({ title: "Enter your email", variant: "destructive" });
      return;
    }
    setResending(true);
    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/confirm` },
    });
    setResending(false);
    if (error) {
      toast({ title: "Could not send", description: error.message, variant: "destructive" });
    } else {
      toast({
        title: "New confirmation link sent",
        description: "Check your inbox for a fresh email from info@amehnities.org.",
      });
      setResendEmail("");
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-hero p-4">
      <h1 className="sr-only">Confirm your Amehnities email</h1>
      <Card className="w-full max-w-md border-0 shadow-elegant">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-card shadow-soft">
            <img src={acgLogo} alt="Amehnities Logo" className="h-12 w-12 rounded-full" />
          </div>
          <CardTitle className="font-display text-xl">
            {phase === "verifying" && "Confirming your email…"}
            {phase === "success" && "Email confirmed"}
            {phase === "error" && "Confirmation link issue"}
          </CardTitle>
          <CardDescription>
            {phase === "verifying" && "Please wait while we verify your account."}
            {phase === "success" && "You're all set. Redirecting you into the app…"}
            {phase === "error" && "We couldn't confirm your email with this link."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {phase === "verifying" && (
            <div className="flex flex-col items-center gap-3 py-4 text-muted-foreground">
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
            </div>
          )}

          {phase === "success" && (
            <div className="flex flex-col items-center gap-4 py-2">
              <CheckCircle className="h-14 w-14 text-green-600" />
              <Button className="w-full" onClick={() => navigate("/")}>
                Continue to app
              </Button>
            </div>
          )}

          {phase === "error" && (
            <div className="space-y-4">
              <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                <span className="text-foreground/80">{errorMsg}</span>
              </div>
              <div className="space-y-2">
                <Label htmlFor="resend-email">Resend confirmation email</Label>
                <Input
                  id="resend-email"
                  type="email"
                  placeholder="you@example.com"
                  value={resendEmail}
                  onChange={(e) => setResendEmail(e.target.value)}
                />
                <Button className="w-full" onClick={handleResend} disabled={resending}>
                  {resending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <MailCheck className="mr-2 h-4 w-4" />
                  )}
                  Send new confirmation link
                </Button>
              </div>
              <Button variant="outline" className="w-full" onClick={() => navigate("/auth")}>
                Back to sign in
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ConfirmEmail;

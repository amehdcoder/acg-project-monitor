import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { Loader2, Eye, EyeOff, CheckCircle, AlertTriangle } from "lucide-react";
import acgLogo from "@/assets/acg-logo.png";

const BRAND_RESET_URL = "https://www.amehnities.org/reset-password";

const ResetPassword = () => {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isValidSession, setIsValidSession] = useState(false);
  const [checking, setChecking] = useState(true);
  const [linkError, setLinkError] = useState<{ code: string; description: string } | null>(null);
  const [resendEmail, setResendEmail] = useState("");
  const [resending, setResending] = useState(false);

  useEffect(() => {
    const hash = window.location.hash || "";
    const params = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);

    const errorCode = params.get("error_code") || params.get("error");
    const errorDesc = params.get("error_description");

    if (errorCode) {
      setLinkError({
        code: errorCode,
        description: errorDesc ? decodeURIComponent(errorDesc.replace(/\+/g, " ")) : "This reset link is invalid or has expired.",
      });
      // Strip the error fragment so it disappears from the address bar.
      window.history.replaceState(null, "", window.location.pathname);
      setChecking(false);
      return;
    }

    if (params.get("type") === "recovery") {
      setIsValidSession(true);
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setIsValidSession(true);
    });

    setChecking(false);
    return () => subscription.unsubscribe();
  }, []);

  const passwordErrors = (() => {
    const errors: string[] = [];
    if (password.length > 0 && password.length < 8) errors.push("At least 8 characters");
    if (password.length > 0 && !/[A-Z]/.test(password)) errors.push("One uppercase letter");
    if (password.length > 0 && !/[a-z]/.test(password)) errors.push("One lowercase letter");
    if (password.length > 0 && !/[0-9]/.test(password)) errors.push("One number");
    if (password.length > 0 && !/[^A-Za-z0-9]/.test(password)) errors.push("One special character");
    return errors;
  })();

  const isPasswordValid = password.length >= 8 && passwordErrors.length === 0;

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isPasswordValid) {
      toast({ title: "Weak password", description: "Please meet all password requirements.", variant: "destructive" });
      return;
    }
    if (password !== confirmPassword) {
      toast({ title: "Passwords don't match", variant: "destructive" });
      return;
    }
    setIsLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setIsLoading(false);
    if (error) {
      toast({ title: "Reset Failed", description: error.message, variant: "destructive" });
    } else {
      setIsSuccess(true);
      toast({ title: "Password Updated", description: "Your password has been reset successfully." });
      setTimeout(() => navigate("/"), 2000);
    }
  };

  const handleResend = async () => {
    if (!resendEmail) {
      toast({ title: "Enter your email", variant: "destructive" });
      return;
    }
    setResending(true);
    const { error } = await supabase.functions.invoke("send-password-reset", {
      body: { email: resendEmail, redirectTo: BRAND_RESET_URL },
    });
    setResending(false);
    if (error) {
      toast({ title: "Could not send", description: error.message, variant: "destructive" });
    } else {
      toast({
        title: "New reset link sent",
        description: "Check your inbox for a fresh link from info@amehnities.org.",
      });
      setLinkError(null);
      setResendEmail("");
    }
  };

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-hero p-4">
      <h1 className="sr-only">Reset your Amehnities password</h1>
      <Card className="w-full max-w-md border-0 shadow-elegant">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-card shadow-soft">
            <img src={acgLogo} alt="Amehnities Logo" className="h-12 w-12 rounded-full" />
          </div>
          <CardTitle className="font-display text-xl">
            {linkError ? "Reset link expired" : "Reset Your Amehnities Password"}
          </CardTitle>
          <CardDescription>
            {linkError
              ? "For your security, password reset links expire shortly after they're sent."
              : "Enter a new secure password for your account"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {linkError ? (
            <div className="space-y-4">
              <div className="flex items-start gap-3 rounded-lg border border-destructive/20 bg-destructive/5 p-3">
                <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                <div className="text-sm text-foreground">
                  <p className="font-medium">This reset link is no longer valid.</p>
                  <p className="text-muted-foreground mt-1">
                    Enter your email below and we'll send you a fresh link from{" "}
                    <span className="font-medium text-foreground">info@amehnities.org</span>.
                  </p>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="resend-email">Email address</Label>
                <Input
                  id="resend-email"
                  type="email"
                  value={resendEmail}
                  onChange={(e) => setResendEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                />
              </div>
              <Button variant="acg" className="w-full" onClick={handleResend} disabled={resending}>
                {resending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Send new reset link
              </Button>
              <Button variant="ghost" className="w-full" onClick={() => navigate("/auth")}>
                Back to Login
              </Button>
            </div>
          ) : isSuccess ? (
            <div className="flex flex-col items-center gap-3 py-6">
              <CheckCircle className="h-12 w-12 text-primary" />
              <p className="text-foreground font-medium">Password reset successfully!</p>
              <p className="text-muted-foreground text-sm">Redirecting to app...</p>
            </div>
          ) : !isValidSession ? (
            <div className="text-center space-y-4 py-4">
              <p className="text-muted-foreground text-sm">
                Please open the reset link from your most recent Amehnities email to continue.
              </p>
              <Button variant="acg" onClick={() => navigate("/auth")}>
                Go to Login
              </Button>
            </div>
          ) : (
            <form onSubmit={handleReset} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="new-password">New Password</Label>
                <div className="relative">
                  <Input
                    id="new-password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="new-password"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="absolute right-0 top-0 h-full"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
                {passwordErrors.length > 0 && (
                  <ul className="text-xs text-destructive space-y-0.5 mt-1">
                    {passwordErrors.map((err) => (
                      <li key={err}>• {err}</li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirm Password</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="new-password"
                />
                {confirmPassword && password !== confirmPassword && (
                  <p className="text-xs text-destructive">Passwords don't match</p>
                )}
              </div>

              <Button
                type="submit"
                variant="acg"
                className="w-full"
                disabled={isLoading || !isPasswordValid || password !== confirmPassword}
              >
                {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Reset Password
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ResetPassword;

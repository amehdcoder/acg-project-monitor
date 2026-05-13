import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { Loader2, Eye, EyeOff, CheckCircle } from "lucide-react";
import acgLogo from "@/assets/acg-logo.png";

const ResetPassword = () => {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isValidSession, setIsValidSession] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    // Check for recovery session from URL hash
    const hash = window.location.hash;
    if (hash.includes("type=recovery")) {
      setIsValidSession(true);
    }

    // Also listen for auth state change
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setIsValidSession(true);
      }
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
            <img src={acgLogo} alt="Amehnities Consulting Group Logo" className="h-12 w-12 rounded-full" />
          </div>
          <CardTitle className="font-display text-xl">Reset Your Password</CardTitle>
          <CardDescription>Enter a new secure password for your account</CardDescription>
        </CardHeader>
        <CardContent>
          {isSuccess ? (
            <div className="flex flex-col items-center gap-3 py-6">
              <CheckCircle className="h-12 w-12 text-primary" />
              <p className="text-foreground font-medium">Password reset successfully!</p>
              <p className="text-muted-foreground text-sm">Redirecting to app...</p>
            </div>
          ) : !isValidSession ? (
            <div className="text-center space-y-4 py-4">
              <p className="text-muted-foreground text-sm">
                This link is invalid or has expired. Please request a new password reset.
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

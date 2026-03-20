import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useSurveillanceTracking } from "@/hooks/useSurveillanceTracking";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { toast } from "@/hooks/use-toast";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import acgLogo from "@/assets/acg-logo.png";

const NIGERIAN_STATES = [
  "Abia", "Adamawa", "Akwa Ibom", "Anambra", "Bauchi", "Bayelsa", "Benue", "Borno",
  "Cross River", "Delta", "Ebonyi", "Edo", "Ekiti", "Enugu", "FCT", "Gombe",
  "Imo", "Jigawa", "Kaduna", "Kano", "Katsina", "Kebbi", "Kogi", "Kwara",
  "Lagos", "Nasarawa", "Niger", "Ogun", "Ondo", "Osun", "Oyo", "Plateau",
  "Rivers", "Sokoto", "Taraba", "Yobe", "Zamfara"
];

const DESIGNATIONS = [
  { value: "independent_monitor", label: "Independent Monitor" },
  { value: "enumerator", label: "Enumerator" },
  { value: "data_collector", label: "Data Collector" },
  { value: "electronic_data_manager", label: "Electronic Data Manager (EDM)" },
  { value: "community_directed_distributor", label: "Community Directed Distributor (CDD)" },
  { value: "flhf_supervisor", label: "FLHF Supervisor" },
  { value: "lga_supervisor", label: "LGA Supervisor" },
  { value: "state_supervisor", label: "State Supervisor" },
  { value: "hands_staff", label: "HANDS Staff" },
  { value: "cbmg_staff", label: "CBMG Staff" },
  { value: "cbmi_staff", label: "CBMI Staff" },
  { value: "sightsavers_staff", label: "Sightsavers Staff" },
  { value: "plan_intl_staff", label: "Plan Int'l Staff" },
  { value: "sci_staff", label: "SCI Staff" },
  { value: "other", label: "Other (Please Specify)" },
];

const loginSchema = z.object({
  email: z.string().trim().email("Invalid email address").max(255),
  password: z.string().min(8, "Password must be at least 8 characters").max(128),
});

const signupSchema = z.object({
  email: z.string().trim().email("Invalid email address").max(255),
  password: z.string()
    .min(8, "Password must be at least 8 characters")
    .max(128)
    .regex(/[A-Z]/, "Must contain an uppercase letter")
    .regex(/[a-z]/, "Must contain a lowercase letter")
    .regex(/[0-9]/, "Must contain a number")
    .regex(/[^A-Za-z0-9]/, "Must contain a special character"),
  confirmPassword: z.string(),
  first_name: z.string().trim().min(2, "First name is required").max(100),
  last_name: z.string().trim().min(2, "Last name is required").max(100),
  phone_number: z.string().min(10, "Valid phone number required").max(20),
  alternate_phone: z.string().max(20).optional().or(z.literal("")),
  alternate_email: z.string().email().max(255).optional().or(z.literal("")),
  designation: z.string().min(1, "Please select a designation"),
  other_designation: z.string().max(200).optional(),
  state: z.string().min(1, "Please select a state"),
  lga: z.string().max(200).optional(),
  ward: z.string().max(200).optional(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

type LoginFormData = z.infer<typeof loginSchema>;
type SignupFormData = z.infer<typeof signupSchema>;

const Auth = () => {
  const navigate = useNavigate();
  const { signIn, signUp, user, loading: authLoading } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("login");
  const [failedAttempts, setFailedAttempts] = useState(0);
  const { trackFailedLogin, trackLoginLocation } = useSurveillanceTracking(user?.id);

  useEffect(() => {
    if (user && !authLoading) {
      navigate("/");
    }
  }, [user, authLoading, navigate]);

  const loginForm = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const signupForm = useForm<SignupFormData>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      email: "",
      password: "",
      confirmPassword: "",
      first_name: "",
      last_name: "",
      phone_number: "",
      alternate_phone: "",
      alternate_email: "",
      designation: "",
      other_designation: "",
      state: "",
      lga: "",
      ward: "",
    },
  });

  const selectedDesignation = signupForm.watch("designation");

  const handleLogin = async (data: LoginFormData) => {
    setIsLoading(true);
    const { error } = await signIn(data.email, data.password);
    setIsLoading(false);

    if (error) {
      const newCount = failedAttempts + 1;
      setFailedAttempts(newCount);

      // Track failed login to surveillance log
      await trackFailedLogin(data.email, error.message);

      toast({
        title: "Login Failed",
        description: error.message === "Invalid login credentials" 
          ? `Invalid email or password. ${newCount >= 3 ? `${newCount} consecutive failed attempts logged.` : "Please check your credentials."}`
          : error.message,
        variant: "destructive",
      });
    } else {
      setFailedAttempts(0);
      // Track login location
      trackLoginLocation();
      toast({ title: "Welcome back!", description: "You have been logged in successfully." });
      navigate("/");
    }
  };

  const handleSignup = async (data: SignupFormData) => {
    setIsLoading(true);
    const { error } = await signUp({
      email: data.email,
      password: data.password,
      first_name: data.first_name,
      last_name: data.last_name,
      phone_number: data.phone_number,
      alternate_phone: data.alternate_phone,
      alternate_email: data.alternate_email,
      designation: data.designation,
      other_designation: data.other_designation,
      state: data.state,
      lga: data.lga,
      ward: data.ward,
    });
    setIsLoading(false);

    if (error) {
      const errorMessage = error.message.includes("already registered")
        ? "This email is already registered. Please login instead."
        : error.message;
      toast({ title: "Signup Failed", description: errorMessage, variant: "destructive" });
    } else {
      toast({
        title: "Account Created!",
        description: "Your account is pending approval by an administrator. You will be notified once approved.",
      });
    }
  };

  const handleGoogleSignIn = async () => {
    setIsGoogleLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/`,
      },
    });
    
    if (error) {
      toast({
        title: "Google Sign In Failed",
        description: error.message,
        variant: "destructive",
      });
      setIsGoogleLoading(false);
    }
  };

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-hero p-4">
      <Card className="w-full max-w-md border-0 shadow-elegant">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-card shadow-soft">
            <img src={acgLogo} alt="ACG Logo" className="h-16 w-16 rounded-full" />
          </div>
          <CardTitle className="font-display text-2xl">
            Amehnities Consulting Group (ACG)
          </CardTitle>
          <CardDescription>Monitoring & Supervision Platform</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login">Login</TabsTrigger>
              <TabsTrigger value="signup">Sign Up</TabsTrigger>
            </TabsList>

            <TabsContent value="login" className="space-y-4 pt-4">
              <form onSubmit={loginForm.handleSubmit(handleLogin)} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="login-email">Email</Label>
                  <Input
                    id="login-email"
                    type="email"
                    placeholder="your@email.com"
                    {...loginForm.register("email")}
                  />
                  {loginForm.formState.errors.email && (
                    <p className="text-sm text-destructive">{loginForm.formState.errors.email.message}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="login-password">Password</Label>
                  <div className="relative">
                    <Input
                      id="login-password"
                      type={showPassword ? "text" : "password"}
                      placeholder="••••••••"
                      {...loginForm.register("password")}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-0 top-0 h-full"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                  {loginForm.formState.errors.password && (
                    <p className="text-sm text-destructive">{loginForm.formState.errors.password.message}</p>
                  )}
                </div>
                <div className="flex justify-end">
                  <Button
                    type="button"
                    variant="link"
                    className="px-0 text-xs text-muted-foreground"
                    onClick={async () => {
                      const email = loginForm.getValues("email");
                      if (!email) {
                        toast({ title: "Enter your email first", variant: "destructive" });
                        return;
                      }
                      const { error } = await supabase.auth.resetPasswordForEmail(email, {
                        redirectTo: `${window.location.origin}/reset-password`,
                      });
                      if (error) {
                        toast({ title: "Error", description: error.message, variant: "destructive" });
                      } else {
                        toast({ title: "Check your email", description: "A password reset link has been sent." });
                      }
                    }}
                  >
                    Forgot password?
                  </Button>
                </div>
                <Button type="submit" variant="acg" className="w-full" disabled={isLoading}>
                  {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Login
                </Button>
              </form>

              <div className="relative my-4">
                <Separator />
                <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-2 text-xs text-muted-foreground">
                  or continue with
                </span>
              </div>

              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={handleGoogleSignIn}
                disabled={isGoogleLoading}
              >
                {isGoogleLoading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
                    <path
                      fill="currentColor"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="currentColor"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="currentColor"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    />
                    <path
                      fill="currentColor"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    />
                  </svg>
                )}
                Continue with Google
              </Button>
            </TabsContent>

            <TabsContent value="signup" className="space-y-4 pt-4">
              <form onSubmit={signupForm.handleSubmit(handleSignup)} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="first_name">First Name *</Label>
                    <Input id="first_name" {...signupForm.register("first_name")} />
                    {signupForm.formState.errors.first_name && (
                      <p className="text-xs text-destructive">{signupForm.formState.errors.first_name.message}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="last_name">Last Name *</Label>
                    <Input id="last_name" {...signupForm.register("last_name")} />
                    {signupForm.formState.errors.last_name && (
                      <p className="text-xs text-destructive">{signupForm.formState.errors.last_name.message}</p>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="signup-email">Email *</Label>
                  <Input id="signup-email" type="email" {...signupForm.register("email")} />
                  {signupForm.formState.errors.email && (
                    <p className="text-xs text-destructive">{signupForm.formState.errors.email.message}</p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="phone_number">Phone Number *</Label>
                    <Input id="phone_number" {...signupForm.register("phone_number")} placeholder="+234..." />
                    {signupForm.formState.errors.phone_number && (
                      <p className="text-xs text-destructive">{signupForm.formState.errors.phone_number.message}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="alternate_phone">Alt. Phone</Label>
                    <Input id="alternate_phone" {...signupForm.register("alternate_phone")} />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="designation">Designation *</Label>
                  <Select onValueChange={(value) => signupForm.setValue("designation", value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select designation" />
                    </SelectTrigger>
                    <SelectContent>
                      {DESIGNATIONS.map((d) => (
                        <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {signupForm.formState.errors.designation && (
                    <p className="text-xs text-destructive">{signupForm.formState.errors.designation.message}</p>
                  )}
                </div>

                {selectedDesignation === "other" && (
                  <div className="space-y-2">
                    <Label htmlFor="other_designation">Specify Other Designation</Label>
                    <Input id="other_designation" {...signupForm.register("other_designation")} />
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="state">State *</Label>
                  <Select onValueChange={(value) => signupForm.setValue("state", value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select state" />
                    </SelectTrigger>
                    <SelectContent>
                      {NIGERIAN_STATES.map((state) => (
                        <SelectItem key={state} value={state}>{state}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {signupForm.formState.errors.state && (
                    <p className="text-xs text-destructive">{signupForm.formState.errors.state.message}</p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="lga">LGA</Label>
                    <Input id="lga" {...signupForm.register("lga")} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="ward">Ward</Label>
                    <Input id="ward" {...signupForm.register("ward")} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="signup-password">Password *</Label>
                    <Input id="signup-password" type="password" {...signupForm.register("password")} />
                    {signupForm.formState.errors.password && (
                      <p className="text-xs text-destructive">{signupForm.formState.errors.password.message}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirmPassword">Confirm *</Label>
                    <Input id="confirmPassword" type="password" {...signupForm.register("confirmPassword")} />
                    {signupForm.formState.errors.confirmPassword && (
                      <p className="text-xs text-destructive">{signupForm.formState.errors.confirmPassword.message}</p>
                    )}
                  </div>
                </div>

                <Button type="submit" variant="acg" className="w-full" disabled={isLoading}>
                  {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Create Account
                </Button>
              </form>

              <div className="relative my-4">
                <Separator />
                <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-2 text-xs text-muted-foreground">
                  or continue with
                </span>
              </div>

              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={handleGoogleSignIn}
                disabled={isGoogleLoading}
              >
                {isGoogleLoading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
                    <path
                      fill="currentColor"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="currentColor"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="currentColor"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    />
                    <path
                      fill="currentColor"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    />
                  </svg>
                )}
                Continue with Google
              </Button>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

export default Auth;

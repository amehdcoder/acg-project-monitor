import { useState, useEffect, useCallback } from "react";
import { Fingerprint, ScanFace, ShieldCheck, AlertTriangle, Loader2, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";

const base64url = {
  encode: (buffer: ArrayBuffer) => {
    return btoa(String.fromCharCode(...new Uint8Array(buffer)))
      .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  },
  decode: (str: string) => {
    str = str.replace(/-/g, "+").replace(/_/g, "/");
    while (str.length % 4) str += "=";
    return Uint8Array.from(atob(str), c => c.charCodeAt(0)).buffer;
  },
};

interface StoredCredential {
  id: string;
  label: string;
  createdAt: string;
  lastUsed: string | null;
}

const BiometricAuth = () => {
  const { user } = useAuth();
  const [isSupported, setIsSupported] = useState(false);
  const [isEnabled, setIsEnabled] = useState(false);
  const [credentials, setCredentials] = useState<StoredCredential[]>([]);
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    const checkSupport = async () => {
      if (window.PublicKeyCredential) {
        try {
          const available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
          setIsSupported(available);
        } catch {
          setIsSupported(false);
        }
      }
    };
    checkSupport();

    const stored = localStorage.getItem(`biometric_credentials_${user?.id}`);
    if (stored) {
      const creds = JSON.parse(stored);
      setCredentials(creds);
      setIsEnabled(creds.length > 0);
    }
  }, [user?.id]);

  const registerBiometric = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    try {
      const challenge = crypto.getRandomValues(new Uint8Array(32));
      const userId = new TextEncoder().encode(user.id);

      const credential = await navigator.credentials.create({
        publicKey: {
          challenge,
          rp: {
            name: "ACG Collect",
            id: window.location.hostname,
          },
          user: {
            id: userId,
            name: user.email || "user",
            displayName: user.email || "User",
          },
          pubKeyCredParams: [
            { alg: -7, type: "public-key" },   // ES256
            { alg: -257, type: "public-key" },  // RS256
          ],
          authenticatorSelection: {
            authenticatorAttachment: "platform",
            userVerification: "required",
            residentKey: "preferred",
          },
          timeout: 60000,
          attestation: "none",
        },
      }) as PublicKeyCredential;

      if (!credential) throw new Error("Registration cancelled");

      const newCred: StoredCredential = {
        id: base64url.encode(credential.rawId),
        label: detectBiometricType(),
        createdAt: new Date().toISOString(),
        lastUsed: null,
      };

      const updated = [...credentials, newCred];
      setCredentials(updated);
      setIsEnabled(true);
      localStorage.setItem(`biometric_credentials_${user.id}`, JSON.stringify(updated));

      toast({ title: "Biometric registered", description: `${newCred.label} has been set up successfully.` });
    } catch (err: any) {
      if (err.name === "NotAllowedError") {
        toast({ title: "Registration cancelled", description: "You cancelled the biometric registration.", variant: "destructive" });
      } else {
        toast({ title: "Registration failed", description: err.message, variant: "destructive" });
      }
    } finally {
      setLoading(false);
    }
  }, [user, credentials]);

  const verifyBiometric = useCallback(async () => {
    if (!user || credentials.length === 0) return;
    setVerifying(true);

    try {
      const challenge = crypto.getRandomValues(new Uint8Array(32));

      const assertion = await navigator.credentials.get({
        publicKey: {
          challenge,
          allowCredentials: credentials.map(c => ({
            id: base64url.decode(c.id),
            type: "public-key" as const,
            transports: ["internal" as AuthenticatorTransport],
          })),
          userVerification: "required",
          timeout: 60000,
        },
      }) as PublicKeyCredential;

      if (!assertion) throw new Error("Verification cancelled");

      // Update last used
      const credId = base64url.encode(assertion.rawId);
      const updated = credentials.map(c =>
        c.id === credId ? { ...c, lastUsed: new Date().toISOString() } : c
      );
      setCredentials(updated);
      localStorage.setItem(`biometric_credentials_${user.id}`, JSON.stringify(updated));

      toast({ title: "✅ Verified", description: "Biometric authentication successful." });
    } catch (err: any) {
      toast({ title: "Verification failed", description: err.message, variant: "destructive" });
    } finally {
      setVerifying(false);
    }
  }, [user, credentials]);

  const removeBiometric = (id: string) => {
    const updated = credentials.filter(c => c.id !== id);
    setCredentials(updated);
    setIsEnabled(updated.length > 0);
    localStorage.setItem(`biometric_credentials_${user?.id}`, JSON.stringify(updated));
    toast({ title: "Credential removed" });
  };

  const detectBiometricType = () => {
    const ua = navigator.userAgent.toLowerCase();
    if (ua.includes("iphone") || ua.includes("ipad") || ua.includes("mac")) return "Face ID / Touch ID";
    if (ua.includes("android")) return "Fingerprint / Face Unlock";
    if (ua.includes("windows")) return "Windows Hello";
    return "Biometric";
  };

  if (!isSupported) {
    return (
      <Card className="border-amber-500/30">
        <CardContent className="p-4 flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium">Biometric authentication not available</p>
            <p className="text-xs text-muted-foreground">
              Your device or browser doesn't support platform biometric authentication (fingerprint/face recognition).
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Fingerprint className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">Biometric Authentication</CardTitle>
          </div>
          <Badge variant={isEnabled ? "default" : "outline"} className="text-[10px]">
            {isEnabled ? "Active" : "Inactive"}
          </Badge>
        </div>
        <CardDescription className="text-xs">
          Use your device's fingerprint sensor or facial recognition for secure, passwordless access.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <Label className="text-sm">Enable biometric login</Label>
          <Switch
            checked={isEnabled}
            onCheckedChange={(checked) => {
              if (checked && credentials.length === 0) {
                registerBiometric();
              } else if (!checked) {
                setIsEnabled(false);
              }
            }}
          />
        </div>

        {credentials.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Registered credentials</p>
            {credentials.map(cred => (
              <div key={cred.id} className="flex items-center justify-between border rounded-md p-2">
                <div className="flex items-center gap-2">
                  {cred.label.includes("Face") ? (
                    <ScanFace className="h-4 w-4 text-primary" />
                  ) : (
                    <Fingerprint className="h-4 w-4 text-primary" />
                  )}
                  <div>
                    <p className="text-xs font-medium">{cred.label}</p>
                    <p className="text-[10px] text-muted-foreground">
                      Added {new Date(cred.createdAt).toLocaleDateString()}
                      {cred.lastUsed && ` • Last used ${new Date(cred.lastUsed).toLocaleDateString()}`}
                    </p>
                  </div>
                </div>
                <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => removeBiometric(cred.id)}>
                  <Trash2 className="h-3 w-3 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={registerBiometric} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Fingerprint className="h-4 w-4 mr-1" />}
            Add New
          </Button>
          {credentials.length > 0 && (
            <Button size="sm" onClick={verifyBiometric} disabled={verifying}>
              {verifying ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <ShieldCheck className="h-4 w-4 mr-1" />}
              Test Verify
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default BiometricAuth;

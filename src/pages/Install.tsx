import { useState, useEffect } from "react";
import { Download, Smartphone, CheckCircle, Share, MoreVertical, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const Install = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    const isIOSDevice = /iPad|iPhone|iPod/.test(navigator.userAgent);
    setIsIOS(isIOSDevice);

    if (window.matchMedia("(display-mode: standalone)").matches) {
      setIsInstalled(true);
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", () => setIsInstalled(true));

    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setIsInstalled(true);
    }
    setDeferredPrompt(null);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardContent className="space-y-6 p-6 text-center">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl bg-primary/10">
            <Smartphone className="h-10 w-10 text-primary" />
          </div>

          <div>
            <h1 className="text-2xl font-bold text-foreground">Install ACG Monitor</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Install the app on your device to collect data offline and sync automatically when connected.
            </p>
          </div>

          {isInstalled ? (
            <div className="flex items-center justify-center gap-2 rounded-lg bg-green-50 p-4 text-green-700 dark:bg-green-900/20 dark:text-green-400">
              <CheckCircle className="h-5 w-5" />
              <span className="font-medium">App is installed!</span>
            </div>
          ) : deferredPrompt ? (
            <Button onClick={handleInstall} className="w-full gap-2" variant="acg" size="lg">
              <Download className="h-5 w-5" />
              Install App
            </Button>
          ) : isIOS ? (
            <div className="space-y-3 rounded-lg bg-muted p-4 text-left text-sm">
              <p className="font-medium text-foreground">To install on iPhone/iPad:</p>
              <ol className="space-y-2 text-muted-foreground">
                <li className="flex items-start gap-2">
                  <span className="font-bold text-primary">1.</span>
                  <span>Tap the <Share className="inline h-4 w-4" /> Share button in Safari</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-bold text-primary">2.</span>
                  <span>Scroll down and tap <Plus className="inline h-4 w-4" /> <strong>Add to Home Screen</strong></span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-bold text-primary">3.</span>
                  <span>Tap <strong>Add</strong> to confirm</span>
                </li>
              </ol>
            </div>
          ) : (
            <div className="space-y-3 rounded-lg bg-muted p-4 text-left text-sm">
              <p className="font-medium text-foreground">To install on Android:</p>
              <ol className="space-y-2 text-muted-foreground">
                <li className="flex items-start gap-2">
                  <span className="font-bold text-primary">1.</span>
                  <span>Tap the <MoreVertical className="inline h-4 w-4" /> menu in Chrome</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-bold text-primary">2.</span>
                  <span>Tap <strong>Install app</strong> or <strong>Add to Home Screen</strong></span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-bold text-primary">3.</span>
                  <span>Tap <strong>Install</strong> to confirm</span>
                </li>
              </ol>
            </div>
          )}

          <div className="space-y-2 text-xs text-muted-foreground">
            <p>✓ Works offline — collect data anywhere</p>
            <p>✓ Auto-syncs when mobile data is active</p>
            <p>✓ No app store download needed</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Install;

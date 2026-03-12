import { useState, useEffect } from "react";
import { Download, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const PWA_BANNER_DISMISSED_KEY = "acg_pwa_banner_dismissed";

const InstallBanner = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showBanner, setShowBanner] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    // Don't show if already installed or dismissed
    if (window.matchMedia("(display-mode: standalone)").matches) return;
    if (localStorage.getItem(PWA_BANNER_DISMISSED_KEY)) return;

    const isIOSDevice = /iPad|iPhone|iPod/.test(navigator.userAgent);
    setIsIOS(isIOSDevice);

    // On iOS, show instructions banner after a short delay
    if (isIOSDevice) {
      const timer = setTimeout(() => setShowBanner(true), 3000);
      return () => clearTimeout(timer);
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setShowBanner(true);
    };

    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setShowBanner(false);
    }
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    setShowBanner(false);
    localStorage.setItem(PWA_BANNER_DISMISSED_KEY, "true");
  };

  if (!showBanner) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-50 mx-auto w-full max-w-lg animate-in slide-in-from-top-4 px-3 pt-3 md:top-4">
      <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 shadow-lg">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          <Download className="h-5 w-5 text-primary" />
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">Install ACG Monitor</p>
          <p className="truncate text-xs text-muted-foreground">
            {isIOS
              ? "Tap Share → Add to Home Screen"
              : "Install for offline data collection"}
          </p>
        </div>

        {!isIOS && deferredPrompt && (
          <Button onClick={handleInstall} variant="acg" size="sm" className="shrink-0">
            Install
          </Button>
        )}

        <button
          onClick={handleDismiss}
          className="shrink-0 rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};

export default InstallBanner;

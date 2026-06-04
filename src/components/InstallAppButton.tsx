import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/**
 * Compact header button that lets users install the app as a PWA.
 * - Android/desktop Chrome: triggers the native install prompt.
 * - iOS Safari: shows brief Add-to-Home-Screen instructions.
 * Hidden entirely once the app is already running as an installed PWA.
 */
const InstallAppButton = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    // Detect installed/standalone state across platforms.
    const checkInstalled = () => {
      try {
        const standaloneMatch =
          typeof window.matchMedia === "function" &&
          (window.matchMedia("(display-mode: standalone)").matches ||
            window.matchMedia("(display-mode: fullscreen)").matches ||
            window.matchMedia("(display-mode: minimal-ui)").matches);
        // iOS Safari exposes navigator.standalone instead of display-mode.
        const iosStandalone = (navigator as unknown as { standalone?: boolean }).standalone === true;
        return Boolean(standaloneMatch || iosStandalone);
      } catch {
        return false;
      }
    };

    if (checkInstalled()) {
      setIsInstalled(true);
      return;
    }

    setIsIOS(/iPad|iPhone|iPod/.test(navigator.userAgent));

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    const installedHandler = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    // React to display-mode changes (e.g. user installs while app is open).
    let mql: MediaQueryList | null = null;
    const modeChange = () => {
      if (checkInstalled()) {
        setIsInstalled(true);
        setDeferredPrompt(null);
      }
    };
    try {
      mql = window.matchMedia("(display-mode: standalone)");
      mql.addEventListener?.("change", modeChange);
    } catch {
      mql = null;
    }

    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", installedHandler);
    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("appinstalled", installedHandler);
      mql?.removeEventListener?.("change", modeChange);
    };
  }, []);

  const handleInstall = async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === "accepted") setIsInstalled(true);
      setDeferredPrompt(null);
      return;
    }
    if (isIOS) {
      // iOS has no programmatic prompt — direct users to the install page.
      window.location.assign("/install");
    }
  };

  // Already installed → nothing to show.
  if (isInstalled) return null;
  // Only render when we can actually offer an install path.
  if (!deferredPrompt && !isIOS) return null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="gold"
          size="sm"
          onClick={handleInstall}
          className="h-8 shrink-0 px-2.5 text-xs font-bold shadow-glow sm:px-3"
          aria-label="Install app on your device"
        >
          <Download className="h-4 w-4" />
          <span className="hidden sm:inline">Install App</span>
          <span className="sm:hidden">Install</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {isIOS ? "Tap to see Add to Home Screen steps" : "Install this app on your device"}
      </TooltipContent>
    </Tooltip>
  );
};

export default InstallAppButton;

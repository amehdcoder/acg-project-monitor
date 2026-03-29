import { useEffect, useState } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { RefreshCw, Download } from "lucide-react";

/**
 * PWA auto-update prompt.
 * When a new service worker is detected, shows a persistent toast
 * inviting the user to reload and get the latest version.
 */
const PWAUpdatePrompt = () => {
  const [showBanner, setShowBanner] = useState(false);

  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(swUrl, registration) {
      // Poll for updates every 60 seconds
      if (registration) {
        setInterval(() => {
          registration.update();
        }, 60 * 1000);
      }
    },
    onRegisterError(error) {
      console.error("SW registration error:", error);
    },
  });

  useEffect(() => {
    if (needRefresh) {
      setShowBanner(true);
      toast({
        title: "🆕 Update Available",
        description: "A new version of the app is ready. Tap update to get the latest features.",
        duration: Infinity,
      });
    }
  }, [needRefresh]);

  if (!showBanner) return null;

  return (
    <div className="fixed bottom-20 sm:bottom-6 left-4 right-4 sm:left-auto sm:right-6 sm:max-w-sm z-50 animate-in slide-in-from-bottom-4 fade-in duration-300">
      <div className="bg-primary text-primary-foreground rounded-2xl shadow-2xl p-4 flex items-center gap-3">
        <div className="shrink-0 w-10 h-10 rounded-full bg-primary-foreground/20 flex items-center justify-center">
          <Download className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">New Update Available</p>
          <p className="text-xs opacity-80 mt-0.5">Tap to refresh and get the latest features</p>
        </div>
        <Button
          size="sm"
          variant="secondary"
          className="shrink-0 gap-1.5 font-semibold"
          onClick={() => {
            updateServiceWorker(true);
            setShowBanner(false);
          }}
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Update
        </Button>
      </div>
    </div>
  );
};

export default PWAUpdatePrompt;

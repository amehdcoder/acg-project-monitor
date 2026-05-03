import { useEffect, useState } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { Button } from "@/components/ui/button";
import { RefreshCw, Sparkles, X } from "lucide-react";

/**
 * PWA auto-update prompt.
 * When a new service worker is detected, shows a bold, centered modal
 * inviting the user to reload immediately. Polls every 30s for updates.
 */
const PWAUpdatePrompt = () => {
  const [showModal, setShowModal] = useState(false);

  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(swUrl, registration) {
      if (registration) {
        // Poll for updates every 30 seconds for near real-time delivery
        setInterval(() => {
          registration.update().catch(() => {});
        }, 30 * 1000);
        // Also check whenever the tab regains focus
        window.addEventListener("focus", () => registration.update().catch(() => {}));
      }
    },
    onRegisterError(error) {
      console.error("SW registration error:", error);
    },
  });

  useEffect(() => {
    if (needRefresh) setShowModal(true);
  }, [needRefresh]);

  if (!showModal) return null;

  const handleUpdate = async () => {
    try {
      // Clear caches so the next load is guaranteed fresh
      if ("caches" in window) {
        const names = await caches.keys();
        await Promise.all(names.map((n) => caches.delete(n)));
      }
    } catch {}
    updateServiceWorker(true);
    setShowModal(false);
  };

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-background/80 backdrop-blur-sm animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pwa-update-title"
    >
      <div className="relative mx-4 w-full max-w-md rounded-2xl border-2 border-primary bg-card p-8 shadow-2xl ring-4 ring-primary/20 animate-in zoom-in-95">
        <button
          onClick={() => setShowModal(false)}
          className="absolute right-3 top-3 rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
        <div className="flex flex-col items-center text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 ring-4 ring-primary/30">
            <Sparkles className="h-8 w-8 text-primary" />
          </div>
          <h2 id="pwa-update-title" className="text-2xl font-bold text-foreground">
            New Update Available
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            A new version of the app is ready. Update now to get the latest features
            and fixes.
          </p>
          <Button
            onClick={handleUpdate}
            variant="acg"
            size="lg"
            className="mt-6 w-full text-base font-semibold"
          >
            <RefreshCw className="mr-2 h-5 w-5" />
            Update Now
          </Button>
          <button
            onClick={() => setShowModal(false)}
            className="mt-3 text-xs text-muted-foreground hover:text-foreground"
          >
            Remind me later
          </button>
        </div>
      </div>
    </div>
  );
};

export default PWAUpdatePrompt;

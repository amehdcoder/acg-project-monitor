import { useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { useStorageQuota } from "@/hooks/useStorageQuota";
import { formatBytes } from "@/lib/storagePersistence";

/**
 * Prominent warning banner shown when the device's browser storage drops below
 * 15% free. Advises the field worker to clear space on their phone so the
 * offline submission queue stays safe from eviction. Dismissible per-session.
 */
const StorageWarningBanner = () => {
  const { estimate, low } = useStorageQuota(0.15);
  const [dismissed, setDismissed] = useState(false);

  if (!low || dismissed || !estimate) return null;

  const freePct = Math.round(estimate.availableRatio * 100);

  return (
    <div
      role="alert"
      className="fixed inset-x-0 top-0 z-[60] flex items-start gap-3 border-b border-amber-500/40 bg-amber-500 px-4 py-2.5 text-amber-950 shadow-lg"
      style={{ paddingTop: "max(0.625rem, env(safe-area-inset-top))" }}
    >
      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-semibold leading-tight">
          Low device storage — only {freePct}% free
        </p>
        <p className="mt-0.5 text-[12px] leading-snug opacity-90">
          Please clear space on your phone (photos, apps, downloads) so your
          offline forms stay safe and can keep syncing.
          {estimate.quota > 0 && (
            <> Using {formatBytes(estimate.usage)} of {formatBytes(estimate.quota)}.</>
          )}
        </p>
      </div>
      <button
        onClick={() => setDismissed(true)}
        aria-label="Dismiss storage warning"
        className="shrink-0 rounded-md p-1 hover:bg-amber-600/30"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
};

export default StorageWarningBanner;

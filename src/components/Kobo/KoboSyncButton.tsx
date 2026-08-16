/**
 * Drop-in "Kobo Sync" launcher for ANY checklist.
 *
 * Mount it in a checklist header and users get the KoboToolbox ↔ Amehnities
 * sync/integration settings by default — endpoint, shared secret (admins),
 * XLSForm download and the live sync log.
 */
import { useState } from "react";
import { Webhook } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import KoboIntegrationDialog from "./KoboIntegrationDialog";

interface Props {
  /** Webhook router key, e.g. "seeclear". */
  formType: string;
  /** Human readable checklist name. */
  formTitle: string;
  description?: string;
  onDownloadXlsForm?: () => void;
  /** "dark" = translucent chip for coloured headers, "light" = bordered chip. */
  tone?: "dark" | "light";
  className?: string;
  /** Hide the text label on small screens (default true). */
  compact?: boolean;
}

export default function KoboSyncButton({
  formType, formTitle, description, onDownloadXlsForm, tone = "dark", className = "", compact = true,
}: Props) {
  const { isOwner, isSuperAdmin, isOwnerLevel } = useAuth() as any;
  const [open, setOpen] = useState(false);
  const isAdmin = Boolean(isOwner || isSuperAdmin || isOwnerLevel);

  const base =
    tone === "dark"
      ? "bg-white/10 text-white hover:bg-white/20 border-0"
      : "bg-background text-foreground hover:bg-muted border border-border";

  return (
    <>
      <button
        type="button"
        title="KoboToolbox ↔ Amehnities sync settings"
        onClick={() => setOpen(true)}
        className={`flex h-9 items-center gap-1.5 rounded-full px-3 text-xs font-semibold transition-colors ${base} ${className}`}
      >
        <Webhook className="h-4 w-4" />
        <span className={compact ? "hidden sm:inline" : ""}>Kobo Sync</span>
      </button>
      <KoboIntegrationDialog
        open={open}
        onClose={() => setOpen(false)}
        formType={formType}
        formTitle={formTitle}
        description={description}
        canViewSecret={isAdmin}
        onDownloadXlsForm={onDownloadXlsForm}
      />
    </>
  );
}

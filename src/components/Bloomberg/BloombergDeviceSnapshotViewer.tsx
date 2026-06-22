import { useState } from "react";
import { ImageIcon, Loader2, X } from "lucide-react";
import { getDeviceAuditSnapshotUrl } from "@/lib/bloomberg/deviceAuditSnapshot";

interface Props {
  userName: string;
  draftsPath: string | null;
  readyPath: string | null;
  capturedAt: string | null;
}

// Shows the device-uploaded Drafts / Ready-to-Send screenshots for one user in
// the Device Form Audit table. Loads short-lived signed URLs on demand.
export default function BloombergDeviceSnapshotViewer({ userName, draftsPath, readyPath, capturedAt }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [urls, setUrls] = useState<{ drafts: string | null; ready: string | null }>({ drafts: null, ready: null });

  const hasAny = !!draftsPath || !!readyPath;

  const handleOpen = async () => {
    setOpen(true);
    if (urls.drafts || urls.ready) return;
    setLoading(true);
    try {
      const [d, r] = await Promise.all([
        getDeviceAuditSnapshotUrl(draftsPath),
        getDeviceAuditSnapshotUrl(readyPath),
      ]);
      setUrls({ drafts: d, ready: r });
    } finally {
      setLoading(false);
    }
  };

  if (!hasAny) {
    return <span className="text-[10px] text-muted-foreground">—</span>;
  }

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[10px] font-medium text-foreground transition-colors hover:bg-muted"
        title="View this device's uploaded Drafts & Ready-to-Send screenshots"
      >
        <ImageIcon className="h-3.5 w-3.5" /> View
      </button>

      {open && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4" onClick={() => setOpen(false)}>
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl bg-card p-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Device snapshots — {userName}</h3>
                {capturedAt && <p className="text-[11px] text-muted-foreground">Captured {new Date(capturedAt).toLocaleString()}</p>}
              </div>
              <button onClick={() => setOpen(false)} className="rounded-md p-1 hover:bg-muted"><X className="h-4 w-4" /></button>
            </div>
            {loading ? (
              <div className="flex h-40 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <p className="mb-1 text-xs font-semibold text-amber-600">Drafts</p>
                  {urls.drafts ? (
                    <img src={urls.drafts} alt="Drafts screen" className="w-full rounded-lg border border-border" loading="lazy" />
                  ) : (
                    <p className="rounded-lg border border-dashed border-border py-6 text-center text-xs text-muted-foreground">No drafts snapshot</p>
                  )}
                </div>
                <div>
                  <p className="mb-1 text-xs font-semibold text-blue-600">Ready to Send</p>
                  {urls.ready ? (
                    <img src={urls.ready} alt="Ready to send screen" className="w-full rounded-lg border border-border" loading="lazy" />
                  ) : (
                    <p className="rounded-lg border border-dashed border-border py-6 text-center text-xs text-muted-foreground">No ready-to-send snapshot</p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

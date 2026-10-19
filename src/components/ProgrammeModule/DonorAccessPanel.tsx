import { useEffect, useState } from "react";
import { listProjectDonors, grantDonorAccess, setDonorActive, removeDonorAccess, type DonorGrantRow } from "@/lib/donorPortal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Globe, Trash2 } from "lucide-react";

/**
 * "Donor access" management for the project team view: grants read-only,
 * aggregate-only donor portal access to existing user accounts.
 */
export default function DonorAccessPanel({ projectId, canManage }: { projectId: string; canManage: boolean }) {
  const [donors, setDonors] = useState<DonorGrantRow[]>([]);
  const [email, setEmail] = useState("");
  const [organization, setOrganization] = useState("");
  const [busy, setBusy] = useState(false);

  const reload = () => {
    listProjectDonors(projectId).then(setDonors).catch((e) => toast.error(e.message));
  };
  useEffect(reload, [projectId]);

  if (!canManage) return null;

  const add = async () => {
    if (!email.trim()) return;
    setBusy(true);
    try {
      await grantDonorAccess(projectId, email, organization);
      toast.success("Donor access granted");
      setEmail("");
      setOrganization("");
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not grant access");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
      <div className="mb-3 flex items-center gap-2">
        <Globe className="h-4 w-4 text-primary" />
        <h3 className="font-semibold">Donor portal access</h3>
      </div>
      <p className="mb-4 text-sm text-muted-foreground">
        Donors sign in at <code className="rounded bg-muted px-1">/donor</code> to see this project's Programme Report,
        Logframe and aggregate insights — never individual beneficiary records. The donor must already have a user account.
      </p>

      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <Input type="email" placeholder="Donor's account email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <Input placeholder="Organisation (optional)" value={organization} onChange={(e) => setOrganization(e.target.value)} />
        <Button onClick={add} disabled={busy || !email.trim()} className="shrink-0">Grant access</Button>
      </div>

      {donors.length === 0 ? (
        <p className="text-sm text-muted-foreground">No donors have access yet.</p>
      ) : (
        <ul className="divide-y divide-border">
          {donors.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{d.name || d.email || d.user_id}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {[d.organization, d.email].filter(Boolean).join(" · ")}
                </p>
              </div>
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                Active
                <Switch
                  checked={d.active}
                  onCheckedChange={async (v) => {
                    try { await setDonorActive(d.id, v); reload(); } catch (e) { toast.error(e instanceof Error ? e.message : "Update failed"); }
                  }}
                />
              </label>
              <Button
                variant="ghost" size="icon" aria-label="Remove donor access"
                onClick={async () => {
                  try { await removeDonorAccess(d.id); toast.success("Access removed"); reload(); }
                  catch (e) { toast.error(e instanceof Error ? e.message : "Remove failed"); }
                }}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

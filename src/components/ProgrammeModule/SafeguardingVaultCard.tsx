// Officer-facing controls for the zero-knowledge safeguarding vault:
// first-time key set-up, unlocking for the session, changing the passphrase
// and locking again. Keys and passphrases never leave the device.

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { KeyRound, Lock, LockOpen, ShieldCheck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  changeVaultPassphrase, enrolInVault, lockVault, unlockVault,
  type VaultState,
} from "@/lib/programmeModule/safeguardingVault";

interface Props {
  projectId: string;
  vault: VaultState;
}

type Mode = "enrol" | "unlock" | "change" | null;

const SafeguardingVaultCard = ({ projectId, vault }: Props) => {
  const { toast } = useToast();
  const [mode, setMode] = useState<Mode>(null);
  const [pass, setPass] = useState("");
  const [confirm, setConfirm] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);

  const close = () => { setMode(null); setPass(""); setConfirm(""); setNext(""); };

  const submit = async () => {
    setBusy(true);
    try {
      if (mode === "enrol") {
        if (pass !== confirm) throw new Error("The two passphrases do not match.");
        const fp = await enrolInVault(projectId, pass);
        toast({
          title: "Vault key created",
          description: `Your key fingerprint is ${fp}. If you forget this passphrase the sealed narratives cannot be recovered.`,
        });
      } else if (mode === "unlock") {
        await unlockVault(projectId, pass);
        toast({ title: "Vault open for this session" });
      } else if (mode === "change") {
        if (next !== confirm) throw new Error("The two new passphrases do not match.");
        await changeVaultPassphrase(projectId, pass, next);
        toast({ title: "Passphrase changed" });
      }
      await vault.refresh();
      close();
    } catch (e) {
      toast({ title: "Could not continue", description: (e as Error).message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const lock = () => {
    lockVault();
    void vault.refresh();
    toast({ title: "Vault locked" });
  };

  return (
    <>
      <Card className="flex flex-wrap items-center gap-3 border-slate-200 bg-slate-50 p-4">
        {vault.unlocked
          ? <LockOpen className="h-5 w-5 text-emerald-700" />
          : <Lock className="h-5 w-5 text-slate-600" />}
        <div className="min-w-0 flex-1">
          <h3 className="flex items-center gap-2 font-semibold text-slate-900">
            Safeguarding vault
            <Badge variant="outline" className={vault.unlocked
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-slate-200 bg-white text-slate-700"}>
              {vault.unlocked ? "Open" : vault.enrolled ? "Locked" : "Not set up"}
            </Badge>
          </h3>
          <p className="text-xs text-slate-600">
            Narratives, actions, outcomes and notes are encrypted on your device. Nobody else —
            not even a system administrator — can read them.
            {vault.fingerprint ? ` Your key: ${vault.fingerprint}.` : ""}
            {` ${vault.officersWithKeys} officer${vault.officersWithKeys === 1 ? "" : "s"} can open sealed records.`}
          </p>
        </div>
        {!vault.enrolled && (
          <Button size="sm" className="gap-1" onClick={() => setMode("enrol")}>
            <KeyRound className="h-4 w-4" /> Set up my key
          </Button>
        )}
        {vault.enrolled && !vault.unlocked && (
          <Button size="sm" className="gap-1" onClick={() => setMode("unlock")}>
            <LockOpen className="h-4 w-4" /> Open vault
          </Button>
        )}
        {vault.enrolled && vault.unlocked && (
          <>
            <Button size="sm" variant="outline" className="gap-1" onClick={() => setMode("change")}>
              <ShieldCheck className="h-4 w-4" /> Change passphrase
            </Button>
            <Button size="sm" variant="outline" className="gap-1" onClick={lock}>
              <Lock className="h-4 w-4" /> Lock
            </Button>
          </>
        )}
      </Card>

      <Dialog open={mode !== null} onOpenChange={(v) => { if (!v) close(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {mode === "enrol" && "Set up your safeguarding vault key"}
              {mode === "unlock" && "Open the safeguarding vault"}
              {mode === "change" && "Change your vault passphrase"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {mode === "enrol" && (
              <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                Choose a passphrase of at least 10 characters that you do not use anywhere else.
                It is never sent anywhere, so it cannot be reset — if every officer loses it, the
                sealed narratives can never be read again.
              </p>
            )}
            <div className="space-y-1.5">
              <Label>{mode === "change" ? "Current passphrase" : "Passphrase"}</Label>
              <Input
                type="password" value={pass} autoFocus
                onChange={(e) => setPass(e.target.value)}
                placeholder="Your vault passphrase"
              />
            </div>
            {mode === "change" && (
              <div className="space-y-1.5">
                <Label>New passphrase</Label>
                <Input type="password" value={next} onChange={(e) => setNext(e.target.value)} />
              </div>
            )}
            {(mode === "enrol" || mode === "change") && (
              <div className="space-y-1.5">
                <Label>Confirm {mode === "change" ? "new " : ""}passphrase</Label>
                <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={close}>Cancel</Button>
            <Button onClick={submit} disabled={busy || !pass}>
              {busy ? "Working…" : mode === "unlock" ? "Open vault" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default SafeguardingVaultCard;

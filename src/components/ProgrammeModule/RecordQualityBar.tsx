import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Copy, GitMerge, QrCode, ScanLine } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import BarcodeScanner from "@/components/FormFiller/BarcodeScanner";
import { caseIdFromScan, completenessScore, findDuplicates, missingFields, type DuplicateMatch } from "@/lib/programmeModule/dedupe";
import type { BeneficiaryRow } from "@/lib/programmeModule/types";

interface Props {
  beneficiaries: BeneficiaryRow[];
  canMerge: boolean;
  onOpen: (b: BeneficiaryRow) => void;
  onMerged: () => void;
}

/** Duplicate check, completeness score and Case ID scanning above the register. */
const RecordQualityBar = ({ beneficiaries, canMerge, onOpen, onMerged }: Props) => {
  const [dupOpen, setDupOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [merging, setMerging] = useState<DuplicateMatch | null>(null);
  const [keepId, setKeepId] = useState("");
  const [busy, setBusy] = useState(false);

  const real = beneficiaries.filter((b) => !b.__pending);
  const dups = useMemo(() => findDuplicates(real), [real]);
  const avg = real.length ? Math.round(real.reduce((s, b) => s + completenessScore(b), 0) / real.length) : 0;
  const incomplete = real.filter((b) => completenessScore(b) < 70).length;

  const openByCase = (raw: string) => {
    const id = caseIdFromScan(raw).toLowerCase();
    const hit = beneficiaries.find((b) => (b.case_id || "").toLowerCase() === id);
    if (hit) { setScanOpen(false); onOpen(hit); }
    else toast({ title: "No record found", description: `No beneficiary with Case ID ${caseIdFromScan(raw)}.`, variant: "destructive" });
  };

  // Open a record straight from a scanned QR link (?case=...)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const c = params.get("case");
    if (!c || !beneficiaries.length) return;
    const hit = beneficiaries.find((b) => b.case_id === c);
    if (hit) {
      params.delete("case");
      const q = params.toString();
      window.history.replaceState(null, "", window.location.pathname + (q ? `?${q}` : ""));
      onOpen(hit);
    }
  }, [beneficiaries, onOpen]);

  const doMerge = async () => {
    if (!merging || !keepId) return;
    const drop = merging.a.id === keepId ? merging.b : merging.a;
    setBusy(true);
    const { error } = await supabase.rpc("merge_beneficiaries", { _keep: keepId, _drop: drop.id });
    setBusy(false);
    if (error) { toast({ title: "Merge failed", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Records merged", description: `${drop.case_id} was folded into the kept record.` });
    setMerging(null);
    onMerged();
  };

  return (
    <>
      <Card className="mb-3 flex flex-wrap items-center gap-4 p-3">
        <div className="text-sm">
          <span className="text-muted-foreground">Data completeness </span>
          <span className="font-semibold">{avg}%</span>
          <span className="ml-2 text-xs text-muted-foreground">{incomplete} record(s) under 70%</span>
        </div>
        <Button size="sm" variant="outline" className="gap-1" onClick={() => setDupOpen(true)}>
          <Copy className="h-4 w-4" /> Possible duplicates
          <span className={dups.length ? "font-semibold text-destructive" : "text-muted-foreground"}>({dups.length})</span>
        </Button>
        <Button size="sm" variant="outline" className="ml-auto gap-1" onClick={() => setScanOpen(true)}>
          <ScanLine className="h-4 w-4" /> Scan Case ID
        </Button>
      </Card>

      <CaseScanner open={scanOpen} onOpenChange={setScanOpen} beneficiaries={beneficiaries} onFound={onOpen} />

      <Dialog open={dupOpen} onOpenChange={setDupOpen}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader><DialogTitle>Possible duplicates</DialogTitle></DialogHeader>
          <p className="text-xs text-muted-foreground">Matched on name, age or date of birth, and LGA.</p>
          {dups.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">No likely duplicates found.</p>}
          <div className="space-y-2">
            {dups.map((m) => (
              <div key={m.a.id + m.b.id} className="rounded-lg border p-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold">{m.score}% match</span>
                  <span className="text-muted-foreground">{m.reasons.join(" · ")}</span>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                  {[m.a, m.b].map((b) => (
                    <button key={b.id} className="rounded border p-2 text-left hover:bg-muted/50" onClick={() => { setDupOpen(false); onOpen(b); }}>
                      <div className="font-medium">{b.full_name}</div>
                      <div className="font-mono text-xs text-muted-foreground">{b.case_id}</div>
                      <div className="text-xs text-muted-foreground">Complete {completenessScore(b)}%</div>
                    </button>
                  ))}
                </div>
                {canMerge && (
                  <Button size="sm" className="mt-2 gap-1" onClick={() => { setMerging(m); setKeepId(completenessScore(m.a) >= completenessScore(m.b) ? m.a.id : m.b.id); }}>
                    <GitMerge className="h-4 w-4" /> Merge
                  </Button>
                )}
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!merging} onOpenChange={(o) => !o && setMerging(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Merge records</DialogTitle></DialogHeader>
          {merging && (
            <>
              <p className="text-sm text-muted-foreground">Choose the record to keep. Services, referrals, visits and history from the other move across, blank details are filled in, and the other record is removed.</p>
              <div className="grid grid-cols-2 gap-3">
                {[merging.a, merging.b].map((b) => (
                  <button key={b.id} onClick={() => setKeepId(b.id)}
                    className={`rounded-lg border p-3 text-left text-sm ${keepId === b.id ? "border-primary ring-2 ring-primary/30" : ""}`}>
                    <div className="text-xs font-semibold uppercase text-muted-foreground">{keepId === b.id ? "Keep" : "Merge into kept"}</div>
                    <div className="font-medium">{b.full_name}</div>
                    <div className="font-mono text-xs">{b.case_id}</div>
                    <div className="mt-1 text-xs">LGA: {b.lga || "—"} · Ward: {b.ward || "—"}</div>
                    <div className="text-xs">Complete {completenessScore(b)}%</div>
                    <div className="mt-1 text-xs text-muted-foreground">Missing: {missingFields(b).join(", ") || "none"}</div>
                  </button>
                ))}
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setMerging(null)}>Cancel</Button>
                <Button onClick={doMerge} disabled={busy}>{busy ? "Merging…" : "Merge records"}</Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default RecordQualityBar;

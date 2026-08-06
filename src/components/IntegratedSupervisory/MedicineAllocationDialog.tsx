import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Boxes, Plus, Save, Trash2, Warehouse } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { FEDERAL_SOURCE, MEDICINES, medicineLabel, type Allocation } from "@/lib/isc/medicineAccountability";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  allocations: Allocation[];
  states: string[];
  lgas: string[];
  onSave: (rows: Allocation[]) => void;
}

const blank = (): Allocation => ({
  id: `al_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
  state: "", lga: "", medicine: MEDICINES[0], quantity: 0, dispatchDate: "",
  source: FEDERAL_SOURCE, waybill: "", batch: "", expiry: "", barcode: "",
});

export default function MedicineAllocationDialog({ open, onOpenChange, allocations, states, lgas, onSave }: Props) {
  const [rows, setRows] = useState<Allocation[]>(allocations);

  useEffect(() => { if (open) setRows(allocations.length ? allocations : [blank()]); }, [open, allocations]);

  const total = useMemo(() => rows.reduce((a, r) => a + (Number(r.quantity) || 0), 0), [rows]);
  const stateCount = useMemo(
    () => new Set(rows.map((r) => r.state).filter(Boolean)).size, [rows]);

  const update = (id: string, patch: Partial<Allocation>) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const commit = () => {
    const clean = rows
      .filter((r) => r.state && r.medicine && Number(r.quantity) > 0)
      .map((r) => ({ ...r, source: r.source || FEDERAL_SOURCE }));
    onSave(clean);
    toast({
      title: "Federal allocations saved",
      description: `${clean.length} consignment line${clean.length === 1 ? "" : "s"} · ${total.toLocaleString()} units to ${stateCount} state${stateCount === 1 ? "" : "s"}.`,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Warehouse className="h-5 w-5 text-primary" /> Federal Medical Store, Oshodi — allocations to States
          </DialogTitle>
          <DialogDescription>
            Record every consignment released by the Federal Medical Store in Oshodi to a State medical store. These
            quantities are the national denominators: the State store balance is <em>allocated − dispatched to LGAs
            (Level 0)</em>, and the Federal dispatch date drives Federal → State → LGA lead time. Leave LGA blank for a
            State-level allocation, or name an LGA to record an earmarked sub-allocation.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-md border overflow-x-auto">
          <Table className="min-w-[1180px]">
            <TableHeader>
              <TableRow>
                <TableHead className="whitespace-nowrap">Receiving State</TableHead>
                <TableHead className="whitespace-nowrap">Earmarked LGA (optional)</TableHead>
                <TableHead className="whitespace-nowrap">Medicine</TableHead>
                <TableHead className="whitespace-nowrap">Quantity allocated</TableHead>
                <TableHead className="whitespace-nowrap">Federal dispatch date</TableHead>
                <TableHead className="whitespace-nowrap">Waybill no.</TableHead>
                <TableHead className="whitespace-nowrap">Batch / lot</TableHead>
                <TableHead className="whitespace-nowrap">Expiry</TableHead>
                <TableHead className="whitespace-nowrap">Barcode / QR</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <Input list="alloc-states" className="h-8 min-w-[130px]" value={r.state}
                      onChange={(e) => update(r.id, { state: e.target.value })} placeholder="State" />
                  </TableCell>
                  <TableCell>
                    <Input list="alloc-lgas" className="h-8 min-w-[130px]" value={r.lga}
                      onChange={(e) => update(r.id, { lga: e.target.value })} placeholder="All LGAs" />
                  </TableCell>
                  <TableCell>
                    <Select value={r.medicine} onValueChange={(v) => update(r.id, { medicine: v })}>
                      <SelectTrigger className="h-8 min-w-[180px] text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {MEDICINES.map((m) => <SelectItem key={m} value={m} className="text-xs">{medicineLabel(m)}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Input type="number" min={0} className="h-8 w-32" value={r.quantity}
                      onChange={(e) => update(r.id, { quantity: Math.max(0, Number(e.target.value) || 0) })} />
                  </TableCell>
                  <TableCell>
                    <Input type="date" className="h-8 w-40" value={r.dispatchDate}
                      onChange={(e) => update(r.id, { dispatchDate: e.target.value })} />
                  </TableCell>
                  <TableCell>
                    <Input className="h-8 min-w-[130px]" value={r.waybill ?? ""}
                      onChange={(e) => update(r.id, { waybill: e.target.value })} placeholder="FMS waybill" />
                  </TableCell>
                  <TableCell>
                    <Input className="h-8 min-w-[120px] font-mono text-xs" value={r.batch ?? ""}
                      onChange={(e) => update(r.id, { batch: e.target.value })} placeholder="Batch / lot" />
                  </TableCell>
                  <TableCell>
                    <Input type="date" className="h-8 w-40" value={r.expiry ?? ""}
                      onChange={(e) => update(r.id, { expiry: e.target.value })} />
                  </TableCell>
                  <TableCell>
                    <Input className="h-8 min-w-[150px] font-mono text-xs" value={r.barcode ?? ""}
                      onChange={(e) => update(r.id, { barcode: e.target.value })} placeholder="Scanned code" />
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" onClick={() => setRows((rs) => rs.filter((x) => x.id !== r.id))}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <datalist id="alloc-states">{states.map((s) => <option key={s} value={s} />)}</datalist>
        <datalist id="alloc-lgas">{lgas.map((s) => <option key={s} value={s} />)}</datalist>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button variant="outline" size="sm" onClick={() => setRows((rs) => [...rs, blank()])}>
            <Plus className="h-4 w-4 mr-1" /> Add consignment line
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="border-primary/40 bg-primary/5">
              <Boxes className="h-3 w-3 mr-1" /> {total.toLocaleString()} units allocated
            </Badge>
            <Badge variant="outline">{stateCount} state{stateCount === 1 ? "" : "s"} supplied</Badge>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={commit}><Save className="h-4 w-4 mr-1" /> Save allocations</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

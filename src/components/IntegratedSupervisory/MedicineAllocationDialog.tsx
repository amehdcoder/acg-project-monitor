import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Boxes, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { MEDICINES, medicineLabel, type Allocation } from "@/lib/isc/medicineAccountability";

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
});

export default function MedicineAllocationDialog({ open, onOpenChange, allocations, states, lgas, onSave }: Props) {
  const [rows, setRows] = useState<Allocation[]>(allocations);

  useEffect(() => { if (open) setRows(allocations.length ? allocations : [blank()]); }, [open, allocations]);

  const total = useMemo(() => rows.reduce((a, r) => a + (Number(r.quantity) || 0), 0), [rows]);

  const update = (id: string, patch: Partial<Allocation>) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const commit = () => {
    const clean = rows.filter((r) => r.state && r.medicine && Number(r.quantity) > 0);
    onSave(clean);
    toast({ title: "Allocations saved", description: `${clean.length} allocation line${clean.length === 1 ? "" : "s"} · ${total.toLocaleString()} units.` });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Boxes className="h-5 w-5 text-primary" /> Medicine allocations (State & LGA)
          </DialogTitle>
          <DialogDescription>
            Enter the quantities officially allocated to each State and LGA. These become the denominators for
            allocation fulfilment, balance-at-level and State → LGA cascade lead time (using the dispatch date).
            Leave LGA blank for a State-level allocation.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-md border overflow-x-auto">
          <Table className="min-w-[900px]">
            <TableHeader>
              <TableRow>
                <TableHead className="whitespace-nowrap">State</TableHead>
                <TableHead className="whitespace-nowrap">LGA (optional)</TableHead>
                <TableHead className="whitespace-nowrap">Medicine</TableHead>
                <TableHead className="whitespace-nowrap">Quantity allocated</TableHead>
                <TableHead className="whitespace-nowrap">State dispatch date</TableHead>
                <TableHead className="whitespace-nowrap">Note</TableHead>
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
                    <Input className="h-8 min-w-[140px]" value={r.note ?? ""}
                      onChange={(e) => update(r.id, { note: e.target.value })} placeholder="Waybill / consignment" />
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

        <div className="flex items-center justify-between">
          <Button variant="outline" size="sm" onClick={() => setRows((rs) => [...rs, blank()])}>
            <Plus className="h-4 w-4 mr-1" /> Add allocation line
          </Button>
          <Badge variant="outline" className="border-primary/40 bg-primary/5">
            Total allocated: {total.toLocaleString()} units
          </Badge>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={commit}><Save className="h-4 w-4 mr-1" /> Save allocations</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

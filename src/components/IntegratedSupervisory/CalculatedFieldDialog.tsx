/**
 * Custom calculated field editor. Uses expr-eval so users can write formulas
 * such as `approved / total * 100` or `sum_a + sum_b` against numeric fields.
 */
import { useMemo, useState } from "react";
import { Parser } from "expr-eval";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Calculator } from "lucide-react";
import type { KoboColumn } from "./koboSchema";
import { coerceNumber } from "./koboSchema";

export interface CalculatedField {
  id: string;
  name: string;    // safe identifier (no spaces)
  label: string;   // display label
  formula: string; // expr-eval expression
}

export function computeCalculatedField(formula: string, row: Record<string, unknown>): number | string {
  try {
    const parser = new Parser();
    const expr = parser.parse(formula);
    const scope: Record<string, number> = {};
    for (const [k, v] of Object.entries(row)) scope[k.replace(/[^\w]/g, "_")] = coerceNumber(v);
    return expr.evaluate(scope);
  } catch {
    return "Error";
  }
}

interface Props {
  open: boolean;
  onClose: () => void;
  columns: KoboColumn[];
  sampleRow: Record<string, unknown> | null;
  onSave: (field: CalculatedField) => void;
}

export default function CalculatedFieldDialog({ open, onClose, columns, sampleRow, onSave }: Props) {
  const [label, setLabel] = useState("");
  const [formula, setFormula] = useState("");

  const numeric = useMemo(() => columns.filter((c) => c.type === "number"), [columns]);

  const preview = useMemo(() => {
    if (!formula || !sampleRow) return "—";
    const v = computeCalculatedField(formula, sampleRow);
    return typeof v === "number" ? v.toFixed(2) : String(v);
  }, [formula, sampleRow]);

  const insert = (key: string) => {
    const token = key.replace(/[^\w]/g, "_");
    setFormula((f) => (f ? `${f} ${token}` : token));
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Calculator className="h-5 w-5 text-blue-500" /> New calculated field</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-slate-600">Display label</label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Approval rate %" className="mt-1" />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600">Formula</label>
            <Textarea value={formula} onChange={(e) => setFormula(e.target.value)} placeholder="approved / total * 100" className="mt-1 font-mono text-sm" rows={3} />
            <p className="text-[11px] text-slate-500 mt-1">Supports <code>+ - * /</code>, <code>min()</code>, <code>max()</code>, <code>round()</code> and parentheses.</p>
          </div>
          <div>
            <div className="text-xs font-semibold text-slate-600 mb-1">Numeric fields</div>
            <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
              {numeric.length === 0 && <span className="text-xs text-slate-500 italic">No numeric fields detected. Values are coerced to 0 when non-numeric.</span>}
              {columns.slice(0, 60).map((c) => (
                <button key={c.key} onClick={() => insert(c.key)}>
                  <Badge variant={c.type === "number" ? "default" : "secondary"} className="cursor-pointer hover:opacity-80">{c.label}</Badge>
                </button>
              ))}
            </div>
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded p-3">
            <div className="text-[11px] uppercase font-semibold text-slate-500">Preview (first row)</div>
            <div className="text-2xl font-bold text-slate-900 mt-1">{preview}</div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button disabled={!label.trim() || !formula.trim()} onClick={() => {
            const name = label.trim().replace(/\s+/g, "_").replace(/[^\w]/g, "").toLowerCase();
            onSave({ id: `calc_${Date.now().toString(36)}`, name, label: label.trim(), formula: formula.trim() });
            setLabel(""); setFormula("");
            onClose();
          }}>Save field</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

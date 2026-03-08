import { useState, useEffect } from "react";
import { Check, Columns3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";

export interface ColumnDef {
  key: string;
  label: string;
  isMeta?: boolean;
}

interface ExportColumnPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  columns: ColumnDef[];
  onExport: (selectedKeys: string[]) => void;
  exportFormat: string;
}

const ExportColumnPicker = ({
  open,
  onOpenChange,
  columns,
  onExport,
  exportFormat,
}: ExportColumnPickerProps) => {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Select all by default when dialog opens
  useEffect(() => {
    if (open) {
      setSelected(new Set(columns.map((c) => c.key)));
    }
  }, [open, columns]);

  const metaCols = columns.filter((c) => c.isMeta);
  const formCols = columns.filter((c) => !c.isMeta);

  const toggleColumn = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(columns.map((c) => c.key)));
  const deselectAll = () => setSelected(new Set());
  const selectMeta = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      metaCols.forEach((c) => next.add(c.key));
      return next;
    });
  };
  const selectFormOnly = () => {
    setSelected(new Set(formCols.map((c) => c.key)));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <Columns3 className="h-5 w-5 text-primary" />
            Select Export Columns
          </DialogTitle>
          <DialogDescription>
            Choose which columns to include in the {exportFormat.toUpperCase()} export.
            <span className="ml-1 font-medium text-foreground">
              {selected.size}/{columns.length} selected
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-2 mb-2">
          <Button variant="outline" size="sm" onClick={selectAll}>
            Select All
          </Button>
          <Button variant="outline" size="sm" onClick={deselectAll}>
            Deselect All
          </Button>
          <Button variant="outline" size="sm" onClick={selectMeta}>
            Meta Only
          </Button>
          <Button variant="outline" size="sm" onClick={selectFormOnly}>
            Form Fields Only
          </Button>
        </div>

        <ScrollArea className="max-h-[50vh] pr-4">
          <div className="space-y-4">
            {/* Meta columns */}
            {metaCols.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                  Metadata Columns
                </h4>
                <div className="space-y-1">
                  {metaCols.map((col) => (
                    <label
                      key={col.key}
                      className="flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-muted/50 cursor-pointer transition-colors"
                    >
                      <Checkbox
                        checked={selected.has(col.key)}
                        onCheckedChange={() => toggleColumn(col.key)}
                      />
                      <span className="text-sm">{col.label}</span>
                      <Badge variant="secondary" className="text-[10px] ml-auto">
                        meta
                      </Badge>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Form field columns */}
            {formCols.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                  Form Fields ({formCols.length})
                </h4>
                <div className="space-y-1">
                  {formCols.map((col) => (
                    <label
                      key={col.key}
                      className="flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-muted/50 cursor-pointer transition-colors"
                    >
                      <Checkbox
                        checked={selected.has(col.key)}
                        onCheckedChange={() => toggleColumn(col.key)}
                      />
                      <span className="text-sm">{col.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              onExport(Array.from(selected));
              onOpenChange(false);
            }}
            disabled={selected.size === 0}
          >
            <Check className="h-4 w-4 mr-1" />
            Export {selected.size} Columns
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ExportColumnPicker;

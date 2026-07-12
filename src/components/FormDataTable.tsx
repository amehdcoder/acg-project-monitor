import { useRef, useState } from "react";
import { Pencil, Save, X, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { getFieldLabel, type QuestionLabelMap } from "@/lib/formLabelUtils";
import SyncConflictDialog from "@/components/SyncConflictDialog";
import type { ConflictStrategy } from "@/lib/syncConflict";

/**
 * Describes a single form field for the editor. When a `fieldSpec` is provided,
 * the editor renders one row per descriptor — even for questions that were
 * never answered — so admins can see and edit EVERY field of the form.
 */
export interface FieldDescriptor {
  key: string;
  label: string;
  /** When set, the value lives in this top-level table column (not the JSON blob). */
  column?: string;
  type?: "text" | "number" | "boolean" | "select" | "date" | "longtext";
  options?: string[];
}

interface FormDataTableProps {
  data: Record<string, any>;
  submissionId: string;
  isPending?: boolean;
  readOnly?: boolean;
  questionLabels?: QuestionLabelMap;
  onDataUpdate?: (updatedData: Record<string, any>) => void;
  /** Called with updated top-level column values after a save. */
  onColumnsUpdate?: (updatedColumns: Record<string, any>) => void;
  /** Source table to persist edits to (defaults to form_submissions). */
  table?: string;
  /** JSON column that stores the answers on the table (defaults to "data"). */
  dataColumn?: string;
  /** Ordered list of every field in the form; drives complete-field rendering. */
  fieldSpec?: FieldDescriptor[];
  /** Current values for column-mapped fields (keyed by column name). */
  columnData?: Record<string, any>;
}

// Format a value for display
const formatValue = (value: any): string => {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "string") {
    return value
      .replace(/_/g, " ")
      .replace(/\b\w/g, (l) => l.toUpperCase());
  }
  if (typeof value === "number") return value.toString();
  return String(value);
};

// Check if a value is a GPS/location object
const isGPSValue = (value: any): boolean => {
  return (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    ("lat" in value || "latitude" in value)
  );
};

// Format GPS object
const formatGPS = (value: any): string => {
  const lat = value.lat || value.latitude;
  const lng = value.lng || value.longitude;
  if (!lat || !lng) return "N/A";
  return `${Number(lat).toFixed(6)}, ${Number(lng).toFixed(6)}`;
};

const FormDataTable = ({
  data,
  submissionId,
  isPending = false,
  readOnly = false,
  questionLabels,
  onDataUpdate,
  onColumnsUpdate,
  table = "form_submissions",
  dataColumn = "data",
  fieldSpec,
  columnData,
}: FormDataTableProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);
  // Optimistic-concurrency baseline: the version this device saw when editing
  // began. Used to detect a conflicting edit made by someone else meanwhile.
  const baseVersionRef = useRef<number | null>(null);
  const [conflict, setConflict] = useState<
    { serverData: Record<string, any>; serverVersion: number; localData: Record<string, any> } | null
  >(null);

  const usesGuardedUpdate = table === "form_submissions" && dataColumn === "data";


  // Resolve the current value for a field (from a column or the JSON blob).
  const resolveValue = (f: FieldDescriptor): any =>
    f.column ? columnData?.[f.column] : data?.[f.key];

  type Entry = {
    key: string;
    label: string;
    value: any;
    isGPS: boolean;
    isEditable: boolean;
    descriptor?: FieldDescriptor;
  };

  const entries: Entry[] = fieldSpec
    ? fieldSpec.map((f) => {
        const value = resolveValue(f);
        return {
          key: f.key,
          label: f.label || getFieldLabel(f.key, questionLabels),
          value,
          isGPS: isGPSValue(value),
          isEditable: !isGPSValue(value),
          descriptor: f,
        };
      })
    : Object.entries(data || {}).map(([key, value]) => ({
        key,
        label: getFieldLabel(key, questionLabels),
        value,
        isGPS: isGPSValue(value),
        isEditable:
          !isGPSValue(value) &&
          (typeof value === "string" ||
            typeof value === "number" ||
            typeof value === "boolean" ||
            value === null ||
            value === undefined),
      }));

  const startEditing = () => {
    const editable: Record<string, any> = {};
    entries.forEach(({ key, value, isEditable }) => {
      if (isEditable) {
        editable[key] = value ?? "";
      }
    });
    setEditData(editable);
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setIsEditing(false);
    setEditData({});
  };

  const handleFieldChange = (entry: Entry, newValue: string) => {
    const type = entry.descriptor?.type;
    const original = entry.value;
    let parsed: any = newValue;

    if (type === "number" || typeof original === "number") {
      parsed = newValue === "" ? null : Number(newValue);
    } else if (type === "boolean" || typeof original === "boolean") {
      parsed = newValue === "true" || newValue === "Yes";
    }

    setEditData((prev) => ({ ...prev, [entry.key]: parsed }));
  };

  const saveChanges = async () => {
    setSaving(true);
    try {
      const answersObj = { ...(data || {}) };
      const updatedColumns: Record<string, any> = { ...(columnData || {}) };
      const dbUpdate: Record<string, any> = {};

      // Track per-field changes so we can write an audit trail.
      const changes: {
        field_key: string;
        field_label: string;
        old_value: any;
        new_value: any;
      }[] = [];
      const labelFor = (key: string) =>
        entries.find((e) => e.key === key)?.label || getFieldLabel(key, questionLabels);
      const recordChange = (key: string, oldVal: any, newVal: any) => {
        const a = oldVal ?? "";
        const b = newVal ?? "";
        if (String(a) !== String(b)) {
          changes.push({ field_key: key, field_label: labelFor(key), old_value: oldVal, new_value: newVal });
        }
      };

      if (fieldSpec) {
        for (const f of fieldSpec) {
          if (!(f.key in editData)) continue;
          const val = editData[f.key];
          const prev = f.column ? columnData?.[f.column] : data?.[f.key];
          recordChange(f.key, prev, val);
          if (f.column) {
            dbUpdate[f.column] = val;
            updatedColumns[f.column] = val;
          } else {
            answersObj[f.key] = val;
          }
        }
        dbUpdate[dataColumn] = answersObj;
      } else {
        for (const [k, val] of Object.entries(editData)) {
          recordChange(k, (data || {})[k], val);
        }
        Object.assign(answersObj, editData);
        dbUpdate[dataColumn] = answersObj;
      }

      if (!isPending) {
        const { error } = await supabase
          .from(table as any)
          .update(dbUpdate as any)
          .eq("id", submissionId);

        if (error) throw error;

        // Persist a per-field audit trail (best-effort; never blocks the save).
        if (changes.length > 0) {
          try {
            const { data: authData } = await supabase.auth.getUser();
            const uid = authData?.user?.id;
            const meta = authData?.user?.user_metadata as any;
            const name =
              meta?.full_name || meta?.name || authData?.user?.email || "Unknown user";
            const stringify = (v: any) =>
              v === null || v === undefined
                ? null
                : typeof v === "object"
                ? JSON.stringify(v)
                : String(v);
            if (uid) {
              await supabase.from("submission_edit_audit" as any).insert(
                changes.map((c) => ({
                  submission_id: submissionId,
                  table_name: table,
                  field_key: c.field_key,
                  field_label: c.field_label,
                  old_value: stringify(c.old_value),
                  new_value: stringify(c.new_value),
                  source: "admin_edit",
                  changed_by: uid,
                  changed_by_name: name,
                })),
              );
            }
          } catch (auditErr) {
            console.warn("Audit log write failed:", auditErr);
          }
        }
      }

      onDataUpdate?.(answersObj);
      onColumnsUpdate?.(updatedColumns);
      setIsEditing(false);
      setEditData({});
      toast({
        title: "Data updated",
        description: "Submission data has been saved successfully.",
      });
    } catch (err: any) {
      toast({
        title: "Update failed",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const renderEditor = (entry: Entry) => {
    const desc = entry.descriptor;
    const current = editData[entry.key];

    // Boolean → Yes/No select
    if (desc?.type === "boolean" || typeof entry.value === "boolean") {
      return (
        <Select
          value={String(current ?? entry.value ?? "false")}
          onValueChange={(v) => handleFieldChange(entry, v)}
        >
          <SelectTrigger className="h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="true">Yes</SelectItem>
            <SelectItem value="false">No</SelectItem>
          </SelectContent>
        </Select>
      );
    }

    // Select with options
    if (desc?.type === "select" && desc.options && desc.options.length > 0) {
      return (
        <Select
          value={String(current ?? entry.value ?? "")}
          onValueChange={(v) => handleFieldChange(entry, v)}
        >
          <SelectTrigger className="h-8 text-sm">
            <SelectValue placeholder="Select…" />
          </SelectTrigger>
          <SelectContent>
            {desc.options.map((opt) => (
              <SelectItem key={opt} value={opt}>
                {opt}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }

    // Date
    if (desc?.type === "date") {
      return (
        <Input
          type="date"
          className="h-8 text-sm"
          value={String(current ?? entry.value ?? "")}
          onChange={(e) => handleFieldChange(entry, e.target.value)}
        />
      );
    }

    // Number
    if (desc?.type === "number" || typeof entry.value === "number") {
      return (
        <Input
          type="number"
          className="h-8 text-sm"
          value={current ?? entry.value ?? ""}
          onChange={(e) => handleFieldChange(entry, e.target.value)}
        />
      );
    }

    // Default text
    return (
      <Input
        className="h-8 text-sm"
        value={String(current ?? entry.value ?? "")}
        onChange={(e) => handleFieldChange(entry, e.target.value)}
      />
    );
  };

  return (
    <div className="border-t pt-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="font-medium text-foreground">Form Data</h4>
        <div className="flex gap-2">
          {isEditing ? (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={cancelEditing}
                disabled={saving}
              >
                <X className="h-4 w-4 mr-1" />
                Cancel
              </Button>
              <Button
                variant="acg"
                size="sm"
                onClick={saveChanges}
                disabled={saving}
              >
                <Save className="h-4 w-4 mr-1" />
                {saving ? "Saving..." : "Save"}
              </Button>
            </>
          ) : readOnly ? null : (
            <Button variant="outline" size="sm" onClick={startEditing}>
              <Pencil className="h-4 w-4 mr-1" />
              Edit
            </Button>
          )}
        </div>
      </div>

      <div className="rounded-lg border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="w-[40%] font-semibold">Field</TableHead>
              <TableHead className="font-semibold">Value</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map((entry) => {
              const { key, label, value, isGPS, isEditable } = entry;
              return (
                <TableRow key={key}>
                  <TableCell className="font-medium text-muted-foreground text-sm py-2.5">
                    {label}
                  </TableCell>
                  <TableCell className="text-sm py-2.5">
                    {isEditing && isEditable ? (
                      renderEditor(entry)
                    ) : isGPS ? (
                      <div className="flex items-center gap-2">
                        <MapPin className="h-3.5 w-3.5 text-primary shrink-0" />
                        <span className="font-mono text-xs">
                          {formatGPS(value)}
                        </span>
                        {value?.accuracy && (
                          <Badge variant="secondary" className="text-[10px]">
                            ±{Math.round(value.accuracy)}m
                          </Badge>
                        )}
                      </div>
                    ) : typeof value === "object" && value !== null ? (
                      <span className="text-xs text-muted-foreground italic">
                        {Array.isArray(value)
                          ? value.map(formatValue).join(", ")
                          : JSON.stringify(value)}
                      </span>
                    ) : (
                      <span
                        className={
                          value === null || value === undefined || value === ""
                            ? "text-muted-foreground italic"
                            : ""
                        }
                      >
                        {formatValue(value) || "—"}
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default FormDataTable;

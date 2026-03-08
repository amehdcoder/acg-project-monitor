import { useState } from "react";
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

interface FormDataTableProps {
  data: Record<string, any>;
  submissionId: string;
  isPending?: boolean;
  questionLabels?: QuestionLabelMap;
  onDataUpdate?: (updatedData: Record<string, any>) => void;
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
  questionLabels,
  onDataUpdate,
}: FormDataTableProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);

  const entries = Object.entries(data || {}).map(([key, value]) => ({
    key,
    label: getFieldLabel(key, questionLabels),
    value,
    isGPS: isGPSValue(value),
    isEditable:
      !isGPSValue(value) &&
      (typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean" ||
        value === null),
  }));

  const startEditing = () => {
    const editable: Record<string, any> = {};
    entries.forEach(({ key, value, isEditable }) => {
      if (isEditable) {
        editable[key] = value;
      }
    });
    setEditData(editable);
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setIsEditing(false);
    setEditData({});
  };

  const handleFieldChange = (key: string, newValue: string) => {
    const original = data[key];
    let parsed: any = newValue;

    if (typeof original === "number") {
      parsed = newValue === "" ? null : Number(newValue);
    } else if (typeof original === "boolean") {
      parsed = newValue === "true" || newValue === "Yes";
    }

    setEditData((prev) => ({ ...prev, [key]: parsed }));
  };

  const saveChanges = async () => {
    setSaving(true);
    try {
      const updatedData = { ...data, ...editData };

      if (!isPending) {
        const { error } = await supabase
          .from("form_submissions")
          .update({ data: updatedData })
          .eq("id", submissionId);

        if (error) throw error;
      }

      onDataUpdate?.(updatedData);
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
          ) : (
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
            {entries.map(({ key, label, value, isGPS, isEditable }) => (
              <TableRow key={key}>
                <TableCell className="font-medium text-muted-foreground text-sm py-2.5">
                  {label}
                </TableCell>
                <TableCell className="text-sm py-2.5">
                  {isEditing && isEditable ? (
                    typeof data[key] === "boolean" ? (
                      <Select
                        value={String(editData[key] ?? value)}
                        onValueChange={(v) => handleFieldChange(key, v)}
                      >
                        <SelectTrigger className="h-8 text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="true">Yes</SelectItem>
                          <SelectItem value="false">No</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        className="h-8 text-sm"
                        value={String(editData[key] ?? value ?? "")}
                        onChange={(e) => handleFieldChange(key, e.target.value)}
                      />
                    )
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
                        value === null || value === undefined
                          ? "text-muted-foreground italic"
                          : ""
                      }
                    >
                      {formatValue(value) || "—"}
                    </span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default FormDataTable;

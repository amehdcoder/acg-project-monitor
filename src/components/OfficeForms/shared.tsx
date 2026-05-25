import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";

export interface BaseFormProps {
  projectId?: string | null;
  onBack: () => void;
}

export function FormSection({ title, subtitle, children, accent }: { title: string; subtitle?: string; children: React.ReactNode; accent?: string }) {
  return (
    <Card className="border border-border/60 shadow-sm overflow-hidden">
      <div className="px-5 py-3.5 border-b border-border/60 bg-muted/30">
        <h3 className="font-semibold text-sm text-foreground flex items-center gap-2">
          {accent && <span className="h-2 w-2 rounded-full" style={{ background: accent }} />}
          {title}
        </h3>
        {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
      <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">{children}</div>
    </Card>
  );
}

export function Field({ label, required, children, colSpan }: { label: string; required?: boolean; children: React.ReactNode; colSpan?: number }) {
  return (
    <div className={colSpan === 2 ? "sm:col-span-2" : ""}>
      <Label className="text-xs font-medium">{label}{required && <span className="text-destructive ml-0.5">*</span>}</Label>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

export function SaveBar({ onSave, saving, accent, label = "Submit" }: { onSave: () => void; saving: boolean; accent: string; label?: string }) {
  return (
    <div className="flex items-center justify-end gap-2 pt-2">
      <Button onClick={onSave} disabled={saving} style={{ background: accent }} className="text-white hover:opacity-90">
        <Save className="h-4 w-4 mr-1.5" />
        {saving ? "Submitting…" : label}
      </Button>
    </div>
  );
}

export async function submitOfficeForm(
  formCode: "srf" | "incident" | "leave" | "stationery",
  data: Record<string, any>,
  userId: string | undefined,
  projectId: string | null | undefined,
) {
  if (!userId) throw new Error("Not signed in");
  const { data: row, error } = await supabase
    .from("office_form_submissions" as any)
    .insert({ form_code: formCode, data, submitted_by: userId, project_id: projectId || null })
    .select()
    .single();
  if (error) throw error;
  return row as any;
}

export { useState, Input, Textarea, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, useAuth, toast };

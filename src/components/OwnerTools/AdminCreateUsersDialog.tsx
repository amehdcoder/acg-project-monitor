/**
 * Owner / Admin account creation tool.
 *
 * Lets the Owner or an assigned admin create user accounts by entering only
 * Name, Email and Designation in a beautifully formatted table. Each created
 * user instantly receives an email with their credentials, the app link and the
 * Owner's contact details. Supports exporting a branded Excel template and
 * importing a filled template for bulk creation.
 */

import { useMemo, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "@/hooks/use-toast";
import {
  UserPlus, Loader2, Plus, Trash2, Download, Upload, CheckCircle2, XCircle,
  Mail, MailWarning, AlertCircle,
} from "lucide-react";
import {
  exportAccountTemplate, importAccountTemplate, type AccountRow,
} from "@/lib/accountBulk";

const DESIGNATIONS = [
  { value: "independent_monitor", label: "Independent Monitor" },
  { value: "enumerator", label: "Enumerator" },
  { value: "data_collector", label: "Data Collector" },
  { value: "electronic_data_manager", label: "Electronic Data Manager (EDM)" },
  { value: "community_directed_distributor", label: "Community Directed Distributor (CDD)" },
  { value: "flhf_supervisor", label: "FLHF Supervisor" },
  { value: "lga_supervisor", label: "LGA Supervisor" },
  { value: "state_supervisor", label: "State Supervisor" },
  { value: "hands_staff", label: "HANDS Staff" },
  { value: "cbmg_staff", label: "CBMG Staff" },
  { value: "cbmi_staff", label: "CBMI Staff" },
  { value: "sightsavers_staff", label: "Sightsavers Staff" },
  { value: "plan_intl_staff", label: "Plan Int'l Staff" },
  { value: "sci_staff", label: "SCI Staff" },
  { value: "other", label: "Other (Please Specify)" },
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface Row {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  designation: string;
}

interface RowResult {
  email: string;
  name: string;
  status: "created" | "failed";
  account_created: boolean;
  email_sent: boolean;
  error?: string;
}

const blankRow = (): Row => ({
  id: crypto.randomUUID(),
  first_name: "",
  last_name: "",
  email: "",
  designation: "",
});

export default function AdminCreateUsersDialog() {
  const { isOwner, isAdmin } = useAuth();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Row[]>([blankRow(), blankRow(), blankRow()]);
  const [saving, setSaving] = useState(false);
  const [results, setResults] = useState<RowResult[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const labelFor = (v: string) => DESIGNATIONS.find((d) => d.value === v)?.label ?? v;

  const emailState = (email: string): "empty" | "valid" | "invalid" => {
    const e = email.trim();
    if (!e) return "empty";
    return EMAIL_RE.test(e) ? "valid" : "invalid";
  };

  const duplicateEmails = useMemo(() => {
    const seen = new Map<string, number>();
    rows.forEach((r) => {
      const e = r.email.trim().toLowerCase();
      if (e) seen.set(e, (seen.get(e) ?? 0) + 1);
    });
    return new Set([...seen.entries()].filter(([, n]) => n > 1).map(([e]) => e));
  }, [rows]);

  const validRows = useMemo(
    () =>
      rows.filter(
        (r) =>
          r.first_name.trim() &&
          emailState(r.email) === "valid" &&
          r.designation &&
          !duplicateEmails.has(r.email.trim().toLowerCase()),
      ),
    [rows, duplicateEmails],
  );

  if (!isOwner && !isAdmin) return null;

  const update = (id: string, patch: Partial<Row>) =>
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const addRow = () => setRows((prev) => [...prev, blankRow()]);
  const removeRow = (id: string) =>
    setRows((prev) => (prev.length > 1 ? prev.filter((r) => r.id !== id) : prev));

  const handleExport = async () => {
    try {
      await exportAccountTemplate(DESIGNATIONS);
      toast({ title: "Template downloaded", description: "Branded account template is ready to fill." });
    } catch (e: any) {
      toast({ title: "Export failed", description: e?.message, variant: "destructive" });
    }
  };

  const handleImport = async (file: File) => {
    try {
      const { rows: imported } = await importAccountTemplate(file, DESIGNATIONS);
      if (imported.length === 0) {
        toast({ title: "Nothing imported", description: "No filled rows found in the file.", variant: "destructive" });
        return;
      }
      setRows(
        imported.map((r: AccountRow) => ({
          id: crypto.randomUUID(),
          first_name: r.first_name,
          last_name: r.last_name,
          email: r.email,
          designation: r.designation,
        })),
      );
      setResults([]);
      toast({ title: "Imported", description: `${imported.length} row(s) loaded. Review then create accounts.` });
    } catch (e: any) {
      toast({ title: "Import failed", description: e?.message, variant: "destructive" });
    }
  };

  const handleCreate = async () => {
    if (validRows.length === 0) {
      toast({ title: "Nothing to create", description: "Add at least one valid row.", variant: "destructive" });
      return;
    }
    setSaving(true);
    setResults([]);
    try {
      const payload = {
        users: validRows.map((r) => ({
          first_name: r.first_name.trim(),
          last_name: r.last_name.trim(),
          email: r.email.trim().toLowerCase(),
          designation: r.designation,
          designation_label: labelFor(r.designation),
        })),
      };
      const { data, error } = await supabase.functions.invoke("admin-create-user", { body: payload });
      if (error) throw error;
      const res: RowResult[] = (data?.results ?? []) as RowResult[];
      setResults(res);
      const ok = res.filter((r) => r.account_created).length;
      const mailed = res.filter((r) => r.email_sent).length;
      const failed = res.length - ok;
      toast({
        title: failed > 0 ? "Completed with issues" : "Accounts created",
        description: `${ok} created · ${mailed} email(s) delivered${failed ? ` · ${failed} failed` : ""}.`,
        variant: failed > 0 ? "destructive" : undefined,
      });
    } catch (e: any) {
      toast({ title: "Creation failed", description: e?.message ?? "Could not create accounts.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const resultFor = (email: string) =>
    results.find((r) => r.email.toLowerCase() === email.trim().toLowerCase());

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="gold" size="sm" className="gap-2">
          <UserPlus className="h-4 w-4" />
          Create Accounts
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-5xl max-h-[92vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-primary" /> Create User Accounts
          </DialogTitle>
          <DialogDescription>
            Enter each person's name, email and designation. They instantly receive a
            branded email from <b>info@amehnities.org</b> with their login details and the app link.
          </DialogDescription>
        </DialogHeader>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2 border-b pb-3">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={handleExport}>
            <Download className="h-4 w-4" /> Export template
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => fileRef.current?.click()}>
            <Upload className="h-4 w-4" /> Import filled template
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleImport(f);
              e.target.value = "";
            }}
          />
          <span className="ml-auto text-xs text-muted-foreground">
            {validRows.length} ready · {rows.length} row(s)
          </span>
        </div>

        {/* Table */}
        <ScrollArea className="flex-1 min-h-0">
          <div className="min-w-[760px]">
            {/* Header */}
            <div className="grid grid-cols-[1.1fr_1.1fr_1.6fr_1.4fr_auto] gap-2 px-2 py-2 sticky top-0 z-10 bg-gradient-to-r from-primary/10 to-acg-gold/10 rounded-md text-xs font-semibold text-foreground">
              <div>First Name</div>
              <div>Last Name</div>
              <div>Email Address</div>
              <div>Designation</div>
              <div className="w-16 text-center">Status</div>
            </div>

            <div className="space-y-1.5 mt-2">
              {rows.map((r, idx) => {
                const es = emailState(r.email);
                const dup = !!r.email.trim() && duplicateEmails.has(r.email.trim().toLowerCase());
                const result = resultFor(r.email);
                return (
                  <div
                    key={r.id}
                    className={`grid grid-cols-[1.1fr_1.1fr_1.6fr_1.4fr_auto] gap-2 items-start px-2 py-1.5 rounded-md ${
                      idx % 2 ? "bg-muted/30" : "bg-background"
                    } hover:bg-muted/50 transition-colors`}
                  >
                    <Input
                      value={r.first_name}
                      placeholder="First name"
                      onChange={(e) => update(r.id, { first_name: e.target.value })}
                      className="h-9"
                    />
                    <Input
                      value={r.last_name}
                      placeholder="Last name"
                      onChange={(e) => update(r.id, { last_name: e.target.value })}
                      className="h-9"
                    />
                    <div className="space-y-1">
                      <div className="relative">
                        <Input
                          value={r.email}
                          placeholder="name@example.com"
                          onChange={(e) => update(r.id, { email: e.target.value })}
                          className={`h-9 pr-8 ${
                            es === "invalid" || dup
                              ? "border-destructive focus-visible:ring-destructive"
                              : es === "valid"
                              ? "border-emerald-500"
                              : ""
                          }`}
                        />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2">
                          {es === "valid" && !dup && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
                          {es === "invalid" && <AlertCircle className="h-4 w-4 text-destructive" />}
                        </span>
                      </div>
                      {es === "invalid" && (
                        <p className="text-[10px] text-destructive">Not a valid email address</p>
                      )}
                      {dup && es !== "invalid" && (
                        <p className="text-[10px] text-destructive">Duplicate email</p>
                      )}
                    </div>
                    <Select value={r.designation} onValueChange={(v) => update(r.id, { designation: v })}>
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="Select" />
                      </SelectTrigger>
                      <SelectContent>
                        {DESIGNATIONS.map((d) => (
                          <SelectItem key={d.value} value={d.value}>
                            {d.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="flex items-center gap-1 w-16 justify-center pt-1.5">
                      {result ? (
                        result.account_created ? (
                          result.email_sent ? (
                            <Mail className="h-4 w-4 text-emerald-500" />
                          ) : (
                            <MailWarning className="h-4 w-4 text-amber-500" />
                          )
                        ) : (
                          <XCircle className="h-4 w-4 text-destructive" />
                        )
                      ) : (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={() => removeRow(r.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <Button variant="ghost" size="sm" className="gap-1.5 mt-2" onClick={addRow}>
              <Plus className="h-4 w-4" /> Add row
            </Button>
          </div>
        </ScrollArea>

        {/* Results summary */}
        {results.length > 0 && (
          <div className="border-t pt-3 space-y-2 max-h-32 overflow-auto">
            {results.map((r, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                {r.account_created ? (
                  <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-0">Created</Badge>
                ) : (
                  <Badge variant="destructive">Failed</Badge>
                )}
                {r.account_created && (
                  r.email_sent ? (
                    <Badge variant="outline" className="gap-1 text-emerald-600 border-emerald-500/40">
                      <Mail className="h-3 w-3" /> Email sent
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="gap-1 text-amber-600 border-amber-500/40">
                      <MailWarning className="h-3 w-3" /> Email not delivered
                    </Badge>
                  )
                )}
                <span className="font-medium">{r.name || r.email}</span>
                {r.error && <span className="text-muted-foreground truncate">— {r.error}</span>}
              </div>
            ))}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t pt-3">
          <Button variant="outline" onClick={() => setOpen(false)}>Close</Button>
          <Button onClick={handleCreate} disabled={saving || validRows.length === 0} className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
            Create {validRows.length > 0 ? validRows.length : ""} account{validRows.length === 1 ? "" : "s"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

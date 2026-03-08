import { useState, useMemo, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  MapPin, Search, ChevronLeft, ChevronRight, ArrowUp, ArrowDown, ArrowUpDown,
  Pencil, Save, X, Trash2, CheckCircle2, ShieldCheck,
} from "lucide-react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import type { SubmissionRecord } from "@/hooks/useDataAnalytics";
import { cleanFieldKey } from "@/lib/formLabelUtils";

interface SubmissionsTableProps {
  submissions: SubmissionRecord[];
  loading?: boolean;
  pageSize?: number;
  questionLabels?: Record<string, string>;
  onSubmissionUpdate?: (id: string, updatedData: Record<string, any>) => void;
  onSubmissionDelete?: (id: string) => void;
  onSubmissionValidate?: (id: string) => void;
}

type SortDirection = "asc" | "desc" | null;
interface SortConfig { key: string; direction: SortDirection; }

const isGPSValue = (value: any): boolean =>
  value && typeof value === "object" && !Array.isArray(value) && ("lat" in value || "latitude" in value);

const formatCellValue = (value: any): string => {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return value.toLocaleString();
  if (typeof value === "string") return value.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
  if (Array.isArray(value)) return value.map(formatCellValue).join(", ");
  if (isGPSValue(value)) {
    return `${Number(value.lat || value.latitude).toFixed(4)}, ${Number(value.lng || value.longitude).toFixed(4)}`;
  }
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
};

const getRawSortValue = (value: any): string | number => {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "number") return value;
  if (typeof value === "string") return value.toLowerCase();
  return formatCellValue(value).toLowerCase();
};

const formatDate = (dateString: string) => {
  if (!dateString) return "—";
  return new Date(dateString).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

const SortIcon = ({ direction }: { direction: SortDirection }) => {
  if (direction === "asc") return <ArrowUp className="h-3 w-3 ml-1 inline" />;
  if (direction === "desc") return <ArrowDown className="h-3 w-3 ml-1 inline" />;
  return <ArrowUpDown className="h-3 w-3 ml-1 inline opacity-40" />;
};

const SubmissionsTable = ({
  submissions, loading, pageSize = 20, questionLabels,
  onSubmissionUpdate, onSubmissionDelete, onSubmissionValidate,
}: SubmissionsTableProps) => {
  const [currentPage, setCurrentPage] = useState(1);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortConfig>({ key: "", direction: null });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const toggleSort = (key: string) => {
    setSort((prev) => {
      if (prev.key !== key) return { key, direction: "asc" };
      if (prev.direction === "asc") return { key, direction: "desc" };
      return { key: "", direction: null };
    });
    setCurrentPage(1);
  };

  const dataColumns = useMemo(() => {
    const keySet = new Set<string>();
    submissions.forEach((s) => {
      if (s.data && typeof s.data === "object") Object.keys(s.data).forEach((k) => keySet.add(k));
    });
    return Array.from(keySet);
  }, [submissions]);

  const filtered = useMemo(() => {
    if (!search.trim()) return submissions;
    const q = search.toLowerCase();
    return submissions.filter((s) => {
      if (s.submitter_name?.toLowerCase().includes(q)) return true;
      if (s.location?.toLowerCase().includes(q)) return true;
      if (s.data) return Object.values(s.data).some((v) => formatCellValue(v).toLowerCase().includes(q));
      return false;
    });
  }, [submissions, search]);

  const sorted = useMemo(() => {
    if (!sort.key || !sort.direction) return filtered;
    const dir = sort.direction === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      let aVal: any, bVal: any;
      if (sort.key === "submitter_name") { aVal = (a.submitter_name || "").toLowerCase(); bVal = (b.submitter_name || "").toLowerCase(); }
      else if (sort.key === "submitted_at") { aVal = a.submitted_at || ""; bVal = b.submitted_at || ""; }
      else if (sort.key === "status") { aVal = a.status || ""; bVal = b.status || ""; }
      else { aVal = getRawSortValue(a.data?.[sort.key]); bVal = getRawSortValue(b.data?.[sort.key]); }
      if (typeof aVal === "number" && typeof bVal === "number") return (aVal - bVal) * dir;
      return String(aVal).localeCompare(String(bVal)) * dir;
    });
  }, [filtered, sort]);

  const totalPages = Math.ceil(sorted.length / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const paginated = sorted.slice(startIndex, startIndex + pageSize);

  const getColumnLabel = (key: string) => {
    if (questionLabels && questionLabels[key]) return questionLabels[key];
    return cleanFieldKey(key);
  };

  // --- Editing ---
  const startEdit = (submission: SubmissionRecord) => {
    setEditingId(submission.id);
    setEditData({ ...submission.data });
  };

  const cancelEdit = () => { setEditingId(null); setEditData({}); };

  const handleFieldChange = (key: string, newValue: string, originalValue: any) => {
    let parsed: any = newValue;
    if (typeof originalValue === "number") parsed = newValue === "" ? null : Number(newValue);
    else if (typeof originalValue === "boolean") parsed = newValue === "true" || newValue === "Yes";
    setEditData((prev) => ({ ...prev, [key]: parsed }));
  };

  const saveEdit = async (submissionId: string) => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("form_submissions")
        .update({ data: editData })
        .eq("id", submissionId);
      if (error) throw error;
      onSubmissionUpdate?.(submissionId, editData);
      setEditingId(null);
      setEditData({});
      toast({ title: "Saved", description: "Submission data updated successfully." });
    } catch (err: any) {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  // --- Validate (mark as sent/finalized) ---
  const validateSubmission = async (submissionId: string) => {
    try {
      const { error } = await supabase
        .from("form_submissions")
        .update({ status: "sent" })
        .eq("id", submissionId);
      if (error) throw error;
      onSubmissionValidate?.(submissionId);
      toast({ title: "Validated", description: "Submission marked as validated." });
    } catch (err: any) {
      toast({ title: "Validation failed", description: err.message, variant: "destructive" });
    }
  };

  // --- Delete ---
  const deleteSubmission = async (submissionId: string) => {
    try {
      const { error } = await supabase
        .from("form_submissions")
        .delete()
        .eq("id", submissionId);
      if (error) throw error;
      onSubmissionDelete?.(submissionId);
      setSelectedIds((prev) => { const n = new Set(prev); n.delete(submissionId); return n; });
      toast({ title: "Deleted", description: "Submission deleted successfully." });
    } catch (err: any) {
      toast({ title: "Delete failed", description: err.message, variant: "destructive" });
    }
  };

  const bulkDelete = async () => {
    setBulkDeleting(true);
    try {
      const ids = Array.from(selectedIds);
      const { error } = await supabase
        .from("form_submissions")
        .delete()
        .in("id", ids);
      if (error) throw error;
      ids.forEach((id) => onSubmissionDelete?.(id));
      setSelectedIds(new Set());
      toast({ title: "Deleted", description: `${ids.length} submission(s) deleted.` });
    } catch (err: any) {
      toast({ title: "Bulk delete failed", description: err.message, variant: "destructive" });
    } finally {
      setBulkDeleting(false);
    }
  };

  // --- Selection ---
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === paginated.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(paginated.map((s) => s.id)));
    }
  };

  const isEditable = (value: any) =>
    !isGPSValue(value) && (typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value === null);

  const SortableHead = ({ sortKey, children, className = "" }: { sortKey: string; children: React.ReactNode; className?: string }) => (
    <TableHead className={`cursor-pointer select-none hover:bg-muted/70 transition-colors ${className}`} onClick={() => toggleSort(sortKey)}>
      <span className="inline-flex items-center">{children}<SortIcon direction={sort.key === sortKey ? sort.direction : null} /></span>
    </TableHead>
  );

  if (loading) {
    return (
      <Card className="border-0 shadow-card">
        <CardHeader><CardTitle className="font-display">Submissions</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-4 animate-pulse">
            {[1, 2, 3, 4, 5].map((i) => <div key={i} className="h-12 bg-muted rounded" />)}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-0 shadow-card">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <CardTitle className="font-display">
            Submissions <span className="text-sm font-normal text-muted-foreground">({sorted.length.toLocaleString()})</span>
          </CardTitle>
          {selectedIds.size > 0 && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm" disabled={bulkDeleting}>
                  <Trash2 className="h-4 w-4 mr-1" />
                  Delete {selectedIds.size}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete {selectedIds.size} submission(s)?</AlertDialogTitle>
                  <AlertDialogDescription>This action cannot be undone. The selected submissions will be permanently removed.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={bulkDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search submissions..." value={search} onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }} className="pl-9 h-9" />
        </div>
      </CardHeader>
      <CardContent>
        {sorted.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">No submissions found.</div>
        ) : (
          <>
            <div className="overflow-x-auto rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="sticky left-0 z-10 bg-muted/90 backdrop-blur-sm w-[40px] text-center">
                      <Checkbox
                        checked={paginated.length > 0 && selectedIds.size === paginated.length}
                        onCheckedChange={toggleSelectAll}
                      />
                    </TableHead>
                    <TableHead className="min-w-[40px] text-center">S/N</TableHead>
                    <SortableHead sortKey="submitter_name" className="min-w-[130px]">Submitted By</SortableHead>
                    <SortableHead sortKey="submitted_at" className="min-w-[110px]">Date</SortableHead>
                    <SortableHead sortKey="status" className="min-w-[80px]">Status</SortableHead>
                    {dataColumns.map((key) => (
                      <SortableHead key={key} sortKey={key} className="min-w-[140px] max-w-[220px]">{getColumnLabel(key)}</SortableHead>
                    ))}
                    <TableHead className="min-w-[140px] text-center">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginated.map((submission, idx) => {
                    const isEditing = editingId === submission.id;
                    return (
                      <TableRow key={submission.id} className={selectedIds.has(submission.id) ? "bg-primary/5" : ""}>
                        <TableCell className="sticky left-0 z-10 bg-background text-center">
                          <Checkbox
                            checked={selectedIds.has(submission.id)}
                            onCheckedChange={() => toggleSelect(submission.id)}
                          />
                        </TableCell>
                        <TableCell className="text-center text-xs text-muted-foreground font-mono">
                          {startIndex + idx + 1}
                        </TableCell>
                        <TableCell className="text-sm font-medium whitespace-nowrap">{submission.submitter_name || "—"}</TableCell>
                        <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{formatDate(submission.submitted_at)}</TableCell>
                        <TableCell>
                          <Badge
                            variant={submission.status === "sent" ? "default" : "secondary"}
                            className={submission.status === "sent" ? "bg-green-100 text-green-700 hover:bg-green-100" : "bg-yellow-100 text-yellow-700 hover:bg-yellow-100"}
                          >
                            {submission.status === "sent" ? "validated" : "pending"}
                          </Badge>
                        </TableCell>
                        {dataColumns.map((key) => {
                          const value = isEditing ? (editData[key] ?? submission.data?.[key]) : submission.data?.[key];
                          const originalValue = submission.data?.[key];

                          if (isEditing && isEditable(originalValue)) {
                            return (
                              <TableCell key={key} className="text-sm max-w-[220px]">
                                <Input
                                  className="h-7 text-sm"
                                  value={value === null || value === undefined ? "" : String(value)}
                                  onChange={(e) => handleFieldChange(key, e.target.value, originalValue)}
                                />
                              </TableCell>
                            );
                          }

                          return (
                            <TableCell key={key} className="text-sm max-w-[220px]">
                              {isGPSValue(value) ? (
                                <div className="flex items-center gap-1">
                                  <MapPin className="h-3 w-3 text-primary shrink-0" />
                                  <span className="font-mono text-xs truncate">{formatCellValue(value)}</span>
                                </div>
                              ) : (
                                <span className={`truncate block ${value === null || value === undefined ? "text-muted-foreground" : ""}`}>
                                  {formatCellValue(value)}
                                </span>
                              )}
                            </TableCell>
                          );
                        })}
                        <TableCell className="text-center">
                          {isEditing ? (
                            <div className="flex items-center justify-center gap-1">
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={cancelEdit} disabled={saving}>
                                <X className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-primary" onClick={() => saveEdit(submission.id)} disabled={saving}>
                                <Save className="h-4 w-4" />
                              </Button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-center gap-1">
                              <Button variant="ghost" size="icon" className="h-7 w-7" title="Edit" onClick={() => startEdit(submission)}>
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              {submission.status !== "sent" && (
                                <Button
                                  variant="ghost" size="icon" className="h-7 w-7 text-green-600" title="Validate"
                                  onClick={() => validateSubmission(submission.id)}
                                >
                                  <ShieldCheck className="h-3.5 w-3.5" />
                                </Button>
                              )}
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" title="Delete">
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Delete this submission?</AlertDialogTitle>
                                    <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction onClick={() => deleteSubmission(submission.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            <div className="mt-4 flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Showing {startIndex + 1}–{Math.min(startIndex + pageSize, sorted.length)} of {sorted.length.toLocaleString()}
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1}>
                  <ChevronLeft className="h-4 w-4 mr-1" />Previous
                </Button>
                <Button variant="outline" size="sm" onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages || totalPages === 0}>
                  Next<ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default SubmissionsTable;

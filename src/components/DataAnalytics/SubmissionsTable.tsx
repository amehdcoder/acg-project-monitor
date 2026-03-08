import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { MapPin, Search, ChevronLeft, ChevronRight } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { SubmissionRecord } from "@/hooks/useDataAnalytics";
import { cleanFieldKey } from "@/lib/formLabelUtils";

interface SubmissionsTableProps {
  submissions: SubmissionRecord[];
  loading?: boolean;
  pageSize?: number;
  questionLabels?: Record<string, string>;
}

const isGPSValue = (value: any): boolean =>
  value && typeof value === "object" && !Array.isArray(value) && ("lat" in value || "latitude" in value);

const formatCellValue = (value: any): string => {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return value.toLocaleString();
  if (typeof value === "string") {
    return value.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
  }
  if (Array.isArray(value)) return value.map(formatCellValue).join(", ");
  if (isGPSValue(value)) {
    const lat = value.lat || value.latitude;
    const lng = value.lng || value.longitude;
    return `${Number(lat).toFixed(4)}, ${Number(lng).toFixed(4)}`;
  }
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
};

const formatDate = (dateString: string) => {
  if (!dateString) return "—";
  return new Date(dateString).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const SubmissionsTable = ({ submissions, loading, pageSize = 20, questionLabels }: SubmissionsTableProps) => {
  const [currentPage, setCurrentPage] = useState(1);
  const [search, setSearch] = useState("");

  // Extract all unique data keys from submissions to build dynamic columns
  const dataColumns = useMemo(() => {
    const keySet = new Set<string>();
    submissions.forEach((s) => {
      if (s.data && typeof s.data === "object") {
        Object.keys(s.data).forEach((k) => keySet.add(k));
      }
    });
    return Array.from(keySet);
  }, [submissions]);

  // Filter submissions by search
  const filtered = useMemo(() => {
    if (!search.trim()) return submissions;
    const q = search.toLowerCase();
    return submissions.filter((s) => {
      if (s.submitter_name?.toLowerCase().includes(q)) return true;
      if (s.location?.toLowerCase().includes(q)) return true;
      if (s.data) {
        return Object.values(s.data).some((v) =>
          formatCellValue(v).toLowerCase().includes(q)
        );
      }
      return false;
    });
  }, [submissions, search]);

  const totalPages = Math.ceil(filtered.length / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const paginated = filtered.slice(startIndex, startIndex + pageSize);

  const getColumnLabel = (key: string) => {
    if (questionLabels && questionLabels[key]) return questionLabels[key];
    return cleanFieldKey(key);
  };

  if (loading) {
    return (
      <Card className="border-0 shadow-card">
        <CardHeader>
          <CardTitle className="font-display">Submissions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4 animate-pulse">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-12 bg-muted rounded" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-0 shadow-card">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle className="font-display">
          Submissions{" "}
          <span className="text-sm font-normal text-muted-foreground">
            ({filtered.length.toLocaleString()})
          </span>
        </CardTitle>
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search submissions..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setCurrentPage(1);
            }}
            className="pl-9 h-9"
          />
        </div>
      </CardHeader>
      <CardContent>
        {filtered.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No submissions found.
          </div>
        ) : (
          <>
            <div className="overflow-x-auto rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="sticky left-0 z-10 bg-muted/90 backdrop-blur-sm min-w-[40px] text-center">
                      S/N
                    </TableHead>
                    <TableHead className="min-w-[130px]">Submitted By</TableHead>
                    <TableHead className="min-w-[110px]">Date</TableHead>
                    <TableHead className="min-w-[80px]">Status</TableHead>
                    {dataColumns.map((key) => (
                      <TableHead key={key} className="min-w-[140px] max-w-[220px]">
                        {getColumnLabel(key)}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginated.map((submission, idx) => (
                    <TableRow key={submission.id}>
                      <TableCell className="sticky left-0 z-10 bg-background text-center text-xs text-muted-foreground font-mono">
                        {startIndex + idx + 1}
                      </TableCell>
                      <TableCell className="text-sm font-medium whitespace-nowrap">
                        {submission.submitter_name || "—"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {formatDate(submission.submitted_at)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={submission.status === "sent" ? "default" : "secondary"}
                          className={
                            submission.status === "sent"
                              ? "bg-green-100 text-green-700 hover:bg-green-100"
                              : "bg-yellow-100 text-yellow-700 hover:bg-yellow-100"
                          }
                        >
                          {submission.status === "sent" ? "synced" : "pending"}
                        </Badge>
                      </TableCell>
                      {dataColumns.map((key) => {
                        const value = submission.data?.[key];
                        return (
                          <TableCell key={key} className="text-sm max-w-[220px]">
                            {isGPSValue(value) ? (
                              <div className="flex items-center gap-1">
                                <MapPin className="h-3 w-3 text-primary shrink-0" />
                                <span className="font-mono text-xs truncate">
                                  {formatCellValue(value)}
                                </span>
                              </div>
                            ) : (
                              <span className={`truncate block ${value === null || value === undefined ? "text-muted-foreground" : ""}`}>
                                {formatCellValue(value)}
                              </span>
                            )}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="mt-4 flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Showing {startIndex + 1}–{Math.min(startIndex + pageSize, filtered.length)} of{" "}
                {filtered.length.toLocaleString()}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages || totalPages === 0}
                >
                  Next
                  <ChevronRight className="h-4 w-4 ml-1" />
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

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { SubmissionRecord } from "@/hooks/useDataAnalytics";

interface SubmissionsTableProps {
  submissions: SubmissionRecord[];
  loading?: boolean;
  pageSize?: number;
}

const SubmissionsTable = ({ submissions, loading, pageSize = 10 }: SubmissionsTableProps) => {
  const [currentPage, setCurrentPage] = useState(1);

  const totalPages = Math.ceil(submissions.length / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const paginatedSubmissions = submissions.slice(startIndex, startIndex + pageSize);

  const handlePrevious = () => {
    setCurrentPage((prev) => Math.max(1, prev - 1));
  };

  const handleNext = () => {
    setCurrentPage((prev) => Math.min(totalPages, prev + 1));
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return "N/A";
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  if (loading) {
    return (
      <Card className="border-0 shadow-card">
        <CardHeader>
          <CardTitle className="font-display">Recent Submissions</CardTitle>
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
      <CardHeader>
        <CardTitle className="font-display">Recent Submissions</CardTitle>
      </CardHeader>
      <CardContent>
        {submissions.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No submissions found for the selected filters.
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="pb-3 text-left text-sm font-medium text-muted-foreground">
                      Form
                    </th>
                    <th className="pb-3 text-left text-sm font-medium text-muted-foreground">
                      Submitted By
                    </th>
                    <th className="pb-3 text-left text-sm font-medium text-muted-foreground">
                      Location
                    </th>
                    <th className="pb-3 text-left text-sm font-medium text-muted-foreground">
                      Date
                    </th>
                    <th className="pb-3 text-left text-sm font-medium text-muted-foreground">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {paginatedSubmissions.map((submission) => (
                    <tr key={submission.id} className="hover:bg-muted/50">
                      <td className="py-4 text-sm font-medium text-foreground">
                        {submission.form_name}
                      </td>
                      <td className="py-4 text-sm text-muted-foreground">
                        {submission.submitter_name}
                      </td>
                      <td className="py-4 text-sm text-muted-foreground">
                        {submission.location}
                      </td>
                      <td className="py-4 text-sm text-muted-foreground">
                        {formatDate(submission.submitted_at)}
                      </td>
                      <td className="py-4">
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
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
              <p className="text-sm text-muted-foreground">
                Showing {startIndex + 1}-{Math.min(startIndex + pageSize, submissions.length)} of{" "}
                {submissions.length.toLocaleString()} entries
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handlePrevious}
                  disabled={currentPage === 1}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleNext}
                  disabled={currentPage === totalPages || totalPages === 0}
                >
                  Next
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

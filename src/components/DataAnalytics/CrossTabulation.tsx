import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Download, Table2, BarChart3 } from "lucide-react";
import { SubmissionRecord } from "@/hooks/useDataAnalytics";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import * as XLSX from "xlsx";
import { format } from "date-fns";
import { getFieldLabel, buildLabelMap } from "@/lib/formLabelUtils";

interface Props {
  submissions: SubmissionRecord[];
  questions: any[];
  formName: string;
}

const CHART_COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--accent))",
  "#f59e0b",
  "#10b981",
  "#8b5cf6",
  "#ec4899",
  "#06b6d4",
  "#f97316",
];

const CrossTabulation = ({ submissions, questions, formName }: Props) => {
  const [rowField, setRowField] = useState<string>("");
  const [colField, setColField] = useState<string>("");
  const [viewMode, setViewMode] = useState<"table" | "chart">("table");

  // Extract categorical fields from questions
  const categoricalFields = useMemo(() => {
    const fields: { id: string; label: string }[] = [];
    const labelMap = buildLabelMap(questions);

    // From form questions
    const flatQuestions = questions.flatMap((q: any) =>
      q.questions ? q.questions : [q]
    );
    flatQuestions.forEach((q: any) => {
      if (
        q.type === "select_one" ||
        q.type === "select_multiple" ||
        q.type === "radio" ||
        q.type === "checkbox" ||
        q.type === "dropdown"
      ) {
        fields.push({
          id: q.id || q.name,
          label: q.label || q.name || q.id,
        });
      }
    });

    // Also detect categorical fields from data (fields with <= 20 unique values)
    if (submissions.length > 0) {
      const allKeys = new Set<string>();
      submissions.slice(0, 50).forEach((s) => {
        Object.keys(s.data || {}).forEach((k) => allKeys.add(k));
      });

      allKeys.forEach((key) => {
        if (fields.some((f) => f.id === key)) return;
        const values = submissions
          .map((s) => s.data?.[key])
          .filter((v) => v !== null && v !== undefined && typeof v !== "object");
        const unique = new Set(values);
        if (unique.size >= 2 && unique.size <= 25 && values.length > 0) {
          fields.push({
            id: key,
            label: getFieldLabel(key, labelMap),
          });
        }
      });
    }

    return fields;
  }, [questions, submissions]);

  // Build cross-tabulation matrix
  const { matrix, rowValues, colValues, totals } = useMemo(() => {
    if (!rowField || !colField) {
      return { matrix: {}, rowValues: [], colValues: [], totals: { rows: {}, cols: {}, grand: 0 } };
    }

    const mat: Record<string, Record<string, number>> = {};
    const rowSet = new Set<string>();
    const colSet = new Set<string>();
    const rowTotals: Record<string, number> = {};
    const colTotals: Record<string, number> = {};
    let grandTotal = 0;

    submissions.forEach((s) => {
      const rv = String(s.data?.[rowField] ?? "");
      const cv = String(s.data?.[colField] ?? "");
      if (!rv || !cv) return;

      rowSet.add(rv);
      colSet.add(cv);

      if (!mat[rv]) mat[rv] = {};
      mat[rv][cv] = (mat[rv][cv] || 0) + 1;
      rowTotals[rv] = (rowTotals[rv] || 0) + 1;
      colTotals[cv] = (colTotals[cv] || 0) + 1;
      grandTotal++;
    });

    return {
      matrix: mat,
      rowValues: Array.from(rowSet).sort(),
      colValues: Array.from(colSet).sort(),
      totals: { rows: rowTotals, cols: colTotals, grand: grandTotal },
    };
  }, [submissions, rowField, colField]);

  // Chart data for visualization
  const chartData = useMemo(() => {
    return rowValues.map((rv) => {
      const item: Record<string, any> = { name: rv.length > 20 ? rv.slice(0, 20) + "…" : rv };
      colValues.forEach((cv) => {
        item[cv] = matrix[rv]?.[cv] || 0;
      });
      return item;
    });
  }, [matrix, rowValues, colValues]);

  const exportCrossTab = () => {
    const labelMap = buildLabelMap(questions);
    const rowLabel = getFieldLabel(rowField, labelMap);
    const colLabel = getFieldLabel(colField, labelMap);

    const headers = [rowLabel, ...colValues, "Total"];
    const rows = rowValues.map((rv) => [
      rv,
      ...colValues.map((cv) => matrix[rv]?.[cv] || 0),
      totals.rows[rv] || 0,
    ]);
    rows.push(["Total", ...colValues.map((cv) => totals.cols[cv] || 0), totals.grand]);

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
      [`Cross-Tabulation: ${rowLabel} × ${colLabel}`],
      [`Form: ${formName}`],
      [`Generated: ${format(new Date(), "dd MMM yyyy, HH:mm")}`],
      [],
      headers,
      ...rows,
    ]);
    ws["!cols"] = headers.map(() => ({ wch: 18 }));
    XLSX.utils.book_append_sheet(wb, ws, "Cross-Tab");
    XLSX.writeFile(wb, `CrossTab_${format(new Date(), "yyyy-MM-dd")}.xlsx`);
  };

  const hasData = rowValues.length > 0 && colValues.length > 0;

  return (
    <Card className="border-0 shadow-card">
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <CardTitle className="font-display text-lg flex items-center gap-2">
            <Table2 className="h-5 w-5 text-primary" />
            Cross-Tabulation
          </CardTitle>
          {hasData && (
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="h-8"
                onClick={() => setViewMode(viewMode === "table" ? "chart" : "table")}
              >
                {viewMode === "table" ? (
                  <BarChart3 className="h-3.5 w-3.5 mr-1.5" />
                ) : (
                  <Table2 className="h-3.5 w-3.5 mr-1.5" />
                )}
                {viewMode === "table" ? "Chart" : "Table"}
              </Button>
              <Button variant="outline" size="sm" className="h-8" onClick={exportCrossTab}>
                <Download className="h-3.5 w-3.5 mr-1.5" />
                Export
              </Button>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Field selectors */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Row Variable</label>
            <Select value={rowField} onValueChange={setRowField}>
              <SelectTrigger>
                <SelectValue placeholder="Select row field" />
              </SelectTrigger>
              <SelectContent>
                {categoricalFields
                  .filter((f) => f.id !== colField)
                  .map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.label}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Column Variable</label>
            <Select value={colField} onValueChange={setColField}>
              <SelectTrigger>
                <SelectValue placeholder="Select column field" />
              </SelectTrigger>
              <SelectContent>
                {categoricalFields
                  .filter((f) => f.id !== rowField)
                  .map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.label}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {!rowField || !colField ? (
          <div className="text-center py-8">
            <Table2 className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">
              Select two categorical fields above to generate a cross-tabulation matrix.
            </p>
          </div>
        ) : !hasData ? (
          <div className="text-center py-8">
            <p className="text-sm text-muted-foreground">No data available for the selected fields.</p>
          </div>
        ) : viewMode === "table" ? (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50">
                  <th className="text-left py-2.5 px-3 font-medium text-muted-foreground border-r border-border sticky left-0 bg-muted/50 z-10">
                    {categoricalFields.find((f) => f.id === rowField)?.label || rowField}
                  </th>
                  {colValues.map((cv) => (
                    <th key={cv} className="text-center py-2.5 px-3 font-medium text-muted-foreground whitespace-nowrap">
                      {cv}
                    </th>
                  ))}
                  <th className="text-center py-2.5 px-3 font-bold text-foreground border-l border-border">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {rowValues.map((rv, ri) => (
                  <tr key={rv} className={ri % 2 === 0 ? "bg-background" : "bg-muted/20"}>
                    <td className="py-2 px-3 font-medium text-foreground border-r border-border sticky left-0 bg-inherit z-10 whitespace-nowrap">
                      {rv}
                    </td>
                    {colValues.map((cv) => {
                      const val = matrix[rv]?.[cv] || 0;
                      const pct = totals.grand > 0 ? ((val / totals.grand) * 100).toFixed(1) : "0";
                      return (
                        <td key={cv} className="text-center py-2 px-3">
                          {val > 0 ? (
                            <div>
                              <span className="font-mono font-semibold text-foreground">{val}</span>
                              <span className="text-[10px] text-muted-foreground ml-1">({pct}%)</span>
                            </div>
                          ) : (
                            <span className="text-muted-foreground/40">—</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="text-center py-2 px-3 font-bold border-l border-border">
                      {totals.rows[rv] || 0}
                    </td>
                  </tr>
                ))}
                {/* Totals row */}
                <tr className="border-t-2 border-border bg-muted/30 font-bold">
                  <td className="py-2.5 px-3 sticky left-0 bg-muted/30 z-10 border-r border-border">Total</td>
                  {colValues.map((cv) => (
                    <td key={cv} className="text-center py-2.5 px-3">{totals.cols[cv] || 0}</td>
                  ))}
                  <td className="text-center py-2.5 px-3 border-l border-border">{totals.grand}</td>
                </tr>
              </tbody>
            </table>
          </div>
        ) : (
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  interval={0}
                  angle={-30}
                  textAnchor="end"
                  height={60}
                />
                <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                    fontSize: 12,
                  }}
                />
                {colValues.map((cv, i) => (
                  <Bar key={cv} dataKey={cv} stackId="a" fill={CHART_COLORS[i % CHART_COLORS.length]} radius={i === colValues.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {hasData && (
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{totals.grand} observations across {rowValues.length} × {colValues.length} categories</span>
            <Badge variant="outline" className="text-[10px]">
              {rowValues.length * colValues.length} cells
            </Badge>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default CrossTabulation;

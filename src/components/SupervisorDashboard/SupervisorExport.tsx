import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { UserStatus } from "@/hooks/useSupervisorDashboard";
import { toast } from "@/hooks/use-toast";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import { format } from "date-fns";

interface Props {
  users: UserStatus[];
  dateRange: { from: Date; to: Date };
}

const DESIGNATION_LABELS: Record<string, string> = {
  independent_monitor: "Independent Monitor",
  enumerator: "Enumerator",
  data_collector: "Data Collector",
  electronic_data_manager: "EDM",
  community_directed_distributor: "CDD",
  flhf_supervisor: "FLHF Supervisor",
  lga_supervisor: "LGA Supervisor",
  state_supervisor: "State Supervisor",
  hands_staff: "HANDS Staff",
  cbmg_staff: "CBMG Staff",
  cbmi_staff: "CBMI Staff",
  sightsavers_staff: "Sightsavers",
  plan_intl_staff: "Plan Int'l",
  sci_staff: "SCI",
  other: "Other",
};

const ROLE_LABELS: Record<string, string> = {
  super_admin: "Super Admin",
  systems_admin: "Systems Admin",
  user: "User",
};

const buildRows = (users: UserStatus[]) =>
  users.map((u) => ({
    Name: `${u.first_name} ${u.last_name}`,
    Email: u.email,
    Role: ROLE_LABELS[u.role || "user"] || "User",
    Designation: DESIGNATION_LABELS[u.designation] || u.designation,
    State: u.state || "",
    LGA: u.lga || "",
    Status: u.status,
    "Submissions Today": u.submissions_today,
    "Submissions (Range)": u.submissions_total,
    "Geofence Compliance %": u.geofence_compliance,
    "Assigned Forms": u.assigned_forms.length,
    "Assigned Projects": u.assigned_projects.length,
    "Last Active": u.last_submission_at
      ? format(new Date(u.last_submission_at), "yyyy-MM-dd HH:mm")
      : "Never",
    "Account Active": u.is_active ? "Yes" : "No",
  }));

const exportCSV = (users: UserStatus[], dateRange: Props["dateRange"]) => {
  const rows = buildRows(users);
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "User Activity");
  const filename = `supervisor-activity-${format(dateRange.from, "yyyyMMdd")}-${format(dateRange.to, "yyyyMMdd")}.csv`;
  XLSX.writeFile(wb, filename, { bookType: "csv" });
  toast({ title: "CSV exported", description: `${rows.length} users exported.` });
};

const exportExcel = (users: UserStatus[], dateRange: Props["dateRange"]) => {
  const rows = buildRows(users);
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "User Activity");
  const filename = `supervisor-activity-${format(dateRange.from, "yyyyMMdd")}-${format(dateRange.to, "yyyyMMdd")}.xlsx`;
  XLSX.writeFile(wb, filename);
  toast({ title: "Excel exported", description: `${rows.length} users exported.` });
};

const exportPDF = (users: UserStatus[], dateRange: Props["dateRange"]) => {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();

  // Title
  doc.setFontSize(16);
  doc.text("Supervisor Dashboard — User Activity Report", 14, 15);
  doc.setFontSize(10);
  doc.text(
    `Period: ${format(dateRange.from, "MMM d, yyyy")} – ${format(dateRange.to, "MMM d, yyyy")}  |  Generated: ${format(new Date(), "MMM d, yyyy HH:mm")}`,
    14,
    22
  );
  doc.text(`Total Users: ${users.length}  |  Active: ${users.filter((u) => u.status === "active").length}  |  Idle: ${users.filter((u) => u.status === "idle").length}  |  Offline: ${users.filter((u) => u.status === "offline").length}`, 14, 28);

  // Table header
  const headers = ["Name", "Role", "Designation", "State", "Status", "Today", "Total", "Geofence%", "Last Active"];
  const colWidths = [45, 28, 35, 30, 20, 16, 16, 22, 38];
  let y = 36;

  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  let x = 14;
  headers.forEach((h, i) => {
    doc.text(h, x, y);
    x += colWidths[i];
  });
  y += 2;
  doc.setDrawColor(180);
  doc.line(14, y, pageWidth - 14, y);
  y += 4;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);

  users.forEach((u) => {
    if (y > doc.internal.pageSize.getHeight() - 15) {
      doc.addPage();
      y = 15;
      // Re-draw header
      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      let hx = 14;
      headers.forEach((h, i) => {
        doc.text(h, hx, y);
        hx += colWidths[i];
      });
      y += 2;
      doc.line(14, y, pageWidth - 14, y);
      y += 4;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
    }

    const row = [
      `${u.first_name} ${u.last_name}`,
      ROLE_LABELS[u.role || "user"] || "User",
      DESIGNATION_LABELS[u.designation] || u.designation,
      u.state || "—",
      u.status,
      String(u.submissions_today),
      String(u.submissions_total),
      `${u.geofence_compliance}%`,
      u.last_submission_at ? format(new Date(u.last_submission_at), "MMM d HH:mm") : "Never",
    ];

    x = 14;
    row.forEach((cell, i) => {
      const maxW = colWidths[i] - 2;
      const truncated = doc.getTextWidth(cell) > maxW ? cell.substring(0, Math.floor(maxW / 2)) + "…" : cell;
      doc.text(truncated, x, y);
      x += colWidths[i];
    });
    y += 5;
  });

  const filename = `supervisor-activity-${format(dateRange.from, "yyyyMMdd")}-${format(dateRange.to, "yyyyMMdd")}.pdf`;
  doc.save(filename);
  toast({ title: "PDF exported", description: `${users.length} users exported.` });
};

const SupervisorExport = ({ users, dateRange }: Props) => {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5">
          <Download className="h-3.5 w-3.5" />
          Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => exportCSV(users, dateRange)}>
          Export as CSV
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => exportExcel(users, dateRange)}>
          Export as Excel
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => exportPDF(users, dateRange)}>
          Export as PDF
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default SupervisorExport;

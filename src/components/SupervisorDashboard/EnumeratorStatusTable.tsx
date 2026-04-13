import { useState } from "react";
import { Search, ChevronDown, ChevronUp, MapPin, Clock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EnumeratorStatus } from "@/hooks/useSupervisorDashboard";
import { useLanguage } from "@/hooks/useLanguage";
import { formatDistanceToNow } from "date-fns";

interface Props {
  enumerators: EnumeratorStatus[];
}

const STATUS_CONFIG = {
  active: { label: "Active", className: "bg-green-500/15 text-green-700 border-green-500/30" },
  idle: { label: "Idle", className: "bg-amber-500/15 text-amber-700 border-amber-500/30" },
  offline: { label: "Offline", className: "bg-muted text-muted-foreground border-border" },
};

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

const EnumeratorStatusTable = ({ enumerators }: Props) => {
  const { t } = useLanguage();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"name" | "submissions" | "status" | "compliance">("status");
  const [sortAsc, setSortAsc] = useState(false);

  const filtered = enumerators
    .filter(e => {
      const matchesSearch = `${e.first_name} ${e.last_name} ${e.email} ${e.state || ""}`
        .toLowerCase().includes(search.toLowerCase());
      const matchesStatus = statusFilter === "all" || e.status === statusFilter;
      return matchesSearch && matchesStatus;
    })
    .sort((a, b) => {
      let cmp = 0;
      switch (sortBy) {
        case "name": cmp = `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`); break;
        case "submissions": cmp = a.submissions_today - b.submissions_today; break;
        case "status": {
          const order = { active: 0, idle: 1, offline: 2 };
          cmp = order[a.status] - order[b.status];
          break;
        }
        case "compliance": cmp = (a.geofence_compliance ?? -1) - (b.geofence_compliance ?? -1); break;
      }
      return sortAsc ? cmp : -cmp;
    });

  const toggleSort = (col: typeof sortBy) => {
    if (sortBy === col) setSortAsc(!sortAsc);
    else { setSortBy(col); setSortAsc(false); }
  };

  const SortIcon = ({ col }: { col: typeof sortBy }) => {
    if (sortBy !== col) return null;
    return sortAsc ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />;
  };

  return (
    <Card className="border-0 shadow-card">
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <CardTitle className="font-display text-lg">{t("supervisor.enumerator_status")}</CardTitle>
          <div className="flex items-center gap-2">
            <div className="relative flex-1 sm:w-64">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t("common.search") + "..."}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-32 h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("common.all")}</SelectItem>
                <SelectItem value="active">{t("common.active")}</SelectItem>
                <SelectItem value="idle">{t("common.idle")}</SelectItem>
                <SelectItem value="offline">{t("common.offline")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="text-left py-2 px-3 font-medium">
                  <button className="flex items-center gap-1" onClick={() => toggleSort("name")}>
                    Name <SortIcon col="name" />
                  </button>
                </th>
                <th className="text-left py-2 px-3 font-medium hidden md:table-cell">Designation</th>
                <th className="text-left py-2 px-3 font-medium hidden lg:table-cell">Location</th>
                <th className="text-center py-2 px-3 font-medium">
                  <button className="flex items-center gap-1 mx-auto" onClick={() => toggleSort("status")}>
                    Status <SortIcon col="status" />
                  </button>
                </th>
                <th className="text-center py-2 px-3 font-medium">
                  <button className="flex items-center gap-1 mx-auto" onClick={() => toggleSort("submissions")}>
                    Today <SortIcon col="submissions" />
                  </button>
                </th>
                <th className="text-center py-2 px-3 font-medium hidden sm:table-cell">
                  <button className="flex items-center gap-1 mx-auto" onClick={() => toggleSort("compliance")}>
                    Geofence <SortIcon col="compliance" />
                  </button>
                </th>
                <th className="text-right py-2 px-3 font-medium hidden lg:table-cell">Last Active</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => (
                <tr key={e.user_id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                  <td className="py-3 px-3">
                    <div>
                      <p className="font-medium text-foreground">{e.first_name} {e.last_name}</p>
                      <p className="text-xs text-muted-foreground md:hidden">{DESIGNATION_LABELS[e.designation] || e.designation}</p>
                    </div>
                  </td>
                  <td className="py-3 px-3 hidden md:table-cell text-muted-foreground">
                    {DESIGNATION_LABELS[e.designation] || e.designation}
                  </td>
                  <td className="py-3 px-3 hidden lg:table-cell">
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <MapPin className="h-3 w-3" />
                      <span className="text-xs">{e.state || "—"}{e.lga ? `, ${e.lga}` : ""}</span>
                    </div>
                  </td>
                  <td className="py-3 px-3 text-center">
                    <Badge variant="outline" className={STATUS_CONFIG[e.status].className}>
                      <span className={`mr-1.5 h-1.5 w-1.5 rounded-full inline-block ${
                        e.status === "active" ? "bg-green-500 animate-pulse" :
                        e.status === "idle" ? "bg-amber-500" : "bg-muted-foreground"
                      }`} />
                      {STATUS_CONFIG[e.status].label}
                    </Badge>
                  </td>
                  <td className="py-3 px-3 text-center">
                    <span className={`font-mono font-semibold ${
                      e.submissions_today === 0 ? "text-muted-foreground" :
                      e.submissions_today >= 5 ? "text-green-600" : "text-foreground"
                    }`}>
                      {e.submissions_today}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-center hidden sm:table-cell">
                    {e.geofence_compliance !== null ? (
                      <span className={`font-mono text-xs ${
                        e.geofence_compliance >= 90 ? "text-green-600" :
                        e.geofence_compliance >= 70 ? "text-amber-600" : "text-destructive"
                      }`}>
                        {e.geofence_compliance}%
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">N/A</span>
                    )}
                  </td>
                  <td className="py-3 px-3 text-right hidden lg:table-cell">
                    <span className="text-xs text-muted-foreground flex items-center justify-end gap-1">
                      <Clock className="h-3 w-3" />
                      {e.last_submission_at
                        ? formatDistanceToNow(new Date(e.last_submission_at), { addSuffix: true })
                        : "Never"}
                    </span>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-muted-foreground">
                    No enumerators found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted-foreground mt-3 text-right">
          Showing {filtered.length} of {enumerators.length} enumerators
        </p>
      </CardContent>
    </Card>
  );
};

export default EnumeratorStatusTable;

import { useState } from "react";
import { Search, ChevronDown, ChevronUp, MapPin, Clock, Mail, Phone, Shield, Eye, EyeOff, UserCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { UserStatus } from "@/hooks/useSupervisorDashboard";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";
import { formatDistanceToNow, format } from "date-fns";

interface Props {
  users: UserStatus[];
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

const ROLE_LABELS: Record<string, { label: string; color: string }> = {
  super_admin: { label: "Super Admin", color: "bg-destructive/15 text-destructive border-destructive/30" },
  systems_admin: { label: "Systems Admin", color: "bg-acg-gold/15 text-acg-gold border-acg-gold/30" },
  user: { label: "User", color: "bg-muted text-muted-foreground border-border" },
};

const UserStatusTable = ({ users }: Props) => {
  const { t } = useLanguage();
  const { isSuperAdmin } = useAuth();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"name" | "submissions" | "status" | "compliance" | "role">("status");
  const [sortAsc, setSortAsc] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserStatus | null>(null);

  const filtered = users
    .filter(e => {
      const matchesSearch = `${e.first_name} ${e.last_name} ${e.email} ${e.state || ""} ${e.designation}`
        .toLowerCase().includes(search.toLowerCase());
      const matchesStatus = statusFilter === "all" || e.status === statusFilter;
      const matchesRole = roleFilter === "all" || e.role === roleFilter;
      return matchesSearch && matchesStatus && matchesRole;
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
        case "compliance": cmp = a.geofence_compliance - b.geofence_compliance; break;
        case "role": {
          const order: Record<string, number> = { super_admin: 0, systems_admin: 1, user: 2 };
          cmp = (order[a.role || "user"] || 3) - (order[b.role || "user"] || 3);
          break;
        }
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
    <>
      <Card className="border-0 shadow-card">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <CardTitle className="font-display text-lg">All Users Activity</CardTitle>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative flex-1 sm:w-56">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search users..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 h-9"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-28 h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="idle">Idle</SelectItem>
                  <SelectItem value="offline">Offline</SelectItem>
                </SelectContent>
              </Select>
              <Select value={roleFilter} onValueChange={setRoleFilter}>
                <SelectTrigger className="w-32 h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Roles</SelectItem>
                  <SelectItem value="super_admin">Super Admin</SelectItem>
                  <SelectItem value="systems_admin">Systems Admin</SelectItem>
                  <SelectItem value="user">User</SelectItem>
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
                  <th className="text-left py-2 px-3 font-medium hidden md:table-cell">
                    <button className="flex items-center gap-1" onClick={() => toggleSort("role")}>
                      Role <SortIcon col="role" />
                    </button>
                  </th>
                  <th className="text-left py-2 px-3 font-medium hidden lg:table-cell">Designation</th>
                  <th className="text-left py-2 px-3 font-medium hidden xl:table-cell">Location</th>
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
                  <th className="text-right py-2 px-3 font-medium hidden lg:table-cell">Last Seen</th>
                  <th className="text-center py-2 px-3 font-medium w-10">Info</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((e) => {
                  const roleInfo = ROLE_LABELS[e.role || "user"] || ROLE_LABELS.user;
                  return (
                    <tr key={e.user_id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                      <td className="py-3 px-3">
                        <div>
                          <div className="flex items-center gap-1.5">
                            <p className="font-medium text-foreground">{e.first_name} {e.last_name}</p>
                            {!e.is_active && (
                              <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 border-destructive/30 text-destructive">
                                Inactive
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground md:hidden">{DESIGNATION_LABELS[e.designation] || e.designation}</p>
                        </div>
                      </td>
                      <td className="py-3 px-3 hidden md:table-cell">
                        <Badge variant="outline" className={`text-[10px] ${roleInfo.color}`}>
                          {roleInfo.label}
                        </Badge>
                      </td>
                      <td className="py-3 px-3 hidden lg:table-cell text-muted-foreground text-xs">
                        {DESIGNATION_LABELS[e.designation] || e.designation}
                      </td>
                      <td className="py-3 px-3 hidden xl:table-cell">
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
                        <span className={`font-mono text-xs ${
                          e.geofence_compliance >= 90 ? "text-green-600" :
                          e.geofence_compliance >= 70 ? "text-amber-600" : "text-destructive"
                        }`}>
                          {e.geofence_compliance}%
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right hidden lg:table-cell">
                        <span className="text-xs text-muted-foreground flex items-center justify-end gap-1">
                          <Clock className="h-3 w-3" />
                          {e.last_login_at
                            ? (
                              <span title={format(new Date(e.last_login_at), "PPpp")}>
                                {format(new Date(e.last_login_at), "dd MMM yyyy, HH:mm")}
                              </span>
                            )
                            : "Never"}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-center">
                        <button
                          onClick={() => setSelectedUser(e)}
                          className="inline-flex items-center justify-center h-7 w-7 rounded-md hover:bg-muted transition-colors"
                        >
                          <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-muted-foreground">
                      No users found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground mt-3 text-right">
            Showing {filtered.length} of {users.length} users
          </p>
        </CardContent>
      </Card>

      {/* User Detail Dialog */}
      <Dialog open={!!selectedUser} onOpenChange={() => setSelectedUser(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">
              {selectedUser?.first_name} {selectedUser?.last_name}
            </DialogTitle>
          </DialogHeader>
          {selectedUser && (
            <div className="space-y-4">
              {/* Role & Status */}
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className={ROLE_LABELS[selectedUser.role || "user"]?.color || ""}>
                  <Shield className="h-3 w-3 mr-1" />
                  {ROLE_LABELS[selectedUser.role || "user"]?.label || "User"}
                </Badge>
                <Badge variant="outline" className={STATUS_CONFIG[selectedUser.status].className}>
                  {STATUS_CONFIG[selectedUser.status].label}
                </Badge>
                {!selectedUser.is_active && (
                  <Badge variant="outline" className="border-destructive/30 text-destructive">Inactive</Badge>
                )}
              </div>

              {/* Contact - Super Admin sees more */}
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Contact</p>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 text-sm">
                    <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                    <span>{selectedUser.email}</span>
                  </div>
                  {isSuperAdmin && selectedUser.phone_number && (
                    <div className="flex items-center gap-2 text-sm">
                      <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                      <span>{selectedUser.phone_number}</span>
                    </div>
                  )}
                  {isSuperAdmin && selectedUser.alternate_email && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Mail className="h-3.5 w-3.5" />
                      <span>{selectedUser.alternate_email} (alt)</span>
                    </div>
                  )}
                  {isSuperAdmin && selectedUser.alternate_phone && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Phone className="h-3.5 w-3.5" />
                      <span>{selectedUser.alternate_phone} (alt)</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Designation & Location */}
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Profile</p>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">Designation</p>
                    <p className="font-medium">{DESIGNATION_LABELS[selectedUser.designation] || selectedUser.designation}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">State</p>
                    <p className="font-medium">{selectedUser.state || "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">LGA</p>
                    <p className="font-medium">{selectedUser.lga || "—"}</p>
                  </div>
                  {isSuperAdmin && (
                    <div>
                      <p className="text-xs text-muted-foreground">Ward</p>
                      <p className="font-medium">{selectedUser.ward || "—"}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Activity Stats */}
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Activity</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg bg-muted/50 p-3 text-center">
                    <p className="font-display text-xl font-bold">{selectedUser.submissions_today}</p>
                    <p className="text-xs text-muted-foreground">Today</p>
                  </div>
                  <div className="rounded-lg bg-muted/50 p-3 text-center">
                    <p className="font-display text-xl font-bold">{selectedUser.submissions_total}</p>
                    <p className="text-xs text-muted-foreground">Total (range)</p>
                  </div>
                  <div className="rounded-lg bg-muted/50 p-3 text-center">
                    <p className={`font-display text-xl font-bold ${
                      selectedUser.geofence_compliance >= 90 ? "text-green-600" :
                      selectedUser.geofence_compliance >= 70 ? "text-amber-600" : "text-destructive"
                    }`}>{selectedUser.geofence_compliance}%</p>
                    <p className="text-xs text-muted-foreground">Geofence</p>
                  </div>
                  <div className="rounded-lg bg-muted/50 p-3 text-center">
                    <p className="font-display text-xl font-bold">{selectedUser.assigned_forms.length}</p>
                    <p className="text-xs text-muted-foreground">Forms</p>
                  </div>
                </div>
                <div className="text-xs text-muted-foreground">
                  <span>Last seen: </span>
                  <span className="font-medium">
                    {selectedUser.last_login_at
                      ? formatDistanceToNow(new Date(selectedUser.last_login_at), { addSuffix: true })
                      : "Never"}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground">
                  <span>Assigned projects: </span>
                  <span className="font-medium">{selectedUser.assigned_projects.length}</span>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default UserStatusTable;

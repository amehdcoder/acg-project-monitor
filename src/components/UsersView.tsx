import { useState, useEffect, useMemo, useCallback, useRef, memo } from "react";
import {
  Users,
  Plus,
  Search,
  MoreVertical,
  Shield,
  ShieldCheck,
  User,
  Edit,
  Trash2,
  Mail,
  Phone,
  MapPin,
  UserCog,
  FolderOpen,
  FileText,
  LogIn,
  Loader2,
  Monitor,
  CheckCircle,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Filter,
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RESTRICTED_PAGES } from "@/hooks/usePageAccess";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useImpersonation } from "@/hooks/useImpersonation";
import { DeviceManagementDialog } from "@/components/DeviceManagementDialog";
import OwnerAccessManager from "@/components/OwnerTools/OwnerAccessManager";
import AdminCreateUsersDialog from "@/components/OwnerTools/AdminCreateUsersDialog";
import CascadeAssignmentDialog from "@/components/OwnerTools/CascadeAssignmentDialog";
import AdminReliabilityPanel from "@/components/OwnerTools/AdminReliabilityPanel";
import UserLoginDetailsDialog from "@/components/OwnerTools/UserLoginDetailsDialog";
import { useAdminSurveillance } from "@/hooks/useAdminSurveillance";
import InactiveUsersPanel from "@/components/InactiveUsersPanel";
import { ALL_STANDARD_FORMS } from "@/lib/standardAssessments/allStandardForms";

interface UserProfile {
  id: string;
  user_id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  phone_number: string | null;
  state: string | null;
  lga: string | null;
  ward: string | null;
  designation: string | null;
  other_designation: string | null;
  is_active: boolean;
  is_owner: boolean;
  approval_status: string | null;
  created_at: string | null;
}

interface UserRole {
  id: string;
  user_id: string;
  role: string | null;
}

interface Project {
  id: string;
  name: string;
}

interface Form {
  id: string;
  name: string;
  project_id: string;
}

const roleLabels = {
  super_admin: { label: "Super Admin", color: "bg-red-100 text-red-700", icon: ShieldCheck },
  systems_admin: { label: "Systems Admin", color: "bg-blue-100 text-blue-700", icon: Shield },
  user: { label: "User", color: "bg-gray-100 text-gray-700", icon: User },
};

const safeText = (value: unknown, fallback = "—") => {
  if (typeof value === "string") return value.trim() || fallback;
  if (value === null || value === undefined) return fallback;
  return String(value).trim() || fallback;
};

const getUserDisplayName = (user: Partial<UserProfile> | null | undefined) => {
  const name = [user?.first_name, user?.last_name]
    .map((part) => safeText(part, ""))
    .filter(Boolean)
    .join(" ")
    .trim();
  return name || safeText(user?.email, "Unknown user");
};

const getRoleInfo = (role?: string | null) =>
  roleLabels[(role || "user") as keyof typeof roleLabels] || roleLabels.user;

// Deterministic color-grade palette keyed by project index.
const PROJECT_PALETTE = [
  { chip: "bg-blue-100 text-blue-700 border-blue-200", bar: "bg-blue-500", soft: "bg-blue-50/60" },
  { chip: "bg-emerald-100 text-emerald-700 border-emerald-200", bar: "bg-emerald-500", soft: "bg-emerald-50/60" },
  { chip: "bg-violet-100 text-violet-700 border-violet-200", bar: "bg-violet-500", soft: "bg-violet-50/60" },
  { chip: "bg-amber-100 text-amber-700 border-amber-200", bar: "bg-amber-500", soft: "bg-amber-50/60" },
  { chip: "bg-rose-100 text-rose-700 border-rose-200", bar: "bg-rose-500", soft: "bg-rose-50/60" },
  { chip: "bg-cyan-100 text-cyan-700 border-cyan-200", bar: "bg-cyan-500", soft: "bg-cyan-50/60" },
  { chip: "bg-fuchsia-100 text-fuchsia-700 border-fuchsia-200", bar: "bg-fuchsia-500", soft: "bg-fuchsia-50/60" },
  { chip: "bg-teal-100 text-teal-700 border-teal-200", bar: "bg-teal-500", soft: "bg-teal-50/60" },
];
const NO_ACCESS = { chip: "bg-muted text-muted-foreground border-border", bar: "bg-muted-foreground/40", soft: "bg-muted/30" };

// Memoized row. Only re-renders when its own `selected` flag (or the rarely
// changing shared `ctx`) changes — so toggling one checkbox in a list of
// hundreds of users no longer re-renders every other row.
const UserCard = memo(function UserCard({
  user,
  selected,
  ctx,
  api,
}: {
  user: any;
  selected: boolean;
  ctx: any;
  api: { current: any };
}) {
  const {
    isOwner,
    isCoOwner,
    isSuperAdmin,
    isImpersonating,
    impersonatingId,
    projectNameById,
    formNameById,
    colorForProject,
    getUserProjectIds,
    getUserFormIds,
    formById,
    cascadeAssign,
  } = ctx;
  const a = api.current;
  const roleInfo = getRoleInfo(user.role?.role);
  const RoleIcon = roleInfo.icon;
  const displayName = getUserDisplayName(user);
  const displayEmail = safeText(user.email);
  const userProjectIds = getUserProjectIds(user.user_id);
  const userFormIds = getUserFormIds(user.user_id);

  return (
    <div
      className={`group flex flex-col gap-4 rounded-xl border border-border bg-card p-4 transition-all duration-200 hover:border-acg-gold/30 hover:shadow-soft sm:flex-row sm:items-center sm:justify-between ${
        !user.is_active ? "opacity-60" : ""
      }`}
    >
      <div className="flex items-start gap-4">
        {!user.is_owner && (
          <Checkbox
            className="mt-5"
            checked={selected}
            onCheckedChange={() => a.toggleSelect(user.user_id)}
          />
        )}
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-primary/10">
          <User className="h-7 w-7 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="font-medium text-foreground">{displayName}</h4>
            {user.is_owner && (
              <Badge variant="outline" className="border-acg-gold text-acg-gold">
                Owner
              </Badge>
            )}
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${roleInfo.color}`}>
              <RoleIcon className="h-3 w-3" />
              {roleInfo.label}
            </span>
            {!user.is_active && <Badge variant="secondary">Inactive</Badge>}
            {user.approval_status === "pending" && (
              <Badge variant="outline" className="border-amber-500 bg-amber-50 text-amber-700">Pending Approval</Badge>
            )}
            {user.approval_status === "rejected" && <Badge variant="destructive">Rejected</Badge>}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <Mail className="h-3 w-3" />
              {displayEmail}
            </span>
            {user.phone_number && (
              <span className="flex items-center gap-1">
                <Phone className="h-3 w-3" />
                {safeText(user.phone_number)}
              </span>
            )}
            {user.state && (
              <span className="flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {safeText(user.state)}
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground capitalize">
            {(user.designation || "").replace("_", " ") || "—"}
            {user.other_designation && ` - ${user.other_designation}`}
          </p>
          {/* Access: projects & forms (blank when none) */}
          <div className="mt-2.5 flex flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">Projects</span>
              {userProjectIds.length > 0 ? (
                userProjectIds.map((pid: string) => {
                  const c = colorForProject(pid);
                  return (
                    <span key={pid} className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${c.chip}`}>
                      <FolderOpen className="h-3 w-3" />
                      {projectNameById(pid)}
                    </span>
                  );
                })
              ) : (
                <span className="text-[11px] italic text-muted-foreground/50">—</span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">Forms</span>
              {userFormIds.length > 0 ? (
                userFormIds.map((fid: string) => {
                  const f = formById.get(fid);
                  const parentColor = f?.project_id ? colorForProject(f.project_id) : NO_ACCESS;
                  return (
                    <span key={fid} className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium ${parentColor.chip}`}>
                      <FileText className="h-3 w-3" />
                      {formNameById(fid)}
                    </span>
                  );
                })
              ) : (
                <span className="text-[11px] italic text-muted-foreground/50">—</span>
              )}
            </div>
            {(cascadeAssign[user.user_id]?.length ?? 0) > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">Cascade scope</span>
                {(cascadeAssign[user.user_id] || []).map((c: any, ci: number) => (
                  <span key={ci} className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                    <MapPin className="h-3 w-3" />
                    <span className="capitalize opacity-60">{c.field_key.replace("_", " ")}:</span>
                    {c.value_label || c.value}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            a.setSelectedUser(user);
            a.setShowAssignDialog(true);
          }}
        >
          <FolderOpen className="h-4 w-4" />
          Assign
        </Button>
        {(isOwner || isCoOwner) && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => a.setCascadeUser(user)}
            title="Link this user to cascade options (e.g. a State)"
          >
            <MapPin className="h-4 w-4" />
            Cascade
          </Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {isSuperAdmin && (
              <>
                <DropdownMenuItem
                  onClick={() => {
                    a.setSelectedUser(user);
                    a.setEditProfileData({
                      first_name: user.first_name || "",
                      last_name: user.last_name || "",
                      phone_number: user.phone_number,
                      state: user.state,
                      lga: user.lga,
                      ward: user.ward,
                      designation: user.designation || "adhoc_user",
                      other_designation: user.other_designation,
                    });
                    a.setShowEditProfileDialog(true);
                  }}
                >
                  <Edit className="mr-2 h-4 w-4" />
                  Edit Profile
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    a.setSelectedUser(user);
                    a.setNewRole(user.role?.role || "user");
                    a.setShowRoleDialog(true);
                  }}
                  disabled={user.is_owner}
                >
                  <UserCog className="mr-2 h-4 w-4" />
                  Change Role
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={async () => {
                    a.setImpersonating(user.user_id);
                    const success = await a.startImpersonation(user.user_id, displayName);
                    if (success) {
                      await a.logAction(
                        "impersonate_user",
                        `Started impersonating ${displayName} (${displayEmail})`,
                        "user",
                        user.user_id,
                      );
                    }
                    a.setImpersonating(null);
                  }}
                  disabled={user.is_owner || isImpersonating || impersonatingId === user.user_id}
                >
                  {impersonatingId === user.user_id ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <LogIn className="mr-2 h-4 w-4" />
                  )}
                  Sign in as User
                </DropdownMenuItem>
              </>
            )}
            {isSuperAdmin && (
              <DropdownMenuItem
                onClick={() => {
                  a.setSelectedUser(user);
                  a.setShowDeviceDialog(true);
                }}
              >
                <Monitor className="mr-2 h-4 w-4" />
                View Devices
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={() => a.handleToggleActive(user)} disabled={user.is_owner}>
              <User className="mr-2 h-4 w-4" />
              {user.is_active ? "Deactivate" : "Activate"}
            </DropdownMenuItem>
            {user.approval_status === "pending" && (
              <>
                <DropdownMenuItem
                  onClick={async () => {
                    await supabase.from("profiles").update({ approval_status: "approved" }).eq("id", user.id);
                    await supabase.from("notifications").insert({
                      user_id: user.user_id,
                      title: "✅ Account Approved",
                      message: "Your account has been approved! You now have full access to Amehnities.",
                      type: "success",
                      category: "registration",
                    });
                    await a.logAction("approve_user", `Approved user ${displayName} (${displayEmail})`, "user", user.user_id);
                    toast({ title: "User Approved", description: `${displayName} has been approved.` });
                    a.fetchUsers();
                  }}
                  className="text-green-600"
                >
                  <CheckCircle className="mr-2 h-4 w-4" />
                  Approve
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={async () => {
                    await supabase.from("profiles").update({ approval_status: "rejected" }).eq("id", user.id);
                    await supabase.from("notifications").insert({
                      user_id: user.user_id,
                      title: "❌ Account Rejected",
                      message: "Your registration has been reviewed and was not approved. Please contact an administrator.",
                      type: "error",
                      category: "registration",
                    });
                    await a.logAction("reject_user", `Rejected user ${displayName} (${displayEmail})`, "user", user.user_id);
                    toast({ title: "User Rejected", description: `${displayName} has been rejected.` });
                    a.fetchUsers();
                  }}
                  className="text-destructive"
                >
                  <AlertTriangle className="mr-2 h-4 w-4" />
                  Reject
                </DropdownMenuItem>
              </>
            )}
            {isOwner && !user.is_owner && (
              <DropdownMenuItem
                onClick={() => {
                  a.setSelectedUser(user);
                  a.setDeleteConfirmText("");
                  a.setShowDeleteDialog(true);
                }}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete Permanently
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
});


const UsersView = () => {
  const { role: currentUserRole, profile: currentUserProfile, isOwner, isCoOwner, isAdmin } = useAuth();
  const { startImpersonation, isImpersonating } = useImpersonation();
  const { logAction } = useAdminSurveillance();
  const [users, setUsers] = useState<(UserProfile & { role?: UserRole })[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [forms, setForms] = useState<Form[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterDesignation, setFilterDesignation] = useState<"all" | "adhoc">("all");
  const [selectedUser, setSelectedUser] = useState<(UserProfile & { role?: UserRole }) | null>(null);
  const [showRoleDialog, setShowRoleDialog] = useState(false);
  const [showAssignDialog, setShowAssignDialog] = useState(false);
  const [showEditProfileDialog, setShowEditProfileDialog] = useState(false);
  const [editProfileData, setEditProfileData] = useState<Partial<UserProfile>>({});
  const [impersonating, setImpersonating] = useState<string | null>(null);
  const [newRole, setNewRole] = useState<string>("");
  const [selectedProject, setSelectedProject] = useState<string>("");
  const [selectedForm, setSelectedForm] = useState<string>("");
  const [selectedStandardForm, setSelectedStandardForm] = useState<string>("");
  // Search / filter controls for the assignment selectors
  const [projectFilter, setProjectFilter] = useState("");
  const [stdFormSearch, setStdFormSearch] = useState("");
  const [stdFormGroup, setStdFormGroup] = useState<string>("all");
  const [showDeviceDialog, setShowDeviceDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deletingUser, setDeletingUser] = useState(false);
  // Bulk selection / actions
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [showBulkAssign, setShowBulkAssign] = useState(false);
  const [bulkProject, setBulkProject] = useState<string>("");
  const [bulkForms, setBulkForms] = useState<Set<string>>(new Set());
  // Standard forms + restricted pages bulk assignment (scoped visibility control)
  const [bulkStandardForms, setBulkStandardForms] = useState<Set<string>>(new Set());
  const [bulkPages, setBulkPages] = useState<Set<string>>(new Set());
  // When on, selected NON-admin users are restricted so they ONLY see the
  // Standard forms you assign here (instead of every form their designation
  // grants by default). Admins (Systems/Super) keep their full role access.
  const [bulkRestrictStandard, setBulkRestrictStandard] = useState(true);
  // When on, selected NON-admin users are locked to ONLY Forms, Project Chat
  // and My Submissions — regardless of their designation. Admins are exempt.
  const [bulkMinimalLock, setBulkMinimalLock] = useState(false);
  const [showBulkRemove, setShowBulkRemove] = useState(false);
  // Per-user progress + outcome feedback for bulk operations
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null);
  const [bulkResults, setBulkResults] = useState<{ name: string; ok: boolean; message: string }[]>([]);
  // Access maps: user_id -> assigned project / form ids
  const [projectAssign, setProjectAssign] = useState<Record<string, string[]>>({});
  const [formAssign, setFormAssign] = useState<Record<string, string[]>>({});
  // Cascade scope assignments: user_id -> rows { form_id, field_key, value, value_label }
  const [cascadeAssign, setCascadeAssign] = useState<Record<string, { form_id: string; field_key: string; value: string; value_label: string | null }[]>>({});
  const [stdFormAssign, setStdFormAssign] = useState<Record<string, string[]>>({});
  const [cascadeUser, setCascadeUser] = useState<UserProfile | null>(null);

  useEffect(() => {
    fetchUsers();
    fetchProjects();
    fetchForms();
    fetchAssignments();
  }, []);

  const fetchAssignments = async () => {
    const [{ data: pa }, { data: fa }, { data: ca }, { data: sa }] = await Promise.all([
      supabase.from("user_project_assignments").select("user_id, project_id"),
      supabase.from("user_form_assignments").select("user_id, form_id"),
      supabase.from("user_cascade_assignments").select("user_id, form_id, field_key, value, value_label"),
      (supabase as any).from("user_standard_form_assignments").select("user_id, form_code"),
    ]);
    const pMap: Record<string, string[]> = {};
    (pa || []).forEach((r: any) => {
      if (!r.user_id || !r.project_id) return;
      (pMap[r.user_id] ||= []).push(r.project_id);
    });
    const fMap: Record<string, string[]> = {};
    (fa || []).forEach((r: any) => {
      if (!r.user_id || !r.form_id) return;
      (fMap[r.user_id] ||= []).push(r.form_id);
    });
    const cMap: Record<string, { form_id: string; field_key: string; value: string; value_label: string | null }[]> = {};
    (ca || []).forEach((r: any) => {
      if (!r.user_id) return;
      (cMap[r.user_id] ||= []).push({ form_id: r.form_id, field_key: r.field_key, value: r.value, value_label: r.value_label });
    });
    const sMap: Record<string, string[]> = {};
    (sa || []).forEach((r: any) => {
      if (!r.user_id || !r.form_code) return;
      (sMap[r.user_id] ||= []).push(r.form_code);
    });
    setProjectAssign(pMap);
    setFormAssign(fMap);
    setCascadeAssign(cMap);
    setStdFormAssign(sMap);
  };

  const fetchUsers = async () => {
    try {
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false });

      if (profilesError) throw profilesError;

      const { data: roles, error: rolesError } = await supabase
        .from("user_roles")
        .select("*");

      if (rolesError) throw rolesError;

      const rolesByUser = new Map<string, UserRole>();
      (roles || []).forEach((r: any) => {
        if (r.user_id && !rolesByUser.has(r.user_id)) rolesByUser.set(r.user_id, r);
      });
      const usersWithRoles = profiles?.map((profile) => ({
        ...profile,
        role: rolesByUser.get(profile.user_id),
      })) || [];

      setUsers(usersWithRoles);
    } catch (error) {
      console.error("Error fetching users:", error);
      toast({
        title: "Error",
        description: "Failed to fetch users",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchProjects = async () => {
    const { data } = await supabase.from("projects").select("id, name");
    setProjects(data || []);
  };

  const fetchForms = async () => {
    const { data } = await supabase.from("forms").select("id, name, project_id");
    setForms(data || []);
  };

  const handleUpdateRole = async () => {
    if (!selectedUser || !newRole) return;
    
    if (selectedUser.is_owner) {
      toast({
        title: "Cannot change owner role",
        description: "The owner's role cannot be modified.",
        variant: "destructive",
      });
      return;
    }

    try {
      const { error } = await supabase
        .from("user_roles")
        .update({ role: newRole as any })
        .eq("user_id", selectedUser.user_id);

      if (error) throw error;

      await logAction(
        "change_user_role",
        `Changed role of ${getUserDisplayName(selectedUser)} (${safeText(selectedUser.email)}) to ${getRoleInfo(newRole).label}`,
        "user",
        selectedUser.user_id,
        { old_role: selectedUser.role?.role, new_role: newRole }
      );

      toast({
        title: "Role Updated",
        description: `${getUserDisplayName(selectedUser)}'s role has been updated to ${getRoleInfo(newRole).label}.`,
      });

      fetchUsers();
      setShowRoleDialog(false);
    } catch (error) {
      console.error("Error updating role:", error);
      toast({
        title: "Error",
        description: "Failed to update user role",
        variant: "destructive",
      });
    }
  };

  // Record standard-form assignment / restriction events for auditing.
  // Fire-and-forget: never block the assignment flow on an audit write.
  const logStandardFormAudit = useCallback(
    async (
      rows: {
        target_user_id: string;
        project_id?: string | null;
        form_code?: string | null;
        action: "assigned" | "restricted" | "minimal_lock" | "unassigned";
        detail?: string | null;
      }[],
    ) => {
      if (!rows.length || !currentUserProfile?.user_id) return;
      try {
        await (supabase as any).from("standard_form_assignment_audit").insert(
          rows.map((r) => ({
            target_user_id: r.target_user_id,
            project_id: r.project_id ?? null,
            form_code: r.form_code ?? null,
            action: r.action,
            detail: r.detail ?? null,
            changed_by: currentUserProfile.user_id,
          })),
        );
      } catch {
        /* auditing is best-effort */
      }
    },
    [currentUserProfile?.user_id],
  );

  // Sends a professional email notifying a user of a new project/form assignment.
  // Best-effort: never blocks the assignment flow.
  const notifyAssignment = useCallback(
    async (
      user: { user_id: string; email?: string | null; first_name?: string | null } | null | undefined,
      kind: "project" | "form",
      items: string[],
    ) => {
      if (!user?.email || items.length === 0) return;
      try {
        await supabase.functions.invoke("notify-assignment", {
          body: { email: user.email, firstName: user.first_name || "", kind, items },
        });
      } catch {
        /* notification is best-effort */
      }
    },
    [],
  );

  const handleAssignProject = async () => {
    if (!selectedUser || !selectedProject) return;

    try {
      const { error } = await supabase
        .from("user_project_assignments")
        .insert({
          user_id: selectedUser.user_id,
          project_id: selectedProject,
          assigned_by: currentUserProfile?.user_id,
        });

      if (error) throw error;

      toast({
        title: "Project Assigned",
        description: `User has been assigned to the project.`,
      });

      notifyAssignment(selectedUser, "project", [projectById.get(selectedProject)?.name || "a project"]);
      setSelectedProject(""); fetchAssignments();
    } catch (error: any) {
      if (error.code === "23505") {
        toast({
          title: "Already Assigned",
          description: "User is already assigned to this project.",
        });
      } else {
        toast({
          title: "Error",
          description: "Failed to assign project",
          variant: "destructive",
        });
      }
    }
  };

  const handleBulkAssignProject = async () => {
    const targets = selectedUserObjects();
    const formIds = Array.from(bulkForms);
    const stdForms = Array.from(bulkStandardForms);
    const pageIds = Array.from(bulkPages);
    if (
      (!bulkProject &&
        formIds.length === 0 &&
        stdForms.length === 0 &&
        pageIds.length === 0 &&
        !bulkMinimalLock) ||
      targets.length === 0
    )
      return;
    const projName = bulkProject ? (projectById.get(bulkProject)?.name || "the project") : "";
    const formNames = formIds.map((id) => formById.get(id)?.name || "form");
    setBulkBusy(true);
    setBulkResults([]);
    setBulkProgress({ done: 0, total: targets.length });
    const results: { name: string; ok: boolean; message: string }[] = [];
    // Collected audit rows for standard-form assignments / restrictions.
    const auditRows: {
      target_user_id: string;
      project_id?: string | null;
      form_code?: string | null;
      action: "assigned" | "restricted" | "minimal_lock" | "unassigned";
      detail?: string | null;
    }[] = [];
    // Roles that keep full default access regardless of restriction toggle.
    const adminRoles = new Set(["super_admin", "systems_admin"]);
    for (const u of targets) {
      const name = getUserDisplayName(u);
      const parts: string[] = [];
      const isAdminUser = adminRoles.has((u as any).role?.role) || u.is_owner;
      let ok = true;
      try {
        if (bulkProject) {
          const { error } = await supabase
            .from("user_project_assignments")
            .upsert(
              { user_id: u.user_id, project_id: bulkProject, assigned_by: currentUserProfile?.user_id },
              { onConflict: "user_id,project_id", ignoreDuplicates: true }
            );
          if (error) throw error;
          parts.push(projName);
        }
        if (formIds.length > 0) {
          const { error } = await supabase
            .from("user_form_assignments")
            .upsert(
              formIds.map((fid) => ({ user_id: u.user_id, form_id: fid, assigned_by: currentUserProfile?.user_id })),
              { onConflict: "user_id,form_id", ignoreDuplicates: true }
            );
          if (error) throw error;
          parts.push(`${formIds.length} form(s)`);
        }
        if (stdForms.length > 0) {
          // Assign the specific standard forms (skip any the user already has).
          const { data: existingStd } = await (supabase as any)
            .from("user_standard_form_assignments")
            .select("form_code")
            .eq("user_id", u.user_id);
          const have = new Set(((existingStd ?? []) as any[]).map((r) => r.form_code));
          const toInsert = stdForms.filter((c) => !have.has(c));
          if (toInsert.length > 0) {
            const { error } = await (supabase as any)
              .from("user_standard_form_assignments")
              .insert(
                toInsert.map((code) => ({
                  user_id: u.user_id,
                  form_code: code,
                  assigned_by: currentUserProfile?.user_id,
                }))
              );
            if (error && error.code !== "23505") throw error;
            toInsert.forEach((code) =>
              auditRows.push({
                target_user_id: u.user_id,
                project_id: bulkProject || null,
                form_code: code,
                action: "assigned",
                detail: ALL_STANDARD_FORMS.find((f) => f.code === code)?.name || code,
              }),
            );
          }
          // Restrict default visibility (non-admins only) so they ONLY see the
          // standard forms assigned above. Admins keep their full role access.
          if (bulkRestrictStandard && !isAdminUser) {
            const { data: alreadyRestricted } = await (supabase as any)
              .from("standard_form_user_restrictions")
              .select("id")
              .eq("user_id", u.user_id)
              .limit(1);
            if (!alreadyRestricted || alreadyRestricted.length === 0) {
              const { error: rErr } = await (supabase as any)
                .from("standard_form_user_restrictions")
                .insert({ user_id: u.user_id, restricted_by: currentUserProfile?.user_id });
              if (rErr && rErr.code !== "23505") throw rErr;
            }
            auditRows.push({
              target_user_id: u.user_id,
              project_id: bulkProject || null,
              action: "restricted",
              detail: `Restricted to ${stdForms.length} standard form(s)`,
            });
          }
          parts.push(`${stdForms.length} standard form(s)`);
        }
        if (pageIds.length > 0) {
          // Grant specific restricted pages (skip ones the user already has).
          const { data: existingPg } = await supabase
            .from("user_page_access")
            .select("page_id")
            .eq("user_id", u.user_id);
          const havePg = new Set(((existingPg ?? []) as any[]).map((r) => r.page_id));
          const toGrant = pageIds.filter((p) => !havePg.has(p));
          if (toGrant.length > 0) {
            const { error } = await supabase
              .from("user_page_access")
              .insert(
                toGrant.map((pid) => ({
                  user_id: u.user_id,
                  page_id: pid,
                  granted_by: currentUserProfile?.user_id,
                }))
              );
            if (error && error.code !== "23505") throw error;
          }
          parts.push(`${pageIds.length} page(s)`);
        }
        if (bulkMinimalLock && !isAdminUser) {
          // Lock to Forms, Project Chat & My Submissions only (non-admins).
          const { data: alreadyMin } = await (supabase as any)
            .from("user_minimal_access")
            .select("id")
            .eq("user_id", u.user_id)
            .limit(1);
          if (!alreadyMin || alreadyMin.length === 0) {
            const { error: mErr } = await (supabase as any)
              .from("user_minimal_access")
              .insert({ user_id: u.user_id, restricted_by: currentUserProfile?.user_id });
            if (mErr && mErr.code !== "23505") throw mErr;
          }
          auditRows.push({
            target_user_id: u.user_id,
            project_id: bulkProject || null,
            action: "minimal_lock",
            detail: "Locked to Forms, Project Chat & My Submissions",
          });
          parts.push("minimal access");
        }
      } catch (err: any) {
        ok = false;
        results.push({ name, ok: false, message: err?.message || "Failed" });
      }
      if (ok) {
        results.push({ name, ok: true, message: `Assigned ${parts.join(" + ")}` });
        if (bulkProject) notifyAssignment(u, "project", [projName]);
        if (formIds.length > 0) notifyAssignment(u, "form", formNames);
      }
      setBulkProgress({ done: results.length, total: targets.length });
      setBulkResults([...results]);
    }
    if (auditRows.length > 0) logStandardFormAudit(auditRows);
    const okCount = results.filter((r) => r.ok).length;
    const label = [
      projName,
      formNames.length ? `${formNames.length} form(s)` : "",
      stdForms.length ? `${stdForms.length} standard form(s)` : "",
      pageIds.length ? `${pageIds.length} page(s)` : "",
      bulkMinimalLock ? "minimal access" : "",
    ]
      .filter(Boolean)
      .join(" + ");
    logAction(
      "assign_user_to_project",
      `Bulk assigned ${okCount} user(s) to ${label}`,
      undefined,
      undefined,
      {
        user_ids: targets.map((u) => u.user_id),
        project_id: bulkProject || null,
        form_ids: formIds,
        standard_form_codes: stdForms,
        page_ids: pageIds,
        restrict_standard: bulkRestrictStandard,
      }
    );
    toast({ title: "Assignment complete", description: `${okCount} of ${targets.length} user(s) assigned to ${label}.` });
    fetchAssignments();
    if (okCount === targets.length) {
      clearSelection();
      setBulkProject("");
      setBulkForms(new Set());
      setBulkStandardForms(new Set());
      setBulkPages(new Set());
      setBulkMinimalLock(false);
    }
    setBulkBusy(false);
    setBulkProgress(null);
  };


  const handleBulkResendInvite = async () => {
    const targets = selectedUserObjects();
    if (targets.length === 0) return;
    setBulkBusy(true);
    setBulkResults([]);
    setBulkProgress({ done: 0, total: targets.length });
    const results: { name: string; ok: boolean; message: string }[] = [];
    for (const u of targets) {
      const name = getUserDisplayName(u);
      try {
        const { error } = await supabase.functions.invoke("send-password-reset", { body: { email: u.email } });
        if (error) throw error;
        results.push({ name, ok: true, message: "Invite emailed" });
      } catch (err: any) {
        results.push({ name, ok: false, message: err?.message || "Failed to send" });
      }
      setBulkProgress({ done: results.length, total: targets.length });
      setBulkResults([...results]);
    }
    const okCount = results.filter((r) => r.ok).length;
    logAction(
      "edit_user_profile",
      `Resent access invites to ${okCount} user(s)`,
      undefined,
      undefined,
      { user_ids: targets.map((u) => u.user_id) }
    );
    toast({ title: "Invites processed", description: `Secure access link emailed to ${okCount} of ${targets.length} user(s).` });
    if (okCount === targets.length) clearSelection();
    setBulkBusy(false);
    setBulkProgress(null);
  };

  const handleBulkRemoveAccess = async () => {
    const targets = selectedUserObjects();
    if (targets.length === 0) return;
    setBulkBusy(true);
    setBulkResults([]);
    setBulkProgress({ done: 0, total: targets.length });
    const results: { name: string; ok: boolean; message: string }[] = [];
    for (const u of targets) {
      const name = getUserDisplayName(u);
      try {
        const { error } = await supabase.from("profiles").update({ is_active: false }).eq("user_id", u.user_id);
        if (error) throw error;
        results.push({ name, ok: true, message: "Access removed" });
      } catch (err: any) {
        results.push({ name, ok: false, message: err?.message || "Failed" });
      }
      setBulkProgress({ done: results.length, total: targets.length });
      setBulkResults([...results]);
    }
    const okCount = results.filter((r) => r.ok).length;
    logAction(
      "deactivate_user",
      `Bulk revoked app access for ${okCount} user(s)`,
      undefined,
      undefined,
      { user_ids: targets.map((u) => u.user_id) }
    );
    toast({ title: "Access update complete", description: `${okCount} of ${targets.length} user(s) deactivated.` });
    if (okCount === targets.length) {
      setShowBulkRemove(false);
      clearSelection();
    }
    fetchUsers();
    setBulkBusy(false);
    setBulkProgress(null);
  };


  const handleAssignForm = async () => {
    if (!selectedUser || !selectedForm) return;


    try {
      const { error } = await supabase
        .from("user_form_assignments")
        .insert({
          user_id: selectedUser.user_id,
          form_id: selectedForm,
          assigned_by: currentUserProfile?.user_id,
        });

      if (error) throw error;

      toast({
        title: "Form Assigned",
        description: `User has been assigned to the form.`,
      });

      notifyAssignment(selectedUser, "form", [formById.get(selectedForm)?.name || "a form"]);
      setSelectedForm(""); fetchAssignments();
    } catch (error: any) {
      if (error.code === "23505") {
        toast({
          title: "Already Assigned",
          description: "User is already assigned to this form.",
        });
      } else {
        toast({
          title: "Error",
          description: "Failed to assign form",
          variant: "destructive",
        });
      }
    }
  };

  const handleAssignStandardForm = async () => {
    if (!selectedUser || !selectedStandardForm) return;
    try {
      const { error } = await (supabase as any)
        .from("user_standard_form_assignments")
        .insert({
          user_id: selectedUser.user_id,
          form_code: selectedStandardForm,
          assigned_by: currentUserProfile?.user_id,
        });
      if (error) throw error;
      logStandardFormAudit([
        {
          target_user_id: selectedUser.user_id,
          form_code: selectedStandardForm,
          action: "assigned",
          detail: ALL_STANDARD_FORMS.find((f) => f.code === selectedStandardForm)?.name || selectedStandardForm,
        },
      ]);
      toast({ title: "Standard Form Assigned", description: "User has been assigned the standard form." });
      setSelectedStandardForm("");
    } catch (error: any) {
      if (error.code === "23505") {
        toast({ title: "Already Assigned", description: "User is already assigned this standard form." });
      } else {
        toast({ title: "Error", description: "Failed to assign standard form", variant: "destructive" });
      }
    }
  };

  const handleToggleActive = async (userToToggle: UserProfile & { role?: UserRole }) => {
    if (userToToggle.is_owner) {
      toast({
        title: "Cannot deactivate owner",
        description: "The owner account cannot be deactivated.",
        variant: "destructive",
      });
      return;
    }

    const newActiveState = !userToToggle.is_active;

    // Optimistic UI update
    setUsers((prev) =>
      prev.map((u) =>
        u.id === userToToggle.id ? { ...u, is_active: newActiveState } : u
      )
    );

    try {
      const { error } = await supabase
        .from("profiles")
        .update({ is_active: newActiveState })
        .eq("id", userToToggle.id);

      if (error) throw error;

      await logAction(
        newActiveState ? "activate_user" : "deactivate_user",
        `${newActiveState ? "Activated" : "Deactivated"} user ${getUserDisplayName(userToToggle)} (${safeText(userToToggle.email)})`,
        "user",
        userToToggle.user_id
      );

      toast({
        title: newActiveState ? "User Activated" : "User Deactivated",
        description: `${getUserDisplayName(userToToggle)} has been ${newActiveState ? "activated" : "deactivated"}.`,
      });
    } catch (error) {
      // Revert on error
      setUsers((prev) =>
        prev.map((u) =>
          u.id === userToToggle.id ? { ...u, is_active: userToToggle.is_active } : u
        )
      );
      toast({
        title: "Error",
        description: "Failed to update user status",
        variant: "destructive",
      });
    }
  };

  const handleDeleteUserPermanently = async () => {
    if (!selectedUser) return;
    setDeletingUser(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-delete-user", {
        body: { userId: selectedUser.user_id },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);

      await logAction(
        "delete_user_permanently",
        `Permanently deleted user ${getUserDisplayName(selectedUser)} (${safeText(selectedUser.email)})`,
        "user",
        selectedUser.user_id
      );

      setUsers((prev) => prev.filter((u) => u.user_id !== selectedUser.user_id));
      toast({
        title: "Account Permanently Deleted",
        description: `${getUserDisplayName(selectedUser)} can no longer access the app. A new account must be created for them to return.`,
      });
      setShowDeleteDialog(false);
      setSelectedUser(null);
      setDeleteConfirmText("");
    } catch (error: any) {
      toast({
        title: "Deletion Failed",
        description: error?.message || "Could not delete this account. Please try again.",
        variant: "destructive",
      });
    } finally {
      setDeletingUser(false);
    }
  };

  const handleUpdateProfile = async () => {
    if (!selectedUser) return;
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          first_name: editProfileData.first_name ?? selectedUser.first_name ?? "",
          last_name: editProfileData.last_name ?? selectedUser.last_name ?? "",
          phone_number: editProfileData.phone_number ?? selectedUser.phone_number,
          state: editProfileData.state ?? selectedUser.state,
          lga: editProfileData.lga ?? selectedUser.lga,
          ward: editProfileData.ward ?? selectedUser.ward,
          designation: (editProfileData.designation || selectedUser.designation) as any,
          other_designation: editProfileData.other_designation ?? selectedUser.other_designation,
        })
        .eq("id", selectedUser.id);

      if (error) throw error;

      toast({
        title: "Profile Updated",
        description: `${safeText(editProfileData.first_name ?? selectedUser.first_name, getUserDisplayName(selectedUser))}'s profile has been updated.`,
      });

      fetchUsers();
      setShowEditProfileDialog(false);
    } catch (error) {
      console.error("Error updating profile:", error);
      toast({
        title: "Error",
        description: "Failed to update user profile",
        variant: "destructive",
      });
    }
  };

  const filteredUsers = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return users.filter((user) => {
      const matchesSearch = `${safeText(user.first_name, "")} ${safeText(user.last_name, "")} ${safeText(user.email, "")}`
        .toLowerCase()
        .includes(q);
      const matchesDesignation = filterDesignation === "all" || user.designation === "adhoc_user";
      return matchesSearch && matchesDesignation;
    });
  }, [users, searchQuery, filterDesignation]);

  // ---------------- Bulk actions (selected users) ----------------
  const selectableUsers = useMemo(() => filteredUsers.filter((u) => !u.is_owner), [filteredUsers]);

  const allFilteredSelected =
    selectableUsers.length > 0 &&
    selectableUsers.every((u) => selectedIds.has(u.user_id));

  const toggleSelect = useCallback((userId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(userId) ? next.delete(userId) : next.add(userId);
      return next;
    });
  }, []);

  const toggleSelectAll = () => {
    setSelectedIds((prev) => {
      if (selectableUsers.every((u) => prev.has(u.user_id))) return new Set();
      return new Set(selectableUsers.map((u) => u.user_id));
    });
  };

  const clearSelection = () => setSelectedIds(new Set());

  // Select / deselect every selectable (non-owner) user within a group at once.
  const groupIsAllSelected = (groupUsers: { user_id: string; is_owner?: boolean }[]) => {
    const ids = groupUsers.filter((u) => !u.is_owner).map((u) => u.user_id);
    return ids.length > 0 && ids.every((id) => selectedIds.has(id));
  };
  const toggleSelectGroup = (groupUsers: { user_id: string; is_owner?: boolean }[]) => {
    const ids = groupUsers.filter((u) => !u.is_owner).map((u) => u.user_id);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const allSelected = ids.every((id) => next.has(id));
      if (allSelected) ids.forEach((id) => next.delete(id));
      else ids.forEach((id) => next.add(id));
      return next;
    });
  };

  const selectedUserObjects = () =>
    users.filter((u) => selectedIds.has(u.user_id) && !u.is_owner);

  // Mirror the hook's definition (role === super_admin OR the Owner) so the
  // Owner — who holds is_owner=true but may not carry a super_admin role row —
  // is never wrongly excluded from super-admin-only actions.
  const isSuperAdmin = currentUserRole === "super_admin" || isOwner;

  // ---------- Access display: projects & forms per user ----------
  // Map-based lookups so per-row rendering is O(1) instead of scanning the
  // full projects/forms arrays for every chip on every render.
  const projectById = useMemo(() => {
    const m = new Map<string, Project>();
    projects.forEach((p) => m.set(p.id, p));
    return m;
  }, [projects]);
  const formById = useMemo(() => {
    const m = new Map<string, Form>();
    forms.forEach((f) => m.set(f.id, f));
    return m;
  }, [forms]);
  const projectColorById = useMemo(() => {
    const m = new Map<string, typeof PROJECT_PALETTE[number]>();
    projects.forEach((p, idx) => m.set(p.id, PROJECT_PALETTE[idx % PROJECT_PALETTE.length]));
    return m;
  }, [projects]);

  // ---------- Assignment selector search / filter (memoized) ----------
  const filteredProjects = useMemo(() => {
    const q = projectFilter.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter((p) => (p.name || "").toLowerCase().includes(q));
  }, [projects, projectFilter]);

  const standardFormGroups = useMemo(
    () => Array.from(new Set(ALL_STANDARD_FORMS.map((f) => f.group))),
    [],
  );
  const filteredStandardForms = useMemo(() => {
    const q = stdFormSearch.trim().toLowerCase();
    return ALL_STANDARD_FORMS.filter((f) => {
      const matchesGroup = stdFormGroup === "all" || f.group === stdFormGroup;
      const matchesSearch =
        !q || f.name.toLowerCase().includes(q) || f.group.toLowerCase().includes(q) || f.code.toLowerCase().includes(q);
      return matchesGroup && matchesSearch;
    });
  }, [stdFormSearch, stdFormGroup]);

  const projectNameById = useCallback(
    (id: string) => projectById.get(id)?.name || "Unknown project",
    [projectById],
  );
  const formNameById = useCallback(
    (id: string) => formById.get(id)?.name || "Unknown form",
    [formById],
  );
  const colorForProject = useCallback(
    (id: string) => projectColorById.get(id) || PROJECT_PALETTE[0],
    [projectColorById],
  );

  const getUserProjectIds = useCallback(
    (uid: string) => Array.from(new Set(projectAssign[uid] || [])).filter((id) => projectById.has(id)),
    [projectAssign, projectById],
  );
  const getUserFormIds = useCallback(
    (uid: string) => Array.from(new Set(formAssign[uid] || [])).filter((id) => formById.has(id)),
    [formAssign, formById],
  );

  // Group filtered users by the projects they have access to. A user assigned to
  // multiple projects appears under each; users with none fall into "No Project Access".
  const groupedUsers = useMemo(() => {
    const groups: { key: string; name: string; color: typeof NO_ACCESS; users: typeof filteredUsers }[] = [];
    const byKey = new Map<string, { key: string; name: string; color: typeof NO_ACCESS; users: typeof filteredUsers }>();
    const sortedProjects = [...projects].sort((a, b) => a.name.localeCompare(b.name));
    sortedProjects.forEach((p) =>
      byKey.set(p.id, { key: p.id, name: p.name, color: colorForProject(p.id), users: [] }),
    );
    const noAccess = { key: "__none__", name: "No Project Access", color: NO_ACCESS, users: [] as typeof filteredUsers };
    filteredUsers.forEach((u) => {
      const pids = getUserProjectIds(u.user_id);
      if (pids.length === 0) {
        noAccess.users.push(u);
      } else {
        pids.forEach((pid) => byKey.get(pid)?.users.push(u));
      }
    });
    byKey.forEach((g) => { if (g.users.length) groups.push(g); });
    if (noAccess.users.length) groups.push(noAccess);
    return groups;
  }, [filteredUsers, projects, colorForProject, getUserProjectIds]);

  // Track which project folders are collapsed (by group key).
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const toggleGroupCollapse = useCallback((key: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);
  const collapseAllGroups = useCallback(() => {
    setCollapsedGroups(new Set(groupedUsers.map((g) => g.key)));
  }, [groupedUsers]);
  const expandAllGroups = useCallback(() => setCollapsedGroups(new Set()), []);
  const allCollapsed = groupedUsers.length > 0 && collapsedGroups.size >= groupedUsers.length;

  // Stable ref of all row action handlers — its identity never changes, so it
  // never forces memoized rows to re-render. Always points at the latest fns.
  const rowApiRef = useRef<any>({});
  rowApiRef.current = {
    toggleSelect,
    setSelectedUser,
    setShowAssignDialog,
    setCascadeUser,
    setEditProfileData,
    setShowEditProfileDialog,
    setNewRole,
    setShowRoleDialog,
    setShowDeviceDialog,
    setDeleteConfirmText,
    setShowDeleteDialog,
    setImpersonating,
    startImpersonation,
    logAction,
    fetchUsers,
    handleToggleActive,
  };

  // Shared per-row context. Changes only on the rare events that affect every
  // row (role/impersonation/assignment data), not on checkbox toggles.
  const rowCtx = useMemo(
    () => ({
      isOwner,
      isCoOwner,
      isSuperAdmin,
      isImpersonating,
      impersonatingId: impersonating,
      projectNameById,
      formNameById,
      colorForProject,
      getUserProjectIds,
      getUserFormIds,
      formById,
      cascadeAssign,
    }),
    [
      isOwner,
      isCoOwner,
      isSuperAdmin,
      isImpersonating,
      impersonating,
      projectNameById,
      formNameById,
      colorForProject,
      getUserProjectIds,
      getUserFormIds,
      formById,
      cascadeAssign,
    ],
  );

  return (
    <div className="space-y-6 p-4 lg:p-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground lg:text-3xl">
            User Management
          </h1>
          <p className="text-muted-foreground">
            Manage users, roles, and assignments
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(isOwner || isAdmin) && <AdminCreateUsersDialog />}
          {(isOwner || isCoOwner || isAdmin) && <AdminReliabilityPanel />}
          {(isOwner || isCoOwner) && <UserLoginDetailsDialog />}
          {isOwner && <OwnerAccessManager />}
        </div>
      </div>
      {/* Inactive / pending users + blocked attempts audit */}
      <InactiveUsersPanel />


      {/* Search & Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative max-w-md flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search users..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={filterDesignation === "adhoc" ? "acg" : "outline"}
            size="sm"
            onClick={() =>
              setFilterDesignation((prev) => (prev === "adhoc" ? "all" : "adhoc"))
            }
            className="gap-2"
          >
            <Filter className="h-4 w-4" />
            {filterDesignation === "adhoc" ? "Showing Adhoc Users" : "Adhoc Users Only"}
            {filterDesignation === "adhoc" && (
              <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-xs">
                {filteredUsers.length}
              </Badge>
            )}
          </Button>
          {filterDesignation === "adhoc" && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setFilterDesignation("all");
                setSearchQuery("");
              }}
            >
              Clear
            </Button>
          )}
        </div>
      </div>

      {/* Users List */}
      <Card className="border-0 shadow-card">
        <CardHeader className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="font-display flex items-center gap-2">
              <Users className="h-5 w-5" />
              All Users ({filteredUsers.length})
            </CardTitle>
            <div className="flex items-center gap-2">
              {groupedUsers.length > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8"
                  onClick={allCollapsed ? expandAllGroups : collapseAllGroups}
                  title={allCollapsed ? "Expand all project folders" : "Collapse all project folders"}
                >
                  {allCollapsed ? (
                    <><ChevronsUpDown className="mr-1.5 h-4 w-4" /> Expand all</>
                  ) : (
                    <><ChevronsDownUp className="mr-1.5 h-4 w-4" /> Collapse all</>
                  )}
                </Button>
              )}
              {selectableUsers.length > 0 && (
                <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
                  <Checkbox checked={allFilteredSelected} onCheckedChange={toggleSelectAll} />
                  Select all
                </label>
              )}
            </div>
          </div>
          {selectedIds.size > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-acg-gold/30 bg-acg-gold/5 p-3">
              <Badge variant="secondary">{selectedIds.size} selected</Badge>
              <Button size="sm" variant="outline" disabled={bulkBusy} onClick={() => setShowBulkAssign(true)}>
                <FolderOpen className="mr-1.5 h-4 w-4" /> Assign Project / Forms
              </Button>
              <Button size="sm" variant="outline" disabled={bulkBusy} onClick={handleBulkResendInvite}>
                {bulkBusy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Mail className="mr-1.5 h-4 w-4" />} Resend Invite
              </Button>
              <Button size="sm" variant="outline" className="text-destructive hover:text-destructive" disabled={bulkBusy} onClick={() => setShowBulkRemove(true)}>
                <Trash2 className="mr-1.5 h-4 w-4" /> Remove Access
              </Button>
              <Button size="sm" variant="ghost" onClick={clearSelection}>Clear</Button>
            </div>
          )}
          {(bulkProgress || bulkResults.length > 0) && (
            <div className="mt-2 rounded-lg border bg-muted/30 p-3">
              {bulkProgress && (
                <div className="mb-2 space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-medium">
                    <span className="flex items-center gap-1.5">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Processing…
                    </span>
                    <span className="tabular-nums">
                      {bulkProgress.done} / {bulkProgress.total}
                    </span>
                  </div>
                  <Progress
                    value={bulkProgress.total ? (bulkProgress.done / bulkProgress.total) * 100 : 0}
                    className="h-1.5"
                  />
                </div>
              )}
              {bulkResults.length > 0 && (
                <>
                  <div className="mb-1.5 flex items-center justify-between">
                    <p className="text-xs font-semibold text-muted-foreground">
                      {bulkResults.filter((r) => r.ok).length} succeeded ·{" "}
                      {bulkResults.filter((r) => !r.ok).length} failed
                    </p>
                    {!bulkBusy && (
                      <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => setBulkResults([])}>
                        Dismiss
                      </Button>
                    )}
                  </div>
                  <div className="max-h-40 space-y-1 overflow-y-auto">
                    {bulkResults.map((r, i) => (
                      <div key={i} className="flex items-start gap-1.5 text-xs">
                        {r.ok ? (
                          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                        ) : (
                          <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
                        )}
                        <span className="font-medium">{r.name}</span>
                        <span className="text-muted-foreground">— {r.message}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex h-48 items-center justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : (
            <div className="space-y-6">
              {groupedUsers.map((group) => {
                const collapsed = collapsedGroups.has(group.key);
                return (
                <div key={group.key} className="space-y-3">
                  <div className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${group.color.soft}`}>
                    {group.users.some((u) => !u.is_owner) && (
                      <label className="flex items-center" title={`Select all in ${group.name}`}>
                        <Checkbox
                          checked={groupIsAllSelected(group.users)}
                          onCheckedChange={() => toggleSelectGroup(group.users)}
                        />
                      </label>
                    )}
                    <button
                      type="button"
                      onClick={() => toggleGroupCollapse(group.key)}
                      className="flex flex-1 items-center gap-2 text-left"
                      aria-expanded={!collapsed}
                      title={collapsed ? `Expand ${group.name}` : `Collapse ${group.name}`}
                    >
                      {collapsed ? (
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      )}
                      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${group.color.bar}`} />
                      <FolderOpen className="h-4 w-4 text-muted-foreground" />
                      <h3 className="font-display text-sm font-semibold text-foreground">{group.name}</h3>
                      <Badge variant="secondary" className="ml-auto">{group.users.length}</Badge>
                    </button>
                  </div>
                  {!collapsed && group.users.map((user) => (
                    <UserCard
                      key={`${group.key}-${user.id}`}
                      user={user}
                      selected={selectedIds.has(user.user_id)}
                      ctx={rowCtx}
                      api={rowApiRef}
                    />
                  ))}
                </div>
                );
              })}
            </div>

          )}
        </CardContent>
      </Card>

      {/* Change Role Dialog */}
      <Dialog open={showRoleDialog} onOpenChange={setShowRoleDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change User Role</DialogTitle>
            <DialogDescription>
              Update the role for {getUserDisplayName(selectedUser)}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Select Role</Label>
              <Select value={newRole} onValueChange={setNewRole}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a role" />
                </SelectTrigger>
                <SelectContent>
                  {isSuperAdmin && (
                    <SelectItem value="super_admin">Super Admin</SelectItem>
                  )}
                  <SelectItem value="systems_admin">Systems Admin</SelectItem>
                  <SelectItem value="user">User</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setShowRoleDialog(false)}>
                Cancel
              </Button>
              <Button variant="acg" onClick={handleUpdateRole}>
                Update Role
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Assignment Dialog */}
      <Dialog open={showAssignDialog} onOpenChange={setShowAssignDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Assign User</DialogTitle>
            <DialogDescription>
              Assign {getUserDisplayName(selectedUser)} to projects or forms
            </DialogDescription>
          </DialogHeader>
          <Tabs defaultValue="project" className="mt-4">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="project">
                <FolderOpen className="mr-2 h-4 w-4" />
                Project
              </TabsTrigger>
              <TabsTrigger value="form">
                <FileText className="mr-2 h-4 w-4" />
                Form
              </TabsTrigger>
              <TabsTrigger value="standard">
                <FileText className="mr-2 h-4 w-4" />
                Standard
              </TabsTrigger>
            </TabsList>
            <TabsContent value="project" className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label>Select Project</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search projects..."
                    value={projectFilter}
                    onChange={(e) => setProjectFilter(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <Select value={selectedProject} onValueChange={setSelectedProject}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a project" />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredProjects.length === 0 && (
                      <div className="px-2 py-1.5 text-xs text-muted-foreground">No projects match.</div>
                    )}
                    {filteredProjects.map((project) => (
                      <SelectItem key={project.id} value={project.id}>
                        {project.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                variant="acg"
                className="w-full"
                onClick={handleAssignProject}
                disabled={!selectedProject}
              >
                Assign to Project
              </Button>
            </TabsContent>
            <TabsContent value="form" className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label>Select Form</Label>
                <Select value={selectedForm} onValueChange={setSelectedForm}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a form" />
                  </SelectTrigger>
                  <SelectContent>
                    {forms.map((form) => (
                      <SelectItem key={form.id} value={form.id}>
                        {form.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                variant="acg"
                className="w-full"
                onClick={handleAssignForm}
                disabled={!selectedForm}
              >
                Assign to Form
              </Button>
            </TabsContent>
            <TabsContent value="standard" className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label>Select Standard Form</Label>
                <div className="grid grid-cols-2 gap-2">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="Search forms..."
                      value={stdFormSearch}
                      onChange={(e) => setStdFormSearch(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                  <Select value={stdFormGroup} onValueChange={setStdFormGroup}>
                    <SelectTrigger><SelectValue placeholder="All categories" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All categories</SelectItem>
                      {standardFormGroups.map((g) => (
                        <SelectItem key={g} value={g}>{g}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Select value={selectedStandardForm} onValueChange={setSelectedStandardForm}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a standard form" />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredStandardForms.length === 0 && (
                      <div className="px-2 py-1.5 text-xs text-muted-foreground">No standard forms match.</div>
                    )}
                    {filteredStandardForms.map((def) => (
                      <SelectItem key={def.code} value={def.code}>
                        {def.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                variant="acg"
                className="w-full"
                onClick={handleAssignStandardForm}
                disabled={!selectedStandardForm}
              >
                Assign Standard Form
              </Button>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* Edit Profile Dialog */}
      <Dialog open={showEditProfileDialog} onOpenChange={setShowEditProfileDialog}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit User Profile</DialogTitle>
            <DialogDescription>
              Update profile information for {getUserDisplayName(selectedUser)}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>First Name</Label>
                <Input
                  value={editProfileData.first_name || ""}
                  onChange={(e) => setEditProfileData(prev => ({ ...prev, first_name: e.target.value }))}
                  placeholder="First name"
                />
              </div>
              <div className="space-y-2">
                <Label>Last Name</Label>
                <Input
                  value={editProfileData.last_name || ""}
                  onChange={(e) => setEditProfileData(prev => ({ ...prev, last_name: e.target.value }))}
                  placeholder="Last name"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Phone Number</Label>
              <Input
                value={editProfileData.phone_number || ""}
                onChange={(e) => setEditProfileData(prev => ({ ...prev, phone_number: e.target.value }))}
                placeholder="Phone number"
              />
            </div>
            <div className="space-y-2">
              <Label>Designation</Label>
              <Select
                value={editProfileData.designation || ""}
                onValueChange={(val) => setEditProfileData(prev => ({ ...prev, designation: val }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select designation" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="adhoc_user">Adhoc User (Forms, Project Chat & My Submissions only)</SelectItem>
                  <SelectItem value="independent_monitor">Independent Monitor</SelectItem>
                  <SelectItem value="enumerator">Enumerator</SelectItem>
                  <SelectItem value="data_collector">Data Collector</SelectItem>
                  <SelectItem value="electronic_data_manager">Electronic Data Manager</SelectItem>
                  <SelectItem value="community_directed_distributor">Community Directed Distributor</SelectItem>
                  <SelectItem value="flhf_supervisor">FLHF Supervisor</SelectItem>
                  <SelectItem value="lga_supervisor">LGA Supervisor</SelectItem>
                  <SelectItem value="state_supervisor">State Supervisor</SelectItem>
                  <SelectItem value="hands_staff">HANDS Staff</SelectItem>
                  <SelectItem value="cbmg_staff">CBMG Staff</SelectItem>
                  <SelectItem value="cbmi_staff">CBMI Staff</SelectItem>
                  <SelectItem value="sightsavers_staff">Sightsavers Staff</SelectItem>
                  <SelectItem value="plan_intl_staff">Plan Intl Staff</SelectItem>
                  <SelectItem value="sci_staff">SCI Staff</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {editProfileData.designation === "other" && (
              <div className="space-y-2">
                <Label>Other Designation</Label>
                <Input
                  value={editProfileData.other_designation || ""}
                  onChange={(e) => setEditProfileData(prev => ({ ...prev, other_designation: e.target.value }))}
                  placeholder="Specify designation"
                />
              </div>
            )}
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label>State</Label>
                <Input
                  value={editProfileData.state || ""}
                  onChange={(e) => setEditProfileData(prev => ({ ...prev, state: e.target.value }))}
                  placeholder="State"
                />
              </div>
              <div className="space-y-2">
                <Label>LGA</Label>
                <Input
                  value={editProfileData.lga || ""}
                  onChange={(e) => setEditProfileData(prev => ({ ...prev, lga: e.target.value }))}
                  placeholder="LGA"
                />
              </div>
              <div className="space-y-2">
                <Label>Ward</Label>
                <Input
                  value={editProfileData.ward || ""}
                  onChange={(e) => setEditProfileData(prev => ({ ...prev, ward: e.target.value }))}
                  placeholder="Ward"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Button variant="outline" onClick={() => setShowEditProfileDialog(false)}>
                Cancel
              </Button>
              <Button variant="acg" onClick={handleUpdateProfile}>
                Save Changes
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Device Management Dialog */}
      {selectedUser && (
        <DeviceManagementDialog
          isOpen={showDeviceDialog}
          onClose={() => setShowDeviceDialog(false)}
          userId={selectedUser.user_id}
          userName={getUserDisplayName(selectedUser)}
        />
      )}

      {cascadeUser && (
        <CascadeAssignmentDialog
          userId={cascadeUser.user_id}
          userName={getUserDisplayName(cascadeUser)}
          open={!!cascadeUser}
          onOpenChange={(v) => { if (!v) setCascadeUser(null); }}
          onSaved={fetchAssignments}
        />
      )}

      {/* Permanent Deletion Confirmation (Owner only) */}
      <AlertDialog open={showDeleteDialog} onOpenChange={(open) => { if (!deletingUser) { setShowDeleteDialog(open); if (!open) setDeleteConfirmText(""); } }}>
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader>
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
              <AlertTriangle className="h-6 w-6 text-destructive" />
            </div>
            <AlertDialogTitle className="text-center text-xl">
              Permanently delete this account?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 pt-1 text-sm text-muted-foreground">
                {selectedUser && (
                  <p className="text-center font-medium text-foreground">
                     {getUserDisplayName(selectedUser)} · {safeText(selectedUser.email)}
                  </p>
                )}
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-left">
                  <p className="mb-2 font-semibold text-destructive">This action cannot be undone.</p>
                  <ul className="list-disc space-y-1 pl-5">
                    <li>The user is signed out everywhere immediately and loses all access.</li>
                    <li>Their profile, role and assignments are permanently removed.</li>
                    <li>They will <span className="font-semibold text-foreground">never be able to log in again</span> with this account.</li>
                    <li>The only way to restore access is to create a brand-new account for them — by self sign-up or Admin user creation.</li>
                  </ul>
                </div>
                <div className="space-y-1.5 text-left">
                  <Label className="text-foreground">Type <span className="font-mono font-semibold">DELETE</span> to confirm</Label>
                  <Input
                    value={deleteConfirmText}
                    onChange={(e) => setDeleteConfirmText(e.target.value)}
                    placeholder="DELETE"
                    autoFocus
                  />
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button variant="outline" disabled={deletingUser} onClick={() => { setShowDeleteDialog(false); setDeleteConfirmText(""); }}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deletingUser || deleteConfirmText.trim() !== "DELETE"}
              onClick={handleDeleteUserPermanently}
            >
              {deletingUser ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
              Delete Permanently
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk: Assign Project */}
      <Dialog open={showBulkAssign} onOpenChange={setShowBulkAssign}>
        <DialogContent className="max-h-[88vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Assign Access to {selectedIds.size} User(s)</DialogTitle>
            <DialogDescription>
              Pick a project, forms, standard forms and/or pages. Restricting standard forms limits
              non-admin users to only what you assign here — Systems &amp; Super Admins keep their full role access.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Label>Project (optional)</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search projects..."
                value={projectFilter}
                onChange={(e) => setProjectFilter(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={bulkProject || "__none__"} onValueChange={(v) => setBulkProject(v === "__none__" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="Select a project" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">No project</SelectItem>
                {filteredProjects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex items-center justify-between">
              <Label>Forms (optional)</Label>
              {bulkForms.size > 0 && (
                <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => setBulkForms(new Set())}>
                  Clear ({bulkForms.size})
                </Button>
              )}
            </div>
            <div className="max-h-44 space-y-1 overflow-y-auto rounded-lg border p-2">
              {forms.length === 0 && <p className="text-xs text-muted-foreground">No forms available.</p>}
              {forms.map((f) => (
                <label key={f.id} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-muted/50">
                  <Checkbox
                    checked={bulkForms.has(f.id)}
                    onCheckedChange={() =>
                      setBulkForms((prev) => {
                        const next = new Set(prev);
                        next.has(f.id) ? next.delete(f.id) : next.add(f.id);
                        return next;
                      })
                    }
                  />
                  <span className="truncate">{f.name}</span>
                </label>
              ))}
            </div>

            {/* Standard forms */}
            <div className="flex items-center justify-between">
              <Label>Standard forms (optional)</Label>
              {bulkStandardForms.size > 0 && (
                <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => setBulkStandardForms(new Set())}>
                  Clear ({bulkStandardForms.size})
                </Button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search forms..."
                  value={stdFormSearch}
                  onChange={(e) => setStdFormSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={stdFormGroup} onValueChange={setStdFormGroup}>
                <SelectTrigger><SelectValue placeholder="All categories" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All categories</SelectItem>
                  {standardFormGroups.map((g) => (
                    <SelectItem key={g} value={g}>{g}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="max-h-44 space-y-1 overflow-y-auto rounded-lg border p-2">
              {filteredStandardForms.length === 0 && (
                <p className="text-xs text-muted-foreground">No standard forms match your search.</p>
              )}
              {filteredStandardForms.map((def) => (
                <label key={def.code} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-muted/50">
                  <Checkbox
                    checked={bulkStandardForms.has(def.code)}
                    onCheckedChange={() =>
                      setBulkStandardForms((prev) => {
                        const next = new Set(prev);
                        next.has(def.code) ? next.delete(def.code) : next.add(def.code);
                        return next;
                      })
                    }
                  />
                  <span className="truncate">{def.name}</span>
                  <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">{def.group}</span>
                </label>
              ))}
            </div>
            {bulkStandardForms.size > 0 && (
              <label className="flex items-start gap-2 rounded-lg border bg-muted/30 p-2.5 text-sm">
                <Switch checked={bulkRestrictStandard} onCheckedChange={setBulkRestrictStandard} className="mt-0.5" />
                <span className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">Restrict to only these standard forms.</span>{" "}
                  Non-admin users will no longer see every standard form their designation grants — only the ones
                  selected above. Systems &amp; Super Admins are never restricted.
                </span>
              </label>
            )}

            {/* Pages */}
            <div className="flex items-center justify-between">
              <Label>Pages (optional)</Label>
              {bulkPages.size > 0 && (
                <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => setBulkPages(new Set())}>
                  Clear ({bulkPages.size})
                </Button>
              )}
            </div>
            <div className="max-h-44 space-y-1 overflow-y-auto rounded-lg border p-2">
              {RESTRICTED_PAGES.map((pg) => (
                <label key={pg.id} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-muted/50">
                  <Checkbox
                    checked={bulkPages.has(pg.id)}
                    onCheckedChange={() =>
                      setBulkPages((prev) => {
                        const next = new Set(prev);
                        next.has(pg.id) ? next.delete(pg.id) : next.add(pg.id);
                        return next;
                      })
                    }
                  />
                  <span className="truncate">{pg.label}</span>
                </label>
              ))}
            </div>

            {/* Minimal-access lock */}
            <label className="flex items-start gap-2 rounded-lg border bg-muted/30 p-2.5 text-sm">
              <Switch checked={bulkMinimalLock} onCheckedChange={setBulkMinimalLock} className="mt-0.5" />
              <span className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Lock to Forms, Project Chat &amp; My Submissions only.</span>{" "}
                Non-admin users will see nothing else their designation would normally unlock.
                Systems &amp; Super Admins are never affected.
              </span>
            </label>

            <Button
              className="w-full"
              disabled={
                (!bulkProject &&
                  bulkForms.size === 0 &&
                  bulkStandardForms.size === 0 &&
                  bulkPages.size === 0 &&
                  !bulkMinimalLock) ||
                bulkBusy
              }
              onClick={handleBulkAssignProject}
            >
              {bulkBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FolderOpen className="mr-2 h-4 w-4" />}
              Assign to {selectedIds.size} User(s)
            </Button>
            {bulkProgress && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs font-medium">
                  <span>Processing…</span>
                  <span className="tabular-nums">{bulkProgress.done} / {bulkProgress.total}</span>
                </div>
                <Progress value={bulkProgress.total ? (bulkProgress.done / bulkProgress.total) * 100 : 0} className="h-1.5" />
              </div>
            )}
            {bulkResults.length > 0 && (
              <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border bg-muted/30 p-2">
                {bulkResults.map((r, i) => (
                  <div key={i} className="flex items-start gap-1.5 text-xs">
                    {r.ok ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" /> : <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />}
                    <span className="font-medium">{r.name}</span>
                    <span className="text-muted-foreground">— {r.message}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Bulk: Remove Access */}
      <AlertDialog open={showBulkRemove} onOpenChange={setShowBulkRemove}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove access for {selectedIds.size} user(s)?</AlertDialogTitle>
            <AlertDialogDescription>
              These users will be deactivated and can no longer sign in or use the app until an admin reactivates them. This does not permanently delete their accounts.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {bulkProgress && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs font-medium">
                <span>Processing…</span>
                <span className="tabular-nums">{bulkProgress.done} / {bulkProgress.total}</span>
              </div>
              <Progress value={bulkProgress.total ? (bulkProgress.done / bulkProgress.total) * 100 : 0} className="h-1.5" />
            </div>
          )}
          {bulkResults.length > 0 && (
            <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border bg-muted/30 p-2">
              {bulkResults.map((r, i) => (
                <div key={i} className="flex items-start gap-1.5 text-xs">
                  {r.ok ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" /> : <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />}
                  <span className="font-medium">{r.name}</span>
                  <span className="text-muted-foreground">— {r.message}</span>
                </div>
              ))}
            </div>
          )}
          <AlertDialogFooter>
            <Button variant="outline" onClick={() => setShowBulkRemove(false)} disabled={bulkBusy}>Cancel</Button>
            <Button variant="destructive" onClick={handleBulkRemoveAccess} disabled={bulkBusy}>
              {bulkBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
              Remove Access
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default UsersView;

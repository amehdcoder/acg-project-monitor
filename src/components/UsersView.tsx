import { useState, useEffect } from "react";
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
  AlertTriangle,
  Filter,
} from "lucide-react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useImpersonation } from "@/hooks/useImpersonation";
import { DeviceManagementDialog } from "@/components/DeviceManagementDialog";
import OwnerAccessManager from "@/components/OwnerTools/OwnerAccessManager";
import AdminCreateUsersDialog from "@/components/OwnerTools/AdminCreateUsersDialog";
import { useAdminSurveillance } from "@/hooks/useAdminSurveillance";
import InactiveUsersPanel from "@/components/InactiveUsersPanel";
import { STANDARD_ASSESSMENTS } from "@/lib/standardAssessments/definitions";

interface UserProfile {
  id: string;
  user_id: string;
  email: string;
  first_name: string;
  last_name: string;
  phone_number: string | null;
  state: string | null;
  lga: string | null;
  ward: string | null;
  designation: string;
  other_designation: string | null;
  is_active: boolean;
  is_owner: boolean;
  approval_status: string;
  created_at: string;
}

interface UserRole {
  id: string;
  user_id: string;
  role: 'super_admin' | 'systems_admin' | 'user';
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

const UsersView = () => {
  const { role: currentUserRole, profile: currentUserProfile, isOwner, isAdmin } = useAuth();
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
  const [showDeviceDialog, setShowDeviceDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deletingUser, setDeletingUser] = useState(false);
  // Bulk selection / actions
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [showBulkAssign, setShowBulkAssign] = useState(false);
  const [bulkProject, setBulkProject] = useState<string>("");
  const [showBulkRemove, setShowBulkRemove] = useState(false);

  useEffect(() => {
    fetchUsers();
    fetchProjects();
    fetchForms();
  }, []);

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

      const usersWithRoles = profiles?.map((profile) => ({
        ...profile,
        role: roles?.find((r) => r.user_id === profile.user_id),
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
        .update({ role: newRole as 'super_admin' | 'systems_admin' | 'user' })
        .eq("user_id", selectedUser.user_id);

      if (error) throw error;

      await logAction(
        "change_user_role",
        `Changed role of ${selectedUser.first_name} ${selectedUser.last_name} (${selectedUser.email}) to ${roleLabels[newRole as keyof typeof roleLabels]?.label}`,
        "user",
        selectedUser.user_id,
        { old_role: selectedUser.role?.role, new_role: newRole }
      );

      toast({
        title: "Role Updated",
        description: `${selectedUser.first_name}'s role has been updated to ${roleLabels[newRole as keyof typeof roleLabels]?.label}.`,
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

      setSelectedProject("");
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

  // ---------------- Bulk actions (selected users) ----------------
  const toggleSelect = (userId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(userId) ? next.delete(userId) : next.add(userId);
      return next;
    });
  };

  const selectableUsers = () => filteredUsers.filter((u) => !u.is_owner);

  const allFilteredSelected =
    selectableUsers().length > 0 &&
    selectableUsers().every((u) => selectedIds.has(u.user_id));

  const toggleSelectAll = () => {
    setSelectedIds((prev) => {
      if (selectableUsers().every((u) => prev.has(u.user_id))) return new Set();
      return new Set(selectableUsers().map((u) => u.user_id));
    });
  };

  const clearSelection = () => setSelectedIds(new Set());

  const selectedUserObjects = () =>
    users.filter((u) => selectedIds.has(u.user_id) && !u.is_owner);

  const handleBulkAssignProject = async () => {
    const targets = selectedUserObjects();
    if (!bulkProject || targets.length === 0) return;
    setBulkBusy(true);
    try {
      const rows = targets.map((u) => ({
        user_id: u.user_id,
        project_id: bulkProject,
        assigned_by: currentUserProfile?.user_id,
      }));
      // upsert-style: ignore duplicates so re-assigning is safe
      const { error } = await supabase
        .from("user_project_assignments")
        .upsert(rows, { onConflict: "user_id,project_id", ignoreDuplicates: true });
      if (error) throw error;
      const projName = projects.find((p) => p.id === bulkProject)?.name || "the project";
      logAction(
        "assign_user_to_project",
        `Bulk assigned ${targets.length} user(s) to ${projName}`,
        undefined,
        undefined,
        { user_ids: targets.map((u) => u.user_id), project_id: bulkProject }
      );
      toast({
        title: "Projects Assigned",
        description: `${targets.length} user(s) assigned to ${projName}.`,
      });
      setShowBulkAssign(false);
      setBulkProject("");
      clearSelection();
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Bulk assign failed", variant: "destructive" });
    } finally {
      setBulkBusy(false);
    }
  };

  const handleBulkResendInvite = async () => {
    const targets = selectedUserObjects();
    if (targets.length === 0) return;
    setBulkBusy(true);
    try {
      const results = await Promise.allSettled(
        targets.map((u) =>
          supabase.functions.invoke("send-password-reset", { body: { email: u.email } })
        )
      );
      const ok = results.filter((r) => r.status === "fulfilled").length;
      logAction(
        "edit_user_profile",
        `Resent access invites to ${ok} user(s)`,
        undefined,
        undefined,
        { user_ids: targets.map((u) => u.user_id) }
      );
      toast({
        title: "Invites Sent",
        description: `Secure access link emailed to ${ok} of ${targets.length} user(s).`,
      });
      clearSelection();
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to resend invites", variant: "destructive" });
    } finally {
      setBulkBusy(false);
    }
  };

  const handleBulkRemoveAccess = async () => {
    const targets = selectedUserObjects();
    if (targets.length === 0) return;
    setBulkBusy(true);
    try {
      const ids = targets.map((u) => u.user_id);
      const { error } = await supabase
        .from("profiles")
        .update({ is_active: false })
        .in("user_id", ids);
      if (error) throw error;
      logAction(
        "deactivate_user",
        `Bulk revoked app access for ${targets.length} user(s)`,
        undefined,
        undefined,
        { user_ids: ids }
      );
      toast({
        title: "Access Removed",
        description: `${targets.length} user(s) can no longer access the app until reactivated.`,
      });
      setShowBulkRemove(false);
      clearSelection();
      fetchUsers();
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to remove access", variant: "destructive" });
    } finally {
      setBulkBusy(false);
    }
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

      setSelectedForm("");
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
        `${newActiveState ? "Activated" : "Deactivated"} user ${userToToggle.first_name} ${userToToggle.last_name} (${userToToggle.email})`,
        "user",
        userToToggle.user_id
      );

      toast({
        title: newActiveState ? "User Activated" : "User Deactivated",
        description: `${userToToggle.first_name} has been ${newActiveState ? "activated" : "deactivated"}.`,
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
        `Permanently deleted user ${selectedUser.first_name} ${selectedUser.last_name} (${selectedUser.email})`,
        "user",
        selectedUser.user_id
      );

      setUsers((prev) => prev.filter((u) => u.user_id !== selectedUser.user_id));
      toast({
        title: "Account Permanently Deleted",
        description: `${selectedUser.first_name} ${selectedUser.last_name} can no longer access the app. A new account must be created for them to return.`,
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
          first_name: editProfileData.first_name || selectedUser.first_name,
          last_name: editProfileData.last_name || selectedUser.last_name,
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
        description: `${editProfileData.first_name || selectedUser.first_name}'s profile has been updated.`,
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

  const filteredUsers = users.filter((user) => {
    const matchesSearch = `${user.first_name} ${user.last_name} ${user.email}`
      .toLowerCase()
      .includes(searchQuery.toLowerCase());
    const matchesDesignation = filterDesignation === "all" || user.designation === "adhoc_user";
    return matchesSearch && matchesDesignation;
  });

  const isSuperAdmin = currentUserRole === "super_admin";

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
            {selectableUsers().length > 0 && (
              <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
                <Checkbox checked={allFilteredSelected} onCheckedChange={toggleSelectAll} />
                Select all
              </label>
            )}
          </div>
          {selectedIds.size > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-acg-gold/30 bg-acg-gold/5 p-3">
              <Badge variant="secondary">{selectedIds.size} selected</Badge>
              <Button size="sm" variant="outline" disabled={bulkBusy} onClick={() => setShowBulkAssign(true)}>
                <FolderOpen className="mr-1.5 h-4 w-4" /> Assign Project
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
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex h-48 items-center justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : (
            <div className="space-y-3">
              {filteredUsers.map((user) => {
                const roleInfo = roleLabels[user.role?.role || "user"];
                const RoleIcon = roleInfo.icon;

                return (
                  <div
                    key={user.id}
                    className={`group flex flex-col gap-4 rounded-xl border border-border bg-card p-4 transition-all duration-200 hover:border-acg-gold/30 hover:shadow-soft sm:flex-row sm:items-center sm:justify-between ${
                      !user.is_active ? "opacity-60" : ""
                    }`}
                  >
                    <div className="flex items-start gap-4">
                      {!user.is_owner && (
                        <Checkbox
                          className="mt-5"
                          checked={selectedIds.has(user.user_id)}
                          onCheckedChange={() => toggleSelect(user.user_id)}
                        />
                      )}
                      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                        <User className="h-7 w-7 text-primary" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="font-medium text-foreground">
                            {user.first_name} {user.last_name}
                          </h4>
                          {user.is_owner && (
                            <Badge variant="outline" className="border-acg-gold text-acg-gold">
                              Owner
                            </Badge>
                          )}
                          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${roleInfo.color}`}>
                            <RoleIcon className="h-3 w-3" />
                            {roleInfo.label}
                          </span>
                          {!user.is_active && (
                            <Badge variant="secondary">Inactive</Badge>
                          )}
                          {user.approval_status === "pending" && (
                            <Badge variant="outline" className="border-amber-500 bg-amber-50 text-amber-700">Pending Approval</Badge>
                          )}
                          {user.approval_status === "rejected" && (
                            <Badge variant="destructive">Rejected</Badge>
                          )}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Mail className="h-3 w-3" />
                            {user.email}
                          </span>
                          {user.phone_number && (
                            <span className="flex items-center gap-1">
                              <Phone className="h-3 w-3" />
                              {user.phone_number}
                            </span>
                          )}
                          {user.state && (
                            <span className="flex items-center gap-1">
                              <MapPin className="h-3 w-3" />
                              {user.state}
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground capitalize">
                          {user.designation.replace("_", " ")}
                          {user.other_designation && ` - ${user.other_designation}`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSelectedUser(user);
                          setShowAssignDialog(true);
                        }}
                      >
                        <FolderOpen className="h-4 w-4" />
                        Assign
                      </Button>
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
                                  setSelectedUser(user);
                                  setEditProfileData({
                                    first_name: user.first_name,
                                    last_name: user.last_name,
                                    phone_number: user.phone_number,
                                    state: user.state,
                                    lga: user.lga,
                                    ward: user.ward,
                                    designation: user.designation,
                                    other_designation: user.other_designation,
                                  });
                                  setShowEditProfileDialog(true);
                                }}
                              >
                                <Edit className="mr-2 h-4 w-4" />
                                Edit Profile
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => {
                                  setSelectedUser(user);
                                  setNewRole(user.role?.role || "user");
                                  setShowRoleDialog(true);
                                }}
                                disabled={user.is_owner}
                              >
                                <UserCog className="mr-2 h-4 w-4" />
                                Change Role
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={async () => {
                                  setImpersonating(user.user_id);
                                  const success = await startImpersonation(
                                    user.user_id,
                                    `${user.first_name} ${user.last_name}`
                                  );
                                  if (success) {
                                    await logAction(
                                      "impersonate_user",
                                      `Started impersonating ${user.first_name} ${user.last_name} (${user.email})`,
                                      "user",
                                      user.user_id
                                    );
                                  }
                                  setImpersonating(null);
                                }}
                                disabled={user.is_owner || isImpersonating || impersonating === user.user_id}
                              >
                                {impersonating === user.user_id ? (
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
                                setSelectedUser(user);
                                setShowDeviceDialog(true);
                              }}
                            >
                              <Monitor className="mr-2 h-4 w-4" />
                              View Devices
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem
                            onClick={() => handleToggleActive(user)}
                            disabled={user.is_owner}
                          >
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
                                  await logAction("approve_user", `Approved user ${user.first_name} ${user.last_name} (${user.email})`, "user", user.user_id);
                                  toast({ title: "User Approved", description: `${user.first_name} ${user.last_name} has been approved.` });
                                  fetchUsers();
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
                                  await logAction("reject_user", `Rejected user ${user.first_name} ${user.last_name} (${user.email})`, "user", user.user_id);
                                  toast({ title: "User Rejected", description: `${user.first_name} ${user.last_name} has been rejected.` });
                                  fetchUsers();
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
                                setSelectedUser(user);
                                setDeleteConfirmText("");
                                setShowDeleteDialog(true);
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
              Update the role for {selectedUser?.first_name} {selectedUser?.last_name}
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
              Assign {selectedUser?.first_name} to projects or forms
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
                <Select value={selectedProject} onValueChange={setSelectedProject}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a project" />
                  </SelectTrigger>
                  <SelectContent>
                    {projects.map((project) => (
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
                <Select value={selectedStandardForm} onValueChange={setSelectedStandardForm}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a standard form" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.values(STANDARD_ASSESSMENTS).map((def: any) => (
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
              Update profile information for {selectedUser?.first_name} {selectedUser?.last_name}
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
          userName={`${selectedUser.first_name} ${selectedUser.last_name}`}
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
                    {selectedUser.first_name} {selectedUser.last_name} · {selectedUser.email}
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
    </div>
  );
};

export default UsersView;

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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useImpersonation } from "@/hooks/useImpersonation";
import { DeviceManagementDialog } from "@/components/DeviceManagementDialog";

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
  const { role: currentUserRole, profile: currentUserProfile } = useAuth();
  const { startImpersonation, isImpersonating } = useImpersonation();
  const [users, setUsers] = useState<(UserProfile & { role?: UserRole })[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [forms, setForms] = useState<Form[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedUser, setSelectedUser] = useState<(UserProfile & { role?: UserRole }) | null>(null);
  const [showRoleDialog, setShowRoleDialog] = useState(false);
  const [showAssignDialog, setShowAssignDialog] = useState(false);
  const [showEditProfileDialog, setShowEditProfileDialog] = useState(false);
  const [editProfileData, setEditProfileData] = useState<Partial<UserProfile>>({});
  const [impersonating, setImpersonating] = useState<string | null>(null);
  const [newRole, setNewRole] = useState<string>("");
  const [selectedProject, setSelectedProject] = useState<string>("");
  const [selectedForm, setSelectedForm] = useState<string>("");
  const [showDeviceDialog, setShowDeviceDialog] = useState(false);

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

  const handleToggleActive = async (user: UserProfile & { role?: UserRole }) => {
    if (user.is_owner) {
      toast({
        title: "Cannot deactivate owner",
        description: "The owner account cannot be deactivated.",
        variant: "destructive",
      });
      return;
    }

    try {
      const { error } = await supabase
        .from("profiles")
        .update({ is_active: !user.is_active })
        .eq("id", user.id);

      if (error) throw error;

      toast({
        title: user.is_active ? "User Deactivated" : "User Activated",
        description: `${user.first_name} has been ${user.is_active ? "deactivated" : "activated"}.`,
      });

      fetchUsers();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update user status",
        variant: "destructive",
      });
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

  const filteredUsers = users.filter((user) =>
    `${user.first_name} ${user.last_name} ${user.email}`
      .toLowerCase()
      .includes(searchQuery.toLowerCase())
  );

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
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search users..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Users List */}
      <Card className="border-0 shadow-card">
        <CardHeader>
          <CardTitle className="font-display flex items-center gap-2">
            <Users className="h-5 w-5" />
            All Users ({filteredUsers.length})
          </CardTitle>
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
                                  await startImpersonation(
                                    user.user_id,
                                    `${user.first_name} ${user.last_name}`
                                  );
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
                                    message: "Your account has been approved! You now have full access to ACG Monitor.",
                                    type: "success",
                                    category: "registration",
                                  });
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
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="project">
                <FolderOpen className="mr-2 h-4 w-4" />
                Project
              </TabsTrigger>
              <TabsTrigger value="form">
                <FileText className="mr-2 h-4 w-4" />
                Form
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
    </div>
  );
};

export default UsersView;

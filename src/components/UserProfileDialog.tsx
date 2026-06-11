import { useState, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Switch } from "@/components/ui/switch";
import { User, Mail, Phone, MapPin, Briefcase, Save, Loader2, Lock, Eye, EyeOff, Shield, Camera, Bell } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface UserProfileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const DESIGNATIONS = [
  { value: "independent_monitor", label: "Independent Monitor" },
  { value: "enumerator", label: "Enumerator" },
  { value: "data_collector", label: "Data Collector" },
  { value: "electronic_data_manager", label: "Electronic Data Manager" },
  { value: "community_directed_distributor", label: "Community Directed Distributor" },
  { value: "flhf_supervisor", label: "FLHF Supervisor" },
  { value: "lga_supervisor", label: "LGA Supervisor" },
  { value: "state_supervisor", label: "State Supervisor" },
  { value: "hands_staff", label: "HANDS Staff" },
  { value: "cbmg_staff", label: "CBMG Staff" },
  { value: "cbmi_staff", label: "CBMI Staff" },
  { value: "sightsavers_staff", label: "Sightsavers Staff" },
  { value: "plan_intl_staff", label: "Plan International Staff" },
  { value: "sci_staff", label: "SCI Staff" },
  { value: "adhoc_user", label: "Adhoc User" },
  { value: "other", label: "Other" },
];

const NIGERIAN_STATES = [
  "Abia", "Adamawa", "Akwa Ibom", "Anambra", "Bauchi", "Bayelsa", "Benue",
  "Borno", "Cross River", "Delta", "Ebonyi", "Edo", "Ekiti", "Enugu", "FCT",
  "Gombe", "Imo", "Jigawa", "Kaduna", "Kano", "Katsina", "Kebbi", "Kogi",
  "Kwara", "Lagos", "Nasarawa", "Niger", "Ogun", "Ondo", "Osun", "Oyo",
  "Plateau", "Rivers", "Sokoto", "Taraba", "Yobe", "Zamfara"
];

interface NotificationPreferences {
  email_task_assigned: boolean;
  email_task_due: boolean;
  email_form_submitted: boolean;
  email_system_alerts: boolean;
}

const DEFAULT_NOTIFICATION_PREFS: NotificationPreferences = {
  email_task_assigned: true,
  email_task_due: true,
  email_form_submitted: true,
  email_system_alerts: true,
};

const UserProfileDialog = ({ open, onOpenChange }: UserProfileDialogProps) => {
  const { profile, user, role, refreshProfile } = useAuth();
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("profile");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [notificationPrefs, setNotificationPrefs] = useState<NotificationPreferences>(DEFAULT_NOTIFICATION_PREFS);
  const [formData, setFormData] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone_number: "",
    alternate_email: "",
    alternate_phone: "",
    designation: "data_collector",
    other_designation: "",
    state: "",
    lga: "",
    ward: "",
  });

  // Password change state
  const [passwordData, setPasswordData] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);

  useEffect(() => {
    if (profile) {
      setFormData({
        first_name: profile.first_name || "",
        last_name: profile.last_name || "",
        email: profile.email || "",
        phone_number: profile.phone_number || "",
        alternate_email: profile.alternate_email || "",
        alternate_phone: profile.alternate_phone || "",
        designation: profile.designation || "data_collector",
        other_designation: profile.other_designation || "",
        state: profile.state || "",
        lga: profile.lga || "",
        ward: profile.ward || "",
      });
      // Load avatar URL
      setAvatarUrl((profile as any).avatar_url || null);
      // Load notification preferences
      const prefs = (profile as any).notification_preferences;
      if (prefs) {
        setNotificationPrefs({ ...DEFAULT_NOTIFICATION_PREFS, ...prefs });
      }
    }
  }, [profile]);

  useEffect(() => {
    if (!open) {
      // Reset password fields when dialog closes
      setPasswordData({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });
      setActiveTab("profile");
    }
  }, [open]);

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    if (!user?.id) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          first_name: formData.first_name,
          last_name: formData.last_name,
          phone_number: formData.phone_number,
          alternate_email: formData.alternate_email,
          alternate_phone: formData.alternate_phone,
          designation: formData.designation as any,
          other_designation: formData.other_designation,
          state: formData.state,
          lga: formData.lga,
          ward: formData.ward,
          notification_preferences: notificationPrefs as any,
        })
        .eq("user_id", user.id);

      if (error) throw error;

      await refreshProfile();
      toast({
        title: "Profile Updated",
        description: "Your profile has been saved successfully.",
      });
      onOpenChange(false);
    } catch (error: any) {
      console.error("Error updating profile:", error);
      toast({
        title: "Update Failed",
        description: error.message || "Failed to update profile.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !user?.id) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      toast({
        title: "Invalid File",
        description: "Please select an image file.",
        variant: "destructive",
      });
      return;
    }

    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      toast({
        title: "File Too Large",
        description: "Image must be less than 2MB.",
        variant: "destructive",
      });
      return;
    }

    setUploadingAvatar(true);
    try {
      const fileExt = file.name.split(".").pop();
      const filePath = `${user.id}/avatar.${fileExt}`;

      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: urlData } = supabase.storage
        .from("avatars")
        .getPublicUrl(filePath);

      const newAvatarUrl = urlData.publicUrl + `?t=${Date.now()}`;

      // Update profile with new avatar URL
      const { error: updateError } = await supabase
        .from("profiles")
        .update({ avatar_url: newAvatarUrl })
        .eq("user_id", user.id);

      if (updateError) throw updateError;

      setAvatarUrl(newAvatarUrl);
      await refreshProfile();
      toast({
        title: "Avatar Updated",
        description: "Your profile picture has been updated.",
      });
    } catch (error: any) {
      console.error("Error uploading avatar:", error);
      toast({
        title: "Upload Failed",
        description: error.message || "Failed to upload avatar.",
        variant: "destructive",
      });
    } finally {
      setUploadingAvatar(false);
    }
  };

  const getInitials = () => {
    const first = formData.first_name?.charAt(0) || "";
    const last = formData.last_name?.charAt(0) || "";
    return (first + last).toUpperCase() || "U";
  };

  const handlePasswordChange = async () => {
    if (!passwordData.newPassword || !passwordData.confirmPassword) {
      toast({
        title: "Missing Fields",
        description: "Please fill in all password fields.",
        variant: "destructive",
      });
      return;
    }

    if (passwordData.newPassword.length < 6) {
      toast({
        title: "Password Too Short",
        description: "Password must be at least 6 characters.",
        variant: "destructive",
      });
      return;
    }

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      toast({
        title: "Passwords Don't Match",
        description: "New password and confirmation must match.",
        variant: "destructive",
      });
      return;
    }

    setChangingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: passwordData.newPassword,
      });

      if (error) throw error;

      toast({
        title: "Password Updated",
        description: "Your password has been changed successfully.",
      });

      setPasswordData({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });
    } catch (error: any) {
      console.error("Error changing password:", error);
      toast({
        title: "Password Change Failed",
        description: error.message || "Failed to change password.",
        variant: "destructive",
      });
    } finally {
      setChangingPassword(false);
    }
  };

  const getRoleBadge = () => {
    if (role === "super_admin") {
      return <Badge className="bg-red-500 text-white">Super Admin</Badge>;
    }
    if (role === "systems_admin") {
      return <Badge className="bg-blue-500 text-white">Systems Admin</Badge>;
    }
    return <Badge variant="secondary">User</Badge>;
  };

  const getPasswordStrength = (password: string) => {
    if (!password) return { strength: 0, label: "" };
    let strength = 0;
    if (password.length >= 6) strength++;
    if (password.length >= 8) strength++;
    if (/[A-Z]/.test(password)) strength++;
    if (/[0-9]/.test(password)) strength++;
    if (/[^A-Za-z0-9]/.test(password)) strength++;

    const labels = ["", "Weak", "Fair", "Good", "Strong", "Very Strong"];
    return { strength, label: labels[strength] || "" };
  };

  const passwordStrength = getPasswordStrength(passwordData.newPassword);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display">
            <User className="h-5 w-5 text-primary" />
            My Profile
          </DialogTitle>
          <DialogDescription>
            View and update your account settings
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="profile">
              <User className="h-4 w-4 mr-2" />
              Profile
            </TabsTrigger>
            <TabsTrigger value="notifications">
              <Bell className="h-4 w-4 mr-2" />
              Emails
            </TabsTrigger>
            <TabsTrigger value="security">
              <Lock className="h-4 w-4 mr-2" />
              Security
            </TabsTrigger>
          </TabsList>

          <TabsContent value="profile" className="mt-4">
            <ScrollArea className="max-h-[50vh]">
              <div className="space-y-6 pr-4">
                {/* Avatar Section */}
                <div className="flex items-center gap-4">
                  <div className="relative">
                    <Avatar className="h-20 w-20">
                      <AvatarImage src={avatarUrl || undefined} alt="Profile" />
                      <AvatarFallback className="text-xl bg-primary/10 text-primary">
                        {getInitials()}
                      </AvatarFallback>
                    </Avatar>
                    <Button
                      size="icon"
                      variant="secondary"
                      className="absolute -bottom-1 -right-1 h-8 w-8 rounded-full"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploadingAvatar}
                    >
                      {uploadingAvatar ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Camera className="h-4 w-4" />
                      )}
                    </Button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleAvatarUpload}
                    />
                  </div>
                  <div>
                    <p className="font-medium">{formData.first_name} {formData.last_name}</p>
                    <p className="text-sm text-muted-foreground">{formData.email}</p>
                    {getRoleBadge()}
                  </div>
                </div>

                <Separator />

                {/* Personal Information */}
                <div className="space-y-4">
                  <h4 className="font-medium flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground" />
                    Personal Information
                  </h4>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="first_name">First Name</Label>
                      <Input
                        id="first_name"
                        value={formData.first_name}
                        onChange={(e) => handleChange("first_name", e.target.value)}
                        placeholder="Enter first name"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="last_name">Last Name</Label>
                      <Input
                        id="last_name"
                        value={formData.last_name}
                        onChange={(e) => handleChange("last_name", e.target.value)}
                        placeholder="Enter last name"
                      />
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Contact Information */}
                <div className="space-y-4">
                  <h4 className="font-medium flex items-center gap-2">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    Contact Information
                  </h4>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="email">Email (Read-only)</Label>
                      <Input
                        id="email"
                        value={formData.email}
                        disabled
                        className="bg-muted"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="phone_number">Phone Number</Label>
                      <Input
                        id="phone_number"
                        value={formData.phone_number}
                        onChange={(e) => handleChange("phone_number", e.target.value)}
                        placeholder="+234 XXX XXX XXXX"
                      />
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="alternate_email">Alternate Email</Label>
                        <Input
                          id="alternate_email"
                          type="email"
                          value={formData.alternate_email}
                          onChange={(e) => handleChange("alternate_email", e.target.value)}
                          placeholder="alternate@email.com"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="alternate_phone">Alternate Phone</Label>
                        <Input
                          id="alternate_phone"
                          value={formData.alternate_phone}
                          onChange={(e) => handleChange("alternate_phone", e.target.value)}
                          placeholder="+234 XXX XXX XXXX"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Designation */}
                <div className="space-y-4">
                  <h4 className="font-medium flex items-center gap-2">
                    <Briefcase className="h-4 w-4 text-muted-foreground" />
                    Designation
                  </h4>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="designation">Role / Designation</Label>
                      <Select
                        value={formData.designation}
                        onValueChange={(value) => handleChange("designation", value)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select your designation" />
                        </SelectTrigger>
                        <SelectContent>
                          {DESIGNATIONS.map((d) => (
                            <SelectItem key={d.value} value={d.value}>
                              {d.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {formData.designation === "other" && (
                      <div className="space-y-2">
                        <Label htmlFor="other_designation">Specify Designation</Label>
                        <Input
                          id="other_designation"
                          value={formData.other_designation}
                          onChange={(e) => handleChange("other_designation", e.target.value)}
                          placeholder="Enter your designation"
                        />
                      </div>
                    )}
                  </div>
                </div>

                <Separator />

                {/* Location */}
                <div className="space-y-4">
                  <h4 className="font-medium flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    Location
                  </h4>
                  <div className="grid gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="state">State</Label>
                      <Select
                        value={formData.state}
                        onValueChange={(value) => handleChange("state", value)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select your state" />
                        </SelectTrigger>
                        <SelectContent>
                          {NIGERIAN_STATES.map((state) => (
                            <SelectItem key={state} value={state}>
                              {state}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="lga">LGA</Label>
                        <Input
                          id="lga"
                          value={formData.lga}
                          onChange={(e) => handleChange("lga", e.target.value)}
                          placeholder="Enter LGA"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="ward">Ward</Label>
                        <Input
                          id="ward"
                          value={formData.ward}
                          onChange={(e) => handleChange("ward", e.target.value)}
                          placeholder="Enter ward"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </ScrollArea>

            <div className="flex justify-end gap-3 pt-4">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button variant="acg" onClick={handleSave} disabled={saving}>
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                Save Changes
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="notifications" className="mt-4">
            <div className="space-y-6">
              <div className="flex items-center gap-3">
                <Bell className="h-5 w-5 text-primary" />
                <div>
                  <h4 className="font-medium">Email Notifications</h4>
                  <p className="text-sm text-muted-foreground">
                    Choose which emails you want to receive
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between rounded-lg border border-border p-3">
                  <div>
                    <Label htmlFor="email-task-assigned">Task Assignments</Label>
                    <p className="text-xs text-muted-foreground">
                      Get notified when a task is assigned to you
                    </p>
                  </div>
                  <Switch
                    id="email-task-assigned"
                    checked={notificationPrefs.email_task_assigned}
                    onCheckedChange={(val) =>
                      setNotificationPrefs((prev) => ({ ...prev, email_task_assigned: val }))
                    }
                  />
                </div>

                <div className="flex items-center justify-between rounded-lg border border-border p-3">
                  <div>
                    <Label htmlFor="email-task-due">Task Reminders</Label>
                    <p className="text-xs text-muted-foreground">
                      Receive reminders for upcoming and overdue tasks
                    </p>
                  </div>
                  <Switch
                    id="email-task-due"
                    checked={notificationPrefs.email_task_due}
                    onCheckedChange={(val) =>
                      setNotificationPrefs((prev) => ({ ...prev, email_task_due: val }))
                    }
                  />
                </div>

                <div className="flex items-center justify-between rounded-lg border border-border p-3">
                  <div>
                    <Label htmlFor="email-form-submitted">Form Submissions</Label>
                    <p className="text-xs text-muted-foreground">
                      Get notified when forms are submitted
                    </p>
                  </div>
                  <Switch
                    id="email-form-submitted"
                    checked={notificationPrefs.email_form_submitted}
                    onCheckedChange={(val) =>
                      setNotificationPrefs((prev) => ({ ...prev, email_form_submitted: val }))
                    }
                  />
                </div>

                <div className="flex items-center justify-between rounded-lg border border-border p-3">
                  <div>
                    <Label htmlFor="email-system-alerts">System Alerts</Label>
                    <p className="text-xs text-muted-foreground">
                      Important system announcements and updates
                    </p>
                  </div>
                  <Switch
                    id="email-system-alerts"
                    checked={notificationPrefs.email_system_alerts}
                    onCheckedChange={(val) =>
                      setNotificationPrefs((prev) => ({ ...prev, email_system_alerts: val }))
                    }
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <Button variant="outline" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                <Button variant="acg" onClick={handleSave} disabled={saving}>
                  {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Save className="h-4 w-4 mr-2" />
                  )}
                  Save Preferences
                </Button>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="security" className="mt-4">
            <div className="space-y-6">
              <div className="flex items-center gap-3">
                <Shield className="h-5 w-5 text-primary" />
                <div>
                  <h4 className="font-medium">Change Password</h4>
                  <p className="text-sm text-muted-foreground">
                    Update your account password
                  </p>
                </div>
              </div>

              <Alert>
                <Lock className="h-4 w-4" />
                <AlertDescription>
                  Choose a strong password with at least 6 characters, including uppercase, 
                  lowercase, numbers, and special characters.
                </AlertDescription>
              </Alert>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="new-password">New Password</Label>
                  <div className="relative">
                    <Input
                      id="new-password"
                      type={showNewPassword ? "text" : "password"}
                      value={passwordData.newPassword}
                      onChange={(e) =>
                        setPasswordData({ ...passwordData, newPassword: e.target.value })
                      }
                      placeholder="Enter new password"
                      className="pr-10"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-0 top-0 h-full px-3"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                    >
                      {showNewPassword ? (
                        <EyeOff className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <Eye className="h-4 w-4 text-muted-foreground" />
                      )}
                    </Button>
                  </div>
                  {passwordData.newPassword && (
                    <div className="flex items-center gap-2">
                      <div className="flex gap-1 flex-1">
                        {[1, 2, 3, 4, 5].map((level) => (
                          <div
                            key={level}
                            className={`h-1 flex-1 rounded ${
                              level <= passwordStrength.strength
                                ? passwordStrength.strength <= 2
                                  ? "bg-red-500"
                                  : passwordStrength.strength <= 3
                                  ? "bg-yellow-500"
                                  : "bg-green-500"
                                : "bg-muted"
                            }`}
                          />
                        ))}
                      </div>
                      <span
                        className={`text-xs ${
                          passwordStrength.strength <= 2
                            ? "text-red-500"
                            : passwordStrength.strength <= 3
                            ? "text-yellow-500"
                            : "text-green-500"
                        }`}
                      >
                        {passwordStrength.label}
                      </span>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirm-password">Confirm New Password</Label>
                  <div className="relative">
                    <Input
                      id="confirm-password"
                      type={showConfirmPassword ? "text" : "password"}
                      value={passwordData.confirmPassword}
                      onChange={(e) =>
                        setPasswordData({ ...passwordData, confirmPassword: e.target.value })
                      }
                      placeholder="Confirm new password"
                      className={`pr-10 ${
                        passwordData.confirmPassword &&
                        passwordData.newPassword !== passwordData.confirmPassword
                          ? "border-destructive"
                          : ""
                      }`}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-0 top-0 h-full px-3"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    >
                      {showConfirmPassword ? (
                        <EyeOff className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <Eye className="h-4 w-4 text-muted-foreground" />
                      )}
                    </Button>
                  </div>
                  {passwordData.confirmPassword &&
                    passwordData.newPassword !== passwordData.confirmPassword && (
                      <p className="text-xs text-destructive">Passwords do not match</p>
                    )}
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <Button variant="outline" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                <Button
                  variant="acg"
                  onClick={handlePasswordChange}
                  disabled={
                    changingPassword ||
                    !passwordData.newPassword ||
                    passwordData.newPassword !== passwordData.confirmPassword
                  }
                >
                  {changingPassword ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Lock className="h-4 w-4 mr-2" />
                  )}
                  Change Password
                </Button>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};

export default UserProfileDialog;

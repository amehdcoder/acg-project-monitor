import { useState, useEffect } from "react";
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
import { User, Mail, Phone, MapPin, Briefcase, Save, Loader2 } from "lucide-react";
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
  { value: "other", label: "Other" },
];

const NIGERIAN_STATES = [
  "Abia", "Adamawa", "Akwa Ibom", "Anambra", "Bauchi", "Bayelsa", "Benue",
  "Borno", "Cross River", "Delta", "Ebonyi", "Edo", "Ekiti", "Enugu", "FCT",
  "Gombe", "Imo", "Jigawa", "Kaduna", "Kano", "Katsina", "Kebbi", "Kogi",
  "Kwara", "Lagos", "Nasarawa", "Niger", "Ogun", "Ondo", "Osun", "Oyo",
  "Plateau", "Rivers", "Sokoto", "Taraba", "Yobe", "Zamfara"
];

const UserProfileDialog = ({ open, onOpenChange }: UserProfileDialogProps) => {
  const { profile, user, role } = useAuth();
  const [saving, setSaving] = useState(false);
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
    }
  }, [profile]);

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
        })
        .eq("user_id", user.id);

      if (error) throw error;

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

  const getRoleBadge = () => {
    if (role === "super_admin") {
      return <Badge className="bg-red-500 text-white">Super Admin</Badge>;
    }
    if (role === "systems_admin") {
      return <Badge className="bg-blue-500 text-white">Systems Admin</Badge>;
    }
    return <Badge variant="secondary">User</Badge>;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display">
            <User className="h-5 w-5 text-primary" />
            My Profile
          </DialogTitle>
          <DialogDescription>
            View and update your personal information
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh]">
          <div className="space-y-6 pr-4">
            {/* Role Badge */}
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground">Role:</span>
              {getRoleBadge()}
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
      </DialogContent>
    </Dialog>
  );
};

export default UserProfileDialog;

import { useState, useRef } from "react";
import { Settings, Trash2, Users, Link2, Camera, Loader2 } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import type { ChatGroup, ChatGroupMember } from "@/hooks/useProjectChat";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface GroupSettingsDialogProps {
  group: ChatGroup;
  members: ChatGroupMember[];
  isOpen: boolean;
  onClose: () => void;
  onGroupUpdated: () => void;
  onGroupDeleted: () => void;
}

export function GroupSettingsDialog({
  group,
  members,
  isOpen,
  onClose,
  onGroupUpdated,
  onGroupDeleted,
}: GroupSettingsDialogProps) {
  const [name, setName] = useState(group.name);
  const [description, setDescription] = useState(group.description || "");
  const [saving, setSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const { user, isOwner } = useAuth();
  const isProtected = !!group.is_protected;
  const canDelete = !isProtected || isOwner;

  const [iconUrl, setIconUrl] = useState<string | null>(group.icon_url ?? null);
  const [uploadingIcon, setUploadingIcon] = useState(false);
  const iconInputRef = useRef<HTMLInputElement>(null);

  const handleIconUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user?.id) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Please choose an image file", variant: "destructive" });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "Image must be less than 5MB", variant: "destructive" });
      return;
    }
    setUploadingIcon(true);
    try {
      const ext = file.name.split(".").pop() || "png";
      const path = `${user.id}/group-${group.id}-${Date.now()}.${ext}`;
      const { error: uploadErr } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true });
      if (uploadErr) throw uploadErr;
      const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
      const url = pub.publicUrl;
      const { error: updateErr } = await supabase
        .from("chat_groups")
        .update({ icon_url: url, updated_at: new Date().toISOString() })
        .eq("id", group.id);
      if (updateErr) throw updateErr;
      setIconUrl(url);
      toast({ title: "Group icon updated" });
      onGroupUpdated();
    } catch (error: any) {
      console.error("Error uploading group icon:", error);
      toast({
        title: "Failed to upload icon",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setUploadingIcon(false);
      if (iconInputRef.current) iconInputRef.current.value = "";
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast({
        title: "Group name is required",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from("chat_groups")
        .update({
          name: name.trim(),
          description: description.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", group.id);

      if (error) throw error;

      toast({ title: "Group settings updated" });
      onGroupUpdated();
      onClose();
    } catch (error: any) {
      console.error("Error updating group:", error);
      toast({
        title: "Failed to update group",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      // Delete all messages first
      await supabase
        .from("chat_messages")
        .delete()
        .eq("chat_group_id", group.id);

      // Delete all members
      await supabase
        .from("chat_group_members")
        .delete()
        .eq("chat_group_id", group.id);

      // Delete the group
      const { error } = await supabase
        .from("chat_groups")
        .delete()
        .eq("id", group.id);

      if (error) throw error;

      toast({ title: "Chat group deleted" });
      onGroupDeleted();
      onClose();
    } catch (error: any) {
      console.error("Error deleting group:", error);
      toast({
        title: "Failed to delete group",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Group Settings
            </DialogTitle>
            <DialogDescription>
              Manage settings for {group.name}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Group Icon */}
            <div className="flex flex-col items-center gap-2">
              <div className="relative">
                <Avatar className="h-20 w-20">
                  {iconUrl && <AvatarImage src={iconUrl} alt={group.name} />}
                  <AvatarFallback className="bg-primary/10 text-primary text-xl font-semibold">
                    {group.name?.[0]?.toUpperCase() || "G"}
                  </AvatarFallback>
                </Avatar>
                <button
                  type="button"
                  onClick={() => iconInputRef.current?.click()}
                  disabled={uploadingIcon}
                  className="absolute -bottom-1 -right-1 h-8 w-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-md hover:bg-primary/90 disabled:opacity-60"
                  aria-label="Change group icon"
                >
                  {uploadingIcon ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Camera className="h-4 w-4" />
                  )}
                </button>
              </div>
              <input
                ref={iconInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleIconUpload}
              />
              <p className="text-xs text-muted-foreground">Tap the camera to change the group icon</p>
            </div>

            {/* Group Info */}
            <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Users className="h-4 w-4" />
                <span>{members.length} members</span>
              </div>
              {group.form_id && (
                <Badge variant="secondary" className="gap-1">
                  <Link2 className="h-3 w-3" />
                  Linked Form
                </Badge>
              )}
            </div>

            <Separator />

            {/* Name */}
            <div className="space-y-2">
              <Label htmlFor="group-name">Group Name</Label>
              <Input
                id="group-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter group name"
              />
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="group-description">Description</Label>
              <Textarea
                id="group-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Enter group description"
                rows={3}
              />
            </div>

            <Separator />

            {/* Danger Zone */}
            <div className="space-y-2">
              <Label className="text-destructive">Danger Zone</Label>
              <p className="text-sm text-muted-foreground">
                Deleting this group will permanently remove all messages and member data.
              </p>
              <Button
                variant="destructive"
                className="w-full"
                onClick={() => setShowDeleteConfirm(true)}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete Group
              </Button>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Chat Group?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the group "{group.name}" along with all
              messages and member data. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Deleting..." : "Delete Group"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

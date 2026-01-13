import { useState, useEffect } from "react";
import { X, UserPlus, UserMinus, Search, Crown, Shield, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
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
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import type { ChatGroupMember, ChatGroup } from "@/hooks/useProjectChat";

interface MembersPanelProps {
  group: ChatGroup;
  members: ChatGroupMember[];
  isAdmin: boolean;
  onClose: () => void;
  onAddMember: (userId: string) => Promise<void>;
  onRemoveMember: (memberId: string) => Promise<void>;
  onAddFormUsers: (formId: string) => Promise<void>;
}

interface AvailableUser {
  user_id: string;
  first_name: string;
  last_name: string;
  email: string;
  avatar_url: string | null;
}

export function MembersPanel({
  group,
  members,
  isAdmin,
  onClose,
  onAddMember,
  onRemoveMember,
  onAddFormUsers,
}: MembersPanelProps) {
  const [showAddMembers, setShowAddMembers] = useState(false);
  const [availableUsers, setAvailableUsers] = useState<AvailableUser[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<ChatGroupMember | null>(null);

  // Fetch available users not in group
  useEffect(() => {
    if (!showAddMembers) return;

    const fetchAvailableUsers = async () => {
      setLoading(true);
      try {
        const memberIds = members.map((m) => m.user_id);
        const { data, error } = await supabase
          .from("profiles")
          .select("user_id, first_name, last_name, email, avatar_url")
          .eq("is_active", true)
          .not("user_id", "in", `(${memberIds.join(",") || "00000000-0000-0000-0000-000000000000"})`);

        if (error) throw error;
        setAvailableUsers(data || []);
      } catch (error) {
        console.error("Error fetching users:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchAvailableUsers();
  }, [showAddMembers, members]);

  const filteredMembers = members.filter((m) => {
    if (!searchQuery) return true;
    const name = `${m.user?.first_name || ""} ${m.user?.last_name || ""}`.toLowerCase();
    return name.includes(searchQuery.toLowerCase());
  });

  const filteredAvailable = availableUsers.filter((u) => {
    if (!searchQuery) return true;
    const name = `${u.first_name} ${u.last_name}`.toLowerCase();
    return name.includes(searchQuery.toLowerCase()) || u.email.toLowerCase().includes(searchQuery.toLowerCase());
  });

  const handleAddMember = async (userId: string) => {
    await onAddMember(userId);
    setAvailableUsers((prev) => prev.filter((u) => u.user_id !== userId));
  };

  const handleRemoveMember = async () => {
    if (!confirmRemove) return;
    setRemovingId(confirmRemove.id);
    await onRemoveMember(confirmRemove.id);
    setRemovingId(null);
    setConfirmRemove(null);
  };

  return (
    <div className="flex flex-col h-full bg-background border-l border-border">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div>
          <h3 className="font-semibold text-foreground">
            {showAddMembers ? "Add Members" : "Group Members"}
          </h3>
          <p className="text-xs text-muted-foreground">
            {showAddMembers
              ? `${filteredAvailable.length} users available`
              : `${members.length} member${members.length !== 1 ? "s" : ""}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && !showAddMembers && (
            <Button variant="ghost" size="icon" onClick={() => setShowAddMembers(true)}>
              <UserPlus className="h-5 w-5" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => (showAddMembers ? setShowAddMembers(false) : onClose())}
          >
            <X className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="p-3 border-b border-border">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={showAddMembers ? "Search users..." : "Search members..."}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-9 bg-muted/50 border-0"
          />
        </div>
      </div>

      {/* Add Form Users Button */}
      {isAdmin && showAddMembers && group.form_id && (
        <div className="p-3 border-b border-border">
          <Button
            variant="outline"
            className="w-full"
            onClick={() => onAddFormUsers(group.form_id!)}
          >
            <UserPlus className="h-4 w-4 mr-2" />
            Add All Form Users
          </Button>
        </div>
      )}

      {/* Members/Users List */}
      <ScrollArea className="flex-1">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : showAddMembers ? (
          <div className="p-2">
            {filteredAvailable.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-8">
                No users available to add
              </p>
            ) : (
              filteredAvailable.map((user) => (
                <div
                  key={user.user_id}
                  className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50"
                >
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={user.avatar_url || undefined} />
                    <AvatarFallback className="bg-primary/10 text-primary text-sm">
                      {user.first_name?.[0]}
                      {user.last_name?.[0]}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">
                      {user.first_name} {user.last_name}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleAddMember(user.user_id)}
                  >
                    <UserPlus className="h-4 w-4" />
                  </Button>
                </div>
              ))
            )}
          </div>
        ) : (
          <div className="p-2">
            {filteredMembers.map((member) => (
              <div
                key={member.id}
                className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 group"
              >
                <Avatar className="h-10 w-10">
                  <AvatarImage src={member.user?.avatar_url || undefined} />
                  <AvatarFallback className="bg-primary/10 text-primary text-sm">
                    {member.user?.first_name?.[0]}
                    {member.user?.last_name?.[0]}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-sm truncate">
                      {member.user?.first_name} {member.user?.last_name}
                    </p>
                    {member.role === "admin" && (
                      <Crown className="h-3 w-3 text-acg-gold" />
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    {member.user?.email}
                  </p>
                </div>
                {isAdmin && member.role !== "admin" && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive"
                    onClick={() => setConfirmRemove(member)}
                    disabled={removingId === member.id}
                  >
                    {removingId === member.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <UserMinus className="h-4 w-4" />
                    )}
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </ScrollArea>

      {/* Remove Confirmation */}
      <AlertDialog open={!!confirmRemove} onOpenChange={() => setConfirmRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Member</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove{" "}
              <span className="font-medium">
                {confirmRemove?.user?.first_name} {confirmRemove?.user?.last_name}
              </span>{" "}
              from this group? They will no longer be able to see messages in this group.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRemoveMember}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

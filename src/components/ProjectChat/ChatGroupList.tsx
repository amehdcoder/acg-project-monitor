import { useState } from "react";
import { format } from "date-fns";
import {
  Plus,
  Search,
  Users,
  MessageSquare,
  Link2,
  MoreVertical,
  Archive,
  Trash2,
  ArchiveRestore,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { ChatGroup } from "@/hooks/useProjectChat";

import type { DirectChat } from "@/hooks/useDirectChats";

interface ChatGroupListProps {
  groups: ChatGroup[];
  selectedGroup: ChatGroup | null;
  onSelectGroup: (group: ChatGroup) => void;
  onCreateGroup: (name: string, description?: string, formId?: string) => Promise<any>;
  isAdmin: boolean;
  forms?: Array<{ id: string; name: string }>;
  directChats?: DirectChat[];
  selectedDirectId?: string | null;
  onSelectDirect?: (chat: DirectChat) => void;
  onArchiveDirect?: (chat: DirectChat) => void;
  onDeleteDirect?: (chat: DirectChat) => void;
}

export function ChatGroupList({
  groups,
  selectedGroup,
  onSelectGroup,
  onCreateGroup,
  isAdmin,
  forms = [],
  directChats = [],
  selectedDirectId = null,
  onSelectDirect,
  onArchiveDirect,
  onDeleteDirect,
}: ChatGroupListProps) {
  const [showArchived, setShowArchived] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [newGroup, setNewGroup] = useState({ name: "", description: "", formId: "" });
  const [creating, setCreating] = useState(false);

  const filteredGroups = groups.filter((g) =>
    g.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleCreate = async () => {
    if (!newGroup.name.trim()) return;
    setCreating(true);
    const result = await onCreateGroup(
      newGroup.name,
      newGroup.description || undefined,
      newGroup.formId || undefined
    );
    setCreating(false);
    if (result) {
      setShowCreate(false);
      setNewGroup({ name: "", description: "", formId: "" });
    }
  };

  return (
    <div className="flex flex-col h-full border-r border-border bg-background">
      {/* Header */}
      <div className="p-3 sm:p-4 border-b border-border">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display font-semibold text-lg text-foreground">Chats</h2>
          {isAdmin && (
            <Dialog open={showCreate} onOpenChange={setShowCreate}>
              <DialogTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <Plus className="h-5 w-5" />
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create Chat Group</DialogTitle>
                  <DialogDescription>
                    Create a new chat group for team communication
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="group-name">Group Name *</Label>
                    <Input
                      id="group-name"
                      placeholder="Enter group name"
                      value={newGroup.name}
                      onChange={(e) =>
                        setNewGroup({ ...newGroup, name: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="group-desc">Description</Label>
                    <Textarea
                      id="group-desc"
                      placeholder="Enter group description"
                      value={newGroup.description}
                      onChange={(e) =>
                        setNewGroup({ ...newGroup, description: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="linked-form">Link to Form (Optional)</Label>
                    <Select
                      value={newGroup.formId || "__none__"}
                      onValueChange={(val) =>
                        setNewGroup({ ...newGroup, formId: val === "__none__" ? "" : val })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select a form" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">No linked form</SelectItem>
                        {forms.map((form) => (
                          <SelectItem key={form.id} value={form.id}>
                            {form.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Linking a form lets you quickly add all form-assigned users
                    </p>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowCreate(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleCreate} disabled={creating || !newGroup.name.trim()}>
                    Create Group
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search chats..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-9 bg-muted/50 border-0"
          />
        </div>
      </div>

      {/* Groups List */}
      <div className="flex-1 overflow-y-auto">
        {filteredGroups.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-center p-4">
            <MessageSquare className="h-10 w-10 text-muted-foreground/50 mb-2" />
            <p className="text-sm text-muted-foreground">No chat groups found</p>
          </div>
        ) : (
          filteredGroups.map((group) => (
            <div
              key={group.id}
              onClick={() => onSelectGroup(group)}
              className={cn(
                "flex items-center gap-3 px-3 sm:px-4 py-3 cursor-pointer transition-colors",
                "hover:bg-muted/50 border-b border-border/50",
                selectedGroup?.id === group.id && "bg-muted"
              )}
            >
              <div className="relative">
                <Avatar className="h-12 w-12 flex-shrink-0">
                  <AvatarFallback className="bg-primary/10 text-primary">
                    <Users className="h-5 w-5" />
                  </AvatarFallback>
                </Avatar>
                {(group.unread_count || 0) > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1.5 flex items-center justify-center rounded-full bg-destructive text-destructive-foreground text-xs font-medium">
                    {group.unread_count > 99 ? "99+" : group.unread_count}
                  </span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-foreground truncate text-sm">
                    {group.name}
                  </span>
                  {group.form_id && (
                    <Link2 className="h-3 w-3 text-muted-foreground" />
                  )}
                </div>
                <p className="text-xs text-muted-foreground truncate mt-0.5">
                  {group.description || "No description"}
                </p>
              </div>
              <span className="text-[10px] text-muted-foreground flex-shrink-0">
                {format(new Date(group.created_at), "MMM d")}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

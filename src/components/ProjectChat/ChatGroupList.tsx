import { useState } from "react";
import { format } from "date-fns";
import {
  Plus,
  Search,
  Users,
  MessageSquare,
  MessageSquarePlus,
  Link2,
  MoreVertical,
  Archive,
  Trash2,
  ArchiveRestore,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
  projectMembers?: Array<{ user_id: string; full_name: string; avatar_url: string | null }>;
  onStartDirect?: (member: { user_id: string; full_name: string; avatar_url: string | null }) => void;
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
  projectMembers = [],
  onStartDirect,
}: ChatGroupListProps) {
  const [showArchived, setShowArchived] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [newGroup, setNewGroup] = useState({ name: "", description: "", formId: "" });
  const [creating, setCreating] = useState(false);
  const [showNewChat, setShowNewChat] = useState(false);
  const [memberQuery, setMemberQuery] = useState("");

  const filteredMembers = projectMembers.filter((m) =>
    (m.full_name || "").toLowerCase().includes(memberQuery.toLowerCase())
  );

  const filteredGroups = groups.filter((g) =>
    g.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const q = searchQuery.toLowerCase();
  const matchedDirect = directChats.filter((c) =>
    (c.other_name || "").toLowerCase().includes(q)
  );
  const visibleDirect = matchedDirect.filter((c) => (showArchived ? c.archived : !c.archived));
  const archivedCount = matchedDirect.filter((c) => c.archived).length;

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
          <div className="flex items-center gap-1">
            {/* New direct chat picker */}
            <Dialog
              open={showNewChat}
              onOpenChange={(o) => {
                setShowNewChat(o);
                if (!o) setMemberQuery("");
              }}
            >
              <DialogTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8" title="New chat">
                  <MessageSquarePlus className="h-5 w-5" />
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>New Chat</DialogTitle>
                  <DialogDescription>
                    Start a direct conversation with anyone on this project.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-3 py-2">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      autoFocus
                      placeholder="Search people..."
                      value={memberQuery}
                      onChange={(e) => setMemberQuery(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                  <div className="max-h-72 overflow-y-auto -mx-2">
                    {filteredMembers.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-6">
                        No people found.
                      </p>
                    ) : (
                      filteredMembers.map((m) => (
                        <button
                          key={m.user_id}
                          type="button"
                          onClick={() => {
                            onStartDirect?.(m);
                            setShowNewChat(false);
                            setMemberQuery("");
                          }}
                          className="w-full flex items-center gap-3 px-2 py-2.5 rounded-lg hover:bg-muted/60 transition-colors text-left"
                        >
                          <Avatar className="h-10 w-10 flex-shrink-0">
                            {m.avatar_url && <AvatarImage src={m.avatar_url} alt={m.full_name} />}
                            <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                              {(m.full_name || "U").charAt(0).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <span className="font-medium text-sm text-foreground truncate">
                            {m.full_name}
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              </DialogContent>
            </Dialog>

            {isAdmin && (
            <Dialog open={showCreate} onOpenChange={setShowCreate}>
              <DialogTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8" title="New group">
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

      {/* Chats List */}
      <div className="flex-1 overflow-y-auto">
        {filteredGroups.length === 0 && visibleDirect.length === 0 && archivedCount === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-center p-4">
            <MessageSquare className="h-10 w-10 text-muted-foreground/50 mb-2" />
            <p className="text-sm text-muted-foreground">No chats found</p>
          </div>
        ) : (
          <>
            {/* Groups */}
            {filteredGroups.length > 0 && (
              <div className="px-3 sm:px-4 pt-3 pb-1">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Groups
                </span>
              </div>
            )}
            {filteredGroups.map((group) => (
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
                    {group.icon_url && <AvatarImage src={group.icon_url} alt={group.name} />}
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
                    {group.form_id && <Link2 className="h-3 w-3 text-muted-foreground" />}
                  </div>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">
                    {group.description || "No description"}
                  </p>
                </div>
                <span className="text-[10px] text-muted-foreground flex-shrink-0">
                  {format(new Date(group.created_at), "MMM d")}
                </span>
              </div>
            ))}

            {/* Direct messages */}
            {(matchedDirect.length > 0 || archivedCount > 0) && (
              <div className="px-3 sm:px-4 pt-4 pb-1 flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {showArchived ? "Archived chats" : "Direct messages"}
                </span>
                {archivedCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowArchived((v) => !v)}
                    className="text-[11px] font-medium text-primary hover:underline"
                  >
                    {showArchived ? "Back to chats" : `Archived (${archivedCount})`}
                  </button>
                )}
              </div>
            )}
            {visibleDirect.length === 0 && (matchedDirect.length > 0 || archivedCount > 0) && (
              <p className="px-4 py-3 text-xs text-muted-foreground">
                {showArchived ? "No archived chats." : "No direct chats yet."}
              </p>
            )}
            {visibleDirect.map((chat) => (
              <div
                key={chat.conversation_id}
                onClick={() => onSelectDirect?.(chat)}
                className={cn(
                  "group flex items-center gap-3 px-3 sm:px-4 py-3 cursor-pointer transition-colors",
                  "hover:bg-muted/50 border-b border-border/50",
                  selectedDirectId === chat.conversation_id && "bg-muted"
                )}
              >
                <div className="relative">
                  <Avatar className="h-12 w-12 flex-shrink-0">
                    <AvatarFallback className="bg-accent/15 text-accent-foreground font-semibold">
                      {(chat.other_name || "U").charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  {chat.unread_count > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1.5 flex items-center justify-center rounded-full bg-destructive text-destructive-foreground text-xs font-medium">
                      {chat.unread_count > 99 ? "99+" : chat.unread_count}
                    </span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-foreground truncate text-sm">
                      {chat.other_name}
                    </span>
                    {chat.last_message_at && (
                      <span className="text-[10px] text-muted-foreground flex-shrink-0">
                        {format(new Date(chat.last_message_at), "MMM d")}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">
                    {chat.last_message || "Tap to continue chatting"}
                  </p>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 flex-shrink-0 opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100"
                    >
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                    <DropdownMenuItem onClick={() => onArchiveDirect?.(chat)}>
                      {chat.archived ? (
                        <>
                          <ArchiveRestore className="h-4 w-4 mr-2" /> Unarchive
                        </>
                      ) : (
                        <>
                          <Archive className="h-4 w-4 mr-2" /> Archive
                        </>
                      )}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => onDeleteDirect?.(chat)}
                      className="text-destructive focus:text-destructive"
                    >
                      <Trash2 className="h-4 w-4 mr-2" /> Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}


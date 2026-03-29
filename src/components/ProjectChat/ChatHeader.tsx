import {
  ArrowLeft,
  MoreVertical,
  Users,
  Search,
  Phone,
  Video,
  Settings,
  UserPlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ChatGroup, ChatGroupMember } from "@/hooks/useProjectChat";

interface ChatHeaderProps {
  group: ChatGroup;
  members: ChatGroupMember[];
  onBack: () => void;
  onShowMembers: () => void;
  onManageMembers: () => void;
  onSearch: () => void;
  onVoiceCall: () => void;
  onVideoCall: () => void;
  onSettings: () => void;
  isAdmin: boolean;
}

export function ChatHeader({
  group,
  members,
  onBack,
  onShowMembers,
  onManageMembers,
  onSearch,
  onVoiceCall,
  onVideoCall,
  onSettings,
  isAdmin,
}: ChatHeaderProps) {
  const memberCount = members.length;

  return (
    <div className="flex items-center gap-2 sm:gap-3 border-b border-border bg-card px-2 sm:px-4 py-2 sm:py-3 shadow-sm">
      <Button
        variant="ghost"
        size="icon"
        onClick={onBack}
        className="lg:hidden h-9 w-9"
      >
        <ArrowLeft className="h-5 w-5" />
      </Button>

      <div
        className="flex items-center gap-2 sm:gap-3 flex-1 cursor-pointer min-w-0"
        onClick={onShowMembers}
      >
        <Avatar className="h-10 w-10 sm:h-11 sm:w-11 shrink-0">
          <AvatarFallback className="bg-primary/10 text-primary text-sm font-medium">
            <Users className="h-5 w-5" />
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-foreground truncate text-sm sm:text-base">
            {group.name}
          </h3>
          <p className="text-xs text-muted-foreground truncate">
            {memberCount} member{memberCount !== 1 ? "s" : ""}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
        <Button 
          variant="ghost" 
          size="icon" 
          className="hidden sm:flex h-9 w-9 hover:bg-primary/10"
          onClick={onVideoCall}
          title="Video Call"
        >
          <Video className="h-5 w-5 text-muted-foreground hover:text-primary transition-colors" />
        </Button>
        <Button 
          variant="ghost" 
          size="icon" 
          className="hidden sm:flex h-9 w-9 hover:bg-primary/10"
          onClick={onVoiceCall}
          title="Voice Call"
        >
          <Phone className="h-5 w-5 text-muted-foreground hover:text-primary transition-colors" />
        </Button>
        <Button 
          variant="ghost" 
          size="icon" 
          className="h-9 w-9 hover:bg-primary/10"
          onClick={onSearch}
          title="Search Messages"
        >
          <Search className="h-5 w-5 text-muted-foreground hover:text-primary transition-colors" />
        </Button>
        
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-9 w-9">
              <MoreVertical className="h-5 w-5 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onClick={onShowMembers}>
              <Users className="mr-2 h-4 w-4" />
              View Members
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onVoiceCall} className="sm:hidden">
              <Phone className="mr-2 h-4 w-4" />
              Voice Call
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onVideoCall} className="sm:hidden">
              <Video className="mr-2 h-4 w-4" />
              Video Call
            </DropdownMenuItem>
            {isAdmin && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onManageMembers}>
                  <UserPlus className="mr-2 h-4 w-4" />
                  Manage Members
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onSettings}>
                  <Settings className="mr-2 h-4 w-4" />
                  Group Settings
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

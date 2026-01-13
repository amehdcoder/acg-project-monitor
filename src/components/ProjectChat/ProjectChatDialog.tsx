import { useState, useRef, useEffect } from "react";
import { MessageSquare, X, Maximize2, Minimize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useProjectChat } from "@/hooks/useProjectChat";
import { useAuth } from "@/hooks/useAuth";
import { ChatGroupList } from "./ChatGroupList";
import { ChatHeader } from "./ChatHeader";
import { ChatMessage } from "./ChatMessage";
import { ChatInput } from "./ChatInput";
import { MembersPanel } from "./MembersPanel";

interface ProjectChatDialogProps {
  projectId: string;
  projectName: string;
  forms?: Array<{ id: string; name: string }>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ProjectChatDialog({
  projectId,
  projectName,
  forms = [],
  open,
  onOpenChange,
}: ProjectChatDialogProps) {
  const { user } = useAuth();
  const {
    chatGroups,
    selectedGroup,
    setSelectedGroup,
    messages,
    members,
    loading,
    sending,
    sendMessage,
    createChatGroup,
    addMember,
    removeMember,
    addFormUsersToGroup,
    isAdmin,
  } = useProjectChat(open ? projectId : null);

  const [showMembers, setShowMembers] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Group messages by date
  const groupedMessages = messages.reduce((acc, msg) => {
    const date = new Date(msg.created_at).toLocaleDateString();
    if (!acc[date]) acc[date] = [];
    acc[date].push(msg);
    return acc;
  }, {} as Record<string, typeof messages>);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "p-0 gap-0 overflow-hidden",
          isFullscreen
            ? "max-w-full w-full h-full max-h-full rounded-none"
            : "max-w-4xl w-[95vw] h-[85vh] max-h-[700px] sm:rounded-xl"
        )}
      >
        <div className="flex h-full">
          {/* Sidebar - Chat Groups */}
          <div
            className={cn(
              "w-80 flex-shrink-0 hidden md:flex flex-col",
              selectedGroup && "hidden lg:flex"
            )}
          >
            <div className="p-3 border-b border-border flex items-center justify-between">
              <DialogTitle className="font-display text-sm">
                {projectName}
              </DialogTitle>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setIsFullscreen(!isFullscreen)}
                >
                  {isFullscreen ? (
                    <Minimize2 className="h-4 w-4" />
                  ) : (
                    <Maximize2 className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
            <ChatGroupList
              groups={chatGroups}
              selectedGroup={selectedGroup}
              onSelectGroup={setSelectedGroup}
              onCreateGroup={createChatGroup}
              isAdmin={isAdmin}
              forms={forms}
            />
          </div>

          {/* Main Chat Area */}
          <div className="flex-1 flex flex-col min-w-0">
            {selectedGroup ? (
              <>
                <ChatHeader
                  group={selectedGroup}
                  members={members}
                  onBack={() => setSelectedGroup(null)}
                  onShowMembers={() => setShowMembers(true)}
                  onManageMembers={() => setShowMembers(true)}
                  isAdmin={isAdmin}
                />

                {/* Messages */}
                <ScrollArea className="flex-1 bg-muted/20">
                  <div className="py-4">
                    {Object.entries(groupedMessages).map(([date, msgs]) => (
                      <div key={date}>
                        <div className="flex justify-center my-4">
                          <span className="bg-muted px-3 py-1 rounded-full text-xs text-muted-foreground">
                            {date === new Date().toLocaleDateString()
                              ? "Today"
                              : date}
                          </span>
                        </div>
                        {msgs.map((msg, index) => {
                          const prevMsg = msgs[index - 1];
                          const showAvatar =
                            !prevMsg || prevMsg.sender_id !== msg.sender_id;
                          return (
                            <ChatMessage
                              key={msg.id}
                              message={msg}
                              isOwn={msg.sender_id === user?.id}
                              showAvatar={showAvatar}
                            />
                          );
                        })}
                      </div>
                    ))}
                    {messages.length === 0 && (
                      <div className="flex flex-col items-center justify-center h-64 text-center">
                        <MessageSquare className="h-12 w-12 text-muted-foreground/30 mb-3" />
                        <p className="text-muted-foreground text-sm">
                          No messages yet
                        </p>
                        <p className="text-muted-foreground/70 text-xs mt-1">
                          Be the first to send a message!
                        </p>
                      </div>
                    )}
                    <div ref={messagesEndRef} />
                  </div>
                </ScrollArea>

                <ChatInput onSend={sendMessage} disabled={sending} />
              </>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-center p-8">
                <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                  <MessageSquare className="h-10 w-10 text-primary" />
                </div>
                <h3 className="font-semibold text-lg text-foreground mb-2">
                  Project Chat
                </h3>
                <p className="text-muted-foreground text-sm max-w-xs">
                  Select a chat group to start messaging your team members
                </p>
              </div>
            )}
          </div>

          {/* Members Panel */}
          {showMembers && selectedGroup && (
            <div className="w-72 flex-shrink-0 hidden sm:block">
              <MembersPanel
                group={selectedGroup}
                members={members}
                isAdmin={isAdmin}
                onClose={() => setShowMembers(false)}
                onAddMember={addMember}
                onRemoveMember={removeMember}
                onAddFormUsers={addFormUsersToGroup}
              />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

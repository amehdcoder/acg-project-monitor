import { useState, useRef, useEffect, useCallback } from "react";
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
import { MessageSearch } from "./MessageSearch";
import { CallDialog } from "./CallDialog";
import { GroupSettingsDialog } from "./GroupSettingsDialog";

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
    uploadAttachment,
    createChatGroup,
    addMember,
    removeMember,
    addFormUsersToGroup,
    fetchChatGroups,
    isAdmin,
  } = useProjectChat(open ? projectId : null);

  const [showMembers, setShowMembers] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [callType, setCallType] = useState<"voice" | "video" | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messageRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (!highlightedMessageId) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, highlightedMessageId]);

  // Group messages by date
  const groupedMessages = messages.reduce((acc, msg) => {
    const date = new Date(msg.created_at).toLocaleDateString();
    if (!acc[date]) acc[date] = [];
    acc[date].push(msg);
    return acc;
  }, {} as Record<string, typeof messages>);

  const handleNavigateToMessage = useCallback((messageId: string) => {
    setHighlightedMessageId(messageId);
    const messageElement = messageRefs.current.get(messageId);
    if (messageElement) {
      messageElement.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    // Clear highlight after animation
    setTimeout(() => setHighlightedMessageId(null), 2000);
  }, []);

  const handleGroupSelect = (group: typeof selectedGroup) => {
    setSelectedGroup(group);
    setShowMembers(false);
    setShowSearch(false);
  };

  const handleGroupDeleted = () => {
    setSelectedGroup(null);
    fetchChatGroups();
  };

  const handleGroupUpdated = () => {
    fetchChatGroups();
  };

  const setMessageRef = useCallback((id: string, element: HTMLDivElement | null) => {
    if (element) {
      messageRefs.current.set(id, element);
    } else {
      messageRefs.current.delete(id);
    }
  }, []);

  return (
    <>
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
                "w-80 flex-shrink-0 flex flex-col",
                selectedGroup ? "hidden lg:flex" : "flex"
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
                onSelectGroup={handleGroupSelect}
                onCreateGroup={createChatGroup}
                isAdmin={isAdmin}
                forms={forms}
              />
            </div>

            {/* Main Chat Area */}
            <div className={cn(
              "flex-1 flex flex-col min-w-0",
              !selectedGroup && "hidden lg:flex"
            )}>
              {selectedGroup ? (
                <>
                  <div className="relative">
                    <ChatHeader
                      group={selectedGroup}
                      members={members}
                      onBack={() => setSelectedGroup(null)}
                      onShowMembers={() => setShowMembers(true)}
                      onManageMembers={() => setShowMembers(true)}
                      onSearch={() => setShowSearch(!showSearch)}
                      onVoiceCall={() => setCallType("voice")}
                      onVideoCall={() => setCallType("video")}
                      onSettings={() => setShowSettings(true)}
                      isAdmin={isAdmin}
                    />
                    <MessageSearch
                      messages={messages}
                      isOpen={showSearch}
                      onClose={() => setShowSearch(false)}
                      onNavigateToMessage={handleNavigateToMessage}
                    />
                  </div>

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
                              <div
                                key={msg.id}
                                ref={(el) => setMessageRef(msg.id, el)}
                                className={cn(
                                  "transition-colors duration-500",
                                  highlightedMessageId === msg.id && "bg-primary/20"
                                )}
                              >
                                <ChatMessage
                                  message={msg}
                                  isOwn={msg.sender_id === user?.id}
                                  showAvatar={showAvatar}
                                  members={members.map(m => ({
                                    user_id: m.user_id,
                                    first_name: m.user?.first_name || "",
                                    last_name: m.user?.last_name || "",
                                  }))}
                                />
                              </div>
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

                  <ChatInput 
                    onSend={(content, attachment) => sendMessage(content, undefined, attachment)} 
                    onUpload={uploadAttachment}
                    disabled={sending}
                    members={members.map(m => ({
                      user_id: m.user_id,
                      first_name: m.user?.first_name || "",
                      last_name: m.user?.last_name || "",
                    }))}
                  />
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
                    {chatGroups.length === 0 
                      ? isAdmin 
                        ? "No chat groups yet. Create one to start messaging your team!"
                        : "No chat groups available. Contact an admin to create one."
                      : "Select a chat group to start messaging your team members"
                    }
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

      {/* Call Dialog */}
      {callType && selectedGroup && (
        <CallDialog
          type={callType}
          group={selectedGroup}
          members={members}
          isOpen={!!callType}
          onClose={() => setCallType(null)}
        />
      )}

      {/* Group Settings Dialog */}
      {showSettings && selectedGroup && (
        <GroupSettingsDialog
          group={selectedGroup}
          members={members}
          isOpen={showSettings}
          onClose={() => setShowSettings(false)}
          onGroupUpdated={handleGroupUpdated}
          onGroupDeleted={handleGroupDeleted}
        />
      )}
    </>
  );
}

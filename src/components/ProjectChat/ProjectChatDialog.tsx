import { useState, useRef, useEffect, useCallback } from "react";
import { MessageSquare, X, Maximize2, Minimize2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
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
import { useDirectChats, type DirectChat } from "@/hooks/useDirectChats";
import { useAuth } from "@/hooks/useAuth";
import { ChatGroupList } from "./ChatGroupList";
import { ChatHeader } from "./ChatHeader";
import { ChatMessage } from "./ChatMessage";
import { ChatInput } from "./ChatInput";
import { DirectChatView } from "./DirectChatView";
import { MembersPanel } from "./MembersPanel";
import { MessageSearch } from "./MessageSearch";
import { CallDialog, ActiveCallBanner } from "./CallDialog";
import { GroupSettingsDialog } from "./GroupSettingsDialog";
import { TypingIndicator, useTypingIndicator } from "./TypingIndicator";

interface ProjectChatDialogProps {
  projectId: string;
  projectName: string;
  forms?: Array<{ id: string; name: string }>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When opened from a push notification, auto-select this group so its
      messages are shown and immediately marked as read. */
  initialGroupId?: string | null;
}

export function ProjectChatDialog({
  projectId,
  projectName,
  forms = [],
  open,
  onOpenChange,
  initialGroupId,
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
    sendSpecial,
    deleteMessage,
    togglePin,
    uploadAttachment,
    createChatGroup,
    addMember,
    removeMember,
    addFormUsersToGroup,
    fetchChatGroups,
    isAdmin,
  } = useProjectChat(open ? projectId : null);

  const { chats: directChats, fetchChats: fetchDirectChats, setFlag: setDirectFlag } =
    useDirectChats(open);
  const [selectedDirect, setSelectedDirect] = useState<DirectChat | null>(null);
  const [projectMembers, setProjectMembers] = useState<
    Array<{ user_id: string; full_name: string; avatar_url: string | null }>
  >([]);

  // Load project members for the "New Chat" picker.
  useEffect(() => {
    if (!open || !projectId) return;
    let active = true;
    (async () => {
      const { data, error } = await supabase.rpc("get_project_chat_members", {
        _project_id: projectId,
      });
      if (!active || error || !data) return;
      setProjectMembers(
        (data as any[]).map((m) => ({
          user_id: m.user_id,
          full_name: m.full_name || "User",
          avatar_url: m.avatar_url ?? null,
        }))
      );
    })();
    return () => {
      active = false;
    };
  }, [open, projectId]);

  // Deep-link: when opened from a push notification with a target group,
  // select that group so its thread is shown and marked read on open.
  const appliedInitialGroup = useRef<string | null>(null);
  useEffect(() => {
    if (!open) {
      appliedInitialGroup.current = null;
      return;
    }
    if (!initialGroupId || appliedInitialGroup.current === initialGroupId) return;
    const target = chatGroups.find((g) => g.id === initialGroupId);
    if (target) {
      appliedInitialGroup.current = initialGroupId;
      setSelectedDirect(null);
      setSelectedGroup(target);
    }
  }, [open, initialGroupId, chatGroups, setSelectedGroup]);



  const [showMembers, setShowMembers] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [callType, setCallType] = useState<"voice" | "video" | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messageRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Typing indicator
  const { startTyping, stopTyping } = useTypingIndicator(
    selectedGroup?.id || null,
    user?.id || null
  );

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (!highlightedMessageId) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, highlightedMessageId]);

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
    setTimeout(() => setHighlightedMessageId(null), 2000);
  }, []);

  const handleGroupSelect = (group: typeof selectedGroup) => {
    setSelectedDirect(null);
    setSelectedGroup(group);
    setShowMembers(false);
    setShowSearch(false);
    setReplyTo(null);
  };

  const handleDirectSelect = (chat: DirectChat) => {
    setSelectedGroup(null);
    setShowMembers(false);
    setShowSearch(false);
    setReplyTo(null);
    setSelectedDirect(chat);
  };

  const handleArchiveDirect = async (chat: DirectChat) => {
    await setDirectFlag(chat.conversation_id, chat.archived ? "unarchive" : "archive");
  };

  const handleDeleteDirect = async (chat: DirectChat) => {
    await setDirectFlag(chat.conversation_id, "delete");
    if (selectedDirect?.conversation_id === chat.conversation_id) {
      setSelectedDirect(null);
    }
  };

  const handleStartDirect = async (member: {
    user_id: string;
    full_name: string;
    avatar_url: string | null;
  }) => {
    const { data: convId, error } = await supabase.rpc("start_proximity_conversation", {
      _other: member.user_id,
    });
    if (error || !convId) {
      toast.error("Could not start the chat. Please try again.");
      return;
    }
    const conversationId = convId as unknown as string;
    await fetchDirectChats();
    setSelectedGroup(null);
    setShowMembers(false);
    setShowSearch(false);
    setReplyTo(null);
    setSelectedDirect({
      conversation_id: conversationId,
      other_id: member.user_id,
      other_name: member.full_name,
      status: "active",
      archived: false,
      last_message: null,
      last_message_at: null,
      last_sender_id: null,
      unread_count: 0,
      updated_at: new Date().toISOString(),
    });
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

  const handleJoinCall = (joinCallType: "voice" | "video") => {
    setCallType(joinCallType);
  };

  const handleSendMessage = useCallback((content: string, attachment?: { url: string; type: string; name: string }) => {
    sendMessage(content, replyTo || undefined, attachment);
    setReplyTo(null);
    stopTyping();
  }, [sendMessage, replyTo, stopTyping]);

  // Find reply-to message for display
  const replyToMessage = replyTo ? messages.find(m => m.id === replyTo) : null;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className={cn(
            "p-0 gap-0 overflow-hidden border-0 sm:border",
            isFullscreen
              ? "max-w-full w-screen h-[100dvh] max-h-[100dvh] rounded-none"
              : "max-w-full w-screen h-[100dvh] max-h-[100dvh] rounded-none sm:max-w-5xl sm:w-[96vw] sm:h-[92vh] sm:max-h-[860px] sm:rounded-xl"
          )}
        >
          <div className="flex h-full">
            {/* Sidebar */}
            <div className={cn("w-80 flex-shrink-0 flex flex-col border-r border-border", (selectedGroup || selectedDirect) ? "hidden lg:flex" : "flex")}>
              <div className="p-3 border-b border-border flex items-center justify-between bg-card">
                <DialogTitle className="font-display text-sm">{projectName}</DialogTitle>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setIsFullscreen(!isFullscreen)}>
                    {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
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
                directChats={directChats}
                selectedDirectId={selectedDirect?.conversation_id || null}
                onSelectDirect={handleDirectSelect}
                onArchiveDirect={handleArchiveDirect}
                onDeleteDirect={handleDeleteDirect}
                projectMembers={projectMembers}
                onStartDirect={handleStartDirect}
              />
            </div>

            {/* Main Chat Area */}
            <div className={cn("flex-1 flex flex-col min-w-0", !selectedGroup && !selectedDirect && "hidden lg:flex")}>
              {selectedDirect ? (
                <DirectChatView
                  chat={selectedDirect}
                  onBack={() => setSelectedDirect(null)}
                  onArchive={() => handleArchiveDirect(selectedDirect)}
                  onDelete={() => handleDeleteDirect(selectedDirect)}
                />
              ) : selectedGroup ? (
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

                  {/* Active call banner */}
                  <ActiveCallBanner groupId={selectedGroup.id} onJoin={handleJoinCall} />

                  {/* Messages */}
                  <ScrollArea
                    className="flex-1"
                    style={{
                      backgroundColor: "hsl(var(--wa-chat-bg))",
                      backgroundImage:
                        "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80' viewBox='0 0 80 80'%3E%3Cg fill='%23000000' fill-opacity='0.025'%3E%3Cpath d='M14 16h12v2H14zM44 30h10v2H44zM20 48h14v2H20zM52 60h12v2H52zM8 64h8v2H8z'/%3E%3Ccircle cx='62' cy='14' r='3'/%3E%3Ccircle cx='30' cy='40' r='3'/%3E%3C/g%3E%3C/svg%3E\")",
                    }}
                  >
                    <div className="py-4">
                      {Object.entries(groupedMessages).map(([date, msgs]) => (
                        <div key={date}>
                          <div className="flex justify-center my-4">
                            <span className="px-3 py-1 rounded-lg text-xs font-medium shadow-sm" style={{ backgroundColor: "hsl(var(--wa-panel))", color: "hsl(var(--wa-secondary-text))" }}>
                              {date === new Date().toLocaleDateString() ? "Today" : date}
                            </span>
                          </div>
                          {msgs.map((msg, index) => {
                            const prevMsg = msgs[index - 1];
                            const showAvatar = !prevMsg || prevMsg.sender_id !== msg.sender_id;
                            return (
                              <div
                                key={msg.id}
                                ref={(el) => setMessageRef(msg.id, el)}
                                className={cn(
                                  "transition-all duration-500",
                                  highlightedMessageId === msg.id && "bg-primary/10 ring-1 ring-primary/20 rounded-lg mx-2"
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
                                  currentUserId={user?.id}
                                  isAdmin={isAdmin}
                                  onReply={() => setReplyTo(msg.id)}
                                  onDelete={() => deleteMessage(msg.id)}
                                  onTogglePin={() => togglePin(msg.id, !msg.is_pinned)}
                                />
                              </div>
                            );
                          })}
                        </div>
                      ))}
                      {messages.length === 0 && (
                        <div className="flex flex-col items-center justify-center h-64 text-center">
                          <div className="w-16 h-16 rounded-full bg-primary/5 flex items-center justify-center mb-4">
                            <MessageSquare className="h-8 w-8 text-muted-foreground/30" />
                          </div>
                          <p className="text-muted-foreground text-sm font-medium">No messages yet</p>
                          <p className="text-muted-foreground/60 text-xs mt-1">Be the first to send a message!</p>
                        </div>
                      )}
                      <div ref={messagesEndRef} />
                    </div>
                  </ScrollArea>

                  {/* Typing indicator */}
                  {user && selectedGroup && (
                    <TypingIndicator chatGroupId={selectedGroup.id} currentUserId={user.id} />
                  )}

                  {/* Reply preview */}
                  {replyToMessage && (
                    <div className="px-3 pt-2 bg-background border-t border-border">
                      <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/50 border-l-2 border-primary text-xs">
                        <div className="flex-1 min-w-0">
                          <span className="font-medium text-primary">
                            {replyToMessage.sender ? `${replyToMessage.sender.first_name} ${replyToMessage.sender.last_name}` : "User"}
                          </span>
                          <p className="text-muted-foreground truncate">{replyToMessage.content}</p>
                        </div>
                        <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => setReplyTo(null)}>
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  )}

                  <ChatInput
                    onSend={handleSendMessage}
                    onUpload={uploadAttachment}
                    disabled={sending}
                    members={members.map(m => ({
                      user_id: m.user_id,
                      first_name: m.user?.first_name || "",
                      last_name: m.user?.last_name || "",
                    }))}
                    onTyping={startTyping}
                  />
                </>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-center p-8">
                  <div className="w-20 h-20 rounded-full bg-primary/5 flex items-center justify-center mb-4">
                    <MessageSquare className="h-10 w-10 text-primary/40" />
                  </div>
                  <h3 className="font-semibold text-lg text-foreground mb-2">Project Chat</h3>
                  <p className="text-muted-foreground text-sm max-w-xs">
                    {chatGroups.length === 0
                      ? isAdmin
                        ? "No chat groups yet. Create one to start messaging your team!"
                        : "No chat groups available. Contact an admin to create one."
                      : "Select a chat group to start messaging your team members"}
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

      {callType && selectedGroup && (
        <CallDialog
          type={callType}
          group={selectedGroup}
          members={members}
          isOpen={!!callType}
          onClose={() => setCallType(null)}
        />
      )}

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

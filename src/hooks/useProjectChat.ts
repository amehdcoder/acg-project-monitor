import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";

export interface ChatGroup {
  id: string;
  project_id: string;
  form_id: string | null;
  name: string;
  description: string | null;
  created_by: string;
  created_at: string;
  is_default: boolean;
  is_protected?: boolean;
  icon_url?: string | null;
  unread_count?: number;
}

export interface ChatMessage {
  id: string;
  chat_group_id: string;
  sender_id: string;
  content: string;
  message_type: string;
  reply_to_id: string | null;
  is_edited: boolean;
  is_deleted: boolean;
  is_pinned?: boolean;
  created_at: string;
  attachment_url: string | null;
  attachment_type: string | null;
  attachment_name: string | null;
  transcription?: string | null;
  mentions: string[];
  sender?: {
    first_name: string;
    last_name: string;
    avatar_url: string | null;
  };
}

export interface ChatGroupMember {
  id: string;
  chat_group_id: string;
  user_id: string;
  role: string;
  joined_at: string;
  user?: {
    first_name: string;
    last_name: string;
    avatar_url: string | null;
    email: string;
  };
}

export function useProjectChat(projectId: string | null) {
  const { user, isAdmin } = useAuth();
  const [chatGroups, setChatGroups] = useState<ChatGroup[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<ChatGroup | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [members, setMembers] = useState<ChatGroupMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);

  // Fetch chat groups for project with unread counts
  const fetchChatGroups = useCallback(async () => {
    if (!projectId || !user) return;
    
    try {
      setLoading(true);

      // Ensure the official HANDS Staff group exists for this project and that
      // all HANDS staff assigned to it are members. Best-effort: ignore errors.
      try {
        await (supabase as any).rpc("ensure_hands_staff_group", { _project_id: projectId });
      } catch { /* non-fatal */ }

      const { data, error } = await supabase
        .from("chat_groups")
        .select("*")
        .eq("project_id", projectId)
        .order("is_default", { ascending: false })
        .order("created_at", { ascending: true });

      if (error) throw error;
      
      // Fetch unread counts for each group
      const groupsWithUnread = await Promise.all(
        (data || []).map(async (group) => {
          const { data: unreadData } = await supabase.rpc("get_unread_count", {
            p_user_id: user.id,
            p_chat_group_id: group.id,
          });
          return { ...group, unread_count: unreadData || 0 };
        })
      );
      
      setChatGroups(groupsWithUnread);
      
      // Auto-select default group if none selected
      if (!selectedGroup && groupsWithUnread.length > 0) {
        const defaultGroup = groupsWithUnread.find(g => g.is_default) || groupsWithUnread[0];
        setSelectedGroup(defaultGroup);
      }
    } catch (error: any) {
      console.error("Error fetching chat groups:", error);
    } finally {
      setLoading(false);
    }
  }, [projectId, selectedGroup, user]);

  // Fetch messages for selected group
  const fetchMessages = useCallback(async () => {
    if (!selectedGroup) return;
    
    try {
      const { data, error } = await supabase
        .from("chat_messages")
        .select("*")
        .eq("chat_group_id", selectedGroup.id)
        .eq("is_deleted", false)
        .order("created_at", { ascending: true });

      if (error) throw error;

      // Fetch sender profiles
      const senderIds = [...new Set(data?.map(m => m.sender_id) || [])];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, first_name, last_name, avatar_url")
        .in("user_id", senderIds);

      const profileMap = new Map(profiles?.map(p => [p.user_id, p]) || []);
      
      const messagesWithSenders = (data || []).map(msg => ({
        ...msg,
        mentions: msg.mentions || [],
        sender: profileMap.get(msg.sender_id) || undefined,
      }));

      setMessages(messagesWithSenders);
    } catch (error: any) {
      console.error("Error fetching messages:", error);
    }
  }, [selectedGroup]);

  // Fetch members for selected group
  const fetchMembers = useCallback(async () => {
    if (!selectedGroup) return;
    
    try {
      const { data, error } = await supabase
        .from("chat_group_members")
        .select("*")
        .eq("chat_group_id", selectedGroup.id);

      if (error) throw error;

      // Fetch user profiles
      const userIds = data?.map(m => m.user_id) || [];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, first_name, last_name, avatar_url, email")
        .in("user_id", userIds);

      const profileMap = new Map(profiles?.map(p => [p.user_id, p]) || []);
      
      const membersWithProfiles = (data || []).map(member => ({
        ...member,
        user: profileMap.get(member.user_id) || undefined,
      }));

      setMembers(membersWithProfiles);
    } catch (error: any) {
      console.error("Error fetching members:", error);
    }
  }, [selectedGroup]);

  // Mark messages as read
  const markAsRead = useCallback(async () => {
    if (!selectedGroup || !user || messages.length === 0) return;
    
    try {
      // Get the latest message
      const latestMessage = messages[messages.length - 1];
      if (!latestMessage || latestMessage.sender_id === user.id) return;
      
      // Upsert read receipt for the latest message
      await supabase
        .from("message_read_receipts")
        .upsert({
          message_id: latestMessage.id,
          user_id: user.id,
          read_at: new Date().toISOString(),
        }, { onConflict: "message_id,user_id" });
      
      // Update unread count in state
      setChatGroups(prev => prev.map(g => 
        g.id === selectedGroup.id ? { ...g, unread_count: 0 } : g
      ));
    } catch (error) {
      console.error("Error marking messages as read:", error);
    }
  }, [selectedGroup, user, messages]);

  // Parse mentions from message content
  const parseMentions = (content: string): string[] => {
    const mentionRegex = /@\[([^\]]+)\]\(([^)]+)\)/g;
    const mentions: string[] = [];
    let match;
    while ((match = mentionRegex.exec(content)) !== null) {
      mentions.push(match[2]); // User ID
    }
    return mentions;
  };

  // Send message with optional attachment
  const sendMessage = async (
    content: string, 
    replyToId?: string,
    attachment?: { url: string; type: string; name: string }
  ) => {
    if (!selectedGroup || !user || (!content.trim() && !attachment)) return;
    
    try {
      setSending(true);
      const mentions = parseMentions(content);
      
      const { error } = await supabase
        .from("chat_messages")
        .insert({
          chat_group_id: selectedGroup.id,
          sender_id: user.id,
          content: content.trim(),
          reply_to_id: replyToId || null,
          attachment_url: attachment?.url || null,
          attachment_type: attachment?.type || null,
          attachment_name: attachment?.name || null,
          mentions,
        });

      if (error) throw error;
    } catch (error: any) {
      console.error("Error sending message:", error);
      toast({
        title: "Failed to send message",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  // Upload attachment
  const uploadAttachment = async (file: File): Promise<{ url: string; type: string; name: string } | null> => {
    if (!user) return null;
    
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}/${Date.now()}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from("chat-attachments")
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("chat-attachments")
        .getPublicUrl(fileName);

      return {
        url: urlData.publicUrl,
        type: file.type,
        name: file.name,
      };
    } catch (error: any) {
      console.error("Error uploading attachment:", error);
      toast({
        title: "Failed to upload file",
        description: error.message,
        variant: "destructive",
      });
      return null;
    }
  };

  // Create chat group (admin only)
  const createChatGroup = async (name: string, description?: string, formId?: string) => {
    if (!projectId || !user || !isAdmin) return null;

    // The Geo-enabled Microplanning Entry form is a built-in tool (not a row in
    // the `forms` table), so it cannot be stored in chat_groups.form_id (FK).
    // We use a sentinel value to recognise it and pull members from the
    // microplan_form_access grant table instead.
    const isMicroplan = formId === "__microplan__";
    const linkFormId = isMicroplan ? undefined : formId;

    try {
      const { data, error } = await supabase
        .from("chat_groups")
        .insert({
          project_id: projectId,
          name,
          description: description || null,
          form_id: linkFormId || null,
          created_by: user.id,
        })
        .select()
        .single();

      if (error) throw error;

      // Auto-add form users if a form is linked.
      if (data && (linkFormId || isMicroplan)) {
        let userIds: string[] = [];
        if (isMicroplan) {
          const { data: grants } = await supabase
            .from("microplan_form_access")
            .select("user_id");
          userIds = (grants || []).map((g: any) => g.user_id);
        } else if (linkFormId) {
          const { data: assignments } = await supabase
            .from("user_form_assignments")
            .select("user_id")
            .eq("form_id", linkFormId);
          userIds = (assignments || []).map((a: any) => a.user_id);
        }

        if (userIds.length > 0) {
          const memberInserts = userIds.map((uid) => ({
            chat_group_id: data.id,
            user_id: uid,
            added_by: user.id,
          }));

          await supabase
            .from("chat_group_members")
            .upsert(memberInserts, { onConflict: "chat_group_id,user_id" });
        }
      }

      // Add creator as admin member
      await supabase
        .from("chat_group_members")
        .upsert({
          chat_group_id: data.id,
          user_id: user.id,
          role: "admin",
          added_by: user.id,
        }, { onConflict: "chat_group_id,user_id" });

      toast({ title: "Chat group created successfully" });
      await fetchChatGroups();
      return data;
    } catch (error: any) {
      console.error("Error creating chat group:", error);
      toast({
        title: "Failed to create chat group",
        description: error.message,
        variant: "destructive",
      });
      return null;
    }
  };

  // Add member to group (admin only)
  const addMember = async (userId: string) => {
    if (!selectedGroup || !user || !isAdmin) return;

    try {
      // Server-side validation: verifies the user's designation before
      // allowing them into protected groups, and blocks any mismatch.
      const { data, error } = await supabase.functions.invoke(
        "validate-protected-membership",
        { body: { chat_group_id: selectedGroup.id, user_id: userId } },
      );

      if (error) {
        // Surface the server's reason (e.g. designation mismatch) when present.
        let reason = error.message;
        try {
          const ctx = await (error as any).context?.json?.();
          if (ctx?.reason) reason = ctx.reason;
        } catch { /* ignore */ }
        throw new Error(reason);
      }
      if (data && data.allowed === false) {
        throw new Error(data.reason || "This user cannot join this group.");
      }

      toast({ title: "Member added successfully" });
      await fetchMembers();
    } catch (error: any) {
      console.error("Error adding member:", error);
      toast({
        title: "Failed to add member",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  // Remove member from group (admin only)
  const removeMember = async (memberId: string) => {
    if (!isAdmin) return;
    
    try {
      const { error } = await supabase
        .from("chat_group_members")
        .delete()
        .eq("id", memberId);

      if (error) throw error;

      toast({ title: "Member removed" });
      await fetchMembers();
    } catch (error: any) {
      console.error("Error removing member:", error);
      toast({
        title: "Failed to remove member",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  // Add form-assigned users to group
  const addFormUsersToGroup = async (formId: string) => {
    if (!selectedGroup || !user || !isAdmin) return;
    
    try {
      // Get users assigned to this form
      const { data: assignments, error: assignError } = await supabase
        .from("user_form_assignments")
        .select("user_id")
        .eq("form_id", formId);

      if (assignError) throw assignError;

      // Add each user to the group
      const userIds = assignments?.map(a => a.user_id) || [];
      const memberInserts = userIds.map(userId => ({
        chat_group_id: selectedGroup.id,
        user_id: userId,
        added_by: user.id,
      }));

      if (memberInserts.length > 0) {
        await supabase
          .from("chat_group_members")
          .upsert(memberInserts, { onConflict: "chat_group_id,user_id" });
      }

      toast({ title: `Added ${userIds.length} form members to group` });
      await fetchMembers();
    } catch (error: any) {
      console.error("Error adding form users:", error);
      toast({
        title: "Failed to add form users",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  // Delete a message (own message, or admin). Soft-delete keeps history clean.
  const deleteMessage = async (messageId: string) => {
    if (!user) return;
    try {
      const { error } = await supabase
        .from("chat_messages")
        .update({ is_deleted: true })
        .eq("id", messageId);
      if (error) throw error;
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
      toast({ title: "Message deleted" });
    } catch (error: any) {
      console.error("Error deleting message:", error);
      toast({
        title: "Failed to delete message",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  // Pin / unpin a message (WhatsApp-style). Admins / group admins only per RLS.
  const togglePin = async (messageId: string, pin: boolean) => {
    if (!user) return;
    try {
      const { error } = await supabase
        .from("chat_messages")
        .update({ is_pinned: pin })
        .eq("id", messageId);
      if (error) throw error;
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, is_pinned: pin } : m)),
      );
      toast({ title: pin ? "Message pinned" : "Message unpinned" });
    } catch (error: any) {
      console.error("Error pinning message:", error);
      toast({
        title: "Failed to pin message",
        description: error.message,
        variant: "destructive",
      });
    }
  };



  // Subscribe to realtime messages
  useEffect(() => {
    if (!selectedGroup) return;

    const channel = supabase
      .channel(`chat-${selectedGroup.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chat_messages",
          filter: `chat_group_id=eq.${selectedGroup.id}`,
        },
        async (payload) => {
          // Fetch sender profile for new message
          const { data: profile } = await supabase
            .from("profiles")
            .select("user_id, first_name, last_name, avatar_url")
            .eq("user_id", payload.new.sender_id)
            .single();

          const newMessage: ChatMessage = {
            ...(payload.new as any),
            mentions: payload.new.mentions || [],
            sender: profile || undefined,
          };

          setMessages(prev => [...prev, newMessage]);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "chat_messages",
          filter: `chat_group_id=eq.${selectedGroup.id}`,
        },
        (payload) => {
          const updated = payload.new as any;
          setMessages((prev) =>
            updated.is_deleted
              ? prev.filter((m) => m.id !== updated.id)
              : prev.map((m) =>
                  m.id === updated.id
                    ? { ...m, ...updated, mentions: updated.mentions || [] }
                    : m,
                ),
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedGroup]);

  // Mark messages as read when viewing
  useEffect(() => {
    if (selectedGroup && messages.length > 0) {
      markAsRead();
    }
  }, [selectedGroup, messages.length, markAsRead]);

  // Fetch groups on project change
  useEffect(() => {
    if (projectId) {
      fetchChatGroups();
    } else {
      setChatGroups([]);
      setSelectedGroup(null);
      setMessages([]);
    }
  }, [projectId]);

  // Fetch messages when group changes
  useEffect(() => {
    if (selectedGroup) {
      fetchMessages();
      fetchMembers();
    }
  }, [selectedGroup, fetchMessages, fetchMembers]);

  return {
    chatGroups,
    selectedGroup,
    setSelectedGroup,
    messages,
    members,
    loading,
    sending,
    sendMessage,
    deleteMessage,
    togglePin,
    uploadAttachment,
    createChatGroup,
    addMember,
    removeMember,
    addFormUsersToGroup,
    fetchChatGroups,
    fetchMessages,
    markAsRead,
    isAdmin,
  };
}

// Hook to get unread count for a project (for badges)
export function useProjectUnreadCount(projectId: string | null) {
  const { user } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!projectId || !user) {
      setUnreadCount(0);
      return;
    }

    const fetchUnread = async () => {
      try {
        const { data } = await supabase.rpc("get_project_unread_count", {
          p_user_id: user.id,
          p_project_id: projectId,
        });
        setUnreadCount(data || 0);
      } catch (error) {
        console.error("Error fetching unread count:", error);
      }
    };

    fetchUnread();

    // Subscribe to new messages in project
    const channel = supabase
      .channel(`project-unread-${projectId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chat_messages",
        },
        () => {
          fetchUnread();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [projectId, user]);

  return unreadCount;
}

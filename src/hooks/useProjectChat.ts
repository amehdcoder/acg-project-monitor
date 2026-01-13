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
  created_at: string;
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

  // Fetch chat groups for project
  const fetchChatGroups = useCallback(async () => {
    if (!projectId) return;
    
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("chat_groups")
        .select("*")
        .eq("project_id", projectId)
        .order("is_default", { ascending: false })
        .order("created_at", { ascending: true });

      if (error) throw error;
      
      setChatGroups(data || []);
      
      // Auto-select default group if none selected
      if (!selectedGroup && data && data.length > 0) {
        const defaultGroup = data.find(g => g.is_default) || data[0];
        setSelectedGroup(defaultGroup);
      }
    } catch (error: any) {
      console.error("Error fetching chat groups:", error);
    } finally {
      setLoading(false);
    }
  }, [projectId, selectedGroup]);

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

  // Send message
  const sendMessage = async (content: string, replyToId?: string) => {
    if (!selectedGroup || !user || !content.trim()) return;
    
    try {
      setSending(true);
      const { error } = await supabase
        .from("chat_messages")
        .insert({
          chat_group_id: selectedGroup.id,
          sender_id: user.id,
          content: content.trim(),
          reply_to_id: replyToId || null,
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

  // Create chat group (admin only)
  const createChatGroup = async (name: string, description?: string, formId?: string) => {
    if (!projectId || !user || !isAdmin) return null;
    
    try {
      const { data, error } = await supabase
        .from("chat_groups")
        .insert({
          project_id: projectId,
          name,
          description: description || null,
          form_id: formId || null,
          created_by: user.id,
        })
        .select()
        .single();

      if (error) throw error;

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
      const { error } = await supabase
        .from("chat_group_members")
        .insert({
          chat_group_id: selectedGroup.id,
          user_id: userId,
          added_by: user.id,
        });

      if (error) throw error;

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
      for (const userId of userIds) {
        await supabase
          .from("chat_group_members")
          .upsert({
            chat_group_id: selectedGroup.id,
            user_id: userId,
            added_by: user.id,
          }, { onConflict: "chat_group_id,user_id" });
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
            ...(payload.new as ChatMessage),
            sender: profile || undefined,
          };

          setMessages(prev => [...prev, newMessage]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedGroup]);

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
    createChatGroup,
    addMember,
    removeMember,
    addFormUsersToGroup,
    fetchChatGroups,
    fetchMessages,
    isAdmin,
  };
}

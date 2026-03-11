export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      active_calls: {
        Row: {
          call_type: string
          chat_group_id: string
          ended_at: string | null
          id: string
          is_active: boolean
          room_name: string
          started_at: string
          started_by: string
        }
        Insert: {
          call_type?: string
          chat_group_id: string
          ended_at?: string | null
          id?: string
          is_active?: boolean
          room_name: string
          started_at?: string
          started_by: string
        }
        Update: {
          call_type?: string
          chat_group_id?: string
          ended_at?: string | null
          id?: string
          is_active?: boolean
          room_name?: string
          started_at?: string
          started_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "active_calls_chat_group_id_fkey"
            columns: ["chat_group_id"]
            isOneToOne: false
            referencedRelation: "chat_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_tasks: {
        Row: {
          assigned_to: string | null
          created_at: string
          created_by: string
          description: string | null
          due_date: string | null
          id: string
          status: string
          title: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          due_date?: string | null
          id?: string
          status?: string
          title: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          assigned_to?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          due_date?: string | null
          id?: string
          status?: string
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          admin_user_id: string
          created_at: string
          id: string
          metadata: Json | null
          target_user_id: string
        }
        Insert: {
          action: string
          admin_user_id: string
          created_at?: string
          id?: string
          metadata?: Json | null
          target_user_id: string
        }
        Update: {
          action?: string
          admin_user_id?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          target_user_id?: string
        }
        Relationships: []
      }
      case_activities: {
        Row: {
          activity_type: string
          case_id: string
          changes: Json | null
          created_at: string
          form_submission_id: string | null
          id: string
          notes: string | null
          performed_at: string
          performed_by: string
        }
        Insert: {
          activity_type: string
          case_id: string
          changes?: Json | null
          created_at?: string
          form_submission_id?: string | null
          id?: string
          notes?: string | null
          performed_at?: string
          performed_by: string
        }
        Update: {
          activity_type?: string
          case_id?: string
          changes?: Json | null
          created_at?: string
          form_submission_id?: string | null
          id?: string
          notes?: string | null
          performed_at?: string
          performed_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "case_activities_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_activities_form_submission_id_fkey"
            columns: ["form_submission_id"]
            isOneToOne: false
            referencedRelation: "form_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      case_types: {
        Row: {
          created_at: string
          created_by: string
          description: string | null
          follow_up_schedule: Json | null
          id: string
          label: string
          name: string
          project_id: string
          properties: Json | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          description?: string | null
          follow_up_schedule?: Json | null
          id?: string
          label: string
          name: string
          project_id: string
          properties?: Json | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string | null
          follow_up_schedule?: Json | null
          id?: string
          label?: string
          name?: string
          project_id?: string
          properties?: Json | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "case_types_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      cases: {
        Row: {
          case_type_id: string
          closed_at: string | null
          closed_by: string | null
          created_at: string
          id: string
          last_modified_at: string
          last_modified_by: string
          name: string
          next_follow_up_date: string | null
          opened_at: string
          opened_by: string
          owner_id: string
          project_id: string
          properties: Json | null
          status: string
        }
        Insert: {
          case_type_id: string
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          id?: string
          last_modified_at?: string
          last_modified_by: string
          name: string
          next_follow_up_date?: string | null
          opened_at?: string
          opened_by: string
          owner_id: string
          project_id: string
          properties?: Json | null
          status?: string
        }
        Update: {
          case_type_id?: string
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          id?: string
          last_modified_at?: string
          last_modified_by?: string
          name?: string
          next_follow_up_date?: string | null
          opened_at?: string
          opened_by?: string
          owner_id?: string
          project_id?: string
          properties?: Json | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "cases_case_type_id_fkey"
            columns: ["case_type_id"]
            isOneToOne: false
            referencedRelation: "case_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cases_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_group_members: {
        Row: {
          added_by: string
          chat_group_id: string
          id: string
          joined_at: string
          role: string
          user_id: string
        }
        Insert: {
          added_by: string
          chat_group_id: string
          id?: string
          joined_at?: string
          role?: string
          user_id: string
        }
        Update: {
          added_by?: string
          chat_group_id?: string
          id?: string
          joined_at?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_group_members_chat_group_id_fkey"
            columns: ["chat_group_id"]
            isOneToOne: false
            referencedRelation: "chat_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_groups: {
        Row: {
          created_at: string
          created_by: string
          description: string | null
          form_id: string | null
          id: string
          is_default: boolean
          name: string
          project_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          description?: string | null
          form_id?: string | null
          id?: string
          is_default?: boolean
          name: string
          project_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string | null
          form_id?: string | null
          id?: string
          is_default?: boolean
          name?: string
          project_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_groups_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "forms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_groups_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          attachment_name: string | null
          attachment_type: string | null
          attachment_url: string | null
          chat_group_id: string
          content: string
          created_at: string
          id: string
          is_deleted: boolean
          is_edited: boolean
          mentions: string[] | null
          message_type: string
          reply_to_id: string | null
          sender_id: string
          updated_at: string
        }
        Insert: {
          attachment_name?: string | null
          attachment_type?: string | null
          attachment_url?: string | null
          chat_group_id: string
          content: string
          created_at?: string
          id?: string
          is_deleted?: boolean
          is_edited?: boolean
          mentions?: string[] | null
          message_type?: string
          reply_to_id?: string | null
          sender_id: string
          updated_at?: string
        }
        Update: {
          attachment_name?: string | null
          attachment_type?: string | null
          attachment_url?: string | null
          chat_group_id?: string
          content?: string
          created_at?: string
          id?: string
          is_deleted?: boolean
          is_edited?: boolean
          mentions?: string[] | null
          message_type?: string
          reply_to_id?: string | null
          sender_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_chat_group_id_fkey"
            columns: ["chat_group_id"]
            isOneToOne: false
            referencedRelation: "chat_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_reply_to_id_fkey"
            columns: ["reply_to_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_dashboards: {
        Row: {
          created_at: string
          created_by: string
          description: string | null
          form_id: string
          id: string
          is_published: boolean
          layout: Json
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          description?: string | null
          form_id: string
          id?: string
          is_published?: boolean
          layout?: Json
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string | null
          form_id?: string
          id?: string
          is_published?: boolean
          layout?: Json
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "custom_dashboards_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "forms"
            referencedColumns: ["id"]
          },
        ]
      }
      dashboard_widgets: {
        Row: {
          config: Json
          created_at: string
          dashboard_id: string
          id: string
          position: Json
          title: string
          updated_at: string
          widget_type: string
        }
        Insert: {
          config?: Json
          created_at?: string
          dashboard_id: string
          id?: string
          position?: Json
          title: string
          updated_at?: string
          widget_type: string
        }
        Update: {
          config?: Json
          created_at?: string
          dashboard_id?: string
          id?: string
          position?: Json
          title?: string
          updated_at?: string
          widget_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "dashboard_widgets_dashboard_id_fkey"
            columns: ["dashboard_id"]
            isOneToOne: false
            referencedRelation: "custom_dashboards"
            referencedColumns: ["id"]
          },
        ]
      }
      field_activity: {
        Row: {
          created_at: string
          ended_at: string | null
          form_id: string
          id: string
          location: Json | null
          started_at: string
          user_id: string
          within_geofence: boolean | null
        }
        Insert: {
          created_at?: string
          ended_at?: string | null
          form_id: string
          id?: string
          location?: Json | null
          started_at?: string
          user_id: string
          within_geofence?: boolean | null
        }
        Update: {
          created_at?: string
          ended_at?: string | null
          form_id?: string
          id?: string
          location?: Json | null
          started_at?: string
          user_id?: string
          within_geofence?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "field_activity_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "forms"
            referencedColumns: ["id"]
          },
        ]
      }
      form_submissions: {
        Row: {
          created_at: string
          data: Json
          form_id: string
          id: string
          location: Json | null
          status: string
          submission_type: string
          submitted_at: string | null
          synced_at: string | null
          updated_at: string
          user_id: string
          within_geofence: boolean | null
        }
        Insert: {
          created_at?: string
          data?: Json
          form_id: string
          id?: string
          location?: Json | null
          status?: string
          submission_type?: string
          submitted_at?: string | null
          synced_at?: string | null
          updated_at?: string
          user_id: string
          within_geofence?: boolean | null
        }
        Update: {
          created_at?: string
          data?: Json
          form_id?: string
          id?: string
          location?: Json | null
          status?: string
          submission_type?: string
          submitted_at?: string | null
          synced_at?: string | null
          updated_at?: string
          user_id?: string
          within_geofence?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "form_submissions_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "forms"
            referencedColumns: ["id"]
          },
        ]
      }
      form_templates: {
        Row: {
          category: string
          created_at: string
          created_by: string
          description: string | null
          id: string
          is_published: boolean
          name: string
          questions: Json
          settings: Json
          updated_at: string
        }
        Insert: {
          category?: string
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          is_published?: boolean
          name: string
          questions?: Json
          settings?: Json
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          is_published?: boolean
          name?: string
          questions?: Json
          settings?: Json
          updated_at?: string
        }
        Relationships: []
      }
      forms: {
        Row: {
          created_at: string
          created_by: string
          description: string | null
          geofence: Json | null
          id: string
          last_used_at: string | null
          looker_dashboard_url: string | null
          name: string
          project_id: string
          questions: Json
          settings: Json
          status: string
          template_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          description?: string | null
          geofence?: Json | null
          id?: string
          last_used_at?: string | null
          looker_dashboard_url?: string | null
          name: string
          project_id: string
          questions?: Json
          settings?: Json
          status?: string
          template_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string | null
          geofence?: Json | null
          id?: string
          last_used_at?: string | null
          looker_dashboard_url?: string | null
          name?: string
          project_id?: string
          questions?: Json
          settings?: Json
          status?: string
          template_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "forms_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "forms_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "form_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      message_reactions: {
        Row: {
          created_at: string
          emoji: string
          id: string
          message_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          emoji: string
          id?: string
          message_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          emoji?: string
          id?: string
          message_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_reactions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      message_read_receipts: {
        Row: {
          id: string
          message_id: string
          read_at: string
          user_id: string
        }
        Insert: {
          id?: string
          message_id: string
          read_at?: string
          user_id: string
        }
        Update: {
          id?: string
          message_id?: string
          read_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_read_receipts_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          category: string
          created_at: string
          id: string
          message: string
          read: boolean
          related_id: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          category?: string
          created_at?: string
          id?: string
          message: string
          read?: boolean
          related_id?: string | null
          title: string
          type?: string
          user_id: string
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          message?: string
          read?: boolean
          related_id?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          alternate_email: string | null
          alternate_phone: string | null
          avatar_url: string | null
          created_at: string
          designation: Database["public"]["Enums"]["user_designation"]
          device_info: Json | null
          device_phone_number: string | null
          email: string
          first_name: string
          id: string
          is_active: boolean
          is_owner: boolean
          last_device_type: string | null
          last_ip_address: string | null
          last_name: string
          last_seen_at: string | null
          lga: string | null
          notification_preferences: Json | null
          other_designation: string | null
          phone_number: string | null
          state: string | null
          updated_at: string
          user_id: string
          ward: string | null
        }
        Insert: {
          alternate_email?: string | null
          alternate_phone?: string | null
          avatar_url?: string | null
          created_at?: string
          designation?: Database["public"]["Enums"]["user_designation"]
          device_info?: Json | null
          device_phone_number?: string | null
          email: string
          first_name: string
          id?: string
          is_active?: boolean
          is_owner?: boolean
          last_device_type?: string | null
          last_ip_address?: string | null
          last_name: string
          last_seen_at?: string | null
          lga?: string | null
          notification_preferences?: Json | null
          other_designation?: string | null
          phone_number?: string | null
          state?: string | null
          updated_at?: string
          user_id: string
          ward?: string | null
        }
        Update: {
          alternate_email?: string | null
          alternate_phone?: string | null
          avatar_url?: string | null
          created_at?: string
          designation?: Database["public"]["Enums"]["user_designation"]
          device_info?: Json | null
          device_phone_number?: string | null
          email?: string
          first_name?: string
          id?: string
          is_active?: boolean
          is_owner?: boolean
          last_device_type?: string | null
          last_ip_address?: string | null
          last_name?: string
          last_seen_at?: string | null
          lga?: string | null
          notification_preferences?: Json | null
          other_designation?: string | null
          phone_number?: string | null
          state?: string | null
          updated_at?: string
          user_id?: string
          ward?: string | null
        }
        Relationships: []
      }
      projects: {
        Row: {
          created_at: string
          created_by: string
          description: string | null
          end_date: string | null
          id: string
          looker_dashboard_url: string | null
          name: string
          start_date: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          description?: string | null
          end_date?: string | null
          id?: string
          looker_dashboard_url?: string | null
          name: string
          start_date?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string | null
          end_date?: string | null
          id?: string
          looker_dashboard_url?: string | null
          name?: string
          start_date?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      sync_history: {
        Row: {
          completed_at: string | null
          created_at: string
          error_message: string | null
          form_id: string | null
          id: string
          project_id: string | null
          row_count: number | null
          sheet_name: string | null
          spreadsheet_id: string | null
          started_at: string
          status: string
          sync_type: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          form_id?: string | null
          id?: string
          project_id?: string | null
          row_count?: number | null
          sheet_name?: string | null
          spreadsheet_id?: string | null
          started_at?: string
          status?: string
          sync_type?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          form_id?: string | null
          id?: string
          project_id?: string | null
          row_count?: number | null
          sheet_name?: string | null
          spreadsheet_id?: string | null
          started_at?: string
          status?: string
          sync_type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sync_history_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "forms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sync_history_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      task_audit_trail: {
        Row: {
          action: string
          changed_by: string
          created_at: string
          id: string
          new_status: string | null
          notes: string | null
          old_status: string | null
          task_id: string
        }
        Insert: {
          action: string
          changed_by: string
          created_at?: string
          id?: string
          new_status?: string | null
          notes?: string | null
          old_status?: string | null
          task_id: string
        }
        Update: {
          action?: string
          changed_by?: string
          created_at?: string
          id?: string
          new_status?: string | null
          notes?: string | null
          old_status?: string | null
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_audit_trail_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "admin_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      typing_indicators: {
        Row: {
          chat_group_id: string
          id: string
          started_at: string
          user_id: string
        }
        Insert: {
          chat_group_id: string
          id?: string
          started_at?: string
          user_id: string
        }
        Update: {
          chat_group_id?: string
          id?: string
          started_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "typing_indicators_chat_group_id_fkey"
            columns: ["chat_group_id"]
            isOneToOne: false
            referencedRelation: "chat_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      user_form_assignments: {
        Row: {
          assigned_by: string
          created_at: string
          form_id: string
          id: string
          user_id: string
        }
        Insert: {
          assigned_by: string
          created_at?: string
          form_id: string
          id?: string
          user_id: string
        }
        Update: {
          assigned_by?: string
          created_at?: string
          form_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_form_assignments_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "forms"
            referencedColumns: ["id"]
          },
        ]
      }
      user_geofence_assignments: {
        Row: {
          assigned_by: string
          created_at: string
          form_id: string
          geofence: Json
          id: string
          source: string
          updated_at: string
          user_id: string
        }
        Insert: {
          assigned_by: string
          created_at?: string
          form_id: string
          geofence: Json
          id?: string
          source?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          assigned_by?: string
          created_at?: string
          form_id?: string
          geofence?: Json
          id?: string
          source?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_geofence_assignments_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "forms"
            referencedColumns: ["id"]
          },
        ]
      }
      user_project_assignments: {
        Row: {
          assigned_by: string
          created_at: string
          id: string
          project_id: string
          user_id: string
        }
        Insert: {
          assigned_by: string
          created_at?: string
          id?: string
          project_id: string
          user_id: string
        }
        Update: {
          assigned_by?: string
          created_at?: string
          id?: string
          project_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_project_assignments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          assigned_by: string | null
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          assigned_by?: string | null
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          assigned_by?: string | null
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_access_form_dashboard: {
        Args: { _form_id: string; _user_id: string }
        Returns: boolean
      }
      can_edit_dashboard: { Args: { _user_id: string }; Returns: boolean }
      get_project_unread_count: {
        Args: { p_project_id: string; p_user_id: string }
        Returns: number
      }
      get_unread_count: {
        Args: { p_chat_group_id: string; p_user_id: string }
        Returns: number
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      is_chat_group_admin: {
        Args: { _chat_group_id: string; _user_id: string }
        Returns: boolean
      }
      is_chat_group_member: {
        Args: { _chat_group_id: string; _user_id: string }
        Returns: boolean
      }
      is_owner: { Args: { _user_id: string }; Returns: boolean }
      user_can_access_chat_group: {
        Args: { _chat_group_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "super_admin" | "systems_admin" | "user"
      user_designation:
        | "independent_monitor"
        | "enumerator"
        | "data_collector"
        | "electronic_data_manager"
        | "community_directed_distributor"
        | "flhf_supervisor"
        | "lga_supervisor"
        | "state_supervisor"
        | "hands_staff"
        | "cbmg_staff"
        | "cbmi_staff"
        | "sightsavers_staff"
        | "plan_intl_staff"
        | "sci_staff"
        | "other"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["super_admin", "systems_admin", "user"],
      user_designation: [
        "independent_monitor",
        "enumerator",
        "data_collector",
        "electronic_data_manager",
        "community_directed_distributor",
        "flhf_supervisor",
        "lga_supervisor",
        "state_supervisor",
        "hands_staff",
        "cbmg_staff",
        "cbmi_staff",
        "sightsavers_staff",
        "plan_intl_staff",
        "sci_staff",
        "other",
      ],
    },
  },
} as const

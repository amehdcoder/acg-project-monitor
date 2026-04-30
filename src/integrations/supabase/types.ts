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
      admin_page_access: {
        Row: {
          created_at: string
          granted_by: string
          id: string
          page_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          granted_by: string
          id?: string
          page_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          granted_by?: string
          id?: string
          page_id?: string
          user_id?: string
        }
        Relationships: []
      }
      admin_surveillance_log: {
        Row: {
          action_description: string
          action_type: string
          actor_email: string
          actor_id: string
          actor_role: string
          created_at: string
          id: string
          ip_address: string | null
          metadata: Json | null
          target_entity: string | null
          target_id: string | null
          user_agent: string | null
        }
        Insert: {
          action_description: string
          action_type: string
          actor_email: string
          actor_id: string
          actor_role: string
          created_at?: string
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          target_entity?: string | null
          target_id?: string | null
          user_agent?: string | null
        }
        Update: {
          action_description?: string
          action_type?: string
          actor_email?: string
          actor_id?: string
          actor_role?: string
          created_at?: string
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          target_entity?: string | null
          target_id?: string | null
          user_agent?: string | null
        }
        Relationships: []
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
      app_update_notifications: {
        Row: {
          created_at: string
          created_by: string
          description: string
          id: string
          page_id: string
          title: string
          update_type: string
        }
        Insert: {
          created_at?: string
          created_by: string
          description: string
          id?: string
          page_id: string
          title: string
          update_type?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string
          id?: string
          page_id?: string
          title?: string
          update_type?: string
        }
        Relationships: []
      }
      app_usage_tracking: {
        Row: {
          action: string
          created_at: string
          duration_seconds: number | null
          id: string
          metadata: Json | null
          page_id: string
          session_id: string | null
          user_id: string
        }
        Insert: {
          action?: string
          created_at?: string
          duration_seconds?: number | null
          id?: string
          metadata?: Json | null
          page_id: string
          session_id?: string | null
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          duration_seconds?: number | null
          id?: string
          metadata?: Json | null
          page_id?: string
          session_id?: string | null
          user_id?: string
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
      ces_capture_sessions: {
        Row: {
          area_name: string | null
          bounds: Json | null
          campaign_type: string | null
          capture_status: string
          center_lat: number | null
          center_lng: number | null
          created_at: string
          created_by: string
          description: string | null
          form_id: string | null
          household_count: number
          id: string
          keyframe_count: number
          lga: string | null
          name: string
          perimeter_coords: Json | null
          project_id: string
          state: string | null
          updated_at: string
          ward: string | null
        }
        Insert: {
          area_name?: string | null
          bounds?: Json | null
          campaign_type?: string | null
          capture_status?: string
          center_lat?: number | null
          center_lng?: number | null
          created_at?: string
          created_by: string
          description?: string | null
          form_id?: string | null
          household_count?: number
          id?: string
          keyframe_count?: number
          lga?: string | null
          name: string
          perimeter_coords?: Json | null
          project_id: string
          state?: string | null
          updated_at?: string
          ward?: string | null
        }
        Update: {
          area_name?: string | null
          bounds?: Json | null
          campaign_type?: string | null
          capture_status?: string
          center_lat?: number | null
          center_lng?: number | null
          created_at?: string
          created_by?: string
          description?: string | null
          form_id?: string | null
          household_count?: number
          id?: string
          keyframe_count?: number
          lga?: string | null
          name?: string
          perimeter_coords?: Json | null
          project_id?: string
          state?: string | null
          updated_at?: string
          ward?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ces_capture_sessions_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "forms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ces_capture_sessions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      ces_households: {
        Row: {
          altitude: number | null
          assigned_at: string | null
          assigned_to: string | null
          coverage_status: string
          created_at: string
          created_by: string
          id: string
          intervention_status: string | null
          label: string | null
          latitude: number
          longitude: number
          metadata: Json | null
          notes: string | null
          project_id: string
          roof_footprint: Json | null
          roof_height_m: number | null
          session_id: string
          updated_at: string
          visited_at: string | null
          visited_by: string | null
        }
        Insert: {
          altitude?: number | null
          assigned_at?: string | null
          assigned_to?: string | null
          coverage_status?: string
          created_at?: string
          created_by: string
          id?: string
          intervention_status?: string | null
          label?: string | null
          latitude: number
          longitude: number
          metadata?: Json | null
          notes?: string | null
          project_id: string
          roof_footprint?: Json | null
          roof_height_m?: number | null
          session_id: string
          updated_at?: string
          visited_at?: string | null
          visited_by?: string | null
        }
        Update: {
          altitude?: number | null
          assigned_at?: string | null
          assigned_to?: string | null
          coverage_status?: string
          created_at?: string
          created_by?: string
          id?: string
          intervention_status?: string | null
          label?: string | null
          latitude?: number
          longitude?: number
          metadata?: Json | null
          notes?: string | null
          project_id?: string
          roof_footprint?: Json | null
          roof_height_m?: number | null
          session_id?: string
          updated_at?: string
          visited_at?: string | null
          visited_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ces_households_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "ces_capture_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      ces_keyframes: {
        Row: {
          accuracy: number | null
          altitude: number | null
          captured_at: string
          created_at: string
          heading: number | null
          id: string
          image_path: string | null
          latitude: number
          longitude: number
          session_id: string
          thumbnail_data_url: string | null
        }
        Insert: {
          accuracy?: number | null
          altitude?: number | null
          captured_at?: string
          created_at?: string
          heading?: number | null
          id?: string
          image_path?: string | null
          latitude: number
          longitude: number
          session_id: string
          thumbnail_data_url?: string | null
        }
        Update: {
          accuracy?: number | null
          altitude?: number | null
          captured_at?: string
          created_at?: string
          heading?: number | null
          id?: string
          image_path?: string | null
          latitude?: number
          longitude?: number
          session_id?: string
          thumbnail_data_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ces_keyframes_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "ces_capture_sessions"
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
      data_quality_indicators: {
        Row: {
          accuracy_score: number | null
          anomaly_count: number | null
          avg_completion_time_seconds: number | null
          checked_by: string | null
          complete_submissions: number | null
          completeness_score: number | null
          consistency_score: number | null
          created_at: string
          duplicate_count: number | null
          form_id: string
          geofence_violations: number | null
          id: string
          incomplete_submissions: number | null
          last_checked_at: string | null
          overall_score: number | null
          project_id: string
          rapid_fire_count: number | null
          timeliness_score: number | null
          total_submissions: number | null
          updated_at: string
        }
        Insert: {
          accuracy_score?: number | null
          anomaly_count?: number | null
          avg_completion_time_seconds?: number | null
          checked_by?: string | null
          complete_submissions?: number | null
          completeness_score?: number | null
          consistency_score?: number | null
          created_at?: string
          duplicate_count?: number | null
          form_id: string
          geofence_violations?: number | null
          id?: string
          incomplete_submissions?: number | null
          last_checked_at?: string | null
          overall_score?: number | null
          project_id: string
          rapid_fire_count?: number | null
          timeliness_score?: number | null
          total_submissions?: number | null
          updated_at?: string
        }
        Update: {
          accuracy_score?: number | null
          anomaly_count?: number | null
          avg_completion_time_seconds?: number | null
          checked_by?: string | null
          complete_submissions?: number | null
          completeness_score?: number | null
          consistency_score?: number | null
          created_at?: string
          duplicate_count?: number | null
          form_id?: string
          geofence_violations?: number | null
          id?: string
          incomplete_submissions?: number | null
          last_checked_at?: string | null
          overall_score?: number | null
          project_id?: string
          rapid_fire_count?: number | null
          timeliness_score?: number | null
          total_submissions?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "data_quality_indicators_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "forms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "data_quality_indicators_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      data_quality_issues: {
        Row: {
          created_at: string
          description: string
          detected_at: string
          field_name: string | null
          form_id: string
          id: string
          issue_type: string
          project_id: string
          resolution: string | null
          resolved_at: string | null
          resolved_by: string | null
          severity: string
          status: string
          submission_id: string | null
          title: string
        }
        Insert: {
          created_at?: string
          description: string
          detected_at?: string
          field_name?: string | null
          form_id: string
          id?: string
          issue_type: string
          project_id: string
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          status?: string
          submission_id?: string | null
          title: string
        }
        Update: {
          created_at?: string
          description?: string
          detected_at?: string
          field_name?: string | null
          form_id?: string
          id?: string
          issue_type?: string
          project_id?: string
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          status?: string
          submission_id?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "data_quality_issues_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "forms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "data_quality_issues_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "data_quality_issues_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "form_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      device_sessions: {
        Row: {
          browser: string | null
          created_at: string
          device_description: string
          device_type: string
          first_seen_at: string
          id: string
          ip_address: string | null
          is_active: boolean
          last_seen_at: string
          os: string | null
          revoked_at: string | null
          revoked_by: string | null
          screen_resolution: string | null
          session_id: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          browser?: string | null
          created_at?: string
          device_description?: string
          device_type?: string
          first_seen_at?: string
          id?: string
          ip_address?: string | null
          is_active?: boolean
          last_seen_at?: string
          os?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          screen_resolution?: string | null
          session_id?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          browser?: string | null
          created_at?: string
          device_description?: string
          device_type?: string
          first_seen_at?: string
          id?: string
          ip_address?: string | null
          is_active?: boolean
          last_seen_at?: string
          os?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          screen_resolution?: string | null
          session_id?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      feedback: {
        Row: {
          admin_response: string | null
          category: string
          created_at: string
          id: string
          message: string
          rating: number | null
          status: string
          subject: string
          updated_at: string
          user_id: string
        }
        Insert: {
          admin_response?: string | null
          category?: string
          created_at?: string
          id?: string
          message: string
          rating?: number | null
          status?: string
          subject: string
          updated_at?: string
          user_id: string
        }
        Update: {
          admin_response?: string | null
          category?: string
          created_at?: string
          id?: string
          message?: string
          rating?: number | null
          status?: string
          subject?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
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
      form_daily_targets: {
        Row: {
          created_at: string
          daily_target: number
          form_id: string
          id: string
          is_active: boolean
          set_by: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          daily_target?: number
          form_id: string
          id?: string
          is_active?: boolean
          set_by: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          daily_target?: number
          form_id?: string
          id?: string
          is_active?: boolean
          set_by?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "form_daily_targets_form_id_fkey"
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
      form_tracking_events: {
        Row: {
          created_at: string
          event_data: Json
          event_type: string
          form_id: string
          id: string
          submission_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          event_data?: Json
          event_type: string
          form_id: string
          id?: string
          submission_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          event_data?: Json
          event_type?: string
          form_id?: string
          id?: string
          submission_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "form_tracking_events_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "forms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_tracking_events_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "form_submissions"
            referencedColumns: ["id"]
          },
        ]
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
      forum_likes: {
        Row: {
          created_at: string
          id: string
          post_id: string | null
          reply_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          post_id?: string | null
          reply_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          post_id?: string | null
          reply_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "forum_likes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "forum_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "forum_likes_reply_id_fkey"
            columns: ["reply_id"]
            isOneToOne: false
            referencedRelation: "forum_replies"
            referencedColumns: ["id"]
          },
        ]
      }
      forum_posts: {
        Row: {
          category: string
          content: string
          created_at: string
          id: string
          is_pinned: boolean
          likes_count: number
          replies_count: number
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          category?: string
          content: string
          created_at?: string
          id?: string
          is_pinned?: boolean
          likes_count?: number
          replies_count?: number
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: string
          content?: string
          created_at?: string
          id?: string
          is_pinned?: boolean
          likes_count?: number
          replies_count?: number
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      forum_replies: {
        Row: {
          content: string
          created_at: string
          id: string
          likes_count: number
          post_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          likes_count?: number
          post_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          likes_count?: number
          post_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "forum_replies_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "forum_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      geofence_alert_access: {
        Row: {
          created_at: string
          granted_by: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          granted_by: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          granted_by?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      mesh_sync_relays: {
        Row: {
          created_at: string
          enabled: boolean
          granted_by: string
          id: string
          notes: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          granted_by: string
          id?: string
          notes?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          granted_by?: string
          id?: string
          notes?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      mesh_sync_transfers: {
        Row: {
          forwarded_at: string
          id: string
          origin_user_id: string
          payload_size_bytes: number | null
          relay_user_id: string
          submission_id: string | null
          transport: string
        }
        Insert: {
          forwarded_at?: string
          id?: string
          origin_user_id: string
          payload_size_bytes?: number | null
          relay_user_id: string
          submission_id?: string | null
          transport?: string
        }
        Update: {
          forwarded_at?: string
          id?: string
          origin_user_id?: string
          payload_size_bytes?: number | null
          relay_user_id?: string
          submission_id?: string | null
          transport?: string
        }
        Relationships: []
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
      microplan_allocation_history: {
        Row: {
          action: string
          allocation_id: string | null
          campaign_type: string | null
          changed_at: string
          changed_by: string
          id: string
          lga: string
          medicine_name: string | null
          new_amount: number | null
          notes: string | null
          old_amount: number | null
          project_id: string
          state: string | null
          year: number | null
        }
        Insert: {
          action: string
          allocation_id?: string | null
          campaign_type?: string | null
          changed_at?: string
          changed_by: string
          id?: string
          lga: string
          medicine_name?: string | null
          new_amount?: number | null
          notes?: string | null
          old_amount?: number | null
          project_id: string
          state?: string | null
          year?: number | null
        }
        Update: {
          action?: string
          allocation_id?: string | null
          campaign_type?: string | null
          changed_at?: string
          changed_by?: string
          id?: string
          lga?: string
          medicine_name?: string | null
          new_amount?: number | null
          notes?: string | null
          old_amount?: number | null
          project_id?: string
          state?: string | null
          year?: number | null
        }
        Relationships: []
      }
      microplan_designation_assignments: {
        Row: {
          communities: string[]
          created_at: string
          designation: Database["public"]["Enums"]["microplan_designation"]
          flhfs: string[]
          granted_by: string
          id: string
          label: string | null
          lgas: string[]
          notes: string | null
          settlements: string[]
          states: string[]
          updated_at: string
          user_id: string
          wards: string[]
        }
        Insert: {
          communities?: string[]
          created_at?: string
          designation: Database["public"]["Enums"]["microplan_designation"]
          flhfs?: string[]
          granted_by: string
          id?: string
          label?: string | null
          lgas?: string[]
          notes?: string | null
          settlements?: string[]
          states?: string[]
          updated_at?: string
          user_id: string
          wards?: string[]
        }
        Update: {
          communities?: string[]
          created_at?: string
          designation?: Database["public"]["Enums"]["microplan_designation"]
          flhfs?: string[]
          granted_by?: string
          id?: string
          label?: string | null
          lgas?: string[]
          notes?: string | null
          settlements?: string[]
          states?: string[]
          updated_at?: string
          user_id?: string
          wards?: string[]
        }
        Relationships: []
      }
      microplan_entries: {
        Row: {
          accessibility: string | null
          campaign_type: string | null
          catchment_boundary: Json | null
          cdd_from_community: boolean | null
          cdd_names: string | null
          cdd_phone_numbers: string | null
          community_distance_to_flhf_km: number | null
          community_gps_accuracy: number | null
          community_latitude: number | null
          community_leader_name: string | null
          community_leader_phone: string | null
          community_longitude: number | null
          community_name: string
          created_at: string
          created_by: string
          estimated_adults_15_plus: number | null
          estimated_children_0_4: number | null
          estimated_children_5_14: number | null
          estimated_total_population: number | null
          flhf_incharge_name: string | null
          flhf_incharge_phone: string | null
          flhf_latitude: number | null
          flhf_longitude: number | null
          flhf_name: string
          id: string
          lga: string
          medicine_reversed_other: string | null
          medicine_reversed_to: string | null
          medicine_used: number | null
          notes: string | null
          number_of_households: number | null
          population_source: string | null
          project_id: string
          security_clearance: string | null
          settlement_distance_to_flhf_km: number | null
          settlement_latitude: number | null
          settlement_longitude: number | null
          settlement_mai_unguwa: string | null
          settlement_name: string | null
          state: string
          status: string
          terrain_type: string | null
          total_treated: number | null
          trachoma_0_5_months: number | null
          trachoma_15_plus: number | null
          trachoma_6m_6y: number | null
          trachoma_7_14y: number | null
          updated_at: string
          updated_by: string | null
          ward: string
          year_of_microplanning: number | null
        }
        Insert: {
          accessibility?: string | null
          campaign_type?: string | null
          catchment_boundary?: Json | null
          cdd_from_community?: boolean | null
          cdd_names?: string | null
          cdd_phone_numbers?: string | null
          community_distance_to_flhf_km?: number | null
          community_gps_accuracy?: number | null
          community_latitude?: number | null
          community_leader_name?: string | null
          community_leader_phone?: string | null
          community_longitude?: number | null
          community_name: string
          created_at?: string
          created_by: string
          estimated_adults_15_plus?: number | null
          estimated_children_0_4?: number | null
          estimated_children_5_14?: number | null
          estimated_total_population?: number | null
          flhf_incharge_name?: string | null
          flhf_incharge_phone?: string | null
          flhf_latitude?: number | null
          flhf_longitude?: number | null
          flhf_name: string
          id?: string
          lga: string
          medicine_reversed_other?: string | null
          medicine_reversed_to?: string | null
          medicine_used?: number | null
          notes?: string | null
          number_of_households?: number | null
          population_source?: string | null
          project_id: string
          security_clearance?: string | null
          settlement_distance_to_flhf_km?: number | null
          settlement_latitude?: number | null
          settlement_longitude?: number | null
          settlement_mai_unguwa?: string | null
          settlement_name?: string | null
          state: string
          status?: string
          terrain_type?: string | null
          total_treated?: number | null
          trachoma_0_5_months?: number | null
          trachoma_15_plus?: number | null
          trachoma_6m_6y?: number | null
          trachoma_7_14y?: number | null
          updated_at?: string
          updated_by?: string | null
          ward: string
          year_of_microplanning?: number | null
        }
        Update: {
          accessibility?: string | null
          campaign_type?: string | null
          catchment_boundary?: Json | null
          cdd_from_community?: boolean | null
          cdd_names?: string | null
          cdd_phone_numbers?: string | null
          community_distance_to_flhf_km?: number | null
          community_gps_accuracy?: number | null
          community_latitude?: number | null
          community_leader_name?: string | null
          community_leader_phone?: string | null
          community_longitude?: number | null
          community_name?: string
          created_at?: string
          created_by?: string
          estimated_adults_15_plus?: number | null
          estimated_children_0_4?: number | null
          estimated_children_5_14?: number | null
          estimated_total_population?: number | null
          flhf_incharge_name?: string | null
          flhf_incharge_phone?: string | null
          flhf_latitude?: number | null
          flhf_longitude?: number | null
          flhf_name?: string
          id?: string
          lga?: string
          medicine_reversed_other?: string | null
          medicine_reversed_to?: string | null
          medicine_used?: number | null
          notes?: string | null
          number_of_households?: number | null
          population_source?: string | null
          project_id?: string
          security_clearance?: string | null
          settlement_distance_to_flhf_km?: number | null
          settlement_latitude?: number | null
          settlement_longitude?: number | null
          settlement_mai_unguwa?: string | null
          settlement_name?: string | null
          state?: string
          status?: string
          terrain_type?: string | null
          total_treated?: number | null
          trachoma_0_5_months?: number | null
          trachoma_15_plus?: number | null
          trachoma_6m_6y?: number | null
          trachoma_7_14y?: number | null
          updated_at?: string
          updated_by?: string | null
          ward?: string
          year_of_microplanning?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "microplan_entries_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      microplan_form_access: {
        Row: {
          created_at: string
          granted_by: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          granted_by: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          granted_by?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      microplan_medicine_allocations: {
        Row: {
          amount: number
          campaign_type: string | null
          created_at: string
          created_by: string
          id: string
          lga: string
          medicine_name: string | null
          notes: string | null
          project_id: string
          state: string | null
          updated_at: string
          updated_by: string | null
          year: number
        }
        Insert: {
          amount?: number
          campaign_type?: string | null
          created_at?: string
          created_by: string
          id?: string
          lga: string
          medicine_name?: string | null
          notes?: string | null
          project_id: string
          state?: string | null
          updated_at?: string
          updated_by?: string | null
          year?: number
        }
        Update: {
          amount?: number
          campaign_type?: string | null
          created_at?: string
          created_by?: string
          id?: string
          lga?: string
          medicine_name?: string | null
          notes?: string | null
          project_id?: string
          state?: string | null
          updated_at?: string
          updated_by?: string | null
          year?: number
        }
        Relationships: []
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
      ntd_assessments: {
        Row: {
          answers: Json
          beneficiary_age: string | null
          beneficiary_name: string
          beneficiary_phone: string | null
          beneficiary_sex: string | null
          community: string | null
          confidence_score: number | null
          created_at: string
          id: string
          lga: string | null
          notes: string | null
          protocol_id: string
          protocol_name: string
          referral_action: string | null
          referral_urgency: string | null
          state: string | null
          suggested_stage: string | null
          user_id: string
          ward: string | null
        }
        Insert: {
          answers?: Json
          beneficiary_age?: string | null
          beneficiary_name: string
          beneficiary_phone?: string | null
          beneficiary_sex?: string | null
          community?: string | null
          confidence_score?: number | null
          created_at?: string
          id?: string
          lga?: string | null
          notes?: string | null
          protocol_id: string
          protocol_name: string
          referral_action?: string | null
          referral_urgency?: string | null
          state?: string | null
          suggested_stage?: string | null
          user_id: string
          ward?: string | null
        }
        Update: {
          answers?: Json
          beneficiary_age?: string | null
          beneficiary_name?: string
          beneficiary_phone?: string | null
          beneficiary_sex?: string | null
          community?: string | null
          confidence_score?: number | null
          created_at?: string
          id?: string
          lga?: string | null
          notes?: string | null
          protocol_id?: string
          protocol_name?: string
          referral_action?: string | null
          referral_urgency?: string | null
          state?: string | null
          suggested_stage?: string | null
          user_id?: string
          ward?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          alternate_email: string | null
          alternate_phone: string | null
          approval_status: string
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
          approval_status?: string
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
          approval_status?: string
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
      quiz_attempts: {
        Row: {
          answers: Json
          attempt_type: string
          completed_at: string | null
          created_at: string | null
          id: string
          percentage: number
          quiz_id: string
          score: number
          started_at: string | null
          total_points: number
          user_id: string
        }
        Insert: {
          answers?: Json
          attempt_type?: string
          completed_at?: string | null
          created_at?: string | null
          id?: string
          percentage?: number
          quiz_id: string
          score?: number
          started_at?: string | null
          total_points?: number
          user_id: string
        }
        Update: {
          answers?: Json
          attempt_type?: string
          completed_at?: string | null
          created_at?: string | null
          id?: string
          percentage?: number
          quiz_id?: string
          score?: number
          started_at?: string | null
          total_points?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quiz_attempts_quiz_id_fkey"
            columns: ["quiz_id"]
            isOneToOne: false
            referencedRelation: "quizzes"
            referencedColumns: ["id"]
          },
        ]
      }
      quiz_questions: {
        Row: {
          correct_answer: string
          created_at: string | null
          id: string
          options: Json
          points: number | null
          question_text: string
          question_type: string
          quiz_id: string
          sort_order: number | null
        }
        Insert: {
          correct_answer: string
          created_at?: string | null
          id?: string
          options?: Json
          points?: number | null
          question_text: string
          question_type?: string
          quiz_id: string
          sort_order?: number | null
        }
        Update: {
          correct_answer?: string
          created_at?: string | null
          id?: string
          options?: Json
          points?: number | null
          question_text?: string
          question_type?: string
          quiz_id?: string
          sort_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "quiz_questions_quiz_id_fkey"
            columns: ["quiz_id"]
            isOneToOne: false
            referencedRelation: "quizzes"
            referencedColumns: ["id"]
          },
        ]
      }
      quiz_user_assignments: {
        Row: {
          assigned_by: string
          created_at: string
          id: string
          quiz_id: string
          user_id: string
        }
        Insert: {
          assigned_by: string
          created_at?: string
          id?: string
          quiz_id: string
          user_id: string
        }
        Update: {
          assigned_by?: string
          created_at?: string
          id?: string
          quiz_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quiz_user_assignments_quiz_id_fkey"
            columns: ["quiz_id"]
            isOneToOne: false
            referencedRelation: "quizzes"
            referencedColumns: ["id"]
          },
        ]
      }
      quizzes: {
        Row: {
          created_at: string | null
          created_by: string
          description: string | null
          id: string
          is_published: boolean | null
          passing_score: number | null
          post_test_datetime: string | null
          post_test_delay_days: number
          project_id: string
          time_limit_minutes: number | null
          title: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by: string
          description?: string | null
          id?: string
          is_published?: boolean | null
          passing_score?: number | null
          post_test_datetime?: string | null
          post_test_delay_days?: number
          project_id: string
          time_limit_minutes?: number | null
          title: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string
          description?: string | null
          id?: string
          is_published?: boolean | null
          passing_score?: number | null
          post_test_datetime?: string | null
          post_test_delay_days?: number
          project_id?: string
          time_limit_minutes?: number | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quizzes_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      submission_versions: {
        Row: {
          change_summary: string | null
          change_type: string
          changed_at: string
          changed_by: string
          data: Json
          id: string
          submission_id: string
          version_number: number
        }
        Insert: {
          change_summary?: string | null
          change_type?: string
          changed_at?: string
          changed_by: string
          data: Json
          id?: string
          submission_id: string
          version_number?: number
        }
        Update: {
          change_summary?: string | null
          change_type?: string
          changed_at?: string
          changed_by?: string
          data?: Json
          id?: string
          submission_id?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "submission_versions_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "form_submissions"
            referencedColumns: ["id"]
          },
        ]
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
      voice_profiles: {
        Row: {
          consent_at: string | null
          consent_status: string
          consent_text: string | null
          created_at: string
          donor_email: string
          donor_name: string
          donor_user_id: string
          id: string
          is_active: boolean
          requested_at: string
          requested_by: string
          sample_duration_ms: number | null
          sample_path: string | null
          updated_at: string
          voice_features: Json | null
        }
        Insert: {
          consent_at?: string | null
          consent_status?: string
          consent_text?: string | null
          created_at?: string
          donor_email: string
          donor_name: string
          donor_user_id: string
          id?: string
          is_active?: boolean
          requested_at?: string
          requested_by: string
          sample_duration_ms?: number | null
          sample_path?: string | null
          updated_at?: string
          voice_features?: Json | null
        }
        Update: {
          consent_at?: string | null
          consent_status?: string
          consent_text?: string | null
          created_at?: string
          donor_email?: string
          donor_name?: string
          donor_user_id?: string
          id?: string
          is_active?: boolean
          requested_at?: string
          requested_by?: string
          sample_duration_ms?: number | null
          sample_path?: string | null
          updated_at?: string
          voice_features?: Json | null
        }
        Relationships: []
      }
      vr_simulation_access: {
        Row: {
          created_at: string
          granted_by: string
          id: string
          simulation_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          granted_by: string
          id?: string
          simulation_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          granted_by?: string
          id?: string
          simulation_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vr_simulation_access_simulation_id_fkey"
            columns: ["simulation_id"]
            isOneToOne: false
            referencedRelation: "vr_simulations"
            referencedColumns: ["id"]
          },
        ]
      }
      vr_simulations: {
        Row: {
          created_at: string
          created_by: string
          description: string | null
          form_id: string | null
          id: string
          name: string
          project_id: string | null
          scenario_data: Json
          simulation_type: string
          updated_at: string
          video_url: string | null
        }
        Insert: {
          created_at?: string
          created_by: string
          description?: string | null
          form_id?: string | null
          id?: string
          name: string
          project_id?: string | null
          scenario_data?: Json
          simulation_type?: string
          updated_at?: string
          video_url?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string | null
          form_id?: string | null
          id?: string
          name?: string
          project_id?: string | null
          scenario_data?: Json
          simulation_type?: string
          updated_at?: string
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vr_simulations_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "forms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vr_simulations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
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
      user_has_microplan_scope: {
        Args: {
          _community: string
          _flhf: string
          _lga: string
          _settlement: string
          _state: string
          _user_id: string
          _ward: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "super_admin" | "systems_admin" | "user"
      microplan_designation:
        | "state_supervisor"
        | "lga_supervisor"
        | "ward_supervisor"
        | "flhf"
        | "cdd"
        | "partner"
        | "other"
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
      microplan_designation: [
        "state_supervisor",
        "lga_supervisor",
        "ward_supervisor",
        "flhf",
        "cdd",
        "partner",
        "other",
      ],
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

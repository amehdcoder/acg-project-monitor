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
      account_creation_emails: {
        Row: {
          created_at: string
          html: string | null
          id: string
          log_id: string
          subject: string | null
        }
        Insert: {
          created_at?: string
          html?: string | null
          id?: string
          log_id: string
          subject?: string | null
        }
        Update: {
          created_at?: string
          html?: string | null
          id?: string
          log_id?: string
          subject?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "account_creation_emails_log_id_fkey"
            columns: ["log_id"]
            isOneToOne: false
            referencedRelation: "account_creation_log"
            referencedColumns: ["id"]
          },
        ]
      }
      account_creation_log: {
        Row: {
          account_created: boolean
          created_at: string
          created_by: string | null
          designation: string | null
          designation_label: string | null
          email_sent: boolean
          error: string | null
          id: string
          recipient_email: string
          recipient_name: string | null
        }
        Insert: {
          account_created?: boolean
          created_at?: string
          created_by?: string | null
          designation?: string | null
          designation_label?: string | null
          email_sent?: boolean
          error?: string | null
          id?: string
          recipient_email: string
          recipient_name?: string | null
        }
        Update: {
          account_created?: boolean
          created_at?: string
          created_by?: string | null
          designation?: string | null
          designation_label?: string | null
          email_sent?: boolean
          error?: string | null
          id?: string
          recipient_email?: string
          recipient_name?: string | null
        }
        Relationships: []
      }
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
      antidepressant_stock: {
        Row: {
          created_at: string
          created_by: string | null
          drug_class: string
          drug_name: string
          facility_id: string
          id: string
          project_id: string | null
          quantity_on_hand: number
          reorder_level: number
          unit: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          drug_class?: string
          drug_name: string
          facility_id: string
          id?: string
          project_id?: string | null
          quantity_on_hand?: number
          reorder_level?: number
          unit?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          drug_class?: string
          drug_name?: string
          facility_id?: string
          id?: string
          project_id?: string | null
          quantity_on_hand?: number
          reorder_level?: number
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "antidepressant_stock_facility_id_fkey"
            columns: ["facility_id"]
            isOneToOne: false
            referencedRelation: "health_facilities"
            referencedColumns: ["id"]
          },
        ]
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
      attendance_participants: {
        Row: {
          created_at: string
          email: string | null
          facility: string | null
          full_name: string
          id: string
          is_active: boolean
          lga: string | null
          organization: string | null
          participant_code: string
          phone: string | null
          photo_url: string | null
          project_id: string | null
          registered_by: string | null
          role: string | null
          sex: string | null
          state: string | null
          updated_at: string
          ward: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          facility?: string | null
          full_name: string
          id?: string
          is_active?: boolean
          lga?: string | null
          organization?: string | null
          participant_code: string
          phone?: string | null
          photo_url?: string | null
          project_id?: string | null
          registered_by?: string | null
          role?: string | null
          sex?: string | null
          state?: string | null
          updated_at?: string
          ward?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          facility?: string | null
          full_name?: string
          id?: string
          is_active?: boolean
          lga?: string | null
          organization?: string | null
          participant_code?: string
          phone?: string | null
          photo_url?: string | null
          project_id?: string | null
          registered_by?: string | null
          role?: string | null
          sex?: string | null
          state?: string | null
          updated_at?: string
          ward?: string | null
        }
        Relationships: []
      }
      attendance_records: {
        Row: {
          created_at: string
          id: string
          marked_at: string | null
          marked_by: string | null
          method: string | null
          participant_id: string
          remarks: string | null
          session_id: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          marked_at?: string | null
          marked_by?: string | null
          method?: string | null
          participant_id: string
          remarks?: string | null
          session_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          marked_at?: string | null
          marked_by?: string | null
          method?: string | null
          participant_id?: string
          remarks?: string | null
          session_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_records_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "attendance_participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_records_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "attendance_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_sessions: {
        Row: {
          activity_name: string
          community: string | null
          created_at: string
          created_by: string | null
          description: string | null
          end_time: string | null
          expected_count: number | null
          facilitator: string | null
          id: string
          lga: string | null
          location: string | null
          project_id: string | null
          session_code: string
          session_date: string
          session_type: string
          start_time: string | null
          state: string | null
          status: string
          updated_at: string
          ward: string | null
        }
        Insert: {
          activity_name: string
          community?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_time?: string | null
          expected_count?: number | null
          facilitator?: string | null
          id?: string
          lga?: string | null
          location?: string | null
          project_id?: string | null
          session_code: string
          session_date?: string
          session_type?: string
          start_time?: string | null
          state?: string | null
          status?: string
          updated_at?: string
          ward?: string | null
        }
        Update: {
          activity_name?: string
          community?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_time?: string | null
          expected_count?: number | null
          facilitator?: string | null
          id?: string
          lga?: string | null
          location?: string | null
          project_id?: string | null
          session_code?: string
          session_date?: string
          session_type?: string
          start_time?: string | null
          state?: string | null
          status?: string
          updated_at?: string
          ward?: string | null
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
      case_attachments: {
        Row: {
          case_id: string
          created_at: string
          file_name: string
          file_type: string | null
          file_url: string
          id: string
          uploaded_by: string | null
        }
        Insert: {
          case_id: string
          created_at?: string
          file_name: string
          file_type?: string | null
          file_url: string
          id?: string
          uploaded_by?: string | null
        }
        Update: {
          case_id?: string
          created_at?: string
          file_name?: string
          file_type?: string | null
          file_url?: string
          id?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "case_attachments_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      case_notes: {
        Row: {
          attachment_url: string | null
          author_id: string | null
          case_id: string
          created_at: string
          id: string
          note: string
          visibility: string
        }
        Insert: {
          attachment_url?: string | null
          author_id?: string | null
          case_id: string
          created_at?: string
          id?: string
          note: string
          visibility?: string
        }
        Update: {
          attachment_url?: string | null
          author_id?: string | null
          case_id?: string
          created_at?: string
          id?: string
          note?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "case_notes_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      case_permissions: {
        Row: {
          case_id: string
          created_at: string
          granted_by: string | null
          id: string
          share_level: string
          shared_with_user_id: string | null
        }
        Insert: {
          case_id: string
          created_at?: string
          granted_by?: string | null
          id?: string
          share_level?: string
          shared_with_user_id?: string | null
        }
        Update: {
          case_id?: string
          created_at?: string
          granted_by?: string | null
          id?: string
          share_level?: string
          shared_with_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "case_permissions_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      case_referrals: {
        Row: {
          accepted_by: string | null
          assigned_to: string | null
          case_id: string
          completed_at: string | null
          created_at: string
          created_by: string | null
          destination: string | null
          expected_date: string | null
          id: string
          notes: string | null
          priority: string | null
          reason: string | null
          referral_type: string | null
          status: string
          updated_at: string
        }
        Insert: {
          accepted_by?: string | null
          assigned_to?: string | null
          case_id: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          destination?: string | null
          expected_date?: string | null
          id?: string
          notes?: string | null
          priority?: string | null
          reason?: string | null
          referral_type?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          accepted_by?: string | null
          assigned_to?: string | null
          case_id?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          destination?: string | null
          expected_date?: string | null
          id?: string
          notes?: string | null
          priority?: string | null
          reason?: string | null
          referral_type?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "case_referrals_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      case_relationships: {
        Row: {
          child_case_id: string
          created_at: string
          created_by: string | null
          id: string
          parent_case_id: string
          relationship_type: string
        }
        Insert: {
          child_case_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          parent_case_id: string
          relationship_type?: string
        }
        Update: {
          child_case_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          parent_case_id?: string
          relationship_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "case_relationships_child_case_id_fkey"
            columns: ["child_case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_relationships_parent_case_id_fkey"
            columns: ["parent_case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      case_status_history: {
        Row: {
          case_id: string
          changed_by: string | null
          created_at: string
          id: string
          new_status: string
          old_status: string | null
          reason: string | null
        }
        Insert: {
          case_id: string
          changed_by?: string | null
          created_at?: string
          id?: string
          new_status: string
          old_status?: string | null
          reason?: string | null
        }
        Update: {
          case_id?: string
          changed_by?: string | null
          created_at?: string
          id?: string
          new_status?: string
          old_status?: string | null
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "case_status_history_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      case_tasks: {
        Row: {
          assigned_to: string | null
          case_id: string
          completed_at: string | null
          completed_by: string | null
          created_at: string
          created_by: string | null
          description: string | null
          due_date: string | null
          id: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          case_id: string
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          case_id?: string
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "case_tasks_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      case_types: {
        Row: {
          color: string | null
          created_at: string
          created_by: string
          description: string | null
          follow_up_schedule: Json | null
          icon: string | null
          id: string
          label: string
          name: string
          project_id: string
          properties: Json | null
          sharing_default: string | null
          status_workflow: Json | null
          updated_at: string
          workflow_rules: Json | null
        }
        Insert: {
          color?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          follow_up_schedule?: Json | null
          icon?: string | null
          id?: string
          label: string
          name: string
          project_id: string
          properties?: Json | null
          sharing_default?: string | null
          status_workflow?: Json | null
          updated_at?: string
          workflow_rules?: Json | null
        }
        Update: {
          color?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          follow_up_schedule?: Json | null
          icon?: string | null
          id?: string
          label?: string
          name?: string
          project_id?: string
          properties?: Json | null
          sharing_default?: string | null
          status_workflow?: Json | null
          updated_at?: string
          workflow_rules?: Json | null
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
          closure_reason: string | null
          created_at: string
          id: string
          last_modified_at: string
          last_modified_by: string
          name: string
          next_follow_up_date: string | null
          opened_at: string
          opened_by: string
          owner_id: string
          parent_case_id: string | null
          project_id: string
          properties: Json | null
          reference_code: string | null
          risk_level: string | null
          sharing_level: string | null
          status: string
        }
        Insert: {
          case_type_id: string
          closed_at?: string | null
          closed_by?: string | null
          closure_reason?: string | null
          created_at?: string
          id?: string
          last_modified_at?: string
          last_modified_by: string
          name: string
          next_follow_up_date?: string | null
          opened_at?: string
          opened_by: string
          owner_id: string
          parent_case_id?: string | null
          project_id: string
          properties?: Json | null
          reference_code?: string | null
          risk_level?: string | null
          sharing_level?: string | null
          status?: string
        }
        Update: {
          case_type_id?: string
          closed_at?: string | null
          closed_by?: string | null
          closure_reason?: string | null
          created_at?: string
          id?: string
          last_modified_at?: string
          last_modified_by?: string
          name?: string
          next_follow_up_date?: string | null
          opened_at?: string
          opened_by?: string
          owner_id?: string
          parent_case_id?: string | null
          project_id?: string
          properties?: Json | null
          reference_code?: string | null
          risk_level?: string | null
          sharing_level?: string | null
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
            foreignKeyName: "cases_parent_case_id_fkey"
            columns: ["parent_case_id"]
            isOneToOne: false
            referencedRelation: "cases"
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
      ces_audit_log: {
        Row: {
          action: string
          actor_id: string
          created_at: string
          id: string
          lat: number | null
          lng: number | null
          payload: Json | null
          survey_id: string
        }
        Insert: {
          action: string
          actor_id: string
          created_at?: string
          id?: string
          lat?: number | null
          lng?: number | null
          payload?: Json | null
          survey_id: string
        }
        Update: {
          action?: string
          actor_id?: string
          created_at?: string
          id?: string
          lat?: number | null
          lng?: number | null
          payload?: Json | null
          survey_id?: string
        }
        Relationships: []
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
          version: number
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
          version?: number
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
          version?: number
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
      ces_feature_labels: {
        Row: {
          confidence: number | null
          corrected_label: string
          created_at: string
          created_by: string
          feature_id: string
          feature_type: string
          geometry: Json
          id: string
          notes: string | null
          original_label: string
          survey_id: string
          updated_at: string
        }
        Insert: {
          confidence?: number | null
          corrected_label: string
          created_at?: string
          created_by: string
          feature_id: string
          feature_type: string
          geometry?: Json
          id?: string
          notes?: string | null
          original_label: string
          survey_id: string
          updated_at?: string
        }
        Update: {
          confidence?: number | null
          corrected_label?: string
          created_at?: string
          created_by?: string
          feature_id?: string
          feature_type?: string
          geometry?: Json
          id?: string
          notes?: string | null
          original_label?: string
          survey_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ces_feature_labels_survey_id_fkey"
            columns: ["survey_id"]
            isOneToOne: false
            referencedRelation: "ces_surveys"
            referencedColumns: ["id"]
          },
        ]
      }
      ces_fenced_communities: {
        Row: {
          area_m2: number | null
          center_lat: number | null
          center_lng: number | null
          community_name: string
          created_at: string
          created_by: string
          flhf_name: string | null
          id: string
          lga: string | null
          perimeter_coords: Json
          project_id: string
          settlement_name: string | null
          source_session_id: string | null
          source_survey_id: string | null
          state: string | null
          updated_at: string
          ward: string | null
        }
        Insert: {
          area_m2?: number | null
          center_lat?: number | null
          center_lng?: number | null
          community_name: string
          created_at?: string
          created_by: string
          flhf_name?: string | null
          id?: string
          lga?: string | null
          perimeter_coords?: Json
          project_id: string
          settlement_name?: string | null
          source_session_id?: string | null
          source_survey_id?: string | null
          state?: string | null
          updated_at?: string
          ward?: string | null
        }
        Update: {
          area_m2?: number | null
          center_lat?: number | null
          center_lng?: number | null
          community_name?: string
          created_at?: string
          created_by?: string
          flhf_name?: string | null
          id?: string
          lga?: string | null
          perimeter_coords?: Json
          project_id?: string
          settlement_name?: string | null
          source_session_id?: string | null
          source_survey_id?: string | null
          state?: string | null
          updated_at?: string
          ward?: string | null
        }
        Relationships: []
      }
      ces_gap_clusters: {
        Row: {
          absent_count: number
          ai_confidence_score: number
          ai_label: string | null
          centroid_lat: number
          centroid_lng: number
          cluster_key: string
          created_at: string
          dominant_cause: string
          household_count: number
          household_ids: Json
          id: string
          not_treated_count: number
          project_id: string | null
          recommended_action: string | null
          refused_count: number
          status: string
          survey_id: string | null
          updated_at: string
        }
        Insert: {
          absent_count?: number
          ai_confidence_score?: number
          ai_label?: string | null
          centroid_lat: number
          centroid_lng: number
          cluster_key: string
          created_at?: string
          dominant_cause: string
          household_count: number
          household_ids?: Json
          id?: string
          not_treated_count?: number
          project_id?: string | null
          recommended_action?: string | null
          refused_count?: number
          status?: string
          survey_id?: string | null
          updated_at?: string
        }
        Update: {
          absent_count?: number
          ai_confidence_score?: number
          ai_label?: string | null
          centroid_lat?: number
          centroid_lng?: number
          cluster_key?: string
          created_at?: string
          dominant_cause?: string
          household_count?: number
          household_ids?: Json
          id?: string
          not_treated_count?: number
          project_id?: string | null
          recommended_action?: string | null
          refused_count?: number
          status?: string
          survey_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      ces_household_visits: {
        Row: {
          commodity: string | null
          coverage_status: string
          created_at: string
          created_by: string
          device_id: string | null
          duplicate_reason: string | null
          eligible_persons: number | null
          evidence_hash: string | null
          gps_accuracy: number | null
          gps_snapshot: Json | null
          hh_number: string
          id: string
          interviewer_name: string | null
          latitude: number
          longitude: number
          notes: string | null
          photo_url: string | null
          segment_id: string | null
          segment_label: string | null
          survey_id: string
          synced_at: string | null
          treated_persons: number | null
          treatment_took_place: boolean | null
          version: number
          visited_at: string
        }
        Insert: {
          commodity?: string | null
          coverage_status?: string
          created_at?: string
          created_by: string
          device_id?: string | null
          duplicate_reason?: string | null
          eligible_persons?: number | null
          evidence_hash?: string | null
          gps_accuracy?: number | null
          gps_snapshot?: Json | null
          hh_number: string
          id?: string
          interviewer_name?: string | null
          latitude: number
          longitude: number
          notes?: string | null
          photo_url?: string | null
          segment_id?: string | null
          segment_label?: string | null
          survey_id: string
          synced_at?: string | null
          treated_persons?: number | null
          treatment_took_place?: boolean | null
          version?: number
          visited_at?: string
        }
        Update: {
          commodity?: string | null
          coverage_status?: string
          created_at?: string
          created_by?: string
          device_id?: string | null
          duplicate_reason?: string | null
          eligible_persons?: number | null
          evidence_hash?: string | null
          gps_accuracy?: number | null
          gps_snapshot?: Json | null
          hh_number?: string
          id?: string
          interviewer_name?: string | null
          latitude?: number
          longitude?: number
          notes?: string | null
          photo_url?: string | null
          segment_id?: string | null
          segment_label?: string | null
          survey_id?: string
          synced_at?: string | null
          treated_persons?: number | null
          treatment_took_place?: boolean | null
          version?: number
          visited_at?: string
        }
        Relationships: []
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
          version: number
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
          version?: number
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
          version?: number
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
      ces_mopup_assignments: {
        Row: {
          assigned_team_name: string
          assigned_user_id: string | null
          cluster_id: string | null
          completed_hh_count: number
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          priority: string
          resources: string | null
          status: string
          survey_id: string | null
          target_date: string
          target_hh_count: number
          updated_at: string
        }
        Insert: {
          assigned_team_name: string
          assigned_user_id?: string | null
          cluster_id?: string | null
          completed_hh_count?: number
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          priority?: string
          resources?: string | null
          status?: string
          survey_id?: string | null
          target_date: string
          target_hh_count?: number
          updated_at?: string
        }
        Update: {
          assigned_team_name?: string
          assigned_user_id?: string | null
          cluster_id?: string | null
          completed_hh_count?: number
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          priority?: string
          resources?: string | null
          status?: string
          survey_id?: string | null
          target_date?: string
          target_hh_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ces_mopup_assignments_cluster_id_fkey"
            columns: ["cluster_id"]
            isOneToOne: false
            referencedRelation: "ces_gap_clusters"
            referencedColumns: ["id"]
          },
        ]
      }
      ces_peer_validation_note_audits: {
        Row: {
          edited_at: string
          edited_by: string
          id: string
          new_notes: string | null
          previous_notes: string | null
          validation_id: string
        }
        Insert: {
          edited_at?: string
          edited_by: string
          id?: string
          new_notes?: string | null
          previous_notes?: string | null
          validation_id: string
        }
        Update: {
          edited_at?: string
          edited_by?: string
          id?: string
          new_notes?: string | null
          previous_notes?: string | null
          validation_id?: string
        }
        Relationships: []
      }
      ces_peer_validations: {
        Row: {
          agreement_pct: number | null
          created_at: string
          households_agreed: number | null
          households_revisited: number | null
          id: string
          mode: string
          notes: string | null
          survey_id: string
          validator_id: string
          verdict: string
        }
        Insert: {
          agreement_pct?: number | null
          created_at?: string
          households_agreed?: number | null
          households_revisited?: number | null
          id?: string
          mode: string
          notes?: string | null
          survey_id: string
          validator_id: string
          verdict: string
        }
        Update: {
          agreement_pct?: number | null
          created_at?: string
          households_agreed?: number | null
          households_revisited?: number | null
          id?: string
          mode?: string
          notes?: string | null
          survey_id?: string
          validator_id?: string
          verdict?: string
        }
        Relationships: []
      }
      ces_role_assignments: {
        Row: {
          created_at: string
          granted_by: string
          id: string
          project_id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          granted_by: string
          id?: string
          project_id: string
          role: string
          user_id: string
        }
        Update: {
          created_at?: string
          granted_by?: string
          id?: string
          project_id?: string
          role?: string
          user_id?: string
        }
        Relationships: []
      }
      ces_segment_resamples: {
        Row: {
          created_at: string
          created_by: string
          id: string
          reason: string
          segment_label: string
          survey_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          reason: string
          segment_label: string
          survey_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          reason?: string
          segment_label?: string
          survey_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ces_segment_resamples_survey_id_fkey"
            columns: ["survey_id"]
            isOneToOne: false
            referencedRelation: "ces_surveys"
            referencedColumns: ["id"]
          },
        ]
      }
      ces_segments: {
        Row: {
          centroid_lat: number | null
          centroid_lng: number | null
          color: string | null
          coverage_pct: number | null
          created_at: string
          est_hh: number | null
          hh_treated_in_segment: number | null
          id: string
          is_selected: boolean | null
          label: string
          polygon: Json
          sampled_hh: number | null
          segment_status: string | null
          survey_id: string
          total_hh_in_segment: number | null
          treated_hh: number | null
          updated_at: string
          version: number
          weight: number | null
        }
        Insert: {
          centroid_lat?: number | null
          centroid_lng?: number | null
          color?: string | null
          coverage_pct?: number | null
          created_at?: string
          est_hh?: number | null
          hh_treated_in_segment?: number | null
          id?: string
          is_selected?: boolean | null
          label: string
          polygon?: Json
          sampled_hh?: number | null
          segment_status?: string | null
          survey_id: string
          total_hh_in_segment?: number | null
          treated_hh?: number | null
          updated_at?: string
          version?: number
          weight?: number | null
        }
        Update: {
          centroid_lat?: number | null
          centroid_lng?: number | null
          color?: string | null
          coverage_pct?: number | null
          created_at?: string
          est_hh?: number | null
          hh_treated_in_segment?: number | null
          id?: string
          is_selected?: boolean | null
          label?: string
          polygon?: Json
          sampled_hh?: number | null
          segment_status?: string | null
          survey_id?: string
          total_hh_in_segment?: number | null
          treated_hh?: number | null
          updated_at?: string
          version?: number
          weight?: number | null
        }
        Relationships: []
      }
      ces_surveys: {
        Row: {
          center_lat: number | null
          center_lng: number | null
          ci_lower_95: number | null
          ci_lower_99: number | null
          ci_upper_95: number | null
          ci_upper_99: number | null
          community_name: string | null
          created_at: string
          created_by: string
          design_effect: number | null
          device_id: string | null
          est_hh_ai: number | null
          est_hh_rooftop_source: string | null
          est_hh_user: number | null
          feature_buildings_count: number | null
          feature_labeled_count: number | null
          feature_named_roads_count: number | null
          feature_roads_count: number | null
          feature_uncertain_count: number | null
          feature_waterways_count: number | null
          flhf_name: string | null
          form_id: string | null
          id: string
          inferred_coverage_pct: number | null
          lga: string | null
          name: string
          outside_microplan: boolean
          outside_microplan_reason: string | null
          perimeter_coords: Json | null
          precision_value: number | null
          project_id: string | null
          segments_count: number | null
          selected_segment_ids: Json | null
          settlement_id: string | null
          settlement_name: string | null
          state: string | null
          status: string
          supervisor_qc_at: string | null
          supervisor_qc_by: string | null
          survey_date: string
          target_sample_n: number | null
          updated_at: string
          version: number
          ward: string | null
        }
        Insert: {
          center_lat?: number | null
          center_lng?: number | null
          ci_lower_95?: number | null
          ci_lower_99?: number | null
          ci_upper_95?: number | null
          ci_upper_99?: number | null
          community_name?: string | null
          created_at?: string
          created_by: string
          design_effect?: number | null
          device_id?: string | null
          est_hh_ai?: number | null
          est_hh_rooftop_source?: string | null
          est_hh_user?: number | null
          feature_buildings_count?: number | null
          feature_labeled_count?: number | null
          feature_named_roads_count?: number | null
          feature_roads_count?: number | null
          feature_uncertain_count?: number | null
          feature_waterways_count?: number | null
          flhf_name?: string | null
          form_id?: string | null
          id?: string
          inferred_coverage_pct?: number | null
          lga?: string | null
          name: string
          outside_microplan?: boolean
          outside_microplan_reason?: string | null
          perimeter_coords?: Json | null
          precision_value?: number | null
          project_id?: string | null
          segments_count?: number | null
          selected_segment_ids?: Json | null
          settlement_id?: string | null
          settlement_name?: string | null
          state?: string | null
          status?: string
          supervisor_qc_at?: string | null
          supervisor_qc_by?: string | null
          survey_date?: string
          target_sample_n?: number | null
          updated_at?: string
          version?: number
          ward?: string | null
        }
        Update: {
          center_lat?: number | null
          center_lng?: number | null
          ci_lower_95?: number | null
          ci_lower_99?: number | null
          ci_upper_95?: number | null
          ci_upper_99?: number | null
          community_name?: string | null
          created_at?: string
          created_by?: string
          design_effect?: number | null
          device_id?: string | null
          est_hh_ai?: number | null
          est_hh_rooftop_source?: string | null
          est_hh_user?: number | null
          feature_buildings_count?: number | null
          feature_labeled_count?: number | null
          feature_named_roads_count?: number | null
          feature_roads_count?: number | null
          feature_uncertain_count?: number | null
          feature_waterways_count?: number | null
          flhf_name?: string | null
          form_id?: string | null
          id?: string
          inferred_coverage_pct?: number | null
          lga?: string | null
          name?: string
          outside_microplan?: boolean
          outside_microplan_reason?: string | null
          perimeter_coords?: Json | null
          precision_value?: number | null
          project_id?: string | null
          segments_count?: number | null
          selected_segment_ids?: Json | null
          settlement_id?: string | null
          settlement_name?: string | null
          state?: string | null
          status?: string
          supervisor_qc_at?: string | null
          supervisor_qc_by?: string | null
          survey_date?: string
          target_sample_n?: number | null
          updated_at?: string
          version?: number
          ward?: string | null
        }
        Relationships: []
      }
      ces_witness_logs: {
        Row: {
          created_at: string
          household_id: string | null
          id: string
          survey_id: string | null
          witness_device_hash: string
          witness_lat: number | null
          witness_long: number | null
          witness_timestamp: string
        }
        Insert: {
          created_at?: string
          household_id?: string | null
          id?: string
          survey_id?: string | null
          witness_device_hash: string
          witness_lat?: number | null
          witness_long?: number | null
          witness_timestamp?: string
        }
        Update: {
          created_at?: string
          household_id?: string | null
          id?: string
          survey_id?: string | null
          witness_device_hash?: string
          witness_lat?: number | null
          witness_long?: number | null
          witness_timestamp?: string
        }
        Relationships: []
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
      custom_banks: {
        Row: {
          code: string | null
          created_at: string
          created_by: string | null
          id: string
          label: string
          value: string
        }
        Insert: {
          code?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          label: string
          value: string
        }
        Update: {
          code?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          label?: string
          value?: string
        }
        Relationships: []
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
      form_bulk_permissions: {
        Row: {
          can_export: boolean
          can_import: boolean
          created_at: string
          granted_by: string | null
          id: string
          user_id: string
        }
        Insert: {
          can_export?: boolean
          can_import?: boolean
          created_at?: string
          granted_by?: string | null
          id?: string
          user_id: string
        }
        Update: {
          can_export?: boolean
          can_import?: boolean
          created_at?: string
          granted_by?: string | null
          id?: string
          user_id?: string
        }
        Relationships: []
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
      health_facilities: {
        Row: {
          address: string | null
          contact_person: string | null
          contact_phone: string | null
          created_at: string
          created_by: string | null
          facility_type: Database["public"]["Enums"]["facility_type"]
          id: string
          is_active: boolean
          latitude: number | null
          lga: string | null
          longitude: number | null
          name: string
          project_id: string | null
          state: string | null
          updated_at: string
          ward: string | null
        }
        Insert: {
          address?: string | null
          contact_person?: string | null
          contact_phone?: string | null
          created_at?: string
          created_by?: string | null
          facility_type?: Database["public"]["Enums"]["facility_type"]
          id?: string
          is_active?: boolean
          latitude?: number | null
          lga?: string | null
          longitude?: number | null
          name: string
          project_id?: string | null
          state?: string | null
          updated_at?: string
          ward?: string | null
        }
        Update: {
          address?: string | null
          contact_person?: string | null
          contact_phone?: string | null
          created_at?: string
          created_by?: string | null
          facility_type?: Database["public"]["Enums"]["facility_type"]
          id?: string
          is_active?: boolean
          latitude?: number | null
          lga?: string | null
          longitude?: number | null
          name?: string
          project_id?: string | null
          state?: string | null
          updated_at?: string
          ward?: string | null
        }
        Relationships: []
      }
      inactive_login_attempts: {
        Row: {
          attempted_user_id: string | null
          created_at: string
          email: string
          id: string
          ip_address: string | null
          metadata: Json
          mode: string
          reason: string
          user_agent: string | null
        }
        Insert: {
          attempted_user_id?: string | null
          created_at?: string
          email: string
          id?: string
          ip_address?: string | null
          metadata?: Json
          mode?: string
          reason: string
          user_agent?: string | null
        }
        Update: {
          attempted_user_id?: string | null
          created_at?: string
          email?: string
          id?: string
          ip_address?: string | null
          metadata?: Json
          mode?: string
          reason?: string
          user_agent?: string | null
        }
        Relationships: []
      }
      meeting_action_points: {
        Row: {
          action_point: string
          completed_at: string | null
          created_at: string
          created_by: string
          due_date: string
          id: string
          last_reminder_stage: string
          meeting_date: string | null
          meeting_title: string
          meeting_type: string | null
          non_implementation_reason: string | null
          priority: string
          programme_area: string
          progress_notes: string | null
          project_id: string | null
          reason_provided_at: string | null
          responsible_email: string | null
          responsible_person: string
          responsible_user_id: string | null
          start_date: string | null
          status: string
          updated_at: string
        }
        Insert: {
          action_point: string
          completed_at?: string | null
          created_at?: string
          created_by: string
          due_date: string
          id?: string
          last_reminder_stage?: string
          meeting_date?: string | null
          meeting_title: string
          meeting_type?: string | null
          non_implementation_reason?: string | null
          priority?: string
          programme_area?: string
          progress_notes?: string | null
          project_id?: string | null
          reason_provided_at?: string | null
          responsible_email?: string | null
          responsible_person: string
          responsible_user_id?: string | null
          start_date?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          action_point?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string
          due_date?: string
          id?: string
          last_reminder_stage?: string
          meeting_date?: string | null
          meeting_title?: string
          meeting_type?: string | null
          non_implementation_reason?: string | null
          priority?: string
          programme_area?: string
          progress_notes?: string | null
          project_id?: string | null
          reason_provided_at?: string | null
          responsible_email?: string | null
          responsible_person?: string
          responsible_user_id?: string | null
          start_date?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      mesh_signaling: {
        Row: {
          created_at: string
          created_by: string
          expires_at: string
          from_peer: string
          id: string
          kind: string
          payload: Json
          room_id: string
          to_peer: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string
          expires_at?: string
          from_peer: string
          id?: string
          kind: string
          payload: Json
          room_id: string
          to_peer?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          expires_at?: string
          from_peer?: string
          id?: string
          kind?: string
          payload?: Json
          room_id?: string
          to_peer?: string | null
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
          reviewed: boolean
          reviewed_at: string | null
          reviewed_by: string | null
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
          reviewed?: boolean
          reviewed_at?: string | null
          reviewed_by?: string | null
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
          reviewed?: boolean
          reviewed_at?: string | null
          reviewed_by?: string | null
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
          community_lat_override: number | null
          community_latitude: number | null
          community_leader_name: string | null
          community_leader_phone: string | null
          community_lng_override: number | null
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
          flhf_lat_override: number | null
          flhf_latitude: number | null
          flhf_lng_override: number | null
          flhf_longitude: number | null
          flhf_name: string
          gps_overridden_at: string | null
          gps_overridden_by: string | null
          households_treated: number | null
          id: string
          lga: string
          medicine_reversed_other: string | null
          medicine_reversed_to: string | null
          medicine_used: number | null
          notes: string | null
          number_of_households: number | null
          population_source: string | null
          project_id: string
          pwd_albinism: number | null
          pwd_communication: number | null
          pwd_hearing: number | null
          pwd_intellectual: number | null
          pwd_physical: number | null
          pwd_selfcare: number | null
          pwd_total: number | null
          pwd_visual: number | null
          security_clearance: string | null
          settlement_distance_to_flhf_km: number | null
          settlement_lat_override: number | null
          settlement_latitude: number | null
          settlement_lng_override: number | null
          settlement_longitude: number | null
          settlement_mai_unguwa: string | null
          settlement_name: string | null
          state: string
          status: string
          terrain_type: string | null
          total_households_reported: number | null
          total_households_treated: number | null
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
          community_lat_override?: number | null
          community_latitude?: number | null
          community_leader_name?: string | null
          community_leader_phone?: string | null
          community_lng_override?: number | null
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
          flhf_lat_override?: number | null
          flhf_latitude?: number | null
          flhf_lng_override?: number | null
          flhf_longitude?: number | null
          flhf_name: string
          gps_overridden_at?: string | null
          gps_overridden_by?: string | null
          households_treated?: number | null
          id?: string
          lga: string
          medicine_reversed_other?: string | null
          medicine_reversed_to?: string | null
          medicine_used?: number | null
          notes?: string | null
          number_of_households?: number | null
          population_source?: string | null
          project_id: string
          pwd_albinism?: number | null
          pwd_communication?: number | null
          pwd_hearing?: number | null
          pwd_intellectual?: number | null
          pwd_physical?: number | null
          pwd_selfcare?: number | null
          pwd_total?: number | null
          pwd_visual?: number | null
          security_clearance?: string | null
          settlement_distance_to_flhf_km?: number | null
          settlement_lat_override?: number | null
          settlement_latitude?: number | null
          settlement_lng_override?: number | null
          settlement_longitude?: number | null
          settlement_mai_unguwa?: string | null
          settlement_name?: string | null
          state: string
          status?: string
          terrain_type?: string | null
          total_households_reported?: number | null
          total_households_treated?: number | null
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
          community_lat_override?: number | null
          community_latitude?: number | null
          community_leader_name?: string | null
          community_leader_phone?: string | null
          community_lng_override?: number | null
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
          flhf_lat_override?: number | null
          flhf_latitude?: number | null
          flhf_lng_override?: number | null
          flhf_longitude?: number | null
          flhf_name?: string
          gps_overridden_at?: string | null
          gps_overridden_by?: string | null
          households_treated?: number | null
          id?: string
          lga?: string
          medicine_reversed_other?: string | null
          medicine_reversed_to?: string | null
          medicine_used?: number | null
          notes?: string | null
          number_of_households?: number | null
          population_source?: string | null
          project_id?: string
          pwd_albinism?: number | null
          pwd_communication?: number | null
          pwd_hearing?: number | null
          pwd_intellectual?: number | null
          pwd_physical?: number | null
          pwd_selfcare?: number | null
          pwd_total?: number | null
          pwd_visual?: number | null
          security_clearance?: string | null
          settlement_distance_to_flhf_km?: number | null
          settlement_lat_override?: number | null
          settlement_latitude?: number | null
          settlement_lng_override?: number | null
          settlement_longitude?: number | null
          settlement_mai_unguwa?: string | null
          settlement_name?: string | null
          state?: string
          status?: string
          terrain_type?: string | null
          total_households_reported?: number | null
          total_households_treated?: number | null
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
      microplan_missing_communities: {
        Row: {
          community_name: string
          created_at: string
          flagged_by: string | null
          flhf_name: string | null
          id: string
          lga: string
          note: string | null
          project_id: string | null
          resolved_at: string | null
          resolved_by: string | null
          settlement_name: string | null
          source: string
          state: string
          status: string
          updated_at: string
          ward: string
        }
        Insert: {
          community_name: string
          created_at?: string
          flagged_by?: string | null
          flhf_name?: string | null
          id?: string
          lga: string
          note?: string | null
          project_id?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          settlement_name?: string | null
          source?: string
          state: string
          status?: string
          updated_at?: string
          ward: string
        }
        Update: {
          community_name?: string
          created_at?: string
          flagged_by?: string | null
          flhf_name?: string | null
          id?: string
          lga?: string
          note?: string | null
          project_id?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          settlement_name?: string | null
          source?: string
          state?: string
          status?: string
          updated_at?: string
          ward?: string
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
      office_form_approvers: {
        Row: {
          approver_role: string
          assigned_by: string | null
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          approver_role: string
          assigned_by?: string | null
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          approver_role?: string
          assigned_by?: string | null
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      office_form_submissions: {
        Row: {
          approval_status: string
          approved_at: string | null
          approved_by: string | null
          approved_items: Json | null
          approver_action: string | null
          approver_notes: string | null
          attachments: Json | null
          created_at: string
          data: Json
          form_code: string
          id: string
          next_step: string | null
          project_id: string | null
          reference_code: string | null
          status: string
          submitted_by: string | null
          updated_at: string
        }
        Insert: {
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          approved_items?: Json | null
          approver_action?: string | null
          approver_notes?: string | null
          attachments?: Json | null
          created_at?: string
          data?: Json
          form_code: string
          id?: string
          next_step?: string | null
          project_id?: string | null
          reference_code?: string | null
          status?: string
          submitted_by?: string | null
          updated_at?: string
        }
        Update: {
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          approved_items?: Json | null
          approver_action?: string | null
          approver_notes?: string | null
          attachments?: Json | null
          created_at?: string
          data?: Json
          form_code?: string
          id?: string
          next_step?: string | null
          project_id?: string | null
          reference_code?: string | null
          status?: string
          submitted_by?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "office_form_submissions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_referrals: {
        Row: {
          accepted_by: string | null
          clinical_summary: string | null
          created_at: string
          from_facility_id: string | null
          id: string
          patient_id: string
          patient_name: string | null
          project_id: string | null
          reason: string
          referred_by: string | null
          resolved_at: string | null
          status: Database["public"]["Enums"]["referral_status"]
          to_facility_id: string
          updated_at: string
          urgency: string
        }
        Insert: {
          accepted_by?: string | null
          clinical_summary?: string | null
          created_at?: string
          from_facility_id?: string | null
          id?: string
          patient_id: string
          patient_name?: string | null
          project_id?: string | null
          reason: string
          referred_by?: string | null
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["referral_status"]
          to_facility_id: string
          updated_at?: string
          urgency?: string
        }
        Update: {
          accepted_by?: string | null
          clinical_summary?: string | null
          created_at?: string
          from_facility_id?: string | null
          id?: string
          patient_id?: string
          patient_name?: string | null
          project_id?: string | null
          reason?: string
          referred_by?: string | null
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["referral_status"]
          to_facility_id?: string
          updated_at?: string
          urgency?: string
        }
        Relationships: [
          {
            foreignKeyName: "patient_referrals_from_facility_id_fkey"
            columns: ["from_facility_id"]
            isOneToOne: false
            referencedRelation: "health_facilities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_referrals_to_facility_id_fkey"
            columns: ["to_facility_id"]
            isOneToOne: false
            referencedRelation: "health_facilities"
            referencedColumns: ["id"]
          },
        ]
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
          has_seen_tour: boolean
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
          has_seen_tour?: boolean
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
          has_seen_tour?: boolean
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
          scope_lgas: string[]
          scope_states: string[]
          scope_wards: string[]
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
          scope_lgas?: string[]
          scope_states?: string[]
          scope_wards?: string[]
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
          scope_lgas?: string[]
          scope_states?: string[]
          scope_wards?: string[]
          start_date?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      proximity_conversations: {
        Row: {
          created_at: string
          ended_by: string | null
          id: string
          status: string
          updated_at: string
          user_a: string
          user_b: string
        }
        Insert: {
          created_at?: string
          ended_by?: string | null
          id?: string
          status?: string
          updated_at?: string
          user_a: string
          user_b: string
        }
        Update: {
          created_at?: string
          ended_by?: string | null
          id?: string
          status?: string
          updated_at?: string
          user_a?: string
          user_b?: string
        }
        Relationships: []
      }
      proximity_messages: {
        Row: {
          body: string
          conversation_id: string
          created_at: string
          delivered_at: string | null
          id: string
          read_at: string | null
          recipient_id: string
          sender_id: string
        }
        Insert: {
          body: string
          conversation_id: string
          created_at?: string
          delivered_at?: string | null
          id?: string
          read_at?: string | null
          recipient_id: string
          sender_id: string
        }
        Update: {
          body?: string
          conversation_id?: string
          created_at?: string
          delivered_at?: string | null
          id?: string
          read_at?: string | null
          recipient_id?: string
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "proximity_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "proximity_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      proximity_presence: {
        Row: {
          display_name: string
          enabled: boolean
          lat: number | null
          lng: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          display_name?: string
          enabled?: boolean
          lat?: number | null
          lng?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          display_name?: string
          enabled?: boolean
          lat?: number | null
          lng?: number | null
          updated_at?: string
          user_id?: string
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
      standard_assessment_submissions: {
        Row: {
          activity_description: string | null
          created_at: string
          data: Json
          demographics: Json
          disability_flags: Json | null
          form_code: string
          id: string
          location: Json | null
          project_id: string | null
          score: number | null
          session_id: string | null
          severity: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          activity_description?: string | null
          created_at?: string
          data?: Json
          demographics?: Json
          disability_flags?: Json | null
          form_code: string
          id?: string
          location?: Json | null
          project_id?: string | null
          score?: number | null
          session_id?: string | null
          severity?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          activity_description?: string | null
          created_at?: string
          data?: Json
          demographics?: Json
          disability_flags?: Json | null
          form_code?: string
          id?: string
          location?: Json | null
          project_id?: string | null
          score?: number | null
          session_id?: string | null
          severity?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "standard_assessment_submissions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      standard_form_disabled: {
        Row: {
          disabled_at: string
          disabled_by: string | null
          form_code: string
          reason: string | null
        }
        Insert: {
          disabled_at?: string
          disabled_by?: string | null
          form_code: string
          reason?: string | null
        }
        Update: {
          disabled_at?: string
          disabled_by?: string | null
          form_code?: string
          reason?: string | null
        }
        Relationships: []
      }
      stock_approver_assignments: {
        Row: {
          approver_user_id: string
          assigned_by: string | null
          created_at: string
          facility_id: string | null
          id: string
        }
        Insert: {
          approver_user_id: string
          assigned_by?: string | null
          created_at?: string
          facility_id?: string | null
          id?: string
        }
        Update: {
          approver_user_id?: string
          assigned_by?: string | null
          created_at?: string
          facility_id?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_approver_assignments_facility_id_fkey"
            columns: ["facility_id"]
            isOneToOne: false
            referencedRelation: "health_facilities"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_movements: {
        Row: {
          balance_after: number | null
          created_at: string
          drug_name: string
          facility_id: string
          id: string
          movement_type: Database["public"]["Enums"]["stock_movement_type"]
          notes: string | null
          patient_id: string | null
          patient_name: string | null
          performed_by: string | null
          quantity: number
          stock_id: string
        }
        Insert: {
          balance_after?: number | null
          created_at?: string
          drug_name: string
          facility_id: string
          id?: string
          movement_type: Database["public"]["Enums"]["stock_movement_type"]
          notes?: string | null
          patient_id?: string | null
          patient_name?: string | null
          performed_by?: string | null
          quantity: number
          stock_id: string
        }
        Update: {
          balance_after?: number | null
          created_at?: string
          drug_name?: string
          facility_id?: string
          id?: string
          movement_type?: Database["public"]["Enums"]["stock_movement_type"]
          notes?: string | null
          patient_id?: string | null
          patient_name?: string | null
          performed_by?: string | null
          quantity?: number
          stock_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_facility_id_fkey"
            columns: ["facility_id"]
            isOneToOne: false
            referencedRelation: "health_facilities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_stock_id_fkey"
            columns: ["stock_id"]
            isOneToOne: false
            referencedRelation: "antidepressant_stock"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_requests: {
        Row: {
          approver_id: string | null
          created_at: string
          drug_name: string
          facility_id: string
          id: string
          notes: string | null
          quantity_requested: number
          reason: Database["public"]["Enums"]["stock_request_reason"]
          requested_by: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: Database["public"]["Enums"]["stock_request_status"]
          stock_id: string | null
          updated_at: string
        }
        Insert: {
          approver_id?: string | null
          created_at?: string
          drug_name: string
          facility_id: string
          id?: string
          notes?: string | null
          quantity_requested: number
          reason?: Database["public"]["Enums"]["stock_request_reason"]
          requested_by?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: Database["public"]["Enums"]["stock_request_status"]
          stock_id?: string | null
          updated_at?: string
        }
        Update: {
          approver_id?: string | null
          created_at?: string
          drug_name?: string
          facility_id?: string
          id?: string
          notes?: string | null
          quantity_requested?: number
          reason?: Database["public"]["Enums"]["stock_request_reason"]
          requested_by?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: Database["public"]["Enums"]["stock_request_status"]
          stock_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_requests_facility_id_fkey"
            columns: ["facility_id"]
            isOneToOne: false
            referencedRelation: "health_facilities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_requests_stock_id_fkey"
            columns: ["stock_id"]
            isOneToOne: false
            referencedRelation: "antidepressant_stock"
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
      uprp_submissions: {
        Row: {
          created_at: string
          documents: Json
          id: string
          location: Json | null
          name_of_data_collector: string
          participants: Json
          project_id: string | null
          training_center: string
          type_of_training: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          documents?: Json
          id?: string
          location?: Json | null
          name_of_data_collector: string
          participants?: Json
          project_id?: string | null
          training_center: string
          type_of_training: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          documents?: Json
          id?: string
          location?: Json | null
          name_of_data_collector?: string
          participants?: Json
          project_id?: string | null
          training_center?: string
          type_of_training?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "uprp_submissions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      user_form_assignments: {
        Row: {
          assigned_by: string
          created_at: string
          expires_at: string | null
          form_id: string
          id: string
          starts_at: string | null
          user_id: string
        }
        Insert: {
          assigned_by: string
          created_at?: string
          expires_at?: string | null
          form_id: string
          id?: string
          starts_at?: string | null
          user_id: string
        }
        Update: {
          assigned_by?: string
          created_at?: string
          expires_at?: string | null
          form_id?: string
          id?: string
          starts_at?: string | null
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
      user_google_oauth_tokens: {
        Row: {
          access_token: string
          created_at: string
          expires_at: string | null
          google_email: string | null
          id: string
          provider: string
          refresh_token: string | null
          scope: string | null
          token_type: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token: string
          created_at?: string
          expires_at?: string | null
          google_email?: string | null
          id?: string
          provider?: string
          refresh_token?: string | null
          scope?: string | null
          token_type?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string
          created_at?: string
          expires_at?: string | null
          google_email?: string | null
          id?: string
          provider?: string
          refresh_token?: string | null
          scope?: string | null
          token_type?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_page_access: {
        Row: {
          created_at: string
          expires_at: string | null
          granted_by: string
          id: string
          page_id: string
          starts_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          granted_by: string
          id?: string
          page_id: string
          starts_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          granted_by?: string
          id?: string
          page_id?: string
          starts_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_project_assignments: {
        Row: {
          assigned_by: string
          created_at: string
          expires_at: string | null
          id: string
          project_id: string
          starts_at: string | null
          user_id: string
        }
        Insert: {
          assigned_by: string
          created_at?: string
          expires_at?: string | null
          id?: string
          project_id: string
          starts_at?: string | null
          user_id: string
        }
        Update: {
          assigned_by?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          project_id?: string
          starts_at?: string | null
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
      user_standard_form_assignments: {
        Row: {
          assigned_by: string | null
          created_at: string
          form_code: string
          id: string
          user_id: string
        }
        Insert: {
          assigned_by?: string | null
          created_at?: string
          form_code: string
          id?: string
          user_id: string
        }
        Update: {
          assigned_by?: string | null
          created_at?: string
          form_code?: string
          id?: string
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
      workplan_activities: {
        Row: {
          activity: string
          comment: string | null
          completed_at: string | null
          created_at: string
          created_by: string
          due_date: string
          id: string
          last_reminder_stage: string
          non_implementation_reason: string | null
          priority: string
          progress: number
          quarters: string[]
          reason_provided_at: string | null
          responsible_email: string | null
          responsible_person: string | null
          result: string
          sort_order: number
          start_date: string | null
          status: string
          support_needed: boolean
          target: string | null
          updated_at: string
          workplan_id: string
        }
        Insert: {
          activity: string
          comment?: string | null
          completed_at?: string | null
          created_at?: string
          created_by: string
          due_date: string
          id?: string
          last_reminder_stage?: string
          non_implementation_reason?: string | null
          priority?: string
          progress?: number
          quarters?: string[]
          reason_provided_at?: string | null
          responsible_email?: string | null
          responsible_person?: string | null
          result?: string
          sort_order?: number
          start_date?: string | null
          status?: string
          support_needed?: boolean
          target?: string | null
          updated_at?: string
          workplan_id: string
        }
        Update: {
          activity?: string
          comment?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string
          due_date?: string
          id?: string
          last_reminder_stage?: string
          non_implementation_reason?: string | null
          priority?: string
          progress?: number
          quarters?: string[]
          reason_provided_at?: string | null
          responsible_email?: string | null
          responsible_person?: string | null
          result?: string
          sort_order?: number
          start_date?: string | null
          status?: string
          support_needed?: boolean
          target?: string | null
          updated_at?: string
          workplan_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workplan_activities_workplan_id_fkey"
            columns: ["workplan_id"]
            isOneToOne: false
            referencedRelation: "workplans"
            referencedColumns: ["id"]
          },
        ]
      }
      workplans: {
        Row: {
          created_at: string
          created_by: string
          developed_by: string | null
          donor_partner: string | null
          end_year: number
          id: string
          notes: string | null
          programme_area: string
          project_id: string | null
          project_no: string | null
          start_year: number
          status: string
          updated_at: string
          working_title: string
        }
        Insert: {
          created_at?: string
          created_by: string
          developed_by?: string | null
          donor_partner?: string | null
          end_year?: number
          id?: string
          notes?: string | null
          programme_area?: string
          project_id?: string | null
          project_no?: string | null
          start_year?: number
          status?: string
          updated_at?: string
          working_title: string
        }
        Update: {
          created_at?: string
          created_by?: string
          developed_by?: string | null
          donor_partner?: string | null
          end_year?: number
          id?: string
          notes?: string | null
          programme_area?: string
          project_id?: string | null
          project_no?: string | null
          start_year?: number
          status?: string
          updated_at?: string
          working_title?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_access_case: {
        Args: { _case_id: string; _user_id: string }
        Returns: boolean
      }
      can_access_form_dashboard: {
        Args: { _form_id: string; _user_id: string }
        Returns: boolean
      }
      can_access_microplanning: { Args: { _user_id: string }; Returns: boolean }
      can_bulk_data: {
        Args: { _action: string; _user_id: string }
        Returns: boolean
      }
      can_edit_dashboard: { Args: { _user_id: string }; Returns: boolean }
      can_locate_community: {
        Args: { _project_id: string; _user_id: string }
        Returns: boolean
      }
      can_peer_validate_survey: {
        Args: { _survey_id: string; _user_id: string }
        Returns: boolean
      }
      can_survey_households: {
        Args: { _project_id: string; _user_id: string }
        Returns: boolean
      }
      get_project_unread_count: {
        Args: { p_project_id: string; p_user_id: string }
        Returns: number
      }
      get_quiz_questions_for_attempt: {
        Args: { p_quiz_id: string }
        Returns: {
          id: string
          options: Json
          points: number
          question_text: string
          question_type: string
          quiz_id: string
          sort_order: number
        }[]
      }
      get_unread_count: {
        Args: { p_chat_group_id: string; p_user_id: string }
        Returns: number
      }
      has_ces_role: {
        Args: { _project_id: string; _role: string; _user_id: string }
        Returns: boolean
      }
      has_field_designation: { Args: { _user_id: string }; Returns: boolean }
      has_page_access: {
        Args: { _page_id: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      is_assignment_active: {
        Args: { _expires_at: string; _starts_at: string }
        Returns: boolean
      }
      is_chat_group_admin: {
        Args: { _chat_group_id: string; _user_id: string }
        Returns: boolean
      }
      is_chat_group_member: {
        Args: { _chat_group_id: string; _user_id: string }
        Returns: boolean
      }
      is_office_approver: {
        Args: { _role: string; _user_id: string }
        Returns: boolean
      }
      is_owner: { Args: { _user_id: string }; Returns: boolean }
      office_form_approver_role: {
        Args: { _form_code: string }
        Returns: string
      }
      owner_clear_microplanning: {
        Args: {
          _lga?: string
          _project_id?: string
          _state?: string
          _year?: number
        }
        Returns: Json
      }
      owner_factory_reset: { Args: { _confirm: string }; Returns: Json }
      start_proximity_conversation: {
        Args: { _other: string }
        Returns: string
      }
      submit_quiz_attempt: {
        Args: {
          p_answers: Json
          p_attempt_type: string
          p_quiz_id: string
          p_started_at: string
        }
        Returns: {
          attempt_id: string
          percentage: number
          score: number
          total_points: number
        }[]
      }
      submit_witness_verification: {
        Args: {
          _device_hash: string
          _household_id: string
          _lat: number
          _lng: number
          _survey_id: string
          _window_hours?: number
        }
        Returns: Json
      }
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
      facility_type: "phc" | "secondary" | "tertiary"
      microplan_designation:
        | "state_supervisor"
        | "lga_supervisor"
        | "ward_supervisor"
        | "flhf"
        | "cdd"
        | "partner"
        | "other"
      referral_status: "initiated" | "accepted" | "declined" | "completed"
      stock_movement_type: "receipt" | "dispense" | "adjustment"
      stock_request_reason: "low" | "out"
      stock_request_status: "pending" | "approved" | "declined" | "fulfilled"
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
        | "adhoc_user"
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
      facility_type: ["phc", "secondary", "tertiary"],
      microplan_designation: [
        "state_supervisor",
        "lga_supervisor",
        "ward_supervisor",
        "flhf",
        "cdd",
        "partner",
        "other",
      ],
      referral_status: ["initiated", "accepted", "declined", "completed"],
      stock_movement_type: ["receipt", "dispense", "adjustment"],
      stock_request_reason: ["low", "out"],
      stock_request_status: ["pending", "approved", "declined", "fulfilled"],
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
        "adhoc_user",
      ],
    },
  },
} as const

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
      ai_chat_conversations: {
        Row: {
          chat_type: string
          created_at: string
          id: string
          session_id: string
          synced_search_id: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          chat_type?: string
          created_at?: string
          id?: string
          session_id?: string
          synced_search_id?: string | null
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          chat_type?: string
          created_at?: string
          id?: string
          session_id?: string
          synced_search_id?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_chat_conversations_synced_search_id_fkey"
            columns: ["synced_search_id"]
            isOneToOne: false
            referencedRelation: "searches"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_chat_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          metadata: Json | null
          role: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          metadata?: Json | null
          role: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_chat_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "ai_chat_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      api_slots: {
        Row: {
          created_at: string | null
          id: string
          is_locked: boolean
          locked_at: string | null
          locked_by_search_id: string | null
          slot_name: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_locked?: boolean
          locked_at?: string | null
          locked_by_search_id?: string | null
          slot_name: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_locked?: boolean
          locked_at?: string | null
          locked_by_search_id?: string | null
          slot_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "api_slots_locked_by_search_id_fkey"
            columns: ["locked_by_search_id"]
            isOneToOne: false
            referencedRelation: "searches"
            referencedColumns: ["id"]
          },
        ]
      }
      bulk_search_drafts: {
        Row: {
          created_at: string
          grid_data: Json
          id: string
          name: string
          row_count: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          grid_data?: Json
          id?: string
          name?: string
          row_count?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          grid_data?: Json
          id?: string
          name?: string
          row_count?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      credit_usage: {
        Row: {
          aleads_credits: number
          apollo_credits: number
          apollo_email_credits: number
          apollo_phone_credits: number
          cognism_credits: number
          contacts_count: number
          created_at: string
          enriched_contacts_count: number
          grand_total_credits: number
          id: string
          lusha_credits: number
          search_id: string | null
          theirstack_credits: number
          updated_at: string
          user_id: string
        }
        Insert: {
          aleads_credits?: number
          apollo_credits?: number
          apollo_email_credits?: number
          apollo_phone_credits?: number
          cognism_credits?: number
          contacts_count?: number
          created_at?: string
          enriched_contacts_count?: number
          grand_total_credits?: number
          id?: string
          lusha_credits?: number
          search_id?: string | null
          theirstack_credits?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          aleads_credits?: number
          apollo_credits?: number
          apollo_email_credits?: number
          apollo_phone_credits?: number
          cognism_credits?: number
          contacts_count?: number
          created_at?: string
          enriched_contacts_count?: number
          grand_total_credits?: number
          id?: string
          lusha_credits?: number
          search_id?: string | null
          theirstack_credits?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_usage_search_id_fkey"
            columns: ["search_id"]
            isOneToOne: false
            referencedRelation: "searches"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          completed_at: string | null
          created_at: string
          error_message: string | null
          id: string
          result_file_url: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          result_file_url?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          result_file_url?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      master_contacts: {
        Row: {
          domain: string | null
          email: string | null
          email_2: string | null
          first_name: string | null
          first_seen_at: string
          id: string
          last_name: string | null
          last_updated_at: string
          linkedin: string | null
          organization: string | null
          person_id: string | null
          phone_1: string | null
          phone_2: string | null
          source_search_id: string | null
          source_user_id: string | null
          title: string | null
        }
        Insert: {
          domain?: string | null
          email?: string | null
          email_2?: string | null
          first_name?: string | null
          first_seen_at?: string
          id?: string
          last_name?: string | null
          last_updated_at?: string
          linkedin?: string | null
          organization?: string | null
          person_id?: string | null
          phone_1?: string | null
          phone_2?: string | null
          source_search_id?: string | null
          source_user_id?: string | null
          title?: string | null
        }
        Update: {
          domain?: string | null
          email?: string | null
          email_2?: string | null
          first_name?: string | null
          first_seen_at?: string
          id?: string
          last_name?: string | null
          last_updated_at?: string
          linkedin?: string | null
          organization?: string | null
          person_id?: string | null
          phone_1?: string | null
          phone_2?: string | null
          source_search_id?: string | null
          source_user_id?: string | null
          title?: string | null
        }
        Relationships: []
      }
      password_reset_tokens: {
        Row: {
          created_at: string
          email: string
          expires_at: string
          id: string
          token_hash: string
          used_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          email: string
          expires_at: string
          id?: string
          token_hash: string
          used_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          token_hash?: string
          used_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "password_reset_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string | null
          email: string
          enrichment_limit: number
          enrichment_used: number
          first_name: string | null
          full_name: string | null
          id: string
          last_name: string | null
          requires_password_reset: boolean | null
          updated_at: string | null
          workspace_id: string | null
        }
        Insert: {
          created_at?: string | null
          email: string
          enrichment_limit?: number
          enrichment_used?: number
          first_name?: string | null
          full_name?: string | null
          id: string
          last_name?: string | null
          requires_password_reset?: boolean | null
          updated_at?: string | null
          workspace_id?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string
          enrichment_limit?: number
          enrichment_used?: number
          first_name?: string | null
          full_name?: string | null
          id?: string
          last_name?: string | null
          requires_password_reset?: boolean | null
          updated_at?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      request_queue: {
        Row: {
          created_at: string | null
          entry_type: string
          id: string
          search_data: Json
          search_id: string
          status: string
        }
        Insert: {
          created_at?: string | null
          entry_type: string
          id?: string
          search_data: Json
          search_id: string
          status?: string
        }
        Update: {
          created_at?: string | null
          entry_type?: string
          id?: string
          search_data?: Json
          search_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "request_queue_search_id_fkey"
            columns: ["search_id"]
            isOneToOne: false
            referencedRelation: "searches"
            referencedColumns: ["id"]
          },
        ]
      }
      search_results: {
        Row: {
          company_name: string
          contact_data: Json
          created_at: string
          domain: string | null
          id: string
          result_type: string | null
          search_id: string
          updated_at: string
        }
        Insert: {
          company_name: string
          contact_data?: Json
          created_at?: string
          domain?: string | null
          id?: string
          result_type?: string | null
          search_id: string
          updated_at?: string
        }
        Update: {
          company_name?: string
          contact_data?: Json
          created_at?: string
          domain?: string | null
          id?: string
          result_type?: string | null
          search_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "search_results_search_id_fkey"
            columns: ["search_id"]
            isOneToOne: false
            referencedRelation: "searches"
            referencedColumns: ["id"]
          },
        ]
      }
      searches: {
        Row: {
          company_name: string | null
          created_at: string | null
          domain: string | null
          error_message: string | null
          excel_file_name: string | null
          functions: string[] | null
          geography: string | null
          grid_data: Json | null
          id: string
          result_url: string | null
          results_per_function: number | null
          search_type: string
          seniority: string[] | null
          status: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          company_name?: string | null
          created_at?: string | null
          domain?: string | null
          error_message?: string | null
          excel_file_name?: string | null
          functions?: string[] | null
          geography?: string | null
          grid_data?: Json | null
          id?: string
          result_url?: string | null
          results_per_function?: number | null
          search_type: string
          seniority?: string[] | null
          status?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          company_name?: string | null
          created_at?: string | null
          domain?: string | null
          error_message?: string | null
          excel_file_name?: string | null
          functions?: string[] | null
          geography?: string | null
          grid_data?: Json | null
          id?: string
          result_url?: string | null
          results_per_function?: number | null
          search_type?: string
          seniority?: string[] | null
          status?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      webhook_settings: {
        Row: {
          created_at: string | null
          id: string
          updated_at: string | null
          user_id: string
          webhook_url: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          updated_at?: string | null
          user_id: string
          webhook_url: string
        }
        Update: {
          created_at?: string | null
          id?: string
          updated_at?: string | null
          user_id?: string
          webhook_url?: string
        }
        Relationships: []
      }
      workspaces: {
        Row: {
          company_address: string | null
          company_name: string
          created_at: string
          id: string
          primary_contact_email: string | null
          primary_contact_name: string
          primary_contact_phone: string | null
          updated_at: string
        }
        Insert: {
          company_address?: string | null
          company_name: string
          created_at?: string
          id?: string
          primary_contact_email?: string | null
          primary_contact_name: string
          primary_contact_phone?: string | null
          updated_at?: string
        }
        Update: {
          company_address?: string | null
          company_name?: string
          created_at?: string
          id?: string
          primary_contact_email?: string | null
          primary_contact_name?: string
          primary_contact_phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      acquire_api_slot: { Args: { p_search_id: string }; Returns: string }
      acquire_processing_flag: {
        Args: { p_search_id: string }
        Returns: boolean
      }
      get_queue_position: { Args: { p_search_id: string }; Returns: number }
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      increment_enrichment_used: {
        Args: { p_count: number; p_user_id: string }
        Returns: undefined
      }
      release_api_slot: {
        Args: { p_search_id: string; p_slot_name: string }
        Returns: {
          next_entry_type: string
          next_search_data: Json
          next_search_id: string
        }[]
      }
      release_processing_flag: {
        Args: { p_search_id: string }
        Returns: {
          next_entry_type: string
          next_search_data: Json
          next_search_id: string
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "user"
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
      app_role: ["admin", "user"],
    },
  },
} as const

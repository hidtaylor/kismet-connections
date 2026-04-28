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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      card_scans: {
        Row: {
          contact_id: string | null
          created_at: string
          id: string
          image_url: string
          ocr_json: Json | null
          parsed_json: Json | null
          status: Database["public"]["Enums"]["scan_status"]
          user_id: string
        }
        Insert: {
          contact_id?: string | null
          created_at?: string
          id?: string
          image_url: string
          ocr_json?: Json | null
          parsed_json?: Json | null
          status?: Database["public"]["Enums"]["scan_status"]
          user_id: string
        }
        Update: {
          contact_id?: string | null
          created_at?: string
          id?: string
          image_url?: string
          ocr_json?: Json | null
          parsed_json?: Json | null
          status?: Database["public"]["Enums"]["scan_status"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "card_scans_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_tags: {
        Row: {
          contact_id: string
          tag_id: string
          user_id: string
        }
        Insert: {
          contact_id: string
          tag_id: string
          user_id: string
        }
        Update: {
          contact_id?: string
          tag_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_tags_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          cadence: Database["public"]["Enums"]["cadence_type"]
          company: string | null
          created_at: string
          emails: Json
          first_name: string | null
          full_name: string
          id: string
          last_contact_at: string | null
          last_name: string | null
          linkedin_url: string | null
          location: string | null
          notes_summary: string | null
          phones: Json
          photo_url: string | null
          source: Database["public"]["Enums"]["contact_source"]
          title: string | null
          twitter_url: string | null
          updated_at: string
          user_id: string
          website_url: string | null
        }
        Insert: {
          cadence?: Database["public"]["Enums"]["cadence_type"]
          company?: string | null
          created_at?: string
          emails?: Json
          first_name?: string | null
          full_name: string
          id?: string
          last_contact_at?: string | null
          last_name?: string | null
          linkedin_url?: string | null
          location?: string | null
          notes_summary?: string | null
          phones?: Json
          photo_url?: string | null
          source?: Database["public"]["Enums"]["contact_source"]
          title?: string | null
          twitter_url?: string | null
          updated_at?: string
          user_id: string
          website_url?: string | null
        }
        Update: {
          cadence?: Database["public"]["Enums"]["cadence_type"]
          company?: string | null
          created_at?: string
          emails?: Json
          first_name?: string | null
          full_name?: string
          id?: string
          last_contact_at?: string | null
          last_name?: string | null
          linkedin_url?: string | null
          location?: string | null
          notes_summary?: string | null
          phones?: Json
          photo_url?: string | null
          source?: Database["public"]["Enums"]["contact_source"]
          title?: string | null
          twitter_url?: string | null
          updated_at?: string
          user_id?: string
          website_url?: string | null
        }
        Relationships: []
      }
      embeddings: {
        Row: {
          content: string
          created_at: string
          embedding: string | null
          id: string
          source_id: string
          source_type: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          embedding?: string | null
          id?: string
          source_id: string
          source_type: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          embedding?: string | null
          id?: string
          source_id?: string
          source_type?: string
          user_id?: string
        }
        Relationships: []
      }
      interaction_contacts: {
        Row: {
          contact_id: string
          interaction_id: string
          user_id: string
        }
        Insert: {
          contact_id: string
          interaction_id: string
          user_id: string
        }
        Update: {
          contact_id?: string
          interaction_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "interaction_contacts_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interaction_contacts_interaction_id_fkey"
            columns: ["interaction_id"]
            isOneToOne: false
            referencedRelation: "interactions"
            referencedColumns: ["id"]
          },
        ]
      }
      interactions: {
        Row: {
          created_at: string
          ended_at: string | null
          id: string
          location: string | null
          occurred_at: string
          source_external_id: string | null
          source_provider: string | null
          summary: string | null
          title: string
          type: Database["public"]["Enums"]["interaction_type"]
          user_id: string
        }
        Insert: {
          created_at?: string
          ended_at?: string | null
          id?: string
          location?: string | null
          occurred_at?: string
          source_external_id?: string | null
          source_provider?: string | null
          summary?: string | null
          title: string
          type?: Database["public"]["Enums"]["interaction_type"]
          user_id: string
        }
        Update: {
          created_at?: string
          ended_at?: string | null
          id?: string
          location?: string | null
          occurred_at?: string
          source_external_id?: string | null
          source_provider?: string | null
          summary?: string | null
          title?: string
          type?: Database["public"]["Enums"]["interaction_type"]
          user_id?: string
        }
        Relationships: []
      }
      notes: {
        Row: {
          body_md: string
          contact_id: string | null
          created_at: string
          id: string
          interaction_id: string | null
          transcript: string | null
          user_id: string
          voice_url: string | null
        }
        Insert: {
          body_md?: string
          contact_id?: string | null
          created_at?: string
          id?: string
          interaction_id?: string | null
          transcript?: string | null
          user_id: string
          voice_url?: string | null
        }
        Update: {
          body_md?: string
          contact_id?: string | null
          created_at?: string
          id?: string
          interaction_id?: string | null
          transcript?: string | null
          user_id?: string
          voice_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notes_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notes_interaction_id_fkey"
            columns: ["interaction_id"]
            isOneToOne: false
            referencedRelation: "interactions"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          audio_retention_days: number
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          audio_retention_days?: number
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          audio_retention_days?: number
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      recordings: {
        Row: {
          consent_disclosed: boolean
          created_at: string
          duration_seconds: number | null
          id: string
          interaction_id: string | null
          storage_path: string
          transcript_status: Database["public"]["Enums"]["transcript_status"]
          transcript_text: string | null
          user_id: string
        }
        Insert: {
          consent_disclosed?: boolean
          created_at?: string
          duration_seconds?: number | null
          id?: string
          interaction_id?: string | null
          storage_path: string
          transcript_status?: Database["public"]["Enums"]["transcript_status"]
          transcript_text?: string | null
          user_id: string
        }
        Update: {
          consent_disclosed?: boolean
          created_at?: string
          duration_seconds?: number | null
          id?: string
          interaction_id?: string | null
          storage_path?: string
          transcript_status?: Database["public"]["Enums"]["transcript_status"]
          transcript_text?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recordings_interaction_id_fkey"
            columns: ["interaction_id"]
            isOneToOne: false
            referencedRelation: "interactions"
            referencedColumns: ["id"]
          },
        ]
      }
      tags: {
        Row: {
          color: string
          created_at: string
          id: string
          name: string
          user_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          name: string
          user_id: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          name?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      cadence_type: "close" | "monthly" | "quarterly" | "annual" | "none"
      contact_source: "card_scan" | "calendar" | "email" | "manual"
      interaction_type:
        | "in_person"
        | "call"
        | "video"
        | "email"
        | "conference"
        | "other"
      scan_status: "pending" | "parsed" | "confirmed" | "discarded"
      transcript_status: "pending" | "processing" | "done" | "failed"
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
      cadence_type: ["close", "monthly", "quarterly", "annual", "none"],
      contact_source: ["card_scan", "calendar", "email", "manual"],
      interaction_type: [
        "in_person",
        "call",
        "video",
        "email",
        "conference",
        "other",
      ],
      scan_status: ["pending", "parsed", "confirmed", "discarded"],
      transcript_status: ["pending", "processing", "done", "failed"],
    },
  },
} as const
